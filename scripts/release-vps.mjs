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

function capture(command, args, options = {}) {
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

  return String(result.stdout || '').trim();
}

function getCurrentBranch() {
  return capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
}

function ensureCleanWorktree() {
  const status = capture('git', ['status', '--porcelain']);
  if (status) {
    throw new Error('Worktree com alterações locais. Faça commit/stash antes do release.');
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

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function main() {
  const branch = process.argv[2] || getCurrentBranch();
  const sshTarget = getDeploySshTarget();
  const sshPort = getDeployPort();
  const appDir = getDeployAppDir();

  ensureCleanWorktree();

  console.log(`[release] branch=${branch}`);
  if (process.env.HAPI_API_TOKEN) {
    console.log('[release] hostinger predeploy check');
    run('node', ['scripts/hostinger-predeploy-check.mjs']);
  }
  console.log('[release] git push');
  run('git', ['push', 'origin', branch]);

  console.log('[release] sync env');
  run('node', ['scripts/sync-env-vps.mjs']);

  const remoteCommand = `cd ${shellEscape(appDir)} && APP_DIR=${shellEscape(appDir)} bash scripts/deploy-vps.sh ${shellEscape(branch)}`;
  const sshArgs = [];
  if (sshPort) {
    sshArgs.push('-p', sshPort);
  }
  sshArgs.push(sshTarget, remoteCommand);

  console.log(`[release] ssh ${sshTarget}`);
  run('ssh', sshArgs);

  if (process.env.HAPI_API_TOKEN) {
    console.log('[release] hostinger postdeploy check');
    run('node', ['scripts/hostinger-postdeploy-check.mjs']);
  }
}

try {
  main();
} catch (error) {
  console.error('[release] Falha no release:', error?.message || error);
  process.exitCode = 1;
}
