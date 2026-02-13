const path = require('path');
const fs = require('fs');

function createNfeService({ uploadDir, parseFileToKeys, queue, io }) {
  const resolvedUploadDir = uploadDir || path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(resolvedUploadDir)) {
    fs.mkdirSync(resolvedUploadDir, { recursive: true });
  }

  function emitQueueUpdate() {
    io.emit('queue_update', {
      summary: queue.getSummary(),
      jobs: queue.getAllJobs(),
    });
  }

  function broadcastJobUpdate(job) {
    io.emit('job_update', job);
    emitQueueUpdate();
  }

  function getStatusPayload() {
    return {
      summary: queue.getSummary(),
      jobs: queue.getAllJobs(),
    };
  }

  function createJobsFromUpload(file) {
    if (!file) throw new Error('Arquivo não enviado');
    const tempFilePath = path.join(resolvedUploadDir, `${Date.now()}-${file.originalname}`);
    fs.writeFileSync(tempFilePath, file.buffer);
    const keys = parseFileToKeys(tempFilePath, file.originalname);
    const createdJobs = queue.createJobsFromKeys(keys);
    return { tempFilePath, createdJobs };
  }

  return {
    uploadDir: resolvedUploadDir,
    emitQueueUpdate,
    broadcastJobUpdate,
    getStatusPayload,
    createJobsFromUpload,
  };
}

module.exports = { createNfeService };
