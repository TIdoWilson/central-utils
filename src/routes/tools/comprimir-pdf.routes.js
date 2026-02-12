const express = require('express');

module.exports = function createComprimirPdfRoutes(deps) {
  const { requireCsrf, upload, axios, PY_BASE_URL, fs } = deps;

  const router = express.Router();

  router.post(
    '/processar',
    requireCsrf,
    upload.single('file'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            ok: false,
            error: 'Nenhum arquivo foi enviado.',
          });
        }

        let fileBuffer;

        if (req.file.buffer) {
          fileBuffer = req.file.buffer;
        } else if (req.file.path) {
          fileBuffer = await fs.promises.readFile(req.file.path);
        } else {
          return res.status(400).json({
            ok: false,
            error: 'Não foi possível ler o arquivo enviado.',
          });
        }

        const fileBase64 = fileBuffer.toString('base64');

        const jpegQuality = Number(req.body.jpegQuality) || 50;
        const dpiScale = Number(req.body.dpiScale) || 1.0;

        const payload = {
          file_name: req.file.originalname,
          file_base64: fileBase64,
          jpeg_quality: jpegQuality,
          dpi_scale: dpiScale,
        };

        const apiResponse = await axios.post(
          `${PY_BASE_URL}/api/comprimir-pdf/processar`,
          payload,
          { timeout: 600000 }
        );

        if (req.file.path) {
          fs.promises.unlink(req.file.path).catch(() => { });
        }

        return res.json(apiResponse.data);
      } catch (err) {
        console.error('Erro na compressão de PDF:', err);
        return res.status(500).json({
          ok: false,
          error: 'Erro no servidor ao comprimir o PDF.',
        });
      }
    }
  );

  return router;
};
