import {
  ensureHostingerSetup,
  extractHostname,
  extractIpv4,
  formatBytes,
  getHealthThresholds,
  getLatestMetricValue,
  loadResolvedVm,
  loadVmMetrics,
  toFixedNumber,
} from './lib/hostinger.mjs';

function toIsoTime(minutesAgo = 0) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function getPercent(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return (part / total) * 100;
}

function main() {
  ensureHostingerSetup();
  const { hapi, vmId, vm } = loadResolvedVm();
  const metrics = loadVmMetrics(hapi, vmId, toIsoTime(30), toIsoTime(0));
  const thresholds = getHealthThresholds(vm);

  const cpuUsage = getLatestMetricValue(metrics.cpu_usage);
  const ramUsageBytes = getLatestMetricValue(metrics.ram_usage);
  const diskUsageBytes = getLatestMetricValue(metrics.disk_space);
  const incomingTrafficBytes = getLatestMetricValue(metrics.incoming_traffic);
  const outgoingTrafficBytes = getLatestMetricValue(metrics.outgoing_traffic);
  const uptimeSeconds = getLatestMetricValue(metrics.uptime);

  const ramUsagePercent = getPercent(ramUsageBytes, thresholds.memoryBytes);
  const diskUsagePercent = getPercent(diskUsageBytes, thresholds.diskBytes);
  const diskFreeBytes = Number.isFinite(thresholds.diskBytes) ? thresholds.diskBytes - (diskUsageBytes || 0) : null;

  const failures = [];
  if (String(vm.state || '').toLowerCase() !== 'running') {
    failures.push(`estado da VPS é "${vm.state}"`);
  }
  if (cpuUsage !== null && cpuUsage > thresholds.cpuMaxPercent) {
    failures.push(`CPU em ${toFixedNumber(cpuUsage)}% acima do limite ${thresholds.cpuMaxPercent}%`);
  }
  if (ramUsagePercent !== null && ramUsagePercent > thresholds.ramMaxPercent) {
    failures.push(`RAM em ${toFixedNumber(ramUsagePercent)}% acima do limite ${thresholds.ramMaxPercent}%`);
  }
  if (diskUsagePercent !== null && diskUsagePercent > thresholds.diskMaxPercent) {
    failures.push(`disco em ${toFixedNumber(diskUsagePercent)}% acima do limite ${thresholds.diskMaxPercent}%`);
  }
  if (diskFreeBytes !== null && diskFreeBytes < thresholds.minDiskFreeBytes) {
    failures.push(`espaço livre ${formatBytes(diskFreeBytes)} abaixo do mínimo ${formatBytes(thresholds.minDiskFreeBytes)}`);
  }

  console.log(`[hostinger:health] vm_id=${vmId}`);
  console.log(`[hostinger:health] hostname=${extractHostname(vm) || '-'}`);
  console.log(`[hostinger:health] ipv4=${extractIpv4(vm) || '-'}`);
  console.log(`[hostinger:health] state=${vm.state || '-'}`);
  if (cpuUsage !== null) console.log(`[hostinger:health] cpu=${toFixedNumber(cpuUsage)}%`);
  if (ramUsageBytes !== null) {
    console.log(
      `[hostinger:health] ram=${formatBytes(ramUsageBytes)}${ramUsagePercent !== null ? ` (${toFixedNumber(ramUsagePercent)}%)` : ''}`,
    );
  }
  if (diskUsageBytes !== null) {
    console.log(
      `[hostinger:health] disk=${formatBytes(diskUsageBytes)}${diskUsagePercent !== null ? ` (${toFixedNumber(diskUsagePercent)}%)` : ''}`,
    );
  }
  if (diskFreeBytes !== null) console.log(`[hostinger:health] disk_free=${formatBytes(diskFreeBytes)}`);
  if (incomingTrafficBytes !== null) console.log(`[hostinger:health] incoming=${formatBytes(incomingTrafficBytes)}`);
  if (outgoingTrafficBytes !== null) console.log(`[hostinger:health] outgoing=${formatBytes(outgoingTrafficBytes)}`);
  if (uptimeSeconds !== null) console.log(`[hostinger:health] uptime=${Math.round(uptimeSeconds)}s`);

  if (failures.length) {
    throw new Error(failures.join(' | '));
  }

  console.log('[hostinger:health] VPS saudável para deploy.');
}

try {
  main();
} catch (error) {
  console.error('[hostinger:health] Falha na checagem de saúde:', error?.message || error);
  process.exitCode = 1;
}
