/* public/js/conciliador-hausen-ocean.js */
/* global inicializarSidebar */

document.addEventListener('DOMContentLoaded', () => {
  if (typeof inicializarSidebar === 'function') {
    inicializarSidebar('conciliador-hausen-ocean');
  }

  const filesInput = document.getElementById('filesInput');
  const btnGenerate = document.getElementById('btnGenerate');
  const statusEl = document.getElementById('status');
  const whoami = document.getElementById('whoami');

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.remove('is-ok', 'is-error', 'is-info');
    if (kind === 'ok') statusEl.classList.add('is-ok');
    if (kind === 'error') statusEl.classList.add('is-error');
    if (kind === 'info') statusEl.classList.add('is-info');
  }

  async function getMe() {
    const resp = await fetch('/api/auth/me', { method: 'GET', credentials: 'include' });
    const data = await safeJson(resp);
    if (!resp.ok) {
      window.location.href = '/login';
      throw new Error('Não autenticado.');
    }
    if (!data?.csrfToken) throw new Error('CSRF token não encontrado.');
    return data;
  }

  async function safeJson(resp) {
    try {
      return await resp.json();
    } catch {
      return null;
    }
  }

  function getTipo() {
    const checked = document.querySelector('input[name="tipo"]:checked');
    return checked ? checked.value : 'dre';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'Consolidado.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  btnGenerate?.addEventListener('click', async () => {
    const files = Array.from(filesInput?.files || []);
    if (files.length !== 2) {
      setStatus('Selecione exatamente 2 arquivos.', 'error');
      return;
    }

    setStatus('Validando sessão...', 'info');
    try {
      const { csrfToken, user } = await getMe();
      if (whoami) whoami.textContent = user?.email ? `Logado como: ${user.email}` : '';

      const tipo = getTipo();
      const fd = new FormData();
      fd.append('tipo', tipo);
      files.forEach((f) => fd.append('files', f, f.name));

      setStatus('Processando...', 'info');
      const resp = await fetch('/api/conciliador-hausen-ocean/processar', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrfToken },
        body: fd,
      });

      if (!resp.ok) {
        const data = await safeJson(resp);
        throw new Error(data?.message || data?.error || `Erro (${resp.status})`);
      }

      const blob = await resp.blob();
      const dispo = resp.headers.get('content-disposition') || '';
      const match = /filename="([^"]+)"/i.exec(dispo);
      const filename = match ? match[1] : `Consolidado_${tipo.toUpperCase()}.xlsx`;
      downloadBlob(blob, filename);
      setStatus('Concluído. Download iniciado.', 'ok');
    } catch (err) {
      setStatus(err?.message || 'Erro ao processar.', 'error');
    }
  });
});
