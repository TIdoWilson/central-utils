const express = require('express');

module.exports = function createExcelAbasPdfRoutes(deps) {
  const {
    requireCsrf,
    upload,
    PY_BASE_URL,
    EXCEL_ABAS_PDF_DIR,
    criarZipComPdfs,
    axios,
    fs,
    path,
  } = deps;

  const router = express.Router();

  router.post(
    '/processar',
    requireCsrf,
    upload.array('files'),
    async (req, res) => {
      try {
        const files = req.files || [];
        if (!files.length) {
          return res
            .status(400)
            .json({ ok: false, error: 'Nenhum arquivo Excel enviado.' });
        }

        const jobId = Date.now().toString();
        const jobDir = path.join(EXCEL_ABAS_PDF_DIR, jobId);
        const inputDir = path.join(jobDir, 'input');
        const outputDir = path.join(jobDir, 'pdfs');

        fs.mkdirSync(inputDir, { recursive: true });
        fs.mkdirSync(outputDir, { recursive: true });

        const arquivos = [];

        for (const f of files) {
          const originalName = f.originalname || `arquivo-${Date.now()}.xlsx`;
          const safeName = originalName.replace(/[^\w\-.]/g, '_');
          const destPath = path.join(inputDir, safeName);

          if (f.buffer) {
            fs.writeFileSync(destPath, f.buffer);
          } else if (f.path) {
            fs.copyFileSync(f.path, destPath);
          } else {
            continue;
          }

          arquivos.push(destPath);
        }

        if (!arquivos.length) {
          return res.status(400).json({
            ok: false,
            error: 'Não foi possível salvar os arquivos Excel no servidor.',
          });
        }

        const response = await axios.post(
          `${PY_BASE_URL}/api/excel-abas-pdf/processar`,
          {
            arquivos,
            pasta_destino: outputDir,
          }
        );

        const data = response.data || {};
        if (!data.ok) {
          return res.status(500).json({
            ok: false,
            error: data.error || 'Falha ao gerar PDFs no backend Python.',
          });
        }

        const zipPath = path.join(EXCEL_ABAS_PDF_DIR, `${jobId}.zip`);
        await criarZipComPdfs(outputDir, zipPath);

        const zipUrl = `/api/excel-abas-pdf/download/${jobId}`;

        return res.json({
          ok: true,
          jobId,
          zipUrl,
          resultados: data.resultados || [],
        });
      } catch (err) {
        console.error('Erro em /api/excel-abas-pdf/processar', err);
        return res.status(500).json({
          ok: false,
          error: 'Erro interno ao processar os arquivos Excel.',
        });
      }
    }
  );

  router.get('/download/:jobId', (req, res) => {
    const { jobId } = req.params;
    const zipPath = path.join(EXCEL_ABAS_PDF_DIR, `${jobId}.zip`);

    if (!fs.existsSync(zipPath)) {
      return res
        .status(404)
        .json({ ok: false, error: 'Arquivo ZIP não encontrado.' });
    }

    res.download(zipPath, `excel-abas-pdf-${jobId}.zip`);
  });

  return router;
};
