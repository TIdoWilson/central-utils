const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_PROJECT_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_CCT_DIR = path.join(DEFAULT_PROJECT_ROOT, 'data', 'cct');
const DEFAULT_CNPJ_FILE = path.join(DEFAULT_CCT_DIR, 'CNPJ.txt');
const DEFAULT_REQUESTERS_FILE = path.join(DEFAULT_CCT_DIR, 'CNPJ_requisitantes.txt');
const DEFAULT_HISTORY_FILE = path.join(DEFAULT_CCT_DIR, 'historico_cct.log');
const DEFAULT_LEGACY_MTE_SCRIPT = 'C:\\Users\\Usuario\\Documents\\SCRIPTS TESTE\\MTE.py';

function normalizeDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function formatTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function sanitizeHistoryField(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

function serializeCnpjEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeDigits(entry?.cnpj || entry))
    .filter((digits) => digits.length === 14)
    .join('\n');
}

function resolveExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (_) {}
  }
  return candidates.find(Boolean) || null;
}

function splitHistoryLine(line) {
  const parts = String(line || '').split('\t');
  if (parts.length < 3) return null;
  const [timestamp, cnpj, status, maybeUser, ...rest] = parts;
  const hasExplicitUser = parts.length >= 5;
  const user = hasExplicitUser ? String(maybeUser || '').trim() : '';
  const details = (hasExplicitUser ? rest : [maybeUser, ...rest]).join('\t').trim();
  return {
    timestamp: String(timestamp || '').trim(),
    cnpj: String(cnpj || '').trim(),
    status: String(status || '').trim(),
    user,
    details,
    raw: String(line || '').trim(),
  };
}

function createCctIntakeService(deps = {}) {
  const projectRoot = path.resolve(deps.projectRoot || DEFAULT_PROJECT_ROOT);
  const cctDir = path.resolve(deps.cctDir || path.join(projectRoot, 'data', 'cct'));
  const cnpjFilePath = path.resolve(deps.cnpjFilePath || DEFAULT_CNPJ_FILE);
  const requestersFilePath = path.resolve(deps.requestersFilePath || DEFAULT_REQUESTERS_FILE);
  const historyFilePath = path.resolve(deps.historyFilePath || DEFAULT_HISTORY_FILE);
  const pythonBin = deps.pythonBin || process.env.CCT_PYTHON_BIN || process.env.PYTHON_BIN || 'python';
  const mteScriptPath = resolveExistingPath([
    deps.mteScriptPath,
    process.env.CCT_MTE_SCRIPT_PATH,
    path.join(cctDir, 'MTE.py'),
    DEFAULT_LEGACY_MTE_SCRIPT,
  ]);

  let activeProcess = null;
  let scheduledTimer = null;
  let rerunRequested = false;
  let currentRunStartedAt = null;
  let currentRunCnpj = null;
  let currentRunQueue = new Map();
  let stopRequested = false;
  let exclusiveRestoreEntries = null;
  let exclusiveRunPending = false;
  let exclusiveRunActive = false;
  const loggedStatusesThisRun = new Set();
  let enqueueChain = Promise.resolve();

  async function ensureStorage() {
    await fs.promises.mkdir(path.dirname(cnpjFilePath), { recursive: true });
    await fs.promises.mkdir(path.dirname(requestersFilePath), { recursive: true });
    await fs.promises.mkdir(path.dirname(historyFilePath), { recursive: true });
  }

  async function readRequesterMap() {
    try {
      const content = await fs.promises.readFile(requestersFilePath, 'utf8');
      const map = new Map();
      content.split(/\r?\n/).forEach((line) => {
        const parts = String(line || '').split('\t');
        const digits = normalizeDigits(parts[0] || '');
        if (digits.length !== 14) return;
        map.set(digits, sanitizeHistoryField(parts[1] || ''));
      });
      return map;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return new Map();
      }
      throw error;
    }
  }

  async function readCurrentQueueEntries() {
    try {
      const content = await fs.promises.readFile(cnpjFilePath, 'utf8');
      const requesterMap = await readRequesterMap();
      const seen = new Set();
      const items = [];
      content.split(/\r?\n/).forEach((line) => {
        const digits = normalizeDigits(line);
        if (digits.length !== 14 || seen.has(digits)) return;
        seen.add(digits);
        items.push({
          cnpj: digits,
          user: requesterMap.get(digits) || '',
        });
      });
      return items;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async function readCurrentCnpjs() {
    const entries = await readCurrentQueueEntries();
    return entries.map((entry) => entry.cnpj);
  }

  async function appendRequesterEntry(cnpj, user) {
    await ensureStorage();
    const line = user
      ? `${normalizeDigits(cnpj)}\t${sanitizeHistoryField(user)}`
      : normalizeDigits(cnpj);
    await fs.promises.appendFile(requestersFilePath, `${line}\n`, 'utf8');
  }

  async function writeAutomaticQueue(cnpjs) {
    await ensureStorage();
    const serialized = serializeCnpjEntries(cnpjs);
    await fs.promises.writeFile(cnpjFilePath, serialized ? `${serialized}\n` : '', 'utf8');
  }

  async function appendHistoryEntry(cnpj, status, details = '', user = '') {
    await ensureStorage();
    const line = [
      formatTimestamp(new Date()),
      normalizeDigits(cnpj),
      sanitizeHistoryField(status),
      sanitizeHistoryField(user),
      sanitizeHistoryField(details),
    ].join('\t');
    await fs.promises.appendFile(historyFilePath, `${line}\n`, 'utf8');
  }

  async function readHistory(limit = 30) {
    try {
      const content = await fs.promises.readFile(historyFilePath, 'utf8');
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(splitHistoryLine)
        .filter(Boolean);

      const parsed = lines.slice(-Math.max(1, Number(limit) || 30)).reverse();
      return parsed;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  function scheduleRun() {
    if (activeProcess) {
      rerunRequested = true;
      return;
    }

    if (scheduledTimer) {
      return;
    }

    scheduledTimer = setTimeout(() => {
      scheduledTimer = null;
      startRun().catch((error) => {
        console.error('[CCT] Falha ao disparar MTE.py:', error?.message || error);
        if ((exclusiveRunPending || exclusiveRunActive) && Array.isArray(exclusiveRestoreEntries)) {
          void restoreAutomaticQueueIfNeeded().catch((restoreError) => {
            console.error('[CCT] Falha ao restaurar a fila apos erro de disparo:', restoreError?.message || restoreError);
          });
        }
      });
    }, 500);
  }

  async function stopActiveRun() {
    if (scheduledTimer) {
      clearTimeout(scheduledTimer);
      scheduledTimer = null;
    }

    rerunRequested = false;
    stopRequested = true;

    if (activeProcess && typeof activeProcess.kill === 'function') {
      try {
        activeProcess.kill();
      } catch (error) {
        console.warn('[CCT] Nao foi possivel encerrar o processo ativo:', error?.message || error);
      }
    }

    return {
      stopped: !!activeProcess,
    };
  }

  function ensureExclusiveRestoreQueue(currentEntries, cnpj) {
    if (!exclusiveRestoreEntries) {
      exclusiveRestoreEntries = (Array.isArray(currentEntries) ? currentEntries : [])
        .map((entry) => normalizeDigits(entry?.cnpj || entry))
        .filter((digits) => digits.length === 14);
    }

    if (cnpj && !exclusiveRestoreEntries.includes(cnpj)) {
      exclusiveRestoreEntries.push(cnpj);
    }
  }

  async function restoreAutomaticQueueIfNeeded() {
    if (!Array.isArray(exclusiveRestoreEntries)) {
      return false;
    }

    const restoreEntries = exclusiveRestoreEntries;
    await writeAutomaticQueue(restoreEntries);
    exclusiveRestoreEntries = null;
    exclusiveRunActive = false;
    exclusiveRunPending = false;
    return true;
  }

  function registerStatus(cnpj, status, details) {
    const digits = normalizeDigits(cnpj);
    if (!digits) return;

    const key = `${digits}:${status}`;
    if (loggedStatusesThisRun.has(key)) return;
    loggedStatusesThisRun.add(key);

    const user = currentRunQueue.get(digits) || '';

    void appendHistoryEntry(digits, status, details, user).catch((error) => {
      console.error('[CCT] Falha ao registrar historico:', error?.message || error);
    });
  }

  function handleStdoutLine(line) {
    const text = String(line || '').trim();
    if (!text) return;

    const startMatch = text.match(/PROCESSANDO CNPJ\s+(\d{14})/i);
    if (startMatch) {
      currentRunCnpj = startMatch[1];
      return;
    }

    const explicitCnpjMatch = text.match(/\[(\d{14})\]/);
    if (explicitCnpjMatch) {
      currentRunCnpj = explicitCnpjMatch[1];
    }

    if (/Nenhum registro encontrado/i.test(text)) {
      registerStatus(currentRunCnpj, 'nao retornou nenhuma convencao', text);
      return;
    }

    const errorMatch = text.match(/Erro no CNPJ\s+(\d{14})\s*[:\-]?\s*(.*)$/i);
    if (errorMatch) {
      const cnpj = errorMatch[1] || currentRunCnpj;
      const details = errorMatch[2] || text;
      registerStatus(cnpj, 'erro na busca', details);
      return;
    }

    if (/Falha no download/i.test(text) || /Não consegui baixar/i.test(text) || /Nao consegui baixar/i.test(text)) {
      registerStatus(currentRunCnpj, 'erro na busca', text);
      return;
    }

    if (/Download salvo:/i.test(text)) {
      registerStatus(currentRunCnpj, 'download realizado', text);
    }
  }

  async function startRun() {
    if (activeProcess) {
      rerunRequested = true;
      return { started: false, reason: 'process already running' };
    }

    const pendingEntries = await readCurrentQueueEntries();
    const pendingCnpjs = pendingEntries.map((entry) => entry.cnpj);
    if (!pendingCnpjs.length) {
      return { started: false, reason: 'empty queue' };
    }

    if (!mteScriptPath || !fs.existsSync(mteScriptPath)) {
      throw new Error('Nao foi possivel localizar o MTE.py para processamento.');
    }

    await ensureStorage();
    currentRunStartedAt = new Date();
    currentRunCnpj = null;
    currentRunQueue = new Map(pendingEntries.map((entry) => [entry.cnpj, entry.user]));
    loggedStatusesThisRun.clear();

    const args = [mteScriptPath, '--headless'];
    const child = spawn(pythonBin, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    activeProcess = child;

    child.stdout.on('data', (buffer) => {
      const text = buffer.toString('utf8');
      text.split(/\r?\n/).forEach(handleStdoutLine);
    });

    child.stderr.on('data', (buffer) => {
      const text = buffer.toString('utf8');
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed) return;
        if (/Erro no CNPJ/i.test(trimmed)) {
          const match = trimmed.match(/Erro no CNPJ\s+(\d{14})/i);
          registerStatus(match?.[1] || currentRunCnpj, 'erro na busca', trimmed);
          return;
        }
        if (/Falha/i.test(trimmed)) {
          registerStatus(currentRunCnpj, 'erro na busca', trimmed);
        }
      });
    });

    child.on('error', (error) => {
      const message = error?.message || String(error || 'Erro ao iniciar MTE.');
      console.error('[CCT] Falha ao iniciar MTE.py:', message);
      activeProcess = null;
      rerunRequested = true;
    });

    child.on('close', (code) => {
      const hadRerun = rerunRequested;
      const wasStopRequested = stopRequested;
      const shouldStartExclusiveRun = exclusiveRunPending;
      const shouldRestoreAutomaticQueue = exclusiveRunActive;
      activeProcess = null;
      currentRunStartedAt = null;
      currentRunCnpj = null;
      currentRunQueue = new Map();
      loggedStatusesThisRun.clear();
      stopRequested = false;

      if (code !== 0) {
        console.warn(`[CCT] MTE.py finalizou com codigo ${code}`);
      }

      if (shouldStartExclusiveRun) {
        exclusiveRunPending = false;
        exclusiveRunActive = true;
        rerunRequested = false;
        scheduleRun();
        return;
      }

      if (shouldRestoreAutomaticQueue) {
        void restoreAutomaticQueueIfNeeded().catch((error) => {
            console.error('[CCT] Falha ao restaurar a fila automatica:', error?.message || error);
          });
        return;
      }

      if (hadRerun && !wasStopRequested) {
        rerunRequested = false;
        scheduleRun();
      }
    });

    return { started: true };
  }

  async function doEnqueueCnpj(rawCnpj, rawUser = '', options = {}) {
    await ensureStorage();
    const cnpj = normalizeDigits(rawCnpj);
    if (cnpj.length !== 14) {
      const error = new Error('Informe um CNPJ valido com 14 digitos.');
      error.statusCode = 400;
      throw error;
    }

    const exclusive = !!options.exclusive;
    const user = sanitizeHistoryField(rawUser);
    const current = await readCurrentQueueEntries();
    const knownEntries = exclusiveRestoreEntries || current;

    if (knownEntries.some((entry) => normalizeDigits(entry?.cnpj || entry) === cnpj)) {
      return {
        ok: true,
        duplicate: true,
        cnpj,
        message: 'CNPJ ja existe na lista.',
        queueSize: knownEntries.length,
      };
    }

    if (exclusive) {
      ensureExclusiveRestoreQueue(current, cnpj);
      exclusiveRunPending = true;
      exclusiveRunActive = false;
      await appendRequesterEntry(cnpj, user);
      await writeAutomaticQueue([cnpj]);
      if (activeProcess) {
        await stopActiveRun();
      } else {
        exclusiveRunPending = false;
        exclusiveRunActive = true;
        scheduleRun();
      }
      return {
        ok: true,
        duplicate: false,
        cnpj,
        message: 'CNPJ incluido para processamento exclusivo.',
        queueSize: 1,
      };
    }

    const payload = current.concat({ cnpj, user });
    await writeAutomaticQueue(payload);
    await appendRequesterEntry(cnpj, user);
    scheduleRun();

    return {
      ok: true,
      duplicate: false,
      cnpj,
      message: 'CNPJ incluido na fila do MTE.',
      queueSize: payload.length,
    };
  }

  function enqueueCnpj(rawCnpj, rawUser = '', options = {}) {
    const task = enqueueChain.then(() => doEnqueueCnpj(rawCnpj, rawUser, options));
    enqueueChain = task.catch(() => {});
    return task;
  }

  function getStatus() {
    return {
      running: !!activeProcess,
      scheduled: !!scheduledTimer,
      rerunRequested,
      startedAt: currentRunStartedAt ? currentRunStartedAt.toISOString() : null,
      currentCnpj: currentRunCnpj,
      scriptPath: mteScriptPath,
      cnpjFilePath,
      requestersFilePath,
      historyFilePath,
    };
  }

  return {
    enqueueCnpj,
    readHistory,
    getStatus,
    startRun,
    appendHistoryEntry,
  };
}

module.exports = {
  createCctIntakeService,
};
