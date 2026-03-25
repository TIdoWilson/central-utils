const express = require('express');

module.exports = function createParcelamentosRoutes(deps = {}) {
  const {
    auditLog,
    requireCsrf,
    upload,
    service,
  } = deps;

  const router = express.Router();
  const importUploadMiddleware = upload?.single ? upload.single('file') : (req, res, next) => next();

  router.get('/health', async (req, res) => {
    try {
      await auditLog?.(req, 'tool_parcelamentos_health', 'ok', { tool: 'parcelamentos' });
      return res.json({ ok: true, tool: 'parcelamentos', time: new Date().toISOString() });
    } catch (error) {
      await auditLog?.(req, 'tool_parcelamentos_health', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro ao verificar a ferramenta.' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const result = await service.listParcelamentos(req.query || {});
      await auditLog?.(req, 'tool_parcelamentos_list', 'ok', {
        total: Number(result?.meta?.total || 0),
        limit: Number(result?.meta?.limit || 0),
        search: String(req.query?.q || req.query?.search || '').slice(0, 120),
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error('Erro ao listar parcelamentos:', error?.message || error);
      await auditLog?.(req, 'tool_parcelamentos_list', 'error', {
        error: String(error?.message || error),
      });
      return res.status(500).json({ ok: false, error: 'Erro ao listar parcelamentos.' });
    }
  });

  router.post('/', requireCsrf, async (req, res) => {
    try {
      const item = await service.createParcelamento(req.body || {});
      await auditLog?.(req, 'tool_parcelamentos_create', 'ok', {
        companyName: item.companyName,
        cnpj: item.cnpj,
        parcelamentoType: item.parcelamentoType,
        debitAccount: !!item.debitAccount,
      });
      return res.status(201).json({ ok: true, item });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      await auditLog?.(req, 'tool_parcelamentos_create', 'error', {
        error: String(error?.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: status === 400 ? String(error?.message || 'Dados invalidos.') : 'Erro ao cadastrar parcelamento.',
      });
    }
  });

  router.put('/:id', requireCsrf, async (req, res) => {
    try {
      const item = await service.updateParcelamento(req.params.id, req.body || {});
      await auditLog?.(req, 'tool_parcelamentos_update', 'ok', {
        id: Number(item.id || req.params.id || 0),
        companyName: item.companyName,
        cnpj: item.cnpj,
        parcelamentoType: item.parcelamentoType,
      });
      return res.json({ ok: true, item });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      await auditLog?.(req, 'tool_parcelamentos_update', 'error', {
        id: Number(req.params.id || 0),
        error: String(error?.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: status === 400 || status === 404 ? String(error?.message || 'Dados invalidos.') : 'Erro ao atualizar parcelamento.',
      });
    }
  });

  router.post('/clear', requireCsrf, async (req, res) => {
    try {
      const result = await service.clearParcelamentos();
      await auditLog?.(req, 'tool_parcelamentos_clear', 'ok', {
        cleared: Number(result?.cleared || 0),
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      await auditLog?.(req, 'tool_parcelamentos_clear', 'error', {
        error: String(error?.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: status === 400 ? String(error?.message || 'Dados invalidos.') : 'Erro ao limpar parcelamentos.',
      });
    }
  });

  router.post('/import-file', requireCsrf, importUploadMiddleware, async (req, res) => {
    try {
      if (!req.file || !Buffer.isBuffer(req.file.buffer)) {
        return res.status(400).json({ ok: false, error: 'Arquivo invalido.' });
      }

      const result = await service.replaceFromWorkbookBuffer(req.file.buffer);
      await auditLog?.(req, 'tool_parcelamentos_import_file', 'ok', {
        fileName: String(req.file.originalname || '').slice(0, 180),
        imported: Number(result?.imported || 0),
        replacedExisting: Number(result?.replacedExisting || 0),
      });

      return res.json({
        ok: true,
        ...result,
        fileName: req.file.originalname,
      });
    } catch (error) {
      console.error('Erro ao importar parcelamentos:', error?.message || error);
      await auditLog?.(req, 'tool_parcelamentos_import_file', 'error', {
        error: String(error?.message || error),
      });
      const status = Number(error?.statusCode) || 500;
      return res.status(status).json({
        ok: false,
        error: status === 400 ? String(error?.message || 'Arquivo invalido.') : 'Erro ao importar planilha de parcelamentos.',
      });
    }
  });

  return router;
};
