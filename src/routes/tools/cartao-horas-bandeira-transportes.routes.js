const express = require('express');
const FormData = require('form-data');

module.exports = function createCartaoHorasBandeiraTransportesRoutes(deps) {
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
          return res.status(400).json({ ok: false, error: 'Envie um PDF.' });
        }

        const idsJson = req.body?.ids_json || '{}';

        const form = new FormData();
        form.append('arquivo', arquivo.buffer, {
          filename: arquivo.originalname || 'arquivo.pdf',
          contentType: arquivo.mimetype || 'application/pdf',
        });
        form.append('ids_json', idsJson);

        const pyResp = await axios.post(`${PY_API_URL}/api/cartao-horas-bandeira-transportes/processar`, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 180000,
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

  router.post('/salvar-funcionario', requireCsrf, async (req, res) => {
    try {
      const payload = {
        nome: String(req.body?.nome || ''),
        cpf: String(req.body?.cpf || ''),
        matricula: String(req.body?.matricula || ''),
      };

      const pyResp = await axios.post(
        `${PY_API_URL}/api/cartao-horas-bandeira-transportes/salvar-funcionario`,
        payload,
        { timeout: 120000 }
      );

      return res.json(pyResp.data);
    } catch (err) {
      const status = err.response?.status || 500;
      const detail = err.response?.data?.detail || err.response?.data || err.message || 'Erro';
      return res.status(status).json({
        ok: false,
        error: typeof detail === 'string' ? detail : JSON.stringify(detail),
      });
    }
  });

  return router;
};
