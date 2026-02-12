const express = require('express');

module.exports = function createSeparadorCsvBaixaAutomaticaRoutes(deps) {
  const {
    requireCsrf,
    uploadSeparadorCsv,
    SEPARADOR_CSV_OUTPUT_DIR,
    axios,
    fs,
    path,
    archiver,
  } = deps;

  const router = express.Router();

  router.post(
    '/processar',
    requireCsrf,
    uploadSeparadorCsv.single('arquivo'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            ok: false,
            error: 'Nenhum arquivo recebido.',
          });
        }

        const pythonBaseUrl =
          process.env.PYTHON_API_URL || 'http://127.0.0.1:8001';

        const jobId = Date.now().toString();
        const outputDir = path.join(SEPARADOR_CSV_OUTPUT_DIR, jobId);

        const payload = {
          input_path: req.file.path,
          output_dir: outputDir,
          sheet_name: 'BAIXAS',
          year_source_column: 'DATA EMISSÃO',
          max_linhas_por_arquivo: 50,
          csv_sep: ';',
        };

        const pyResponse = await axios.post(
          `${pythonBaseUrl}/api/separador-csv-baixa-automatica/processar`,
          payload
        );

        const data = pyResponse.data || {};

        if (!data.ok || !data.resultado) {
          return res.status(500).json({
            ok: false,
            error: data.error || 'Falha ao processar no backend Python.',
          });
        }

        const resultado = data.resultado;
        const arquivosGerados = resultado.arquivos_gerados || [];
        const resumoPorAno = resultado.resumo_por_ano || {};

        fs.mkdirSync(outputDir, { recursive: true });

        const zipPath = path.join(outputDir, 'resultado.zip');

        await new Promise((resolve, reject) => {
          const output = fs.createWriteStream(zipPath);
          const archive = archiver('zip', { zlib: { level: 9 } });

          output.on('close', resolve);
          archive.on('error', reject);

          archive.pipe(output);

          for (const arq of arquivosGerados) {
            const fullPath = path.join(outputDir, arq.arquivo);
            archive.file(fullPath, { name: arq.arquivo });
          }

          archive.finalize();
        });

        return res.json({
          ok: true,
          resumoPorAno,
          arquivosGerados,
          downloadId: jobId,
        });
      } catch (err) {
        console.error(err);
        return res.status(500).json({
          ok: false,
          error: 'Erro inesperado ao processar o arquivo.',
        });
      }
    }
  );

  router.get('/download/:jobId', (req, res) => {
    const { jobId } = req.params;

    const zipPath = path.join(
      SEPARADOR_CSV_OUTPUT_DIR,
      jobId,
      'resultado.zip'
    );

    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({
        ok: false,
        error: 'Arquivo ZIP não encontrado.',
      });
    }

    return res.download(zipPath, `separador-csv-baixa-automatica-${jobId}.zip`);
  });

  return router;
};
