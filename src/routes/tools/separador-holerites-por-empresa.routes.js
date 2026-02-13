const express = require('express');

module.exports = function createSeparadorHoleritesPorEmpresaRoutes(deps) {
  const { requireCsrf, upload, axios } = deps;

  const router = express.Router();

  router.post('/', requireCsrf, upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const { competencia } = req.body;

      if (!file) {
        return res.status(400).json({ error: 'Arquivo PDF não enviado.' });
      }

      if (!competencia) {
        return res.status(400).json({ error: 'Competência é obrigatória.' });
      }

      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('pdf', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype || 'application/pdf',
      });
      formData.append('competencia', competencia);

      const pythonUrl = process.env.HOLERITES_SERVICE_URL ||
        `${process.env.PY_BASE_URL || 'http://127.0.0.1:8001'}/processar-holerites-por-empresa`;

      const response = await axios.post(pythonUrl, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        responseType: 'stream',
      });

      res.setHeader(
        'Content-Disposition',
        response.headers['content-disposition'] ||
        'attachment; filename="holerites_empresas.zip"'
      );
      res.setHeader(
        'Content-Type',
        response.headers['content-type'] || 'application/zip'
      );

      response.data.pipe(res);
    } catch (err) {
      console.error('Erro na API /api/separador-holerites-por-empresa:', err);

      if (err.response && err.response.data) {
        let errorMsg = 'Erro ao processar o PDF.';
        try {
          if (typeof err.response.data === 'string') {
            errorMsg = err.response.data;
          } else if (err.response.data.detail) {
            errorMsg = err.response.data.detail;
          } else if (err.response.data.error) {
            errorMsg = err.response.data.error;
          }
        } catch (_) { }

        return res.status(err.response.status || 500).json({ error: errorMsg });
      }

      return res
        .status(500)
        .json({ error: 'Erro interno ao chamar o serviço de holerites.' });
    }
  });

  return router;
};
