import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const { createCctEmailService } = require('../src/services/cct-email.service.js');

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

async function main() {
  const to = readArg('to', process.env.CCT_EMAIL_TO || '');
  const cc = readArg('cc', process.env.CCT_EMAIL_CC || '');

  const emailService = createCctEmailService({
    siteUrl: process.env.CCT_SITE_URL || '',
    to,
    cc,
  });

  await emailService.verify();
  const result = await emailService.sendTestEmail({
    subject: 'CCT - Teste de SMTP',
    text: [
      'Teste de conexao SMTP concluido com sucesso.',
      '',
      `Link para o site: ${process.env.CCT_SITE_URL || ''}`,
    ].join('\n'),
  });

  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

main().catch((error) => {
  console.error('[cct:test-email] Erro:', error?.message || error);
  process.exitCode = 1;
});
