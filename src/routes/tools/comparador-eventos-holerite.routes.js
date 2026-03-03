const express = require('express');

module.exports = function createComparadorEventosHoleriteRoutes(deps) {
  const { requireCsrf, upload, axios, PY_API_URL } = deps;
  const router = express.Router();

  router.post('/processar', requireCsrf, upload.single('arquivo'), async (req, res) => {
    try {
      const file = req.file;
      const { competenciaAnterior, competenciaAtual, ocultarEventosJson } = req.body;

      if (!file) return res.status(400).json({ error: 'Arquivo SLK nao enviado.' });

      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('arquivo', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype || 'application/octet-stream',
      });
      if (competenciaAnterior) formData.append('competencia_anterior', competenciaAnterior);
      if (competenciaAtual) formData.append('competencia_atual', competenciaAtual);
      if (ocultarEventosJson) formData.append('ocultar_eventos_json', ocultarEventosJson);

      const response = await axios.post(
        `${PY_API_URL || 'http://127.0.0.1:8001'}/api/comparador-eventos-holerite/processar`,
        formData,
        {
          headers: formData.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );

      return res.json(response.data);
    } catch (err) {
      console.error('Erro na API /api/comparador-eventos-holerite/processar:', err?.response?.data || err.message || err);
      return res.status(err?.response?.status || 500).json({
        error: err?.response?.data?.detail || err?.response?.data?.error || 'Erro interno ao processar o arquivo.',
      });
    }
  });

  return router;
};
