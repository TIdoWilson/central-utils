const express = require('express');
const path = require('path');

module.exports = function createCalculoSalarioRoutes(deps) {
  const { requireCsrf, fs, dataDir } = deps;
  const router = express.Router();
  const STATE_FILE = path.join(dataDir, 'calculo-salario-shared.json');

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
      // req.body já foi parseado pelo express.json(); re-serializa preservando __INF__
      const raw = JSON.stringify(req.body, null, 2);
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
