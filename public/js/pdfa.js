// public/js/pdfa.js

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof inicializarSidebar === 'function') {
    try { await inicializarSidebar('pdfa'); } catch {}
  }

  if (!window.AuthClient) {
    window.location.href = '/login';
    return;
  }

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx) {
    window.location.href = '/login';
    return;
  }

  const form = document.getElementById('pdfaForm');
  const fileInput = document.getElementById('pdfaFile');
  const statusEl = document.getElementById('pdfaStatus');
  const resultEl = document.getElementById('pdfaResult');

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? 'red' : 'green';
  }

  function setResult(html) {
    if (!resultEl) return;
    resultEl.innerHTML = html || '';
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setResult('');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setStatus('Selecione um arquivo.', true);
      return;
    }

    setStatus('Convertendo para PDF/A...', false);

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const resp = await AuthClient.authFetch('/api/pdfa/convert', {
      method: 'POST',
      body: formData,
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok || !data.ok) {
      setStatus(data.error || 'Erro na conversão.', true);
      return;
    }

    setStatus('Conversão concluída.', false);
    setResult(`<a class="btn btn-secondary" href="${data.downloadUrl}">Baixar PDF/A</a>`);
  });
});
