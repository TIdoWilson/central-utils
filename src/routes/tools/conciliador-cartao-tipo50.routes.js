const express = require('express');

module.exports = function createConciliadorCartaoTipo50Routes(deps) {
  const { requireCsrf, upload, axios, PY_API_URL } = deps;

  const router = express.Router();

  router.post(
    '/process',
    requireCsrf,
    upload.fields([
      { name: 'arquivoA', maxCount: 1 },
      { name: 'arquivoB', maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const arquivoA = req.files?.arquivoA?.[0];
        const arquivoB = req.files?.arquivoB?.[0];

        if (!arquivoA || !arquivoB) {
          return res.status(400).send('Envie os 2 PDFs: arquivoA e arquivoB.');
        }

        const form = new (require('form-data'))();
        form.append('arquivoA', arquivoA.buffer, {
          filename: arquivoA.originalname || 'arquivoA.pdf',
          contentType: arquivoA.mimetype,
        });
        form.append('arquivoB', arquivoB.buffer, {
          filename: arquivoB.originalname || 'arquivoB.pdf',
          contentType: arquivoB.mimetype,
        });

        const pyResp = await axios.post(`${PY_API_URL}/api/conciliador/cartao-tipo50`, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 180000,
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
