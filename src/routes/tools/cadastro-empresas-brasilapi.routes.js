const express = require('express');
const path = require('path');
const XLSX = require('xlsx');

const BRASILAPI_BASE_URL = 'https://brasilapi.com.br/api/cnpj/v1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCnpj(value) {
  const digits = onlyDigits(value);
  return digits.length === 14 ? digits : null;
}

function formatCnpj(value) {
  const digits = normalizeCnpj(value);
  if (!digits) return String(value || '');
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function parseCapitalSocial(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value, maxLength = 2500) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeRegimeLabel(value) {
  const text = cleanText(value, 160);
  if (!text) return null;
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function normalizeBool(value) {
  if (value === true || value === false) return value;
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (['true', '1', 'sim', 's', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'nao', 'não', 'n', 'no'].includes(s)) return false;
  return null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  const text = String(value).trim();
  if (!/^-?\d+$/.test(text)) return null;
  return Number.parseInt(text, 10);
}

function parseRetryAfterMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Math.max(0, Number(raw) * 1000);
  const dateMs = Date.parse(raw);
  if (!Number.isFinite(dateMs)) return 0;
  return Math.max(0, dateMs - Date.now());
}

function extractCnpjsFromText(text) {
  const rawText = String(text || '');
  const matches = rawText.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
  const set = new Set();
  for (const match of matches) {
    const cnpj = normalizeCnpj(match);
    if (cnpj) set.add(cnpj);
  }

  // Fallback para CSVs com CNPJ sem máscara, com decimais, ou em notação científica.
  const tokenMatches = rawText.match(/[0-9eE.,+\-/'"]+/g) || [];
  for (const token of tokenMatches) {
    const cnpj = normalizeCnpjToken(token);
    if (cnpj) set.add(cnpj);
  }

  return Array.from(set);
}

function normalizeCnpjToken(token) {
  const raw = String(token || '').trim().replace(/^['"]+|['"]+$/g, '');
  if (!raw) return null;

  const direct = normalizeCnpj(raw);
  if (direct) return direct;

  // Ex.: 34690183000109,00
  const decimalStyle = raw.replace(/\s+/g, '').replace(/,/g, '.');
  if (/^\d{14}\.\d+$/.test(decimalStyle)) {
    return normalizeCnpj(decimalStyle.slice(0, 14));
  }

  const sci = scientificToIntegerString(raw);
  if (sci) return normalizeCnpj(sci);
  return null;
}

function scientificToIntegerString(value) {
  const normalized = String(value || '').trim().replace(',', '.').toLowerCase();
  const m = normalized.match(/^([+-]?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/);
  if (!m) return null;
  if (m[1] === '-') return null;

  const intPart = m[2] || '';
  const fracPart = m[3] || '';
  const exp = Number(m[4]);
  if (!Number.isInteger(exp)) return null;

  const digits = `${intPart}${fracPart}`;
  const scale = fracPart.length - exp;

  if (scale <= 0) {
    return digits + '0'.repeat(Math.abs(scale));
  }

  const cut = digits.length - scale;
  if (cut <= 0) return null;

  const integerPart = digits.slice(0, cut);
  const fractionalPart = digits.slice(cut);
  if (!/^[0]*$/.test(fractionalPart)) return null;
  return integerPart;
}

function detectTextEncoding(buffer) {
  if (!Buffer.isBuffer(buffer)) return '';
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.slice(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let i = 2; i < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString('utf16le');
  }
  return buffer.toString('utf8');
}

function extractCnpjsFromBuffer(fileName, buffer) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  const cnpjs = new Set();

  if (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    for (const sheetName of workbook.SheetNames || []) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        blankrows: false,
        raw: false,
      });
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          const list = extractCnpjsFromText(String(cell || ''));
          for (const cnpj of list) cnpjs.add(cnpj);
        }
      }
    }
  } else {
    const text = detectTextEncoding(buffer);
    for (const cnpj of extractCnpjsFromText(text)) cnpjs.add(cnpj);
  }

  return Array.from(cnpjs);
}

function normalizePartner(row) {
  const partnerName = cleanText(row?.nome_socio || row?.nome || row?.razao_social, 350);
  if (!partnerName) return null;
  return {
    partnerName,
    qualification: cleanText(row?.qual || row?.qualificacao_socio || row?.descricao_qualificacao_socio, 250),
    country: cleanText(row?.pais || row?.nome_pais, 150),
    legalRepresentative: cleanText(row?.nome_representante || row?.representante_legal, 350),
    ageRange: cleanText(row?.faixa_etaria, 80),
    updateDate: normalizeDate(row?.data_entrada_sociedade),
  };
}

function normalizeCnaeRow(codeValue, descriptionValue, isPrimary) {
  const codeDigits = onlyDigits(codeValue).slice(0, 7);
  if (!codeDigits) return null;
  return {
    code: codeDigits,
    description: cleanText(descriptionValue, 500),
    isPrimary: !!isPrimary,
  };
}

function normalizeBrasilApiData(cnpj, data) {
  const parceiros = Array.isArray(data?.qsa)
    ? data.qsa.map(normalizePartner).filter(Boolean)
    : [];

  const cnaes = [];
  const primary = normalizeCnaeRow(data?.cnae_fiscal, data?.cnae_fiscal_descricao, true);
  if (primary) cnaes.push(primary);

  const secondaryRows = Array.isArray(data?.cnaes_secundarios) ? data.cnaes_secundarios : [];
  for (const item of secondaryRows) {
    const cnae = normalizeCnaeRow(item?.codigo || item?.code, item?.descricao || item?.description, false);
    if (cnae) cnaes.push(cnae);
  }

  const uniqueCnaes = [];
  const seenCnae = new Set();
  for (const cnae of cnaes) {
    if (seenCnae.has(cnae.code)) continue;
    seenCnae.add(cnae.code);
    uniqueCnaes.push(cnae);
  }

  const regimeTributario = extractRegimeTributario(data);
  const regimeTributarioHistorico = normalizeRegimeTributarioHistorico(data);
  const regimeTributarioAtual = inferRegimeTributarioAtual(regimeTributarioHistorico, regimeTributario, data);

  return {
    cnpj,
    razaoSocial: cleanText(data?.razao_social, 400),
    nomeFantasia: cleanText(data?.nome_fantasia, 300),
    situacaoCadastral: cleanText(data?.descricao_situacao_cadastral || data?.situacao_cadastral, 120),
    dataInicioAtividade: normalizeDate(data?.data_inicio_atividade),
    naturezaJuridica: cleanText(data?.natureza_juridica, 180),
    porte: cleanText(data?.porte, 100),
    capitalSocial: parseCapitalSocial(data?.capital_social),
    email: cleanText(data?.email, 220),
    dddTelefone1: cleanText(data?.ddd_telefone_1, 40),
    dddTelefone2: cleanText(data?.ddd_telefone_2, 40),
    logradouro: cleanText(data?.logradouro, 220),
    numero: cleanText(data?.numero, 60),
    complemento: cleanText(data?.complemento, 220),
    bairro: cleanText(data?.bairro, 180),
    municipio: cleanText(data?.municipio, 180),
    uf: cleanText(data?.uf, 4),
    cep: cleanText(data?.cep, 20),
    atividadePrincipalCodigo: primary?.code || null,
    atividadePrincipalDescricao: primary?.description || null,
    regimeTributario,
    regimeTributarioHistorico,
    regimeTributarioAtual,
    partners: parceiros,
    cnaes: uniqueCnaes,
    rawResponse: data || {},
  };
}

function normalizeRegimeTributarioHistorico(data) {
  const rows = Array.isArray(data?.regime_tributario) ? data.regime_tributario : [];
  const normalized = [];

  for (const row of rows) {
    const ano = normalizeInteger(row?.ano);
    const formaDeTributacao = cleanText(row?.forma_de_tributacao, 160);
    const cnpjDaScp = cleanText(row?.cnpj_da_scp, 20);
    const quantidadeDeEscrituracoes = normalizeInteger(row?.quantidade_de_escrituracoes);
    if (
      ano === null
      && !formaDeTributacao
      && !cnpjDaScp
      && quantidadeDeEscrituracoes === null
    ) {
      continue;
    }
    normalized.push({
      ano,
      forma_de_tributacao: formaDeTributacao,
      cnpj_da_scp: cnpjDaScp,
      quantidade_de_escrituracoes: quantidadeDeEscrituracoes,
    });
  }

  normalized.sort((a, b) => {
    const anoA = Number.isFinite(a.ano) ? a.ano : 0;
    const anoB = Number.isFinite(b.ano) ? b.ano : 0;
    if (anoA !== anoB) return anoB - anoA;
    const qtdA = Number.isFinite(a.quantidade_de_escrituracoes) ? a.quantidade_de_escrituracoes : 0;
    const qtdB = Number.isFinite(b.quantidade_de_escrituracoes) ? b.quantidade_de_escrituracoes : 0;
    return qtdB - qtdA;
  });

  return normalized;
}

function extractRegimeTributarioAtual(historico) {
  if (!Array.isArray(historico) || !historico.length) return null;
  for (const item of historico) {
    const forma = normalizeRegimeLabel(item?.forma_de_tributacao);
    if (forma) return forma;
  }
  return null;
}

function inferRegimeTributarioAtual(historico, regimeTributario, rawData) {
  const situacao = String(rawData?.descricao_situacao_cadastral || rawData?.situacao_cadastral || '').trim().toUpperCase();
  const isBaixada = situacao === 'BAIXADA' || situacao === '8';

  if (regimeTributario?.opcaoMei === true) return 'SIMEI';
  if (regimeTributario?.opcaoSimples === true) return 'SIMPLES NACIONAL';

  const fromHistory = extractRegimeTributarioAtual(historico);
  if (fromHistory) return fromHistory;

  if (isBaixada && regimeTributario?.dataExclusaoMei) return 'EXCLUIDA DO SIMEI';
  if (isBaixada && regimeTributario?.dataExclusaoSimples) return 'EXCLUIDA DO SIMPLES NACIONAL';

  const fromField = normalizeRegimeLabel(rawData?.forma_de_tributacao || rawData?.regime_tributario_atual);
  if (fromField) return fromField;

  return null;
}

function extractRegimeTributario(data) {
  const simplesRoot = data?.simples || data?.simples_nacional || null;
  const meiRoot = data?.simei || data?.mei || null;

  const opcaoSimples = normalizeBool(
    data?.opcao_pelo_simples ??
    simplesRoot?.opcao_pelo_simples ??
    simplesRoot?.optante ??
    simplesRoot?.opcao ??
    simplesRoot?.simples
  );
  const dataOpcaoSimples =
    normalizeDate(
      data?.data_opcao_pelo_simples ??
      simplesRoot?.data_opcao_pelo_simples ??
      simplesRoot?.data_opcao ??
      simplesRoot?.data_inicio
    );
  const dataExclusaoSimples =
    normalizeDate(
      data?.data_exclusao_do_simples ??
      simplesRoot?.data_exclusao_do_simples ??
      simplesRoot?.data_exclusao ??
      simplesRoot?.data_fim
    );

  const opcaoMei = normalizeBool(
    data?.opcao_pelo_mei ??
    meiRoot?.opcao_pelo_mei ??
    meiRoot?.optante ??
    meiRoot?.opcao ??
    meiRoot?.mei
  );
  const dataOpcaoMei =
    normalizeDate(
      data?.data_opcao_pelo_mei ??
      meiRoot?.data_opcao_pelo_mei ??
      meiRoot?.data_opcao ??
      meiRoot?.data_inicio
    );
  const dataExclusaoMei =
    normalizeDate(
      data?.data_exclusao_do_mei ??
      meiRoot?.data_exclusao_do_mei ??
      meiRoot?.data_exclusao ??
      meiRoot?.data_fim
    );

  return sanitizeRegimeTributario({
    opcaoSimples,
    dataOpcaoSimples,
    dataExclusaoSimples,
    opcaoMei,
    dataOpcaoMei,
    dataExclusaoMei,
  }, data);
}

function sanitizeRegimeTributario(regime, rawData) {
  return { ...regime };
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  const queue = items.slice();

  async function consume() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      const result = await worker(item);
      results.push(result);
    }
  }

  const workers = [];
  const count = Math.max(1, Math.min(limit, items.length || 1));
  for (let i = 0; i < count; i += 1) workers.push(consume());
  await Promise.all(workers);
  return results;
}

function mapCompanyRow(row) {
  return {
    id: row.id,
    cnpj: row.cnpj,
    cnpjFormatted: formatCnpj(row.cnpj),
    razaoSocial: row.razao_social,
    nomeFantasia: row.nome_fantasia,
    situacaoCadastral: row.situacao_cadastral,
    dataInicioAtividade: row.data_inicio_atividade,
    naturezaJuridica: row.natureza_juridica,
    porte: row.porte,
    capitalSocial: row.capital_social,
    email: row.email,
    dddTelefone1: row.ddd_telefone_1,
    dddTelefone2: row.ddd_telefone_2,
    logradouro: row.logradouro,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    municipio: row.municipio,
    uf: row.uf,
    cep: row.cep,
    atividadePrincipalCodigo: row.atividade_principal_codigo,
    atividadePrincipalDescricao: row.atividade_principal_descricao,
    regimeTributarioManual: row.regime_tributario_manual || null,
    regimeTributarioAtual: row.regime_tributario_atual || null,
    opcaoSimples: row.opcao_simples,
    dataOpcaoSimples: row.data_opcao_simples,
    dataExclusaoSimples: row.data_exclusao_simples,
    opcaoMei: row.opcao_mei,
    dataOpcaoMei: row.data_opcao_mei,
    dataExclusaoMei: row.data_exclusao_mei,
    atualizadoEm: row.updated_at,
    partners: Array.isArray(row.partners) ? row.partners : [],
    cnaes: Array.isArray(row.cnaes) ? row.cnaes : [],
    rawResponse: row.raw_response || null,
  };
}

function buildRegimeTributarioAtualSql(alias = 'c') {
  return `COALESCE(
    NULLIF(${alias}.regime_tributario_manual, ''),
    CASE
      WHEN ${alias}.opcao_mei IS TRUE THEN 'SIMEI'
      WHEN ${alias}.opcao_simples IS TRUE THEN 'SIMPLES NACIONAL'
      ELSE NULL
    END,
    CASE
      WHEN COALESCE(UPPER(${alias}.situacao_cadastral), '') = 'BAIXADA' AND ${alias}.data_exclusao_mei IS NOT NULL THEN 'EXCLUIDA DO SIMEI'
      WHEN COALESCE(UPPER(${alias}.situacao_cadastral), '') = 'BAIXADA' AND ${alias}.data_exclusao_simples IS NOT NULL THEN 'EXCLUIDA DO SIMPLES NACIONAL'
      ELSE NULL
    END,
    NULLIF(${alias}.regime_tributario_atual, '')
  )`;
}

module.exports = function createCadastroEmpresasBrasilApiRoutes(deps) {
  const {
    pool,
    axios,
    upload,
    requireCsrf,
    auditLog,
  } = deps;

  const router = express.Router();
  let schemaPromise = null;
  let throttleCursor = Promise.resolve();
  let nextAllowedRequestAt = 0;

  function getMinIntervalMs() {
    const defaultMs = 1400;
    const configured = Number(process.env.CADASTRO_EMPRESAS_BRASILAPI_MIN_INTERVAL_MS || defaultMs);
    if (!Number.isFinite(configured)) return defaultMs;
    return Math.max(250, configured);
  }

  function scheduleBrasilApiRequestSlot() {
    const task = throttleCursor.then(async () => {
      const waitMs = Math.max(0, nextAllowedRequestAt - Date.now());
      if (waitMs > 0) await sleep(waitMs);
      nextAllowedRequestAt = Date.now() + getMinIntervalMs();
    });
    throttleCursor = task.catch(() => {});
    return task;
  }

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS office_companies (
            id BIGSERIAL PRIMARY KEY,
            cnpj CHAR(14) NOT NULL UNIQUE,
            razao_social TEXT NULL,
            nome_fantasia TEXT NULL,
            situacao_cadastral TEXT NULL,
            data_inicio_atividade DATE NULL,
            natureza_juridica TEXT NULL,
            porte TEXT NULL,
            capital_social NUMERIC(18,2) NULL,
            email TEXT NULL,
            ddd_telefone_1 TEXT NULL,
            ddd_telefone_2 TEXT NULL,
            logradouro TEXT NULL,
            numero TEXT NULL,
            complemento TEXT NULL,
            bairro TEXT NULL,
            municipio TEXT NULL,
            uf VARCHAR(4) NULL,
            cep TEXT NULL,
            atividade_principal_codigo VARCHAR(10) NULL,
            atividade_principal_descricao TEXT NULL,
            regime_tributario_manual TEXT NULL,
            regime_tributario_atual TEXT NULL,
            opcao_simples BOOLEAN NULL,
            data_opcao_simples DATE NULL,
            data_exclusao_simples DATE NULL,
            opcao_mei BOOLEAN NULL,
            data_opcao_mei DATE NULL,
            data_exclusao_mei DATE NULL,
            raw_response JSONB NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS office_company_partners (
            id BIGSERIAL PRIMARY KEY,
            company_id BIGINT NOT NULL REFERENCES office_companies(id) ON DELETE CASCADE,
            partner_name TEXT NOT NULL,
            qualification TEXT NULL,
            country TEXT NULL,
            legal_representative TEXT NULL,
            age_range TEXT NULL,
            update_date DATE NULL
          );
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS office_company_cnaes (
            id BIGSERIAL PRIMARY KEY,
            company_id BIGINT NOT NULL REFERENCES office_companies(id) ON DELETE CASCADE,
            code VARCHAR(10) NOT NULL,
            description TEXT NULL,
            is_primary BOOLEAN NOT NULL DEFAULT FALSE,
            UNIQUE (company_id, code)
          );
        `);

        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_companies_razao_social ON office_companies (LOWER(razao_social));');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_companies_nome_fantasia ON office_companies (LOWER(nome_fantasia));');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_companies_situacao ON office_companies (situacao_cadastral);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_companies_uf ON office_companies (uf);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_companies_updated_at ON office_companies (updated_at DESC);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_company_partners_company_id ON office_company_partners (company_id);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_company_partners_partner_name ON office_company_partners (LOWER(partner_name));');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_company_cnaes_company_id ON office_company_cnaes (company_id);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_company_cnaes_code ON office_company_cnaes (code);');
        await pool.query('ALTER TABLE office_companies ADD COLUMN IF NOT EXISTS opcao_simples BOOLEAN NULL;');
        await pool.query('ALTER TABLE office_companies ADD COLUMN IF NOT EXISTS regime_tributario_manual TEXT NULL;');
        await pool.query('ALTER TABLE office_companies ADD COLUMN IF NOT EXISTS regime_tributario_atual TEXT NULL;');
        await pool.query('ALTER TABLE office_companies ADD COLUMN IF NOT EXISTS data_opcao_simples DATE NULL;');
        await pool.query('ALTER TABLE office_companies ADD COLUMN IF NOT EXISTS data_exclusao_simples DATE NULL;');
        await pool.query('ALTER TABLE office_companies ADD COLUMN IF NOT EXISTS opcao_mei BOOLEAN NULL;');
        await pool.query('ALTER TABLE office_companies ADD COLUMN IF NOT EXISTS data_opcao_mei DATE NULL;');
        await pool.query('ALTER TABLE office_companies ADD COLUMN IF NOT EXISTS data_exclusao_mei DATE NULL;');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_companies_regime_tributario_atual ON office_companies (regime_tributario_atual);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_office_companies_regime_tributario_manual ON office_companies (regime_tributario_manual);');
        await pool.query(`
          UPDATE office_companies
             SET regime_tributario_atual = CASE
               WHEN opcao_mei IS TRUE THEN 'SIMEI'
               WHEN opcao_simples IS TRUE THEN 'SIMPLES NACIONAL'
               WHEN COALESCE(UPPER(situacao_cadastral), '') = 'BAIXADA' AND data_exclusao_mei IS NOT NULL THEN 'EXCLUIDA DO SIMEI'
               WHEN COALESCE(UPPER(situacao_cadastral), '') = 'BAIXADA' AND data_exclusao_simples IS NOT NULL THEN 'EXCLUIDA DO SIMPLES NACIONAL'
               ELSE regime_tributario_atual
             END
           WHERE opcao_mei IS TRUE
              OR opcao_simples IS TRUE
              OR data_exclusao_mei IS NOT NULL
              OR data_exclusao_simples IS NOT NULL;
        `);
        await pool.query(`
          UPDATE office_companies
             SET opcao_simples = CASE
                   WHEN raw_response ? 'opcao_pelo_simples' THEN
                     CASE
                       WHEN LOWER(COALESCE(raw_response->>'opcao_pelo_simples', '')) IN ('true', '1', 'sim', 's', 'yes', 'y') THEN TRUE
                       WHEN LOWER(COALESCE(raw_response->>'opcao_pelo_simples', '')) IN ('false', '0', 'nao', 'não', 'n', 'no') THEN FALSE
                       ELSE opcao_simples
                     END
                   ELSE opcao_simples
                 END,
                 data_opcao_simples = COALESCE(NULLIF(raw_response->>'data_opcao_pelo_simples', '')::date, data_opcao_simples),
                 data_exclusao_simples = COALESCE(NULLIF(raw_response->>'data_exclusao_do_simples', '')::date, data_exclusao_simples),
                 opcao_mei = CASE
                   WHEN raw_response ? 'opcao_pelo_mei' THEN
                     CASE
                       WHEN LOWER(COALESCE(raw_response->>'opcao_pelo_mei', '')) IN ('true', '1', 'sim', 's', 'yes', 'y') THEN TRUE
                       WHEN LOWER(COALESCE(raw_response->>'opcao_pelo_mei', '')) IN ('false', '0', 'nao', 'não', 'n', 'no') THEN FALSE
                       ELSE opcao_mei
                     END
                   ELSE opcao_mei
                 END,
                 data_opcao_mei = COALESCE(NULLIF(raw_response->>'data_opcao_pelo_mei', '')::date, data_opcao_mei),
                 data_exclusao_mei = COALESCE(NULLIF(raw_response->>'data_exclusao_do_mei', '')::date, data_exclusao_mei)
           WHERE raw_response IS NOT NULL;
        `);
        await pool.query(`
          UPDATE office_companies
             SET regime_tributario_atual = CASE
               WHEN opcao_mei IS TRUE THEN 'SIMEI'
               WHEN opcao_simples IS TRUE THEN 'SIMPLES NACIONAL'
               WHEN raw_response IS NOT NULL
                    AND jsonb_typeof(raw_response->'regime_tributario') = 'array'
                    AND jsonb_array_length(raw_response->'regime_tributario') > 0
                 THEN NULLIF(TRIM((raw_response->'regime_tributario'->0->>'forma_de_tributacao')), '')
               WHEN COALESCE(UPPER(situacao_cadastral), '') = 'BAIXADA' AND data_exclusao_mei IS NOT NULL THEN 'EXCLUIDA DO SIMEI'
               WHEN COALESCE(UPPER(situacao_cadastral), '') = 'BAIXADA' AND data_exclusao_simples IS NOT NULL THEN 'EXCLUIDA DO SIMPLES NACIONAL'
               ELSE NULL
             END
           WHERE TRUE;
        `);
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function fetchBrasilApiCnpj(cnpj) {
    const url = `${BRASILAPI_BASE_URL}/${cnpj}`;
    const timeoutMs = Number(process.env.CADASTRO_EMPRESAS_BRASILAPI_TIMEOUT_MS || 20000);
    const maxAttempts = Math.max(1, Number(process.env.CADASTRO_EMPRESAS_BRASILAPI_RETRY_MAX || 4));
    const baseBackoffMs = Math.max(150, Number(process.env.CADASTRO_EMPRESAS_BRASILAPI_BACKOFF_MS || 700));

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await scheduleBrasilApiRequestSlot();
        const response = await axios.get(url, {
          timeout: timeoutMs,
          validateStatus: () => true,
        });

        if (response.status >= 200 && response.status < 300) {
          return response.data;
        }

        const msg = response?.data?.message || response?.data?.errors?.[0] || `HTTP ${response.status}`;
        const error = new Error(String(msg || 'Erro ao consultar BrasilAPI.'));
        error.status = response.status;
        error.retryAfterMs = parseRetryAfterMs(response?.headers?.['retry-after']);
        throw error;
      } catch (error) {
        const status = Number(error?.status || error?.response?.status || 0) || null;
        const isRetryable = status === 429 || status === 408 || status >= 500 || error?.code === 'ECONNABORTED';
        lastError = error;

        if (!isRetryable || attempt >= maxAttempts) {
          if (status && !error.status) error.status = status;
          throw error;
        }

        const jitter = Math.floor(Math.random() * 250);
        const retryAfterMs = parseRetryAfterMs(error?.retryAfterMs || error?.response?.headers?.['retry-after']);
        const backoff = Math.max(retryAfterMs, baseBackoffMs * (2 ** (attempt - 1)) + jitter);
        await sleep(backoff);
      }
    }

    throw lastError || new Error('Falha ao consultar BrasilAPI.');
  }

  async function upsertCompany(normalizedCompany) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT id FROM office_companies WHERE cnpj = $1 LIMIT 1', [normalizedCompany.cnpj]);
      const existed = existing.rows.length > 0;

      const upsert = await client.query(
        `
          INSERT INTO office_companies (
            cnpj,
            razao_social,
            nome_fantasia,
            situacao_cadastral,
            data_inicio_atividade,
            natureza_juridica,
            porte,
            capital_social,
            email,
            ddd_telefone_1,
            ddd_telefone_2,
            logradouro,
            numero,
            complemento,
            bairro,
            municipio,
            uf,
            cep,
            atividade_principal_codigo,
            atividade_principal_descricao,
            regime_tributario_atual,
            opcao_simples,
            data_opcao_simples,
            data_exclusao_simples,
            opcao_mei,
            data_opcao_mei,
            data_exclusao_mei,
            raw_response,
            updated_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,NOW()
          )
          ON CONFLICT (cnpj) DO UPDATE
          SET
            razao_social = EXCLUDED.razao_social,
            nome_fantasia = EXCLUDED.nome_fantasia,
            situacao_cadastral = EXCLUDED.situacao_cadastral,
            data_inicio_atividade = EXCLUDED.data_inicio_atividade,
            natureza_juridica = EXCLUDED.natureza_juridica,
            porte = EXCLUDED.porte,
            capital_social = EXCLUDED.capital_social,
            email = EXCLUDED.email,
            ddd_telefone_1 = EXCLUDED.ddd_telefone_1,
            ddd_telefone_2 = EXCLUDED.ddd_telefone_2,
            logradouro = EXCLUDED.logradouro,
            numero = EXCLUDED.numero,
            complemento = EXCLUDED.complemento,
            bairro = EXCLUDED.bairro,
            municipio = EXCLUDED.municipio,
            uf = EXCLUDED.uf,
            cep = EXCLUDED.cep,
            atividade_principal_codigo = EXCLUDED.atividade_principal_codigo,
            atividade_principal_descricao = EXCLUDED.atividade_principal_descricao,
            regime_tributario_atual = EXCLUDED.regime_tributario_atual,
            regime_tributario_manual = CASE
              WHEN EXCLUDED.regime_tributario_atual IS NOT NULL AND BTRIM(EXCLUDED.regime_tributario_atual) <> '' THEN NULL
              ELSE office_companies.regime_tributario_manual
            END,
            opcao_simples = EXCLUDED.opcao_simples,
            data_opcao_simples = EXCLUDED.data_opcao_simples,
            data_exclusao_simples = EXCLUDED.data_exclusao_simples,
            opcao_mei = EXCLUDED.opcao_mei,
            data_opcao_mei = EXCLUDED.data_opcao_mei,
            data_exclusao_mei = EXCLUDED.data_exclusao_mei,
            raw_response = EXCLUDED.raw_response,
            updated_at = NOW()
          RETURNING id
        `,
        [
          normalizedCompany.cnpj,
          normalizedCompany.razaoSocial,
          normalizedCompany.nomeFantasia,
          normalizedCompany.situacaoCadastral,
          normalizedCompany.dataInicioAtividade,
          normalizedCompany.naturezaJuridica,
          normalizedCompany.porte,
          normalizedCompany.capitalSocial,
          normalizedCompany.email,
          normalizedCompany.dddTelefone1,
          normalizedCompany.dddTelefone2,
          normalizedCompany.logradouro,
          normalizedCompany.numero,
          normalizedCompany.complemento,
          normalizedCompany.bairro,
          normalizedCompany.municipio,
          normalizedCompany.uf,
          normalizedCompany.cep,
          normalizedCompany.atividadePrincipalCodigo,
          normalizedCompany.atividadePrincipalDescricao,
          normalizedCompany.regimeTributarioAtual,
          normalizedCompany.regimeTributario?.opcaoSimples,
          normalizedCompany.regimeTributario?.dataOpcaoSimples,
          normalizedCompany.regimeTributario?.dataExclusaoSimples,
          normalizedCompany.regimeTributario?.opcaoMei,
          normalizedCompany.regimeTributario?.dataOpcaoMei,
          normalizedCompany.regimeTributario?.dataExclusaoMei,
          JSON.stringify(normalizedCompany.rawResponse || {}),
        ]
      );

      const companyId = upsert.rows[0]?.id;

      await client.query('DELETE FROM office_company_partners WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM office_company_cnaes WHERE company_id = $1', [companyId]);

      const partners = Array.isArray(normalizedCompany.partners) ? normalizedCompany.partners : [];
      if (partners.length > 0) {
        const partnerValues = [];
        const placeholders = [];
        let index = 1;
        for (const partner of partners) {
          placeholders.push(`($${index},$${index + 1},$${index + 2},$${index + 3},$${index + 4},$${index + 5},$${index + 6})`);
          partnerValues.push(
            companyId,
            partner.partnerName,
            partner.qualification,
            partner.country,
            partner.legalRepresentative,
            partner.ageRange,
            partner.updateDate
          );
          index += 7;
        }
        await client.query(
          `
            INSERT INTO office_company_partners
              (company_id, partner_name, qualification, country, legal_representative, age_range, update_date)
            VALUES ${placeholders.join(',')}
          `,
          partnerValues
        );
      }

      const cnaes = Array.isArray(normalizedCompany.cnaes) ? normalizedCompany.cnaes : [];
      if (cnaes.length > 0) {
        const cnaeValues = [];
        const placeholders = [];
        let index = 1;
        for (const cnae of cnaes) {
          placeholders.push(`($${index},$${index + 1},$${index + 2},$${index + 3})`);
          cnaeValues.push(companyId, cnae.code, cnae.description, !!cnae.isPrimary);
          index += 4;
        }
        await client.query(
          `
            INSERT INTO office_company_cnaes
              (company_id, code, description, is_primary)
            VALUES ${placeholders.join(',')}
          `,
          cnaeValues
        );
      }

      await client.query('COMMIT');
      return { companyId, existed };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function syncCnpjs(cnpjs, forceRefresh) {
    const list = Array.from(new Set((Array.isArray(cnpjs) ? cnpjs : []).map(normalizeCnpj).filter(Boolean)));
    if (!list.length) {
      return {
        totalRecebidos: 0,
        processados: 0,
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        falhas: [],
      };
    }

    const existingRows = await pool.query('SELECT cnpj FROM office_companies WHERE cnpj = ANY($1::text[])', [list]);
    const existingSet = new Set(existingRows.rows.map((row) => row.cnpj));

    let inseridos = 0;
    let atualizados = 0;
    let ignorados = 0;
    const falhas = [];

    const jobs = forceRefresh ? list : list.filter((cnpj) => !existingSet.has(cnpj));
    ignorados += list.length - jobs.length;

    const concurrency = Math.max(1, Math.min(5, Number(process.env.CADASTRO_EMPRESAS_BRASILAPI_CONCURRENCY || 2)));
    await runWithConcurrency(jobs, concurrency, async (cnpj) => {
      try {
        const data = await fetchBrasilApiCnpj(cnpj);
        const normalized = normalizeBrasilApiData(cnpj, data);
        const result = await upsertCompany(normalized);
        if (result.existed) atualizados += 1;
        else inseridos += 1;
      } catch (error) {
        falhas.push({
          cnpj: formatCnpj(cnpj),
          mensagem: error?.message || 'Falha ao consultar ou salvar empresa.',
          status: error?.status || null,
        });
      }
      return null;
    });

    return {
      totalRecebidos: list.length,
      processados: jobs.length,
      inseridos,
      atualizados,
      ignorados,
      falhas,
    };
  }

  function buildCompanyFilters(query) {
    const search = String(query?.search || '').trim();
    const partner = String(query?.partner || '').trim();
    const uf = String(query?.uf || '').trim().toUpperCase();
    const situacao = String(query?.situacao || '').trim();
    const porte = String(query?.porte || '').trim();
    const naturezaJuridica = String(query?.naturezaJuridica || '').trim();
    const municipio = String(query?.municipio || '').trim();
    const regime = String(query?.regime || '').trim();
    const cnaesRaw = String(query?.cnaes || '');
    const cnaeMode = String(query?.cnaeMode || 'any').toLowerCase() === 'all' ? 'all' : 'any';
    const cnaes = [];
    const cnaeTextTerms = [];
    const tokens = cnaesRaw
      .split(/[,\n;]+/)
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    for (const token of tokens) {
      const tokenDigits = onlyDigits(token);
      const hasLetters = /[a-zA-ZÀ-ÿ]/.test(token);
      const fullCode = tokenDigits.length >= 7 ? tokenDigits.slice(0, 7) : '';
      if (fullCode) cnaes.push(fullCode);

      if (hasLetters) {
        const textOnly = token.replace(/\d+/g, ' ').replace(/[-–—_/]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (textOnly) cnaeTextTerms.push(textOnly);
      } else if (!fullCode && tokenDigits.length > 0) {
        cnaeTextTerms.push(tokenDigits);
      }
    }

    const uniqueCnaes = Array.from(new Set(cnaes.filter(Boolean)));
    const uniqueCnaeTextTerms = Array.from(new Set(cnaeTextTerms.filter(Boolean)));

    const where = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      where.push(`(
        c.cnpj LIKE REPLACE(REPLACE(REPLACE($${idx},'.',''),'/',''),'-','')
        OR c.razao_social ILIKE $${idx}
        OR c.nome_fantasia ILIKE $${idx}
      )`);
    }

    if (partner) {
      params.push(`%${partner}%`);
      const idx = params.length;
      where.push(`EXISTS (
        SELECT 1
        FROM office_company_partners p
        WHERE p.company_id = c.id
          AND p.partner_name ILIKE $${idx}
      )`);
    }

    if (uf) {
      params.push(uf);
      where.push(`c.uf = $${params.length}`);
    }

    if (situacao) {
      params.push(situacao);
      where.push(`c.situacao_cadastral = $${params.length}`);
    }

    if (porte) {
      params.push(porte);
      where.push(`c.porte = $${params.length}`);
    }

    if (naturezaJuridica) {
      params.push(naturezaJuridica);
      where.push(`c.natureza_juridica = $${params.length}`);
    }

    if (municipio) {
      params.push(municipio);
      where.push(`c.municipio = $${params.length}`);
    }

    if (regime) {
      const regimeSql = buildRegimeTributarioAtualSql('c');
      if (regime === '__EMPTY__') {
        where.push(`(${regimeSql} IS NULL OR BTRIM(${regimeSql}) = '')`);
      } else {
        params.push(regime);
        where.push(`UPPER(BTRIM(${regimeSql})) = UPPER(BTRIM($${params.length}))`);
      }
    }

    if (uniqueCnaes.length > 0) {
      params.push(uniqueCnaes);
      const idx = params.length;
      if (cnaeMode === 'all') {
        params.push(uniqueCnaes.length);
        const lenIdx = params.length;
        where.push(`(
          SELECT COUNT(DISTINCT n.code)
          FROM office_company_cnaes n
          WHERE n.company_id = c.id
            AND n.code = ANY($${idx}::text[])
        ) = $${lenIdx}`);
      } else {
        where.push(`EXISTS (
          SELECT 1
          FROM office_company_cnaes n
          WHERE n.company_id = c.id
            AND n.code = ANY($${idx}::text[])
        )`);
      }
    }

    if (uniqueCnaeTextTerms.length > 0) {
      const likePatterns = uniqueCnaeTextTerms.map((term) => `%${term}%`);
      params.push(likePatterns);
      const idx = params.length;
      where.push(`EXISTS (
        SELECT 1
        FROM office_company_cnaes n
        WHERE n.company_id = c.id
          AND (
            n.description ILIKE ANY($${idx}::text[])
            OR n.code ILIKE ANY($${idx}::text[])
          )
      )`);
    }

    return {
      params,
      whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    };
  }

  router.get('/health', async (_req, res) => {
    try {
      await ensureSchema();
      return res.json({ ok: true });
    } catch (error) {
      console.error('cadastro empresas health error:', error?.message || error);
      return res.status(500).json({ ok: false });
    }
  });

  router.get('/meta', async (req, res) => {
    try {
      await ensureSchema();
      const regimeSql = buildRegimeTributarioAtualSql('c');

      const [
        ufsResult,
        situacoesResult,
        portesResult,
        naturezasResult,
        municipiosResult,
        regimesResult,
        cnaesResult,
      ] = await Promise.all([
        pool.query(`
          SELECT DISTINCT uf
          FROM office_companies
          WHERE uf IS NOT NULL AND uf <> ''
          ORDER BY uf ASC
        `),
        pool.query(`
          SELECT DISTINCT situacao_cadastral
          FROM office_companies
          WHERE situacao_cadastral IS NOT NULL AND situacao_cadastral <> ''
          ORDER BY situacao_cadastral ASC
        `),
        pool.query(`
          SELECT DISTINCT porte
          FROM office_companies
          WHERE porte IS NOT NULL AND porte <> ''
          ORDER BY porte ASC
        `),
        pool.query(`
          SELECT DISTINCT natureza_juridica
          FROM office_companies
          WHERE natureza_juridica IS NOT NULL AND natureza_juridica <> ''
          ORDER BY natureza_juridica ASC
        `),
        pool.query(`
          SELECT DISTINCT municipio
          FROM office_companies
          WHERE municipio IS NOT NULL AND municipio <> ''
          ORDER BY municipio ASC
          LIMIT 1200
        `),
        pool.query(`
          SELECT DISTINCT UPPER(BTRIM(${regimeSql})) AS regime_tributario_atual
          FROM office_companies c
          WHERE ${regimeSql} IS NOT NULL
            AND BTRIM(${regimeSql}) <> ''
          ORDER BY regime_tributario_atual ASC
        `),
        pool.query(`
          SELECT
            code,
            MAX(description) AS description,
            COUNT(*) AS total
          FROM office_company_cnaes
          GROUP BY code
          ORDER BY COUNT(*) DESC, code ASC
          LIMIT 1200
        `),
      ]);

      return res.json({
        ufs: ufsResult.rows.map((row) => row.uf).filter(Boolean),
        situacoes: situacoesResult.rows.map((row) => row.situacao_cadastral).filter(Boolean),
        portes: portesResult.rows.map((row) => row.porte).filter(Boolean),
        naturezasJuridicas: naturezasResult.rows.map((row) => row.natureza_juridica).filter(Boolean),
        municipios: municipiosResult.rows.map((row) => row.municipio).filter(Boolean),
        regimesTributarios: regimesResult.rows.map((row) => row.regime_tributario_atual).filter(Boolean),
        cnaes: cnaesResult.rows.map((row) => ({
          code: row.code,
          description: row.description,
          total: Number(row.total || 0),
        })),
      });
    } catch (error) {
      console.error('cadastro empresas meta error:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao carregar filtros.' });
    }
  });

  router.get('/companies', async (req, res) => {
    try {
      await ensureSchema();

      const page = Math.max(1, Number(req.query?.page) || 1);
      const pageSize = Math.min(200, Math.max(10, Number(req.query?.pageSize) || 50));
      const { whereSql, params } = buildCompanyFilters(req.query);
      const countSql = `SELECT COUNT(*) AS total FROM office_companies c ${whereSql}`;
      const countResult = await pool.query(countSql, params);
      const total = Number(countResult.rows[0]?.total || 0);

      const dataParams = params.slice();
      dataParams.push(pageSize);
      const limitIdx = dataParams.length;
      dataParams.push((page - 1) * pageSize);
      const offsetIdx = dataParams.length;

      const rows = await pool.query(
        `
          SELECT
            c.*,
            ${buildRegimeTributarioAtualSql('c')} AS regime_tributario_atual,
            COALESCE((
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', p.id,
                  'partnerName', p.partner_name,
                  'qualification', p.qualification,
                  'country', p.country,
                  'legalRepresentative', p.legal_representative,
                  'ageRange', p.age_range,
                  'updateDate', p.update_date
                )
                ORDER BY p.partner_name ASC
              )
              FROM office_company_partners p
              WHERE p.company_id = c.id
            ), '[]'::json) AS partners,
            COALESCE((
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'code', n.code,
                  'description', n.description,
                  'isPrimary', n.is_primary
                )
                ORDER BY n.is_primary DESC, n.code ASC
              )
              FROM office_company_cnaes n
              WHERE n.company_id = c.id
            ), '[]'::json) AS cnaes
          FROM office_companies c
          ${whereSql}
          ORDER BY c.razao_social ASC NULLS LAST, c.cnpj ASC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        dataParams
      );

      return res.json({
        page,
        pageSize,
        total,
        items: rows.rows.map(mapCompanyRow),
      });
    } catch (error) {
      console.error('cadastro empresas list error:', error?.message || error);
      return res.status(500).json({ error: `Erro ao listar empresas: ${error?.message || 'falha interna'}` });
    }
  });

  router.get('/export.xlsx', async (req, res) => {
    try {
      await ensureSchema();
      const { whereSql, params } = buildCompanyFilters(req.query);

      const rows = await pool.query(
        `
          SELECT
            c.*,
            ${buildRegimeTributarioAtualSql('c')} AS regime_tributario_atual,
            COALESCE((
              SELECT STRING_AGG(p.partner_name, ' | ' ORDER BY p.partner_name ASC)
              FROM office_company_partners p
              WHERE p.company_id = c.id
            ), '') AS partners_text,
            COALESCE((
              SELECT STRING_AGG(
                CASE WHEN n.is_primary THEN '[Principal] ' ELSE '' END || n.code || COALESCE(' - ' || n.description, ''),
                ' | '
                ORDER BY n.is_primary DESC, n.code ASC
              )
              FROM office_company_cnaes n
              WHERE n.company_id = c.id
            ), '') AS cnaes_text
          FROM office_companies c
          ${whereSql}
          ORDER BY c.razao_social ASC NULLS LAST, c.cnpj ASC
        `,
        params
      );

      const exportRows = rows.rows.map((row) => ({
        CNPJ: formatCnpj(row.cnpj),
        'Razao Social': row.razao_social || '',
        'Nome Fantasia': row.nome_fantasia || '',
        'Situacao Cadastral': row.situacao_cadastral || '',
        Porte: row.porte || '',
        'Natureza Juridica': row.natureza_juridica || '',
        'Regime Tributario Atual': row.regime_tributario_atual || '',
        Municipio: row.municipio || '',
        UF: row.uf || '',
        'CNAE Principal': `${row.atividade_principal_codigo || ''}${row.atividade_principal_descricao ? ` - ${row.atividade_principal_descricao}` : ''}`,
        'CNAEs (Todos)': row.cnaes_text || '',
        'Socios (Todos)': row.partners_text || '',
        'Opcao Simples': row.opcao_simples === null ? '' : (row.opcao_simples ? 'Sim' : 'Nao'),
        'Data Opcao Simples': row.data_opcao_simples || '',
        'Data Exclusao Simples': row.data_exclusao_simples || '',
        'Opcao MEI': row.opcao_mei === null ? '' : (row.opcao_mei ? 'Sim' : 'Nao'),
        'Data Opcao MEI': row.data_opcao_mei || '',
        'Data Exclusao MEI': row.data_exclusao_mei || '',
        'Atualizado Em': row.updated_at || '',
      }));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Empresas');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const fileName = `empresas-filtradas-${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(buffer);
    } catch (error) {
      console.error('cadastro empresas export error:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao exportar planilha.' });
    }
  });

  router.get('/companies/:id', async (req, res) => {
    try {
      await ensureSchema();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID inválido.' });
      }

      const result = await pool.query(
        `
          SELECT
            c.*,
            ${buildRegimeTributarioAtualSql('c')} AS regime_tributario_atual,
            COALESCE((
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', p.id,
                  'partnerName', p.partner_name,
                  'qualification', p.qualification,
                  'country', p.country,
                  'legalRepresentative', p.legal_representative,
                  'ageRange', p.age_range,
                  'updateDate', p.update_date
                )
                ORDER BY p.partner_name ASC
              )
              FROM office_company_partners p
              WHERE p.company_id = c.id
            ), '[]'::json) AS partners,
            COALESCE((
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'code', n.code,
                  'description', n.description,
                  'isPrimary', n.is_primary
                )
                ORDER BY n.is_primary DESC, n.code ASC
              )
              FROM office_company_cnaes n
              WHERE n.company_id = c.id
            ), '[]'::json) AS cnaes
          FROM office_companies c
          WHERE c.id = $1
          LIMIT 1
        `,
        [id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: 'Empresa não encontrada.' });
      }

      return res.json({ company: mapCompanyRow(result.rows[0]) });
    } catch (error) {
      console.error('cadastro empresas detail error:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao carregar empresa.' });
    }
  });

  router.post('/companies/:id/regime-manual', requireCsrf, async (req, res) => {
    try {
      await ensureSchema();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID inválido.' });
      }

      const rawManual = String(req.body?.regimeTributarioManual ?? '').trim();
      const manual = rawManual ? normalizeRegimeLabel(rawManual) : null;

      const updateResult = await pool.query(
        `
          UPDATE office_companies
             SET regime_tributario_manual = $2,
                 updated_at = NOW()
           WHERE id = $1
           RETURNING *
        `,
        [id, manual]
      );

      if (!updateResult.rows.length) {
        return res.status(404).json({ error: 'Empresa não encontrada.' });
      }

      await auditLog(req, 'office_companies_regime_manual', 'ok', {
        companyId: id,
        regimeTributarioManual: manual || null,
      });

      const result = await pool.query(
        `
          SELECT
            c.*,
            ${buildRegimeTributarioAtualSql('c')} AS regime_tributario_atual,
            COALESCE((
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', p.id,
                  'partnerName', p.partner_name,
                  'qualification', p.qualification,
                  'country', p.country,
                  'legalRepresentative', p.legal_representative,
                  'ageRange', p.age_range,
                  'updateDate', p.update_date
                )
                ORDER BY p.partner_name ASC
              )
              FROM office_company_partners p
              WHERE p.company_id = c.id
            ), '[]'::json) AS partners,
            COALESCE((
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'code', n.code,
                  'description', n.description,
                  'isPrimary', n.is_primary
                )
                ORDER BY n.is_primary DESC, n.code ASC
              )
              FROM office_company_cnaes n
              WHERE n.company_id = c.id
            ), '[]'::json) AS cnaes
          FROM office_companies c
          WHERE c.id = $1
          LIMIT 1
        `,
        [id]
      );

      return res.json({ company: mapCompanyRow(result.rows[0]) });
    } catch (error) {
      console.error('cadastro empresas regime-manual error:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao salvar regime tributário manual.' });
    }
  });

  router.post('/import', requireCsrf, async (req, res) => {
    try {
      await ensureSchema();
      const forceRefresh = !!req.body?.forceRefresh;
      const cnpjs = Array.isArray(req.body?.cnpjs) ? req.body.cnpjs : [];
      const summary = await syncCnpjs(cnpjs, forceRefresh);

      await auditLog(req, 'office_companies_import_manual', summary.falhas.length ? 'error' : 'ok', {
        total: summary.totalRecebidos,
        processados: summary.processados,
        inseridos: summary.inseridos,
        atualizados: summary.atualizados,
        ignorados: summary.ignorados,
        falhas: summary.falhas.length,
      });

      return res.json(summary);
    } catch (error) {
      console.error('cadastro empresas import error:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao importar CNPJs.' });
    }
  });

  router.post('/import-file', requireCsrf, upload.single('file'), async (req, res) => {
    try {
      await ensureSchema();
      if (!req.file || !Buffer.isBuffer(req.file.buffer)) {
        return res.status(400).json({ error: 'Arquivo inválido.' });
      }

      const forceRefresh = ['1', 'true', 'yes', 'on'].includes(String(req.body?.forceRefresh || '').toLowerCase());
      const cnpjs = extractCnpjsFromBuffer(req.file.originalname, req.file.buffer);
      if (!cnpjs.length) {
        return res.status(400).json({ error: 'Nenhum CNPJ válido encontrado no arquivo.' });
      }

      const summary = await syncCnpjs(cnpjs, forceRefresh);

      await auditLog(req, 'office_companies_import_file', summary.falhas.length ? 'error' : 'ok', {
        fileName: req.file.originalname,
        total: summary.totalRecebidos,
        processados: summary.processados,
        inseridos: summary.inseridos,
        atualizados: summary.atualizados,
        ignorados: summary.ignorados,
        falhas: summary.falhas.length,
      });

      return res.json({
        ...summary,
        arquivo: req.file.originalname,
      });
    } catch (error) {
      console.error('cadastro empresas import-file error:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao importar planilha/arquivo.' });
    }
  });

  router.post('/refresh', requireCsrf, async (req, res) => {
    try {
      await ensureSchema();
      const forceRefresh = true;
      const requested = Array.isArray(req.body?.cnpjs) ? req.body.cnpjs : [];
      const cnpjs = requested.map(normalizeCnpj).filter(Boolean);
      if (!cnpjs.length) {
        return res.status(400).json({ error: 'Informe pelo menos um CNPJ para atualizar.' });
      }

      const summary = await syncCnpjs(cnpjs, forceRefresh);

      await auditLog(req, 'office_companies_refresh', summary.falhas.length ? 'error' : 'ok', {
        total: summary.totalRecebidos,
        processados: summary.processados,
        atualizados: summary.atualizados,
        falhas: summary.falhas.length,
      });

      return res.json(summary);
    } catch (error) {
      console.error('cadastro empresas refresh error:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao atualizar empresas.' });
    }
  });

  router.post('/refresh-all', requireCsrf, async (req, res) => {
    try {
      await ensureSchema();

      const allRows = await pool.query('SELECT cnpj FROM office_companies ORDER BY cnpj ASC');
      const cnpjs = allRows.rows.map((row) => normalizeCnpj(row.cnpj)).filter(Boolean);
      if (!cnpjs.length) {
        return res.status(400).json({ error: 'Nenhuma empresa cadastrada para atualizar.' });
      }

      const summary = await syncCnpjs(cnpjs, true);

      await auditLog(req, 'office_companies_refresh_all', summary.falhas.length ? 'error' : 'ok', {
        total: summary.totalRecebidos,
        processados: summary.processados,
        atualizados: summary.atualizados,
        falhas: summary.falhas.length,
      });

      return res.json(summary);
    } catch (error) {
      console.error('cadastro empresas refresh-all error:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao atualizar todas as empresas.' });
    }
  });

  return router;
};
