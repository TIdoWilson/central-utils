document.addEventListener('DOMContentLoaded', () => {
  inicializarSidebar('conciliador-cartao-tipo50');

  const form = document.getElementById('formTipo50');
  const statusMsg = document.getElementById('statusMsg');
  const resumoBox = document.getElementById('resumoBox');

  const arquivoA = document.getElementById('arquivoA');
  const arquivoB = document.getElementById('arquivoB');

  const btnLimpar = document.getElementById('btnLimpar');
  const btnBaixar = document.getElementById('btnBaixar');

  const tblDivergencias = document.getElementById('tblDivergencias');
  const tblCfop = document.getElementById('tblCfop');

  let lastXlsx = null;

  function fmtBRL(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
  }

  function setStatus(texto, erro = false) {
    statusMsg.textContent = texto || '';
    statusMsg.style.color = erro ? '#ffb3b3' : '';
  }

  function limparTabelas() {
    tblDivergencias.innerHTML = '';
    tblCfop.innerHTML = '';
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
    a.download = lastXlsx.filename || 'Conciliacao.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderResumo(resumo) {
    if (!resumo) {
      resumoBox.innerHTML = '<p>Nenhum processamento ainda.</p>';
      return;
    }

    resumoBox.innerHTML = `
      <div class="nfe-card-subtitle">
        <div><strong>Arquivo Livro:</strong> ${String(resumo.arquivo_livro || '')}</div>
        <div><strong>Arquivo Tipo 50:</strong> ${String(resumo.arquivo_tipo50 || '')}</div>
        <hr class="nfe-divider" />
        <div><strong>Total Parse Livro:</strong> ${fmtBRL(resumo.total_parse_livro)}</div>
        <div><strong>Total Parse Relatório:</strong> ${fmtBRL(resumo.total_parse_relatorio)}</div>
        <div><strong>Diferença Parse:</strong> ${fmtBRL(resumo.diferenca_parse)}</div>
        <hr class="nfe-divider" />
        <div><strong>Linhas Divergências:</strong> ${Number(resumo.linhas_divergencias || 0)}</div>
        <div><strong>Linhas CFOP Diferente:</strong> ${Number(resumo.linhas_cfop_diferente || 0)}</div>
      </div>
    `;
  }

  function renderDivergencias(rows) {
    tblDivergencias.innerHTML = '';
    (rows || []).slice(0, 80).forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${String(r.tipo || '')}</td>
        <td>${String(r.nota || '')}</td>
        <td>${fmtBRL(r.diferenca)}</td>
      `;
      tblDivergencias.appendChild(tr);
    });
  }

  function renderCfop(rows) {
    tblCfop.innerHTML = '';
    (rows || []).slice(0, 120).forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${String(r.nota || '')}</td>
        <td>${String(r.cfop || '')}</td>
        <td>${fmtBRL(r.valor_livro)}</td>
        <td>${fmtBRL(r.valor_relatorio)}</td>
      `;
      tblCfop.appendChild(tr);
    });
  }

  btnBaixar.addEventListener('click', downloadXlsx);

  btnLimpar.addEventListener('click', () => {
    lastXlsx = null;
    btnBaixar.disabled = true;
    btnLimpar.disabled = true;
    form.reset();
    setStatus('');
    renderResumo(null);
    limparTabelas();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!arquivoA.files?.length || !arquivoB.files?.length) {
      setStatus('Selecione os 2 PDFs.', true);
      return;
    }

    setStatus('Processando...');
    btnBaixar.disabled = true;
    btnLimpar.disabled = true;
    limparTabelas();
    renderResumo(null);

    try {
      const fd = new FormData();
      fd.append('arquivoA', arquivoA.files[0]);
      fd.append('arquivoB', arquivoB.files[0]);

      const resp = await AuthClient.authFetch('/api/conciliador-cartao-tipo50/process', {
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

      renderResumo(data.resumo || null);
      renderDivergencias(data.divergencias || []);
      renderCfop(data.cfopDiferente || []);

      setStatus('Concluído. XLSX pronto para download.');
    } catch (err) {
      setStatus(`Falha ao processar: ${err.message}`, true);
    }
  });
});
