const express = require('express');

module.exports = function createPdfaRoutes(deps) {
  const {
    requireCsrf,
    uploadPdfa,
    PDFA_TMP_DIR,
    PDFA_OUT_DIR,
    pdfaGetLibreOfficePath,
    pdfaRun,
    pdfaGetGhostscriptPath,
    pdfaGetIccProfilePath,
    pdfaStoreFile,
    pdfaGetFile,
    auditLog,
    fs,
    path,
  } = deps;

  const router = express.Router();

  router.post('/convert', requireCsrf, uploadPdfa.single('file'), async (req, res) => {
    let tempDir = null;
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

      const originalName = req.file.originalname || 'arquivo';
      const ext = path.extname(originalName).toLowerCase();
      const inputPath = req.file.path;

      const workDir = fs.mkdtempSync(path.join(PDFA_TMP_DIR, 'job-'));
      tempDir = workDir;

      let pdfPath = inputPath;

      if (ext !== '.pdf') {
        const soffice = pdfaGetLibreOfficePath();
        if (!soffice) {
          return res.status(500).json({ error: 'LibreOffice não encontrado. Configure LIBREOFFICE_PATH.' });
        }

        const loArgs = [
          '--headless',
          '--nologo',
          '--nolockcheck',
          '--norestore',
          '--convert-to',
          'pdf',
          '--outdir',
          workDir,
          inputPath,
        ];

        await pdfaRun(soffice, loArgs, { cwd: workDir });

        const pdfCandidates = fs.readdirSync(workDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
        if (!pdfCandidates.length) {
          return res.status(500).json({ error: 'Falha ao converter para PDF.' });
        }
        pdfPath = path.join(workDir, pdfCandidates[0]);
      }

      const gs = pdfaGetGhostscriptPath();
      const icc = pdfaGetIccProfilePath();
      if (!icc) {
        return res.status(500).json({ error: 'Perfil ICC não encontrado. Configure PDFA_ICC_PROFILE.' });
      }

      const outName = `${path.parse(originalName).name}-PDFA.pdf`;
      const outPath = path.join(PDFA_OUT_DIR, `${Date.now()}-${outName}`);

      const gsArgs = [
        // Ghostscript 10+ roda em SAFER e pode bloquear leitura/escrita. Permitimos explicitamente só o necessário.
        `--permit-file-read=${pdfPath}`,
        `--permit-file-read=${icc}`,
        `--permit-file-write=${outPath}`,
        '-dPDFA=2',
        '-dPDFACompatibilityPolicy=1',
        '-dBATCH',
        '-dNOPAUSE',
        '-dNOOUTERSAVE',
        '-sProcessColorModel=DeviceRGB',
        '-sDEVICE=pdfwrite',
        `-sOutputICCProfile=${icc}`,
        `-sOutputFile=${outPath}`,
        pdfPath,
      ];

      await pdfaRun(gs, gsArgs, { cwd: workDir });

      const fileId = pdfaStoreFile(outPath);
      await auditLog(req, 'pdfa_convert', 'ok', { fileId, originalName });

      return res.json({
        ok: true,
        fileId,
        fileName: path.basename(outPath),
        downloadUrl: `/api/pdfa/download/${fileId}`,
      });
    } catch (e) {
      console.error('[PDF/A] erro:', e);
      return res.status(500).json({ error: 'Erro ao converter para PDF/A.' });
    } finally {
      if (tempDir && fs.existsSync(tempDir)) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
    }
  });

  router.get('/download/:id', async (req, res) => {
    const id = String(req.params.id || '').trim();
    const p = pdfaGetFile(id);
    if (!p || !fs.existsSync(p)) return res.status(404).send('Arquivo não encontrado.');
    return res.download(p, path.basename(p));
  });

  return router;
};
