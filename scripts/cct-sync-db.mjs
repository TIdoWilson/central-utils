import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import pkg from 'pg';

const { Pool } = pkg;
const require = createRequire(import.meta.url);
const { __private: cctPrivate } = require('../src/services/cct.service.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(APP_ROOT, '.env') });

function readArg(name, fallback = '') {
  const token = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(token));
  if (!found) return fallback;
  return String(found.slice(token.length) || fallback).trim();
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function safeInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function resolveJsonDir() {
  const fromArg = readArg('json-dir', '');
  if (fromArg) return path.resolve(fromArg);
  const fromEnv = String(process.env.CCT_JSON_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(APP_ROOT, 'data', 'cct', 'json');
}

async function listJsonFiles(jsonDir) {
  const entries = await fs.promises.readdir(jsonDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.json$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

async function ensureCctSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cct_conventions (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      arquivo_origem TEXT NULL,
      nome TEXT NOT NULL,
      prefixo TEXT NULL,
      numero_registro TEXT NULL,
      numero_solicitacao TEXT NULL,
      data_registro_mte TEXT NULL,
      data_base TEXT NULL,
      data_base_mes TEXT NULL,
      data_base_mes_numero INTEGER NULL,
      data_base_mes_valor TEXT NULL,
      vigencia TEXT NULL,
      vigencia_status TEXT NULL,
      abrangencia TEXT NULL,
      abrangencia_normalized TEXT NULL,
      abrangencia_territorial TEXT NULL,
      abrangencia_territorial_normalized TEXT NULL,
      prazo_oposicao_data TEXT NULL,
      prazo_oposicao_clausula TEXT NULL,
      quantidade_clausulas INTEGER NOT NULL DEFAULT 0,
      quantidade_sindicatos INTEGER NOT NULL DEFAULT 0,
      sindicatos_celebrantes JSONB NOT NULL DEFAULT '[]'::jsonb,
      search_text TEXT NOT NULL DEFAULT '',
      search_digits TEXT NOT NULL DEFAULT '',
      search_cnpj_digits TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      sort_timestamp BIGINT NOT NULL DEFAULT 0,
      raw JSONB NOT NULL,
      source_mtime_ms BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cct_conventions_sort
    ON cct_conventions (sort_timestamp DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cct_conventions_vigencia
    ON cct_conventions (vigencia_status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cct_conventions_data_base_mes
    ON cct_conventions (data_base_mes_valor);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cct_conventions_numero_registro
    ON cct_conventions (numero_registro);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cct_conventions_numero_solicitacao
    ON cct_conventions (numero_solicitacao);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cct_conventions_search_cnpj_digits
    ON cct_conventions USING GIN (search_cnpj_digits);
  `);
}

async function upsertConvention(pool, payload) {
  await pool.query(
    `
    INSERT INTO cct_conventions (
      id, file_name, arquivo_origem, nome, prefixo,
      numero_registro, numero_solicitacao, data_registro_mte,
      data_base, data_base_mes, data_base_mes_numero, data_base_mes_valor,
      vigencia, vigencia_status, abrangencia, abrangencia_normalized,
      abrangencia_territorial, abrangencia_territorial_normalized,
      prazo_oposicao_data, prazo_oposicao_clausula,
      quantidade_clausulas, quantidade_sindicatos,
      sindicatos_celebrantes, search_text, search_digits, search_cnpj_digits,
      sort_timestamp, raw, source_mtime_ms, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18,
      $19, $20,
      $21, $22,
      $23::jsonb, $24, $25, $26::text[],
      $27, $28::jsonb, $29, NOW()
    )
    ON CONFLICT (id)
    DO UPDATE SET
      file_name = EXCLUDED.file_name,
      arquivo_origem = EXCLUDED.arquivo_origem,
      nome = EXCLUDED.nome,
      prefixo = EXCLUDED.prefixo,
      numero_registro = EXCLUDED.numero_registro,
      numero_solicitacao = EXCLUDED.numero_solicitacao,
      data_registro_mte = EXCLUDED.data_registro_mte,
      data_base = EXCLUDED.data_base,
      data_base_mes = EXCLUDED.data_base_mes,
      data_base_mes_numero = EXCLUDED.data_base_mes_numero,
      data_base_mes_valor = EXCLUDED.data_base_mes_valor,
      vigencia = EXCLUDED.vigencia,
      vigencia_status = EXCLUDED.vigencia_status,
      abrangencia = EXCLUDED.abrangencia,
      abrangencia_normalized = EXCLUDED.abrangencia_normalized,
      abrangencia_territorial = EXCLUDED.abrangencia_territorial,
      abrangencia_territorial_normalized = EXCLUDED.abrangencia_territorial_normalized,
      prazo_oposicao_data = EXCLUDED.prazo_oposicao_data,
      prazo_oposicao_clausula = EXCLUDED.prazo_oposicao_clausula,
      quantidade_clausulas = EXCLUDED.quantidade_clausulas,
      quantidade_sindicatos = EXCLUDED.quantidade_sindicatos,
      sindicatos_celebrantes = EXCLUDED.sindicatos_celebrantes,
      search_text = EXCLUDED.search_text,
      search_digits = EXCLUDED.search_digits,
      search_cnpj_digits = EXCLUDED.search_cnpj_digits,
      sort_timestamp = EXCLUDED.sort_timestamp,
      raw = EXCLUDED.raw,
      source_mtime_ms = EXCLUDED.source_mtime_ms,
      updated_at = NOW()
    `,
    [
      payload.id,
      payload.fileName,
      payload.arquivoOrigem,
      payload.nome,
      payload.prefixo,
      payload.numeroRegistro,
      payload.numeroSolicitacao,
      payload.dataRegistroMte,
      payload.dataBase,
      payload.dataBaseMes,
      payload.dataBaseMesNumero,
      payload.dataBaseMesValor,
      payload.vigencia,
      payload.vigenciaStatus,
      payload.abrangencia,
      payload.abrangenciaNormalized,
      payload.abrangenciaTerritorial,
      payload.abrangenciaTerritorialNormalized,
      payload.prazoOposicaoData,
      payload.prazoOposicaoClausula,
      payload.quantidadeClausulas,
      payload.quantidadeSindicatos,
      JSON.stringify(payload.sindicatosCelebrantes || []),
      payload.searchText,
      payload.searchDigits,
      payload.searchCnpjDigits || [],
      payload.sortTimestamp,
      JSON.stringify(payload.raw || {}),
      payload.sourceMtimeMs,
    ],
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurado.');
  }
  if (!cctPrivate || typeof cctPrivate.buildDbPayloadFromRecord !== 'function') {
    throw new Error('Helper buildDbPayloadFromRecord nao encontrado no cct.service.');
  }

  const jsonDir = resolveJsonDir();
  const purgeMissing = !hasFlag('no-purge');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await ensureCctSchema(pool);
    const files = await listJsonFiles(jsonDir);
    const ids = [];
    let processed = 0;
    let errors = 0;

    for (const fileName of files) {
      const fullPath = path.join(jsonDir, fileName);
      try {
        const raw = await fs.promises.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw);
        const stat = await fs.promises.stat(fullPath);
        const payload = cctPrivate.buildDbPayloadFromRecord(
          parsed,
          fileName,
          safeInt(stat.mtimeMs, 0),
          new Date(),
        );

        await upsertConvention(pool, payload);
        ids.push(payload.id);
        processed += 1;
      } catch (error) {
        errors += 1;
        console.error(`[cct-sync-db] Falha em ${fileName}:`, error?.message || error);
      }
    }

    if (purgeMissing) {
      if (ids.length) {
        await pool.query(
          'DELETE FROM cct_conventions WHERE NOT (id = ANY($1::text[]))',
          [ids],
        );
      } else {
        await pool.query('DELETE FROM cct_conventions');
      }
    }

    const totalResult = await pool.query('SELECT COUNT(*)::int AS count FROM cct_conventions');
    const total = Number(totalResult.rows?.[0]?.count || 0);
    console.log(`[cct-sync-db] Processados: ${processed} | Erros: ${errors} | Total em banco: ${total}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[cct-sync-db] Erro fatal:', error?.message || error);
  process.exitCode = 1;
});
