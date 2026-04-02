const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

function safeFileName(value) {
  return String(value || 'arquivo.xls')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'arquivo.xls';
}

function normalizeErrorMessage(value, fallback = 'Erro interno.') {
  const text = String(value || '').trim();
  return text || fallback;
}

module.exports = function createLotesRenasulRoutes(deps = {}) {
  const { requireCsrf, auditLog, service } = deps;
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage() });

  async function runJob(file, config, mode) {
    if (!service?.getJobDirs || !service?.runParser || !service?.buildTxtFromPreview) {
      throw new Error('Servico do lotes-renasul nao inicializado.');
    }

    const jobId = service.createJobId();
    const job = service.getJobDirs(jobId);
    const inputName = safeFileName(file?.originalname || 'arquivo.xls');
    const inputPath = path.join(job.uploadDir, inputName);
    fs.writeFileSync(inputPath, file.buffer);

    const parsed = await service.runParser({
      filePaths: [{ path: inputPath, name: inputName }],
      config,
      jobId,
    });

    if (!parsed || parsed.ok === false || !parsed.resumo) {
      const error = new Error(parsed?.error || 'Falha ao analisar a planilha.');
      error.statusCode = 500;
      throw error;
    }

    const resumo = parsed.resumo || {};
    const txt = service.buildTxtFromPreview(resumo);
    const txtLines = String(txt || '')
      .split(/\r?\n/)
      .filter(Boolean);
    const previewLines = txtLines.slice(0, 20);

    resumo.preview_linhas = previewLines;
    resumo.gerou_txt = false;
    resumo.downloadUrl = '';

    if (mode === 'process') {
      if (!resumo.pode_gerar_txt) {
        const error = new Error(resumo.message || 'Existem pendencias no arquivo.');
        error.statusCode = 400;
        error.resumo = resumo;
        throw error;
      }

      const outputName = 'LOTD0000.txt';
      const outputPath = path.join(job.outputDir, outputName);
      fs.writeFileSync(outputPath, txt, 'latin1');
      resumo.gerou_txt = true;
      resumo.downloadUrl = `/api/lotes-renasul/download/${encodeURIComponent(jobId)}/${encodeURIComponent(outputName)}`;
      return {
        jobId,
        inputName,
        outputName,
        outputPath,
        resumo,
      };
    }

    return {
      jobId,
      inputName,
      resumo,
    };
  }

  router.get('/health', async (req, res) => {
    try {
      await auditLog?.(req, 'tool_lotes_renasul_health', 'ok', { tool: 'lotes-renasul' });
      return res.json({ ok: true, tool: 'lotes-renasul', time: new Date().toISOString() });
    } catch (error) {
      await auditLog?.(req, 'tool_lotes_renasul_health', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro interno ao verificar a ferramenta.' });
    }
  });

  router.get('/config', async (req, res) => {
    try {
      const config = service.loadConfig();
      await auditLog?.(req, 'tool_lotes_renasul_config_get', 'ok', {
        dePara: Array.isArray(config?.dePara) ? config.dePara.length : 0,
      });
      return res.json({ ok: true, config });
    } catch (error) {
      await auditLog?.(req, 'tool_lotes_renasul_config_get', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro ao carregar a configuracao.' });
    }
  });

  router.put('/config', requireCsrf, async (req, res) => {
    try {
      const config = service.saveConfig(req.body || {});
      await auditLog?.(req, 'tool_lotes_renasul_config_save', 'ok', {
        dePara: Array.isArray(config?.dePara) ? config.dePara.length : 0,
      });
      return res.json({ ok: true, config });
    } catch (error) {
      await auditLog?.(req, 'tool_lotes_renasul_config_save', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro ao salvar a configuracao.' });
    }
  });

  router.post('/validate', requireCsrf, upload.single('file'), async (req, res) => {
    const file = req.file || null;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
    }

    try {
      const config = service.loadConfig();
      const result = await runJob(file, config, 'validate');
      await auditLog?.(req, 'tool_lotes_renasul_validate', 'ok', {
        fileName: file.originalname,
        registros: Number(result?.resumo?.total_registros || 0),
        pendencias: Number(result?.resumo?.total_pendencias || 0),
      });

      return res.json({
        ok: true,
        resumo: result.resumo,
        previewLinhas: result.resumo.preview_linhas || [],
      });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      const resumo = error?.resumo || null;
      await auditLog?.(req, 'tool_lotes_renasul_validate', 'error', {
        fileName: file.originalname,
        error: String(error?.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: normalizeErrorMessage(error?.message, 'Erro ao validar o arquivo.'),
        resumo,
      });
    }
  });

  router.post('/process', requireCsrf, upload.single('file'), async (req, res) => {
    const file = req.file || null;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
    }

    try {
      const config = service.loadConfig();
      const result = await runJob(file, config, 'process');
      await auditLog?.(req, 'tool_lotes_renasul_process', 'ok', {
        fileName: file.originalname,
        registros: Number(result?.resumo?.total_registros || 0),
        pendencias: Number(result?.resumo?.total_pendencias || 0),
        outputName: result.outputName,
      });

      return res.json({
        ok: true,
        resumo: result.resumo,
        downloadUrl: result.resumo.downloadUrl,
        previewLinhas: result.resumo.preview_linhas || [],
        message: result.resumo.message || 'TXT gerado com sucesso.',
      });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      const resumo = error?.resumo || null;
      await auditLog?.(req, 'tool_lotes_renasul_process', 'error', {
        fileName: file.originalname,
        error: String(error?.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: normalizeErrorMessage(error?.message, 'Erro ao processar o arquivo.'),
        resumo,
      });
    }
  });

  router.get('/download/:jobId/:fileName', async (req, res) => {
    try {
      const jobId = String(req.params.jobId || '').trim();
      const fileName = safeFileName(decodeURIComponent(req.params.fileName || 'LOTD0000.txt'));
      const jobDir = path.join(service.jobsDir, jobId);
      const outputPath = path.join(jobDir, 'outputs', fileName);
      const resolvedBase = path.resolve(service.jobsDir);
      const resolvedPath = path.resolve(outputPath);

      if (!resolvedPath.startsWith(resolvedBase)) {
        return res.status(400).json({ ok: false, error: 'Caminho invalido.' });
      }
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ ok: false, error: 'Arquivo nao encontrado.' });
      }

      return res.download(resolvedPath, fileName);
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Erro ao baixar o TXT.' });
    }
  });

  return router;
};
