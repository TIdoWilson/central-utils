import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(APP_ROOT, '.env') });

function findCommand(command) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [command], {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) return null;
  const line = String(result.stdout || '').split(/\r?\n/).find(Boolean);
  return line ? line.trim() : null;
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: false,
    env: process.env,
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

function getHapiCommand() {
  return process.env.HOSTINGER_HAPI_BIN || findCommand('hapi');
}

function getSshHost() {
  const target = String(process.env.DEPLOY_VPS_SSH_TARGET || '').trim();
  if (!target) return '';
  const at = target.lastIndexOf('@');
  return at >= 0 ? target.slice(at + 1) : target;
}

function parseVmList(rawJson) {
  const data = JSON.parse(rawJson);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function extractIpv4(vm) {
  const pools = [
    vm?.ipv4,
    vm?.ipv4_addresses,
    vm?.network?.ipv4,
    vm?.network_interfaces,
  ].filter(Boolean);

  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const entry of pool) {
      const candidate = entry?.ip_address || entry?.address || entry?.ip || entry?.public_ip;
      if (candidate) return String(candidate);
    }
  }

  return '';
}

function extractHostname(vm) {
  return String(vm?.hostname || vm?.name || vm?.label || '').trim();
}

function resolveVmId(vms) {
  const explicitId = String(process.env.HOSTINGER_VM_ID || '').trim();
  if (explicitId) return explicitId;

  const explicitHostname = String(process.env.HOSTINGER_VM_HOSTNAME || '').trim().toLowerCase();
  if (explicitHostname) {
    const found = vms.find((vm) => extractHostname(vm).toLowerCase() === explicitHostname);
    if (found?.id) return String(found.id);
  }

  const sshHost = getSshHost();
  if (sshHost) {
    const found = vms.find((vm) => {
      return extractIpv4(vm) === sshHost || extractHostname(vm).toLowerCase() === sshHost.toLowerCase();
    });
    if (found?.id) return String(found.id);
  }

  return '';
}

function main() {
  const hapi = getHapiCommand();
  if (!hapi) {
    throw new Error('CLI "hapi" não encontrada. Instale a Hostinger API CLI e defina HAPI_API_TOKEN.');
  }

  if (!process.env.HAPI_API_TOKEN) {
    throw new Error('HAPI_API_TOKEN não configurado no ambiente local.');
  }

  const rawList = runCapture(hapi, ['vps', 'vm', 'list', '--format', 'json']);
  const vms = parseVmList(rawList);
  if (!vms.length) {
    throw new Error('Nenhuma VPS retornada pela Hostinger API.');
  }

  const vmId = resolveVmId(vms);
  if (!vmId) {
    throw new Error('Não foi possível determinar HOSTINGER_VM_ID. Configure HOSTINGER_VM_ID ou HOSTINGER_VM_HOSTNAME.');
  }

  const rawVm = runCapture(hapi, ['vps', 'vm', 'get', vmId, '--format', 'json']);
  const vm = JSON.parse(rawVm);
  const hostname = extractHostname(vm);
  const ipv4 = extractIpv4(vm);

  console.log(`[hostinger] vm_id=${vmId}`);
  if (hostname) console.log(`[hostinger] hostname=${hostname}`);
  if (ipv4) console.log(`[hostinger] ipv4=${ipv4}`);
  console.log(JSON.stringify(vm, null, 2));
}

try {
  main();
} catch (error) {
  console.error('[hostinger] Falha ao consultar VPS:', error?.message || error);
  process.exitCode = 1;
}
