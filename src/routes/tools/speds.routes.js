const express = require('express');
const createSpedsService = require('../../services/speds.service');

function parseJsonSafely(raw, fallback = {}) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return fallback;
  }
}

module.exports = function createSpedsRoutes(deps = {}) {
  const {
    requireCsrf,
    auditLog,
    uploadSpeds,
    DATA_DIR,
    service,
  } = deps;

  const router = express.Router();
  const spedsService = service || createSpedsService({ DATA_DIR });

  if (!uploadSpeds) {
    throw new Error('createSpedsRoutes: uploadSpeds nao informado.');
  }

  router.get('/health', async (req, res) => {
    try {
      return res.json({ ok: true, tool: 'speds', time: new Date().toISOString() });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Erro interno.' });
    }
  });

  router.get('/types', async (req, res) => {
    try {
      const spedTypes = spedsService.listSpedTypes();
      return res.json({ ok: true, spedTypes });
    } catch (error) {
      console.error('speds types error:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'Falha ao listar tipos de SPED.' });
    }
  });

  router.get('/templates', async (req, res) => {
    try {
      const spedType = String(req.query.spedType || '').trim();
      if (!spedType) {
        return res.status(400).json({ ok: false, error: 'spedType e obrigatorio.' });
      }
      const templates = spedsService.listTemplates(spedType);
      return res.json({ ok: true, templates });
    } catch (error) {
      console.error('speds templates error:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'Falha ao listar templates.' });
    }
  });

  router.get('/templates/:templateId', async (req, res) => {
    try {
      const spedType = String(req.query.spedType || '').trim();
      const templateId = String(req.params.templateId || '').trim();
      if (!spedType || !templateId) {
        return res.status(400).json({ ok: false, error: 'spedType e templateId sao obrigatorios.' });
      }
      const template = spedsService.getTemplateDetails(spedType, templateId);
      if (!template) {
        return res.status(404).json({ ok: false, error: 'Template nao encontrado.' });
      }
      return res.json({ ok: true, template });
    } catch (error) {
      console.error('speds template detail error:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'Falha ao carregar template.' });
    }
  });

  router.post('/run', requireCsrf, uploadSpeds.any(), async (req, res) => {
    const traceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const spedType = String(req.body?.spedType || '').trim();
      const templateId = String(req.body?.templateId || '').trim();
      const outputFormat = String(req.body?.outputFormat || 'txt').trim().toLowerCase();
      const fields = parseJsonSafely(req.body?.fieldsJson, {});
      const filesByInput = spedsService.buildFilesByInput(req.files || []);

      const result = await spedsService.runTemplate({
        spedType,
        templateId,
        outputFormat,
        fields,
        filesByInput,
      });

      await auditLog?.(req, 'tool_speds_run', 'ok', {
        traceId,
        spedType,
        templateId,
        outputFormat,
        uploadedFiles: Array.isArray(req.files) ? req.files.length : 0,
      });

      const downloadPath = `/api/speds/download/${encodeURIComponent(result.jobId)}/${encodeURIComponent(result.artifact.fileName)}`;

      return res.json({
        ok: true,
        traceId,
        jobId: result.jobId,
        summary: result.summary,
        artifact: {
          fileName: result.artifact.fileName,
          mimeType: result.artifact.mimeType,
          downloadPath,
        },
      });
    } catch (error) {
      const status = Number(error?.status) || 500;
      const errorMessage = error?.message || 'Falha ao executar template.';
      const details = Array.isArray(error?.details) ? error.details : null;

      await auditLog?.(req, 'tool_speds_run', 'error', {
        traceId,
        status,
        error: String(errorMessage),
        details,
      });

      return res.status(status).json({
        ok: false,
        traceId,
        error: errorMessage,
        details,
      });
    }
  });

  router.get('/download/:jobId/:fileName', async (req, res) => {
    try {
      const filePath = spedsService.resolveArtifact(req.params.jobId, req.params.fileName);
      if (!filePath) {
        return res.status(404).json({ ok: false, error: 'Arquivo nao encontrado para download.' });
      }
      return res.download(filePath);
    } catch (error) {
      console.error('speds download error:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'Falha ao preparar download.' });
    }
  });

  return router;
};
