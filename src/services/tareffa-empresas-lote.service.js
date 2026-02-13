const path = require('path');
const { spawn } = require('child_process');

function createTareffaEmpresasLoteService({ updateJob, JOB_STATUS }) {
  function startPythonJob({ jobId, inputPath, outDir, headless }) {
    const pythonBin = process.env.PYTHON_BIN || 'python';
    const scriptPath = path.join(process.cwd(), 'api', 'tareffa_empresas_lote_job.py');

    const args = [
      scriptPath,
      '--input', inputPath,
      '--outdir', outDir,
    ];
    if (headless) args.push('--headless');

    const child = spawn(pythonBin, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const logs = [];
    const pushLog = (line) => {
      const s = String(line || '').trim();
      if (!s) return;
      logs.push(s);
      updateJob(jobId, { logs: logs.slice(-800), updatedAt: new Date().toISOString() });
    };

    updateJob(jobId, { status: JOB_STATUS.PROCESSING, logs, updatedAt: new Date().toISOString() });

    child.stdout.on('data', (buf) => {
      const text = buf.toString('utf-8');
      text.split(/\r?\n/).forEach((line) => {
        if (!line.trim()) return;

        if (line.startsWith('__EVENT__')) {
          try {
            const ev = JSON.parse(line.replace(/^__EVENT__/, ''));
            if (ev.type === 'log') {
              pushLog(ev.message);
            } else if (ev.type === 'progress') {
              const pct = ev.total ? Math.round((ev.current / ev.total) * 100) : null;
              updateJob(jobId, { progress: pct ?? 0, current: ev.current, total: ev.total });
            } else if (ev.type === 'done') {
              pushLog('✅ Job finalizado.');
              updateJob(jobId, { status: JOB_STATUS.DONE, progress: 100, result: ev.result });
            } else if (ev.type === 'error') {
              pushLog(`❌ ERRO: ${ev.message}`);
              updateJob(jobId, { status: JOB_STATUS.ERROR, errorMessage: ev.message });
            } else {
              pushLog(JSON.stringify(ev));
            }
            return;
          } catch (e) {
            // cai no log padrão
          }
        }

        pushLog(line);
      });
    });

    child.stderr.on('data', (buf) => {
      const text = buf.toString('utf-8');
      text.split(/\r?\n/).forEach((line) => {
        if (line.trim()) pushLog('[stderr] ' + line.trim());
      });
    });

    child.on('close', (code) => {
      if (code === 0) return;
      updateJob(jobId, { status: JOB_STATUS.ERROR, errorMessage: `Python saiu com código ${code}` });
    });
  }

  return { startPythonJob };
}

module.exports = { createTareffaEmpresasLoteService };
