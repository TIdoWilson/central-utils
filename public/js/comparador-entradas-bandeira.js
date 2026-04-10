document.addEventListener('DOMContentLoaded', () => {
  if (typeof inicializarSidebar === 'function') {
    inicializarSidebar('comparador-entradas-bandeira');
  }

  const form = document.getElementById('formComparadorEntradasBandeira');
  const arquivoFsist = document.getElementById('arquivoFsist');
  const arquivoEntradas = document.getElementById('arquivoEntradas');
  const statusMsg = document.getElementById('statusMsg');
  const resumoBox = document.getElementById('resumoBox');
  const btnProcessar = document.getElementById('btnProcessar');
  const btnLimpar = document.getElementById('btnLimpar');
  const btnBaixar = document.getElementById('btnBaixar');
  const tblPreview = document.getElementById('tblPreview');

  let ultimoArquivoBase64 = null;
  let ultimoArquivoNome = null;

  function fmtBRL(valor) {
    const numero = Number(valor || 0);
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(numero);
  }

  function escapeHtml(valor) {
    return String(valor || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(texto, isError = false) {
    statusMsg.textContent = texto || '';
    statusMsg.style.color = isError ? '#ffb3b3' : '';
  }

  function setLoading(loading) {
    btnProcessar.disabled = loading;
    btnProcessar.textContent = loading ? 'Processando...' : 'Processar';
  }

  function limparPreview() {
    tblPreview.innerHTML = '';
  }

  function renderResumo(data) {
    if (!data) {
      resumoBox.innerHTML = '<p>Nenhum processamento ainda.</p>';
      return;
    }

    resumoBox.innerHTML = `
      <div class="nfe-card-subtitle">
        <div><strong>Total de Linhas no Resultado:</strong> ${Number(data.totalLinhas || 0)}</div>
        <div><strong>DIVERGENTE ENTRE ARQUIVOS:</strong> ${Number(data.totalDivergenteEntreArquivos || 0)}</div>
        <div><strong>SÓ NO FSIST:</strong> ${Number(data.totalSoNoFsist || 0)}</div>
      </div>
    `;
  }

  function renderPreview(preview) {
    limparPreview();

    if (!Array.isArray(preview) || preview.length === 0) {
      tblPreview.innerHTML = '<tr><td colspan="5">Nenhuma divergência encontrada para os critérios configurados.</td></tr>';
      return;
    }

    preview.forEach((linha) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(linha['NÚMERO'])}</td>
        <td>${linha['VALOR FSIST'] == null ? '-' : fmtBRL(linha['VALOR FSIST'])}</td>
        <td>${linha['VALOR ENTRADAS'] == null ? '-' : fmtBRL(linha['VALOR ENTRADAS'])}</td>
        <td>${escapeHtml(linha.STATUS)}</td>
        <td>${linha.DIFERENÇA == null ? '-' : fmtBRL(linha.DIFERENÇA)}</td>
      `;
      tblPreview.appendChild(tr);
    });
  }

  function base64ToBlob(base64, mimeType) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i += 1) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  }

  btnBaixar.addEventListener('click', () => {
    if (!ultimoArquivoBase64) return;

    const blob = base64ToBlob(
      ultimoArquivoBase64,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = ultimoArquivoNome || 'comparativo_entradas_bandeira.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  btnLimpar.addEventListener('click', () => {
    form.reset();
    ultimoArquivoBase64 = null;
    ultimoArquivoNome = null;
    btnBaixar.disabled = true;
    btnLimpar.disabled = true;
    setStatus('');
    renderResumo(null);
    limparPreview();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!arquivoFsist.files?.length || !arquivoEntradas.files?.length) {
      setStatus('Selecione os dois arquivos para continuar.', true);
      return;
    }

    setLoading(true);
    setStatus('Processando arquivos...');
    btnBaixar.disabled = true;
    btnLimpar.disabled = true;
    renderResumo(null);
    limparPreview();

    try {
      const formData = new FormData();
      formData.append('arquivoFsist', arquivoFsist.files[0]);
      formData.append('arquivoEntradas', arquivoEntradas.files[0]);

      const response = await AuthClient.authFetch('/api/comparador-entradas-bandeira/processar', {
        method: 'POST',
        body: formData,
      });

      let data = null;
      let rawText = '';
      try {
        data = await response.json();
      } catch (_) {
        rawText = await response.text().catch(() => '');
      }
      if (!response.ok || !data || !data.ok) {
        const errorMessage = data?.error || rawText || 'Falha ao processar os arquivos.';
        throw new Error(errorMessage);
      }

      ultimoArquivoBase64 = data.xlsxBase64 || null;
      ultimoArquivoNome = data.arquivoSaida || 'comparativo_entradas_bandeira.xlsx';
      btnBaixar.disabled = !ultimoArquivoBase64;
      btnLimpar.disabled = false;

      renderResumo(data);
      renderPreview(data.preview || []);
      setStatus('Processamento concluído com sucesso.');
    } catch (error) {
      const mensagem = String(error?.message || '');
      if (mensagem.toLowerCase().includes('formato')) {
        setStatus(`Erro: ${mensagem}`, true);
      } else if (
        mensagem.toLowerCase().includes('corrompido')
        || mensagem.toLowerCase().includes('inválido')
        || mensagem.toLowerCase().includes('invalido')
      ) {
        setStatus(`Erro: ${mensagem}`, true);
      } else {
        setStatus(`Erro ao processar os arquivos. Detalhes: ${mensagem || 'erro interno.'}`, true);
      }
    } finally {
      setLoading(false);
    }
  });
});
