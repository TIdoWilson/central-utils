const express = require('express');

module.exports = function createSeparadorFeriasFuncionarioRoutes(deps) {
  const {
    requireCsrf,
    uploadSeparadorFerias,
    FERIAS_FUNC_DIR,
    PY_BASE_URL,
    axios,
    fs,
    path,
  } = deps;

  const router = express.Router();

  router.post(
    '/process',
    requireCsrf,
    uploadSeparadorFerias.single('file'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            ok: false,
            error: 'Nenhum arquivo enviado.',
          });
        }

        if (!fs.existsSync(FERIAS_FUNC_DIR)) {
          fs.mkdirSync(FERIAS_FUNC_DIR, { recursive: true });
        }

        const originalPath = req.file.path;
        const finalPath = path.join(
          FERIAS_FUNC_DIR,
          `${Date.now()}-${req.file.originalname}`
        );

        fs.renameSync(originalPath, finalPath);

        const pyResp = await axios.post(
          `${PY_BASE_URL}/api/ferias-funcionario/processar`,
          {
            pdf_path: finalPath,
          }
        );

        const data = pyResp.data || {};
        if (!data.ok) {
          return res.status(500).json({
            ok: false,
            error:
              data.error || 'Falha ao processar o PDF de férias no backend Python.',
          });
        }

        const zipPath = data.zip_path;
        const zipName = path.basename(zipPath);
        const downloadUrl = `/api/separador-ferias-funcionario/download/${encodeURIComponent(
          zipName
        )}`;

        return res.json({
          ok: true,
          message: 'PDF de férias processado com sucesso.',
          empresa: data.empresa,
          total_paginas: data.total_paginas,
          total_funcionarios: data.total_funcionarios,
          arquivos: data.arquivos || [],
          download_url: downloadUrl,
        });
      } catch (err) {
        console.error('Erro em /api/separador-ferias-funcionario/process:', err);
        return res.status(500).json({
          ok: false,
          error: 'Erro interno ao processar o PDF de férias.',
        });
      }
    }
  );

  router.get('/download/:zipName', (req, res) => {
    try {
      const zipName = req.params.zipName;
      const zipPath = path.join(FERIAS_FUNC_DIR, zipName);

      if (!fs.existsSync(zipPath)) {
        return res.status(404).json({
          ok: false,
          error: 'Arquivo ZIP não encontrado.',
        });
      }

      res.download(zipPath, zipName, (err) => {
        if (err) {
          console.error(
            'Erro ao enviar ZIP em /api/separador-ferias-funcionario/download:',
            err
          );
          return;
        }

        fs.unlink(zipPath, (unlinkErr) => {
          if (unlinkErr) {
            console.error(
              'Erro ao apagar ZIP em /api/separador-ferias-funcionario/download:',
              unlinkErr
            );
          }
        });
      });
    } catch (err) {
      console.error(
        'Erro em /api/separador-ferias-funcionario/download:',
        err
      );
      return res.status(500).json({
        ok: false,
        error: 'Erro ao preparar download do ZIP.',
      });
    }
  });

  return router;
};
