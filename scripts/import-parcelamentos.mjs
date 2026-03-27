import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_WORKBOOK = String(process.env.PARCELAMENTOS_WORKBOOK_PATH || '').trim()
***REMOVED***
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'parcelamentos');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'parcelamentos.import.json');
const OUTPUT_SQL = path.join(OUTPUT_DIR, 'parcelamentos.import.sql');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function parseSheetDate(sheetName) {
  const raw = String(sheetName || '').trim();
  const match = raw.match(/^(\d{2})\.(\d{2}|\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const year = match[2].length === 2 ? Number(`20${match[2]}`) : Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(year) || year < 1900) return null;

  return new Date(Date.UTC(year, month - 1, 1));
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function safeSheetName(sheetName) {
  return String(sheetName || '').trim();
}

function isHeaderRow(row) {
  const first = normalizeText(row?.[0]);
  const second = normalizeText(row?.[1]);
  return first.includes('empresa / pessoa fisica') || second === 'cpf/cnpj';
}

function isDebitAccount(envio, parcelamento, obs) {
  const envioText = normalizeText(envio);
  const parcelamentoText = normalizeText(parcelamento);
  const obsText = normalizeText(obs);
  return /debito em conta|debito no banco/.test(envioText)
    || /debito em conta|debito no banco/.test(parcelamentoText)
    || /debito em conta|debito no banco/.test(obsText);
}

function parseParcelamento(rawValue) {
  const raw = String(rawValue || '').replace(/\s+/g, ' ').trim();
  if (!raw) {
    return { type: '', number: 'S/N' };
  }

  const explicitMatch = raw.match(/^(.*?)(?:\bN[°ºo]?\s*)?(\d[\d./-]*)$/i);
  if (explicitMatch) {
    const type = explicitMatch[1].replace(/[-:]+$/, '').trim();
    const number = explicitMatch[2].trim();
    if (type) return { type, number: number || 'S/N' };
  }

  const nMarkerMatch = raw.match(/^(.*?)(?:\bN[°ºo]?\s*)(\d[\d./-]*)$/i);
  if (nMarkerMatch) {
    const type = nMarkerMatch[1].replace(/[-:]+$/, '').trim();
    const number = nMarkerMatch[2].trim();
    if (type) return { type, number: number || 'S/N' };
  }

  return {
    type: raw,
    number: 'S/N',
  };
}

function mergeObservations(existing, incoming, rawParcelamento, sheetName) {
  const values = [];
  const add = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    if (!values.includes(text)) values.push(text);
  };

  add(existing);
  add(incoming);
  if (rawParcelamento && normalizeText(rawParcelamento) !== normalizeText(existing) && normalizeText(rawParcelamento) !== normalizeText(incoming)) {
    add(`Parcelamento original: ${rawParcelamento}`);
  }
  add(`Fonte planilha: ${sheetName}`);

  return values.join(' | ');
}

function parseArgs(argv) {
  const args = {
    workbookPath: DEFAULT_WORKBOOK,
    apply: false,
    replace: false,
    exportOnly: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--file' || token === '--xlsx') {
      args.workbookPath = argv[i + 1] ? String(argv[++i]) : args.workbookPath;
      continue;
    }
    if (token === '--apply') {
      args.apply = true;
      args.exportOnly = false;
      continue;
    }
    if (token === '--replace') {
      args.replace = true;
      continue;
    }
    if (token === '--export-only') {
      args.exportOnly = true;
      args.apply = false;
      continue;
    }
    if (token.toLowerCase().endsWith('.xlsx') && fs.existsSync(token)) {
      args.workbookPath = token;
    }
  }

  return args;
}

function buildRecords(workbook) {
  const latestByKey = new Map();
  const sheetNames = workbook.SheetNames || [];

  for (const sheetName of sheetNames) {
    const monthDate = parseSheetDate(safeSheetName(sheetName));
    const ws = workbook.Sheets[sheetName];
    if (!ws || !monthDate) continue;

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const header = rows[0] || [];
    const hasCodeColumn = /^cod/i.test(normalizeText(header[0]));
    const offset = hasCodeColumn ? 1 : 0;

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      if (!row.some((cell) => String(cell || '').trim() !== '')) continue;
      if (isHeaderRow(row)) continue;

      const companyName = String(row[offset] || '').trim();
      const cnpj = normalizeDigits(row[offset + 1]);
      const envio = row[offset + 2];
      const parcelamentoRaw = String(row[offset + 3] || '').trim();
      const observationRaw = String(row[offset + 4] || '').trim();
      if (!companyName && !cnpj && !parcelamentoRaw) continue;

      const parsed = parseParcelamento(parcelamentoRaw);
      const key = [
        normalizeText(companyName),
        cnpj,
        normalizeText(parsed.type || parcelamentoRaw),
        normalizeText(parsed.number),
      ].join('|');

      const candidate = {
        companyName,
        cnpj,
        parcelamentoType: parsed.type || parcelamentoRaw || 'Parcelamento',
        parcelamentoNumber: parsed.number || 'S/N',
        startDate: formatIsoDate(monthDate),
        debitAccount: isDebitAccount(envio, parcelamentoRaw, observationRaw),
        observations: mergeObservations('', observationRaw, parcelamentoRaw, safeSheetName(sheetName)),
        sourceSheet: safeSheetName(sheetName),
        sourceRow: i + 1,
        rawParcelamento: parcelamentoRaw,
        monthValue: monthDate.getTime(),
      };

      const existing = latestByKey.get(key);
      if (!existing) {
        latestByKey.set(key, candidate);
        continue;
      }

      if (candidate.monthValue > existing.monthValue || (candidate.monthValue === existing.monthValue && candidate.sourceRow > existing.sourceRow)) {
        candidate.observations = mergeObservations(existing.observations, observationRaw, parcelamentoRaw, safeSheetName(sheetName));
        candidate.debitAccount = existing.debitAccount || candidate.debitAccount;
        latestByKey.set(key, candidate);
        continue;
      }

      existing.debitAccount = existing.debitAccount || candidate.debitAccount;
      existing.observations = mergeObservations(existing.observations, observationRaw, parcelamentoRaw, safeSheetName(sheetName));
      latestByKey.set(key, existing);
    }
  }

  const items = [...latestByKey.values()]
    .map((item) => ({
      companyName: item.companyName,
      cnpj: item.cnpj,
      parcelamentoType: item.parcelamentoType,
      parcelamentoNumber: item.parcelamentoNumber,
      startDate: item.startDate,
      debitAccount: !!item.debitAccount,
      observations: item.observations || '',
      sourceSheet: item.sourceSheet,
      sourceRow: item.sourceRow,
      rawParcelamento: item.rawParcelamento,
    }))
    .sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1;
      return a.companyName.localeCompare(b.companyName, 'pt-BR');
    });

  return {
    items,
    summary: {
      sheets: sheetNames.length,
      records: items.length,
    },
  };
}

async function writePreviewFiles(payload) {
  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(payload, null, 2), 'utf8');

  const sql = [];
  sql.push('-- Preview gerado a partir da planilha de parcelamentos');
  sql.push('-- Este arquivo pode ser aplicado manualmente quando o Postgres local estiver disponível.');
  sql.push('BEGIN;');
  sql.push('TRUNCATE TABLE parcelamentos_impostos RESTART IDENTITY;');

  for (const item of payload.items) {
    const values = [
      item.companyName,
      item.cnpj,
      item.parcelamentoType,
      item.parcelamentoNumber,
      item.startDate,
      item.debitAccount ? 'true' : 'false',
      item.observations || null,
    ];

    const escaped = values.map((value) => {
      if (value === null || value === undefined || value === '') return 'NULL';
      if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
      return `'${String(value).replace(/'/g, "''")}'`;
    });

    sql.push(
      `INSERT INTO parcelamentos_impostos (company_name, cnpj, parcelamento_type, parcelamento_number, start_date, debit_account, observations) VALUES (${escaped.join(', ')});`
    );
  }

  sql.push('COMMIT;');
  fs.writeFileSync(OUTPUT_SQL, sql.join('\n'), 'utf8');
}

async function applyToDatabase(payload, options) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL nao encontrada no ambiente.');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('SELECT 1');
    await pool.query('BEGIN');
    if (options.replace) {
      await pool.query('TRUNCATE TABLE parcelamentos_impostos RESTART IDENTITY');
    }

    for (const item of payload.items) {
      await pool.query(
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
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          item.companyName,
          item.cnpj,
          item.parcelamentoType,
          item.parcelamentoNumber,
          item.startDate,
          item.debitAccount,
          item.observations || null,
        ]
      );
    }

    await pool.query('COMMIT');
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failures
    }
    throw error;
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workbookPath = args.workbookPath || DEFAULT_WORKBOOK;

  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Arquivo nao encontrado: ${workbookPath}`);
  }

  const workbook = XLSX.readFile(workbookPath);
  const payload = buildRecords(workbook);
  await writePreviewFiles(payload);

  console.log(JSON.stringify({
    workbookPath,
    summary: payload.summary,
    previewJson: OUTPUT_JSON,
    previewSql: OUTPUT_SQL,
  }, null, 2));

  if (!args.apply) return;

  try {
    await applyToDatabase(payload, args);
    console.log(`Importacao aplicada com sucesso: ${payload.items.length} registro(s).`);
  } catch (error) {
    console.error(`Falha ao aplicar no banco: ${error?.message || error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
