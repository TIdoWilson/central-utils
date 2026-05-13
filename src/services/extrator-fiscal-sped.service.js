const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function safeFileName(value, fallback = 'arquivo.txt') {
  const sanitized = String(value || fallback)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || fallback;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeMessage(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

module.exports = function createExtratorFiscalSpedService({ DATA_DIR, projectRoot } = {}) {
  const dataDir = DATA_DIR || path.join(__dirname, '..', '..', 'data');
  const rootDir = path.join(dataDir, 'extrator-fiscal-sped');
  const jobsDir = path.join(rootDir, 'jobs');
  const scriptPath = path.join(projectRoot || path.join(__dirname, '..', '..'), 'api', 'extrator_fiscal_sped.py');

  function ensureBase() {
    ensureDir(rootDir);
    ensureDir(jobsDir);
  }

  function createJobId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function getJobDirs(jobId) {
    ensureBase();
    const safeJobId = safeFileName(jobId, 'job');
    const jobRoot = path.join(jobsDir, safeJobId);
    const uploadDir = path.join(jobRoot, 'uploads');
    const outputDir = path.join(jobRoot, 'outputs');
    const logsDir = path.join(jobRoot, 'logs');
    ensureDir(uploadDir);
    ensureDir(outputDir);
    ensureDir(logsDir);
    return { jobRoot, uploadDir, outputDir, logsDir };
  }

  function saveIncomingFile(file, uploadDir) {
    if (!file || !file.buffer) {
      const error = new Error('Nenhum arquivo enviado.');
      error.statusCode = 400;
      throw error;
    }

    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.txt') {
      const error = new Error('Arquivo invalido. Envie um SPED em formato .txt.');
      error.statusCode = 400;
      throw error;
    }

    const inputName = safeFileName(file.originalname || 'sped.txt', 'sped.txt');
    const inputPath = path.join(uploadDir, inputName);
    fs.writeFileSync(inputPath, file.buffer);
    return { inputName, inputPath };
  }

  function resolveDownloadPath(jobId, fileName) {
    const safeJobId = safeFileName(jobId, 'job');
    const safeName = safeFileName(fileName, 'arquivo.xlsx');
    const candidate = path.join(jobsDir, safeJobId, 'outputs', safeName);
    const resolvedBase = path.resolve(jobsDir);
    const resolvedFile = path.resolve(candidate);
    if (!resolvedFile.startsWith(resolvedBase)) return null;
    return resolvedFile;
  }

  function splitPythonBin() {
    const raw = String(process.env.PYTHON_BIN || '').trim();
    if (!raw) return null;
    const parts = raw.split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    return { command: parts[0], prefixArgs: parts.slice(1) };
  }

  function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
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

  async function runPython(args) {
    const configured = splitPythonBin();
    const candidates = [];
    if (configured) candidates.push(configured);
    candidates.push({ command: 'python', prefixArgs: [] });
    candidates.push({ command: 'py', prefixArgs: ['-3'] });

    let lastNotFound = null;
    for (const candidate of candidates) {
      try {
        return await runCommand(candidate.command, [...candidate.prefixArgs, scriptPath, ...args], {
          cwd: projectRoot || path.join(__dirname, '..', '..'),
        });
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          lastNotFound = error;
          continue;
        }
        throw error;
      }
    }

    const notFoundError = new Error('Python nao encontrado para executar o Extrator fiscal SPED.');
    notFoundError.statusCode = 500;
    notFoundError.details = [
      'Configure a variavel de ambiente PYTHON_BIN ou instale Python no ambiente do portal.',
    ];
    if (lastNotFound) notFoundError.cause = lastNotFound;
    throw notFoundError;
  }

  function parseScriptJson(stdoutText) {
    const lines = String(stdoutText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      try {
        return JSON.parse(line);
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  function buildErrorFromResult(result, payload, logsDir) {
    const message = normalizeMessage(
      payload?.message,
      'Falha ao executar o Extrator fiscal SPED.'
    );
    const error = new Error(message);
    const code = String(payload?.code || '').trim().toLowerCase();
    error.statusCode = code === 'file_not_found' || code === 'encoding_error' ? 400 : (code === 'no_items' ? 422 : 500);
    error.details = Array.isArray(payload?.details) ? payload.details.slice() : [];

    const runnerLogPath = path.join(logsDir, 'runner_stderr.txt');
    if (String(result?.stderr || '').trim()) {
      fs.writeFileSync(runnerLogPath, String(result.stderr), 'utf8');
      error.details.push(`stderr: ${runnerLogPath}`);
    }
    if (payload?.logPath) {
      error.details.push(`log: ${payload.logPath}`);
    }
    return error;
  }

  async function processUploadedFile(file) {
    if (!fs.existsSync(scriptPath)) {
      const error = new Error('Script Python do Extrator fiscal SPED nao encontrado no servidor.');
      error.statusCode = 500;
      throw error;
    }

    const jobId = createJobId();
    const dirs = getJobDirs(jobId);
    const { inputName, inputPath } = saveIncomingFile(file, dirs.uploadDir);

    const result = await runPython([
      '--input',
      inputPath,
      '--output-dir',
      dirs.outputDir,
      '--log-dir',
      dirs.logsDir,
    ]);

    if (String(result.stdout || '').trim()) {
      fs.writeFileSync(path.join(dirs.logsDir, 'runner_stdout.txt'), String(result.stdout), 'utf8');
    }
    if (String(result.stderr || '').trim()) {
      fs.writeFileSync(path.join(dirs.logsDir, 'runner_stderr.txt'), String(result.stderr), 'utf8');
    }

    const payload = parseScriptJson(result.stdout);
    if (result.code !== 0 || !payload?.ok) {
      throw buildErrorFromResult(result, payload, dirs.logsDir);
    }

    const outputName = safeFileName(payload.outputFileName || 'compras_indefinido.xlsx', 'compras_indefinido.xlsx');
    const outputPath = path.join(dirs.outputDir, outputName);
    if (!fs.existsSync(outputPath)) {
      const error = new Error('O processamento terminou sem gerar o arquivo XLSX esperado.');
      error.statusCode = 500;
      error.details = payload?.logPath ? [`log: ${payload.logPath}`] : [];
      throw error;
    }

    return {
      ok: true,
      jobId,
      inputName,
      outputName,
      outputPath,
      period: String(payload.periodo || ''),
      totalItems: Number(payload.totalItems || 0),
      encoding: String(payload.encoding || ''),
      logPath: String(payload.logPath || ''),
      message: normalizeMessage(payload.message, 'Arquivo processado com sucesso.'),
    };
  }

  return {
    rootDir,
    jobsDir,
    scriptPath,
    createJobId,
    getJobDirs,
    saveIncomingFile,
    resolveDownloadPath,
    processUploadedFile,
  };
};
