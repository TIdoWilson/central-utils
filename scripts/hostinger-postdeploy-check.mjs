import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(APP_ROOT, '.env') });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: APP_ROOT,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falhou com exit code ${result.status}`);
  }
}

try {
  run('node', ['scripts/hostinger-health.mjs']);
} catch (error) {
  console.error('[hostinger:postdeploy] Falha na checagem pós-deploy:', error?.message || error);
  process.exitCode = 1;
}
