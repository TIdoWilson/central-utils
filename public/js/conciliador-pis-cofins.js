document.addEventListener('DOMContentLoaded', () => {
  inicializarSidebar('conciliador-pis-cofins');

  const form = document.getElementById('formPisCofins');
  const statusMsg = document.getElementById('statusMsg');
  const resumoBox = document.getElementById('resumoBox');
  const arquivosInput = document.getElementById('arquivos');
  const modoInput = document.getElementById('modo');
  const btnLimpar = document.getElementById('btnLimpar');
  const btnBaixar = document.getElementById('btnBaixar');
  const tblInconsistencias = document.getElementById('tblInconsistencias');

  let lastXlsx = null;

  function fmtBRL(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
  }

  function setStatus(texto, erro = false) {
    statusMsg.textContent = texto || '';
    statusMsg.style.color = erro ? '#ffb3b3' : '';
  }

  function base64ToBlob(b64, mime) {
    const byteChars = atob(b64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i += 1) byteNumbers[i] = byteChars.charCodeAt(i);
    return new Blob([new Uint8Array(byteNumbers)], { type: mime });
  }

  function downloadXlsx() {
    if (!lastXlsx?.base64) return;
    const blob = base64ToBlob(lastXlsx.base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lastXlsx.filename || 'Conciliacao_PIS_COFINS.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function limparTabela() {
    tblInconsistencias.innerHTML = '';
  }

  function fmtTipoPreview(tipo) {
    return String(tipo || '').replaceAll('_', ' ');
  }

  function renderResumo(resumo) {
    if (!Array.isArray(resumo) || resumo.length === 0) {
      resumoBox.innerHTML = '<p>Nenhum processamento ainda.</p>';
      return;
    }
    const html = resumo
      .map(
        (r) => `
          <div class="nfe-card-subtitle" style="margin-bottom:8px">
            <div><strong>${String(r.movimento || '')} - ${String(r.tributo || '')}</strong></div>
            <div>Razao: ${Number(r.registros_razao || 0)} | Relatorio: ${Number(r.registros_relatorio || 0)}</div>
            <div>Descartados Razao: ${Number(r.descartados_razao || 0)} | Inconsistencias: ${Number(r.inconsistencias || 0)}</div>
          </div>
        `
      )
      .join('');
    resumoBox.innerHTML = html;
  }

  function renderInconsistencias(rows) {
    limparTabela();
    (rows || []).slice(0, 200).forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${String(r.movimento || '')}</td>
        <td>${String(r.tributo || '')}</td>
        <td>${fmtTipoPreview(r.tipo)}</td>
        <td>${String(r.nota || '')}</td>
        <td>${fmtBRL(r.diferenca)}</td>
      `;
      tblInconsistencias.appendChild(tr);
    });
  }

  btnBaixar.addEventListener('click', downloadXlsx);

  btnLimpar.addEventListener('click', () => {
    lastXlsx = null;
    btnBaixar.disabled = true;
    btnLimpar.disabled = true;
    form.reset();
    setStatus('');
    renderResumo([]);
    limparTabela();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const files = arquivosInput.files ? Array.from(arquivosInput.files) : [];
    if (files.length < 3) {
      setStatus('Envie no minimo 3 PDFs.', true);
      return;
    }

    setStatus('Processando...');
    btnBaixar.disabled = true;
    btnLimpar.disabled = true;
    limparTabela();
    renderResumo([]);

    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('arquivos', f));
      fd.append('modo', String(modoInput.value || 'AUTO').toUpperCase());

      const resp = await AuthClient.authFetch('/api/conciliador-pis-cofins/process', {
        method: 'POST',
        body: fd,
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || `Erro HTTP ${resp.status}`);
      }

      const data = await resp.json();
      lastXlsx = { filename: data.filename, base64: data.xlsxBase64 };

      btnBaixar.disabled = !lastXlsx.base64;
      btnLimpar.disabled = false;

      renderResumo(data.resumo || []);
      renderInconsistencias(data.inconsistencias || []);
      setStatus('Concluido. XLSX pronto para download.');
    } catch (err) {
      setStatus(`Falha ao processar: ${err.message}`, true);
    }
  });
});
