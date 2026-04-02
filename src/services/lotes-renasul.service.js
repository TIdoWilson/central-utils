const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const XLSX = require('xlsx');

const DEFAULT_SOURCE_WORKBOOK = 'W:\\PASTA CLIENTES\\RENASUL INDUSTRIA DE EQUIPAMENTOS PARA CLIMATIZAÇÃO LTDA\\CONCILIACAO\\2025\\LOTES FOLHA\\FOLHA RENASUL.xlsm';

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/^0+/, '') || '0';
}

function normalizeAccount(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const digits = text.replace(/\D/g, '');
  if (digits) return digits;
  return text.toUpperCase();
}

function parseMoney(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value)
    .replace(/\s+/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '');
  if (!text || text === '-' || text === '.' || text === '-.') return 0;
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0,00';
  return num.toFixed(2).replace('.', ',');
}

function decimalToCentsString(value, width = 15) {
  const cents = Math.round(Number(value || 0) * 100);
  return String(Math.max(0, cents)).padStart(width, '0').slice(-width);
}

function setRange(base, start, end, value, { alignRight = false, fill = ' ' } = {}) {
  const width = end - start + 1;
  const raw = String(value == null ? '' : value);
  const formatted = alignRight
    ? raw.padStart(width, fill).slice(-width)
    : raw.slice(0, width).padEnd(width, fill);
  for (let idx = 0; idx < width; idx += 1) {
    base[start - 1 + idx] = formatted[idx] || fill;
  }
}

function createBaseLine(char = ' ') {
  return Array.from({ length: 536 }, () => char);
}

function lineToString(chars) {
  return chars.join('').replace(/\s+$/g, '');
}

function parseCentersList(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/\D/g, ''))
    .filter(Boolean);
}

function centerTypeFor(centerNumber, config) {
  const adm = new Set(parseCentersList(config?.centrosCusto?.adm || '2,4'));
  const prod = new Set(parseCentersList(config?.centrosCusto?.producao || '1,5,6,7'));
  const center = String(centerNumber || '').trim();
  if (adm.has(center)) return 'adm';
  if (prod.has(center)) return 'producao';
  return '';
}

function mergeConfigRows(baseRows, extraRows, keys) {
  const map = new Map();

  const addRow = (row) => {
    const code = normalizeCode(row?.rubrica || row?.classificacao || row?.code || '');
    const name = normalizeText(row?.nome || row?.name || '');
    if (!code && !name) return;
    const key = `${code}|${name}`;
    const current = map.get(key) || {
      rubrica: row?.rubrica || row?.classificacao || '',
      nome: row?.nome || row?.name || '',
      contaDebitoProducao: '',
      contaCreditoProducao: '',
      contaDebitoAdm: '',
      contaCreditoAdm: '',
      conta: '',
      dePara: '',
    };

    for (const keyName of keys) {
      const value = row?.[keyName];
      if (String(value || '').trim()) current[keyName] = String(value).trim();
    }

    if (!String(current.rubrica || '').trim() && code) current.rubrica = code;
    if (!String(current.nome || '').trim() && row?.nome) current.nome = String(row.nome).trim();
    map.set(key, current);
  };

  (Array.isArray(baseRows) ? baseRows : []).forEach(addRow);
  (Array.isArray(extraRows) ? extraRows : []).forEach(addRow);

  return Array.from(map.values()).sort((a, b) => {
    const codeA = normalizeCode(a.rubrica);
    const codeB = normalizeCode(b.rubrica);
    if (codeA !== codeB) return codeA.localeCompare(codeB, 'pt-BR', { numeric: true });
    return normalizeText(a.nome).localeCompare(normalizeText(b.nome), 'pt-BR');
  });
}

function extractDefaultConfigFromWorkbook() {
  if (!fs.existsSync(DEFAULT_SOURCE_WORKBOOK)) {
    return {
      version: 1,
      sourceWorkbook: DEFAULT_SOURCE_WORKBOOK,
      centrosCusto: { adm: '2,4', producao: '1,5,6,7' },
      planoContas: [],
      dePara: [],
      deParaRows: [],
    };
  }

  const wb = XLSX.readFile(DEFAULT_SOURCE_WORKBOOK, { cellDates: true });
  const planoSheet = wb.Sheets['PLANO DELES'];
  const eventosProdSheet = wb.Sheets['EVENTOS PRODUCAO'];
  const eventosAdmSheet = wb.Sheets['EVENTOS ADM'];

  const planoRows = planoSheet
    ? XLSX.utils.sheet_to_json(planoSheet, { header: 1, raw: false, defval: '' })
        .slice(1)
        .map((row) => ({
          classificacao: String(row[0] || '').trim(),
          nome: String(row[1] || '').trim(),
          conta: String(row[2] || '').trim(),
          dePara: String(row[3] || '').trim(),
        }))
        .filter((row) => row.classificacao || row.nome || row.conta || row.dePara)
    : [];

  const parseEventRows = (sheet, centerType) => {
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
      .slice(1)
      .map((row) => ({
        rubrica: String(row[0] || '').trim(),
        nome: String(row[1] || '').trim(),
        contaDebito: String(row[2] || '').trim(),
        contaCredito: String(row[4] || '').trim(),
        contaDebitoProducao: centerType === 'producao' ? String(row[6] || '').trim() : '',
        contaCreditoProducao: centerType === 'producao' ? String(row[8] || '').trim() : '',
        contaDebitoAdm: centerType === 'adm' ? String(row[6] || '').trim() : '',
        contaCreditoAdm: centerType === 'adm' ? String(row[8] || '').trim() : '',
      }))
      .filter((row) => row.rubrica || row.nome || row.contaDebito || row.contaCredito);
  };

  const dePara = mergeConfigRows(
    parseEventRows(eventosProdSheet, 'producao'),
    parseEventRows(eventosAdmSheet, 'adm'),
    [
      'rubrica',
      'nome',
      'contaDebito',
      'contaCredito',
      'contaDebitoProducao',
      'contaCreditoProducao',
      'contaDebitoAdm',
      'contaCreditoAdm',
    ]
  );

  return {
    version: 1,
    sourceWorkbook: DEFAULT_SOURCE_WORKBOOK,
    centrosCusto: { adm: '2,4', producao: '1,5,6,7' },
    planoContas: planoRows,
    dePara,
    deParaRows: dePara,
  };
}

function sanitizeConfig(input, defaults) {
  const fallback = defaults || extractDefaultConfigFromWorkbook();
  const config = input && typeof input === 'object' ? input : {};

  const planoContas = Array.isArray(config.planoContas) && config.planoContas.length
    ? config.planoContas
    : fallback.planoContas;

  const deParaSource = Array.isArray(config.dePara) && config.dePara.length
    ? config.dePara
    : Array.isArray(config.deParaRows) && config.deParaRows.length
      ? config.deParaRows
      : fallback.dePara || fallback.deParaRows;
  const dePara = Array.isArray(deParaSource) ? deParaSource : [];

  const centrosCusto = {
    adm: String(config.centrosCusto?.adm || fallback.centrosCusto?.adm || '2,4').trim(),
    producao: String(config.centrosCusto?.producao || fallback.centrosCusto?.producao || '1,5,6,7').trim(),
  };

  return {
    version: 1,
    sourceWorkbook: fallback.sourceWorkbook || DEFAULT_SOURCE_WORKBOOK,
    centrosCusto,
    planoContas: Array.isArray(planoContas) ? planoContas : [],
    dePara,
    deParaRows: dePara,
  };
}

function buildTxtFromPreview(preview) {
  const rows = Array.isArray(preview?.rows) ? preview.rows : [];
  const dateText = String(preview?.competenceDateText || preview?.competenceDate || '').replace(/\D/g, '');
  const ddmmyyyy = /^\d{8}$/.test(dateText)
    ? dateText
    : (() => {
        const fallback = new Date();
        const dd = String(fallback.getDate()).padStart(2, '0');
        const mm = String(fallback.getMonth() + 1).padStart(2, '0');
        const yyyy = String(fallback.getFullYear());
        return `${dd}${mm}${yyyy}`;
      })();

  const entries = rows.filter((row) => !row.missing && Number(row.value) > 0);
  const total = entries.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const lines = [];

  const buildEntryLine = (entry, seq) => {
    const line = createBaseLine(' ');
    line[0] = 'L';
    setRange(line, 2, 9, ddmmyyyy);
    setRange(line, 10, 15, normalizeAccount(entry.debitAccount || '000000'), { alignRight: true, fill: '0' });
    setRange(line, 16, 21, normalizeAccount(entry.creditAccount || '000000'), { alignRight: true, fill: '0' });
    setRange(line, 22, 24, '000', { alignRight: true, fill: '0' });
    setRange(line, 25, 49, String(entry.complement || '').slice(0, 25));
    setRange(line, 50, 64, decimalToCentsString(entry.value, 15), { alignRight: true, fill: '0' });
    setRange(line, 68, 81, '', { alignRight: false, fill: ' ' });
    setRange(line, 82, 95, '', { alignRight: false, fill: ' ' });
    setRange(line, 96, 100, String(seq).padStart(5, '0'), { alignRight: true, fill: '0' });
    setRange(line, 533, 536, '0000', { alignRight: true, fill: '0' });
    return lineToString(line);
  };

  const buildHistoryLine = (entry, seq) => {
    const line = createBaseLine(' ');
    line[0] = 'H';
    setRange(line, 2, 51, String(entry.history || '').slice(0, 50));
    setRange(line, 96, 100, String(seq).padStart(5, '0'), { alignRight: true, fill: '0' });
    return lineToString(line);
  };

  entries.forEach((entry, index) => {
    const seq = index + 1;
    lines.push(buildEntryLine(entry, seq));
    if (entry.history) lines.push(buildHistoryLine(entry, seq));
  });

  const header = createBaseLine(' ');
  header[0] = 'C';
  setRange(header, 3, 10, ddmmyyyy);
  setRange(header, 11, 25, decimalToCentsString(total, 15), { alignRight: true, fill: '0' });
  setRange(header, 26, 50, 'LOTES RENASUL');
  setRange(header, 96, 100, '00001', { alignRight: true, fill: '0' });

  return [lineToString(header), ...lines].join('\r\n') + '\r\n';
}

function createLotesRenasulService({ DATA_DIR } = {}) {
  const dataDir = DATA_DIR || path.resolve(__dirname, '..', '..', 'data');
  const toolDir = path.join(dataDir, 'lotes-renasul');
  const uploadsDir = path.join(toolDir, 'uploads');
  const outputsDir = path.join(toolDir, 'outputs');
  const jobsDir = path.join(toolDir, 'jobs');
  const configPath = path.join(toolDir, 'config.json');
  const parserScriptPath = path.resolve(__dirname, '..', '..', 'api', 'lotes_renasul_core.py');

  ensureDir(toolDir);
  ensureDir(uploadsDir);
  ensureDir(outputsDir);
  ensureDir(jobsDir);

  let defaultsCache = null;
  let configCache = null;

  function getDefaults() {
    if (!defaultsCache) defaultsCache = extractDefaultConfigFromWorkbook();
    return JSON.parse(JSON.stringify(defaultsCache));
  }

  function loadConfig() {
    if (configCache) return JSON.parse(JSON.stringify(configCache));

    const defaults = getDefaults();
    if (!fs.existsSync(configPath)) {
      configCache = sanitizeConfig(defaults, defaults);
      return JSON.parse(JSON.stringify(configCache));
    }

    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      configCache = sanitizeConfig(raw, defaults);
    } catch (_) {
      configCache = sanitizeConfig(defaults, defaults);
    }

    return JSON.parse(JSON.stringify(configCache));
  }

  function saveConfig(input) {
    const defaults = getDefaults();
    const config = sanitizeConfig(input, defaults);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    configCache = config;
    return JSON.parse(JSON.stringify(config));
  }

  function createJobId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getJobDirs(jobId) {
    const safeJobId = String(jobId || createJobId()).trim() || createJobId();
    const dir = path.join(jobsDir, safeJobId);
    const uploadDir = path.join(dir, 'uploads');
    const outputDir = path.join(dir, 'outputs');
    ensureDir(dir);
    ensureDir(uploadDir);
    ensureDir(outputDir);
    return { jobId: safeJobId, dir, uploadDir, outputDir };
  }

  async function runParser({ filePaths, config, jobId }) {
    const payload = {
      jobId: jobId || createJobId(),
      config,
      files: (Array.isArray(filePaths) ? filePaths : []).map((item) => ({
        path: String(item.path || ''),
        name: String(item.name || path.basename(item.path || 'arquivo.xls')),
      })),
    };

    return new Promise((resolve, reject) => {
      const pythonBin = String(process.env.PYTHON_BIN || 'python').trim() || 'python';
      const child = spawn(pythonBin, [parserScriptPath], {
        cwd: path.resolve(__dirname, '..', '..'),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (buffer) => {
        stdout += buffer.toString('utf8');
      });
      child.stderr.on('data', (buffer) => {
        stderr += buffer.toString('utf8');
      });
      child.on('error', (error) => {
        reject(error);
      });
      child.on('close', (code) => {
        if (stderr.trim()) {
          console.warn('[lotes-renasul] parser stderr:', stderr.trim());
        }
        if (code !== 0) {
          reject(new Error(`Parser Python finalizou com codigo ${code}.`));
          return;
        }
        try {
          const marker = '__LRENASUL_JSON__';
          const markerIndex = stdout.lastIndexOf(marker);
          const payloadText = markerIndex >= 0
            ? stdout.slice(markerIndex + marker.length).trim()
            : stdout.trim();
          const braceIndex = payloadText.indexOf('{');
          const jsonText = braceIndex >= 0 ? payloadText.slice(braceIndex).trim() : payloadText;
          resolve(JSON.parse((jsonText || '{}').trim()));
        } catch (error) {
          reject(new Error(`Falha ao interpretar retorno do parser: ${error.message}`));
        }
      });

      child.stdin.end(JSON.stringify(payload));
    });
  }

  return {
    dataDir,
    toolDir,
    uploadsDir,
    outputsDir,
    jobsDir,
    configPath,
    createJobId,
    getDefaults,
    loadConfig,
    saveConfig,
    getJobDirs,
    runParser,
    buildTxtFromPreview,
    parseMoney,
    formatMoney,
    normalizeCode,
    normalizeText,
    centerTypeFor,
    parseCentersList,
    decimalToCentsString,
  };
}

module.exports = createLotesRenasulService;
