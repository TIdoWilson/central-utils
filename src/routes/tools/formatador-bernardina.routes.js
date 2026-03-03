const express = require('express');
const { resolveConfiguredPath } = require('../../core/path-resolver');

module.exports = function createFormatadorBernardinaRoutes(deps) {
  const {
    requireCsrf,
    uploadBernadina,
    BERNADINA_DIR,
    auditLog,
    fs,
    path,
    spawn,
  } = deps;

  const router = express.Router();

  router.post('/jobs', requireCsrf, uploadBernadina.array('files'), async (req, res) => {
    const exePath = resolveConfiguredPath(process.env.BERNADINA_EXE_PATH);
    const baseTemplatePath = resolveConfiguredPath(process.env.BERNADINA_TEMPLATE_PATH);

    if (!exePath) return res.status(500).json({ message: 'BERNADINA_EXE_PATH não configurado no .env' });
    if (!baseTemplatePath) return res.status(500).json({ message: 'BERNADINA_TEMPLATE_PATH não configurado no .env' });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'Envie pelo menos 1 .xlsx no campo "files".' });

    const jobId = `jb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const jobBase = path.join(BERNADINA_DIR, jobId);
    const inputDir = path.join(jobBase, 'input');
    const outputDir = path.join(jobBase, 'output');
    const statusPath = path.join(jobBase, 'job.json');

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    for (const f of files) {
      const safeName = path.basename(f.originalname || 'arquivo.xlsx').replace(/[^\w.\- ]+/g, '_');
      fs.renameSync(f.path, path.join(inputDir, safeName));
    }

    const outputPath = path.join(outputDir, `Agrupado-Bernadina-${jobId}.xlsm`);

    const jobState = {
      jobId,
      status: 'processing',
      progress: 10,
      message: 'Iniciando...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      downloadUrl: null,
      logs: [{ ts: new Date().toISOString(), msg: `Arquivos recebidos: ${files.length}` }],
    };
    fs.writeFileSync(statusPath, JSON.stringify(jobState, null, 2), 'utf-8');

    await auditLog(req, 'job_create_formatador_bernardina', 'ok', { jobId, files: files.length });

    res.json({ jobId });

    const appendLog = (msg) => {
      const cur = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      cur.logs = cur.logs || [];
      cur.logs.push({ ts: new Date().toISOString(), msg: String(msg).slice(0, 5000) });
      cur.updatedAt = new Date().toISOString();
      fs.writeFileSync(statusPath, JSON.stringify(cur, null, 2), 'utf-8');
    };

    const patch = (p) => {
      const cur = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      const next = { ...cur, ...p, updatedAt: new Date().toISOString() };
      fs.writeFileSync(statusPath, JSON.stringify(next, null, 2), 'utf-8');
    };

    try {
      patch({ progress: 30, message: 'Executando formatador (C#)...' });

      const child = spawn(
        exePath,
        [inputDir, outputPath, baseTemplatePath],
        {
          windowsHide: true,
          cwd: jobBase,
        }
      );

      child.stdout.on('data', (d) => appendLog(d.toString('utf8')));
      child.stderr.on('data', (d) => appendLog('[stderr] ' + d.toString('utf8')));

      child.on('close', async (code) => {
        const outFiles = fs.existsSync(outputDir)
          ? fs.readdirSync(outputDir).filter((f) => f.toLowerCase().endsWith('.xlsm'))
          : [];

        if (code === 0 && outFiles.length > 0) {
          patch({
            status: 'done',
            progress: 100,
            message: 'Concluído.',
            downloadUrl: `/api/formatador-bernardina/jobs/${encodeURIComponent(jobId)}/download`,
          });
          appendLog('Concluído. Arquivo pronto.');
        } else {
          patch({
            status: 'error',
            progress: 100,
            message: `Falha no processamento (exitCode=${code}). Veja os logs.`,
          });

          await auditLog(req, 'job_error_formatador_bernardina', 'error', { jobId, exitCode: code });
        }
      });
    } catch (err) {
      appendLog('Erro interno: ' + (err?.message || String(err)));
      patch({ status: 'error', progress: 100, message: 'Erro interno ao executar o formatador.' });
    }
  });

  router.get('/jobs/:jobId', (req, res) => {
    const statusPath = path.join(BERNADINA_DIR, req.params.jobId, 'job.json');
    if (!fs.existsSync(statusPath)) return res.status(404).json({ message: 'Job não encontrado.' });
    res.json(JSON.parse(fs.readFileSync(statusPath, 'utf-8')));
  });

  router.get('/jobs/:jobId/download', async (req, res) => {
    const outputDir = path.join(BERNADINA_DIR, req.params.jobId, 'output');
    if (!fs.existsSync(outputDir)) return res.status(404).send('Arquivo não encontrado.');

    const files = fs.readdirSync(outputDir).filter((f) => f.toLowerCase().endsWith('.xlsm'));
    if (!files.length) return res.status(404).send('Arquivo não encontrado.');

    await auditLog(req, 'job_download_formatador_bernardina', 'ok', { jobId: req.params.jobId });

    res.download(path.join(outputDir, files[0]), files[0]);
  });

  return router;
};
