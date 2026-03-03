import {
  ensureHostingerSetup,
  extractHostname,
  extractIpv4,
  loadResolvedVm,
} from './lib/hostinger.mjs';

function main() {
  ensureHostingerSetup();
  const { vmId, vm } = loadResolvedVm();
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
