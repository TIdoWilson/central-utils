const express = require('express');

module.exports = function createExtratorZipRarRoutes(deps) {
  const {
    uploadExtratorZipRar,
    PY_BASE_URL,
    DATA_DIR,
    fs,
    path,
    axios,
    archiver,
  } = deps;

  const router = express.Router();

  router.post('/process', uploadExtratorZipRar.array('archives'), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
      }

      const jobId = Date.now().toString();
      const jobDir = path.join(DATA_DIR, 'extrator-zip-rar', jobId);

      await fs.promises.mkdir(jobDir, { recursive: true });

      for (const file of req.files) {
        const destPath = path.join(jobDir, file.originalname);
        await fs.promises.rename(file.path, destPath);
      }

      const pyResponse = await axios.post(
        `${PY_BASE_URL}/api/extrator-zip-rar/process`,
        {
          base_dir: jobDir,
          max_depth: 5,
        },
      );

      const resultado = pyResponse.data?.resultado || {};
      const destDir = resultado.dest_dir || path.join(jobDir, 'ARQUIVOS');

      const zipOutputPath = path.join(jobDir, 'resultado.zip');

      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipOutputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(destDir, false);
        archive.finalize();
      });

      return res.json({
        ok: true,
        downloadUrl: `/api/extrator-zip-rar/download/${jobId}`,
        stats: resultado,
      });
    } catch (error) {
      console.error('Erro em /api/extrator-zip-rar/process:', error);
      return res.status(500).json({
        ok: false,
        error: 'Erro ao processar arquivos ZIP/RAR.',
      });
    }
  });

  router.get('/download/:jobId', (req, res) => {
    const { jobId } = req.params;
    const zipPath = path.join(DATA_DIR, 'extrator-zip-rar', jobId, 'resultado.zip');

    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({
        ok: false,
        error: 'Arquivo de resultado não encontrado.',
      });
    }

    return res.download(zipPath, `resultado-extrator-zip-rar-${jobId}.zip`);
  });

  return router;
};
