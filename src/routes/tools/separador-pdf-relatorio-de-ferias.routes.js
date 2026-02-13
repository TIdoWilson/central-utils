const express = require('express');

module.exports = function createSeparadorPdfRelatorioFeriasRoutes(deps) {
  const { requireCsrf, uploadSeparadorFerias, axios, fs, path } = deps;

  const router = express.Router();

  router.post(
    '/processar',
    requireCsrf,
    uploadSeparadorFerias.single('arquivoPdf'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Nenhum arquivo PDF enviado.' });
        }

        const competencia = (req.body.competencia || '').trim();
        if (!competencia) {
          return res.status(400).json({ error: 'Competência não informada.' });
        }

        const inputPdfPath = req.file.path;

        const pyUrl =
          process.env.SEPARADOR_FERIAS_API_URL ||
          'http://localhost:8001/api/separador-pdf-relatorio-de-ferias/processar';

        const pyResp = await axios.post(pyUrl, {
          input_pdf_path: inputPdfPath,
          competencia,
        });

        if (!pyResp.data || !pyResp.data.ok || !pyResp.data.zip_path) {
          console.error('Resposta inesperada do backend Python:', pyResp.data);
          return res.status(500).json({ error: 'Erro ao gerar ZIP no backend Python.' });
        }

        const zipPath = pyResp.data.zip_path;

        if (!fs.existsSync(zipPath)) {
          return res.status(500).json({ error: 'Arquivo ZIP não encontrado após processamento.' });
        }

        const zipFilename = path.basename(zipPath);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

        const stream = fs.createReadStream(zipPath);
        stream.on('error', (err) => {
          console.error('Erro ao ler ZIP gerado:', err);
          res.status(500).end('Erro ao enviar ZIP.');
        });

        stream.pipe(res);
      } catch (err) {
        console.error('Erro em /api/separador-pdf-relatorio-de-ferias/processar:', err);
        return res.status(500).json({ error: 'Erro ao processar requisição.' });
      }
    }
  );

  return router;
};
