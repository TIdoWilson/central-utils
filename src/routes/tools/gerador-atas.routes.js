const express = require('express');

module.exports = function createGeradorAtasRoutes(deps) {
  const { requireCsrf, axios, PY_BASE_URL, DATA_DIR, path } = deps;

  const router = express.Router();

  router.get('/modelos', async (req, res) => {
    try {
      const { data } = await axios.get(`${PY_BASE_URL}/api/gerador-atas/modelos`);
      res.json(data);
    } catch (err) {
      console.error('Erro ao listar modelos de ata:', err.message);
      res.status(500).json({ ok: false, error: 'Erro ao listar modelos de ata' });
    }
  });

  router.get('/modelos/:modeloId/campos', async (req, res) => {
    const { modeloId } = req.params;
    try {
      const { data } = await axios.get(
        `${PY_BASE_URL}/api/gerador-atas/modelos/${encodeURIComponent(modeloId)}`
      );
      res.json(data);
    } catch (err) {
      console.error('Erro ao obter campos do modelo de ata:', err.message);
      res.status(500).json({ ok: false, error: 'Erro ao obter campos do modelo' });
    }
  });

  router.post('/gerar', requireCsrf, async (req, res) => {
    try {
      const { data } = await axios.post(
        `${PY_BASE_URL}/api/gerador-atas/gerar`,
        req.body
      );
      res.json(data);
    } catch (err) {
      console.error('Erro ao gerar ata:', err.message);
      res.status(500).json({ ok: false, error: 'Erro ao gerar ata' });
    }
  });

  router.get('/download/:fileName', (req, res) => {
    const { fileName } = req.params;
    const filePath = path.join(DATA_DIR, 'atas_geradas', fileName);
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Erro ao fazer download da ata:', err.message);
        if (!res.headersSent) {
          res.status(404).json({ ok: false, error: 'Arquivo não encontrado' });
        }
      }
    });
  });

  return router;
};
