import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import parcelamentosImporter from '../src/services/parcelamentos.importer.js';

dotenv.config();

const { Pool } = pg;
const { buildImportPlanFromFile } = parcelamentosImporter;

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_WORKBOOK = 'C:/Users/Usuario/Downloads/minha lista parcelamentos.xlsx';
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'parcelamentos');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'parcelamentos.import.json');
const OUTPUT_SQL = path.join(OUTPUT_DIR, 'parcelamentos.import.sql');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
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

async function writePreviewFiles(payload) {
  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(payload, null, 2), 'utf8');

  const sql = [];
  sql.push('-- Preview gerado a partir da planilha de parcelamentos');
  sql.push('-- Este arquivo pode ser aplicado manualmente quando o Postgres local estiver disponivel.');
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

  const payload = buildImportPlanFromFile(workbookPath);
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
