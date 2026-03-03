import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'pg';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(APP_ROOT, 'db', 'migrations');

dotenv.config({ path: path.join(APP_ROOT, '.env') });

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(pool) {
  const result = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(pool, filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(fullPath, 'utf8');

  await pool.query('BEGIN');
  try {
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurado.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);
    const files = getMigrationFiles();
    const pending = files.filter((file) => !applied.has(file));

    if (!pending.length) {
      console.log('[migrate] Nenhuma migration pendente.');
      return;
    }

    for (const filename of pending) {
      console.log(`[migrate] Aplicando ${filename}`);
      await applyMigration(pool, filename);
    }

    console.log(`[migrate] ${pending.length} migration(s) aplicada(s) com sucesso.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[migrate] Falha ao aplicar migrations:', error?.message || error);
  process.exitCode = 1;
});
