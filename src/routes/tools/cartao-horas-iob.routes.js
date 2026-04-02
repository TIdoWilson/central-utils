const express = require('express');
const FormData = require('form-data');

module.exports = function createCartaoHorasIobRoutes(deps) {
  const { requireCsrf, upload, axios, PY_API_URL } = deps;

  const router = express.Router();

  router.post(
    '/processar',
    requireCsrf,
    upload.single('arquivo'),
    async (req, res) => {
      try {
        const arquivo = req.file;
        if (!arquivo) {
          return res.status(400).json({ ok: false, error: 'Envie um PDF de cartao.' });
        }

        const eventosJson = req.body?.eventos_json || '{}';
        const idsJson = req.body?.ids_json || '{}';

        const form = new FormData();
        form.append('arquivo', arquivo.buffer, {
          filename: arquivo.originalname || 'cartao.pdf',
          contentType: arquivo.mimetype || 'application/pdf',
        });
        form.append('eventos_json', eventosJson);
        form.append('ids_json', idsJson);

        const pyResp = await axios.post(`${PY_API_URL}/api/cartao-horas-iob/processar`, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        return res.json(pyResp.data);
      } catch (err) {
        const status = err.response?.status || 500;
        const detail = err.response?.data?.detail || err.response?.data || err.message || 'Erro';
        return res.status(status).json({
          ok: false,
          error: typeof detail === 'string' ? detail : JSON.stringify(detail),
        });
      }
    }
  );

  return router;
};
