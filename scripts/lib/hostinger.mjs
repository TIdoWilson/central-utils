import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const APP_ROOT = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(APP_ROOT, '.env') });

export function findCommand(command) {
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

export function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: false,
    env: process.env,
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

export function getHapiCommand() {
  return process.env.HOSTINGER_HAPI_BIN || findCommand('hapi');
}

export function getSshHost() {
  const target = String(process.env.DEPLOY_VPS_SSH_TARGET || '').trim();
  if (!target) return '';
  const at = target.lastIndexOf('@');
  return at >= 0 ? target.slice(at + 1) : target;
}

export function parseVmList(rawJson) {
  const data = JSON.parse(rawJson);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export function extractIpv4(vm) {
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

export function extractHostname(vm) {
  return String(vm?.hostname || vm?.name || vm?.label || '').trim();
}

export function resolveVmId(vms) {
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

export function getRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} não configurado no ambiente local.`);
  }
  return value;
}

export function ensureHostingerSetup() {
  const hapi = getHapiCommand();
  if (!hapi) {
    throw new Error('CLI Hostinger não encontrada. Configure HOSTINGER_HAPI_BIN ou adicione "hapi" ao PATH.');
  }

  getRequiredEnv('HAPI_API_TOKEN');
  return hapi;
}

export function loadVmList(hapi) {
  const rawList = runCapture(hapi, ['vps', 'vm', 'list', '--format', 'json']);
  const vms = parseVmList(rawList);
  if (!vms.length) {
    throw new Error('Nenhuma VPS retornada pela Hostinger API.');
  }
  return vms;
}

export function loadVm(hapi, vmId) {
  const rawVm = runCapture(hapi, ['vps', 'vm', 'get', vmId, '--format', 'json']);
  return JSON.parse(rawVm);
}

export function loadResolvedVm(hapi = ensureHostingerSetup()) {
  const vms = loadVmList(hapi);
  const vmId = resolveVmId(vms);
  if (!vmId) {
    throw new Error('Não foi possível determinar HOSTINGER_VM_ID. Configure HOSTINGER_VM_ID ou HOSTINGER_VM_HOSTNAME.');
  }

  const vm = loadVm(hapi, vmId);
  return { hapi, vmId, vm };
}

export function loadVmMetrics(hapi, vmId, dateFrom, dateTo) {
  const raw = runCapture(hapi, [
    'vps',
    'vm',
    'metrics',
    vmId,
    '--date-from',
    dateFrom,
    '--date-to',
    dateTo,
    '--format',
    'json',
  ]);

  return JSON.parse(raw);
}

export function loadFirewall(hapi, firewallId) {
  const raw = runCapture(hapi, ['vps', 'firewall', 'get', firewallId, '--format', 'json']);
  return JSON.parse(raw);
}

export function getLatestMetricValue(metric) {
  const usage = metric?.usage;
  if (!usage || typeof usage !== 'object') return null;
  const timestamps = Object.keys(usage).sort((a, b) => Number(a) - Number(b));
  if (!timestamps.length) return null;
  return Number(usage[timestamps[timestamps.length - 1]]);
}

export function toFixedNumber(value, fractionDigits = 2) {
  return Number(value).toFixed(fractionDigits);
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  const fractionDigits = size >= 10 || index === 0 ? 0 : 1;
  return `${toFixedNumber(size, fractionDigits)} ${units[index]}`;
}

export function getRequiredTcpPorts() {
  const fromEnv = String(process.env.HOSTINGER_REQUIRED_TCP_PORTS || process.env.DEPLOY_VPS_PORT || '22').trim();
  return fromEnv
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => String(Number(value)))
    .filter((value) => value !== '0' && value !== 'NaN');
}

export function getHealthThresholds(vm) {
  const diskBytes = Number(vm?.disk || 0) * 1024 * 1024;
  const memoryBytes = Number(vm?.memory || 0) * 1024 * 1024;

  return {
    cpuMaxPercent: Number(process.env.HOSTINGER_HEALTH_CPU_MAX_PERCENT || 95),
    ramMaxPercent: Number(process.env.HOSTINGER_HEALTH_RAM_MAX_PERCENT || 95),
    diskMaxPercent: Number(process.env.HOSTINGER_HEALTH_DISK_MAX_PERCENT || 95),
    minDiskFreeBytes: Number(process.env.HOSTINGER_HEALTH_MIN_DISK_FREE_BYTES || 1024 * 1024 * 1024),
    diskBytes,
    memoryBytes,
  };
}
