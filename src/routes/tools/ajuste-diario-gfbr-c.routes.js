const express = require('express');

module.exports = function createAjusteDiarioGfbrCRoutes(deps) {
  const { requireCsrf, upload, axios, fs, path } = deps;

  const router = express.Router();

  router.post('/processar', requireCsrf, upload.single('arquivoDiario'), async (req, res) => {
    let tempDir = null;
    let tempFilePath = null;

    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'Arquivo é obrigatório.' });
      }

      const goBase = process.env.GO_API_URL || 'http://127.0.0.1:8002';

      const FormData = require('form-data');
      const fd = new FormData();

      if (req.file.path) {
        tempFilePath = req.file.path;
      } else if (req.file.buffer) {
        const os = require('os');
        const crypto = require('crypto');

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajuste-diario-gfbr-c-'));
        const safeName = (req.file.originalname || 'diario.xlsx').replace(/[^\w.\- ]+/g, '_');
        tempFilePath = path.join(tempDir, `${crypto.randomBytes(6).toString('hex')}-${safeName}`);

        fs.writeFileSync(tempFilePath, req.file.buffer);
      } else {
        return res.status(400).json({
          ok: false,
          error: 'Upload inválido. Não foi possível acessar o arquivo (sem path e sem buffer).'
        });
      }

      fd.append('arquivo', fs.createReadStream(tempFilePath), req.file.originalname);

      const abaOrigem = (req.body?.abaOrigem || '').trim();
      if (abaOrigem) fd.append('aba', abaOrigem);

      const criarBackupRaw = String(req.body?.criarBackup ?? '').trim().toLowerCase();
      if (criarBackupRaw) fd.append('criar_backup', criarBackupRaw);

      const resp = await axios.post(`${goBase}/api/ajuste-diario-gfbr-c/processar`, fd, {
        headers: fd.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: () => true
      });

      return res.status(resp.status || 200).json(resp.data);

    } catch (err) {
      console.error('Erro em /api/ajuste-diario-gfbr-c/processar:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'Erro ao processar requisição.' });
    } finally {
      try {
        if (tempFilePath && tempDir && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch (_) { }

      try {
        if (tempDir && fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
      } catch (_) { }

      try {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (_) { }
    }
  });

  router.get('/download/ajustado/:id', async (req, res) => {
    try {
      const goBase = process.env.GO_API_URL || 'http://127.0.0.1:8002';
      const id = encodeURIComponent(req.params.id);

      const resp = await axios.get(`${goBase}/api/ajuste-diario-gfbr-c/download/ajustado/${id}`, {
        responseType: 'stream',
        validateStatus: () => true
      });

      if (resp.status >= 400) return res.status(resp.status).send('Arquivo não encontrado ou expirado.');

      if (resp.headers['content-type']) res.setHeader('Content-Type', resp.headers['content-type']);
      if (resp.headers['content-disposition']) res.setHeader('Content-Disposition', resp.headers['content-disposition']);

      resp.data.pipe(res);
    } catch (err) {
      console.error('Erro em download ajustado:', err?.message || err);
      return res.status(404).send('Arquivo não encontrado ou expirado.');
    }
  });

  router.get('/download/backup/:id', async (req, res) => {
    try {
      const goBase = process.env.GO_API_URL || 'http://127.0.0.1:8002';
      const id = encodeURIComponent(req.params.id);

      const resp = await axios.get(`${goBase}/api/ajuste-diario-gfbr-c/download/backup/${id}`, {
        responseType: 'stream',
        validateStatus: () => true
      });

      if (resp.status >= 400) return res.status(resp.status).send('Backup não encontrado ou expirado.');

      if (resp.headers['content-type']) res.setHeader('Content-Type', resp.headers['content-type']);
      if (resp.headers['content-disposition']) res.setHeader('Content-Disposition', resp.headers['content-disposition']);

      resp.data.pipe(res);
    } catch (err) {
      console.error('Erro em download backup:', err?.message || err);
      return res.status(404).send('Backup não encontrado ou expirado.');
    }
  });

  return router;
};
