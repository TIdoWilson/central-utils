document.addEventListener('DOMContentLoaded', () => {
  if (typeof inicializarSidebar === 'function') {
    inicializarSidebar('comparador-fsist-sped');
  }

  const form = document.getElementById('comparadorFsistSpedForm');
  const tipoSpedSelect = document.getElementById('tipoSpedSelect');
  const spedTxtInput = document.getElementById('spedTxtInput');
  const fsistInput = document.getElementById('fsistInput');
  const statusMsg = document.getElementById('statusMsg');
  const resumoBox = document.getElementById('resumoBox');
  const btnProcessar = document.getElementById('btnProcessar');
  const btnLimpar = document.getElementById('btnLimpar');
  const btnBaixar = document.getElementById('btnBaixar');
  const tblFaltantes = document.getElementById('tblFaltantes');
  const tblCst = document.getElementById('tblCst');

  let ultimoArquivoBase64 = null;
  let ultimoArquivoNome = null;

  function escapeHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtBRL(valor) {
    const numero = Number(valor || 0);
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(numero);
  }

  function setStatus(texto, isError = false) {
    statusMsg.textContent = texto || '';
    statusMsg.style.color = isError ? '#ffb3b3' : '';
  }

  function setLoading(loading) {
    btnProcessar.disabled = loading;
    btnProcessar.textContent = loading ? 'Processando...' : 'Processar';
  }

  function base64ToBlob(base64, mimeType) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i += 1) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  }

  function renderResumo(data) {
    if (!data) {
      resumoBox.innerHTML = '<p>Nenhum processamento ainda.</p>';
      return;
    }

    resumoBox.innerHTML = `
      <div class="nfe-metrics">
        <div class="nfe-metric">
          <span class="label">Tipo detectado</span>
          <strong>${escapeHtml(data.tipoSpedDetectado || '-')}</strong>
        </div>
        <div class="nfe-metric">
          <span class="label">Notas FSIST de entrada</span>
          <strong>${Number(data.totalXmlEntradasLidas || 0)}</strong>
        </div>
        <div class="nfe-metric">
          <span class="label">Notas SPED de entrada</span>
          <strong>${Number(data.totalNotasSPEDEntradas || 0)}</strong>
        </div>
        <div class="nfe-metric">
          <span class="label">Notas faltantes</span>
          <strong>${Number(data.totalNotasFaltantes || 0)}</strong>
        </div>
        <div class="nfe-metric">
          <span class="label">Comparações de CST</span>
          <strong>${Number(data.totalComparacoesCst || 0)}</strong>
        </div>
        <div class="nfe-metric">
          <span class="label">Divergências PIS</span>
          <strong>${Number(data.totalDivergenciasPis || 0)}</strong>
        </div>
        <div class="nfe-metric">
          <span class="label">Divergências COFINS</span>
          <strong>${Number(data.totalDivergenciasCofins || 0)}</strong>
        </div>
        <div class="nfe-metric">
          <span class="label">Saídas FSIST ignoradas</span>
          <strong>${Number(data.totalXmlSaidasIgnoradas || 0)}</strong>
        </div>
      </div>
    `;
  }

  function renderFaltantes(rows) {
    tblFaltantes.innerHTML = '';
    if (!Array.isArray(rows) || rows.length === 0) {
      tblFaltantes.innerHTML = '<tr><td colspan="10">Nenhuma nota faltante encontrada.</td></tr>';
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.tipoSped)}</td>
        <td>${escapeHtml(row.registro)}</td>
        <td>${escapeHtml(row.chave)}</td>
        <td>${escapeHtml(row.serie)}</td>
        <td>${escapeHtml(row.numero)}</td>
        <td>${escapeHtml(row.data)}</td>
        <td>${escapeHtml(row.emitDoc)}</td>
        <td>${row.valor == null ? '-' : escapeHtml(fmtBRL(row.valor))}</td>
        <td>${escapeHtml(row.arquivoFsist)}</td>
        <td>${escapeHtml(row.observacao)}</td>
      `;
      tblFaltantes.appendChild(tr);
    });
  }

  function renderComparacoes(rows) {
    tblCst.innerHTML = '';
    if (!Array.isArray(rows) || rows.length === 0) {
      tblCst.innerHTML = '<tr><td colspan="14">Nenhuma comparação de CST encontrada.</td></tr>';
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.tipoSped)}</td>
        <td>${escapeHtml(row.registro)}</td>
        <td>${escapeHtml(row.chave)}</td>
        <td>${escapeHtml(row.serie)}</td>
        <td>${escapeHtml(row.numero)}</td>
        <td>${escapeHtml(row.itemXml)}</td>
        <td>${escapeHtml(row.itemSped)}</td>
        <td>${escapeHtml(row.cstPisXml)}</td>
        <td>${escapeHtml(row.cstPisSped)}</td>
        <td>${escapeHtml(row.statusPis)}</td>
        <td>${escapeHtml(row.cstCofinsXml)}</td>
        <td>${escapeHtml(row.cstCofinsSped)}</td>
        <td>${escapeHtml(row.statusCofins)}</td>
        <td>${escapeHtml(row.observacao)}</td>
      `;
      tblCst.appendChild(tr);
    });
  }

  function limparTudo() {
    form.reset();
    ultimoArquivoBase64 = null;
    ultimoArquivoNome = null;
    btnBaixar.disabled = true;
    btnLimpar.disabled = true;
    resumoBox.innerHTML = '<p>Nenhum processamento ainda.</p>';
    tblFaltantes.innerHTML = '';
    tblCst.innerHTML = '';
    setStatus('');
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
    link.download = ultimoArquivoNome || 'comparador_fsist_sped.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  btnLimpar.addEventListener('click', limparTudo);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!spedTxtInput.files?.length) {
      setStatus('Selecione o TXT do SPED para continuar.', true);
      return;
    }

    if (!fsistInput.files?.length) {
      setStatus('Selecione ao menos um XML ou ZIP do FSIST para continuar.', true);
      return;
    }

    setLoading(true);
    setStatus('Processando arquivos...');
    btnBaixar.disabled = true;
    btnLimpar.disabled = true;

    try {
      const formData = new FormData();
      formData.append('tipoSped', tipoSpedSelect.value || 'auto');
      formData.append('spedArquivo', spedTxtInput.files[0]);
      Array.from(fsistInput.files || []).forEach((file) => {
        formData.append('fsistArquivos', file);
      });

      const response = await AuthClient.authFetch('/api/comparador-fsist-sped/processar', {
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
      ultimoArquivoNome = data.arquivoSaida || 'comparador_fsist_sped.xlsx';
      btnBaixar.disabled = !ultimoArquivoBase64;
      btnLimpar.disabled = false;

      renderResumo(data.resumo || null);
      renderFaltantes(data.previewFaltantes || []);
      renderComparacoes(data.previewCst || []);
      setStatus('Comparacao concluida com sucesso.');
    } catch (error) {
      const mensagem = String(error?.message || '');
      setStatus(`Erro ao processar os arquivos. Detalhes: ${mensagem || 'erro interno.'}`, true);
    } finally {
      setLoading(false);
    }
  });
});
