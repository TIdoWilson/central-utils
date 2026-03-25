import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const { createCctIntakeService } = require('../src/services/cct-intake.service.js');
const { createCctEmailService } = require('../src/services/cct-email.service.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(APP_ROOT, '.env') });

process.env.CCT_AUTO_FULL_QUEUE_ENABLED = '0';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRunCompletion(service, timeoutMs = 12 * 60 * 60 * 1000) {
  const startedAt = Date.now();
  let seenRunning = false;

  while (Date.now() - startedAt < timeoutMs) {
    const status = service.getStatus();
    if (status.running) {
      seenRunning = true;
    } else if (seenRunning) {
      return status;
    }
    await sleep(5000);
  }

  throw new Error('Timeout aguardando conclusao da execucao completa.');
}

async function main() {
  const emailService = createCctEmailService({
    projectRoot: APP_ROOT,
    emailListPath: path.join(APP_ROOT, 'data', 'cct', 'email.txt'),
    siteUrl: process.env.CCT_SITE_URL || 'http://localhost:3000/cct',
  });

  const intakeService = createCctIntakeService({
    projectRoot: APP_ROOT,
    cctDir: path.join(APP_ROOT, 'data', 'cct'),
    emailService,
    autoBootstrapPendingQueue: false,
    autoBootstrapFullQueueSchedule: false,
  });

  const result = await intakeService.startFullQueueRun();
  if (!result.started) {
    console.log(`[cct-run-full-queue] Nao iniciou: ${result.reason || 'desconhecido'}`);
    return;
  }

  console.log(`[cct-run-full-queue] Execucao iniciada com ${result.queueSize} CNPJs.`);
  const finalStatus = await waitForRunCompletion(intakeService);
  console.log('[cct-run-full-queue] Execucao finalizada.');
  console.log(JSON.stringify(finalStatus, null, 2));
}

main().catch((error) => {
  console.error('[cct-run-full-queue] Erro:', error?.message || error);
  process.exitCode = 1;
});
