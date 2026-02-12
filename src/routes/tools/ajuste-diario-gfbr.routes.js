const express = require('express');

module.exports = function createAjusteDiarioGfbrRoutes(deps) {
  const {
    requireCsrf,
    uploadAjusteDiarioGfbr,
    axios,
    ajusteDiarioGfbrUploadsDir,
    fs,
    path,
  } = deps;

  const router = express.Router();

  router.post(
    '/processar',
    requireCsrf,
    uploadAjusteDiarioGfbr.single('arquivoDiario'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Nenhum arquivo Excel enviado.' });
        }

        const abaOrigem = (req.body.abaOrigem || '').trim();
        const criarBackupRaw = (req.body.criarBackup || '').toString().toLowerCase();
        const criarBackup =
          criarBackupRaw === '' ||
          criarBackupRaw === 'true' ||
          criarBackupRaw === 'on';

        const inputXlsxPath = req.file.path;

        const pyUrl =
          process.env.AJUSTE_DIARIO_GFBR_API_URL ||
          'http://localhost:8001/api/ajuste-diario-gfbr/processar';

        const pyResp = await axios.post(pyUrl, {
          input_xlsx_path: inputXlsxPath,
          aba_origem: abaOrigem || null,
          criar_backup: criarBackup,
        });

        const data = pyResp.data;

        if (!data || !data.ok || !data.resumo) {
          console.error(
            'Resposta inesperada do backend Python (ajuste-diario-gfbr):',
            pyResp.data
          );
          return res
            .status(500)
            .json({ error: 'Erro ao ajustar diário no backend Python.' });
        }

        const resumo = data.resumo;
        const backupFileName = resumo.backup_path
          ? path.basename(resumo.backup_path)
          : null;

        return res.json({
          ok: true,
          resumo,
          fileId: req.file.filename,
          downloadUrl: `/api/ajuste-diario-gfbr/download/${req.file.filename}`,
          backupDownloadUrl: backupFileName
            ? `/api/ajuste-diario-gfbr/download-backup/${backupFileName}`
            : null,
          message: resumo.mensagem || 'Diário ajustado com sucesso.',
        });

      } catch (err) {
        console.error('Erro em /api/ajuste-diario-gfbr/processar:', err);
        return res.status(500).json({ error: 'Erro ao processar diário.' });
      }
    }
  );

  router.get('/download/:fileId', (req, res) => {
    try {
      const fileId = req.params.fileId;
      const filePath = path.join(ajusteDiarioGfbrUploadsDir, fileId);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo ajustado não encontrado.' });
      }

      const downloadName = 'diario-ajustado.xlsx';
      res.download(filePath, downloadName);
    } catch (err) {
      console.error('Erro em /api/ajuste-diario-gfbr/download:', err);
      return res.status(500).json({ error: 'Erro ao baixar arquivo ajustado.' });
    }
  });

  router.get('/download-backup/:fileName', (req, res) => {
    try {
      const fileName = req.params.fileName;
      const filePath = path.join(ajusteDiarioGfbrUploadsDir, fileName);

      if (!fs.existsSync(filePath)) {
        return res
          .status(404)
          .json({ error: 'Arquivo de backup não encontrado.' });
      }

      const downloadName = 'diario-original.backup.xlsx';
      res.download(filePath, downloadName);
    } catch (err) {
      console.error('Erro em /api/ajuste-diario-gfbr/download-backup:', err);
      return res
        .status(500)
        .json({ error: 'Erro ao baixar arquivo de backup.' });
    }
  });

  return router;
};
