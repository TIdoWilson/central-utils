(() => {
  const SLUG = 'gfbr-gerador-txt';

  const $ = (id) => document.getElementById(id);

  function setStatus(message, isError) {
    const el = $('status');
    if (!el) return;
    el.textContent = String(message || '');
    el.style.color = isError ? '#b42318' : '#0c4a6e';
  }

  function resetResumo() {
    $('metricLidos').textContent = '0';
    $('metricExcluidos').textContent = '0';
    $('metricLinhasL').textContent = '0';
    $('metricPendencias').textContent = '0';

    const ul = $('listaAdvertencias');
    if (ul) ul.innerHTML = '';
    const container = $('advertenciasContainer');
    if (container) container.style.display = 'none';
  }

  function renderResumo(resumo) {
    $('metricLidos').textContent = String(resumo.lancamentos_lidos ?? 0);
    $('metricExcluidos').textContent = String(resumo.lancamentos_excluidos ?? 0);
    $('metricLinhasL').textContent = String(resumo.linhas_l_exportadas ?? 0);
    $('metricPendencias').textContent = String(resumo.pendencias ?? 0);

    const container = $('advertenciasContainer');
    const ul = $('listaAdvertencias');
    
    if (container && ul) {
      if (resumo.advertencias && resumo.advertencias.length > 0) {
        ul.innerHTML = '';
        resumo.advertencias.forEach(adv => {
          const li = document.createElement('li');
          li.textContent = adv;
          ul.appendChild(li);
        });
        container.style.display = 'block';
      } else {
        container.style.display = 'none';
        ul.innerHTML = '';
      }
    }
  }

  function setDownloadButtons(data) {
    const txt = $('btnDownloadTxt');
    const pend = $('btnDownloadPendencias');
    if (txt) {
      txt.disabled = !data?.downloadTxtUrl;
      txt.dataset.url = data?.downloadTxtUrl || '';
    }
    if (pend) {
      pend.disabled = !data?.downloadPendenciasUrl;
      pend.dataset.url = data?.downloadPendenciasUrl || '';
    }
  }

  function bindDownload(id) {
    const btn = $(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const url = btn.dataset.url || '';
      if (!url) return;
      window.open(url, '_blank');
    });
  }

  async function onSubmit(event) {
    event.preventDefault();

    const btn = $('btnProcessar');
    const fDiario = $('arquivoDiario');
    const fItau1 = $('pdfItau1');
    const fItau2 = $('pdfItau2');

    const hasAnyFile = (fDiario?.files?.length) || (fItau1?.files?.length) || (fItau2?.files?.length);
    if (!hasAnyFile) {
      setStatus('Selecione ao menos um arquivo (Diário Excel ou PDF Itaú) para processar.', true);
      return;
    }

    const formData = new FormData();
    if (fDiario?.files?.length) formData.append('arquivoDiario', fDiario.files[0]);
    if (fItau1?.files?.length) formData.append('pdfItau1', fItau1.files[0]);
    if (fItau2?.files?.length) formData.append('pdfItau2', fItau2.files[0]);

    const aba = ($('abaOrigem')?.value || '').trim();
    if (aba) formData.append('abaOrigem', aba);

    const c1 = ($('contaAplicacao1')?.value || '').trim();
    if (c1) formData.append('contaAplicacao1', c1);

    const c2 = ($('contaAplicacao2')?.value || '').trim();
    if (c2) formData.append('contaAplicacao2', c2);

    setStatus('Processando arquivo...', false);
    resetResumo();
    setDownloadButtons(null);

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Processando...';
    }

    try {
      const resp = await AuthClient.authFetch('/api/gfbr-gerador-txt/processar', {
        method: 'POST',
        body: formData,
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao processar o arquivo.');
      }

      renderResumo(data.resumo || {});
      setDownloadButtons(data);
      setStatus(data.message || 'Arquivo processado com sucesso.', false);
    } catch (err) {
      console.error(err);
      setStatus(err?.message || 'Erro inesperado ao processar arquivo.', true);
      resetResumo();
      setDownloadButtons(null);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Processar e gerar TXT';
      }
    }
  }

  function boot() {
    if (typeof inicializarSidebar === 'function') {
      inicializarSidebar(SLUG);
    }

    resetResumo();
    setDownloadButtons(null);
    setStatus('Anexe o Excel e clique em "Processar e gerar TXT".', false);

    $('gfbrGeradorTxtForm')?.addEventListener('submit', onSubmit);
    bindDownload('btnDownloadTxt');
    bindDownload('btnDownloadPendencias');
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
