const express = require('express');

module.exports = function createAcertosLotesInternetsRoutes(deps) {
  const {
    requireCsrf,
    upload,
    getTextFromUploadedFile,
    processarLoteInternetsConteudo,
  } = deps;

  const router = express.Router();

  router.post('/process', requireCsrf, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: 'Nenhum arquivo enviado.',
        });
      }

      const conteudo = getTextFromUploadedFile(req.file);
      if (!conteudo) {
        return res.status(400).json({
          ok: false,
          error: 'Não foi possível ler o conteúdo do arquivo enviado.',
        });
      }

      const resultado = processarLoteInternetsConteudo(conteudo);

      const originalName = req.file.originalname || 'lancamentos.txt';
      const baseName =
        originalName.replace(/\.[^/.]+$/, '') || 'lancamentos';
      const processedFileName = `${baseName}-ajustado.txt`;
      const removedFileName = `${baseName}-linhas-removidas.txt`;

      return res.json({
        ok: true,
        ...resultado,
        processedFileName,
        removedFileName,
      });
    } catch (err) {
      console.error('Erro ao processar lote de internets:', err);
      return res.status(500).json({
        ok: false,
        error: 'Erro interno ao processar o arquivo de lote.',
      });
    }
  });

  return router;
};
