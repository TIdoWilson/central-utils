const express = require('express');
const FormData = require('form-data');

module.exports = function createComparadorEntradasBandeiraRoutes(deps) {
  const { requireCsrf, upload, axios, PY_API_URL } = deps;
  const router = express.Router();

  router.post(
    '/processar',
    requireCsrf,
    upload.fields([
      { name: 'arquivoFsist', maxCount: 1 },
      { name: 'arquivoEntradas', maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const arquivoFsist = req.files?.arquivoFsist?.[0];
        const arquivoEntradas = req.files?.arquivoEntradas?.[0];

        if (!arquivoFsist || !arquivoEntradas) {
          return res.status(400).json({
            ok: false,
            error: 'Envie os dois arquivos: lista do FSIST e Entradas do IOB.',
          });
        }

        const form = new FormData();
        form.append('arquivo_fsist', arquivoFsist.buffer, {
          filename: arquivoFsist.originalname || 'fsist.xlsx',
          contentType:
            arquivoFsist.mimetype
            || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        form.append('arquivo_entradas', arquivoEntradas.buffer, {
          filename: arquivoEntradas.originalname || 'entradas.xlsx',
          contentType:
            arquivoEntradas.mimetype
            || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        const pyResp = await axios.post(
          `${PY_API_URL}/api/comparador-entradas-bandeira/processar`,
          form,
          {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 180000,
          },
        );

        return res.json(pyResp.data);
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
          return res.status(503).json({
            ok: false,
            error: 'Serviço de processamento indisponível no momento. Tente novamente em instantes.',
          });
        }
        if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
          return res.status(504).json({
            ok: false,
            error: 'Tempo limite excedido no processamento. Tente novamente.',
          });
        }
        const status = err.response?.status || 500;
        const detail
          = err.response?.data?.detail
            || err.response?.data?.error
            || err.response?.data
            || err.message
            || 'Erro interno ao processar os arquivos.';
        return res.status(status).json({
          ok: false,
          error: typeof detail === 'string' ? detail : JSON.stringify(detail),
        });
      }
    },
  );

  return router;
};
