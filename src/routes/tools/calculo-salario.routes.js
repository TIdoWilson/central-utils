const express = require('express');
const path = require('path');

module.exports = function createCalculoSalarioRoutes(deps) {
  const { requireCsrf, fs, dataDir } = deps;
  const router = express.Router();
  const STATE_FILE = path.join(dataDir, 'calculo-salario-shared.json');
  const SAFE_OVERRIDE_KEYS = new Set(['diasTrab', 'diasMes', 'dsr', 'faltas', 'pontosFac', 'extraEarnings', 'extraDeductions']);

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function readSharedState() {
    if (!fs.existsSync(STATE_FILE)) return {};
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (_) {
      return {};
    }
  }

  function isAdvancedParamsAdmin(user, state) {
    if (String(user?.role || '').toUpperCase() === 'ADMIN') return true;
    const email = normalizeEmail(user?.email);
    if (!email) return false;
    const admins = Array.isArray(state?.paramAdmins) ? state.paramAdmins.map(normalizeEmail).filter(Boolean) : [];
    return admins.includes(email);
  }

  function getProtectedOverrides(overrides) {
    const source = overrides && typeof overrides === 'object' ? overrides : {};
    const snapshot = {};
    for (const [tab, tabOverrides] of Object.entries(source)) {
      if (!tabOverrides || typeof tabOverrides !== 'object') continue;
      const protectedSlice = {};
      for (const key of ['params', 'inssBands', 'inssMax', 'inssFlat', 'irrfBands']) {
        if (tabOverrides[key] !== undefined) protectedSlice[key] = tabOverrides[key];
      }
      if (Object.keys(protectedSlice).length) snapshot[tab] = protectedSlice;
    }
    return snapshot;
  }

  function mergeOverrides(existingOverrides, incomingOverrides, canEditAdvanced) {
    const existing = existingOverrides && typeof existingOverrides === 'object' ? existingOverrides : {};
    const incoming = incomingOverrides && typeof incomingOverrides === 'object' ? incomingOverrides : {};
    if (canEditAdvanced) {
      return { ...existing, ...incoming };
    }

    const merged = { ...existing };
    for (const [tab, tabOverrides] of Object.entries(incoming)) {
      if (!tabOverrides || typeof tabOverrides !== 'object') continue;
      const current = merged[tab] && typeof merged[tab] === 'object' ? { ...merged[tab] } : {};
      for (const key of SAFE_OVERRIDE_KEYS) {
        if (tabOverrides[key] !== undefined) current[key] = tabOverrides[key];
      }
      merged[tab] = current;
    }
    return merged;
  }

  // GET /state — retorna estado compartilhado entre todos os usuários
  router.get('/state', (req, res) => {
    try {
      if (!fs.existsSync(STATE_FILE)) return res.json({});
      // Envia raw para preservar sentinelas __INF__ (Infinity) do cliente
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      res.type('application/json').send(raw);
    } catch (e) {
      console.error('[calculo-salario] Erro ao ler estado:', e.message);
      res.status(500).json({ error: 'Erro ao ler estado compartilhado.' });
    }
  });

  // POST /state — persiste estado compartilhado
  router.post('/state', requireCsrf, (req, res) => {
    try {
      const currentState = readSharedState();
      const incomingState = req.body && typeof req.body === 'object' ? req.body : {};
      const user = req.user || req.auth?.user || null;
      const canEditAdvanced = isAdvancedParamsAdmin(user, currentState) || isAdvancedParamsAdmin(user, incomingState);

      if (!canEditAdvanced) {
        const protectedChanged = JSON.stringify(getProtectedOverrides(incomingState.overrides)) !== JSON.stringify(getProtectedOverrides(currentState.overrides))
          || JSON.stringify(Array.isArray(incomingState.paramAdmins) ? incomingState.paramAdmins : []) !== JSON.stringify(Array.isArray(currentState.paramAdmins) ? currentState.paramAdmins : [])
          || JSON.stringify(Array.isArray(incomingState.deletedTabs) ? incomingState.deletedTabs : []) !== JSON.stringify(Array.isArray(currentState.deletedTabs) ? currentState.deletedTabs : []);
        if (protectedChanged) {
          return res.status(403).json({ error: 'Sem permissão para alterar parâmetros avançados.' });
        }
      }

      const nextState = {
        ...currentState,
        ...incomingState,
        overrides: mergeOverrides(currentState.overrides, incomingState.overrides, canEditAdvanced),
        hiddenTabs: Array.isArray(incomingState.hiddenTabs) ? incomingState.hiddenTabs : (currentState.hiddenTabs || []),
        dynamicTabs: Array.isArray(incomingState.dynamicTabs) ? incomingState.dynamicTabs : (currentState.dynamicTabs || []),
        deletedTabs: canEditAdvanced && Array.isArray(incomingState.deletedTabs) ? incomingState.deletedTabs : (currentState.deletedTabs || []),
        paramAdmins: canEditAdvanced && Array.isArray(incomingState.paramAdmins)
          ? incomingState.paramAdmins.map(normalizeEmail).filter(Boolean)
          : (currentState.paramAdmins || []),
      };

      // req.body já foi parseado pelo express.json(); re-serializa preservando __INF__
      const raw = JSON.stringify(nextState, null, 2);
      fs.writeFileSync(STATE_FILE, raw, 'utf8');
      res.json({ ok: true });
    } catch (e) {
      console.error('[calculo-salario] Erro ao salvar estado:', e.message);
      res.status(500).json({ error: 'Erro ao salvar estado compartilhado.' });
    }
  });

  // GET /feriados/:ano — serve arquivo JSON local de feriados
  router.get('/feriados/:ano', (req, res) => {
    const ano = parseInt(req.params.ano, 10);
    if (!ano || ano < 2000 || ano > 2100) return res.status(400).json({ error: 'Ano inválido' });
    const file = path.join(dataDir, 'calculo-salario', `feriados_${ano}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Não encontrado' });
    try {
      const raw = fs.readFileSync(file, 'utf8');
      res.type('application/json').send(raw);
    } catch (e) {
      console.error('[calculo-salario] Erro ao ler feriados:', e.message);
      res.status(500).json({ error: 'Erro ao ler feriados.' });
    }
  });

  // POST /feriados/:ano/entry — adiciona feriado ao JSON
  router.post('/feriados/:ano/entry', requireCsrf, (req, res) => {
    const ano = parseInt(req.params.ano, 10);
    if (!ano || ano < 2020 || ano > 2040) return res.status(400).json({ error: 'Ano inválido' });
    const file = path.join(dataDir, 'calculo-salario', `feriados_${ano}.json`);
    try {
      let data = { status: 'success', data: [] };
      if (fs.existsSync(file)) { try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e){} }
      if (!Array.isArray(data.data)) data.data = [];
      const entry = req.body;
      if (!entry || !entry.name || !entry.date || !entry.type) return res.status(400).json({ error: 'Dados inválidos' });
      const { randomUUID } = require('crypto');
      entry.id = entry.id || randomUUID();
      entry.year = ano;
      entry.is_fixed = false;
      entry.created_at = new Date().toISOString();
      entry.updated_at = new Date().toISOString();
      data.data.push(entry);
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      res.json({ ok: true, entry });
    } catch(e) {
      console.error('[calculo-salario] Erro ao adicionar feriado:', e.message);
      res.status(500).json({ error: 'Erro ao salvar feriado.' });
    }
  });

  // DELETE /feriados/:ano/entry/:entryId — remove feriado do JSON
  router.delete('/feriados/:ano/entry/:entryId', requireCsrf, (req, res) => {
    const ano = parseInt(req.params.ano, 10);
    if (!ano || ano < 2020 || ano > 2040) return res.status(400).json({ error: 'Ano inválido' });
    const file = path.join(dataDir, 'calculo-salario', `feriados_${ano}.json`);
    try {
      if (!fs.existsSync(file)) return res.status(404).json({ error: 'Não encontrado' });
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(data.data)) return res.status(404).json({ error: 'Dados inválidos' });
      const id = req.params.entryId;
      const before = data.data.length;
      data.data = data.data.filter(e => e.id !== id);
      if (data.data.length === before) return res.status(404).json({ error: 'Feriado não encontrado' });
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      res.json({ ok: true });
    } catch(e) {
      console.error('[calculo-salario] Erro ao excluir feriado:', e.message);
      res.status(500).json({ error: 'Erro ao excluir feriado.' });
    }
  });

  return router;
};
