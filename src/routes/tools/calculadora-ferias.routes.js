const express = require('express');
const path = require('path');

module.exports = function createCalculadoraFeriasRoutes(deps) {
  const { requireCsrf, fs, dataDir } = deps;
  const router = express.Router();
  const STATE_FILE = path.join(dataDir, 'calculadora-ferias-shared.json');

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

  router.get('/state', (req, res) => {
    try {
      if (!fs.existsSync(STATE_FILE)) return res.json({});
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      res.type('application/json').send(raw);
    } catch (error) {
      console.error('[calculadora-ferias] Erro ao ler estado:', error.message);
      res.status(500).json({ error: 'Erro ao ler estado compartilhado.' });
    }
  });

  router.post('/state', requireCsrf, (req, res) => {
    try {
      const currentState = readSharedState();
      const incomingState = req.body && typeof req.body === 'object' ? req.body : {};
      const user = req.user || req.auth?.user || null;
      const isRootAdmin = String(user?.role || '').toUpperCase() === 'ADMIN';
      const canEditAdvanced = isRootAdmin || isAdvancedParamsAdmin(user, currentState) || isAdvancedParamsAdmin(user, incomingState);

      const paramsChanged = JSON.stringify(incomingState.params || {}) !== JSON.stringify(currentState.params || {});
      const adminsChanged = JSON.stringify(Array.isArray(incomingState.paramAdmins) ? incomingState.paramAdmins : [])
        !== JSON.stringify(Array.isArray(currentState.paramAdmins) ? currentState.paramAdmins : []);

      if ((!canEditAdvanced && paramsChanged) || (!isRootAdmin && adminsChanged)) {
        return res.status(403).json({ error: 'Sem permissão para alterar parâmetros avançados.' });
      }

      const nextState = {
        params: canEditAdvanced && incomingState.params && typeof incomingState.params === 'object'
          ? incomingState.params
          : (currentState.params || {}),
        paramAdmins: isRootAdmin && Array.isArray(incomingState.paramAdmins)
          ? incomingState.paramAdmins.map(normalizeEmail).filter(Boolean)
          : (currentState.paramAdmins || []),
      };

      fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 2), 'utf8');
      res.json({ ok: true });
    } catch (error) {
      console.error('[calculadora-ferias] Erro ao salvar estado:', error.message);
      res.status(500).json({ error: 'Erro ao salvar estado compartilhado.' });
    }
  });

  return router;
};
