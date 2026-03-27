import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const RUNNER_PATH = path.join(APP_ROOT, 'scripts', 'cct-run-full-queue.mjs');
const LOG_DIR = path.join(APP_ROOT, 'data', 'cct', 'logs');

dotenv.config({ path: path.join(APP_ROOT, '.env') });

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatLocalDate(date) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-');
}

function formatLocalTime(date) {
  return [pad2(date.getHours()), pad2(date.getMinutes())].join(':');
}

function buildTargetDate(rawDate, rawTime) {
  const now = new Date();
  const dateText = String(rawDate || formatLocalDate(now)).trim();
  const timeText = String(rawTime || '09:00').trim();
  const [yearText, monthText, dayText] = dateText.split('-');
  const [hourText, minuteText] = timeText.split(':');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (![year, month, day, hour, minute].every((value) => Number.isInteger(value))) {
    return null;
  }

  const target = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  return target;
}

async function appendLog(filePath, line) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, 'utf8');
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (current === '--date' && next) {
      result.date = next;
      i += 1;
      continue;
    }
    if (current === '--time' && next) {
      result.time = next;
      i += 1;
      continue;
    }
  }
  return result;
}

function logFactory(logFilePath) {
  return async function log(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    try {
      await appendLog(logFilePath, line);
    } catch (error) {
      console.warn('[cct-schedule-test-run] Falha ao escrever log:', error?.message || error);
    }
  };
}

async function runFullQueue(log) {
  await log(`Iniciando runner Node: ${RUNNER_PATH}`);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER_PATH], {
      cwd: APP_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      const text = String(chunk || '').trim();
      if (!text) return;
      text.split(/\r?\n/).forEach((line) => {
        if (line.trim()) {
          void log(`[runner] ${line}`);
        }
      });
    });

    child.stderr.on('data', (chunk) => {
      const text = String(chunk || '').trim();
      if (!text) return;
      text.split(/\r?\n/).forEach((line) => {
        if (line.trim()) {
          void log(`[runner][stderr] ${line}`);
        }
      });
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Runner finalizou com codigo ${code}${signal ? ` (signal ${signal})` : ''}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = buildTargetDate(args.date, args.time);
  const now = new Date();
  const logFilePath = path.join(
    LOG_DIR,
    `cct-test-schedule-${formatLocalDate(now)}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}.log`,
  );
  const log = logFactory(logFilePath);

  if (!target) {
    await log('Parametros invalidos. Use --date YYYY-MM-DD e --time HH:mm.');
    process.exitCode = 1;
    return;
  }

  if (target.getTime() <= now.getTime()) {
    await log(`Horario informado ${target.toLocaleString('pt-BR')} ja passou. Nao foi agendado.`);
    process.exitCode = 1;
    return;
  }

  const delay = target.getTime() - now.getTime();
  await log(`Agendamento Node ativo para ${target.toLocaleString('pt-BR')}.`);
  await log(`Log em: ${logFilePath}`);
  await log(`Runner reaproveitado: ${RUNNER_PATH}`);
  await log(`Disparo em aproximadamente ${(delay / 1000 / 60).toFixed(1)} minutos.`);

  setTimeout(() => {
    void (async () => {
      await log('Horario atingido. Disparando execucao completa da fila CNPJ.');
      try {
        await runFullQueue(log);
        await log('Execucao de teste concluida com sucesso.');
      } catch (error) {
        await log(`Falha na execucao de teste: ${error?.message || error}`);
        process.exitCode = 1;
      }
    })();
  }, delay);
}

main().catch((error) => {
  console.error('[cct-schedule-test-run] Erro:', error?.message || error);
  process.exitCode = 1;
});
