/* public/js/formatador-bernardina.js */
/* global inicializarSidebar */

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar (id precisa existir no MENU_CONFIG do sidebar.js)
  if (typeof inicializarSidebar === 'function') {
    inicializarSidebar('formatador-bernardina');
  }

  const form = document.getElementById('jobForm');
  const xlsxInput = document.getElementById('xlsxInput');

  const btnClear = document.getElementById('btnClear');
  const btnLogout = document.getElementById('btnLogout');

  const pageStatus = document.getElementById('pageStatus');
  const whoami = document.getElementById('whoami');

  const progressWrap = document.getElementById('progressWrap');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');

  const downloadLink = document.getElementById('downloadLink');
  const btnCopyJob = document.getElementById('btnCopyJob');
  const jobMeta = document.getElementById('jobMeta');
  const logsBody = document.getElementById('logsBody');

  let currentJobId = null;
  let pollTimer = null;

  // (Opcional) socket.io — só ativa se o backend emitir eventos
  const socket = window.io ? window.io() : null;
  if (socket) {
    socket.on('bernadina_job_update', (payload) => {
      if (!payload || payload.jobId !== currentJobId) return;
      renderJob(payload);
    });
  }

  btnLogout?.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      window.location.href = '/login';
    }
  });

  btnClear?.addEventListener('click', () => {
    xlsxInput.value = '';
    clearLogs();
    setStatus('');
    setProgress(null);
    setDownload(null);
    setJobMeta(null);
    stopPolling();
    currentJobId = null;
    btnCopyJob.style.display = 'none';
  });

  btnCopyJob?.addEventListener('click', async () => {
    if (!currentJobId) return;
    try {
      await navigator.clipboard.writeText(currentJobId);
      setStatus(`Job ID copiado: ${currentJobId}`, 'ok');
    } catch {
      setStatus(`Não consegui copiar. Job ID: ${currentJobId}`, 'info');
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const files = Array.from(xlsxInput.files || []);
    if (files.length === 0) {
      setStatus('Selecione pelo menos um arquivo .xlsx.', 'error');
      return;
    }

    // reset UI
    clearLogs();
    setDownload(null);
    setJobMeta(null);
    btnCopyJob.style.display = 'none';

    setStatus('Validando sessão...', 'info');
    setProgress({ percent: 5, label: 'Iniciando...' });

    try {
      const { csrfToken, user } = await getMe();
      if (whoami) whoami.textContent = user?.email ? `Logado como: ${user.email}` : '';

      setStatus('Enviando arquivos e criando job...', 'info');
      setProgress({ percent: 15, label: 'Enviando...' });

      const fd = new FormData();
      files.forEach((f) => fd.append('files', f, f.name)); // backend esperado: array('files')

      const resp = await fetch('/api/formatador-bernardina/jobs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrfToken },
        body: fd,
      });

      const data = await safeJson(resp);
      if (!resp.ok) throw new Error(data?.message || data?.error || `Falha ao criar job (${resp.status}).`);

      currentJobId = data.jobId;
      btnCopyJob.style.display = '';
      setStatus(`Job criado: ${currentJobId}`, 'ok');
      setJobMeta({ jobId: currentJobId, status: 'QUEUED' });
      setProgress({ percent: 25, label: 'Na fila...' });

      startPolling();
    } catch (err) {
      setStatus(err?.message || 'Erro inesperado.', 'error');
      setProgress(null);
    }
  });

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (!currentJobId) return;
      try {
        const resp = await fetch(`/api/formatador-bernardina/jobs/${encodeURIComponent(currentJobId)}`, {
          method: 'GET',
          credentials: 'include',
        });
        const data = await safeJson(resp);
        if (!resp.ok) throw new Error(data?.message || data?.error || `Falha ao consultar job (${resp.status}).`);
        renderJob(data);
      } catch (err) {
        setStatus(err?.message || 'Erro ao consultar job.', 'error');
      }
    }, 1200);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function renderJob(job) {
    // Aceita formatos comuns:
    // job.status: "queued|processing|done|error" OU "QUEUED|PROCESSING|DONE|ERROR"
    // job.progressPercent ou job.progress
    // job.message
    // job.logs: [{ ts, msg }]
    // job.downloadUrl

    const statusRaw = (job.status || '').toString();
    const status = statusRaw.toLowerCase();

    const percent =
      typeof job.progressPercent === 'number'
        ? clamp(job.progressPercent)
        : typeof job.progress === 'number'
          ? clamp(job.progress)
          : guessPercent(status);

    setJobMeta({
      jobId: job.jobId || currentJobId,
      status: statusRaw || 'PROCESSING',
      createdAt: job.createdAt,
    });

    if (job.message) pushLog(job.message);

    if (Array.isArray(job.logs)) renderLogs(job.logs);

    setProgress({ percent, label: statusLabel(status) });

    if (status === 'done') {
      setStatus('Concluído! ✅', 'ok');
      if (job.downloadUrl) setDownload(job.downloadUrl);
      stopPolling();
      return;
    }

    if (status === 'error') {
      setStatus(job.message || 'Job finalizou com erro. ❌', 'error');
      setDownload(null);
      stopPolling();
      return;
    }

    setStatus(statusLabel(status), 'info');
  }

  function statusLabel(status) {
    switch (status) {
      case 'queued':
        return 'Na fila...';
      case 'processing':
        return 'Processando...';
      case 'done':
        return 'Concluído.';
      case 'error':
        return 'Erro.';
      default:
        return status ? `Status: ${status}` : 'Aguardando...';
    }
  }

  function guessPercent(status) {
    switch (status) {
      case 'queued':
        return 20;
      case 'processing':
        return 60;
      case 'done':
        return 100;
      case 'error':
        return 100;
      default:
        return 0;
    }
  }

  function clamp(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return 0;
    return Math.max(0, Math.min(100, x));
  }

  function setStatus(text, kind) {
    if (!pageStatus) return;
    pageStatus.textContent = text || '';
    pageStatus.classList.remove('is-ok', 'is-error', 'is-info');
    if (kind === 'ok') pageStatus.classList.add('is-ok');
    if (kind === 'error') pageStatus.classList.add('is-error');
    if (kind === 'info') pageStatus.classList.add('is-info');
  }

  function setProgress(p) {
    if (!progressWrap || !progressFill || !progressLabel) return;

    if (!p) {
      progressWrap.classList.add('ajuste-progress-hidden');
      progressFill.style.width = '0%';
      progressLabel.textContent = '';
      return;
    }

    progressWrap.classList.remove('ajuste-progress-hidden');
    progressFill.style.width = `${p.percent}%`;
    progressLabel.textContent = `${p.percent}% — ${p.label || ''}`;
  }

  function setDownload(url) {
    if (!downloadLink) return;

    if (!url) {
      downloadLink.style.display = 'none';
      downloadLink.href = '#';
      return;
    }

    downloadLink.style.display = '';
    downloadLink.href = url;
  }

  function setJobMeta(job) {
    if (!jobMeta) return;

    if (!job) {
      jobMeta.textContent = '';
      return;
    }

    const parts = [];
    if (job.jobId) parts.push(`Job: ${job.jobId}`);
    if (job.status) parts.push(`Status: ${job.status}`);
    if (job.createdAt) {
      try {
        parts.push(`Criado em: ${new Date(job.createdAt).toLocaleString()}`);
      } catch {}
    }
    jobMeta.textContent = parts.join(' • ');
  }

  function clearLogs() {
    if (logsBody) logsBody.innerHTML = '';
  }

  function renderLogs(logs) {
    if (!logsBody) return;

    logsBody.innerHTML = '';
    logs.slice(-200).forEach((l) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      const td2 = document.createElement('td');

      td1.textContent = l.ts ? safeDate(l.ts) : '';
      td2.textContent = l.msg || l.message || '';

      tr.appendChild(td1);
      tr.appendChild(td2);
      logsBody.appendChild(tr);
    });
  }

  function pushLog(msg) {
    if (!logsBody) return;

    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    const td2 = document.createElement('td');

    td1.textContent = new Date().toLocaleString();
    td2.textContent = String(msg);

    tr.appendChild(td1);
    tr.appendChild(td2);
    logsBody.appendChild(tr);
  }

  function safeDate(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return '';
    }
  }

  async function getMe() {
    const resp = await fetch('/api/auth/me', { method: 'GET', credentials: 'include' });
    const data = await safeJson(resp);
    if (!resp.ok) {
      // se não autenticado, joga pro login
      window.location.href = '/login';
      throw new Error('Não autenticado.');
    }
    if (!data?.csrfToken) throw new Error('CSRF token não encontrado.');
    return data; // { user, csrfToken }
  }

  async function safeJson(resp) {
    try {
      return await resp.json();
    } catch {
      return null;
    }
  }
});
