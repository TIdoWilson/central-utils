const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');

function normalizeErrorMessage(value, fallback = 'Erro interno.') {
  const text = String(value || '').trim();
  return text || fallback;
}

function parseConfigOverride(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue !== 'string') return null;
  const text = rawValue.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    const detail = String(error?.message || error || 'config_json invalido.');
    const err = new Error(`config_json invalido: ${detail}`);
    err.statusCode = 400;
    throw err;
  }
}

module.exports = function createPlanilhaNrcRoutes(deps = {}) {
  const { requireCsrf, auditLog, service, axios, PY_API_URL } = deps;
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: 60 * 1024 * 1024 },
  });

  router.get('/health', async (req, res) => {
    try {
      await auditLog?.(req, 'tool_planilha_nrc_health', 'ok', { tool: 'planilha-nrc' });
      return res.json({ ok: true, tool: 'planilha-nrc', time: new Date().toISOString() });
    } catch (error) {
      await auditLog?.(req, 'tool_planilha_nrc_health', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro interno.' });
    }
  });

  router.get('/config', async (req, res) => {
    try {
      const config = service.loadConfig();
      await auditLog?.(req, 'tool_planilha_nrc_config_get', 'ok', {
        mappings: Array.isArray(config?.mappings) ? config.mappings.length : 0,
      });
      return res.json({ ok: true, config });
    } catch (error) {
      await auditLog?.(req, 'tool_planilha_nrc_config_get', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro ao carregar configuracao.' });
    }
  });

  router.put('/config', requireCsrf, async (req, res) => {
    try {
      const saved = service.saveConfig({ mappings: req.body?.mappings || [] });
      await auditLog?.(req, 'tool_planilha_nrc_config_save', 'ok', {
        mappings: Array.isArray(saved?.mappings) ? saved.mappings.length : 0,
      });
      return res.json({ ok: true, config: saved });
    } catch (error) {
      await auditLog?.(req, 'tool_planilha_nrc_config_save', 'error', { error: String(error?.message || error) });
      return res.status(Number(error?.statusCode) || 500).json({
        ok: false,
        error: normalizeErrorMessage(error?.message, 'Erro ao salvar configuracao.'),
      });
    }
  });

  router.post('/processar', requireCsrf, upload.single('file'), async (req, res) => {
    const file = req.file || null;

    try {
      if (!file) {
        return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
      }

      const periodoInicial = String(req.body?.periodoInicial || '').trim();
      const periodoFinal = String(req.body?.periodoFinal || '').trim();
      service.validatePeriodoRange(periodoInicial, periodoFinal);

      const override = parseConfigOverride(req.body?.config_json);
      const config = override
        ? { mappings: service.sanitizeMappings(override.mappings) }
        : service.loadConfig();

      const jobId = service.createJobId();
      const job = service.getJobDirs(jobId);
      const { inputPath, inputName } = service.saveIncomingFile(file, job.uploadDir);

      const form = new FormData();
      form.append('arquivo', fs.createReadStream(inputPath), {
        filename: inputName,
        contentType: file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      form.append('periodo_inicial', periodoInicial);
      form.append('periodo_final', periodoFinal);
      form.append('mappings_json', JSON.stringify(config.mappings || []));

      const pyResp = await axios.post(`${String(PY_API_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '')}/api/planilha-nrc/processar`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 240000,
      });

      const payload = pyResp?.data || {};
      if (!payload.ok || !payload.xlsxBase64) {
        const error = new Error(payload?.error || payload?.detail || 'Erro ao processar planilha NRC.');
        error.statusCode = 500;
        throw error;
      }

      const outputName = service.outputNameFromInput(inputName);
      const outputPath = path.join(job.outputDir, outputName);
      fs.writeFileSync(outputPath, Buffer.from(String(payload.xlsxBase64), 'base64'));

      await auditLog?.(req, 'tool_planilha_nrc_processar', 'ok', {
        fileName: file.originalname,
        outputName,
        mappings: Array.isArray(config?.mappings) ? config.mappings.length : 0,
        alteradas: Number(payload?.resumo?.linhasAlteradas || 0),
      });

      return res.json({
        ok: true,
        jobId,
        resumo: payload.resumo || {},
        downloadUrl: `/api/planilha-nrc/download/${encodeURIComponent(jobId)}/${encodeURIComponent(outputName)}`,
      });
    } catch (error) {
      const status = Number(error?.statusCode || error?.response?.status) || 500;
      const detail = error?.response?.data?.detail || error?.response?.data?.error || error?.message;
      await auditLog?.(req, 'tool_planilha_nrc_processar', 'error', {
        fileName: file?.originalname || '',
        error: String(detail || error),
      });
      return res.status(status).json({
        ok: false,
        error: normalizeErrorMessage(detail, 'Erro ao processar planilha.'),
      });
    }
  });

  router.get('/download/:jobId/:fileName', async (req, res) => {
    try {
      const resolved = service.resolveDownloadPath(req.params.jobId, decodeURIComponent(req.params.fileName || ''));
      if (!resolved) return res.status(400).json({ ok: false, error: 'Caminho invalido.' });
      if (!fs.existsSync(resolved)) return res.status(404).json({ ok: false, error: 'Arquivo nao encontrado.' });
      return res.download(resolved, path.basename(resolved));
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Erro ao baixar arquivo.' });
    }
  });

  return router;
};
