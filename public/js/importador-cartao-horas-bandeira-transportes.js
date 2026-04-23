let ultimoResultado = null;
let ultimoPdfUrl = null;
let idsInformados = {};
let confirmadosSet = new Set();
let removidosSet = new Set();
let overridesPorRegistro = {};
let processandoBandeira = false;
let arquivoSujo = false;
let ultimoResultadoServidor = null;

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
  comissao_motorista: 'Comissão',
  dsr: 'DSR',
  horas_extras: 'Horas extras',
  diarias_refeicoes: 'Diárias refeições',
  salario: 'Salário',
  estadia_tempo_espera: 'Estadia/Tempo espera',
  premio_disco_tacografo: 'Prêmio disco tacógrafo',
  total_remuneracao_mensal: 'Total remuneração',
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
    atualizarRotuloLiberacao();
    if (btnBaixar) btnBaixar.disabled = true;
    atualizarPreviewPdf();
    atualizarInfoArquivo();
    limparSaida('Processando arquivo...');

    try {
      await processarBandeira();
      setStatus('Prévia atualizada.', false);
    } catch (error) {
      setStatus(error.message || 'Falha ao processar o PDF.', true);
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const haviaAlteracoes = arquivoSujo;
      if (haviaAlteracoes) {
        setStatus('Liberando a geração do arquivo final...', false);
        await processarBandeira({ modo: 'final' });
      } else {
        setStatus('Atualizando dados para gerar arquivo...', false);
        await processarBandeira();
      }
      if (!haviaAlteracoes) {
        setStatus('Processamento concluído.', false);
      }
    } catch (error) {
      setStatus(error.message || 'Falha ao processar o PDF.', true);
    }
  });

  btnBaixar?.addEventListener('click', () => {
    baixarArquivoAtual();
  });
}

function resetarEstadoTela() {
  ultimoResultado = null;
  ultimoResultadoServidor = null;
  idsInformados = {};
  confirmadosSet = new Set();
  removidosSet = new Set();
  overridesPorRegistro = {};
  arquivoSujo = false;
  atualizarRotuloLiberacao();
  atualizarRotuloDownload(null);
}

function invalidarGeracaoAteReprocessar() {
  arquivoSujo = true;
  if (ultimoResultadoServidor) {
    ultimoResultado = aplicarEstadoLocalAoResultado(ultimoResultadoServidor);
    renderizarResultado(ultimoResultado);
  }
  atualizarRotuloLiberacao();
  atualizarRotuloDownload(ultimoResultadoServidor);
  setStatus('Alterações pendentes. Clique em Liberar geração para habilitar o download.', false);
}

async function processarBandeira({ modo = 'previa' } = {}) {
  if (processandoBandeira) return ultimoResultado;
  const inputArquivo = document.getElementById('arquivoBandeira');
  const btnGerar = document.getElementById('btnGerarBandeira');
  const btnBaixar = document.getElementById('btnBaixarBandeira');
  const arquivo = inputArquivo?.files?.[0];
  if (!arquivo) throw new Error('Selecione um PDF.');

  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('ids_json', JSON.stringify(idsInformados));
  formData.append('confirmados_json', JSON.stringify(Array.from(confirmadosSet)));
  formData.append('removidos_json', JSON.stringify(Array.from(removidosSet)));
  formData.append('overrides_json', JSON.stringify(overridesPorRegistro));

  processandoBandeira = true;
  if (btnGerar) {
    btnGerar.disabled = true;
    btnGerar.textContent = modo === 'final' ? 'Liberando...' : 'Processando...';
  }
  if (btnBaixar) btnBaixar.disabled = true;
  setStatus('Processando arquivo...', false);

  try {
    const resp = await AuthClient.authFetch('/api/cartao-horas-bandeira-transportes/processar', {
      method: 'POST',
      body: formData,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || data.detail || `Erro HTTP ${resp.status}`);
    }

    ultimoResultadoServidor = data;
    arquivoSujo = false;
    ultimoResultado = aplicarEstadoLocalAoResultado(data);
    atualizarRotuloLiberacao();
    atualizarRotuloDownload(ultimoResultado);
    renderizarResultado(ultimoResultado);
    if (modo === 'final') {
      setStatus('Arquivo final gerado. O botão de baixar foi liberado.', false);
    }
    return data;
  } finally {
    processandoBandeira = false;
    if (btnGerar) {
      btnGerar.disabled = false;
      btnGerar.textContent = 'Reprocessar PDF';
    }
  }
}

async function salvarFuncionario(funcionario) {
  const input = document.querySelector(`input[data-matricula-key="${cssEscape(funcionario.registroId || '')}"]`);
  const matricula = String(input?.value || '').replace(/\D/g, '');
  if (!matricula) throw new Error('Informe a matrícula antes de salvar.');

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
  invalidarGeracaoAteReprocessar();
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
    <div><strong>Páginas no PDF:</strong> ${Number(data.totalPaginas || 0)}</div>
    <div><strong>Funcionários lidos:</strong> ${Number(data.totalFuncionarios || 0)}</div>
    <div><strong>Pendências:</strong> ${Number(data.totalPendencias || 0)}</div>
    <div><strong>Duplicados ignorados:</strong> ${Number(data.totalDuplicadosIgnorados || 0)}</div>
    <div><strong>Arquivos TXT prontos:</strong> ${Number(data.totalArquivosTxt || 0)}</div>
    <div><strong>Linhas no preview:</strong> ${Number(data.totalRegistrosTxt || 0)}</div>
    <div><strong>Arquivo final:</strong> ${escapeHtml(data.nomeArquivo || '-')}</div>
    <div><strong>Status:</strong> ${data.podeGerarTxt ? 'Pronto para baixar' : escapeHtml(data.mensagemBloqueio || 'Com pendências')}</div>
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
    box.innerHTML = '<p class="nfe-card-subtitle">Nenhum funcionário identificado.</p>';
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
          <button type="button" class="btn btn-secondary" data-acao="salvar" data-idx="${i}">Salvar matrícula</button>
          <button type="button" class="btn btn-secondary" data-acao="confirmar" data-idx="${i}" style="margin-left:6px;">Confirmar corrigido</button>
          <button type="button" class="btn btn-secondary" data-acao="remover" data-idx="${i}" style="margin-left:6px;">${removidosSet.has(registroId) || removidosSet.has(chave) ? 'Reativar' : 'Remover da geração'}</button>
        </td>
      </tr>
    `;
  }).join('');

  box.innerHTML = `
    <table class="nfe-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Página</th>
          <th>Nome</th>
          <th>CPF</th>
          <th>Matrícula</th>
          <th>Origem</th>
          <th>Soma remuneração</th>
          <th>Total remuneração</th>
          <th>Valores editáveis</th>
          <th>Status</th>
          <th>Ações</th>
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
          invalidarGeracaoAteReprocessar();
          setStatus('Correções confirmadas.', false);
        } else if (acao === 'remover') {
          alternarRemocao(funcionario);
          btn.textContent = 'Atualizando...';
          invalidarGeracaoAteReprocessar();
          setStatus('Lista de geração atualizada.', false);
        }
      } catch (error) {
        setStatus(error.message || 'Falha ao atualizar registro.', true);
      } finally {
        btn.disabled = false;
        btn.textContent =
          acao === 'salvar' ? 'Salvar matrícula'
            : acao === 'confirmar' ? 'Confirmar corrigido'
              : (removidosSet.has(funcionario.registroId) || removidosSet.has(funcionario.chave))
                ? 'Reativar'
                : 'Remover da geração';
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
    <div><strong>Última alteração:</strong> ${escapeHtml(new Date(arquivo.lastModified).toLocaleString('pt-BR'))}</div>
  `;
}

function limparSaida(mensagem) {
  const resumo = document.getElementById('resumoBandeira');
  const valores = document.getElementById('valoresBandeira');
  const fichas = document.getElementById('fichasBandeira');
  const preview = document.getElementById('previewTxtBandeira');
  if (resumo) resumo.innerHTML = `<p>${escapeHtml(mensagem || 'Sem dados.')}</p>`;
  if (valores) valores.innerHTML = '<p class="nfe-card-subtitle">Nenhum valor identificado.</p>';
  if (fichas) fichas.innerHTML = '<p class="nfe-card-subtitle">Nenhum funcionário identificado.</p>';
  if (preview) preview.innerHTML = '<tr><td colspan="2">Nenhuma linha gerada.</td></tr>';
}

function setStatus(texto, erro = false) {
  const el = document.getElementById('statusBandeira');
  if (!el) return;
  el.textContent = texto || '';
  el.style.color = erro ? '#b91c1c' : '#111827';
}

function atualizarRotuloDownload(data) {
  const btnBaixar = document.getElementById('btnBaixarBandeira');
  if (!btnBaixar) return;

  if (!data) {
    btnBaixar.style.display = 'none';
    btnBaixar.disabled = true;
    btnBaixar.textContent = 'Baixar arquivo';
    return;
  }

  if (arquivoSujo) {
    btnBaixar.style.display = 'none';
    btnBaixar.disabled = false;
    btnBaixar.textContent = 'Baixar arquivo';
    return;
  }

  if (!data.arquivoBase64) {
    btnBaixar.style.display = 'none';
    btnBaixar.disabled = true;
    btnBaixar.textContent = 'Baixar arquivo';
    return;
  }

  const tipoArquivo = String(data.tipoArquivo || '').toLowerCase();
  const totalArquivos = Number(data.totalArquivosTxt || 0);
  btnBaixar.style.display = '';
  btnBaixar.disabled = false;
  btnBaixar.textContent = tipoArquivo === 'txt' || totalArquivos === 1 ? 'Baixar TXT' : 'Baixar ZIP';
}

function atualizarRotuloLiberacao() {
  const btnGerar = document.getElementById('btnGerarBandeira');
  if (!btnGerar) return;
  btnGerar.disabled = false;
  btnGerar.textContent = arquivoSujo ? 'Liberar geração' : 'Reprocessar PDF';
}

function baixarArquivoAtual() {
  const base64 = ultimoResultado?.arquivoBase64 || '';
  if (!base64) return;
  const mimeType = ultimoResultado?.mimeType || 'application/octet-stream';
  const blob = base64ToBlob(base64, mimeType);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ultimoResultado.nomeArquivo || 'arquivo.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function aplicarEstadoLocalAoResultado(dataBase) {
  if (!dataBase) return null;
  const data = JSON.parse(JSON.stringify(dataBase));
  const pendencias = [];
  let totalArquivosTxt = 0;

  (data.funcionarios || []).forEach((funcionario) => {
    const registroId = String(funcionario.registroId || '');
    const chave = String(funcionario.chave || '');
    const matriculaAtual = String(idsInformados[chave] || funcionario.matricula || '').replace(/\D/g, '');
    if (chave && matriculaAtual) idsInformados[chave] = matriculaAtual;

    funcionario.matricula = matriculaAtual || funcionario.matricula || '00000';

    const valoresBase = funcionario.valoresEditaveis || {};
    const valores = { ...valoresBase };
    if (overridesPorRegistro[registroId]) {
      Object.keys(overridesPorRegistro[registroId]).forEach((campo) => {
        valores[campo] = overridesPorRegistro[registroId][campo];
      });
    }
    funcionario.valoresEditaveis = valores;

    const soma = CAMPOS_EDITAVEIS_ORDEM.slice(0, -1).reduce((acc, campo) => acc + parseValorBrToFloat(valores[campo] || '0,00'), 0);
    const total = parseValorBrToFloat(valores.total_remuneracao_mensal || '0,00');
    const consistenciaOk = Math.abs(soma - total) <= 0.01;
    const removidoUsuario = removidosSet.has(registroId) || removidosSet.has(chave);
    const confirmadoUsuario = confirmadosSet.has(registroId) || confirmadosSet.has(chave);
    const duplicadoIgnorado = Boolean(funcionario.duplicadoIgnorado);
    const pendenciaMatricula = funcionario.matricula === '00000';
    const pendenciaConsistencia = !consistenciaOk;

    let bloqueiaGeracao = (pendenciaMatricula || pendenciaConsistencia) && !removidoUsuario;
    const inconsistencias = Array.isArray(funcionario.inconsistencias) ? [...funcionario.inconsistencias] : [];

    if (duplicadoIgnorado) {
      funcionario.statusRegistro = 'duplicado_ignorado';
      funcionario.inconsistencias = inconsistencias;
    } else if (removidoUsuario) {
      bloqueiaGeracao = false;
      funcionario.statusRegistro = 'removido';
      funcionario.inconsistencias = [];
    } else if (confirmadoUsuario && !pendenciaMatricula) {
      bloqueiaGeracao = false;
      funcionario.statusRegistro = 'confirmado_usuario';
      funcionario.inconsistencias = [];
    } else if (bloqueiaGeracao) {
      funcionario.statusRegistro = 'pendente';
      funcionario.inconsistencias = inconsistencias;
      pendencias.push(funcionario);
    } else {
      funcionario.statusRegistro = 'ok';
      funcionario.inconsistencias = inconsistencias;
      totalArquivosTxt += 1;
    }

    funcionario.consistenciaOk = consistenciaOk;
    funcionario.bloqueiaGeracao = bloqueiaGeracao;
    funcionario.confirmadoUsuario = confirmadoUsuario;
    funcionario.removidoUsuario = removidoUsuario;
    funcionario.somaRemuneracao = formatarNumeroBr(soma);
    funcionario.totalRemuneracao = formatarNumeroBr(total);
    funcionario.duplicadoIgnorado = duplicadoIgnorado;
  });

  data.pendencias = pendencias;
  data.totalPendencias = pendencias.length;
  data.totalArquivosTxt = totalArquivosTxt;
  data.podeGerarTxt = totalArquivosTxt > 0 && pendencias.length === 0;
  data.bloqueadoGeracao = !data.podeGerarTxt;
  data.mensagemBloqueio = data.podeGerarTxt
    ? ''
    : 'Geração travada: corrija matrícula faltante e/ou ajuste os fatores para que a soma da remuneração seja igual ao total de remuneração.';
  return data;
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


