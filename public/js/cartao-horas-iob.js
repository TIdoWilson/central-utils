const EVENTOS_IOB_CONFIG = [
  {
    grupo: 'Horas do periodo',
    itens: [
      { key: 'geral_horas_normais', label: 'Horas normais do periodo', code: 0 },
    ],
  },
  {
    grupo: 'Horas extras',
    itens: [
      { key: 'geral_extra_50', label: 'Hora extra 50%', code: 0 },
      { key: 'geral_extra_100', label: 'Hora extra 100%', code: 0 },
      { key: 'geral_extra_diurna', label: 'Hora extra diurna', code: 0 },
      { key: 'geral_extra_noturna', label: 'Hora extra noturna', code: 0 },
    ],
  },
  {
    grupo: 'Noturnas e adicionais',
    itens: [
      { key: 'geral_adicional_noturno', label: 'Adicional noturno', code: 0 },
      { key: 'geral_hora_noturna_reduzida', label: 'Hora noturna reduzida', code: 0 },
    ],
  },
  {
    grupo: 'Faltas e ausencias',
    itens: [
      { key: 'geral_falta_atraso', label: 'Falta e atraso/ausencia', code: 0 },
    ],
  },
];

let ultimoTxt = null;
let ultimoPreview = null;
let previewTimer = null;
let previewRequestId = 0;
let ultimoPdfUrl = null;
let debugHabilitado = false;
let idsPendentesAtuais = [];
let ultimoBloqueioIds = '';

document.addEventListener('DOMContentLoaded', () => {
  inicializarSidebar('cartao-horas-iob');
  renderizarConfiguracaoEventos();
  sincronizarMarcacaoEventos();
  inicializarPaginaCartaoHorasIob();
});

function inicializarPaginaCartaoHorasIob() {
  const form = document.getElementById('formCartaoHorasIob');
  const inputArquivo = document.getElementById('arquivoCartao');
  const btnBaixar = document.getElementById('btnBaixarTxtIob');
  const btnGerar = document.getElementById('btnGerarTxtIob');
  const containerEventos = document.getElementById('configEventosIob');
  habilitarPainelDebugSeAdmin();

  inputArquivo?.addEventListener('change', () => {
    ultimoTxt = null;
    if (btnBaixar) btnBaixar.disabled = true;
    atualizarPreviewPdf();
    atualizarInfoArquivo();
    debugLog('Arquivo selecionado', {
      nome: inputArquivo?.files?.[0]?.name || '',
      tamanho: inputArquivo?.files?.[0]?.size || 0,
    });
    agendarPreviaAutomatica();
  });

  containerEventos?.addEventListener('input', () => {
    ultimoTxt = null;
    if (btnBaixar) btnBaixar.disabled = true;
    sincronizarMarcacaoEventos();
    agendarPreviaAutomatica();
  });

  containerEventos?.addEventListener('change', () => {
    ultimoTxt = null;
    if (btnBaixar) btnBaixar.disabled = true;
    sincronizarMarcacaoEventos();
    agendarPreviaAutomatica();
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const arquivo = inputArquivo?.files?.[0];
    if (!arquivo) {
      setStatusCartaoHorasIob('Selecione um PDF do cartao.', true);
      return;
    }

    sincronizarMarcacaoEventos();
    const eventos = coletarEventosSelecionados();
    const possuiAlgumEvento = Object.values(eventos).some((codigo) => Number(codigo || 0) > 0);
    if (!possuiAlgumEvento) {
      debugLog('Geracao bloqueada: nenhum evento valido informado');
      setStatusCartaoHorasIob('Informe pelo menos um codigo de evento maior que 0 para gerar o TXT.', true);
      return;
    }

    const idsPendentes = obterIdsPendentesNaoPreenchidos();
    if (idsPendentes.length > 0) {
      debugLog('Geracao bloqueada: funcionario sem ID', { idsPendentes });
      exibirAlertaIdsPendentes(idsPendentes);
      setStatusCartaoHorasIob('Falta informar o ID de um ou mais funcionarios para liberar o TXT.', true);
      return;
    }

    const assinaturaAtual = obterAssinaturaAtual(arquivo);
    if (ultimoPreview?.assinatura === assinaturaAtual && ultimoPreview?.data?.txtBase64) {
      debugLog('Reutilizando previa atual para gerar TXT final');
      aplicarResultadoFinal(ultimoPreview.data);
      setStatusCartaoHorasIob('TXT IOB preparado a partir da previa atual.', false);
      return;
    }

    await processarCartaoHorasIob({ modo: 'final' });
  });

  btnBaixar?.addEventListener('click', () => {
    if (!ultimoTxt?.base64) return;
    const blob = base64ToBlob(ultimoTxt.base64, 'text/plain;charset=utf-8');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ultimoTxt.nomeArquivo || 'cartao-horas-iob.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  if (btnGerar) btnGerar.disabled = false;
  if (btnBaixar) btnBaixar.disabled = true;
}

function renderizarConfiguracaoEventos() {
  const container = document.getElementById('configEventosIob');
  if (!container) return;

  const blocos = EVENTOS_IOB_CONFIG.map((grupo) => {
    const linhas = grupo.itens.map((item) => `
      <tr>
        <td><input type="checkbox" class="evento-iob-ativo" data-key="${item.key}" ${item.code > 0 ? 'checked' : ''}></td>
        <td>${item.label}</td>
        <td><input type="number" min="0" max="99999" value="${item.code}" class="evento-iob-codigo" data-key="${item.key}" style="width: 110px;"></td>
      </tr>
    `).join('');

    return `
      <div style="margin-top: 12px;">
        <h3 style="margin: 0 0 8px 0; font-size: 15px;">${grupo.grupo}</h3>
        <table class="nfe-table">
          <thead>
            <tr>
              <th>Usar</th>
              <th>Tipo</th>
              <th>Codigo</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    `;
  }).join('');

  container.innerHTML = blocos;
}

function coletarEventosSelecionados() {
  const ativos = Array.from(document.querySelectorAll('.evento-iob-ativo'));
  const eventos = {};

  ativos.forEach((checkbox) => {
    const key = checkbox.dataset.key;
    const inputCodigo = document.querySelector(`.evento-iob-codigo[data-key="${key}"]`);
    const codigo = Number(inputCodigo?.value || 0);
    eventos[key] = checkbox.checked ? codigo : 0;
  });

  return eventos;
}

function sincronizarMarcacaoEventos() {
  const ativos = Array.from(document.querySelectorAll('.evento-iob-ativo'));
  ativos.forEach((checkbox) => {
    const key = checkbox.dataset.key;
    const inputCodigo = document.querySelector(`.evento-iob-codigo[data-key="${key}"]`);
    const codigo = Number(inputCodigo?.value || 0);
    if (codigo > 0) {
      checkbox.checked = true;
    }
  });
}

function agendarPreviaAutomatica() {
  const arquivo = document.getElementById('arquivoCartao')?.files?.[0];
  if (!arquivo) {
    limparSaida('Selecione um PDF para iniciar a previa.');
    return;
  }

  setStatusCartaoHorasIob('Atualizando previa automatica...', false);
  debugLog('Previa automatica agendada');
  if (previewTimer) window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    processarCartaoHorasIob({ modo: 'previa' }).catch((error) => {
      console.error(error);
      debugLog('Erro na previa automatica', { erro: error.message || String(error) });
      setStatusCartaoHorasIob(error.message || 'Falha ao atualizar a previa.', true);
    });
  }, 700);
}

async function processarCartaoHorasIob({ modo }) {
  const inputArquivo = document.getElementById('arquivoCartao');
  const btnGerar = document.getElementById('btnGerarTxtIob');
  const btnBaixar = document.getElementById('btnBaixarTxtIob');
  const arquivo = inputArquivo?.files?.[0];
  if (!arquivo) {
    setStatusCartaoHorasIob('Selecione um PDF do cartao.', true);
    return null;
  }

  const eventos = coletarEventosSelecionados();
  const idsPreenchidos = coletarIdsPreenchidos();
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('eventos_json', JSON.stringify(eventos));
  formData.append('ids_json', JSON.stringify(idsPreenchidos));

  const requestId = ++previewRequestId;
  if (modo === 'final') {
    if (btnGerar) {
      btnGerar.disabled = true;
      btnGerar.textContent = 'Processando...';
    }
    if (btnBaixar) btnBaixar.disabled = true;
    setStatusCartaoHorasIob('Gerando TXT IOB...', false);
  }
  debugLog('Enviando requisicao para processamento', {
    modo,
    arquivo: arquivo.name,
    eventos,
    idsPreenchidos,
  });

  try {
    const resp = await AuthClient.authFetch('/api/cartao-horas-iob/processar', {
      method: 'POST',
      body: formData,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      debugLog('Falha na resposta da API', { status: resp.status, data });
      throw new Error(data.error || data.detail || `Erro HTTP ${resp.status}`);
    }

    if (requestId !== previewRequestId && modo === 'previa') {
      debugLog('Resposta descartada por request mais recente', { requestId, previewRequestId });
      return null;
    }

    const assinatura = obterAssinaturaAtual(arquivo);
    ultimoPreview = { assinatura, data };
    debugLog('Resposta recebida com sucesso', {
      modo,
      linhasTxt: data.totalRegistrosTxt || 0,
      tiposMarcados: Array.isArray(data.totaisEvento) ? data.totaisEvento.filter((item) => item?.selecionado).length : 0,
      funcionariosSemId: Array.isArray(data.funcionariosSemId) ? data.funcionariosSemId.length : 0,
    });
    renderizarResumo(data);
    renderizarTotaisEvento(data.totaisEvento || []);
    renderizarIdsPendentes(data.funcionariosSemId || []);
    renderizarPreview(data.previewLinhas || []);

    if (modo === 'final') {
      aplicarResultadoFinal(data);
      setStatusCartaoHorasIob('TXT IOB gerado com sucesso.', false);
    } else {
      setStatusCartaoHorasIob('Previa automatica atualizada.', false);
    }

    return data;
  } catch (error) {
    debugLog('Erro no processamento', { modo, erro: error.message || String(error) });
    throw error;
  } finally {
    if (modo === 'final' && btnGerar) {
      btnGerar.disabled = false;
      btnGerar.textContent = 'Gerar TXT IOB';
    }
  }
}

function aplicarResultadoFinal(data) {
  const btnBaixar = document.getElementById('btnBaixarTxtIob');
  ultimoTxt = {
    nomeArquivo: data.nomeArquivo,
    base64: data.txtBase64,
  };
  if (btnBaixar) btnBaixar.disabled = Number(data.totalRegistrosTxt || 0) <= 0 || obterIdsPendentesNaoPreenchidos().length > 0;
  renderizarResumo(data);
  renderizarTotaisEvento(data.totaisEvento || []);
  renderizarIdsPendentes(data.funcionariosSemId || []);
  renderizarPreview(data.previewLinhas || []);
}

function atualizarPreviewPdf() {
  const iframe = document.getElementById('previewPdfCartao');
  const arquivo = document.getElementById('arquivoCartao')?.files?.[0];
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
  const box = document.getElementById('infoArquivoCartao');
  const arquivo = document.getElementById('arquivoCartao')?.files?.[0];
  if (!box) return;

  if (!arquivo) {
    box.innerHTML = '<p>Nenhum PDF selecionado.</p>';
    return;
  }

  box.innerHTML = `
    <div><strong>Arquivo:</strong> ${escapeHtml(arquivo.name)}</div>
    <div><strong>Tamanho:</strong> ${formatarTamanhoArquivo(arquivo.size)}</div>
    <div><strong>Ultima alteracao:</strong> ${escapeHtml(formatarDataArquivo(arquivo.lastModified))}</div>
  `;
}

function renderizarResumo(data) {
  const box = document.getElementById('resumoCartaoHorasIob');
  if (!box) return;
  const totais = Array.isArray(data.totaisEvento) ? data.totaisEvento : [];
  const tiposSelecionados = totais.filter((item) => item?.selecionado).length;
  const tiposEntrando = totais.filter((item) => item?.entra_no_txt).length;
  box.innerHTML = `
    <div><strong>Empresa:</strong> ${escapeHtml(data.empresa || '-')}</div>
    <div><strong>Periodo:</strong> ${escapeHtml(data.periodoInicial || '-')} a ${escapeHtml(data.periodoFinal || '-')}</div>
    <div><strong>Layout identificado:</strong> ${escapeHtml(data.layoutOrigem || '-')}</div>
    <hr class="nfe-divider" />
    <div><strong>Funcionarios:</strong> ${Number(data.totalFuncionarios || 0)}</div>
    <div><strong>Lancamentos lidos:</strong> ${Number(data.totalLancamentos || 0)}</div>
    <div><strong>Tipos marcados:</strong> ${tiposSelecionados}</div>
    <div><strong>Tipos que entram no TXT:</strong> ${tiposEntrando}</div>
    <div><strong>Linhas no TXT:</strong> ${Number(data.totalRegistrosTxt || 0)}</div>
    <div><strong>Arquivo final:</strong> ${escapeHtml(data.nomeArquivo || '-')}</div>
  `;
}

function renderizarPreview(linhas) {
  const tbody = document.getElementById('previewCartaoHorasIob');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!linhas.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="2">Nenhuma linha gerada com a configuracao atual.</td>';
    tbody.appendChild(tr);
    return;
  }

  linhas.forEach((linha, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${index + 1}</td><td><code>${escapeHtml(linha)}</code></td>`;
    tbody.appendChild(tr);
  });
}

function renderizarTotaisEvento(totais) {
  const box = document.getElementById('totaisCartaoHorasIob');
  if (!box) return;

  const lista = Array.isArray(totais) ? totais : [];
  if (!lista.length) {
    box.innerHTML = '<p class="nfe-card-subtitle">Nenhum total disponivel.</p>';
    return;
  }

  const cards = lista.map((item) => {
    const destaque = item?.possui_valor ? '#111827' : '#6b7280';
    const fundo = item?.possui_valor ? '#f8fafc' : '#f3f4f6';
    const statusMarcacao = item?.selecionado
      ? `Marcado no evento ${escapeHtml(String(item?.codigo_evento || 0))}`
      : 'Nao marcado';
    const statusEntrada = item?.entra_no_txt
      ? 'Vai entrar no TXT'
      : (item?.selecionado ? 'Marcado, mas sem ocorrencia detectada' : 'Fora do TXT');
    return `
      <div style="border: 1px solid #dbe4ee; border-radius: 12px; padding: 12px; background: ${fundo};">
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">${escapeHtml(item?.descricao || '-')}</div>
        <div style="font-size: 24px; font-weight: 700; color: ${destaque};">${escapeHtml(item?.hhhmm || '00000')}</div>
        <div style="font-size: 12px; color: #4b5563; margin-top: 8px;">${statusMarcacao}</div>
        <div style="font-size: 12px; color: #4b5563; margin-top: 2px;">${statusEntrada}</div>
      </div>
    `;
  }).join('');

  box.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px;">${cards}</div>`;
}

function renderizarIdsPendentes(funcionariosSemId) {
  const card = document.getElementById('idsPendentesCartaoHorasIobCard');
  const box = document.getElementById('idsPendentesCartaoHorasIob');
  if (!card || !box) return;

  idsPendentesAtuais = Array.isArray(funcionariosSemId) ? funcionariosSemId : [];
  if (!idsPendentesAtuais.length) {
    ultimoBloqueioIds = '';
    card.hidden = true;
    box.innerHTML = '';
    return;
  }

  const idsPreenchidos = coletarIdsPreenchidos();
  const linhas = idsPendentesAtuais.map((item) => {
    const valor = escapeHtml(idsPreenchidos[item.chave] || '');
    return `
      <label style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
        <input
          type="text"
          inputmode="numeric"
          class="id-funcionario-pendente"
          data-chave="${escapeHtml(item.chave)}"
          value="${valor}"
          style="width: 140px;"
        />
        <span>- ${escapeHtml(item.nome || '')}</span>
      </label>
    `;
  }).join('');

  card.hidden = false;
  box.innerHTML = `
    <div class="nfe-upload-message" style="margin-bottom: 8px; color: #b91c1c;">
      Existe funcionario sem ID. Preencha os campos abaixo para liberar a geração do TXT.
    </div>
    ${linhas}
  `;

  box.querySelectorAll('.id-funcionario-pendente').forEach((input) => {
    input.addEventListener('input', () => {
      ultimoTxt = null;
      const btnBaixar = document.getElementById('btnBaixarTxtIob');
      if (btnBaixar) btnBaixar.disabled = true;
      agendarPreviaAutomatica();
    });
  });
}

function limparSaida(mensagem) {
  const resumo = document.getElementById('resumoCartaoHorasIob');
  const tbody = document.getElementById('previewCartaoHorasIob');
  if (resumo) resumo.innerHTML = `<p>${escapeHtml(mensagem)}</p>`;
  renderizarTotaisEvento([]);
  renderizarIdsPendentes([]);
  if (tbody) tbody.innerHTML = '<tr><td colspan="2">Nenhum processamento ainda.</td></tr>';
}

async function habilitarPainelDebugSeAdmin() {
  try {
    const ctx = await window.AuthClient?.getAuthContext?.();
    const role = String(ctx?.user?.role || '').toUpperCase();
    if (role !== 'ADMIN') return;
    debugHabilitado = true;
    const card = document.getElementById('debugCartaoHorasIobCard');
    if (card) card.hidden = false;
    debugLog('Painel de debug habilitado para administrador');
  } catch (_) {
    // ignora falha de contexto
  }
}

function debugLog(mensagem, dados) {
  if (!debugHabilitado) return;
  const terminal = document.getElementById('debugCartaoHorasIobTerminal');
  if (!terminal) return;

  const dataHora = new Date().toLocaleTimeString('pt-BR');
  const linha = document.createElement('div');
  const sufixo = dados === undefined ? '' : ` ${formatarDebugDados(dados)}`;
  linha.textContent = `[${dataHora}] ${mensagem}${sufixo}`;
  terminal.appendChild(linha);
  terminal.scrollTop = terminal.scrollHeight;
}

function formatarDebugDados(valor) {
  try {
    return JSON.stringify(valor);
  } catch (_) {
    return String(valor);
  }
}

function obterAssinaturaAtual(arquivo) {
  return JSON.stringify({
    nome: arquivo?.name || '',
    tamanho: arquivo?.size || 0,
    alteradoEm: arquivo?.lastModified || 0,
    eventos: coletarEventosSelecionados(),
    ids: coletarIdsPreenchidos(),
  });
}

function coletarIdsPreenchidos() {
  const inputs = Array.from(document.querySelectorAll('.id-funcionario-pendente'));
  const ids = {};
  inputs.forEach((input) => {
    const chave = input.dataset.chave;
    const valor = String(input.value || '').replace(/\D/g, '');
    if (chave && valor) ids[chave] = valor;
  });
  return ids;
}

function obterIdsPendentesNaoPreenchidos() {
  if (!Array.isArray(idsPendentesAtuais) || !idsPendentesAtuais.length) return [];
  const ids = coletarIdsPreenchidos();
  return idsPendentesAtuais.filter((item) => !ids[item.chave]);
}

function exibirAlertaIdsPendentes(idsPendentes) {
  const pendentes = Array.isArray(idsPendentes) ? idsPendentes : [];
  if (!pendentes.length) return;

  const assinatura = pendentes.map((item) => item.chave).sort().join('|');
  if (assinatura === ultimoBloqueioIds) return;
  ultimoBloqueioIds = assinatura;

  const nomes = pendentes.map((item) => item.nome).filter(Boolean);
  const mensagem = nomes.length === 1
    ? `Falta o ID do funcionario: ${nomes[0]}. Preencha na caixa "IDs pendentes" acima do resumo para liberar o TXT.`
    : `Faltam IDs de ${nomes.length} funcionarios. Preencha na caixa "IDs pendentes" acima do resumo para liberar o TXT.`;
  window.alert(mensagem);
}

function setStatusCartaoHorasIob(texto, erro = false) {
  const el = document.getElementById('statusCartaoHorasIob');
  if (!el) return;
  el.textContent = texto || '';
  el.style.color = erro ? '#b91c1c' : '#111827';
}

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i += 1) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

function formatarTamanhoArquivo(bytes) {
  if (!Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatarDataArquivo(valor) {
  if (!valor) return '-';
  return new Date(valor).toLocaleString('pt-BR');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
