const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_PROJECT_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_CCT_DIR = path.join(DEFAULT_PROJECT_ROOT, 'data', 'cct');
const DEFAULT_CNPJ_FILE = path.join(DEFAULT_CCT_DIR, 'CNPJ.txt');
const DEFAULT_REQUESTERS_FILE = path.join(DEFAULT_CCT_DIR, 'CNPJ_requisitantes.txt');
const DEFAULT_HISTORY_FILE = path.join(DEFAULT_CCT_DIR, 'historico_cct.log');
const DEFAULT_LEGACY_MTE_SCRIPT = 'C:\\Users\\Usuario\\Documents\\SCRIPTS TESTE\\MTE.py';
const DEFAULT_WINDOWS_PYTHON_BINS = [
  'C:\\Users\\Usuario\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
  'C:\\Users\\Usuario\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
  'C:\\Users\\Usuario\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
];
const CNPJ_WRITE_ORIGINS = new Set(['site-inclusion']);

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

function resolvePythonBin(candidates) {
  const resolved = resolveExistingPath(candidates);
  if (resolved) {
    return resolved;
  }

  return candidates.find(Boolean) || 'python';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function toBoundedInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const floored = Math.floor(number);
  if (floored < min || floored > max) return fallback;
  return floored;
}

function parseWeekdays(rawValue, fallback = [1, 3]) {
  const raw = String(rawValue || '').trim();
  if (!raw) return fallback.slice();
  const items = raw
    .split(',')
    .map((item) => Number(String(item || '').trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (!items.length) return fallback.slice();
  return Array.from(new Set(items)).sort((a, b) => a - b);
}

function splitHistoryLine(line) {
  const parts = String(line || '').split('\t');
  if (parts.length < 3) return null;
  const [timestamp, cnpj, status, maybeUser, ...rest] = parts;
  const hasExplicitUser = parts.length >= 5;
  const user = hasExplicitUser ? String(maybeUser || '').trim() : '';
  let runId = '';
  let details = '';

  if (hasExplicitUser) {
    if (rest.length >= 2) {
      runId = String(rest[rest.length - 1] || '').trim();
      details = rest.slice(0, -1).join('\t').trim();
    } else {
      details = rest.join('\t').trim();
    }
  } else {
    details = [maybeUser, ...rest].join('\t').trim();
  }

  if (!/^run_[0-9]{8}T[0-9]{6}Z_[a-z0-9]+$/i.test(runId)) {
    runId = '';
  }

  return {
    timestamp: String(timestamp || '').trim(),
    cnpj: String(cnpj || '').trim(),
    status: String(status || '').trim(),
    user,
    details,
    runId,
    raw: String(line || '').trim(),
  };
}

function createCctIntakeService(deps = {}) {
  const projectRoot = path.resolve(deps.projectRoot || DEFAULT_PROJECT_ROOT);
  const cctDir = path.resolve(deps.cctDir || path.join(projectRoot, 'data', 'cct'));
  const cnpjFilePath = path.resolve(deps.cnpjFilePath || DEFAULT_CNPJ_FILE);
  const requestersFilePath = path.resolve(deps.requestersFilePath || DEFAULT_REQUESTERS_FILE);
  const historyFilePath = path.resolve(deps.historyFilePath || DEFAULT_HISTORY_FILE);
  const jsonDir = resolveExistingPath([
    deps.jsonDir,
    process.env.LEITOR_CCT_OUTPUT_DIR,
    path.join(cctDir, 'json'),
  ]) || path.join(cctDir, 'json');
  const pythonBin = resolvePythonBin([
    deps.pythonBin,
    process.env.CCT_PYTHON_BIN,
    process.env.PYTHON_BIN,
    ...DEFAULT_WINDOWS_PYTHON_BINS,
    'python',
  ]);
  const mteScriptPath = resolveExistingPath([
    deps.mteScriptPath,
    process.env.CCT_MTE_SCRIPT_PATH,
    path.join(cctDir, 'MTE.py'),
    DEFAULT_LEGACY_MTE_SCRIPT,
  ]);
  const debugEnabled = String(process.env.CCT_INTAKE_DEBUG || '').trim() === '1';
  const mteHeadlessEnv = String(process.env.CCT_MTE_HEADLESS || '1').trim();
  const mteModeArg = mteHeadlessEnv === '0'
    ? '--headed'
    : '--headless';
  const fullQueueScheduleEnabled = String(process.env.CCT_AUTO_FULL_QUEUE_ENABLED || '1').trim() !== '0';
  const fullQueueScheduleHour = toBoundedInt(process.env.CCT_AUTO_FULL_QUEUE_HOUR, 6, 0, 23);
  const fullQueueScheduleMinute = toBoundedInt(process.env.CCT_AUTO_FULL_QUEUE_MINUTE, 0, 0, 59);
  const fullQueueScheduleWeekdays = parseWeekdays(process.env.CCT_AUTO_FULL_QUEUE_WEEKDAYS, [1, 3]);
  const autoBootstrapPendingQueue = deps.autoBootstrapPendingQueue !== false;
  const autoBootstrapFullQueueSchedule = deps.autoBootstrapFullQueueSchedule !== false;

  let activeProcess = null;
  let scheduledTimer = null;
  let fullQueueScheduleTimer = null;
  let nextFullQueueRunAt = null;
  let rerunRequested = false;
  let fullQueueRerunRequested = false;
  let fullQueueEmailAnchorStartedAt = null;
  let currentRunStartedAt = null;
  let currentRunCnpj = null;
  let currentRunId = '';
  let currentRunType = 'request';
  let currentRunQueue = new Map();
  let currentRunHasSearchError = false;
  let currentRunErrorLines = [];
  let stopRequested = false;
  let currentSnapshotDir = null;
  let currentSnapshotPath = null;
  const emailService = deps.emailService || null;
  const loggedStatusesThisRun = new Set();
  let enqueueChain = Promise.resolve();

  async function ensureStorage() {
    await fs.promises.mkdir(path.dirname(cnpjFilePath), { recursive: true });
    await fs.promises.mkdir(path.dirname(requestersFilePath), { recursive: true });
    await fs.promises.mkdir(path.dirname(historyFilePath), { recursive: true });
  }

  async function readPlainQueue(filePath) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const seen = new Set();
      const items = [];
      content.split(/\r?\n/).forEach((line) => {
        const digits = normalizeDigits(line);
        if (digits.length !== 14 || seen.has(digits)) return;
        seen.add(digits);
        items.push(digits);
      });
      return items;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async function readRequestQueueEntries() {
    try {
      const content = await fs.promises.readFile(requestersFilePath, 'utf8');
      const seen = new Set();
      const items = [];
      content.split(/\r?\n/).forEach((line) => {
        const parts = String(line || '').split('\t');
        const digits = normalizeDigits(parts[0] || '');
        if (digits.length !== 14 || seen.has(digits)) return;
        seen.add(digits);
        items.push({
          cnpj: digits,
          user: sanitizeHistoryField(parts[1] || ''),
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

  async function hasPendingRequestQueue() {
    const entries = await readRequestQueueEntries();
    return entries.length > 0;
  }

  async function appendUniquePlainQueueValue(filePath, value, origin = '') {
    await ensureStorage();
    if (!CNPJ_WRITE_ORIGINS.has(origin)) {
      throw new Error('Escrita no CNPJ.txt bloqueada: origem nao autorizada.');
    }

    const digits = normalizeDigits(value);
    if (digits.length !== 14) {
      return { appended: false, duplicate: false };
    }

    const current = await readPlainQueue(filePath);
    if (current.includes(digits)) {
      return { appended: false, duplicate: true };
    }

    const next = current.concat(digits).join('\n');
    await fs.promises.writeFile(filePath, next ? `${next}\n` : '', 'utf8');
    return { appended: true, duplicate: false };
  }

  async function appendUniqueRequesterValue(cnpj, user) {
    await ensureStorage();
    const digits = normalizeDigits(cnpj);
    if (digits.length !== 14) {
      return { appended: false, duplicate: false };
    }

    const current = await readRequestQueueEntries();
    if (current.some((entry) => entry.cnpj === digits)) {
      return { appended: false, duplicate: true };
    }

    const line = user ? `${digits}\t${sanitizeHistoryField(user)}` : digits;
    await fs.promises.appendFile(requestersFilePath, `${line}\n`, 'utf8');
    return { appended: true, duplicate: false };
  }

  function createRunId() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    const random = Math.random().toString(36).slice(2, 8);
    return `run_${y}${m}${d}T${hh}${mm}${ss}Z_${random}`;
  }

  function parseHistoryTime(value) {
    const time = new Date(String(value || '')).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function normalizeHistoryScope(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'full') return 'full';
    return 'recent';
  }

  async function appendHistoryEntry(cnpj, status, details = '', user = '', runId = '') {
    await ensureStorage();
    const line = [
      formatTimestamp(new Date()),
      normalizeDigits(cnpj),
      sanitizeHistoryField(status),
      sanitizeHistoryField(user),
      sanitizeHistoryField(details),
      sanitizeHistoryField(runId),
    ].join('\t');
    await fs.promises.appendFile(historyFilePath, `${line}\n`, 'utf8');
  }

  async function readHistory(options = {}) {
    const scope = normalizeHistoryScope(options.scope);
    const page = toPositiveInt(options.page, 1);
    const limit = Math.min(scope === 'full' ? 10 : 50, toPositiveInt(options.limit, scope === 'full' ? 10 : 30));

    try {
      const content = await fs.promises.readFile(historyFilePath, 'utf8');
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(splitHistoryLine)
        .filter(Boolean);
      const sorted = lines
        .slice()
        .sort((a, b) => parseHistoryTime(b.timestamp) - parseHistoryTime(a.timestamp));

      if (scope === 'recent') {
        const latestWithRunId = sorted.find((item) => item.runId);
        const items = latestWithRunId
          ? sorted.filter((item) => item.runId === latestWithRunId.runId)
          : sorted.slice(0, 1);

        return {
          items,
          meta: {
            scope: 'recent',
            runId: latestWithRunId?.runId || '',
            totalItems: items.length,
            page: 1,
            perPage: items.length,
            totalPages: items.length ? 1 : 0,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        };
      }

      const totalItems = sorted.length;
      const totalPages = totalItems ? Math.ceil(totalItems / limit) : 0;
      const safePage = totalPages ? Math.min(page, totalPages) : 1;
      const start = totalPages ? (safePage - 1) * limit : 0;
      const end = start + limit;
      const items = sorted.slice(start, end);

      return {
        items,
        meta: {
          scope: 'full',
          runId: '',
          totalItems,
          page: safePage,
          perPage: limit,
          totalPages,
          hasPreviousPage: safePage > 1 && totalPages > 0,
          hasNextPage: safePage < totalPages,
        },
      };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return {
          items: [],
          meta: {
            scope,
            runId: '',
            totalItems: 0,
            page: scope === 'full' ? page : 1,
            perPage: limit,
            totalPages: 0,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        };
      }
      throw error;
    }
  }

  async function createRequestSnapshot(entries) {
    const snapshotDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cct-request-'));
    const snapshotPath = path.join(snapshotDir, 'CNPJ.txt');
    const serialized = (Array.isArray(entries) ? entries : [])
      .map((entry) => normalizeDigits(entry?.cnpj || entry))
      .filter((digits) => digits.length === 14)
      .join('\n');

    await fs.promises.writeFile(snapshotPath, serialized ? `${serialized}\n` : '', 'utf8');
    return { snapshotDir, snapshotPath };
  }

  async function removeProcessedRequestEntries(processedCnpjs) {
    const processedSet = new Set(
      Array.from(processedCnpjs || [])
        .map((value) => normalizeDigits(value))
        .filter((digits) => digits.length === 14),
    );

    if (!processedSet.size) {
      return [];
    }

    const current = await readRequestQueueEntries();
    const remaining = current.filter((entry) => !processedSet.has(entry.cnpj));
    const serialized = remaining
      .map((entry) => (entry.user ? `${entry.cnpj}\t${entry.user}` : entry.cnpj))
      .join('\n');

    await fs.promises.writeFile(requestersFilePath, serialized ? `${serialized}\n` : '', 'utf8');
    return remaining;
  }

  async function cleanupSnapshotArtifacts() {
    if (!currentSnapshotDir) {
      currentSnapshotPath = null;
      return;
    }

    const snapshotDir = currentSnapshotDir;
    currentSnapshotDir = null;
    currentSnapshotPath = null;

    try {
      await fs.promises.rm(snapshotDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('[CCT] Nao foi possivel limpar a fila temporaria:', error?.message || error);
    }
  }

  async function collectNewConventionsSince(startedAt) {
    const since = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt || 0).getTime();
    if (!Number.isFinite(since) || since <= 0) return [];

    const entries = await fs.promises.readdir(jsonDir, { withFileTypes: true }).catch(() => []);
    const candidates = [];

    for (const entry of entries) {
      if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
      const fullPath = path.join(jsonDir, entry.name);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.mtimeMs < since) continue;
        const raw = JSON.parse(await fs.promises.readFile(fullPath, 'utf8'));
        candidates.push({
          fileName: entry.name,
          mtimeMs: stat.mtimeMs,
          prefixo: raw.prefixo || '',
          numeroRegistro: raw.numero_registro || '',
          sindicatosCelebrantes: Array.isArray(raw.sindicatos_celebrantes) ? raw.sindicatos_celebrantes : [],
          dataBase: raw.data_base || '',
          prazoOposicao: raw.prazo_oposicao || {},
        });
      } catch (error) {
        console.warn('[CCT] Nao foi possivel ler JSON novo para email:', fullPath, error?.message || error);
      }
    }

    return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
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
      });
    }, 500);
  }

  function computeNextFullQueueRunDate(fromDate = new Date()) {
    const reference = fromDate instanceof Date ? fromDate : new Date();
    const weekdays = fullQueueScheduleWeekdays.length ? fullQueueScheduleWeekdays : [1, 3];

    for (let i = 0; i <= 14; i += 1) {
      const candidate = new Date(
        reference.getFullYear(),
        reference.getMonth(),
        reference.getDate() + i,
        fullQueueScheduleHour,
        fullQueueScheduleMinute,
        0,
        0,
      );

      if (!weekdays.includes(candidate.getDay())) continue;
      if (candidate.getTime() <= reference.getTime()) continue;
      return candidate;
    }

    return new Date(reference.getTime() + (24 * 60 * 60 * 1000));
  }

  function scheduleNextFullQueueRun() {
    if (!fullQueueScheduleEnabled) {
      nextFullQueueRunAt = null;
      if (fullQueueScheduleTimer) {
        clearTimeout(fullQueueScheduleTimer);
        fullQueueScheduleTimer = null;
      }
      return;
    }

    const now = new Date();
    const nextRun = computeNextFullQueueRunDate(now);
    const delay = Math.max(1000, nextRun.getTime() - now.getTime());

    nextFullQueueRunAt = nextRun.toISOString();

    if (fullQueueScheduleTimer) {
      clearTimeout(fullQueueScheduleTimer);
      fullQueueScheduleTimer = null;
    }

    fullQueueScheduleTimer = setTimeout(() => {
      fullQueueScheduleTimer = null;
      scheduleNextFullQueueRun();

      if (activeProcess) {
        fullQueueRerunRequested = true;
        return;
      }

      startFullQueueRun().catch((error) => {
        console.error('[CCT] Falha ao disparar processamento automatico completo:', error?.message || error);
      });
    }, delay);
  }

  async function bootstrapPendingQueue() {
    try {
      if (await hasPendingRequestQueue()) {
        if (debugEnabled) {
          console.log('[CCT][debug] Fila pendente detectada na inicializacao. Agendando execucao.');
        }
        scheduleRun();
      }
    } catch (error) {
      console.error('[CCT] Falha ao verificar fila pendente na inicializacao:', error?.message || error);
    }
  }

  function bootstrapFullQueueSchedule() {
    scheduleNextFullQueueRun();
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

  function registerStatus(cnpj, status, details) {
    const digits = normalizeDigits(cnpj);
    if (!digits) return;

    const key = `${digits}:${status}`;
    if (loggedStatusesThisRun.has(key)) return;
    loggedStatusesThisRun.add(key);

    const user = currentRunQueue.get(digits) || '';
    if (String(status || '').trim().toLowerCase() === 'erro na busca') {
      currentRunHasSearchError = true;
      const line = `${digits} | ${sanitizeHistoryField(details || status)}`;
      if (line && !currentRunErrorLines.includes(line)) {
        currentRunErrorLines.push(line);
      }
    }

    void appendHistoryEntry(digits, status, details, user, currentRunId).catch((error) => {
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

    if (/Falha no download/i.test(text) || /NÃ£o consegui baixar/i.test(text) || /Nao consegui baixar/i.test(text)) {
      registerStatus(currentRunCnpj, 'erro na busca', text);
      return;
    }

    if (/Download salvo:/i.test(text)) {
      registerStatus(currentRunCnpj, 'download realizado', text);
    }
  }

  async function finalizeRun({ code, hadRerun, hadFullQueueRerun, wasStopRequested, processedEntries, runType, startedAt }) {
    const processedDigits = (Array.isArray(processedEntries) ? processedEntries : [])
      .map((entry) => normalizeDigits(entry?.cnpj || entry))
      .filter((digits) => digits.length === 14);

    activeProcess = null;
    currentRunStartedAt = null;
    currentRunCnpj = null;
    currentRunId = '';
    currentRunType = 'request';
    currentRunQueue = new Map();
    const hadSearchError = currentRunHasSearchError || code !== 0;
    const errorLines = currentRunErrorLines.slice();
    currentRunHasSearchError = false;
    currentRunErrorLines = [];
    loggedStatusesThisRun.clear();
    stopRequested = false;

    if (code !== 0) {
      console.warn(`[CCT] MTE.py finalizou com codigo ${code}`);
    }

    await cleanupSnapshotArtifacts();

    if (processedDigits.length && runType === 'request') {
      try {
        await removeProcessedRequestEntries(processedDigits);
      } catch (error) {
        console.error('[CCT] Falha ao remover CNPJs processados da fila do site:', error?.message || error);
      }
    }

    const remainingQueue = await readRequestQueueEntries();
    if (remainingQueue.length) {
      rerunRequested = false;
      scheduleRun();
      return;
    }

    if (hadRerun && !wasStopRequested) {
      rerunRequested = false;
      scheduleRun();
      return;
    }

    if (hadFullQueueRerun && !wasStopRequested) {
      if (hadSearchError && emailService && typeof emailService.sendErrorEmail === 'function') {
        try {
          await emailService.sendErrorEmail({
            title: 'CCT - Erro na busca agendada',
            error: [
              code !== 0 ? `Codigo de saida do MTE.py: ${code}` : '',
              errorLines.length ? `CNPJs com erro:\n${errorLines.join('\n')}` : '',
            ].filter(Boolean).join('\n\n'),
            context: `Execucao iniciada em ${startedAt instanceof Date ? startedAt.toISOString() : String(startedAt || '')}`,
            startedAt,
          });
        } catch (error) {
          console.error('[CCT] Falha ao enviar email de erro da busca:', error?.message || error);
        }
      }

      fullQueueRerunRequested = false;
      try {
        await startFullQueueRun();
      } catch (error) {
        console.error('[CCT] Falha ao executar rerun automatico completo:', error?.message || error);
      }
      return;
    }

    if (runType === 'full' && hadSearchError && emailService && typeof emailService.sendErrorEmail === 'function') {
      try {
        await emailService.sendErrorEmail({
          title: 'CCT - Erro na busca agendada',
          error: [
            code !== 0 ? `Codigo de saida do MTE.py: ${code}` : '',
            errorLines.length ? `CNPJs com erro:\n${errorLines.join('\n')}` : '',
          ].filter(Boolean).join('\n\n'),
          context: `Execucao iniciada em ${startedAt instanceof Date ? startedAt.toISOString() : String(startedAt || '')}`,
          startedAt,
        });
      } catch (error) {
        console.error('[CCT] Falha ao enviar email de erro da busca:', error?.message || error);
      }
    }

    if (runType === 'full' && emailService && typeof emailService.sendScheduledConventionEmail === 'function') {
      try {
        const anchorStartedAt = fullQueueEmailAnchorStartedAt || startedAt;
        const conventions = await collectNewConventionsSince(anchorStartedAt);
        if (conventions.length) {
          await emailService.sendScheduledConventionEmail({
            conventions,
            startedAt: anchorStartedAt,
          });
          console.log(`[CCT] Email automatico enviado com ${conventions.length} convencao(oes).`);
        } else {
          console.log('[CCT] Nenhuma convencao nova localizada para envio de email.');
        }
      } catch (error) {
        console.error('[CCT] Falha ao enviar email automatico:', error?.message || error);
        if (typeof emailService.sendErrorEmail === 'function') {
          try {
            await emailService.sendErrorEmail({
              title: 'CCT - Erro no envio de email',
              error: String(error?.message || error),
              context: `Falha apos execucao iniciada em ${startedAt instanceof Date ? startedAt.toISOString() : String(startedAt || '')}`,
              startedAt,
            });
          } catch (fallbackError) {
            console.error('[CCT] Falha ao enviar email de erro do envio:', fallbackError?.message || fallbackError);
          }
        }
      }
    }

    if (runType === 'full' && !hadFullQueueRerun) {
      fullQueueEmailAnchorStartedAt = null;
    }
  }

  async function startRunInternal(pendingEntries, runType = 'request') {
    if (activeProcess) {
      if (runType === 'full') {
        fullQueueRerunRequested = true;
      } else {
        rerunRequested = true;
      }
      return { started: false, reason: 'process already running' };
    }

    const safeEntries = Array.isArray(pendingEntries) ? pendingEntries : [];
    if (!safeEntries.length) {
      return { started: false, reason: 'empty queue' };
    }

    if (!mteScriptPath || !fs.existsSync(mteScriptPath)) {
      throw new Error('Nao foi possivel localizar o MTE.py para processamento.');
    }

    await ensureStorage();

    const snapshot = await createRequestSnapshot(safeEntries);
    currentSnapshotDir = snapshot.snapshotDir;
    currentSnapshotPath = snapshot.snapshotPath;

    currentRunStartedAt = new Date();
    currentRunId = createRunId();
    currentRunCnpj = null;
    currentRunType = runType;
    currentRunQueue = new Map(safeEntries.map((entry) => [entry.cnpj, entry.user]));
    currentRunHasSearchError = false;
    currentRunErrorLines = [];
    loggedStatusesThisRun.clear();
    stopRequested = false;

    const args = [mteScriptPath, mteModeArg, '--cnpj-file', currentSnapshotPath];
    if (debugEnabled) {
      console.log('[CCT][debug] Disparando MTE.py', {
        pythonBin,
        mteModeArg,
        args,
        cwd: projectRoot,
      });
    }
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
      if (debugEnabled) {
        console.error('[CCT][debug] Falha ao iniciar processo', {
          pythonBin,
          mteModeArg,
          args,
          cwd: projectRoot,
        });
      }
      activeProcess = null;
      void cleanupSnapshotArtifacts().catch((cleanupError) => {
        console.error('[CCT] Falha ao limpar fila temporaria apos erro de inicio:', cleanupError?.message || cleanupError);
      });
      rerunRequested = true;
    });

    child.on('close', (code) => {
      const hadRerun = rerunRequested;
      const hadFullQueueRerun = fullQueueRerunRequested;
      const wasStopRequested = stopRequested;
      const processedEntries = safeEntries;
      const startedAt = currentRunStartedAt;
      rerunRequested = false;
      fullQueueRerunRequested = false;

      void finalizeRun({
        code,
        hadRerun,
        hadFullQueueRerun,
        wasStopRequested,
        processedEntries,
        runType,
        startedAt,
      }).catch((error) => {
        console.error('[CCT] Falha ao finalizar processamento da fila:', error?.message || error);
      });
    });

    return { started: true, queueSize: safeEntries.length, runType };
  }

  async function startRun() {
    const pendingEntries = await readRequestQueueEntries();
    return startRunInternal(pendingEntries, 'request');
  }

  async function startFullQueueRun() {
    if (!fullQueueEmailAnchorStartedAt) {
      fullQueueEmailAnchorStartedAt = new Date();
    }
    const cnpjs = await readPlainQueue(cnpjFilePath);
    const entries = cnpjs.map((cnpj) => ({
      cnpj,
      user: 'agendamento-automatico',
    }));
    return startRunInternal(entries, 'full');
  }

  async function doEnqueueCnpj(rawCnpj, rawUser = '') {
    await ensureStorage();
    const cnpj = normalizeDigits(rawCnpj);
    if (cnpj.length !== 14) {
      const error = new Error('Informe um CNPJ valido com 14 digitos.');
      error.statusCode = 400;
      throw error;
    }

    const user = sanitizeHistoryField(rawUser);
    const automaticResult = await appendUniquePlainQueueValue(cnpjFilePath, cnpj, 'site-inclusion');
    const requestResult = await appendUniqueRequesterValue(cnpj, user);

    if (await hasPendingRequestQueue()) {
      scheduleRun();
    }

    const messageParts = [];
    if (automaticResult.duplicate) {
      messageParts.push('CNPJ ja existia na base automatica.');
    } else if (automaticResult.appended) {
      messageParts.push('CNPJ incluido na base automatica.');
    }

    if (requestResult.duplicate) {
      messageParts.push('CNPJ ja existia na fila do site.');
    } else if (requestResult.appended) {
      messageParts.push('CNPJ enviado para processamento imediato.');
    }

    return {
      ok: true,
      duplicate: !!(automaticResult.duplicate || requestResult.duplicate),
      cnpj,
      message: messageParts.join(' '),
      automaticAdded: !!automaticResult.appended,
      requestAdded: !!requestResult.appended,
      automaticDuplicate: !!automaticResult.duplicate,
      requestDuplicate: !!requestResult.duplicate,
      queueSize: (await readRequestQueueEntries()).length,
    };
  }

  function enqueueCnpj(rawCnpj, rawUser = '') {
    const task = enqueueChain.then(() => doEnqueueCnpj(rawCnpj, rawUser));
    enqueueChain = task.catch(() => {});
    return task;
  }

  function getStatus() {
    return {
      running: !!activeProcess,
      scheduled: !!scheduledTimer,
      rerunRequested,
      fullQueueRerunRequested,
      startedAt: currentRunStartedAt ? currentRunStartedAt.toISOString() : null,
      currentRunId,
      currentCnpj: currentRunCnpj,
      currentRunType,
      fullQueueScheduleEnabled,
      fullQueueScheduleHour,
      fullQueueScheduleMinute,
      fullQueueScheduleWeekdays,
      nextFullQueueRunAt,
      scriptPath: mteScriptPath,
      mteModeArg,
      cnpjFilePath,
      requestersFilePath,
      historyFilePath,
      currentSnapshotPath,
    };
  }

  if (autoBootstrapPendingQueue) {
    void bootstrapPendingQueue();
  }
  if (autoBootstrapFullQueueSchedule) {
    bootstrapFullQueueSchedule();
  }

  return {
    enqueueCnpj,
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
