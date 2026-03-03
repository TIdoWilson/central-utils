import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(APP_ROOT, '.env') });

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(stderr || `${command} ${args.join(' ')} falhou com exit code ${result.status}`);
  }

  return String(result.stdout || '');
}

function getDeploySshTarget() {
  const explicit = String(process.env.DEPLOY_VPS_SSH_TARGET || '').trim();
  if (explicit) return explicit;

  const host = String(process.env.DEPLOY_VPS_HOST || '').trim();
  const user = String(process.env.DEPLOY_VPS_USER || '').trim();
  if (!host || !user) {
    throw new Error('Configure DEPLOY_VPS_SSH_TARGET ou DEPLOY_VPS_HOST + DEPLOY_VPS_USER no .env.');
  }

  return `${user}@${host}`;
}

function getDeployPort() {
  const raw = String(process.env.DEPLOY_VPS_PORT || '').trim();
  return raw || null;
}

function getDeployAppDir() {
  return String(process.env.DEPLOY_VPS_APP_DIR || '/opt/central-utils').trim();
}

function getLocalEnvSourceFile() {
  const configured = String(process.env.DEPLOY_VPS_ENV_SOURCE || '.env.vps').trim();
  const fullPath = path.resolve(APP_ROOT, configured);
  if (fs.existsSync(fullPath)) return fullPath;

  const fallback = path.resolve(APP_ROOT, '.env');
  if (fs.existsSync(fallback)) return fallback;

  throw new Error(`Arquivo local de ambiente não encontrado. Esperado: ${fullPath} ou ${fallback}`);
}

function parseEnvContent(content) {
  const parsed = {};
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    parsed[key] = value;
  }
  return parsed;
}

function diffEnvs(localEnv, remoteEnv) {
  const localKeys = Object.keys(localEnv);
  const remoteKeys = Object.keys(remoteEnv);
  const allKeys = Array.from(new Set([...localKeys, ...remoteKeys])).sort((a, b) => a.localeCompare(b));

  const onlyLocal = [];
  const onlyRemote = [];
  const different = [];

  for (const key of allKeys) {
    const hasLocal = Object.prototype.hasOwnProperty.call(localEnv, key);
    const hasRemote = Object.prototype.hasOwnProperty.call(remoteEnv, key);
    if (hasLocal && !hasRemote) {
      onlyLocal.push(key);
      continue;
    }
    if (!hasLocal && hasRemote) {
      onlyRemote.push(key);
      continue;
    }
    if (localEnv[key] !== remoteEnv[key]) {
      different.push(key);
    }
  }

  return { onlyLocal, onlyRemote, different };
}

function main() {
  const sshTarget = getDeploySshTarget();
  const sshPort = getDeployPort();
  const appDir = getDeployAppDir();
  const localEnvPath = getLocalEnvSourceFile();
  const localEnv = parseEnvContent(fs.readFileSync(localEnvPath, 'utf8'));

  const sshArgs = [];
  if (sshPort) {
    sshArgs.push('-p', sshPort);
  }
  sshArgs.push(sshTarget, `cat ${appDir}/.env`);
  const remoteContent = runCapture('ssh', sshArgs);
  const remoteEnv = parseEnvContent(remoteContent);

  const diff = diffEnvs(localEnv, remoteEnv);

  console.log(`[compare-env] origem local: ${localEnvPath}`);
  console.log(`[compare-env] alvo remoto: ${sshTarget}:${appDir}/.env`);

  if (!diff.onlyLocal.length && !diff.onlyRemote.length && !diff.different.length) {
    console.log('[compare-env] .env local e remoto estão idênticos.');
    return;
  }

  if (diff.onlyLocal.length) {
    console.log('[compare-env] Apenas no local:');
    for (const key of diff.onlyLocal) console.log(`  - ${key}`);
  }

  if (diff.onlyRemote.length) {
    console.log('[compare-env] Apenas no remoto:');
    for (const key of diff.onlyRemote) console.log(`  - ${key}`);
  }

  if (diff.different.length) {
    console.log('[compare-env] Com valores diferentes:');
    for (const key of diff.different) console.log(`  - ${key}`);
  }

  process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error('[compare-env] Falha na comparação:', error?.message || error);
  process.exitCode = 1;
}
