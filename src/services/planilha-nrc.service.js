const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeFileName(value) {
  return (
    String(value || 'arquivo.xlsx')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'arquivo.xlsx'
  );
}

module.exports = function createPlanilhaNrcService({ DATA_DIR } = {}) {
  const toolDir = path.join(DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'planilha-nrc');
  const jobsDir = path.join(toolDir, 'jobs');
  const configPath = path.join(toolDir, 'config.json');

  function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  function ensureBase() {
    ensureDir(toolDir);
    ensureDir(jobsDir);
  }

  function createJobId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function getJobDirs(jobId) {
    ensureBase();
    const safeJobId = safeFileName(jobId);
    const rootDir = path.join(jobsDir, safeJobId);
    const uploadDir = path.join(rootDir, 'uploads');
    const outputDir = path.join(rootDir, 'outputs');
    ensureDir(uploadDir);
    ensureDir(outputDir);
    return { rootDir, uploadDir, outputDir };
  }

  function defaultConfig() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      mappings: [],
    };
  }

  function sanitizeMappings(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const seen = new Set();
    const output = [];

    for (const row of list) {
      const historico = normalizeSpaces(row?.historico || row?.de || '');
      const agrupamento = normalizeSpaces(row?.agrupamento || row?.para || '');
      if (!historico || !agrupamento) continue;
      const key = `${historico.toLowerCase()}|${agrupamento.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({ historico, agrupamento });
    }

    return output;
  }

  function sanitizeConfig(input) {
    const cfg = input && typeof input === 'object' ? input : {};
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      mappings: sanitizeMappings(cfg.mappings),
    };
  }

  function loadConfig() {
    ensureBase();
    if (!fs.existsSync(configPath)) {
      const cfg = defaultConfig();
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
      return cfg;
    }
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      return sanitizeConfig(parsed);
    } catch (_) {
      const cfg = defaultConfig();
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
      return cfg;
    }
  }

  function saveConfig(input) {
    const sanitized = sanitizeConfig(input);
    ensureBase();
    fs.writeFileSync(configPath, JSON.stringify(sanitized, null, 2), 'utf8');
    return sanitized;
  }

  function parsePeriodo(periodo) {
    const normalized = normalizeSpaces(periodo);
    const match = /^(\d{2})\/(\d{4})$/.exec(normalized);
    if (!match) {
      const error = new Error('Periodo invalido. Use o formato MM/AAAA.');
      error.statusCode = 400;
      throw error;
    }
    const month = Number(match[1]);
    const year = Number(match[2]);
    if (!Number.isFinite(month) || month < 1 || month > 12 || !Number.isFinite(year) || year < 1900 || year > 2999) {
      const error = new Error('Periodo invalido. Use mes entre 01 e 12.');
      error.statusCode = 400;
      throw error;
    }
    return { month, year, serial: year * 12 + month };
  }

  function validatePeriodoRange(periodoInicial, periodoFinal) {
    const start = parsePeriodo(periodoInicial);
    const end = parsePeriodo(periodoFinal);
    if (start.serial > end.serial) {
      const error = new Error('Periodo inicial nao pode ser maior que o periodo final.');
      error.statusCode = 400;
      throw error;
    }
    return { start, end };
  }

  function convertXlsToXlsxViaExcel(sourcePath) {
    const src = String(sourcePath || '').trim();
    if (!src || path.extname(src).toLowerCase() !== '.xls') return src;
    if (process.platform !== 'win32') {
      const error = new Error('Arquivo .xls nao suportado neste ambiente. Envie .xlsx.');
      error.statusCode = 400;
      throw error;
    }

    const dst = src.replace(/\.xls$/i, '.converted.xlsx');
    const psScript = `
$ErrorActionPreference = 'Stop'
$src = '${src.replace(/'/g, "''")}'
$dst = '${dst.replace(/'/g, "''")}'
$excel = $null
$wb = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($src, $false, $true)
  $wb.SaveAs($dst, 51)
}
finally {
  if ($wb -ne $null) { $wb.Close($false) }
  if ($excel -ne $null) { $excel.Quit() }
}
`;
    const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 120000,
    });
    if (result.error || result.status !== 0 || !fs.existsSync(dst)) {
      const detail = String(result?.stderr || result?.stdout || result?.error?.message || '').trim();
      const error = new Error(`Falha ao converter arquivo .xls para .xlsx. ${detail}`.trim());
      error.statusCode = 400;
      throw error;
    }
    return dst;
  }

  function saveIncomingFile(file, uploadDir) {
    if (!file || !file.buffer) {
      const error = new Error('Nenhum arquivo enviado.');
      error.statusCode = 400;
      throw error;
    }
    const inputName = safeFileName(file.originalname || 'planilha.xlsx');
    const inputPath = path.join(uploadDir, inputName);
    fs.writeFileSync(inputPath, file.buffer);
    const convertedPath = convertXlsToXlsxViaExcel(inputPath);
    const finalPath = convertedPath;
    const finalName = path.basename(finalPath);
    return { inputPath: finalPath, inputName: finalName };
  }

  function resolveDownloadPath(jobId, fileName) {
    const safeJobId = safeFileName(jobId);
    const safeName = safeFileName(fileName);
    const candidate = path.join(jobsDir, safeJobId, 'outputs', safeName);
    const resolvedBase = path.resolve(jobsDir);
    const resolvedFile = path.resolve(candidate);
    if (!resolvedFile.startsWith(resolvedBase)) return null;
    return resolvedFile;
  }

  function outputNameFromInput(inputName) {
    const ext = '.xlsx';
    const base = path.basename(inputName || 'planilha.xlsx', path.extname(inputName || 'planilha.xlsx'));
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    return `${safeFileName(base)}_nrc_${stamp}${ext}`;
  }

  return {
    toolDir,
    jobsDir,
    configPath,
    createJobId,
    getJobDirs,
    loadConfig,
    saveConfig,
    sanitizeMappings,
    validatePeriodoRange,
    saveIncomingFile,
    resolveDownloadPath,
    outputNameFromInput,
  };
};
