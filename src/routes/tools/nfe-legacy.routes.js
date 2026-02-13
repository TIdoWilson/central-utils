const express = require('express');
const fs = require('fs');

module.exports = function createNfeLegacyRoutes(deps) {
  const {
    requireAuth,
    requireToolApi,
    requireCsrf,
    uploadMemory,
    queue,
    nfeService,
    io,
  } = deps;

  const router = express.Router();

  // teste simples (usado no popup da extensão)
  router.get('/api/ping', (req, res) => {
    res.send('ok');
  });

  // devolve a próxima chave pendente para a extensão
  router.get('/api/next-key', requireAuth, requireToolApi('nfe'), (req, res) => {
    const job = queue.getNextJob();
    if (!job) return res.json({ key: null });

    queue.updateJob(job.id, { status: queue.JOB_STATUS.PROCESSING });
    nfeService.broadcastJobUpdate(job);
    res.json({ key: job.key });
  });

  // marca uma chave como concluída (quando o XML já foi baixado)
  router.post('/api/mark-done', requireAuth, requireToolApi('nfe'), requireCsrf, (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'Chave não informada' });

    const job = queue.findJobByKey(key);
    if (!job) return res.status(404).json({ error: 'Job não encontrado para essa chave' });

    queue.updateJob(job.id, { status: queue.JOB_STATUS.DONE, errorMessage: null });
    nfeService.broadcastJobUpdate(job);
    res.json({ ok: true });
  });

  router.post('/api/clear-pending', requireAuth, requireToolApi('nfe'), requireCsrf, (req, res) => {
    try {
      const removedCount = queue.deleteJobsByStatus([
        queue.JOB_STATUS.PENDING,
        queue.JOB_STATUS.PROCESSING,
      ]);
      nfeService.emitQueueUpdate();
      res.json({ ok: true, removed: removedCount });
    } catch (err) {
      console.error('Erro ao limpar pendentes:', err);
      res.status(500).json({ error: 'Erro ao limpar chaves pendentes.' });
    }
  });

  router.post('/api/clear-done', requireAuth, requireToolApi('nfe'), requireCsrf, (req, res) => {
    try {
      const removedCount = queue.deleteJobsByStatus([queue.JOB_STATUS.DONE]);
      nfeService.emitQueueUpdate();
      res.json({ ok: true, removed: removedCount });
    } catch (err) {
      console.error('Erro ao limpar concluídos:', err);
      res.status(500).json({ error: 'Erro ao limpar chaves concluídas.' });
    }
  });

  router.post('/api/clear-errors', requireAuth, requireToolApi('nfe'), requireCsrf, (req, res) => {
    try {
      const removedCount = queue.deleteJobsByStatus([queue.JOB_STATUS.ERROR]);
      nfeService.emitQueueUpdate();
      res.json({ ok: true, removed: removedCount });
    } catch (err) {
      console.error('Erro ao limpar erros:', err);
      res.status(500).json({ error: 'Erro ao limpar chaves com erro.' });
    }
  });

  // endpoint de upload do arquivo com chaves
  router.post('/upload', requireAuth, requireToolApi('nfe'), requireCsrf, uploadMemory.single('file'), async (req, res) => {
    let tempFilePath = null;
    try {
      const { createdJobs, tempFilePath: tmp } = nfeService.createJobsFromUpload(req.file);
      tempFilePath = tmp;
      nfeService.emitQueueUpdate();
      return res.json({
        message: `Arquivo processado. ${createdJobs.length} chaves adicionadas à fila.`,
        count: createdJobs.length,
      });
    } catch (err) {
      console.error('Erro ao processar upload:', err);
      return res.status(500).json({ error: 'Erro ao processar arquivo' });
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlink(tempFilePath, (unlinkErr) => {
          if (unlinkErr) {
            console.error('Não foi possível apagar arquivo temporário de upload:', unlinkErr);
          }
        });
      }
    }
  });

  router.get('/status', requireAuth, requireToolApi('nfe'), (req, res) => {
    res.json(nfeService.getStatusPayload());
  });

  // Socket bootstrap: envia estado atual no connect
  if (io) {
    io.on('connection', (socket) => {
      socket.emit('queue_update', nfeService.getStatusPayload());
    });
  }

  return router;
};
