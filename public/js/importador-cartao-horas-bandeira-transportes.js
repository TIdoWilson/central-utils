let ultimoResultado = null;
let ultimoPdfUrl = null;
let idsInformados = {};
let confirmadosSet = new Set();
let removidosSet = new Set();
let overridesPorRegistro = {};

const CAMPOS_EDITAVEIS_ORDEM = [
  'comissao_motorista',
  'dsr',
  'horas_extras',
  'diarias_refeicoes',
  'salario',
  'estadia_tempo_espera',
  'premio_disco_tacografo',
  'total_remuneracao_mensal',
];

const ROTULOS_CAMPOS = {
  comissao_motorista: 'Comissao',
  dsr: 'DSR',
  horas_extras: 'Horas extras',
  diarias_refeicoes: 'Diarias refeicoes',
  salario: 'Salario',
  estadia_tempo_espera: 'Estadia/Tempo espera',
  premio_disco_tacografo: 'Premio disco tacografo',
  total_remuneracao_mensal: 'Total remuneracao',
};

document.addEventListener('DOMContentLoaded', () => {
  inicializarSidebar('importador-cartao-horas-bandeira-transportes');
  inicializarPagina();
});

function inicializarPagina() {
  const form = document.getElementById('formBandeira');
  const inputArquivo = document.getElementById('arquivoBandeira');
  const btnBaixar = document.getElementById('btnBaixarBandeira');

  inputArquivo?.addEventListener('change', async () => {
    resetarEstadoTela();
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
      setStatus('Atualizando dados para gerar ZIP...', false);
      await processarBandeira();
      setStatus('Processamento concluido.', false);
    } catch (error) {
      setStatus(error.message || 'Falha ao processar o PDF.', true);
    }
  });

  btnBaixar?.addEventListener('click', () => {
    if (!ultimoResultado?.zipBase64) return;
    const blob = base64ToBlob(ultimoResultado.zipBase64, 'application/zip');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ultimoResultado.nomeArquivo || 'arquivo.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

function resetarEstadoTela() {
  ultimoResultado = null;
  idsInformados = {};
  confirmadosSet = new Set();
  removidosSet = new Set();
  overridesPorRegistro = {};
}

function invalidarGeracaoAteReprocessar() {
  ultimoResultado = null;
  const btnBaixar = document.getElementById('btnBaixarBandeira');
  if (btnBaixar) btnBaixar.disabled = true;
  setStatus('Alteracoes pendentes. Clique em "Reprocessar PDF" para atualizar o ZIP.', false);
}

async function processarBandeira() {
  const inputArquivo = document.getElementById('arquivoBandeira');
  const btnBaixar = document.getElementById('btnBaixarBandeira');
  const arquivo = inputArquivo?.files?.[0];
  if (!arquivo) throw new Error('Selecione um PDF.');

  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('ids_json', JSON.stringify(idsInformados));
  formData.append('confirmados_json', JSON.stringify(Array.from(confirmadosSet)));
  formData.append('removidos_json', JSON.stringify(Array.from(removidosSet)));
  formData.append('overrides_json', JSON.stringify(overridesPorRegistro));

  const resp = await AuthClient.authFetch('/api/cartao-horas-bandeira-transportes/processar', {
    method: 'POST',
    body: formData,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || data.detail || `Erro HTTP ${resp.status}`);
  }

  ultimoResultado = data;
  if (btnBaixar) btnBaixar.disabled = !data.zipBase64 || !data.podeGerarTxt;
  renderizarResultado(data);
  return data;
}

async function salvarFuncionario(funcionario) {
  const input = document.querySelector(`input[data-matricula-key="${cssEscape(funcionario.registroId || '')}"]`);
  const matricula = String(input?.value || '').replace(/\D/g, '');
  if (!matricula) throw new Error('Informe a matricula antes de salvar.');

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
  if (funcionario.registroId) confirmadosSet.add(funcionario.registroId);
  await processarBandeira();
  setStatus(`Registro ${data.acao || 'salvo'} na lista (${data.aba || '-'} linha ${data.linha || '-'}).`, false);
}

function renderizarResultado(data) {
  renderizarResumo(data);
  renderizarValores(data.funcionarios || []);
  renderizarFichas(data.funcionarios || [], data.listaFuncionariosArquivo || '');
  renderizarPreview(data.previewLinhas || []);
}

function renderizarResumo(data) {
  const box = document.getElementById('resumoBandeira');
  if (!box) return;
  box.innerHTML = `
    <div><strong>Paginas no PDF:</strong> ${Number(data.totalPaginas || 0)}</div>
    <div><strong>Funcionarios lidos:</strong> ${Number(data.totalFuncionarios || 0)}</div>
    <div><strong>Pendencias:</strong> ${Number(data.totalPendencias || 0)}</div>
    <div><strong>Duplicados ignorados:</strong> ${Number(data.totalDuplicadosIgnorados || 0)}</div>
    <div><strong>Arquivos TXT prontos:</strong> ${Number(data.totalArquivosTxt || 0)}</div>
    <div><strong>Linhas no preview:</strong> ${Number(data.totalRegistrosTxt || 0)}</div>
    <div><strong>Arquivo final:</strong> ${escapeHtml(data.nomeArquivo || '-')}</div>
    <div><strong>Status:</strong> ${data.podeGerarTxt ? 'Pronto para baixar' : escapeHtml(data.mensagemBloqueio || 'Com pendencias')}</div>
  `;
}

function renderizarValores(funcionarios) {
  const box = document.getElementById('valoresBandeira');
  if (!box) return;

  if (!Array.isArray(funcionarios) || !funcionarios.length) {
    box.innerHTML = '<p class="nfe-card-subtitle">Nenhum valor identificado.</p>';
    return;
  }

  const totalPorCampo = {};
  CAMPOS_EDITAVEIS_ORDEM.forEach((campo) => { totalPorCampo[campo] = 0; });

  funcionarios.forEach((f) => {
    const valores = f?.valoresEditaveis || {};
    CAMPOS_EDITAVEIS_ORDEM.forEach((campo) => {
      totalPorCampo[campo] += parseValorBrToFloat(valores[campo] || '0,00');
    });
  });

  const cards = CAMPOS_EDITAVEIS_ORDEM.map((campo) => `
      <div style="border: 1px solid #dbe4ee; border-radius: 12px; padding: 12px; background: #f8fafc;">
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">${escapeHtml(ROTULOS_CAMPOS[campo] || campo)}</div>
        <div style="font-size: 22px; font-weight: 700; color: #111827;">${escapeHtml(formatarNumeroBr(totalPorCampo[campo]))}</div>
      </div>
    `).join('');

  box.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px;">${cards}</div>`;
}

function renderizarFichas(funcionarios, caminhoLista) {
  const box = document.getElementById('fichasBandeira');
  const listaInfo = document.getElementById('listaArquivoBandeira');
  if (!box || !listaInfo) return;

  listaInfo.innerHTML = `<strong>Lista usada:</strong> ${escapeHtml(caminhoLista || '-')}`;

  if (!Array.isArray(funcionarios) || !funcionarios.length) {
    box.innerHTML = '<p class="nfe-card-subtitle">Nenhum funcionario identificado.</p>';
    return;
  }

  const rows = funcionarios.map((f, i) => {
    const registroId = String(f.registroId || `${i}:${f.chave || ''}`);
    const chave = String(f.chave || '');
    const matriculaAtual = String(idsInformados[chave] || f.matricula || '').replace(/\D/g, '');
    if (chave && matriculaAtual) idsInformados[chave] = matriculaAtual;

    const statusCor = obterCorStatus(f.statusRegistro);
    const statusTexto = obterTextoStatus(f.statusRegistro);
    const valoresBloco = CAMPOS_EDITAVEIS_ORDEM.map((campo) => {
      const valorAtual = obterValorCampoRegistro(registroId, f, campo);
      return `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          <span style="display:inline-block; width:110px; font-size:11px; color:#374151;">${escapeHtml(ROTULOS_CAMPOS[campo] || campo)}</span>
          <input
            type="text"
            inputmode="decimal"
            value="${escapeHtml(valorAtual)}"
            data-valor-registro="${escapeHtml(registroId)}"
            data-valor-campo="${escapeHtml(campo)}"
            style="width:78px;"
          />
        </div>
      `;
    }).join('');

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${Number(f.pagina || 0)}</td>
        <td>${escapeHtml(f.nome || '')}</td>
        <td>${escapeHtml(f.cpf || '')}</td>
        <td>
          <input
            type="text"
            inputmode="numeric"
            data-matricula-key="${escapeHtml(registroId)}"
            value="${escapeHtml(matriculaAtual)}"
            style="width: 88px;"
          />
        </td>
        <td>${escapeHtml(f.origemMatricula || '-')}</td>
        <td>${escapeHtml(f.somaRemuneracao || '0,00')}</td>
        <td>${escapeHtml(f.totalRemuneracao || '0,00')}</td>
        <td>${valoresBloco}</td>
        <td><span style="font-weight:600;color:${statusCor};">${escapeHtml(statusTexto)}</span></td>
        <td style="white-space:nowrap;">
          <button type="button" class="btn btn-secondary" data-acao="salvar" data-idx="${i}">Salvar matricula</button>
          <button type="button" class="btn btn-secondary" data-acao="confirmar" data-idx="${i}" style="margin-left:6px;">Confirmar corrigido</button>
          <button type="button" class="btn btn-secondary" data-acao="remover" data-idx="${i}" style="margin-left:6px;">${removidosSet.has(registroId) || removidosSet.has(chave) ? 'Reativar' : 'Remover da geracao'}</button>
        </td>
      </tr>
    `;
  }).join('');

  box.innerHTML = `
    <table class="nfe-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Pagina</th>
          <th>Nome</th>
          <th>CPF</th>
          <th>Matricula</th>
          <th>Origem</th>
          <th>Soma remuneracao</th>
          <th>Total remuneracao</th>
          <th>Valores editaveis</th>
          <th>Status</th>
          <th>Acoes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  box.querySelectorAll('input[data-matricula-key]').forEach((input) => {
    input.addEventListener('input', () => {
      const registroId = input.getAttribute('data-matricula-key') || '';
      const funcionario = funcionarios.find((item) => String(item.registroId || '') === registroId);
      if (!funcionario?.chave) return;
      idsInformados[funcionario.chave] = String(input.value || '').replace(/\D/g, '');
      invalidarGeracaoAteReprocessar();
    });
  });

  box.querySelectorAll('input[data-valor-registro]').forEach((input) => {
    input.addEventListener('input', () => {
      const registroId = input.getAttribute('data-valor-registro') || '';
      const campo = input.getAttribute('data-valor-campo') || '';
      if (!registroId || !campo) return;
      if (!overridesPorRegistro[registroId]) overridesPorRegistro[registroId] = {};
      overridesPorRegistro[registroId][campo] = normalizarValorBrInput(input.value || '0,00');
      invalidarGeracaoAteReprocessar();
    });
  });

  box.querySelectorAll('button[data-acao]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-idx') || -1);
      const acao = btn.getAttribute('data-acao') || '';
      const funcionario = funcionarios[idx];
      if (!funcionario) return;

      try {
        btn.disabled = true;
        if (acao === 'salvar') {
          btn.textContent = 'Salvando...';
          await salvarFuncionario(funcionario);
        } else if (acao === 'confirmar') {
          marcarConfirmado(funcionario);
          btn.textContent = 'Atualizando...';
          await processarBandeira();
          setStatus('Correcoes confirmadas e reprocessadas.', false);
        } else if (acao === 'remover') {
          alternarRemocao(funcionario);
          btn.textContent = 'Atualizando...';
          await processarBandeira();
          setStatus('Lista de geracao atualizada.', false);
        }
      } catch (error) {
        setStatus(error.message || 'Falha ao atualizar registro.', true);
      } finally {
        btn.disabled = false;
        btn.textContent =
          acao === 'salvar' ? 'Salvar matricula'
            : acao === 'confirmar' ? 'Confirmar corrigido'
              : (removidosSet.has(funcionario.registroId) || removidosSet.has(funcionario.chave))
                ? 'Reativar'
                : 'Remover da geracao';
      }
    });
  });
}

function marcarConfirmado(funcionario) {
  const registroId = String(funcionario.registroId || '');
  const chave = String(funcionario.chave || '');
  if (registroId) confirmadosSet.add(registroId);
  if (chave) confirmadosSet.add(chave);
  if (registroId) removidosSet.delete(registroId);
  if (chave) removidosSet.delete(chave);
}

function alternarRemocao(funcionario) {
  const registroId = String(funcionario.registroId || '');
  const chave = String(funcionario.chave || '');
  const removido = removidosSet.has(registroId) || removidosSet.has(chave);

  if (removido) {
    if (registroId) removidosSet.delete(registroId);
    if (chave) removidosSet.delete(chave);
  } else {
    if (registroId) removidosSet.add(registroId);
    if (chave) removidosSet.add(chave);
    if (registroId) confirmadosSet.delete(registroId);
    if (chave) confirmadosSet.delete(chave);
  }
}

function obterValorCampoRegistro(registroId, funcionario, campo) {
  const valorOverride = overridesPorRegistro?.[registroId]?.[campo];
  if (valorOverride != null) return valorOverride;
  return String(funcionario?.valoresEditaveis?.[campo] || '0,00');
}

function obterTextoStatus(statusRegistro) {
  if (statusRegistro === 'ok') return 'OK';
  if (statusRegistro === 'pendente') return 'Pendente';
  if (statusRegistro === 'removido') return 'Removido';
  if (statusRegistro === 'confirmado_usuario') return 'Confirmado';
  if (statusRegistro === 'duplicado_ignorado') return 'Duplicado';
  return statusRegistro || '-';
}

function obterCorStatus(statusRegistro) {
  if (statusRegistro === 'ok' || statusRegistro === 'confirmado_usuario') return '#166534';
  if (statusRegistro === 'pendente') return '#b45309';
  if (statusRegistro === 'removido' || statusRegistro === 'duplicado_ignorado') return '#6b7280';
  return '#111827';
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

function normalizarValorBrInput(valor) {
  const texto = String(valor || '').trim().replace(/\s+/g, '');
  if (!texto) return '0,00';
  const limpo = texto.replace(/[^\d,.-]/g, '');
  const numero = parseValorBrToFloat(limpo);
  return formatarNumeroBr(numero);
}

function parseValorBrToFloat(valor) {
  const texto = String(valor || '').trim().replace(/\./g, '').replace(',', '.');
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

function formatarNumeroBr(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return '0,00';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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


