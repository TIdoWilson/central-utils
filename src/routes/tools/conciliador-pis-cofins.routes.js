const express = require('express');

module.exports = function createConciliadorPisCofinsRoutes(deps) {
  const { requireCsrf, upload, axios, PY_API_URL } = deps;
  const router = express.Router();

  router.post(
    '/process',
    requireCsrf,
    upload.array('arquivos', 8),
    async (req, res) => {
      try {
        const arquivos = Array.isArray(req.files) ? req.files : [];
        const modo = String(req.body?.modo || 'AUTO').toUpperCase();
        const debug = String(req.body?.debug || req.query?.debug || '').trim();

        if (arquivos.length < 3) {
          return res.status(400).send('Envie no minimo 3 PDFs (PIS Razao, COFINS Razao e Relatorio).');
        }

        const form = new (require('form-data'))();
        for (const arq of arquivos) {
          form.append('arquivos', arq.buffer, {
            filename: arq.originalname || 'arquivo.pdf',
            contentType: arq.mimetype,
          });
        }
        form.append('modo', modo);
        if (debug) form.append('debug', debug);

        const pyResp = await axios.post(`${PY_API_URL}/api/conciliador/pis-cofins`, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 240000,
        });

        return res.json(pyResp.data);
      } catch (err) {
        const status = err.response?.status || 500;
        const detail = err.response?.data?.detail || err.response?.data || err.message || 'Erro';
        return res.status(status).send(typeof detail === 'string' ? detail : JSON.stringify(detail));
      }
    }
  );

  return router;
};
