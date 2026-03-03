import {
  ensureHostingerSetup,
  getRequiredTcpPorts,
  loadFirewall,
  loadResolvedVm,
} from './lib/hostinger.mjs';

function normalizeProtocol(protocol) {
  return String(protocol || '').trim().toLowerCase();
}

function normalizePort(port) {
  return String(port || '').trim();
}

function isAcceptRule(rule) {
  return String(rule?.action || '').trim().toLowerCase() === 'accept';
}

function matchesPort(rulePort, expectedPort) {
  if (!rulePort || !expectedPort) return false;
  const normalized = normalizePort(rulePort).toLowerCase();
  return normalized === expectedPort || normalized === 'any' || normalized === `${expectedPort}-${expectedPort}`;
}

function main() {
  ensureHostingerSetup();
  const { hapi, vmId, vm } = loadResolvedVm();
  const firewallId = String(vm?.firewall_group_id || '').trim();
  if (!firewallId) {
    console.log(`[hostinger:firewall] vm_id=${vmId}`);
    console.log('[hostinger:firewall] aviso: VPS sem firewall_group_id associado na API da Hostinger. Checagem de firewall será ignorada.');
    return;
  }

  const firewall = loadFirewall(hapi, firewallId);
  const rules = Array.isArray(firewall?.rules) ? firewall.rules : [];
  const requiredPorts = getRequiredTcpPorts();
  const missingPorts = requiredPorts.filter((requiredPort) => {
    return !rules.some((rule) => {
      if (!isAcceptRule(rule)) return false;
      const protocol = normalizeProtocol(rule.protocol);
      if (protocol !== 'tcp' && protocol !== 'any') return false;
      return matchesPort(rule.port, requiredPort);
    });
  });

  console.log(`[hostinger:firewall] vm_id=${vmId}`);
  console.log(`[hostinger:firewall] firewall_id=${firewallId}`);
  console.log(`[hostinger:firewall] name=${firewall?.name || '-'}`);
  console.log(`[hostinger:firewall] synced=${firewall?.is_synced === true ? 'yes' : 'no'}`);
  console.log(`[hostinger:firewall] required_tcp_ports=${requiredPorts.join(',') || '-'}`);
  console.log(`[hostinger:firewall] rules=${rules.length}`);

  if (firewall?.is_synced !== true) {
    throw new Error(`firewall ${firewallId} ainda não está sincronizado na Hostinger.`);
  }

  if (missingPorts.length) {
    throw new Error(`portas TCP obrigatórias ausentes no firewall: ${missingPorts.join(', ')}`);
  }

  console.log('[hostinger:firewall] Firewall compatível com o deploy.');
}

try {
  main();
} catch (error) {
  console.error('[hostinger:firewall] Falha na checagem de firewall:', error?.message || error);
  process.exitCode = 1;
}
