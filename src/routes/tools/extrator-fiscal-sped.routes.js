const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

function normalizeErrorMessage(value, fallback = 'Erro interno.') {
  const text = String(value || '').trim();
  return text || fallback;
}

module.exports = function createExtratorFiscalSpedRoutes(deps = {}) {
  const { requireCsrf, auditLog, service } = deps;
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: 40 * 1024 * 1024 },
  });

  router.get('/health', async (req, res) => {
    try {
      await auditLog?.(req, 'tool_extrator_fiscal_sped_health', 'ok', { tool: 'extrator-fiscal-sped' });
      return res.json({ ok: true, tool: 'extrator-fiscal-sped', time: new Date().toISOString() });
    } catch (error) {
      await auditLog?.(req, 'tool_extrator_fiscal_sped_health', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro interno.' });
    }
  });

  router.post('/processar', requireCsrf, upload.single('file'), async (req, res) => {
    const file = req.file || null;

    try {
      if (!file) {
        return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
      }

      const processed = await service.processUploadedFile(file);
      const downloadUrl = `/api/extrator-fiscal-sped/download/${encodeURIComponent(processed.jobId)}/${encodeURIComponent(processed.outputName)}`;

      await auditLog?.(req, 'tool_extrator_fiscal_sped_processar', 'ok', {
        fileName: file.originalname,
        outputName: processed.outputName,
        totalItems: processed.totalItems,
        period: processed.period,
      });

      return res.json({
        ok: true,
        message: processed.message,
        jobId: processed.jobId,
        totalItems: processed.totalItems,
        period: processed.period,
        encoding: processed.encoding,
        fileName: processed.outputName,
        downloadUrl,
      });
    } catch (error) {
      await auditLog?.(req, 'tool_extrator_fiscal_sped_processar', 'error', {
        fileName: file?.originalname || '',
        error: String(error?.message || error),
        details: Array.isArray(error?.details) ? error.details.slice(0, 10) : [],
      });
      return res.status(Number(error?.statusCode) || 500).json({
        ok: false,
        error: normalizeErrorMessage(error?.message, 'Erro ao processar arquivo SPED.'),
        details: Array.isArray(error?.details) ? error.details : [],
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
