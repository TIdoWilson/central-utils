const importer = require('./parcelamentos.importer');

const CNPJ_LENGTH = importer.CNPJ_LENGTH;

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatCnpj(value) {
  const digits = importer.normalizeDigits(value);
  if (digits.length !== CNPJ_LENGTH) return String(value || '').trim();
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function cleanObservations(value) {
  return String(value || '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part)
    .filter((part) => !/^parcelamento original:/i.test(part))
    .filter((part) => !/^fonte planilha:/i.test(part))
    .join(' | ');
}

function mapParcelamentoRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companyName: String(row.company_name || '').trim(),
    cnpj: importer.normalizeDigits(row.cnpj),
    cnpjFormatted: formatCnpj(row.cnpj),
    parcelamentoType: String(row.parcelamento_type || '').trim(),
    parcelamentoNumber: String(row.parcelamento_number || '').trim(),
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : '',
    debitAccount: !!row.debit_account,
    observations: cleanObservations(row.observations),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeEditableInput(input = {}) {
  return {
    companyName: String(input.companyName || input.company_name || '').trim(),
    cnpj: importer.normalizeDigits(input.cnpj || input.cnpjFormatted || ''),
    parcelamentoType: String(input.parcelamentoType || input.parcelamento_type || '').trim(),
    parcelamentoNumber: String(input.parcelamentoNumber || input.parcelamento_number || '').trim(),
    startDate: String(input.startDate || input.start_date || '').trim(),
    observations: cleanObservations(input.observations || ''),
  };
}

function buildSearchWhere(search, params) {
  const q = String(search || '').trim();
  if (!q) return '';

  const pieces = [];
  const text = importer.normalizeText(q);
  const digits = importer.normalizeDigits(q);

  if (text) {
    params.push(text);
    const p = `$${params.length}`;
    pieces.push(`LOWER(company_name) LIKE '%' || ${p} || '%'`);
    pieces.push(`LOWER(parcelamento_type) LIKE '%' || ${p} || '%'`);
    pieces.push(`LOWER(parcelamento_number) LIKE '%' || ${p} || '%'`);
    pieces.push(`LOWER(COALESCE(observations, '')) LIKE '%' || ${p} || '%'`);
  }

  if (digits) {
    params.push(digits);
    const p = `$${params.length}`;
    pieces.push(`replace(replace(replace(cnpj, '.', ''), '/', ''), '-', '') LIKE '%' || ${p} || '%'`);
  }

  if (!pieces.length) return '';
  return `(${pieces.join(' OR ')})`;
}

function createParcelamentosService(deps = {}) {
  const pool = deps.pool;

  if (!pool || typeof pool.query !== 'function') {
    throw new Error('Parcelamentos service requer um pool de Postgres valido.');
  }

  async function listParcelamentos(filters = {}) {
    const limit = Math.min(500, Math.max(1, Number(filters.limit || 500) || 500));
    const params = [];
    const where = buildSearchWhere(filters.q || filters.search || '', params);

    const whereSql = where ? `WHERE ${where}` : '';
    const countSql = `SELECT COUNT(*)::int AS count FROM parcelamentos_impostos ${whereSql}`;
    const listSql = `
      SELECT
        id,
        company_name,
        cnpj,
        parcelamento_type,
        parcelamento_number,
        start_date,
        debit_account,
        observations,
        created_at,
        updated_at
      FROM parcelamentos_impostos
      ${whereSql}
      ORDER BY start_date DESC, created_at DESC, id DESC
      LIMIT $${params.length + 1}
    `;

    const countResult = await pool.query(countSql, params);
    const listResult = await pool.query(listSql, [...params, limit]);
    const total = Number(countResult.rows?.[0]?.count || 0);

    return {
      items: (listResult.rows || []).map(mapParcelamentoRow).filter(Boolean),
      meta: {
        total,
        totalFiltered: total,
        limit,
        q: String(filters.q || filters.search || '').trim(),
      },
    };
  }

  async function createParcelamento(input = {}) {
    const payload = normalizeEditableInput(input);
    const debitAccount = !!input.debitAccount;
    const clean = payload.observations;
    const { companyName, cnpj, parcelamentoType, parcelamentoNumber, startDate } = payload;

    if (!companyName || !cnpj || !parcelamentoType || !parcelamentoNumber || !startDate) {
      const error = new Error('Preencha nome da empresa, CNPJ, tipo, numero e data de inicio.');
      error.statusCode = 400;
      throw error;
    }

    if (cnpj.length !== CNPJ_LENGTH) {
      const error = new Error('CNPJ deve ter 14 digitos.');
      error.statusCode = 400;
      throw error;
    }

    if (!isValidIsoDate(startDate)) {
      const error = new Error('Data de inicio invalida.');
      error.statusCode = 400;
      throw error;
    }

    if (companyName.length > 180 || parcelamentoType.length > 180 || parcelamentoNumber.length > 120 || clean.length > 4000) {
      const error = new Error('Campos excedem o limite permitido.');
      error.statusCode = 400;
      throw error;
    }

    const { rows } = await pool.query(
      `
        INSERT INTO parcelamentos_impostos (
          company_name,
          cnpj,
          parcelamento_type,
          parcelamento_number,
          start_date,
          debit_account,
          observations
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING
          id,
          company_name,
          cnpj,
          parcelamento_type,
          parcelamento_number,
          start_date,
          debit_account,
          observations,
          created_at,
          updated_at
      `,
        [
        companyName,
        cnpj,
        parcelamentoType,
        parcelamentoNumber,
        startDate,
        debitAccount,
        clean || null,
      ]
    );

    return mapParcelamentoRow(rows[0]);
  }

  async function updateParcelamento(id, input = {}) {
    const parcelamentoId = Number(id);
    if (!Number.isFinite(parcelamentoId) || parcelamentoId <= 0) {
      const error = new Error('ID invalido.');
      error.statusCode = 400;
      throw error;
    }

    const payload = normalizeEditableInput(input);
    const { companyName, cnpj, parcelamentoType, parcelamentoNumber, startDate, observations } = payload;

    if (!companyName || !cnpj || !parcelamentoType || !parcelamentoNumber || !startDate) {
      const error = new Error('Preencha nome da empresa, CNPJ, tipo, numero e data de inicio.');
      error.statusCode = 400;
      throw error;
    }

    if (cnpj.length !== CNPJ_LENGTH) {
      const error = new Error('CNPJ deve ter 14 digitos.');
      error.statusCode = 400;
      throw error;
    }

    if (!isValidIsoDate(startDate)) {
      const error = new Error('Data de inicio invalida.');
      error.statusCode = 400;
      throw error;
    }

    if (companyName.length > 180 || parcelamentoType.length > 180 || parcelamentoNumber.length > 120 || observations.length > 4000) {
      const error = new Error('Campos excedem o limite permitido.');
      error.statusCode = 400;
      throw error;
    }

    const { rows } = await pool.query(
      `
        UPDATE parcelamentos_impostos
        SET
          company_name = $1,
          cnpj = $2,
          parcelamento_type = $3,
          parcelamento_number = $4,
          start_date = $5,
          observations = $6,
          updated_at = NOW()
        WHERE id = $7
        RETURNING
          id,
          company_name,
          cnpj,
          parcelamento_type,
          parcelamento_number,
          start_date,
          debit_account,
          observations,
          created_at,
          updated_at
      `,
      [
        companyName,
        cnpj,
        parcelamentoType,
        parcelamentoNumber,
        startDate,
        observations || null,
        parcelamentoId,
      ]
    );

    if (!rows.length) {
      const error = new Error('Parcelamento nao encontrado.');
      error.statusCode = 404;
      throw error;
    }

    return mapParcelamentoRow(rows[0]);
  }

  async function clearParcelamentos() {
    const client = await pool.connect();
    try {
      const beforeResult = await client.query('SELECT COUNT(*)::int AS count FROM parcelamentos_impostos');
      const cleared = Number(beforeResult.rows?.[0]?.count || 0);

      await client.query('BEGIN');
      await client.query('TRUNCATE TABLE parcelamentos_impostos RESTART IDENTITY');
      await client.query('COMMIT');

      return { cleared };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
  }

  async function replaceFromWorkbookBuffer(buffer) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      const error = new Error('Arquivo Excel invalido.');
      error.statusCode = 400;
      throw error;
    }

    const plan = importer.buildImportPlanFromBuffer(buffer);
    const items = Array.isArray(plan.items) ? plan.items : [];

    const client = await pool.connect();
    try {
      const beforeResult = await client.query('SELECT COUNT(*)::int AS count FROM parcelamentos_impostos');
      const beforeCount = Number(beforeResult.rows?.[0]?.count || 0);

      await client.query('BEGIN');
      await client.query('TRUNCATE TABLE parcelamentos_impostos RESTART IDENTITY');

      for (const item of items) {
        await client.query(
          `
            INSERT INTO parcelamentos_impostos (
              company_name,
              cnpj,
              parcelamento_type,
              parcelamento_number,
              start_date,
              debit_account,
              observations
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7)
          `,
          [
            String(item.companyName || '').trim(),
            importer.normalizeDigits(item.cnpj || ''),
            String(item.parcelamentoType || '').trim(),
            String(item.parcelamentoNumber || '').trim(),
            String(item.startDate || '').trim(),
            !!item.debitAccount,
            cleanObservations(item.observations || ''),
          ]
        );
      }

      await client.query('COMMIT');

      return {
        replacedExisting: beforeCount,
        imported: items.length,
        summary: plan.summary,
        items: items.map((item) => ({
          companyName: item.companyName,
          cnpj: item.cnpj,
          parcelamentoType: item.parcelamentoType,
          parcelamentoNumber: item.parcelamentoNumber,
          startDate: item.startDate,
          debitAccount: !!item.debitAccount,
          observations: item.observations || '',
        })),
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    listParcelamentos,
    createParcelamento,
    updateParcelamento,
    clearParcelamentos,
    replaceFromWorkbookBuffer,
  };
}

module.exports = {
  createParcelamentosService,
  __private: {
    normalizeText: importer.normalizeText,
    normalizeDigits: importer.normalizeDigits,
    isValidIsoDate,
    formatCnpj,
    mapParcelamentoRow,
    buildImportPlanFromBuffer: importer.buildImportPlanFromBuffer,
  },
};
