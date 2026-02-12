const express = require('express');

module.exports = function createTareffaEmpresasLoteRoutes(deps) {
  const {
    requireCsrf,
    createJobsFromKeys,
    findJobByKey,
    updateJob,
    JOB_STATUS,
    startPythonJob,
    fs,
    path,
  } = deps;

  const router = express.Router();

  router.post('/jobs', requireCsrf, async (req, res) => {
    try {
      const companies = Array.isArray(req.body?.companies) ? req.body.companies : [];
      const options = req.body?.options || {};
      if (!companies.length) return res.status(400).json({ error: 'Sem empresas no payload' });

      const jobKey = `tareffa_empresas_lote_${Date.now()}`;

      const created = createJobsFromKeys([jobKey]);
      const job = (Array.isArray(created) && created[0]) || findJobByKey(jobKey);
      if (!job) return res.status(500).json({ error: 'Falha ao criar job na fila' });

      const tmpBase = path.join(process.cwd(), 'tmp', 'tareffa-empresas-lote', String(job.id));
      fs.mkdirSync(tmpBase, { recursive: true });

      const inputPath = path.join(tmpBase, 'input.json');
      fs.writeFileSync(inputPath, JSON.stringify({ companies, options }, null, 2), 'utf-8');

      updateJob(job.id, {
        status: JOB_STATUS.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        progress: 0,
        logs: [],
        updatedAt: new Date().toISOString(),
        key: jobKey,
        type: 'tareffa_empresas_lote',
      });

      setTimeout(() => {
        startPythonJob({
          jobId: job.id,
          jobKey,
          inputPath,
          outDir: tmpBase,
          headless: Boolean(options.headless),
        });
      }, 50);

      return res.json({ jobKey, jobId: job.id });
    } catch (e) {
      return res.status(500).json({ error: 'Falha ao criar job' });
    }
  });

  router.get('/jobs/:jobKey', (req, res) => {
    const job = findJobByKey(req.params.jobKey);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    return res.json(job);
  });

  return router;
};
