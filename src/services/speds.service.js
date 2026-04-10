const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const XLSX = require('xlsx');
const { PDFDocument } = require('pdf-lib');

const SPED_TYPES = [
  { id: 'icms', label: 'SPED ICMS/IPI', layoutFolder: 'icms' },
  { id: 'contribuicoes', label: 'SPED Contribuicoes', layoutFolder: 'contribuicoes' },
  { id: 'ecd', label: 'SPED ECD', layoutFolder: 'ecd' },
  { id: 'ecf', label: 'SPED ECF', layoutFolder: 'ecf' },
];

const TEMPLATE_CONFIG_PATH = path.resolve(__dirname, '..', '..', 'api', 'layouts', 'speds', 'templates.json');
const MANIFEST_REQUIRED_SPED_TYPES = new Set(['icms', 'contribuicoes']);

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(4, '0').slice(-4);
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeFlag(value) {
  const text = cleanText(value).toLowerCase();
  if (text === 'sim' || text === 's' || text === 'yes' || text === 'true' || text === '1') return 'Sim';
  if (text.includes('sim ou nao')) return 'Sim ou Nao';
  if (text === 'nao' || text === 'n' || text === 'no' || text === 'false' || text === '0') return 'Nao';
  return cleanText(value);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function formatBytes(size) {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let current = bytes;
  let idx = 0;
  while (current >= 1024 && idx < units.length - 1) {
    current /= 1024;
    idx += 1;
  }
  return `${current.toFixed(current >= 100 ? 0 : current >= 10 ? 1 : 2)} ${units[idx]}`;
}

function parseJsonOrDefault(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return fallback;
  }
}

function decodeSample(buffer) {
  if (!buffer || !buffer.length) return '';
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  return buffer.toString('latin1');
}

function findSpedType(spedType) {
  const key = normalizeKey(spedType);
  return SPED_TYPES.find((item) => item.id === key) || null;
}

function loadTemplateDefinitions() {
  try {
    if (!fs.existsSync(TEMPLATE_CONFIG_PATH)) return [];
    const raw = fs.readFileSync(TEMPLATE_CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.templates) ? parsed.templates : []);

    return list
      .filter((tpl) => tpl && tpl.id && tpl.spedType)
      .map((tpl) => ({
        ...tpl,
        id: String(tpl.id),
        spedType: normalizeKey(tpl.spedType),
        title: String(tpl.title || tpl.id),
        description: String(tpl.description || ''),
        script: tpl.script && typeof tpl.script === 'object' ? tpl.script : { entry: '', source: '' },
        manifest: tpl.manifest && typeof tpl.manifest === 'object' ? tpl.manifest : null,
        inputs: Array.isArray(tpl.inputs) ? tpl.inputs : [],
        fields: Array.isArray(tpl.fields) ? tpl.fields : [],
        outputFormats: Array.isArray(tpl.outputFormats) && tpl.outputFormats.length ? tpl.outputFormats : ['txt'],
      }));
  } catch (error) {
    console.error('speds templates load error:', error?.message || error);
    return [];
  }
}

module.exports = function createSpedsService(deps = {}) {
  const DATA_DIR = deps.DATA_DIR || path.resolve(__dirname, '..', '..', 'data');
  const OUTPUT_ROOT = path.join(DATA_DIR, 'speds', 'outputs');
  const LAYOUTS_ROOT = path.resolve(__dirname, '..', '..', 'api', 'layouts', 'speds');
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
  const Y570_CODES_PATH = path.join(PROJECT_ROOT, 'api', 'speds_scripts', 'ecf', 'assets', 'codigos_aceitos.xlsx');
  const templateDefinitions = loadTemplateDefinitions();
  const manifestCache = new Map();
  let y570AcceptedCodesCache = null;

  ensureDir(OUTPUT_ROOT);

  function findTemplate(spedType, templateId) {
    const typeKey = normalizeKey(spedType);
    const tplKey = normalizeKey(templateId);
    return templateDefinitions.find(
      (tpl) => normalizeKey(tpl.spedType) === typeKey && normalizeKey(tpl.id) === tplKey
    ) || null;
  }

  function countLayoutJsonFiles(spedType) {
    const sped = findSpedType(spedType);
    if (!sped) return 0;
    const dirPath = path.join(LAYOUTS_ROOT, sped.layoutFolder);
    if (!fs.existsSync(dirPath)) return 0;
    try {
      return fs.readdirSync(dirPath)
        .filter((name) => name.toLowerCase().endsWith('.json'))
        .filter((name) => {
          const lower = name.toLowerCase();
          return lower !== 'index.json'
            && lower !== '_index.json'
            && lower !== 'index_registros.json'
            && lower !== 'templates.json';
        })
        .length;
    } catch (_) {
      return 0;
    }
  }

  function listSpedTypes() {
    return SPED_TYPES.map((type) => ({
      id: type.id,
      label: type.label,
      templates: templateDefinitions.filter((tpl) => normalizeKey(tpl.spedType) === normalizeKey(type.id)).length,
      layoutJsonCount: countLayoutJsonFiles(type.id),
    }));
  }

  function listTemplates(spedType) {
    const type = findSpedType(spedType);
    if (!type) return [];
    return templateDefinitions
      .filter((tpl) => normalizeKey(tpl.spedType) === normalizeKey(type.id))
      .map((tpl) => ({
        id: tpl.id,
        spedType: tpl.spedType,
        title: tpl.title,
        description: tpl.description,
        requiredInputsCount: (tpl.inputs || []).filter((input) => input.required).length,
        hasManifest: Boolean(tpl.manifest && tpl.manifest.path),
        outputFormats: Array.isArray(tpl.outputFormats) ? tpl.outputFormats.slice() : ['txt'],
      }));
  }

  function getTemplateDetails(spedType, templateId) {
    const template = findTemplate(spedType, templateId);
    if (!template) return null;
    return {
      id: template.id,
      spedType: template.spedType,
      title: template.title,
      description: template.description,
      script: template.script,
      manifest: template.manifest || null,
      inputs: (template.inputs || []).map((input) => ({ ...input })),
      fields: (template.fields || []).map((field) => ({ ...field })),
      outputFormats: (template.outputFormats || ['txt']).slice(),
    };
  }

  function buildFilesByInput(multerFiles = []) {
    const grouped = {};
    const files = Array.isArray(multerFiles) ? multerFiles : [];
    for (const file of files) {
      const fieldName = String(file?.fieldname || '');
      if (!fieldName.startsWith('input__')) continue;
      const inputKey = fieldName.slice('input__'.length);
      if (!inputKey) continue;
      if (!grouped[inputKey]) grouped[inputKey] = [];
      grouped[inputKey].push({
        path: file.path,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });
    }
    return grouped;
  }

  function createValidationError(message, details = []) {
    const err = new Error(message);
    err.status = 400;
    err.details = details;
    return err;
  }

  function resolveManifestPath(template) {
    const manifestPath = String(template?.manifest?.path || '').trim();
    if (!manifestPath) return null;
    if (path.isAbsolute(manifestPath)) return manifestPath;
    return path.resolve(PROJECT_ROOT, manifestPath);
  }

  function loadTemplateManifest(template) {
    const manifestPath = resolveManifestPath(template);
    if (!manifestPath) return null;
    if (manifestCache.has(manifestPath)) return manifestCache.get(manifestPath);
    if (!fs.existsSync(manifestPath)) {
      throw createValidationError('Manifesto do template nao encontrado no servidor.', [
        `Template: ${template?.id || '(desconhecido)'}`,
        `Manifesto: ${manifestPath}`,
      ]);
    }

    let parsed = null;
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
      parsed = JSON.parse(raw);
    } catch (error) {
      throw createValidationError('Falha ao carregar manifesto do template.', [
        `Template: ${template?.id || '(desconhecido)'}`,
        `Manifesto: ${manifestPath}`,
        `Detalhe: ${error?.message || error}`,
      ]);
    }

    manifestCache.set(manifestPath, parsed);
    return parsed;
  }

  function ensureTemplateManifestPolicy(template) {
    const spedType = normalizeKey(template?.spedType);
    const manifestPath = resolveManifestPath(template);
    if (MANIFEST_REQUIRED_SPED_TYPES.has(spedType) && !manifestPath) {
      throw createValidationError('Template sem manifesto padrao.', [
        `Template: ${template?.id || '(desconhecido)'}`,
        'Para novos templates de ICMS/Contribuicoes, manifesto e obrigatorio.',
      ]);
    }

    const manifest = loadTemplateManifest(template);
    if (!manifest) return null;

    const details = [];
    if (String(manifest.templateId || '').trim() !== String(template?.id || '').trim()) {
      details.push(`templateId divergente no manifesto: ${manifest.templateId || '(vazio)'}`);
    }
    if (!manifest.validators || typeof manifest.validators !== 'object') {
      details.push('Bloco "validators" ausente no manifesto.');
    } else if (typeof manifest.validators.globalRelationshipValidation !== 'boolean') {
      details.push('Campo validators.globalRelationshipValidation deve ser boolean.');
    }
    if (!manifest.targets || typeof manifest.targets !== 'object') {
      details.push('Bloco "targets" ausente no manifesto.');
    } else {
      const relPath = String(manifest.targets.relationshipsFile || '').trim();
      if (MANIFEST_REQUIRED_SPED_TYPES.has(spedType) && !relPath) {
        details.push('targets.relationshipsFile obrigatorio para ICMS/Contribuicoes.');
      } else if (relPath) {
        const absRel = path.isAbsolute(relPath) ? relPath : path.resolve(PROJECT_ROOT, relPath);
        if (!fs.existsSync(absRel)) {
          details.push(`Arquivo de relacionamentos nao encontrado: ${absRel}`);
        }
      }
    }
    if (!manifest.output || typeof manifest.output !== 'object' || !Array.isArray(manifest.output.formats) || manifest.output.formats.length === 0) {
      details.push('Bloco output.formats ausente ou invalido no manifesto.');
    }
    if (details.length > 0) {
      throw createValidationError(
        'Manifesto do template invalido para execucao automatica.',
        [`Template: ${template?.id || '(desconhecido)'}`, ...details]
      );
    }
    return manifest;
  }

  function validateTemplateExecution(template, filesByInput, fields, outputFormat) {
    const errors = [];
    const cleanFields = parseJsonOrDefault(fields, {});

    for (const input of template.inputs || []) {
      const uploaded = Array.isArray(filesByInput[input.key]) ? filesByInput[input.key] : [];
      if (input.required && uploaded.length === 0) {
        errors.push(`Campo de arquivo obrigatorio sem envio: ${input.label}.`);
        continue;
      }
      if (!input.multiple && uploaded.length > 1) {
        errors.push(`O campo ${input.label} aceita apenas um arquivo.`);
      }
      const allowed = (input.acceptedExtensions || []).map((ext) => normalizeKey(ext));
      for (const file of uploaded) {
        const ext = normalizeKey(path.extname(file.originalName || file.path));
        if (allowed.length > 0 && !allowed.includes(ext)) {
          errors.push(`Extensao nao permitida no campo ${input.label}: ${file.originalName}.`);
        }
      }
    }

    for (const field of template.fields || []) {
      if (!field.required) continue;
      const value = cleanFields[field.key];
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push(`Campo obrigatorio nao informado: ${field.label}.`);
      }
    }

    const normalizedOutput = normalizeKey(outputFormat);
    const availableOutputs = (template.outputFormats || ['txt']).map((fmt) => normalizeKey(fmt));
    if (!availableOutputs.includes(normalizedOutput)) {
      errors.push(`Formato de saida invalido: ${outputFormat}.`);
    }

    if (errors.length) {
      throw createValidationError('Falha de validacao dos arquivos/campos para a funcao escolhida.', errors);
    }

    return cleanFields;
  }

  async function inspectTextLikeFile(filePath) {
    const stat = await fs.promises.stat(filePath);
    const sampleSize = Math.min(200 * 1024, stat.size);
    const handler = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(sampleSize);
      await handler.read(buffer, 0, sampleSize, 0);
      const content = decodeSample(buffer);
      const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
      return {
        sampleLines: lines.slice(0, 3),
        sampleLineCount: lines.length,
      };
    } finally {
      await handler.close();
    }
  }

  async function inspectFile(fileMeta) {
    const filePath = fileMeta.path;
    const ext = normalizeKey(path.extname(fileMeta.originalName || filePath));
    const stat = await fs.promises.stat(filePath);
    const info = {
      fileName: fileMeta.originalName || path.basename(filePath),
      extension: ext || '(sem-ext)',
      sizeBytes: stat.size,
      sizeLabel: formatBytes(stat.size),
      analysis: {},
    };

    if (['.txt', '.csv', '.slk', '.xml'].includes(ext)) {
      const txtInfo = await inspectTextLikeFile(filePath);
      info.analysis.sampleLineCount = txtInfo.sampleLineCount;
      info.analysis.sample = txtInfo.sampleLines;
      if (ext === '.xml' && txtInfo.sampleLines.length > 0) {
        const firstLine = txtInfo.sampleLines.join(' ');
        const match = firstLine.match(/<([A-Za-z0-9:_-]+)/);
        if (match) info.analysis.rootTagPreview = match[1];
      }
      return info;
    }

    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.readFile(filePath, { cellDates: false });
      const sheetDetails = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const range = sheet && sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
        const rows = range ? range.e.r + 1 : 0;
        return { sheetName, approxRows: rows };
      });
      info.analysis.sheetCount = workbook.SheetNames.length;
      info.analysis.sheets = sheetDetails;
      return info;
    }

    if (ext === '.pdf') {
      const raw = await fs.promises.readFile(filePath);
      const doc = await PDFDocument.load(raw, { ignoreEncryption: true });
      info.analysis.pages = doc.getPageCount();
      return info;
    }

    if (ext === '.zip' || ext === '.rar') {
      info.analysis.archive = ext.replace('.', '').toUpperCase();
      info.analysis.note = 'Arquivo compactado recebido para uso em lote (XMLs).';
      return info;
    }

    info.analysis.note = 'Arquivo recebido sem parser dedicado.';
    return info;
  }

  function createJobId() {
    return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }

  function sanitizeBaseName(value, fallback = 'saida') {
    const clean = String(value || '').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '');
    return clean || fallback;
  }

  function buildTemplateOutputName(template, inputName, fallbackFileName) {
    const manifest = ensureTemplateManifestPolicy(template);
    const pattern = String(manifest?.output?.filenamePattern || '').trim();
    if (!pattern) return fallbackFileName;

    const inputStem = sanitizeBaseName(path.parse(String(inputName || '')).name, 'input');
    const replaced = pattern.replace(/\{input\}/gi, inputStem);
    const safeName = path.basename(String(replaced || '').trim());
    if (!safeName) return fallbackFileName;
    if (!path.extname(safeName) && path.extname(fallbackFileName)) {
      return `${safeName}${path.extname(fallbackFileName)}`;
    }
    return safeName;
  }

  function getInputFiles(filesByInput, inputKey) {
    return Array.isArray(filesByInput?.[inputKey]) ? filesByInput[inputKey] : [];
  }

  function getSingleInputFile(filesByInput, inputKey) {
    const files = getInputFiles(filesByInput, inputKey);
    return files[0] || null;
  }

  function normalizeBoolField(value, fallback = false) {
    const raw = normalizeKey(value);
    if (!raw) return fallback;
    return ['1', 'sim', 's', 'true', 'yes'].includes(raw);
  }

  function pushArgIfPresent(args, option, rawValue) {
    const value = String(rawValue ?? '').trim();
    if (!value) return;
    args.push(option, value);
  }

  function formatDatePtBr(date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());
    return `${day}/${month}/${year}`;
  }

  function mimeByExtension(filePath, fallback = 'application/octet-stream') {
    const ext = normalizeKey(path.extname(filePath));
    if (ext === '.txt') return 'text/plain; charset=latin1';
    if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === '.csv') return 'text/csv; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.zip') return 'application/zip';
    return fallback;
  }

  async function ensureArtifactExists(filePath, errorMessage) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw createValidationError(errorMessage || 'O processamento concluiu sem gerar arquivo de saida.');
    }
  }

  function escapePowerShellLiteral(value) {
    return String(value || '').replace(/'/g, "''");
  }

  async function tryExternalCommand(command, args, cwd = PROJECT_ROOT) {
    try {
      const result = await runCommand(command, args, { cwd });
      return { ok: result.code === 0, result };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return { ok: false, notFound: true };
      }
      throw error;
    }
  }

  async function extractArchiveToDir(archivePath, targetDir) {
    const ext = normalizeKey(path.extname(archivePath));
    const attempts = [];
    if (ext === '.zip') {
      attempts.push({
        command: 'tar',
        args: ['-xf', archivePath, '-C', targetDir],
      });
      const psArchive = escapePowerShellLiteral(archivePath);
      const psTarget = escapePowerShellLiteral(targetDir);
      attempts.push({
        command: 'powershell',
        args: [
          '-NoProfile',
          '-Command',
          `Expand-Archive -LiteralPath '${psArchive}' -DestinationPath '${psTarget}' -Force`,
        ],
      });
    } else if (ext === '.rar') {
      attempts.push({ command: 'unrar', args: ['x', '-o+', '-idq', archivePath, targetDir] });
      attempts.push({ command: 'rar', args: ['x', '-o+', '-idq', archivePath, targetDir] });
      attempts.push({ command: '7z', args: ['x', '-y', `-o${targetDir}`, archivePath] });
      attempts.push({ command: '7za', args: ['x', '-y', `-o${targetDir}`, archivePath] });
      attempts.push({ command: 'tar', args: ['-xf', archivePath, '-C', targetDir] });
    } else {
      throw createValidationError(`Extensao de arquivo compactado nao suportada: ${ext}`);
    }

    const errors = [];
    for (const attempt of attempts) {
      const exec = await tryExternalCommand(attempt.command, attempt.args, PROJECT_ROOT);
      if (exec.ok) return;
      if (exec.notFound) continue;
      const stderr = String(exec.result?.stderr || '').trim();
      const stdout = String(exec.result?.stdout || '').trim();
      if (stderr) errors.push(`${attempt.command}: ${stderr.split(/\r?\n/).slice(-2).join(' | ')}`);
      else if (stdout) errors.push(`${attempt.command}: ${stdout.split(/\r?\n/).slice(-2).join(' | ')}`);
      else errors.push(`${attempt.command}: falhou com codigo ${exec.result?.code ?? 1}`);
    }

    throw createValidationError('Nao foi possivel extrair o arquivo compactado enviado.', errors);
  }

  async function copyXmlInputsToDir(files, xmlRootDir) {
    ensureDir(xmlRootDir);
    let copiedCount = 0;
    for (const file of files) {
      const sourcePath = file?.path;
      if (!sourcePath) continue;
      const originalName = file.originalName || path.basename(sourcePath);
      const ext = normalizeKey(path.extname(originalName));
      if (ext === '.xml') {
        const targetName = `${sanitizeBaseName(path.basename(originalName), `xml_${Date.now()}`)}`;
        const targetPath = path.join(xmlRootDir, targetName);
        await fs.promises.copyFile(sourcePath, targetPath);
        copiedCount += 1;
        continue;
      }
      if (ext === '.zip' || ext === '.rar') {
        const archiveDir = path.join(xmlRootDir, sanitizeBaseName(path.parse(originalName).name, `lote_${Date.now()}`));
        ensureDir(archiveDir);
        await extractArchiveToDir(sourcePath, archiveDir);
      }
    }

    const xmlFiles = [];
    const queue = [xmlRootDir];
    while (queue.length) {
      const currentDir = queue.pop();
      if (!currentDir) continue;
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }
        if (normalizeKey(path.extname(entry.name)) === '.xml') xmlFiles.push(fullPath);
      }
    }

    if (xmlFiles.length === 0 && copiedCount === 0) {
      throw createValidationError('Nenhum XML valido foi encontrado nos arquivos enviados.');
    }
    return xmlFiles.length;
  }

  function resolveTemplateScriptPath(template) {
    const entry = String(template?.script?.entry || '').trim();
    if (entry) {
      const byEntry = path.resolve(PROJECT_ROOT, entry);
      if (fs.existsSync(byEntry)) return byEntry;
    }

    const source = String(template?.script?.source || '').trim();
    if (source && fs.existsSync(source)) return source;
    return null;
  }

  function runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd || PROJECT_ROOT,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', reject);
      child.on('close', (code) => {
        resolve({
          code: Number.isInteger(code) ? code : 1,
          stdout,
          stderr,
          command,
          args,
        });
      });
    });
  }

  function splitConfiguredPythonBin() {
    const raw = String(process.env.PYTHON_BIN || '').trim();
    if (!raw) return null;
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    return { command: parts[0], prefixArgs: parts.slice(1) };
  }

  async function runPythonScript(scriptPath, scriptArgs = []) {
    const configured = splitConfiguredPythonBin();
    const candidates = [];
    if (configured) candidates.push(configured);
    candidates.push({ command: 'python', prefixArgs: [] });
    candidates.push({ command: 'py', prefixArgs: ['-3'] });

    let lastNotFound = null;

    for (const candidate of candidates) {
      try {
        const result = await runCommand(
          candidate.command,
          [...candidate.prefixArgs, scriptPath, ...scriptArgs],
          { cwd: PROJECT_ROOT }
        );
        return result;
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          lastNotFound = error;
          continue;
        }
        throw error;
      }
    }

    if (lastNotFound) {
      throw createValidationError('Python nao encontrado para executar o template.', [
        'Instale o Python no servidor ou configure a variavel de ambiente PYTHON_BIN.',
      ]);
    }

    throw new Error('Falha ao inicializar processo Python.');
  }

  async function guessH005InventoryValue(spedFilePath) {
    try {
      const raw = await fs.promises.readFile(spedFilePath, 'latin1');
      const lines = String(raw || '').split(/\r?\n/);
      for (const line of lines) {
        if (!line || !line.startsWith('|H005|')) continue;
        const parts = line.split('|');
        const value = String(parts[3] || '').trim();
        if (value) return value;
      }
      return '';
    } catch (_) {
      return '';
    }
  }

  function normalizeExpectedValue(rawValue) {
    const text = String(rawValue || '').trim();
    if (!text) return '';
    return text.replace(/\s+/g, '');
  }

  function toNonNegativeInt(rawValue, fallback) {
    const parsed = Number.parseInt(String(rawValue ?? '').trim(), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, parsed);
  }

  function buildScriptErrorDetails(result) {
    const details = [];
    const stdout = String(result?.stdout || '').trim();
    const stderr = String(result?.stderr || '').trim();

    if (stdout) {
      const lines = stdout.split(/\r?\n/).slice(-8);
      details.push(`stdout: ${lines.join(' | ')}`);
    }
    if (stderr) {
      const lines = stderr.split(/\r?\n/).slice(-8);
      details.push(`stderr: ${lines.join(' | ')}`);
    }
    if (details.length === 0) {
      details.push('O script retornou erro sem detalhes de saida.');
    }
    return details;
  }

  function ensureTemplateScriptPath(template) {
    const scriptPath = resolveTemplateScriptPath(template);
    if (!scriptPath) {
      throw createValidationError('Script do template nao encontrado no servidor.', [
        `entry: ${template?.script?.entry || '(vazio)'}`,
        `source: ${template?.script?.source || '(vazio)'}`,
      ]);
    }
    return scriptPath;
  }

  async function executeTemplateScript({ template, scriptArgs, outputPath, failureLabel }) {
    const scriptPath = ensureTemplateScriptPath(template);
    const result = await runPythonScript(scriptPath, scriptArgs);
    if (result.code !== 0) {
      throw createValidationError(
        failureLabel || 'Falha ao executar o script do template.',
        buildScriptErrorDetails(result)
      );
    }
    await ensureArtifactExists(outputPath, 'O processamento concluiu sem gerar o arquivo final esperado.');
    return {
      fileName: path.basename(outputPath),
      filePath: outputPath,
      mimeType: mimeByExtension(outputPath),
    };
  }

  async function copyUploadedFileToPath(fileMeta, destinationPath) {
    if (!fileMeta?.path) {
      throw createValidationError('Arquivo temporario nao encontrado para preparar a execucao do template.');
    }
    ensureDir(path.dirname(destinationPath));
    await fs.promises.copyFile(fileMeta.path, destinationPath);
    return destinationPath;
  }

  function extractRegCode(line) {
    const text = String(line || '').trim();
    if (!text.startsWith('|')) return '';
    const match = text.match(/^\|([0-9A-Z]{4})\|/);
    return match ? match[1] : '';
  }

  async function isLikelyFullSpedTxt(filePath) {
    if (!filePath || normalizeKey(path.extname(filePath)) !== '.txt') return false;
    let raw = '';
    try {
      raw = await fs.promises.readFile(filePath, 'latin1');
    } catch (_) {
      return false;
    }
    const lines = String(raw || '').split(/\r?\n/);
    let found0000 = false;
    for (const line of lines) {
      const reg = extractRegCode(line);
      if (!reg) continue;
      if (reg === '0000') {
        found0000 = true;
        continue;
      }
      if (found0000 && reg === '9999') {
        return true;
      }
    }
    return false;
  }

  async function runAutomaticRelationshipValidation({
    template,
    manifest,
    artifact,
    outputDir,
  }) {
    if (!manifest?.validators || manifest.validators.globalRelationshipValidation !== true) {
      return {
        status: 'skipped',
        reason: 'disabled_by_manifest',
      };
    }

    if (!artifact?.filePath || normalizeKey(path.extname(artifact.filePath)) !== '.txt') {
      return {
        status: 'skipped',
        reason: 'artifact_not_txt',
      };
    }

    const looksLikeSped = await isLikelyFullSpedTxt(artifact.filePath);
    if (!looksLikeSped) {
      return {
        status: 'skipped',
        reason: 'artifact_not_full_sped',
      };
    }

    const sped = findSpedType(template?.spedType);
    if (!sped) {
      throw createValidationError('Tipo de SPED invalido para validacao automatica.', [
        `Template: ${template?.id || '(desconhecido)'}`,
      ]);
    }

    const rulesFileRaw = String(manifest?.validators?.rulesFile || '').trim();
    const rulesFilePath = rulesFileRaw
      ? (path.isAbsolute(rulesFileRaw) ? rulesFileRaw : path.resolve(PROJECT_ROOT, rulesFileRaw))
      : path.join(LAYOUTS_ROOT, sped.layoutFolder, 'relationships', 'reference_domains.validator.json');
    if (!fs.existsSync(rulesFilePath)) {
      throw createValidationError('Arquivo de regras da validacao de relacionamentos nao encontrado.', [
        `Template: ${template?.id || '(desconhecido)'}`,
        `Regras: ${rulesFilePath}`,
      ]);
    }

    const layoutsDir = path.join(LAYOUTS_ROOT, sped.layoutFolder);
    if (!fs.existsSync(layoutsDir)) {
      throw createValidationError('Pasta de layouts nao encontrada para validacao automatica.', [
        `Template: ${template?.id || '(desconhecido)'}`,
        `Layouts: ${layoutsDir}`,
      ]);
    }

    const validatorPath = path.join(PROJECT_ROOT, 'api', 'speds_scripts', 'icms', 'sped_relationship_validator.py');
    if (!fs.existsSync(validatorPath)) {
      throw createValidationError('Script validador de relacionamentos nao encontrado no servidor.', [
        `Esperado em: ${validatorPath}`,
      ]);
    }

    const maxIssues = toNonNegativeInt(manifest?.validators?.maxIssues, 200) || 200;
    const reportName = `${sanitizeBaseName(path.parse(artifact.fileName || 'saida').name, 'saida')}_relationship_validation.json`;
    const reportPath = path.join(outputDir, reportName);
    const validatorArgs = [
      artifact.filePath,
      '--layouts-dir',
      layoutsDir,
      '--rules-file',
      rulesFilePath,
      '--max-issues',
      String(maxIssues),
      '--output-json',
      reportPath,
    ];

    const result = await runPythonScript(validatorPath, validatorArgs);
    if (result.code !== 0) {
      throw createValidationError(
        'Arquivo final reprovado na validacao automatica de relacionamentos do SPED.',
        buildScriptErrorDetails(result)
      );
    }

    let report = null;
    try {
      const raw = await fs.promises.readFile(reportPath, 'utf8');
      report = JSON.parse(String(raw || ''));
    } catch (_) {
      report = null;
    }

    return {
      status: 'ok',
      validator: 'sped_relationship_validator.py',
      reportFile: reportName,
      totalChecks: Number(report?.total_checks || 0),
      invalidRefs: Number(report?.invalid_refs || 0),
    };
  }

  function parseIssueSignature(signature) {
    const parts = String(signature || '').split('|');
    return {
      domain: parts[0] || '',
      record: parts[1] || '',
      field: parts[2] || '',
      value: parts.slice(3).join('|') || '',
    };
  }

  function getDomainMeta(domainId) {
    const key = normalizeKey(domainId);
    if (key === 'cod_item') {
      return {
        label: 'Codigo do item/produto',
        expectedDefinition: 'Registro 0200 (campo COD_ITEM).',
        fixHint: 'Cadastre o item no 0200 ou ajuste o COD_ITEM do registro que referencia este produto.',
      };
    }
    if (key === 'unid') {
      return {
        label: 'Unidade de medida',
        expectedDefinition: 'Registro 0190 (campo UNID).',
        fixHint: 'Inclua a unidade no 0190 ou ajuste o campo de unidade no registro informado.',
      };
    }
    if (key === 'cod_part') {
      return {
        label: 'Codigo do participante',
        expectedDefinition: 'Registro 0150 (campo COD_PART).',
        fixHint: 'Inclua o participante no 0150 ou ajuste o COD_PART no registro que usa esse codigo.',
      };
    }
    if (key === 'cod_cta') {
      return {
        label: 'Conta contabil',
        expectedDefinition: 'Registro 0500 (campo COD_CTA).',
        fixHint: 'Inclua a conta no 0500 ou revise o COD_CTA informado.',
      };
    }
    if (key === 'cod_ccus') {
      return {
        label: 'Centro de custo',
        expectedDefinition: 'Registro 0600 (campo COD_CCUS).',
        fixHint: 'Inclua o centro de custo no 0600 ou ajuste o COD_CCUS nos registros de origem.',
      };
    }
    if (key === 'cod_inf') {
      return {
        label: 'Codigo de informacao complementar',
        expectedDefinition: 'Registro 0450 (campo COD_INF).',
        fixHint: 'Inclua o codigo no 0450 ou ajuste o COD_INF referenciado.',
      };
    }
    return {
      label: domainId || 'Dominio interno',
      expectedDefinition: 'Cadastro interno correspondente no SPED.',
      fixHint: 'Revise o valor informado no registro de origem e garanta que o cadastro de referencia exista.',
    };
  }

  function describeReferenceTarget(record, field) {
    const rec = String(record || '').trim().toUpperCase();
    const fld = String(field || '').trim().toUpperCase();
    if (!rec && !fld) return 'registro e campo nao identificados';
    if (!fld) return `registro ${rec}`;
    if (!rec) return `campo ${fld}`;
    return `registro ${rec}, campo ${fld}`;
  }

  function buildValidationFindings(report, opts = {}) {
    const maxSignatures = toNonNegativeInt(opts.maxSignatures, 20) || 20;
    const maxOccurrences = toNonNegativeInt(opts.maxOccurrences, 80) || 80;
    const totalLines = Number(report?.total_lines || 0);
    const totalChecks = Number(report?.total_checks || 0);
    const invalidRefs = Number(report?.invalid_refs || 0);

    const defs = report?.definitions_count && typeof report.definitions_count === 'object'
      ? report.definitions_count
      : {};
    const domainsWithout = Array.isArray(report?.domains_without_definitions)
      ? report.domains_without_definitions
      : [];

    const signatureMap = report?.issue_signature_counts && typeof report.issue_signature_counts === 'object'
      ? report.issue_signature_counts
      : {};
    const signatureLabels = report?.issue_signature_labels && typeof report.issue_signature_labels === 'object'
      ? report.issue_signature_labels
      : {};
    const grouped = Object.entries(signatureMap)
      .map(([signature, count]) => ({ signature, count: Number(count || 0), ...parseIssueSignature(signature) }))
      .sort((a, b) => (b.count - a.count) || a.signature.localeCompare(b.signature))
      .slice(0, Math.max(1, maxSignatures))
      .map((row) => {
        const labelInfo = signatureLabels[row.signature] && typeof signatureLabels[row.signature] === 'object'
          ? signatureLabels[row.signature]
          : null;
        const meta = getDomainMeta(row.domain);
        const target = describeReferenceTarget(row.record, row.field);
        const domainLabel = labelInfo?.error_code
          ? `${labelInfo.error_code}`
          : meta.label;
        const message = String(labelInfo?.message || '').trim() || `Valor '${row.value || ''}' sem cadastro para ${target}.`;
        const howToFix = String(labelInfo?.fix_hint || '').trim() || meta.fixHint;
        const expectedDefinition = String(labelInfo?.expected_definition || '').trim() || meta.expectedDefinition;
        return {
          signature: row.signature,
          count: row.count,
          domain: row.domain || '',
          domainLabel,
          record: row.record || '',
          field: row.field || '',
          value: row.value || '',
          message,
          expectedDefinition,
          howToFix,
        };
      });

    const issues = Array.isArray(report?.issues) ? report.issues : [];
    const firstOccurrences = issues
      .slice(0, Math.max(1, maxOccurrences))
      .map((issue) => {
        const meta = getDomainMeta(issue?.domain);
        const target = describeReferenceTarget(issue?.record, issue?.field);
        const message = String(issue?.message || '').trim() || `Valor '${issue?.value || ''}' sem cadastro para ${target}.`;
        const howToFix = String(issue?.fix_hint || '').trim() || meta.fixHint;
        return {
          lineNumber: Number(issue?.line_number || 0),
          domain: issue?.domain || '',
          domainLabel: meta.label,
          record: issue?.record || '',
          field: issue?.field || '',
          value: issue?.value || '',
          normalizedValue: issue?.normalized_value || '',
          message,
          howToFix,
        };
      });

    const domainsWithoutDefinitions = domainsWithout.map((domainId) => {
      const meta = getDomainMeta(domainId);
      return {
        domain: domainId,
        domainLabel: meta.label,
        expectedDefinition: meta.expectedDefinition,
        howToFix: meta.fixHint,
      };
    });

    return {
      status: invalidRefs === 0 ? 'ok' : 'issues_found',
      totals: {
        lines: totalLines,
        checks: totalChecks,
        invalidRefs,
      },
      definitionsCount: defs,
      domainsWithoutDefinitions,
      groupedIssues: grouped,
      firstOccurrences,
    };
  }

  function buildSpedValidationTxtReport({ templateTitle, inputName, report, maxSignatures = 50 }) {
    const lines = [];
    lines.push(templateTitle || 'Validacao SPED');
    lines.push(`Arquivo analisado: ${inputName || '(desconhecido)'}`);
    lines.push('');
    lines.push('Resumo da validacao:');
    lines.push(`- Linhas lidas: ${Number(report?.total_lines || 0)}`);
    lines.push(`- Checagens executadas: ${Number(report?.total_checks || 0)}`);
    lines.push(`- Pendencias (referencias invalidas): ${Number(report?.invalid_refs || 0)}`);
    lines.push(`- Status: ${report?.ok ? 'SEM PENDENCIAS' : 'COM PENDENCIAS'}`);

    const defs = report?.definitions_count && typeof report.definitions_count === 'object'
      ? report.definitions_count
      : {};
    const domainsWithout = Array.isArray(report?.domains_without_definitions)
      ? report.domains_without_definitions
      : [];
    lines.push('');
    lines.push('Definicoes por dominio:');
    const defKeys = Object.keys(defs).sort((a, b) => a.localeCompare(b));
    if (defKeys.length === 0) lines.push('- (nenhum dominio encontrado)');
    for (const key of defKeys) {
      lines.push(`- ${key}: ${Number(defs[key] || 0)}`);
    }
    if (domainsWithout.length > 0) {
      lines.push('');
      lines.push('Dominios sem definicao no arquivo:');
      for (const domain of domainsWithout) lines.push(`- ${domain}`);
    }

    const sigMap = report?.issue_signature_counts && typeof report.issue_signature_counts === 'object'
      ? report.issue_signature_counts
      : {};
    const sigRows = Object.entries(sigMap)
      .map(([signature, count]) => ({ signature, count: Number(count || 0), ...parseIssueSignature(signature) }))
      .sort((a, b) => (b.count - a.count) || a.signature.localeCompare(b.signature))
      .slice(0, Math.max(1, Number(maxSignatures || 50)));

    lines.push('');
    lines.push(`Pendencias agrupadas (top ${sigRows.length}):`);
    if (sigRows.length === 0) {
      lines.push('- (nenhuma pendencia)');
    } else {
      for (const row of sigRows) {
        lines.push(
          `- +${row.count} | ${row.record}.${row.field} => '${row.value}' (dominio ${row.domain})`
        );
      }
    }

    const issues = Array.isArray(report?.issues) ? report.issues : [];
    lines.push('');
    lines.push(`Primeiras ocorrencias detalhadas (${issues.length}):`);
    if (issues.length === 0) {
      lines.push('- (nenhuma pendencia detalhada)');
    } else {
      for (const issue of issues) {
        lines.push(
          `- linha ${Number(issue.line_number || 0)} | ${issue.record || ''}.${issue.field || ''} => '${issue.value || ''}'`
        );
      }
    }
    return `${lines.join('\n')}\n`;
  }

  function writeSpedValidationXlsxReport({ inputName, report, outputPath, maxSignatures = 200 }) {
    const wb = XLSX.utils.book_new();
    const summaryRows = [
      { campo: 'Arquivo analisado', valor: inputName || '' },
      { campo: 'Linhas lidas', valor: Number(report?.total_lines || 0) },
      { campo: 'Checagens executadas', valor: Number(report?.total_checks || 0) },
      { campo: 'Pendencias (referencias invalidas)', valor: Number(report?.invalid_refs || 0) },
      { campo: 'Status', valor: report?.ok ? 'SEM PENDENCIAS' : 'COM PENDENCIAS' },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resumo');

    const defs = report?.definitions_count && typeof report.definitions_count === 'object'
      ? report.definitions_count
      : {};
    const defsRows = Object.keys(defs)
      .sort((a, b) => a.localeCompare(b))
      .map((domain) => ({ dominio: domain, definicoes: Number(defs[domain] || 0) }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(defsRows.length ? defsRows : [{ dominio: '(nenhum)', definicoes: 0 }]),
      'Dominios'
    );

    const sigMap = report?.issue_signature_counts && typeof report.issue_signature_counts === 'object'
      ? report.issue_signature_counts
      : {};
    const sigRows = Object.entries(sigMap)
      .map(([signature, count]) => ({ ocorrencias: Number(count || 0), ...parseIssueSignature(signature) }))
      .sort((a, b) => (b.ocorrencias - a.ocorrencias))
      .slice(0, Math.max(1, Number(maxSignatures || 200)));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sigRows.length ? sigRows : [{ ocorrencias: 0, domain: '', record: '', field: '', value: '' }]),
      'Pendencias agrupadas'
    );

    const issues = Array.isArray(report?.issues) ? report.issues : [];
    const issueRows = issues.map((issue) => ({
      linha: Number(issue.line_number || 0),
      registro: issue.record || '',
      campo: issue.field || '',
      valor: issue.value || '',
      valor_normalizado: issue.normalized_value || '',
      dominio: issue.domain || '',
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(issueRows.length ? issueRows : [{ linha: 0, registro: '', campo: '', valor: '', valor_normalizado: '', dominio: '' }]),
      'Ocorrencias'
    );

    XLSX.writeFile(wb, outputPath);
  }

  async function runContribuicoesValidadorSpedTemplate({ filesByInput, fields, outputDir, outputFormat }) {
    const spedFile = getSingleInputFile(filesByInput, 'sped_txt');
    if (!spedFile?.path) {
      throw createValidationError('Arquivo SPED de Contribuicoes nao encontrado para validacao.');
    }

    const validatorPath = path.join(PROJECT_ROOT, 'api', 'speds_scripts', 'icms', 'sped_relationship_validator.py');
    if (!fs.existsSync(validatorPath)) {
      throw createValidationError('Script validador de relacionamentos nao encontrado no servidor.', [
        `Esperado em: ${validatorPath}`,
      ]);
    }

    const layoutsDir = path.join(LAYOUTS_ROOT, 'contribuicoes');
    const rulesPath = path.join(layoutsDir, 'relationships', 'reference_domains.validator.json');
    if (!fs.existsSync(layoutsDir) || !fs.existsSync(rulesPath)) {
      throw createValidationError('Layouts/regras de Contribuicoes nao encontrados para validacao.', [
        `Layouts: ${layoutsDir}`,
        `Rules: ${rulesPath}`,
      ]);
    }

    const maxIssues = toNonNegativeInt(fields?.max_issues, 200) || 200;
    const inputName = spedFile.originalName || path.basename(spedFile.path);
    const inputStem = sanitizeBaseName(path.parse(inputName).name, 'sped_contribuicoes');
    const jsonReportPath = path.join(outputDir, `${inputStem}_validacao_contribuicoes.json`);
    const args = [
      spedFile.path,
      '--layouts-dir',
      layoutsDir,
      '--rules-file',
      rulesPath,
      '--max-issues',
      String(maxIssues),
      '--output-json',
      jsonReportPath,
    ];

    const result = await runPythonScript(validatorPath, args);
    if (![0, 4].includes(Number(result?.code ?? 1))) {
      throw createValidationError(
        'Falha ao validar o SPED de Contribuicoes.',
        buildScriptErrorDetails(result)
      );
    }
    await ensureArtifactExists(jsonReportPath, 'A validacao concluiu sem gerar relatorio JSON.');

    let report = null;
    try {
      const raw = await fs.promises.readFile(jsonReportPath, 'utf8');
      report = JSON.parse(String(raw || ''));
    } catch (error) {
      throw createValidationError('Falha ao ler o relatorio JSON da validacao.', [
        `Arquivo: ${jsonReportPath}`,
        `Detalhe: ${error?.message || error}`,
      ]);
    }
    const validationFindings = buildValidationFindings(report, {
      maxSignatures: Math.min(maxIssues, 25),
      maxOccurrences: Math.min(maxIssues, 80),
    });

    if (normalizeKey(outputFormat) === 'xlsx') {
      const outputPath = path.join(outputDir, `${inputStem}_pendencias_validacao_contribuicoes.xlsx`);
      writeSpedValidationXlsxReport({
        inputName,
        report,
        outputPath,
        maxSignatures: maxIssues,
      });
      return {
        artifact: {
          fileName: path.basename(outputPath),
          filePath: outputPath,
          mimeType: mimeByExtension(outputPath),
        },
        summaryPatch: {
          validationFindings,
        },
      };
    }

    const outputPath = path.join(outputDir, `${inputStem}_pendencias_validacao_contribuicoes.txt`);
    const txt = buildSpedValidationTxtReport({
      templateTitle: 'Validador SPED Contribuicoes',
      inputName,
      report,
      maxSignatures: maxIssues,
    });
    await fs.promises.writeFile(outputPath, txt, 'utf8');
    return {
      artifact: {
        fileName: path.basename(outputPath),
        filePath: outputPath,
        mimeType: mimeByExtension(outputPath, 'text/plain; charset=utf-8'),
      },
      summaryPatch: {
        validationFindings,
      },
    };
  }

  async function runContribuicoesCorrigirParticipantesTemplate({ template, filesByInput, outputDir }) {
    const spedFile = getSingleInputFile(filesByInput, 'sped_txt');
    const notesFile = getSingleInputFile(filesByInput, 'xml_notas');
    if (!spedFile?.path || !notesFile?.path) {
      throw createValidationError('Arquivos obrigatorios nao encontrados para Corrigir participantes (Contribuicoes).');
    }

    const inputName = spedFile.originalName || path.basename(spedFile.path);
    const inputStem = sanitizeBaseName(path.parse(inputName).name, 'sped_contribuicoes');
    const fallbackOutputName = `${inputStem}_PARTICIPANTES_CONTRIBUICOES_CORRIGIDOS.txt`;
    const outputName = buildTemplateOutputName(template, inputName, fallbackOutputName);
    const outputPath = path.join(outputDir, outputName);
    const pyArgs = [
      '--sped',
      spedFile.path,
      '--notas',
      notesFile.path,
      '--output',
      outputPath,
    ];

    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar a correcao de participantes de Contribuicoes.',
    });
  }

  async function runIcmsCorrigirParticipantesTemplate({ template, filesByInput, outputDir }) {
    const spedFile = getSingleInputFile(filesByInput, 'sped_txt');
    const xmlArchive = getSingleInputFile(filesByInput, 'xml_arquivos');
    if (!spedFile?.path || !xmlArchive?.path) {
      throw createValidationError('Arquivos obrigatorios nao encontrados para Corrigir participantes (ICMS).');
    }

    const inputName = spedFile.originalName || path.basename(spedFile.path);
    const inputStem = sanitizeBaseName(path.parse(inputName).name, 'sped_icms');
    const fallbackOutputName = `${inputStem}_PARTICIPANTES_ICMS_CORRIGIDOS.txt`;
    const outputName = buildTemplateOutputName(template, inputName, fallbackOutputName);
    const outputPath = path.join(outputDir, outputName);
    const pyArgs = [
      '--sped',
      spedFile.path,
      '--xml-archive',
      xmlArchive.path,
      '--output',
      outputPath,
    ];

    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar a correcao de participantes de ICMS.',
    });
  }

  async function runIcmsCorretorTotalInventarioTemplate({ template, filesByInput, fields, outputDir }) {
    const inputFile = getSingleInputFile(filesByInput, 'sped_txt');
    if (!inputFile?.path) {
      throw createValidationError('Arquivo SPED de entrada nao encontrado para processamento.');
    }

    let expectedValue = normalizeExpectedValue(fields?.valor_esperado);
    if (!expectedValue) {
      expectedValue = await guessH005InventoryValue(inputFile.path);
    }
    if (!expectedValue) {
      throw createValidationError('Nao foi possivel definir o valor esperado do inventario.', [
        'Informe o campo "Valor esperado do inventario" para esta execucao.',
      ]);
    }

    const maxExclusions = toNonNegativeInt(fields?.max_exclusoes, 10);
    const inputName = inputFile.originalName || path.basename(inputFile.path);
    const inputStem = sanitizeBaseName(path.parse(inputName).name, 'sped_icms');
    const outputName = `${inputStem}_CORRIGIDO_INVENTARIO.txt`;
    const outputPath = path.join(outputDir, outputName);

    const pyArgs = [
      inputFile.path,
      '--valor-esperado',
      expectedValue,
      '--max-exclusoes',
      String(maxExclusions),
      '--output',
      outputPath,
    ];
    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar o Corretor total de inventario.',
    });
  }

  async function runContribuicoesConferidorXmlTemplate({ template, filesByInput, fields, outputDir }) {
    const xmlFiles = getInputFiles(filesByInput, 'xml_notas');
    if (xmlFiles.length === 0) {
      throw createValidationError('Envie ao menos um XML/ZIP/RAR para o conferidor de XML.');
    }

    const xmlRootDir = path.join(outputDir, 'xml_input');
    await copyXmlInputsToDir(xmlFiles, xmlRootDir);

    const progressEvery = toNonNegativeInt(fields?.progress_every, 500) || 500;
    const outputPath = path.join(outputDir, `conferidor_xml_${Date.now()}.xlsx`);
    const pyArgs = [
      '--xml-dir',
      xmlRootDir,
      '--progress-every',
      String(progressEvery),
      '--output',
      outputPath,
    ];
    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar o Conferidor XML de Contribuicoes.',
    });
  }

  async function runContribuicoesConsolidarSpedsTemplate({ template, filesByInput, outputDir }) {
    const matrizFile = getSingleInputFile(filesByInput, 'sped_matriz');
    const filialFiles = getInputFiles(filesByInput, 'speds_filiais');

    if (!matrizFile?.path) {
      throw createValidationError('Arquivo da matriz nao encontrado para consolidacao dos SPEDs.');
    }
    if (filialFiles.length === 0) {
      throw createValidationError('Envie ao menos um SPED de filial para consolidacao.');
    }

    const stagingDir = path.join(outputDir, 'inputs');
    const matrizOriginalName = path.basename(matrizFile.originalName || '') || 'sped_matriz.txt';
    const matrizLocalPath = path.join(stagingDir, 'matriz', matrizOriginalName);
    await copyUploadedFileToPath(matrizFile, matrizLocalPath);

    const filialLocalPaths = [];
    for (const [index, filialFile] of filialFiles.entries()) {
      const filialOriginalName = path.basename(filialFile.originalName || '') || `filial_${String(index + 1).padStart(2, '0')}.txt`;
      const filialLocalPath = path.join(
        stagingDir,
        'filiais',
        `${String(index + 1).padStart(2, '0')}_${filialOriginalName}`
      );
      await copyUploadedFileToPath(filialFile, filialLocalPath);
      filialLocalPaths.push(filialLocalPath);
    }

    const outputPath = path.join(outputDir, path.basename(matrizLocalPath));
    const pyArgs = [matrizLocalPath, ...filialLocalPaths, '--out', outputDir, '--overwrite'];

    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar a consolidacao de SPEDs de Contribuicoes.',
    });
  }

  async function runIcmsAjustarCfopTemplate({ template, filesByInput, fields, outputDir }) {
    const spedFile = getSingleInputFile(filesByInput, 'sped_txt');
    if (!spedFile?.path) {
      throw createValidationError('Arquivo SPED de entrada nao encontrado para ajuste de CFOP.');
    }

    const cfop = String(fields?.cfop || '1152').trim() || '1152';
    const stem = sanitizeBaseName(path.parse(spedFile.originalName || path.basename(spedFile.path)).name, 'sped_icms');
    const outputPath = path.join(outputDir, `${stem}_CFOP_${sanitizeBaseName(cfop, '1152')}_AJUSTADO.txt`);
    const layoutsDir = path.join(LAYOUTS_ROOT, 'icms');
    const pyArgs = [
      spedFile.path,
      '--cfop',
      cfop,
      '--layouts-dir',
      layoutsDir,
      '--output',
      outputPath,
    ];
    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar o Ajustar CFOP alvo.',
    });
  }

  async function runIcmsComparadorTemplate({ template, filesByInput, fields, outputDir }) {
    const spedFile = getSingleInputFile(filesByInput, 'sped_txt');
    const reportEntradas = getSingleInputFile(filesByInput, 'relatorio_entradas');
    const reportSaidas = getSingleInputFile(filesByInput, 'relatorio_saidas');
    if (!spedFile?.path) {
      throw createValidationError('Arquivo SPED obrigatorio nao encontrado para o Comparador SPED x Relatorio.');
    }
    if (!reportEntradas?.path && !reportSaidas?.path) {
      throw createValidationError('Envie ao menos um relatorio: entradas e/ou saidas.');
    }

    const baseRefFile = reportEntradas || reportSaidas || spedFile;
    const repStem = sanitizeBaseName(path.parse(baseRefFile.originalName || path.basename(baseRefFile.path)).name, 'relatorio');
    const outputPath = path.join(outputDir, `${repStem}_diferencas_conferencia.xlsx`);
    const layoutsDir = path.join(LAYOUTS_ROOT, 'icms');
    const pyArgs = [spedFile.path, '--layouts-dir', layoutsDir, '--output', outputPath];
    if (reportEntradas?.path) pyArgs.push('--relatorio-entradas', reportEntradas.path);
    if (reportSaidas?.path) pyArgs.push('--relatorio-saidas', reportSaidas.path);

    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar o Comparador SPED x Relatorio.',
    });
  }

  async function runIcmsGeradorInventarioTemplate({ template, filesByInput, fields, outputDir }) {
    const reportFile = getSingleInputFile(filesByInput, 'relatorio_inventario');
    if (!reportFile?.path) {
      throw createValidationError('Arquivo de relatorio nao encontrado para o Gerador de inventario.');
    }

    const reportStem = sanitizeBaseName(path.parse(reportFile.originalName || path.basename(reportFile.path)).name, 'inventario');
    const outputPath = path.join(outputDir, `${reportStem}_inventario_sped.txt`);
    const pyArgs = [reportFile.path, '--output', outputPath];

    const dtInv = String(fields?.dt_inv || '').trim() || formatDatePtBr();
    pyArgs.push('--dt-inv', dtInv);
    pushArgIfPresent(pyArgs, '--mot-inv', fields?.mot_inv);
    pushArgIfPresent(pyArgs, '--tipo-item', fields?.tipo_item);
    pushArgIfPresent(pyArgs, '--default-unid', fields?.default_unid);
    pushArgIfPresent(pyArgs, '--ind-prop', fields?.ind_prop);
    pushArgIfPresent(pyArgs, '--cod-part', fields?.cod_part);
    pushArgIfPresent(pyArgs, '--txt-compl', fields?.txt_compl);
    pushArgIfPresent(pyArgs, '--cod-cta', fields?.cod_cta);
    pushArgIfPresent(pyArgs, '--h020-cst-icms', fields?.h020_cst_icms);
    pushArgIfPresent(pyArgs, '--h020-aliq-icms', fields?.h020_aliq_icms);

    if (normalizeBoolField(fields?.preencher_vl_item_ir, false)) pyArgs.push('--preencher-vl-item-ir');
    if (normalizeBoolField(fields?.gerar_h020, false)) pyArgs.push('--gerar-h020');
    if (normalizeBoolField(fields?.sem_perguntas, true)) pyArgs.push('--sem-perguntas');

    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar o Gerador de inventario.',
    });
  }

  async function runIcmsIntegrarInventarioTemplate({ template, filesByInput, fields, outputDir }) {
    const spedOriginal = getSingleInputFile(filesByInput, 'sped_original');
    const inventarioGerado = getSingleInputFile(filesByInput, 'inventario_gerado');
    if (!spedOriginal?.path || !inventarioGerado?.path) {
      throw createValidationError('Arquivos obrigatorios nao encontrados para Integrar inventario no SPED.');
    }

    const baseStem = sanitizeBaseName(path.parse(spedOriginal.originalName || path.basename(spedOriginal.path)).name, 'sped_icms');
    const outputPath = path.join(outputDir, `${baseStem}_COM_INVENTARIO.txt`);
    const pyArgs = [spedOriginal.path, inventarioGerado.path, '--output', outputPath];
    pushArgIfPresent(pyArgs, '--default-cod-cta', fields?.default_cod_cta);

    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar a integracao do inventario no SPED.',
    });
  }

  async function runIcmsCopiarBlocoKTemplate({ template, filesByInput, fields, outputDir }) {
    const spedDestino = getSingleInputFile(filesByInput, 'sped_destino');
    const spedOrigemK = getSingleInputFile(filesByInput, 'sped_origem_k');
    if (!spedDestino?.path || !spedOrigemK?.path) {
      throw createValidationError('Arquivos obrigatorios nao encontrados para Copiar Bloco K.');
    }

    const mode = normalizeKey(fields?.modo_produto_faltante) === 'erro' ? 'erro' : 'incluir';
    const baseStem = sanitizeBaseName(path.parse(spedDestino.originalName || path.basename(spedDestino.path)).name, 'sped_icms');
    const outputPath = path.join(outputDir, `${baseStem}_COM_BLOCO_K.txt`);
    const pyArgs = [
      spedDestino.path,
      spedOrigemK.path,
      '--modo-produto-faltante',
      mode,
      '--output',
      outputPath,
    ];

    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar a copia do Bloco K.',
    });
  }

  async function runEcfGeradorBlocoCustoTemplate({ template, filesByInput, fields, outputDir }) {
    const apuracao = normalizeKey(fields?.apuracao) === 'trimestral' ? 'trimestral' : 'mensal';
    const outputPath = path.join(outputDir, `L210_${apuracao}_${Date.now()}.txt`);
    const outputCsvPath = path.join(outputDir, `L210_${apuracao}_conferencia_${Date.now()}.csv`);
    const manualRowsPayload = parseJsonOrDefault(fields?.manual_rows_json, null);
    const hasManualRows = Array.isArray(manualRowsPayload)
      || (manualRowsPayload && Array.isArray(manualRowsPayload.rows));

    const pyArgs = ['--apuracao', apuracao, '--output-txt', outputPath, '--output-csv', outputCsvPath];

    if (hasManualRows) {
      const manualRowsPath = path.join(outputDir, `L210_manual_rows_${Date.now()}.json`);
      await fs.promises.writeFile(manualRowsPath, JSON.stringify(manualRowsPayload, null, 2), 'utf8');
      pyArgs.push('--manual-rows-file', manualRowsPath);
    } else {
      const stockFile = getSingleInputFile(filesByInput, 'razao_estoque');
      const costFile = getSingleInputFile(filesByInput, 'razao_custo');
      if (!stockFile?.path || !costFile?.path) {
        throw createValidationError('Preencha o quadro manual do L210 ou envie os arquivos de razao para o modo legado.');
      }

      const temFabricacao = normalizeBoolField(fields?.tem_fabricacao, false);
      const temRevenda = normalizeBoolField(fields?.tem_revenda, true);
      pyArgs.push(
        '--tem-fabricacao',
        temFabricacao ? 'sim' : 'nao',
        '--tem-revenda',
        temRevenda ? 'sim' : 'nao',
        '--razao-estoque',
        stockFile.path,
        '--razao-custo',
        costFile.path,
      );
    }

    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar o Gerador bloco custo L210.',
    });
  }

  async function runEcfGerarLayoutsJsonTemplate({ template, filesByInput, fields, outputDir, outputFormat }) {
    const manualPdf = getSingleInputFile(filesByInput, 'manual_pdf');
    if (!manualPdf?.path) {
      throw createValidationError('Manual ECF em PDF nao encontrado para gerar layouts.');
    }

    const generatedLayoutsDir = path.join(outputDir, 'layouts_json');
    ensureDir(generatedLayoutsDir);
    const pyArgs = [
      '--source-pdf',
      manualPdf.path,
      '--output-dir',
      generatedLayoutsDir,
    ];
    if (normalizeBoolField(fields?.sobrescrever_layouts, false)) {
      pyArgs.push('--overwrite');
    }

    const scriptPath = ensureTemplateScriptPath(template);
    const result = await runPythonScript(scriptPath, pyArgs);
    if (result.code !== 0) {
      throw createValidationError('Falha ao gerar layouts JSON da ECF.', buildScriptErrorDetails(result));
    }

    const files = (await fs.promises.readdir(generatedLayoutsDir))
      .filter((name) => normalizeKey(path.extname(name)) === '.json')
      .sort((a, b) => a.localeCompare(b));
    if (files.length === 0) {
      throw createValidationError('O script concluiu, mas nenhum layout JSON foi gerado.');
    }

    if (normalizeKey(outputFormat) === 'xlsx') {
      const rows = [];
      for (const fileName of files) {
        const fullPath = path.join(generatedLayoutsDir, fileName);
        const stat = await fs.promises.stat(fullPath);
        rows.push({
          arquivo: fileName,
          tamanho_bytes: stat.size,
          tamanho: formatBytes(stat.size),
        });
      }
      const outputPath = path.join(outputDir, `layouts_ecf_${Date.now()}.xlsx`);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Layouts');
      XLSX.writeFile(wb, outputPath);
      return {
        fileName: path.basename(outputPath),
        filePath: outputPath,
        mimeType: mimeByExtension(outputPath),
      };
    }

    const outputPath = path.join(outputDir, `layouts_ecf_${Date.now()}.txt`);
    const content = [
      'Layouts ECF gerados:',
      ...files.map((name) => `- ${name}`),
      '',
      `Total: ${files.length}`,
    ].join('\n');
    await fs.promises.writeFile(outputPath, `${content}\n`, 'utf8');
    return {
      fileName: path.basename(outputPath),
      filePath: outputPath,
      mimeType: mimeByExtension(outputPath, 'text/plain; charset=utf-8'),
    };
  }

  async function runEcdCompararJ150DreMensalTemplate({ template, filesByInput, outputDir }) {
    const spedFile = getSingleInputFile(filesByInput, 'sped_ecd');
    const dreFile = getSingleInputFile(filesByInput, 'dre_mensal');
    const balancoFile = getSingleInputFile(filesByInput, 'balanco_patrimonial');

    if (!spedFile?.path) {
      throw createValidationError('Arquivo SPED ECD obrigatorio nao encontrado para a comparacao do J150.');
    }
    if (!dreFile?.path && !balancoFile?.path) {
      throw createValidationError('Envie ao menos um arquivo para comparacao: DRE mensal e/ou balanco patrimonial.');
    }

    const baseFile = dreFile || balancoFile || spedFile;
    const baseStem = sanitizeBaseName(
      path.parse(baseFile.originalName || path.basename(baseFile.path)).name,
      'comparacao_j150_ecd_dre'
    );
    const outputPath = path.join(outputDir, `${baseStem}_comparacao_j150_ecd_dre.xlsx`);
    const pyArgs = [
      '--ecd',
      spedFile.path,
      '--output',
      outputPath,
      '--no-gui',
    ];
    if (dreFile?.path) {
      pyArgs.push('--excel', dreFile.path);
    }
    if (balancoFile?.path) {
      pyArgs.push('--balanco', balancoFile.path);
    }

    return executeTemplateScript({
      template,
      scriptArgs: pyArgs,
      outputPath,
      failureLabel: 'Falha ao processar o comparador J150 da ECD com a DRE mensal.',
    });
  }

  async function runEcfY570FontesPagadorasTemplate({ template, filesByInput, outputDir }) {
    const { preview } = await buildEcfY570Preview({
      filesByInput,
      outputDir,
      jobId: path.basename(outputDir),
    });
    const exported = await exportEcfY570Txt({ preview, outputDir, jobId: preview.jobId });
    return {
      artifact: exported.artifact,
      summaryPatch: {
        y570: preview,
      },
    };
  }

  const TEMPLATE_RUNNERS = {
    'contribuicoes-conferidor-xml-nfe': runContribuicoesConferidorXmlTemplate,
    'contribuicoes-corrigir-participantes-sped': runContribuicoesCorrigirParticipantesTemplate,
    'contribuicoes-consolidar-speds': runContribuicoesConsolidarSpedsTemplate,
    'contribuicoes-validador-sped': runContribuicoesValidadorSpedTemplate,
    'ecd-comparar-j150-dre-mensal': runEcdCompararJ150DreMensalTemplate,
    'icms-ajustar-cfop-1152': runIcmsAjustarCfopTemplate,
    'icms-corrigir-participantes-sped': runIcmsCorrigirParticipantesTemplate,
    'icms-comparador-sped-relatorio': runIcmsComparadorTemplate,
    'icms-corretor-total-inventario': runIcmsCorretorTotalInventarioTemplate,
    'icms-gerador-inventario': runIcmsGeradorInventarioTemplate,
    'icms-integrar-inventario-sped': runIcmsIntegrarInventarioTemplate,
    'icms-copiar-bloco-k-sped': runIcmsCopiarBlocoKTemplate,
    'ecf-gerador-bloco-custo-l210': runEcfGeradorBlocoCustoTemplate,
    'ecf-y570-fontes-pagadoras': runEcfY570FontesPagadorasTemplate,
    'ecf-gerar-layouts-json': runEcfGerarLayoutsJsonTemplate,
  };

  function buildTxtSummary(summary) {
    const lines = [];
    lines.push(`SPEDS - ${summary.templateTitle}`);
    lines.push(`SPED: ${summary.spedLabel}`);
    lines.push(`Template: ${summary.templateId}`);
    if (summary.scriptEntry) lines.push(`Script: ${summary.scriptEntry}`);
    if (summary.manifestPath) lines.push(`Manifesto: ${summary.manifestPath}`);
    lines.push(`Executado em: ${summary.executedAt}`);
    if (summary.relationshipValidation) {
      const rel = summary.relationshipValidation;
      lines.push(`Validacao relacionamento: ${rel.status || 'n/a'}`);
      if (rel.reason) lines.push(`Motivo: ${rel.reason}`);
      if (rel.totalChecks !== undefined) lines.push(`Checagens: ${rel.totalChecks}`);
      if (rel.invalidRefs !== undefined) lines.push(`Referencias invalidas: ${rel.invalidRefs}`);
    }
    if (summary.validationFindings) {
      const findings = summary.validationFindings;
      lines.push(`Validacao amigavel: ${findings.status || 'n/a'}`);
      lines.push(`Pendencias detectadas: ${Number(findings?.totals?.invalidRefs || 0)}`);
    }
    lines.push('');
    lines.push('Campos informados:');
    if (summary.fields.length === 0) lines.push('- (nenhum)');
    for (const field of summary.fields) {
      lines.push(`- ${field.label}: ${field.value}`);
    }
    lines.push('');
    lines.push('Arquivos recebidos:');
    if (summary.files.length === 0) lines.push('- (nenhum)');
    for (const file of summary.files) {
      lines.push(`- [${file.inputLabel}] ${file.fileName} (${file.sizeLabel})`);
      const analysis = file.analysis || {};
      if (analysis.pages !== undefined) lines.push(`  paginas: ${analysis.pages}`);
      if (analysis.sheetCount !== undefined) lines.push(`  abas: ${analysis.sheetCount}`);
      if (analysis.sampleLineCount !== undefined) lines.push(`  linhas (amostra): ${analysis.sampleLineCount}`);
      if (analysis.rootTagPreview) lines.push(`  tag xml: ${analysis.rootTagPreview}`);
      if (analysis.note) lines.push(`  nota: ${analysis.note}`);
    }
    return `${lines.join('\n')}\n`;
  }

  function writeXlsxSummary(summary, outputPath) {
    const wb = XLSX.utils.book_new();

    const overview = [
      { campo: 'SPED', valor: summary.spedLabel },
      { campo: 'Template', valor: summary.templateTitle },
      { campo: 'Template ID', valor: summary.templateId },
      { campo: 'Script', valor: summary.scriptEntry || '' },
      { campo: 'Manifesto', valor: summary.manifestPath || '' },
      { campo: 'Executado em', valor: summary.executedAt },
      { campo: 'Validacao relacionamento', valor: summary.relationshipValidation?.status || '' },
      { campo: 'Validacao motivo', valor: summary.relationshipValidation?.reason || '' },
      { campo: 'Validacao checagens', valor: summary.relationshipValidation?.totalChecks ?? '' },
      { campo: 'Validacao refs invalidas', valor: summary.relationshipValidation?.invalidRefs ?? '' },
      { campo: 'Validacao amigavel status', valor: summary.validationFindings?.status || '' },
      { campo: 'Validacao amigavel pendencias', valor: summary.validationFindings?.totals?.invalidRefs ?? '' },
      { campo: 'Arquivos recebidos', valor: summary.files.length },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), 'Resumo');

    const paramsRows = summary.fields.map((field) => ({
      campo: field.label,
      chave: field.key,
      valor: field.value,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(paramsRows.length ? paramsRows : [{ campo: '(nenhum)', chave: '', valor: '' }]),
      'Campos'
    );

    const filesRows = summary.files.map((file) => ({
      entrada: file.inputLabel,
      chave_entrada: file.inputKey,
      arquivo: file.fileName,
      extensao: file.extension,
      tamanho_bytes: file.sizeBytes,
      tamanho: file.sizeLabel,
      paginas_pdf: file.analysis.pages ?? '',
      abas_xlsx: file.analysis.sheetCount ?? '',
      linhas_amostra: file.analysis.sampleLineCount ?? '',
      observacao: file.analysis.note ?? '',
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(filesRows.length ? filesRows : [{ entrada: '(nenhum)' }]),
      'Arquivos'
    );

    XLSX.writeFile(wb, outputPath);
  }

  function formatPtBrMoney(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0,00';
    return num.toFixed(2).replace('.', ',');
  }

  function parsePtBrMoney(value) {
    const text = String(value ?? '').trim();
    if (!text) return 0;
    const normalized = text
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  }

  function parseFixedMoneyField(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return 0;
    return Number(digits) / 100;
  }

  function sanitizeY570Text(value) {
    return cleanText(String(value ?? '')).replace(/\|/g, ' ');
  }

  function normalizeY570OrgaoPublico(value) {
    const text = normalizeKey(value);
    if (text === 's' || text === 'sim' || text.startsWith('sim')) return 'S';
    return 'N';
  }

  function isY570YesFlag(value) {
    const text = normalizeKey(value);
    return text === 'sim' || text === 's' || text === 'yes' || text === 'true' || text === '1';
  }

  function isY570EditableOrgao(value) {
    const text = normalizeKey(value);
    return text.includes('sim ou nao');
  }

  function getY570AcceptedCodes() {
    if (y570AcceptedCodesCache) return y570AcceptedCodesCache;
    if (!fs.existsSync(Y570_CODES_PATH)) {
      throw createValidationError('Planilha fixa de codigos aceitos nao encontrada para o Y570.', [
        `Esperado em: ${Y570_CODES_PATH}`,
      ]);
    }

    const wb = XLSX.readFile(Y570_CODES_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const accepted = new Map();

    for (const row of rows.slice(1)) {
      const code = normalizeCode(row[0]);
      if (!code) continue;
      accepted.set(code, {
        code,
        description: cleanText(row[1] ?? ''),
        orgaoPublico: normalizeFlag(row[2] ?? ''),
        irrf: normalizeFlag(row[3] ?? ''),
        csll: normalizeFlag(row[4] ?? ''),
        aliquotaIrrf: '0,00',
        aliquotaCsll: '0,00',
      });
    }

    y570AcceptedCodesCache = accepted;
    return accepted;
  }

  function parseY570TxtRows(txtPath) {
    const rawBuffer = fs.readFileSync(txtPath);
    const text = rawBuffer.toString('latin1');
    const rows = [];

    for (const rawLine of String(text || '').split(/\r?\n/)) {
      const line = rawLine.replace(/\r$/, '');
      if (line.length < 213) continue;
      if (!/^\d{14}$/.test(line.slice(0, 14))) continue;

      const code = normalizeCode(line.slice(177, 181));
      if (!code) continue;

      rows.push({
        cnpj: line.slice(0, 14),
        nome: sanitizeY570Text(line.slice(17, 168)),
        code,
        rendimentoOriginal: parseFixedMoneyField(line.slice(182, 197)),
        tributoRetidoOriginal: parseFixedMoneyField(line.slice(198, 213)),
        sourceFile: path.basename(txtPath),
      });
    }

    return rows;
  }

  function chooseMostCommonName(counter) {
    let bestName = '';
    let bestCount = -1;
    for (const [name, count] of counter.entries()) {
      if (count > bestCount) {
        bestName = name;
        bestCount = count;
      }
    }
    return bestName;
  }

  function aggregateY570Rows(txtPaths, acceptedCodes) {
    const groupedAccepted = new Map();
    const namesByGroup = new Map();
    const codeOccurrences = new Map();
    const missingOccurrences = new Map();
    const fileNames = [];

    for (const txtPath of txtPaths) {
      const fileName = path.basename(txtPath);
      fileNames.push(fileName);
      for (const item of parseY570TxtRows(txtPath)) {
        if (acceptedCodes.has(item.code)) {
          const key = `${item.cnpj}|${item.code}`;
          const bucket = groupedAccepted.get(key) || {
            cnpj: item.cnpj,
            code: item.code,
            rendimentoOriginal: 0,
            tributoRetidoOriginal: 0,
            sourceCount: 0,
          };
          bucket.rendimentoOriginal += item.rendimentoOriginal;
          bucket.tributoRetidoOriginal += item.tributoRetidoOriginal;
          bucket.sourceCount += 1;
          groupedAccepted.set(key, bucket);

          if (!namesByGroup.has(key)) namesByGroup.set(key, new Map());
          const nameCounter = namesByGroup.get(key);
          nameCounter.set(item.nome, (nameCounter.get(item.nome) || 0) + 1);

          const current = codeOccurrences.get(item.code) || 0;
          codeOccurrences.set(item.code, current + 1);
        } else {
          const current = missingOccurrences.get(item.code) || 0;
          missingOccurrences.set(item.code, current + 1);
        }
      }
    }

    const sources = Array.from(groupedAccepted.entries())
      .sort((a, b) => (a[1].cnpj === b[1].cnpj ? a[1].code.localeCompare(b[1].code) : a[1].cnpj.localeCompare(b[1].cnpj)))
      .map(([key, bucket]) => {
        const accepted = acceptedCodes.get(bucket.code) || null;
        const nameCounter = namesByGroup.get(key) || new Map();
        const nome = chooseMostCommonName(nameCounter) || '';
        const orgaoPublicoRule = accepted ? accepted.orgaoPublico : 'Nao';
        const orgaoPublicoEditable = accepted ? isY570EditableOrgao(accepted.orgaoPublico) : false;
        const orgaoPublico = accepted && accepted.orgaoPublico === 'Sim' ? 'S' : 'N';
        const rendimentoOriginal = formatPtBrMoney(bucket.rendimentoOriginal);
        const tributoRetidoOriginal = formatPtBrMoney(bucket.tributoRetidoOriginal);
        const specialCode3426 = bucket.code === '3426';
        const irrfDefault = specialCode3426 ? tributoRetidoOriginal : '0,00';

        return {
          key,
          cnpj: bucket.cnpj,
          nome,
          code: bucket.code,
          orgaoPublico,
          orgaoPublicoEditable,
          orgaoPublicoRule,
          rendimentoOriginal,
          tributoRetidoOriginal,
          rendimentoEcf: rendimentoOriginal,
          rendimentoEcfNumber: bucket.rendimentoOriginal,
          irrf: irrfDefault,
          irrfAuto: irrfDefault,
          csll: '0,00',
          csllAuto: '0,00',
          irrfTributable: accepted ? isY570YesFlag(accepted.irrf) : false,
          csllTributable: accepted ? isY570YesFlag(accepted.csll) : false,
        };
      });

    const codes = Array.from(acceptedCodes.entries())
      .filter(([code]) => codeOccurrences.has(code))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, accepted]) => ({
        code,
        description: accepted.description,
        orgaoPublico: accepted.orgaoPublico,
        irrf: accepted.irrf,
        csll: accepted.csll,
        aliquotaIrrf: accepted.aliquotaIrrf || '0,00',
        aliquotaCsll: accepted.csll === 'Sim' ? '1,00' : '0,00',
        occurrences: codeOccurrences.get(code) || 0,
      }));

    const missing = Array.from(missingOccurrences.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, occurrences]) => ({ code, occurrences }));

    const totals = sources.reduce(
      (acc, row) => {
        acc.rendimento += parsePtBrMoney(row.rendimentoOriginal);
        acc.tributo += parsePtBrMoney(row.tributoRetidoOriginal);
        acc.rendimentoEcf += parsePtBrMoney(row.rendimentoEcf);
        acc.irrf += parsePtBrMoney(row.irrf);
        acc.csll += parsePtBrMoney(row.csll);
        return acc;
      },
      { rendimento: 0, tributo: 0, rendimentoEcf: 0, irrf: 0, csll: 0 }
    );

    return {
      files: fileNames,
      sources,
      codes,
      missing,
      stats: {
        fontesAgrupadas: sources.length,
        codigosLocalizados: codes.length,
        codigosNaoLocalizados: missing.length,
        rendimentoTotal: formatPtBrMoney(totals.rendimento),
        tributoTotal: formatPtBrMoney(totals.tributo),
        rendimentoEcfTotal: formatPtBrMoney(totals.rendimentoEcf),
        irrfTotal: formatPtBrMoney(totals.irrf),
        csllTotal: formatPtBrMoney(totals.csll),
      },
    };
  }

  function buildY570TxtFromPreview(preview) {
    const codeMap = new Map((Array.isArray(preview?.codes) ? preview.codes : []).map((row) => [normalizeCode(row.code), row]));
    const sources = Array.isArray(preview?.sources) ? preview.sources : [];
    const lines = [];

    for (const row of sources) {
      const code = normalizeCode(row.code);
      const codeInfo = codeMap.get(code) || null;
      if (!codeInfo) continue;
      const rendimentoEcf = parsePtBrMoney(row.rendimentoEcf ?? row.rendimentoEcfNumber ?? row.rendimentoOriginal);
      const irrfText = String(row.irrf ?? row.irrfAuto ?? '').trim();
      const csllText = String(row.csll ?? row.csllAuto ?? '').trim();
      const irrf = code === '3426'
        ? parsePtBrMoney(row.tributoRetidoOriginal)
        : (irrfText !== ''
          ? parsePtBrMoney(irrfText)
          : (codeInfo?.irrf === 'Sim' ? (rendimentoEcf * parsePtBrMoney(codeInfo?.aliquotaIrrf)) / 100 : 0));
      const csll = csllText !== ''
        ? parsePtBrMoney(csllText)
        : (codeInfo?.csll === 'Sim' ? (rendimentoEcf * parsePtBrMoney(codeInfo?.aliquotaCsll)) / 100 : 0);
      const orgaoPublico = normalizeY570OrgaoPublico(row.orgaoPublico);
      const nome = sanitizeY570Text(row.nome);

      lines.push(
        `|Y570|${row.cnpj}|${nome}|${orgaoPublico}|${code}|${formatPtBrMoney(rendimentoEcf)}|${formatPtBrMoney(irrf)}|${formatPtBrMoney(csll)}|`
      );
    }

    return `${lines.join('\r\n')}\r\n`;
  }

  async function buildEcfY570Preview({ filesByInput, outputDir, jobId } = {}) {
    const txtFiles = Array.isArray(filesByInput?.fontes_pagadoras_txt) ? filesByInput.fontes_pagadoras_txt : [];
    if (txtFiles.length === 0) {
      throw createValidationError('Nenhum TXT das fontes pagadoras foi enviado para o Y570.');
    }

    const acceptedCodes = getY570AcceptedCodes();
    const analyzedFiles = [];
    for (const file of txtFiles) {
      if (!file?.path) continue;
      const analysis = await inspectFile(file);
      analyzedFiles.push({
        inputKey: 'fontes_pagadoras_txt',
        inputLabel: 'TXT das fontes pagadoras',
        ...analysis,
      });
    }
    const aggregated = aggregateY570Rows(
      txtFiles
        .map((file) => file?.path)
        .filter(Boolean),
      acceptedCodes
    );

    const previewJobId = String(jobId || createJobId()).trim();
    const preview = {
      jobId: previewJobId,
      templateId: 'ecf-y570-fontes-pagadoras',
      generatedAt: new Date().toISOString(),
      ...aggregated,
    };
    const summary = {
      jobId: previewJobId,
      spedType: 'ecf',
      spedLabel: 'SPED ECF',
      templateId: 'ecf-y570-fontes-pagadoras',
      templateTitle: 'ECF - Y570 Fontes pagadoras',
      scriptEntry: 'api/speds_scripts/ecf/gerador_y570_fontes_pagadoras.py',
      manifestPath: 'api/layouts/speds/ecf/manifests/ecf-y570-fontes-pagadoras.manifest.json',
      executedAt: preview.generatedAt,
      fields: [],
      files: analyzedFiles,
      y570: preview,
    };

    if (outputDir) {
      ensureDir(outputDir);
      await fs.promises.writeFile(
        path.join(outputDir, 'preview.json'),
        JSON.stringify(preview, null, 2),
        'utf8'
      );
    }

    return {
      jobId: previewJobId,
      preview,
      summary,
    };
  }

  async function exportEcfY570Txt({ preview, outputDir, jobId } = {}) {
    if (!preview || typeof preview !== 'object') {
      throw createValidationError('Preview do Y570 nao informado para exportacao.');
    }
    const targetJobId = String(jobId || preview.jobId || createJobId()).trim();
    const finalOutputDir = outputDir || path.join(OUTPUT_ROOT, targetJobId);
    ensureDir(finalOutputDir);

    const outputPath = path.join(finalOutputDir, `Y570_fontes_pagadoras_${targetJobId}.txt`);
    const txt = buildY570TxtFromPreview(preview);
    await fs.promises.writeFile(outputPath, txt, 'latin1');

    return {
      artifact: {
        fileName: path.basename(outputPath),
        filePath: outputPath,
        mimeType: 'text/plain; charset=latin1',
      },
      preview,
      jobId: targetJobId,
    };
  }

  async function runTemplate(payload = {}) {
    const spedType = normalizeKey(payload.spedType);
    const templateId = normalizeKey(payload.templateId);
    const outputFormat = normalizeKey(payload.outputFormat || 'txt');
    const type = findSpedType(spedType);
    if (!type) throw createValidationError('Tipo de SPED invalido.');

    const template = findTemplate(spedType, templateId);
    if (!template) throw createValidationError('Template nao encontrado para o SPED selecionado.');
    const manifest = ensureTemplateManifestPolicy(template);

    const filesByInput = payload.filesByInput || {};
    const fields = validateTemplateExecution(template, filesByInput, payload.fields, outputFormat);

    const analyzedFiles = [];
    for (const input of template.inputs || []) {
      const files = Array.isArray(filesByInput[input.key]) ? filesByInput[input.key] : [];
      for (const file of files) {
        const analysis = await inspectFile(file);
        analyzedFiles.push({
          inputKey: input.key,
          inputLabel: input.label,
          ...analysis,
        });
      }
    }

    const fieldsSummary = (template.fields || [])
      .map((field) => ({
        key: field.key,
        label: field.label,
        value: fields[field.key] === undefined ? '' : String(fields[field.key]),
      }))
      .filter((field) => field.value !== '');

    const jobId = createJobId();
    const outputDir = path.join(OUTPUT_ROOT, jobId);
    ensureDir(outputDir);

    const summary = {
      jobId,
      spedType: type.id,
      spedLabel: type.label,
      templateId: template.id,
      templateTitle: template.title,
      scriptEntry: template?.script?.entry || '',
      manifestPath: template?.manifest?.path || '',
      executedAt: new Date().toISOString(),
      fields: fieldsSummary,
      files: analyzedFiles,
    };

    const runner = TEMPLATE_RUNNERS[template.id];
    if (typeof runner === 'function') {
      const runnerResult = await runner({
        template,
        filesByInput,
        fields,
        outputDir,
        outputFormat,
      });
      let artifact = runnerResult;
      if (runnerResult && typeof runnerResult === 'object' && runnerResult.artifact) {
        artifact = runnerResult.artifact;
        if (runnerResult.summaryPatch && typeof runnerResult.summaryPatch === 'object') {
          Object.assign(summary, runnerResult.summaryPatch);
        }
      }
      if (!artifact?.filePath) {
        throw createValidationError('Template executado sem gerar artefato de saida.');
      }
      const relationshipValidation = await runAutomaticRelationshipValidation({
        template,
        manifest,
        artifact,
        outputDir,
      });
      summary.relationshipValidation = relationshipValidation;

      return {
        jobId,
        summary,
        artifact,
      };
    }

    if (resolveTemplateScriptPath(template)) {
      throw createValidationError(
        'Template com script ainda nao esta mapeado para execucao automatica.',
        [`Template: ${template.id}`]
      );
    }

    const baseFileName = `${template.id}_${jobId}`;
    let artifactPath = '';
    let artifactMime = 'text/plain';
    let artifactName = '';

    if (outputFormat === 'xlsx') {
      artifactName = `${baseFileName}.xlsx`;
      artifactPath = path.join(outputDir, artifactName);
      writeXlsxSummary(summary, artifactPath);
      artifactMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      artifactName = `${baseFileName}.txt`;
      artifactPath = path.join(outputDir, artifactName);
      const txt = buildTxtSummary(summary);
      await fs.promises.writeFile(artifactPath, txt, 'utf8');
      artifactMime = 'text/plain; charset=utf-8';
    }

    const fallbackArtifact = {
      fileName: artifactName,
      filePath: artifactPath,
      mimeType: artifactMime,
    };
    const relationshipValidation = await runAutomaticRelationshipValidation({
      template,
      manifest,
      artifact: fallbackArtifact,
      outputDir,
    });
    summary.relationshipValidation = relationshipValidation;

    return {
      jobId,
      summary,
      artifact: fallbackArtifact,
    };
  }

  function resolveArtifact(jobId, fileName) {
    const safeJob = String(jobId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeName = path.basename(String(fileName || ''));
    if (!safeJob || !safeName) return null;
    const filePath = path.join(OUTPUT_ROOT, safeJob, safeName);
    if (!fs.existsSync(filePath)) return null;
    return filePath;
  }

  return {
    listSpedTypes,
    listTemplates,
    getTemplateDetails,
    buildFilesByInput,
    buildEcfY570Preview,
    exportEcfY570Txt,
    runTemplate,
    resolveArtifact,
  };
};
