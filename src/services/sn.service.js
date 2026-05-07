function createSnService(options) {
  const { pool, fs, dataDir, SN_SUMMARY_FILE: summaryPath } = options;
  const SN_SUMMARY_FILE = summaryPath || (dataDir ? require('path').join(dataDir, 'sn_summary.json') : null);

  async function dbGetSnCompanies() {
    const result = await pool.query(
      'SELECT id, cnpj, razao_social FROM sn_companies ORDER BY razao_social'
    );
    return result.rows.map((r) => ({
      id: r.id,
      cnpj: r.cnpj,
      razaoSocial: r.razao_social,
    }));
  }

  async function dbCreateSnCompany(cnpj, razaoSocial) {
    const result = await pool.query(
      'INSERT INTO sn_companies (cnpj, razao_social) VALUES ($1, $2) RETURNING id, cnpj, razao_social',
      [cnpj, razaoSocial]
    );
    const r = result.rows[0];
    return {
      id: r.id,
      cnpj: r.cnpj,
      razaoSocial: r.razao_social,
    };
  }

  async function dbDeleteSnCompany(id) {
    const result = await pool.query(
      `
        DELETE FROM sn_companies
        WHERE id = $1
        RETURNING id, cnpj, razao_social
      `,
      [id]
    );

    const r = result.rows[0];
    if (!r) return null;

    return {
      id: r.id,
      cnpj: r.cnpj,
      razaoSocial: r.razao_social,
    };
  }

  async function dbGetReceiptByCompanyAndPa(companyId, pa) {
    const result = await pool.query(
      'SELECT id FROM sn_receipts WHERE company_id = $1 AND pa = $2',
      [companyId, pa]
    );
    return result.rows[0] || null;
  }

  async function dbSaveReceipt(companyId, pa, pdfBuffer) {
    const result = await pool.query(
      'INSERT INTO sn_receipts (company_id, pa, pdf) VALUES ($1, $2, $3) RETURNING id',
      [companyId, pa, pdfBuffer]
    );
    return result.rows[0];
  }

  async function dbGetReceiptById(id) {
    const result = await pool.query(
      'SELECT pdf FROM sn_receipts WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async function dbGetReceiptsByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.company_id,
          r.pa,
          r.pdf,
          c.cnpj,
          c.razao_social
        FROM sn_receipts r
        JOIN sn_companies c ON c.id = r.company_id
        WHERE r.id = ANY($1::int[])
      `,
      [ids]
    );
    return result.rows;
  }

  async function dbGetReceiptsHistory(days = 90) {
    const safeDays = Number.isFinite(Number(days)) ? Math.max(1, Math.min(365, Number(days))) : 90;
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.company_id,
          r.pa,
          r.created_at,
          c.cnpj,
          c.razao_social
        FROM sn_receipts r
        JOIN sn_companies c ON c.id = r.company_id
        WHERE r.created_at >= (NOW() - ($1::int * INTERVAL '1 day'))
        ORDER BY r.created_at DESC, r.id DESC
      `,
      [safeDays]
    );
    return {
      days: safeDays,
      items: result.rows.map((r) => ({
        id: r.id,
        companyId: r.company_id,
        cnpj: r.cnpj,
        razaoSocial: r.razao_social,
        pa: r.pa,
        createdAt: r.created_at,
      })),
    };
  }

  function loadSnSummary() {
    if (!fs.existsSync(SN_SUMMARY_FILE)) {
      return {
        totalOperacoes: 0,
        totalDeclaracoes: 0,
        totalConsultas: 0,
        totalSucesso: 0,
        totalErro: 0,
        valorTotal: 0,
        ultimaAtualizacao: null,
      };
    }
    try {
      return JSON.parse(fs.readFileSync(SN_SUMMARY_FILE, 'utf-8'));
    } catch (e) {
      console.error('Erro ao ler sn_summary.json:', e);
      return {
        totalOperacoes: 0,
        totalDeclaracoes: 0,
        totalConsultas: 0,
        totalSucesso: 0,
        totalErro: 0,
        valorTotal: 0,
        ultimaAtualizacao: null,
      };
    }
  }

  function saveSnSummary(summary) {
    summary.ultimaAtualizacao = new Date().toISOString();
    fs.writeFileSync(SN_SUMMARY_FILE, JSON.stringify(summary, null, 2));
  }

  function calculateDeclarationCost(consumption) {
    if (consumption <= 100) return 0.40;
    if (consumption <= 500) return 0.36;
    if (consumption <= 1_000) return 0.32;
    if (consumption <= 3_000) return 0.28;
    if (consumption <= 5_000) return 0.24;
    if (consumption <= 8_000) return 0.20;
    if (consumption <= 10_000) return 0.16;
    return 0.12;
  }

  function registrarSnResultado(sucesso, tipoOperacao) {
    const summary = loadSnSummary();
    summary.totalOperacoes += 1;
    if (tipoOperacao === 'declaracao') summary.totalDeclaracoes += 1;
    if (tipoOperacao === 'consulta') summary.totalConsultas += 1;
    if (sucesso) summary.totalSucesso += 1;
    else summary.totalErro += 1;

    const unitPrice = calculateDeclarationCost(summary.totalOperacoes);
    summary.valorTotal += unitPrice;
    saveSnSummary(summary);
    return summary;
  }

  function buildResumoResponse() {
    const summary = loadSnSummary();
    const consumoAtual = summary.totalOperacoes;
    const precoUnitario = calculateDeclarationCost(consumoAtual);
    return {
      consumoAtual,
      totalDeclaracoes: summary.totalDeclaracoes,
      totalConsultas: summary.totalConsultas,
      totalSucesso: summary.totalSucesso,
      totalErro: summary.totalErro,
      precoUnitario,
      valorTotal: summary.valorTotal,
      ultimaAtualizacao: summary.ultimaAtualizacao,
    };
  }

  return {
    dbGetSnCompanies,
    dbCreateSnCompany,
    dbDeleteSnCompany,
    dbGetReceiptByCompanyAndPa,
    dbSaveReceipt,
    dbGetReceiptById,
    dbGetReceiptsByIds,
    dbGetReceiptsHistory,
    buildResumoResponse,
    registrarSnResultado,
  };
}

module.exports = { createSnService };
