const express = require('express');

module.exports = function createBalanceteTransitorioRoutes(deps) {
  const { BALANCETE_DIR, fs, path } = deps;

  const router = express.Router();

  router.get('/jobs/:jobId', (req, res) => {
    const statusPath = path.join(BALANCETE_DIR, req.params.jobId, 'job.json');
    if (!fs.existsSync(statusPath)) return res.status(404).json({ message: 'Job não encontrado.' });
    res.json(JSON.parse(fs.readFileSync(statusPath, 'utf-8')));
  });

  router.get('/jobs/:jobId/download', (req, res) => {
    const jobBase = path.join(BALANCETE_DIR, req.params.jobId);
    const zipPath = path.join(jobBase, `PDFs-Prontos-${req.params.jobId}.zip`);
    if (!fs.existsSync(zipPath)) return res.status(404).send('Arquivo não encontrado.');
    res.download(zipPath, path.basename(zipPath));
  });

  return router;
};
