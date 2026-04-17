const express = require('express');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeDigits(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

function extractCnpjFromRequest(req) {
  const body = req?.body;
  const query = req?.query;
  const candidates = [];

  if (typeof body === 'string') candidates.push(body);
  if (body && typeof body === 'object') {
    candidates.push(body.cnpj, body.CNPJ, body.documento, body.cnpjSindicato, body.value);
  }
  if (query && typeof query === 'object') {
    candidates.push(query.cnpj);
  }

  for (const candidate of candidates) {
    const digits = normalizeDigits(candidate);
    if (digits) return digits;
  }

  return '';
}

function getRequesterLabel(req) {
  const authUser = req?.user || req?.auth?.user || {};
  const name = String(authUser.name || '').trim();
  const email = String(authUser.email || '').trim();
  if (name && email) return `${name} <${email}>`;
  if (name) return name;
  if (email) return email;
  return 'usuario-desconhecido';
}

function formatHistoryLabel(status) {
  const key = normalizeText(status);
  const labels = {
    'pedido recebido': 'Pedido recebido',
    'download realizado': 'Download realizado',
    'nao retornou nenhuma convencao': 'Nao retornou nenhuma convencao',
    'erro na busca': 'Erro na busca',
  };
  return labels[key] || String(status || '-');
}

function formatHistoryResponse(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    timestamp: item.timestamp || '',
    cnpj: item.cnpj || '',
    status: item.status || '',
    user: item.user || '',
    details: item.details || '',
    runId: item.runId || '',
    label: formatHistoryLabel(item.status || ''),
  }));
}

module.exports = function createCctRoutes(deps = {}) {
  const { auditLog, service, intakeService, requireCsrf } = deps;
  const router = express.Router();

  async function handleCnpjRequest(req, res) {
    try {
      const cnpj = extractCnpjFromRequest(req);
      const requester = getRequesterLabel(req);
      const result = await intakeService.enqueueCnpj(cnpj, requester, { exclusive: true });
      let catalog = null;
      let responseMessage = String(result?.message || '').trim();

      if (typeof service?.describeCnpj === 'function' && result?.cnpj) {
        catalog = await service.describeCnpj(result.cnpj);
      }

      if (result?.duplicate) {
        if (catalog?.matchCount) {
          const sampleRegistrations = Array.isArray(catalog.registrations) && catalog.registrations.length
            ? ` Registros locais: ${catalog.registrations.join(', ')}.`
            : '';
          responseMessage = `CNPJ ja cadastrado na base da CCT (${catalog.matchCount} convencao(oes) local(is)).${sampleRegistrations}`;
        } else {
          responseMessage = responseMessage || 'CNPJ ja existe na fila de monitoramento.';
        }
      }

      const auditStatus = result.requestAdded ? 'ok' : 'duplicate';

      await auditLog?.(req, 'tool_cct_request_cnpj', auditStatus, {
        cnpj: result.cnpj,
        queueSize: result.queueSize,
        duplicate: !!result.duplicate,
        requestAdded: !!result.requestAdded,
        automaticAdded: !!result.automaticAdded,
        catalogMatchCount: Number(catalog?.matchCount || 0),
        requester,
      });

      return res.json({
        ok: true,
        ...result,
        message: responseMessage || result?.message || '',
        catalog: catalog || undefined,
      });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      await auditLog?.(req, 'tool_cct_request_cnpj', 'error', {
        cnpj: extractCnpjFromRequest(req),
        requester: getRequesterLabel(req),
        error: String(error?.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: status === 400
          ? String(error?.message || 'CNPJ invalido.')
          : 'Erro ao incluir o CNPJ na fila.',
      });
    }
  }

  async function handleHistory(req, res) {
    try {
      const scope = String(req.query?.scope || 'recent').trim().toLowerCase() === 'full'
        ? 'full'
        : 'recent';
      const page = Number(req.query?.page || 1);
      const limit = scope === 'full'
        ? Math.min(10, Number(req.query?.limit || 10))
        : Math.min(50, Number(req.query?.limit || 30));
      const result = await intakeService.readHistory({ scope, page, limit });
      const items = Array.isArray(result?.items) ? result.items : [];
      const meta = result?.meta || {};

      await auditLog?.(req, 'tool_cct_history', 'ok', {
        scope,
        page: Number(meta.page || 1),
        limit: Number(meta.perPage || limit),
        total: Number(meta.totalItems || items.length),
      });

      return res.json({
        ok: true,
        items: formatHistoryResponse(items),
        meta,
      });
    } catch (error) {
      await auditLog?.(req, 'tool_cct_history', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro ao carregar o historico.' });
    }
  }

  router.get('/health', async (req, res) => {
    try {
      await auditLog?.(req, 'tool_cct_health', 'ok', { tool: 'cct' });
      return res.json({ ok: true, tool: 'cct', time: new Date().toISOString() });
    } catch (error) {
      await auditLog?.(req, 'tool_cct_health', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro interno ao verificar a ferramenta.' });
    }
  });

  router.get('/status', async (req, res) => {
    try {
      const status = typeof intakeService?.getStatus === 'function'
        ? intakeService.getStatus()
        : {};
      await auditLog?.(req, 'tool_cct_status', 'ok', {
        running: !!status?.running,
        scheduled: !!status?.scheduled,
        currentCnpj: String(status?.currentCnpj || ''),
      });
      return res.json({ ok: true, status });
    } catch (error) {
      await auditLog?.(req, 'tool_cct_status', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro ao consultar o status do processamento.' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const result = await service.listConventions(req.query || {});
      await auditLog?.(req, 'tool_cct_list', 'ok', {
        filters: {
          nome: String(req.query?.nome || req.query?.q || '').slice(0, 120),
          vigencia: String(req.query?.vigencia || '').slice(0, 40),
          dataBaseMes: String(req.query?.dataBaseMes || '').slice(0, 10),
        },
        totalFiltrados: result?.meta?.totalFiltrados || 0,
      });
      return res.json({ ok: true, ...result, meta: result.meta || {} });
    } catch (error) {
      console.error('Erro ao listar convencoes CCT:', error?.message || error);
      await auditLog?.(req, 'tool_cct_list', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro ao listar convenções.' });
    }
  });

  router.post('/requisicoes', requireCsrf, handleCnpjRequest);
  router.post('/request', requireCsrf, handleCnpjRequest);

  router.get('/historico', handleHistory);
  router.get('/history', handleHistory);

  router.get('/:id/download', async (req, res) => {
    try {
      const document = await service.getConventionDocument(req.params.id);
      await auditLog?.(req, 'tool_cct_download', 'ok', {
        conventionId: req.params.id,
        fileName: document.fileName,
      });
      return res.download(document.path, document.fileName);
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      await auditLog?.(req, 'tool_cct_download', 'error', {
        conventionId: req.params.id,
        error: String(error?.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: status === 404
          ? 'Arquivo da convencao nao encontrado.'
          : 'Erro ao baixar a convencao.',
      });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const detail = await service.getConventionById(req.params.id);
      await auditLog?.(req, 'tool_cct_detail', 'ok', {
        conventionId: req.params.id,
        clausulas: detail?.item?.quantidadeClausulas || 0,
      });
      return res.json(detail);
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      await auditLog?.(req, 'tool_cct_detail', 'error', {
        conventionId: req.params.id,
        error: String(error?.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: status === 404
          ? 'Convenio nao encontrado.'
          : 'Erro ao carregar a convencao.',
      });
    }
  });

  return router;
};
