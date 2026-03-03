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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: APP_ROOT,
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falhou com exit code ${result.status}`);
  }
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

function getEnvSourceFile() {
  const configured = String(process.env.DEPLOY_VPS_ENV_SOURCE || '.env.vps').trim();
  const fullPath = path.resolve(APP_ROOT, configured);
  if (fs.existsSync(fullPath)) return fullPath;

  const fallback = path.resolve(APP_ROOT, '.env');
  if (fs.existsSync(fallback)) return fallback;

  throw new Error(`Arquivo de ambiente não encontrado. Esperado: ${fullPath} ou ${fallback}`);
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function main() {
  const sshTarget = getDeploySshTarget();
  const sshPort = getDeployPort();
  const appDir = getDeployAppDir();
  const envSource = getEnvSourceFile();
  const remoteTmpPath = `${appDir}/.env.upload`;
  const remoteEnvPath = `${appDir}/.env`;

  console.log(`[sync-env] origem=${envSource}`);
  console.log(`[sync-env] destino=${sshTarget}:${remoteEnvPath}`);

  const scpArgs = [];
  if (sshPort) {
    scpArgs.push('-P', sshPort);
  }
  scpArgs.push(envSource, `${sshTarget}:${remoteTmpPath}`);
  run('scp', scpArgs);

  const sshArgs = [];
  if (sshPort) {
    sshArgs.push('-p', sshPort);
  }
  const remoteCommand = [
    `mkdir -p ${shellEscape(appDir)}`,
    `if [ -f ${shellEscape(remoteEnvPath)} ]; then cp ${shellEscape(remoteEnvPath)} ${shellEscape(`${remoteEnvPath}.bak`)}; fi`,
    `mv ${shellEscape(remoteTmpPath)} ${shellEscape(remoteEnvPath)}`,
    `chmod 600 ${shellEscape(remoteEnvPath)}`,
  ].join(' && ');
  sshArgs.push(sshTarget, remoteCommand);
  run('ssh', sshArgs);

  console.log('[sync-env] .env da VPS sincronizado com sucesso.');
}

try {
  main();
} catch (error) {
  console.error('[sync-env] Falha na sincronização:', error?.message || error);
  process.exitCode = 1;
}
