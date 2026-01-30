// public/js/balancete-transitorio.js

document.addEventListener('DOMContentLoaded', async () => {
  // Sidebar
  if (typeof inicializarSidebar === 'function') {
    await inicializarSidebar('balancete-transitorio');
  }

  // AuthClient (CSRF nas mutações)
  if (!window.AuthClient) {
    console.error('AuthClient não carregado. Inclua /js/auth-client.js antes deste arquivo.');
    window.location.href = '/login';
    return;
  }

  // UI refs
  const filesInput = document.getElementById('filesInput');
  const btnStart = document.getElementById('btnStart');
  const btnReset = document.getElementById('btnReset');
  const btnLogout = document.getElementById('btnLogout');
  const whoami = document.getElementById('whoami');

  const jobMessage = document.getElementById('jobMessage');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const downloadArea = document.getElementById('downloadArea');
  const downloadLink = document.getElementById('downloadLink');
  const logBox = document.getElementById('logBox');

  btnLogout?.addEventListener('click', () => AuthClient.logoutAndRedirect());

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx) return;

  if (whoami) {
    whoami.textContent = `Logado como: ${ctx.user.name} <${ctx.user.email}> (${ctx.user.role})`;
  }

  let pollTimer = null;
  let currentJobId = null;

  function setProgress(pct) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    if (progressFill) progressFill.style.width = `${p}%`;
    if (progressText) progressText.textContent = `${p}%`;
  }

  function setMessage(msg) {
    if (jobMessage) jobMessage.textContent = msg || '';
  }

  function setLogs(lines) {
    if (!logBox) return;
    logBox.textContent = (lines || []).join('\n');
    logBox.scrollTop = logBox.scrollHeight;
  }

  function resetUI() {
    currentJobId = null;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;

    setMessage('Aguardando…');
    setProgress(0);
    setLogs([]);
    if (downloadArea) downloadArea.hidden = true;
    if (downloadLink) downloadLink.href = '#';
  }

  btnReset?.addEventListener('click', resetUI);

  async function fetchJob(jobId) {
    const resp = await AuthClient.authFetch(`/api/balancete-transitorio/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
    });
    if (!resp.ok) throw new Error('Falha ao consultar job.');
    return resp.json();
  }

  async function poll(jobId) {
    try {
      const st = await fetchJob(jobId);

      setProgress(st.progress);
      setMessage(st.message || st.status || '—');

      const logs = Array.isArray(st.logs) ? st.logs : [];
      const lines = logs
        .slice(-200)
        .map((l) => {
          const ts = (l.ts || '').toString();
          const msg = (l.msg || '').toString().trimEnd();
          return ts ? `[${ts}] ${msg}` : msg;
        })
        .filter(Boolean);

      setLogs(lines);

      if (st.status === 'done') {
        if (downloadArea) downloadArea.hidden = false;
        if (downloadLink) downloadLink.href = st.downloadUrl || '#';
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
      }

      if (st.status === 'error') {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
      }
    } catch (e) {
      console.error(e);
      // mantém tentando (pode ser restart momentâneo)
    }
  }

  btnStart?.addEventListener('click', async () => {
    resetUI();

    const files = filesInput?.files ? Array.from(filesInput.files) : [];
    if (!files.length) {
      setMessage('Selecione pelo menos 1 arquivo .xlsx.');
      return;
    }

    btnStart.disabled = true;
    setMessage('Enviando arquivos…');
    setProgress(5);

    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f, f.name);

      // POST com CSRF (AuthClient normalmente injeta x-csrf-token automaticamente)
      const resp = await AuthClient.authFetch('/api/balancete-transitorio/jobs', {
        method: 'POST',
        body: fd,
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.message || data.error || 'Falha ao criar job.');

      currentJobId = data.jobId;
      setMessage(`Job criado: ${currentJobId}`);
      setProgress(10);

      // primeira consulta imediata + polling
      await poll(currentJobId);
      pollTimer = setInterval(() => poll(currentJobId), 2000);
    } catch (err) {
      console.error(err);
      setMessage(err?.message || 'Erro ao iniciar o processamento.');
      setProgress(100);
    } finally {
      btnStart.disabled = false;
    }
  });

  resetUI();
});
