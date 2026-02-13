document.addEventListener('DOMContentLoaded', () => {
  // ID precisa existir no MENU_CONFIG do sidebar.js
  inicializarSidebar('conciliador-cartao-wilson');

  const form = document.getElementById('conciliadorForm');
  const statusMsg = document.getElementById('statusMsg');

  const btnLimpar = document.getElementById('btnLimpar');
  const btnDownloadXlsx = document.getElementById('btnDownloadXlsx');

  const resumoBox = document.getElementById('resumoBox');

  const tblSoRazao = document.getElementById('tblSoRazao');
  const tblSoFin = document.getElementById('tblSoFin');

  const inputRazao = document.getElementById('razaoPdf');
  const inputFin = document.getElementById('financeiroPdf');

  const valorTol = document.getElementById('valorTol');
  const diasJanela = document.getElementById('diasJanela');
  const limiarNome = document.getElementById('limiarNome');

  let lastXlsx = null; // { filename, base64 }

  function setStatus(text, isError = false) {
    statusMsg.textContent = text || '';
    statusMsg.style.color = isError ? '#ffb3b3' : '';
  }

  function clearTables() {
    tblSoRazao.innerHTML = '';
    tblSoFin.innerHTML = '';
  }

  function renderResumo(resumo) {
    if (!resumo) {
      resumoBox.innerHTML = '<p>Nenhum processamento ainda.</p>';
      return;
    }
    resumoBox.innerHTML = `
      <div class="nfe-card-subtitle">
        <div><strong>Total Razão:</strong> R$ ${Number(resumo.total_razao).toFixed(2)}</div>
        <div><strong>Total Financeiro:</strong> R$ ${Number(resumo.total_financeiro).toFixed(2)}</div>
        <div><strong>Delta (R-F):</strong> R$ ${Number(resumo.delta_razao_menos_fin).toFixed(2)}</div>
        <hr class="nfe-divider" />
        <div><strong>Soma só Razão:</strong> R$ ${Number(resumo.soma_so_razao).toFixed(2)}</div>
        <div><strong>Soma só Financeiro:</strong> R$ ${Number(resumo.soma_so_fin).toFixed(2)}</div>
        <div><strong>Fecha (sóR - sóF):</strong> R$ ${Number(resumo.fecha_so_razao_menos_so_fin).toFixed(2)}</div>
      </div>
    `;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderRowsSoRazao(rows) {
    tblSoRazao.innerHTML = '';
    (rows || []).forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(r.data)}</td>
        <td title="${esc(r.cliente)}">${esc(r.cliente)}</td>
        <td>R$ ${Number(r.valor_round || r.valor || 0).toFixed(2)}</td>
        <td title="${esc(r.historico)}">${esc(r.historico)}</td>
      `;
      tblSoRazao.appendChild(tr);
    });
  }

  function renderRowsSoFin(rows) {
    tblSoFin.innerHTML = '';
    (rows || []).forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(r.data)}</td>
        <td>${esc(r.cpf_cnpj)}</td>
        <td title="${esc(r.cliente)}">${esc(r.cliente)}</td>
        <td title="${esc(r.titulo)}">${esc(r.titulo)}</td>
        <td>R$ ${Number(r.valor || 0).toFixed(2)}</td>
      `;
      tblSoFin.appendChild(tr);
    });
  }

  function base64ToBlob(b64, mime) {
    const byteChars = atob(b64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mime });
  }

  function downloadLastXlsx() {
    if (!lastXlsx?.base64) return;
    const blob = base64ToBlob(lastXlsx.base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lastXlsx.filename || 'conciliacao_cartao.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  btnDownloadXlsx.addEventListener('click', downloadLastXlsx);

  btnLimpar.addEventListener('click', () => {
    lastXlsx = null;
    btnDownloadXlsx.disabled = true;
    btnLimpar.disabled = true;
    setStatus('');
    renderResumo(null);
    clearTables();
    form.reset();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!inputRazao.files?.length || !inputFin.files?.length) {
      setStatus('Selecione os 2 PDFs antes de processar.', true);
      return;
    }

    setStatus('Processando... aguarde.');
    btnDownloadXlsx.disabled = true;
    btnLimpar.disabled = true;
    clearTables();
    renderResumo(null);

    try {
      const fd = new FormData();
      fd.append('razaoPdf', inputRazao.files[0]);
      fd.append('financeiroPdf', inputFin.files[0]);

      fd.append('valorTol', String(valorTol.value || '0.05'));
      fd.append('diasJanela', String(diasJanela.value || '31'));
      fd.append('limiarNome', String(limiarNome.value || '0.72'));

      const resp = await AuthClient.authFetch('/api/conciliador-cartao-wilson/process', {
        method: 'POST',
        body: fd
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || `Erro HTTP ${resp.status}`);
      }

      const data = await resp.json();

      lastXlsx = { filename: data.filename, base64: data.xlsxBase64 };
      btnDownloadXlsx.disabled = !lastXlsx.base64;
      btnLimpar.disabled = false;

      renderResumo(data.resumo);

      // prévias limitadas
      renderRowsSoRazao((data.soRazao || []).slice(0, 50));
      renderRowsSoFin((data.soFin || []).slice(0, 50));

      setStatus('Concluído! Você pode baixar o XLSX.');
    } catch (err) {
      setStatus(`Falha ao processar: ${err.message}`, true);
    }
  });
});
