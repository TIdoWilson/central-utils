const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_PROJECT_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_CCT_DIR = path.join(DEFAULT_PROJECT_ROOT, 'data', 'cct');
const DEFAULT_CNPJ_FILE = path.join(DEFAULT_CCT_DIR, 'CNPJ.txt');
const DEFAULT_REQUESTERS_FILE = path.join(DEFAULT_CCT_DIR, 'CNPJ_requisitantes.txt');
const DEFAULT_HISTORY_FILE = path.join(DEFAULT_CCT_DIR, 'historico_cct.log');
const DEFAULT_JSON_DIR = path.join(DEFAULT_CCT_DIR, 'json');
const DEFAULT_LEGACY_MTE_SCRIPT = 'C:\\Users\\Usuario\\Documents\\SCRIPTS TESTE\\MTE.py';
const FULL_QUEUE_SCHEDULE_DAYS = new Set([1, 3]);
const FULL_QUEUE_SCHEDULE_HOUR = 6;
const FULL_QUEUE_SCHEDULE_MINUTE = 0;

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

function envFlagEnabled(name, defaultValue = false) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return defaultValue;
  return !['0', 'false', 'off', 'no', 'nao'].includes(raw);
}

function getNextFullQueueRun(now = new Date()) {
  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(FULL_QUEUE_SCHEDULE_MINUTE, 0, 0);
    candidate.setHours(FULL_QUEUE_SCHEDULE_HOUR, FULL_QUEUE_SCHEDULE_MINUTE, 0, 0);
    candidate.setDate(now.getDate() + offset);
    if (!FULL_QUEUE_SCHEDULE_DAYS.has(candidate.getDay())) continue;
    if (candidate.getTime() > now.getTime()) {
      return candidate;
    }
  }

  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 7);
  fallback.setHours(FULL_QUEUE_SCHEDULE_HOUR, FULL_QUEUE_SCHEDULE_MINUTE, 0, 0);
  return fallback;
}

function createCctIntakeService(deps = {}) {
  const projectRoot = path.resolve(deps.projectRoot || DEFAULT_PROJECT_ROOT);
  const cctDir = path.resolve(deps.cctDir || path.join(projectRoot, 'data', 'cct'));
  const cnpjFilePath = path.resolve(deps.cnpjFilePath || DEFAULT_CNPJ_FILE);
  const requestersFilePath = path.resolve(deps.requestersFilePath || DEFAULT_REQUESTERS_FILE);
  const historyFilePath = path.resolve(deps.historyFilePath || DEFAULT_HISTORY_FILE);
  const jsonDirPath = path.resolve(deps.jsonDirPath || path.join(cctDir, 'json'));
  const pythonBin = deps.pythonBin || process.env.CCT_PYTHON_BIN || process.env.PYTHON_BIN || 'python';
  const emailService = deps.emailService || null;
  const mteScriptPath = resolveExistingPath([
    deps.mteScriptPath,
    process.env.CCT_MTE_SCRIPT_PATH,
    path.join(cctDir, 'MTE.py'),
    DEFAULT_LEGACY_MTE_SCRIPT,
  ]);
  const autoBootstrapFullQueueSchedule = deps.autoBootstrapFullQueueSchedule === undefined
    ? envFlagEnabled('CCT_AUTO_FULL_QUEUE_ENABLED', true)
    : !!deps.autoBootstrapFullQueueSchedule;

  let activeProcess = null;
  let scheduledTimer = null;
  let weeklyScheduleTimer = null;
  let nextFullQueueRunAt = null;
  let rerunRequested = false;
  let fullQueueRunPending = false;
  let currentRunStartedAt = null;
  let currentRunCnpj = null;
  let currentRunQueue = new Map();
  let currentRunSource = 'manual';
  let currentRunNotifyByEmail = false;
  let currentRunJsonBefore = new Set();
  let currentRunHadError = false;
  let currentRunErrors = [];
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
    await fs.promises.mkdir(jsonDirPath, { recursive: true });
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

  async function readHistory(options = 30) {
    const scope = typeof options === 'object'
      ? String(options.scope || 'recent').trim().toLowerCase()
      : 'recent';
    const page = typeof options === 'object' ? Math.max(1, Number(options.page || 1)) : 1;
    const limit = typeof options === 'object'
      ? Math.max(1, Number(options.limit || (scope === 'full' ? 10 : 30)))
      : Math.max(1, Number(options || 30));

    try {
      const content = await fs.promises.readFile(historyFilePath, 'utf8');
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(splitHistoryLine)
        .filter(Boolean)
        .reverse();

      if (typeof options !== 'object') {
        return lines.slice(0, limit);
      }

      if (scope !== 'full') {
        return {
          items: lines.slice(0, limit),
          meta: {
            page: 1,
            perPage: limit,
            totalItems: lines.length,
            totalPages: lines.length ? 1 : 0,
            hasPreviousPage: false,
            hasNextPage: lines.length > limit,
          },
        };
      }

      const totalItems = lines.length;
      const totalPages = totalItems ? Math.ceil(totalItems / limit) : 0;
      const safePage = totalPages ? Math.min(page, totalPages) : 1;
      const start = totalPages ? ((safePage - 1) * limit) : 0;
      const items = lines.slice(start, start + limit);

      return {
        items,
        meta: {
          page: safePage,
          perPage: limit,
          totalItems,
          totalPages,
          hasPreviousPage: safePage > 1 && totalPages > 0,
          hasNextPage: safePage < totalPages,
        },
      };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        if (typeof options !== 'object') return [];
        return {
          items: [],
          meta: {
            page: 1,
            perPage: limit,
            totalItems: 0,
            totalPages: 0,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        };
      }
      throw error;
    }
  }

  async function snapshotJsonNames() {
    try {
      const entries = await fs.promises.readdir(jsonDirPath, { withFileTypes: true });
      return new Set(
        entries
          .filter((entry) => entry.isFile() && /\.json$/i.test(entry.name))
          .map((entry) => entry.name),
      );
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return new Set();
      }
      throw error;
    }
  }

  async function loadConventionsFromJsonNames(beforeNames = new Set()) {
    const currentNames = await snapshotJsonNames();
    const newNames = Array.from(currentNames).filter((name) => !beforeNames.has(name)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const conventions = [];

    for (const fileName of newNames) {
      try {
        const content = await fs.promises.readFile(path.join(jsonDirPath, fileName), 'utf8');
        const parsed = JSON.parse(content);
        conventions.push({
          numeroRegistro: parsed?.numero_registro || parsed?.numeroRegistro || '',
          sindicatosCelebrantes: Array.isArray(parsed?.sindicatos_celebrantes) ? parsed.sindicatos_celebrantes : [],
          dataBase: parsed?.data_base || parsed?.dataBase || '',
          prazoOposicao: parsed?.prazo_oposicao || parsed?.prazoOposicao || {},
        });
      } catch (error) {
        console.warn('[CCT] Falha ao carregar JSON para envio de e-mail:', fileName, error?.message || error);
      }
    }

    return conventions;
  }

  function recordRunError(detail) {
    const text = sanitizeHistoryField(detail);
    if (!text) return;
    currentRunHadError = true;
    if (!currentRunErrors.includes(text) && currentRunErrors.length < 15) {
      currentRunErrors.push(text);
    }
  }

  async function notifyRunOutcome(runContext, code) {
    if (!runContext?.notifyByEmail || !emailService) return;

    const startedAt = runContext.startedAt || new Date();
    const conventions = await loadConventionsFromJsonNames(runContext.jsonBefore || new Set());
    const errorText = [
      code !== 0 ? `MTE.py finalizou com codigo ${code}` : '',
      ...(Array.isArray(runContext.errors) ? runContext.errors : []),
    ].filter(Boolean).join(' | ');

    if (conventions.length) {
      try {
        await emailService.sendScheduledConventionEmail({
          conventions,
          startedAt,
        });
      } catch (error) {
        console.error('[CCT] Falha ao enviar e-mail de convencoes localizadas:', error?.message || error);
      }
    }

    if (code !== 0 || runContext.hadError) {
      try {
        await emailService.sendErrorEmail({
          title: 'Erro na rotina agendada CCT',
          error: errorText || 'Falha nao detalhada.',
          context: runContext.source || 'scheduled-full-queue',
          startedAt,
        });
      } catch (error) {
        console.error('[CCT] Falha ao enviar e-mail de erro da CCT:', error?.message || error);
      }
      return;
    }

    if (!conventions.length) {
      try {
        await emailService.sendNoNewConventionEmail({
          startedAt,
          context: runContext.source || 'scheduled-full-queue',
          details: 'Nenhum novo JSON foi gerado na rodada completa.',
        });
      } catch (error) {
        console.error('[CCT] Falha ao enviar e-mail de nenhuma nova convencao:', error?.message || error);
      }
    }
  }

  function scheduleWeeklyFullQueueRun() {
    if (!autoBootstrapFullQueueSchedule) {
      nextFullQueueRunAt = null;
      if (weeklyScheduleTimer) {
        clearTimeout(weeklyScheduleTimer);
        weeklyScheduleTimer = null;
      }
      return;
    }

    if (weeklyScheduleTimer) {
      clearTimeout(weeklyScheduleTimer);
      weeklyScheduleTimer = null;
    }

    nextFullQueueRunAt = getNextFullQueueRun(new Date());
    const delay = Math.max(1000, nextFullQueueRunAt.getTime() - Date.now());
    weeklyScheduleTimer = setTimeout(() => {
      weeklyScheduleTimer = null;
      void startFullQueueRun()
        .catch((error) => {
          console.error('[CCT] Falha na rotina agendada completa:', error?.message || error);
          if (emailService) {
            void emailService.sendErrorEmail({
              title: 'Erro na rotina agendada CCT',
              error: String(error?.message || error),
              context: 'schedule bootstrap',
              startedAt: new Date(),
            }).catch((mailError) => {
              console.error('[CCT] Falha ao enviar e-mail de erro do bootstrap agendado:', mailError?.message || mailError);
            });
          }
        })
        .finally(() => {
          scheduleWeeklyFullQueueRun();
        });
    }, delay);
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
      startRun({ source: 'manual-queue', notifyByEmail: false }).catch((error) => {
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

    if (status === 'erro na busca') {
      recordRunError(details);
    }

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

    if (/Falha no download/i.test(text) || /Nao consegui baixar/i.test(text) || /NÃ£o consegui baixar/i.test(text)) {
      registerStatus(currentRunCnpj, 'erro na busca', text);
      return;
    }

    if (/Download salvo:/i.test(text)) {
      registerStatus(currentRunCnpj, 'download realizado', text);
    }
  }

  async function finalizeRun({ code, hadRerun, wasStopRequested, shouldStartExclusiveRun, shouldRestoreAutomaticQueue, shouldStartFullQueueRun, runContext }) {
    await notifyRunOutcome(runContext, code);

    if (shouldStartExclusiveRun) {
      exclusiveRunPending = false;
      exclusiveRunActive = true;
      rerunRequested = false;
      scheduleRun();
      return;
    }

    if (shouldRestoreAutomaticQueue) {
      await restoreAutomaticQueueIfNeeded();
      return;
    }

    if (shouldStartFullQueueRun) {
      fullQueueRunPending = false;
      rerunRequested = false;
      await startRun({ source: 'scheduled-full-queue', notifyByEmail: true });
      return;
    }

    if (hadRerun && !wasStopRequested) {
      rerunRequested = false;
      scheduleRun();
    }
  }

  async function startRun(options = {}) {
    if (activeProcess) {
      if (options.notifyByEmail) {
        fullQueueRunPending = true;
      } else {
        rerunRequested = true;
      }
      return { started: false, reason: 'process already running' };
    }

    const pendingEntries = await readCurrentQueueEntries();
    const pendingCnpjs = pendingEntries.map((entry) => entry.cnpj);
    if (!pendingCnpjs.length) {
      if (options.notifyByEmail && emailService) {
        await emailService.sendNoNewConventionEmail({
          startedAt: new Date(),
          context: options.source || 'scheduled-full-queue',
          details: 'A fila completa de CNPJs estava vazia no momento da execucao.',
        });
      }
      return { started: false, reason: 'empty queue' };
    }

    if (!mteScriptPath || !fs.existsSync(mteScriptPath)) {
      throw new Error('Nao foi possivel localizar o MTE.py para processamento.');
    }

    await ensureStorage();
    currentRunStartedAt = new Date();
    currentRunCnpj = null;
    currentRunQueue = new Map(pendingEntries.map((entry) => [entry.cnpj, entry.user]));
    currentRunSource = options.source || 'manual';
    currentRunNotifyByEmail = !!options.notifyByEmail;
    currentRunJsonBefore = await snapshotJsonNames();
    currentRunHadError = false;
    currentRunErrors = [];
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
      recordRunError(message);
      activeProcess = null;
      rerunRequested = true;
    });

    child.on('close', (code) => {
      const runContext = {
        startedAt: currentRunStartedAt ? new Date(currentRunStartedAt) : new Date(),
        source: currentRunSource,
        notifyByEmail: currentRunNotifyByEmail,
        jsonBefore: new Set(currentRunJsonBefore),
        hadError: currentRunHadError || Number(code || 0) !== 0,
        errors: currentRunErrors.slice(),
      };
      const hadRerun = rerunRequested;
      const wasStopRequested = stopRequested;
      const shouldStartExclusiveRun = exclusiveRunPending;
      const shouldRestoreAutomaticQueue = exclusiveRunActive;
      const shouldStartFullQueueRun = fullQueueRunPending;

      activeProcess = null;
      currentRunStartedAt = null;
      currentRunCnpj = null;
      currentRunQueue = new Map();
      currentRunSource = 'manual';
      currentRunNotifyByEmail = false;
      currentRunJsonBefore = new Set();
      currentRunHadError = false;
      currentRunErrors = [];
      loggedStatusesThisRun.clear();
      stopRequested = false;

      if (code !== 0) {
        console.warn(`[CCT] MTE.py finalizou com codigo ${code}`);
      }

      void finalizeRun({
        code,
        hadRerun,
        wasStopRequested,
        shouldStartExclusiveRun,
        shouldRestoreAutomaticQueue,
        shouldStartFullQueueRun,
        runContext,
      }).catch((error) => {
        console.error('[CCT] Falha na finalizacao da execucao:', error?.message || error);
      });
    });

    return { started: true, queueSize: pendingEntries.length };
  }

  async function startFullQueueRun() {
    return startRun({ source: 'scheduled-full-queue', notifyByEmail: true });
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
        requestAdded: false,
        automaticAdded: false,
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
        requestAdded: true,
        automaticAdded: true,
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
      requestAdded: true,
      automaticAdded: true,
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
      fullQueueRunPending,
      nextFullQueueRunAt: nextFullQueueRunAt ? nextFullQueueRunAt.toISOString() : null,
      startedAt: currentRunStartedAt ? currentRunStartedAt.toISOString() : null,
      currentCnpj: currentRunCnpj,
      currentSource: currentRunSource,
      notifyByEmail: currentRunNotifyByEmail,
      scriptPath: mteScriptPath,
      cnpjFilePath,
      requestersFilePath,
      historyFilePath,
      jsonDirPath,
    };
  }

  if (autoBootstrapFullQueueSchedule) {
    scheduleWeeklyFullQueueRun();
  }

  return {
    enqueueCnpj,
    readCurrentCnpjs,
    readHistory,
    getStatus,
    startRun,
    startFullQueueRun,
    appendHistoryEntry,
  };
}

module.exports = {
  createCctIntakeService,
};
