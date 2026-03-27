let ultimoResultado = null;
let ultimoPdfUrl = null;
let idsInformados = {};

document.addEventListener('DOMContentLoaded', () => {
  inicializarSidebar('importador-cartao-horas-bandeira-transportes');
  inicializarPagina();
});

function inicializarPagina() {
  const form = document.getElementById('formBandeira');
  const inputArquivo = document.getElementById('arquivoBandeira');
  const btnBaixar = document.getElementById('btnBaixarBandeira');

  inputArquivo?.addEventListener('change', async () => {
    ultimoResultado = null;
    idsInformados = {};
    if (btnBaixar) btnBaixar.disabled = true;
    atualizarPreviewPdf();
    atualizarInfoArquivo();
    limparSaida('Processando arquivo...');

    try {
      await processarBandeira();
      setStatus('Previa atualizada.', false);
    } catch (error) {
      setStatus(error.message || 'Falha ao processar o PDF.', true);
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      setStatus('Gerando TXT...', false);
      await processarBandeira();
      setStatus('TXT gerado com sucesso.', false);
    } catch (error) {
      setStatus(error.message || 'Falha ao gerar TXT.', true);
    }
  });

  btnBaixar?.addEventListener('click', () => {
    if (!ultimoResultado?.txtBase64) return;
    const blob = base64ToBlob(ultimoResultado.txtBase64, 'text/plain;charset=utf-8');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ultimoResultado.nomeArquivo || 'arquivo.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

async function processarBandeira() {
  const inputArquivo = document.getElementById('arquivoBandeira');
  const btnBaixar = document.getElementById('btnBaixarBandeira');
  const arquivo = inputArquivo?.files?.[0];
  if (!arquivo) throw new Error('Selecione um PDF.');

  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('ids_json', JSON.stringify(idsInformados));

  const resp = await AuthClient.authFetch('/api/cartao-horas-bandeira-transportes/processar', {
    method: 'POST',
    body: formData,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || data.detail || `Erro HTTP ${resp.status}`);
  }

  ultimoResultado = data;
  if (btnBaixar) btnBaixar.disabled = !data.txtBase64;
  renderizarResultado(data);
  return data;
}

async function salvarFuncionario(funcionario) {
  const input = document.querySelector(`input[data-chave="${cssEscape(funcionario.chave)}"]`);
  const matricula = String(input?.value || '').replace(/\D/g, '');
  if (!matricula) {
    throw new Error('Informe a matricula antes de salvar.');
  }

  const resp = await AuthClient.authFetch('/api/cartao-horas-bandeira-transportes/salvar-funcionario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: funcionario.nome || '',
      cpf: funcionario.cpf || '',
      matricula,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || data.detail || `Erro HTTP ${resp.status}`);
  }

  idsInformados[funcionario.chave] = matricula;
  await processarBandeira();
  setStatus(`Registro ${data.acao || 'salvo'} na lista (${data.aba || '-'} linha ${data.linha || '-' }).`, false);
}

function renderizarResultado(data) {
  renderizarResumo(data);
  renderizarValores(data.itens || []);
  renderizarFichas(data.funcionarios || [], data.listaFuncionariosArquivo || '');
  renderizarPreview(data.previewLinhas || []);
}

function renderizarResumo(data) {
  const box = document.getElementById('resumoBandeira');
  if (!box) return;
  const funcionario = Array.isArray(data.funcionarios) && data.funcionarios.length ? data.funcionarios[0] : null;
  box.innerHTML = `
    <div><strong>Empresa:</strong> ${escapeHtml(data.empresa || '-')}</div>
    <div><strong>Periodo:</strong> ${escapeHtml(data.periodoInicial || '-')} a ${escapeHtml(data.periodoFinal || '-')}</div>
    <div><strong>Funcionario:</strong> ${escapeHtml(funcionario?.nome || '-')}</div>
    <div><strong>CPF:</strong> ${escapeHtml(funcionario?.cpf || '-')}</div>
    <div><strong>Matricula usada:</strong> ${escapeHtml(funcionario?.matricula || '00000')}</div>
    <div><strong>Origem:</strong> ${escapeHtml(funcionario?.origemMatricula || '-')}</div>
    <div><strong>Total de itens:</strong> ${Number(data.totalItens || 0)}</div>
    <div><strong>Soma dos itens:</strong> ${escapeHtml(data.somaItens || '0,00')}</div>
    <div><strong>Linhas no TXT:</strong> ${Number(data.totalRegistrosTxt || 0)}</div>
    <div><strong>Arquivo final:</strong> ${escapeHtml(data.nomeArquivo || '-')}</div>
    ${funcionario?.mensagem ? `<div style="margin-top:8px;color:#9a3412;"><strong>Observacao:</strong> ${escapeHtml(funcionario.mensagem)}</div>` : ''}
  `;
}

function renderizarValores(itens) {
  const box = document.getElementById('valoresBandeira');
  if (!box) return;

  if (!Array.isArray(itens) || !itens.length) {
    box.innerHTML = '<p class="nfe-card-subtitle">Nenhum valor identificado.</p>';
    return;
  }

  const cards = itens.map((item) => `
      <div style="border: 1px solid #dbe4ee; border-radius: 12px; padding: 12px; background: #f8fafc;">
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">${escapeHtml(item.rotulo || item.campo || '-')}</div>
        <div style="font-size: 22px; font-weight: 700; color: #111827;">${escapeHtml(item.valor || '0,00')}</div>
        <div style="font-size: 12px; color: #4b5563; margin-top: 6px;">Evento: ${escapeHtml(String(item.evento || 0))}</div>
      </div>
    `).join('');

  box.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px;">${cards}</div>`;
}

function renderizarFichas(funcionarios, caminhoLista) {
  const box = document.getElementById('fichasBandeira');
  const listaInfo = document.getElementById('listaArquivoBandeira');
  if (!box || !listaInfo) return;

  if (caminhoLista) {
    listaInfo.innerHTML = `<strong>Lista usada:</strong> ${escapeHtml(caminhoLista)}`;
  } else {
    listaInfo.innerHTML = '<strong>Lista usada:</strong> -';
  }

  if (!Array.isArray(funcionarios) || !funcionarios.length) {
    box.innerHTML = '<p class="nfe-card-subtitle">Nenhum funcionario identificado.</p>';
    return;
  }

  const rows = funcionarios.map((f, i) => {
    const matriculaAtual = idsInformados[f.chave] || f.matricula || '';
    if (matriculaAtual) idsInformados[f.chave] = String(matriculaAtual).replace(/\D/g, '');
    const candidatos = Array.isArray(f.matriculaCandidatas) && f.matriculaCandidatas.length
      ? `<div style="font-size:12px;color:#6b7280;">Candidatas: ${escapeHtml(f.matriculaCandidatas.join(', '))}</div>`
      : '';

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(f.nome || '')}</td>
        <td>${escapeHtml(f.cpf || '')}</td>
        <td>
          <input type="text" inputmode="numeric" data-chave="${escapeHtml(f.chave)}" value="${escapeHtml(matriculaAtual)}" style="width: 110px;" />
          ${candidatos}
        </td>
        <td>${escapeHtml(f.origemMatricula || '-')}</td>
        <td>
          <button type="button" class="btn btn-secondary" data-acao="salvar" data-idx="${i}">Salvar</button>
        </td>
      </tr>
    `;
  }).join('');

  box.innerHTML = `
    <table class="nfe-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Nome</th>
          <th>CPF</th>
          <th>Matricula</th>
          <th>Origem</th>
          <th>Acao</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  box.querySelectorAll('input[data-chave]').forEach((input) => {
    input.addEventListener('input', () => {
      const chave = input.getAttribute('data-chave') || '';
      idsInformados[chave] = String(input.value || '').replace(/\D/g, '');
      ultimoResultado = null;
      const btnBaixar = document.getElementById('btnBaixarBandeira');
      if (btnBaixar) btnBaixar.disabled = true;
    });
  });

  box.querySelectorAll('button[data-acao="salvar"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-idx') || -1);
      const funcionario = funcionarios[idx];
      if (!funcionario) return;

      try {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
        await salvarFuncionario(funcionario);
      } catch (error) {
        setStatus(error.message || 'Falha ao salvar funcionario.', true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar';
      }
    });
  });
}

function renderizarPreview(linhas) {
  const tbody = document.getElementById('previewTxtBandeira');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!linhas.length) {
    tbody.innerHTML = '<tr><td colspan="2">Nenhuma linha gerada.</td></tr>';
    return;
  }

  linhas.forEach((linha, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${index + 1}</td><td><code>${escapeHtml(linha)}</code></td>`;
    tbody.appendChild(tr);
  });
}

function atualizarPreviewPdf() {
  const iframe = document.getElementById('previewPdfBandeira');
  const arquivo = document.getElementById('arquivoBandeira')?.files?.[0];
  if (!iframe) return;

  if (ultimoPdfUrl) {
    URL.revokeObjectURL(ultimoPdfUrl);
    ultimoPdfUrl = null;
  }

  if (!arquivo) {
    iframe.src = 'about:blank';
    return;
  }

  ultimoPdfUrl = URL.createObjectURL(arquivo);
  iframe.src = ultimoPdfUrl;
}

function atualizarInfoArquivo() {
  const box = document.getElementById('infoArquivoBandeira');
  const arquivo = document.getElementById('arquivoBandeira')?.files?.[0];
  if (!box) return;

  if (!arquivo) {
    box.innerHTML = '<p>Nenhum PDF selecionado.</p>';
    return;
  }

  box.innerHTML = `
    <div><strong>Arquivo:</strong> ${escapeHtml(arquivo.name)}</div>
    <div><strong>Tamanho:</strong> ${escapeHtml(formatarTamanhoArquivo(arquivo.size))}</div>
    <div><strong>Ultima alteracao:</strong> ${escapeHtml(new Date(arquivo.lastModified).toLocaleString('pt-BR'))}</div>
  `;
}

function limparSaida(mensagem) {
  const resumo = document.getElementById('resumoBandeira');
  const valores = document.getElementById('valoresBandeira');
  const fichas = document.getElementById('fichasBandeira');
  const preview = document.getElementById('previewTxtBandeira');
  if (resumo) resumo.innerHTML = `<p>${escapeHtml(mensagem || 'Sem dados.')}</p>`;
  if (valores) valores.innerHTML = '<p class="nfe-card-subtitle">Nenhum valor identificado.</p>';
  if (fichas) fichas.innerHTML = '<p class="nfe-card-subtitle">Nenhum funcionario identificado.</p>';
  if (preview) preview.innerHTML = '<tr><td colspan="2">Nenhuma linha gerada.</td></tr>';
}

function setStatus(texto, erro = false) {
  const el = document.getElementById('statusBandeira');
  if (!el) return;
  el.textContent = texto || '';
  el.style.color = erro ? '#b91c1c' : '#111827';
}

function formatarTamanhoArquivo(bytes) {
  if (!Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i += 1) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value || ''));
  return String(value || '').replace(/"/g, '\\"');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
