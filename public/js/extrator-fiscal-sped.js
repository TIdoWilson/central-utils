/* global AuthClient, inicializarSidebar */

(function () {
  const SLUG = 'extrator-fiscal-sped';
  const API_BASE = '/api/extrator-fiscal-sped';

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(message, isError) {
    const box = $('statusBox');
    if (!box) return;
    box.textContent = String(message || '');
    box.classList.toggle('is-error', !!isError);
  }

  function setProcessing(isLoading) {
    const button = $('btnProcessar');
    if (!button) return;
    button.disabled = !!isLoading;
    button.textContent = isLoading ? 'Gerando...' : 'Gerar XLSX';
  }

  function updateDownload(url, fileName) {
    const link = $('btnBaixar');
    if (!link) return;
    if (!url) {
      link.style.display = 'none';
      link.href = '#';
      link.removeAttribute('download');
      return;
    }
    link.style.display = '';
    link.href = url;
    link.setAttribute('download', fileName || 'compras.xlsx');
  }

  function renderResult(data) {
    const box = $('resultadoBox');
    if (!box) return;
    if (!data || !data.ok) {
      box.innerHTML = `
        <strong>Aguardando processamento</strong>
        <div class="extrator-sped-muted">O portal vai liberar o download do XLSX assim que o processamento concluir.</div>
      `;
      return;
    }

    box.innerHTML = `
      <strong>Arquivo pronto</strong>
      <div class="extrator-sped-muted">Arquivo: ${escapeHtml(data.fileName || '')}</div>
      <div class="extrator-sped-muted">Itens processados: ${escapeHtml(String(data.totalItems || 0))}</div>
      <div class="extrator-sped-muted">Periodo: ${escapeHtml(data.period || 'indefinido')}</div>
      <div class="extrator-sped-muted">Encoding: ${escapeHtml(data.encoding || '-')}</div>
    `;
  }

  async function safeJson(response) {
    try {
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  async function processarArquivo() {
    const input = $('arquivoSped');
    const file = input?.files?.[0] || null;
    if (!file) {
      throw new Error('Selecione um arquivo SPED em .txt para continuar.');
    }

    const ext = String(file.name || '').toLowerCase();
    if (!ext.endsWith('.txt')) {
      throw new Error('Arquivo invalido. Envie um SPED em formato .txt.');
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await AuthClient.authFetch(`${API_BASE}/processar`, {
      method: 'POST',
      body: formData,
    });
    const data = await safeJson(response);

    if (!response.ok || !data?.ok) {
      const details = Array.isArray(data?.details) && data.details.length
        ? `\n${data.details.join('\n')}`
        : '';
      throw new Error(`${data?.error || 'Erro ao processar arquivo SPED.'}${details}`);
    }

    updateDownload(data.downloadUrl || '', data.fileName || '');
    renderResult(data);
    setStatus(data.message || 'Arquivo processado com sucesso.', false);
  }

  async function boot() {
    try {
      if (typeof inicializarSidebar === 'function') {
        await inicializarSidebar(SLUG);
      }

      renderResult(null);
      updateDownload('', '');

      $('btnProcessar')?.addEventListener('click', async () => {
        try {
          setProcessing(true);
          updateDownload('', '');
          renderResult(null);
          setStatus('Processando arquivo SPED...', false);
          await processarArquivo();
        } catch (error) {
          setStatus(String(error?.message || error || 'Erro ao processar arquivo.'), true);
        } finally {
          setProcessing(false);
        }
      });

      setStatus('Selecione um arquivo SPED para gerar o XLSX.', false);
    } catch (error) {
      setStatus(String(error?.message || error || 'Erro ao iniciar pagina.'), true);
    }
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
