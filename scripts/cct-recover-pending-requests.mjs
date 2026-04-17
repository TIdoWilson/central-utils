import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'pg';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(APP_ROOT, '.env') });

const CCT_DIR = path.join(APP_ROOT, 'data', 'cct');
const CNPJ_FILE = path.join(CCT_DIR, 'CNPJ.txt');
const REQUESTERS_FILE = path.join(CCT_DIR, 'CNPJ_requisitantes.txt');
const HISTORY_FILE = path.join(CCT_DIR, 'historico_cct.log');

const PROCESSED_STATUSES = new Set([
  'download realizado',
  'nao retornou nenhuma convencao',
  'erro na busca',
]);

function normalizeDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function normalizeStatus(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseDateArg(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return null;
  const match = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function yesterdayAtStart() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  return date;
}

function parseArgs(argv) {
  const result = {
    dateFrom: null,
    dryRun: false,
    noAudit: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }
    if (arg === '--no-audit') {
      result.noAudit = true;
      continue;
    }
    if (arg.startsWith('--date=')) {
      result.dateFrom = parseDateArg(arg.slice('--date='.length));
      continue;
    }
  }

  if (!result.dateFrom) {
    result.dateFrom = yesterdayAtStart();
  }

  return result;
}

async function readLines(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function loadRequesterCnpjsFromAudit(dateFrom) {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    return {
      cnpjs: new Set(),
      source: 'audit-disabled-no-database-url',
      rows: 0,
    };
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const query = `
      SELECT created_at, status, meta
      FROM audit_logs
      WHERE action = 'tool_cct_request_cnpj'
        AND created_at >= $1
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query, [dateFrom.toISOString()]);
    const cnpjs = new Set();
    for (const row of result.rows || []) {
      const rawMeta = row?.meta;
      let meta = rawMeta;
      if (typeof rawMeta === 'string') {
        try {
          meta = JSON.parse(rawMeta);
        } catch (_) {
          meta = {};
        }
      }
      const digits = normalizeDigits(meta?.cnpj || '');
      if (digits.length === 14) {
        cnpjs.add(digits);
      }
    }
    return {
      cnpjs,
      source: 'audit-logs',
      rows: Number(result.rowCount || 0),
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

function parseRequesterCnpjs(lines) {
  const seen = new Set();
  for (const line of lines) {
    const firstColumn = String(line || '').split('\t', 1)[0];
    const digits = normalizeDigits(firstColumn);
    if (digits.length === 14) {
      seen.add(digits);
    }
  }
  return seen;
}

function parseQueueCnpjs(lines) {
  const items = [];
  const seen = new Set();
  for (const line of lines) {
    const digits = normalizeDigits(line);
    if (digits.length !== 14 || seen.has(digits)) continue;
    seen.add(digits);
    items.push(digits);
  }
  return items;
}

function parseProcessedSince(lines, dateFrom) {
  const processed = new Set();
  for (const line of lines) {
    const parts = String(line || '').split('\t');
    if (parts.length < 3) continue;
    const timestamp = new Date(parts[0] || '');
    if (Number.isNaN(timestamp.getTime()) || timestamp < dateFrom) continue;
    const cnpj = normalizeDigits(parts[1] || '');
    if (cnpj.length !== 14) continue;
    const status = normalizeStatus(parts[2] || '');
    if (!PROCESSED_STATUSES.has(status)) continue;
    processed.add(cnpj);
  }
  return processed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const requesterLines = await readLines(REQUESTERS_FILE);
  const queueLines = await readLines(CNPJ_FILE);
  const historyLines = await readLines(HISTORY_FILE);

  const requesterCnpjs = parseRequesterCnpjs(requesterLines);
  let auditResult = { cnpjs: new Set(), source: 'audit-disabled', rows: 0 };
  if (!args.noAudit) {
    try {
      auditResult = await loadRequesterCnpjsFromAudit(args.dateFrom);
      for (const cnpj of auditResult.cnpjs) {
        requesterCnpjs.add(cnpj);
      }
    } catch (error) {
      auditResult = {
        cnpjs: new Set(),
        source: `audit-failed: ${error?.message || error}`,
        rows: 0,
      };
    }
  }
  const queueCnpjs = parseQueueCnpjs(queueLines);
  const processedSince = parseProcessedSince(historyLines, args.dateFrom);

  const recovered = [];
  const queuedSet = new Set(queueCnpjs);
  for (const cnpj of requesterCnpjs) {
    if (processedSince.has(cnpj)) continue;
    if (queuedSet.has(cnpj)) continue;
    recovered.push(cnpj);
    queuedSet.add(cnpj);
  }

  const nextQueue = queueCnpjs.concat(recovered);
  const output = nextQueue.join('\n');

  if (!args.dryRun) {
    await fs.promises.mkdir(path.dirname(CNPJ_FILE), { recursive: true });
    const backupPath = `${CNPJ_FILE}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try {
      await fs.promises.copyFile(CNPJ_FILE, backupPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await fs.promises.writeFile(CNPJ_FILE, output ? `${output}\n` : '', 'utf8');
  }

  console.log(JSON.stringify({
    ok: true,
    dateFrom: args.dateFrom.toISOString(),
    dryRun: args.dryRun,
    audit: {
      source: auditResult.source,
      rows: auditResult.rows,
      cnpjsFound: auditResult.cnpjs.size,
    },
    requestersTotal: requesterCnpjs.size,
    queueBefore: queueCnpjs.length,
    processedSinceDate: processedSince.size,
    recoveredCount: recovered.length,
    queueAfter: nextQueue.length,
    recoveredPreview: recovered.slice(0, 30),
  }, null, 2));
}

main().catch((error) => {
  console.error('[cct:recover-pending-requests] Erro:', error?.message || error);
  process.exitCode = 1;
});
