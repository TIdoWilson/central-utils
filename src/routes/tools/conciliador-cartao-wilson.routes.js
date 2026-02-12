const express = require('express');

module.exports = function createConciliadorCartaoWilsonRoutes(deps) {
  const { requireCsrf, upload, axios, PY_API_URL } = deps;

  const router = express.Router();

  router.post(
    '/process',
    requireCsrf,
    upload.fields([
      { name: 'razaoPdf', maxCount: 1 },
      { name: 'financeiroPdf', maxCount: 1 }
    ]),
    async (req, res) => {
      try {
        const razao = req.files?.razaoPdf?.[0];
        const fin = req.files?.financeiroPdf?.[0];

        if (!razao || !fin) {
          return res.status(400).send('Envie os 2 PDFs: razaoPdf e financeiroPdf.');
        }

        const form = new (require('form-data'))();
        form.append('razaoPdf', razao.buffer, { filename: razao.originalname || 'razao.pdf', contentType: razao.mimetype });
        form.append('financeiroPdf', fin.buffer, { filename: fin.originalname || 'financeiro.pdf', contentType: fin.mimetype });

        form.append('valorTol', String(req.body.valorTol ?? '0.05'));
        form.append('diasJanela', String(req.body.diasJanela ?? '31'));
        form.append('limiarNome', String(req.body.limiarNome ?? '0.72'));

        const pyResp = await axios.post(`${PY_API_URL}/api/conciliador/cartao-wilson`, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 120000
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
