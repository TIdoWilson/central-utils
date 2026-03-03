const express = require('express');
const { PDFDocument } = require('pdf-lib');

const { resolveConfiguredPath } = require('../../core/path-resolver');
function safeName(name) {
  return String(name || 'arquivo.xlsx').replace(/[^\w.\- ]+/g, '_');
}

function pushLog(state, msg) {
  state.logs = state.logs || [];
  state.logs.push({ ts: new Date().toISOString(), msg: String(msg || '').slice(0, 5000) });
  if (state.logs.length > 500) {
    state.logs = state.logs.slice(-500);
  }
}

function splitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function zipDirectory({ fs, path, archiver, sourceDir, zipPath }) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

module.exports = function createBalanceteTransitorioRoutes(deps) {
  const {
    requireCsrf,
    uploadBalancete,
    BALANCETE_DIR,
    auditLog,
    fs,
    path,
    spawn,
    archiver,
  } = deps;

  const router = express.Router();

  const defaultExePath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'C#',
    'Preparação para automação de balancete',
    'publish',
    'Preparação para automação de balancete.exe'
  );

  router.post('/jobs', requireCsrf, uploadBalancete.array('files'), async (req, res) => {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({
        message: 'Envie pelo menos 1 arquivo .xlsx no campo "files".',
      });
    }

    const exePath =
      resolveConfiguredPath(process.env.BALANCETE_TRANSITORIO_EXE_PATH || process.env.BALANCETE_EXE_PATH) ||
      defaultExePath;
    if (!fs.existsSync(exePath)) {
      return res.status(500).json({
        message:
          'Executavel do balancete nao encontrado. Configure BALANCETE_TRANSITORIO_EXE_PATH ou BALANCETE_EXE_PATH no .env.',
      });
    }

    const jobId = `jb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const jobBase = path.join(BALANCETE_DIR, jobId);
    const inputDir = path.join(jobBase, 'balancetes');
    const outputDir = path.join(jobBase, 'PDFs Prontos');
    const statusPath = path.join(jobBase, 'job.json');

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    for (const f of files) {
      const destination = path.join(inputDir, safeName(f.originalname));
      fs.renameSync(f.path, destination);
    }

    const state = {
      jobId,
      status: 'processing',
      progress: 10,
      message: 'Arquivos recebidos. Preparando processamento do relatorio contabil.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      downloadUrl: null,
      preview: {
        available: false,
        message: 'Pre-visualizacao indisponivel no momento.',
        pageCount: null,
        fileName: null,
        previewUrl: null,
      },
      logs: [],
    };

    pushLog(state, `Arquivos recebidos: ${files.length}`);
    fs.writeFileSync(statusPath, JSON.stringify(state, null, 2), 'utf-8');

    const saveState = (patch = {}) => {
      const current = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      const next = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(statusPath, JSON.stringify(next, null, 2), 'utf-8');
      return next;
    };

    const appendStateLog = (message) => {
      const current = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      pushLog(current, message);
      current.updatedAt = new Date().toISOString();
      fs.writeFileSync(statusPath, JSON.stringify(current, null, 2), 'utf-8');
      return current;
    };

    await auditLog(req, 'job_create_balancete_transitorio', 'ok', { jobId, files: files.length });

    res.json({ jobId });

    try {
      saveState({
        progress: 25,
        message: 'Executando geracao dos PDFs do balancete transitorio.',
      });

      const child = spawn(exePath, [], {
        cwd: jobBase,
        windowsHide: true,
      });

      child.stdout.on('data', (chunk) => {
        for (const line of splitLines(chunk.toString('utf8'))) {
          appendStateLog(line);
        }
      });

      child.stderr.on('data', (chunk) => {
        for (const line of splitLines(chunk.toString('utf8'))) {
          appendStateLog(`[stderr] ${line}`);
        }
      });

      child.on('close', async (code) => {
        try {
          if (code !== 0) {
            saveState({
              status: 'error',
              progress: 100,
              message: `Processamento encerrado com falha tecnica (exitCode=${code}).`,
            });
            await auditLog(req, 'job_error_balancete_transitorio', 'error', { jobId, exitCode: code });
            return;
          }

          const pdfFiles = fs
            .readdirSync(outputDir)
            .filter((f) => f.toLowerCase().endsWith('.pdf'));

          if (!pdfFiles.length) {
            saveState({
              status: 'error',
              progress: 100,
              message: 'Processamento concluido sem gerar arquivos PDF.',
            });
            return;
          }

          saveState({ progress: 80, message: 'Compactando arquivos para download.' });

          const zipPath = path.join(jobBase, `PDFs-Prontos-${jobId}.zip`);
          await zipDirectory({ fs, path, archiver, sourceDir: outputDir, zipPath });

          const preview = {
            available: false,
            message:
              'Arquivo grande demais para pre-visualizacao em tela. Utilize o botao de download para analise completa.',
            pageCount: null,
            fileName: null,
            previewUrl: null,
          };

          if (pdfFiles.length === 1) {
            const pdfName = pdfFiles[0];
            const pdfPath = path.join(outputDir, pdfName);
            const pdfBytes = fs.readFileSync(pdfPath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const pageCount = pdfDoc.getPageCount();

            preview.pageCount = pageCount;
            preview.fileName = pdfName;

            if (pageCount <= 1) {
              preview.available = true;
              preview.message =
                'Pre-visualizacao disponivel. Documento validado para exibicao em uma unica pagina.';
              preview.previewUrl = `/api/balancete-transitorio/jobs/${encodeURIComponent(jobId)}/preview`;
            }
          }

          saveState({
            status: 'done',
            progress: 100,
            message: 'Processamento concluido com sucesso.',
            downloadUrl: `/api/balancete-transitorio/jobs/${encodeURIComponent(jobId)}/download`,
            preview,
          });
        } catch (err) {
          appendStateLog('Erro interno ao finalizar o job: ' + (err?.message || String(err)));
          saveState({
            status: 'error',
            progress: 100,
            message: 'Falha ao finalizar o processamento do balancete transitorio.',
          });
        }
      });
    } catch (err) {
      appendStateLog('Erro interno: ' + (err?.message || String(err)));
      saveState({
        status: 'error',
        progress: 100,
        message: 'Falha interna ao iniciar o processamento do balancete transitorio.',
      });
    }
  });

  router.get('/jobs/:jobId', (req, res) => {
    const statusPath = path.join(BALANCETE_DIR, req.params.jobId, 'job.json');
    if (!fs.existsSync(statusPath)) {
      return res.status(404).json({ message: 'Job nao encontrado.' });
    }
    res.json(JSON.parse(fs.readFileSync(statusPath, 'utf-8')));
  });

  router.get('/jobs/:jobId/preview', (req, res) => {
    const statusPath = path.join(BALANCETE_DIR, req.params.jobId, 'job.json');
    if (!fs.existsSync(statusPath)) {
      return res.status(404).json({ message: 'Job nao encontrado.' });
    }

    const st = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    if (!st?.preview?.available || !st?.preview?.fileName) {
      return res.status(409).json({
        message:
          st?.preview?.message ||
          'Arquivo grande demais para pre-visualizacao em tela. Utilize o botao de download.',
      });
    }

    const pdfPath = path.join(BALANCETE_DIR, req.params.jobId, 'PDFs Prontos', st.preview.fileName);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ message: 'Arquivo de pre-visualizacao nao encontrado.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName(st.preview.fileName)}"`);
    return res.sendFile(pdfPath);
  });

  router.get('/jobs/:jobId/download', (req, res) => {
    const jobBase = path.join(BALANCETE_DIR, req.params.jobId);
    const zipPath = path.join(jobBase, `PDFs-Prontos-${req.params.jobId}.zip`);
    if (!fs.existsSync(zipPath)) return res.status(404).send('Arquivo nao encontrado.');
    res.download(zipPath, path.basename(zipPath));
  });

  return router;
};
