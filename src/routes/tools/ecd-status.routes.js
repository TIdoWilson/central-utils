const express = require('express');

module.exports = function createEcdStatusRoutes(deps) {
  const {
    requireCsrf,
    loadEcdCompanies,
    loadEcdStatus,
    saveEcdStatus,
    ecdHasErrorPng,
    auditLog,
  } = deps;

  const router = express.Router();

  router.get('/companies', async (req, res) => {
    try {
      const list = loadEcdCompanies();
      const status = loadEcdStatus();
      const out = list.map((c) => {
        const st = status.companies[c.code] || {};
        const hasErrorPng = ecdHasErrorPng(c.name);
        if (hasErrorPng) {
          st.erro = 'Y';
          st.erroMsg = st.erroMsg || 'Arquivo de erro encontrado na pasta.';
        }
        return {
          code: c.code,
          name: c.name,
          cnpj: c.cnpj,
          defaultTipo: c.defaultTipo,
          status: st,
        };
      });
      res.json({ companies: out });
    } catch (e) {
      console.error('[ECD] Erro ao listar empresas:', e.message || e);
      res.status(500).json({ error: 'Erro ao listar empresas.' });
    }
  });

  router.post('/save', requireCsrf, async (req, res) => {
    try {
      const code = String(req.body?.code || '').trim();
      const simples = String(req.body?.simples || '').trim();
      const dfc = req.body?.dfc;

      if (!code) return res.status(400).json({ error: 'Código obrigatório.' });
      if (simples !== 'Simples' && simples !== 'Normal') {
        return res.status(400).json({ error: 'Tipo inválido (Simples/Normal).' });
      }
      if (typeof dfc !== 'boolean') {
        return res.status(400).json({ error: 'DFC inválido (true/false).' });
      }

      const status = loadEcdStatus();
      const cur = status.companies[code] || null;

      const nameFromReq = String(req.body?.name || '').trim();
      let name = nameFromReq;
      if (!name) {
        const all = loadEcdCompanies();
        const found = all.find((c) => String(c.code) === code);
        if (found?.name) name = found.name;
      }
      if (!name && cur?.name) name = cur.name;

      const isAdmin = (req.user?.role || '').toUpperCase() === 'ADMIN';
      if (cur?.completed && !isAdmin) {
        return res.status(409).json({ error: 'Empresa já está gerada e bloqueada para edição.' });
      }

      const nowIso = new Date().toISOString();
      const next = {
        code,
        name: name || '',
        simples,
        dfc,
        completed: true,
        arquivosNaPasta: cur?.arquivosNaPasta || 'N',
        lockedAt: nowIso,
        lockedBy: {
          id: req.user?.id || null,
          email: req.user?.email || null,
          name: req.user?.name || null,
        },
      };

      if (cur?.completed && isAdmin) {
        next.overrideAt = nowIso;
        next.overrideBy = {
          id: req.user?.id || null,
          email: req.user?.email || null,
          name: req.user?.name || null,
        };
      }

      status.companies[code] = next;
      if (!status.order.includes(code)) status.order.push(code);
      saveEcdStatus(status);

      await auditLog(req, 'ecd_status_save', 'ok', { code, simples, dfc });
      res.json({ ok: true, status: next });
    } catch (e) {
      console.error('[ECD] Erro ao salvar status:', e.message || e);
      res.status(500).json({ error: 'Erro ao salvar status.' });
    }
  });

  return router;
};
