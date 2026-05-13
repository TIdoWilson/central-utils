document.addEventListener('DOMContentLoaded', () => {
  inicializarSidebar('xml-faenello');
  inicializarPaginaXmlFaenello();
});

const MUNICIPIO_CACHE = new Map();

const state = {
  fileName: '',
  records: [],
  skippedCancelled: 0,
  totals: {
    faturamento: 0,
    tributadoFb: 0,
    issRetido: 0,
  },
  municipioTotals: [],
};

function inicializarPaginaXmlFaenello() {
  const form = document.getElementById('xmlFaenelloForm');
  const input = document.getElementById('xmlFaenelloInput');
  const btnExportar = document.getElementById('btnExportarXlsx');
  const btnLimpar = document.getElementById('btnLimparXml');

  form?.addEventListener('submit', processarXmlSelecionado);
  btnExportar?.addEventListener('click', exportarXlsx);
  btnLimpar?.addEventListener('click', limparTela);
  input?.addEventListener('change', () => {
    setStatus('Arquivo selecionado. Clique em "Processar XML".');
  });

  limparResultados();
  atualizarVisibilidade();
}

async function processarXmlSelecionado(event) {
  event.preventDefault();

  const input = document.getElementById('xmlFaenelloInput');
  if (!input?.files?.length) {
    setStatus('Selecione um XML antes de processar.');
    return;
  }

  const file = input.files[0];
  setBusy(true);
  setStatus(`Lendo ${file.name}...`);

  try {
    const text = await lerArquivoComoTexto(file);
    const parsed = await parseXmlFaenello(text);

    state.fileName = file.name;
    state.records = parsed.records;
    state.skippedCancelled = parsed.skippedCancelled;
    state.totals = parsed.totals;
    state.municipioTotals = parsed.municipioTotals;

    renderizarTudo();
    atualizarVisibilidade();

    setStatus(`XML processado com sucesso: ${parsed.records.length} NFS-e ativas lidas${parsed.skippedCancelled ? `, ${parsed.skippedCancelled} canceladas ignoradas` : ''}.`);
  } catch (error) {
    console.error(error);
    limparResultados();
    atualizarVisibilidade();
    setStatus(`Erro ao processar XML: ${error?.message || error}`);
  } finally {
    setBusy(false);
  }
}

async function parseXmlFaenello(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(String(xmlText || '').replace(/^\uFEFF/, ''), 'application/xml');

  if (xmlDoc.getElementsByTagName('parsererror')?.length) {
    throw new Error('XML inválido ou malformado.');
  }

  const nfsNodes = findAllByLocalName(xmlDoc, 'nfs');
  if (!nfsNodes.length) {
    throw new Error('Nenhuma tag <nfs> encontrada no XML.');
  }

  const municipalityCodes = new Set();
  const skippedCancelled = [];
  const records = nfsNodes.map((node) => {
    const isCancelled = normalizeIssCancelada(getTextByPath(node, ['isNfsCancelada']));
    if (isCancelled === 'S') {
      skippedCancelled.push(true);
      return null;
    }

    const tpTributacao = normalizeText(getTextByPath(node, ['tpTributacao']));
    const cidadeIbge = normalizeText(getTextByPath(node, ['nrCidadeIbgeServico']));

    if (tpTributacao.includes('Tributado em outro município') && cidadeIbge) {
      municipalityCodes.add(cidadeIbge);
    }

    return {
      nrNfse: normalizeText(getTextByPath(node, ['nrNfs'])),
      tpTributacao,
      cidadeIbge,
      isIssRetido: normalizeIssRetido(getTextByPath(node, ['isIssRetido'])),
      cliente: normalizeText(getTextByPath(node, ['tomadorServico', 'nmTomador'])),
      documento: formatDocumento(getTextByPath(node, ['tomadorServico', 'nrDocumento'])),
      valorTotalNota: parseFlexibleNumber(getTextByPath(node, ['vlTotalNota'])),
      baseCalculoIss: parseFlexibleNumber(getTextByPath(node, ['vlBaseCalculo'])),
      valorIss: parseFlexibleNumber(getTextByPath(node, ['vlImposto'])),
      tributadoEm: '',
    };
  }).filter(Boolean);

  const municipioMap = await resolveMunicipios(Array.from(municipalityCodes));

  records.forEach((record) => {
    if (record.tpTributacao.includes('Tributado no município')) {
      record.tributadoEm = 'Francisco Beltrão';
      return;
    }

    if (record.tpTributacao.includes('Tributado em outro município')) {
      record.tributadoEm = municipioMap.get(record.cidadeIbge) || (record.cidadeIbge ? `Município ${record.cidadeIbge}` : '—');
      return;
    }

    record.tributadoEm = '—';
  });

  records.sort((a, b) => {
    const left = Number(a.nrNfse) || 0;
    const right = Number(b.nrNfse) || 0;
    return right - left;
  });

  const totals = calcularTotais(records);
  const municipioTotals = calcularTotaisMunicipios(records);

  return { records, totals, municipioTotals, skippedCancelled: skippedCancelled.length };
}

async function resolveMunicipios(codes) {
  const result = new Map();
  const uniqueCodes = Array.from(new Set((codes || []).map((code) => normalizeText(code)).filter(Boolean)));

  await Promise.all(uniqueCodes.map(async (code) => {
    const name = await resolveMunicipioName(code);
    result.set(code, name);
  }));

  return result;
}

async function resolveMunicipioName(code) {
  if (!code) return '';
  if (MUNICIPIO_CACHE.has(code)) return MUNICIPIO_CACHE.get(code);

  const promise = (async () => {
    try {
      const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${encodeURIComponent(code)}`);
      if (!response.ok) throw new Error(`IBGE retornou HTTP ${response.status}`);

      const data = await response.json();
      const item = Array.isArray(data) ? data[0] : data;
      const name = normalizeText(item?.nome || item?.municipio?.nome || item?.name || '');
      if (name) return name;
    } catch (error) {
      console.warn(`Falha ao consultar IBGE para ${code}:`, error?.message || error);
    }

    return `Município ${code}`;
  })();

  MUNICIPIO_CACHE.set(code, promise);
  const resolved = await promise;
  MUNICIPIO_CACHE.set(code, resolved);
  return resolved;
}

function calcularTotais(records) {
  return records.reduce((acc, record) => {
    acc.faturamento += toNumber(record.valorTotalNota);
    if (record.tributadoEm === 'Francisco Beltrão') {
      acc.tributadoFb += toNumber(record.valorTotalNota);
    }
    if (record.isIssRetido === 'S') {
      acc.issRetido += toNumber(record.valorIss);
    }
    return acc;
  }, {
    faturamento: 0,
    tributadoFb: 0,
    issRetido: 0,
  });
}

function calcularTotaisMunicipios(records) {
  const map = new Map();

  records.forEach((record) => {
    if (record.isIssRetido !== 'N') return;
    const key = record.tributadoEm || '—';
    const current = map.get(key) || { municipio: key, quantidade: 0, total: 0 };
    current.quantidade += 1;
    current.total += toNumber(record.valorIss);
    map.set(key, current);
  });

  return Array.from(map.values())
    .sort((a, b) => b.total - a.total || a.municipio.localeCompare(b.municipio, 'pt-BR'));
}

function calcularTotalNaoRetidoForaFb(records) {
  return records.reduce((acc, record) => {
    if (record.isIssRetido !== 'N') return acc;
    if (record.tributadoEm === 'Francisco Beltrão') return acc;
    return acc + toNumber(record.valorIss);
  }, 0);
}

function renderizarTudo() {
  renderizarDashboard();
  renderizarTabela();
  renderizarMunicipios();
  document.getElementById('xmlFaenelloDashboardCard')?.removeAttribute('hidden');
  document.getElementById('xmlFaenelloTableCard')?.removeAttribute('hidden');
  document.getElementById('xmlFaenelloEmpty')?.setAttribute('hidden', '');
  const btnExportar = document.getElementById('btnExportarXlsx');
  if (btnExportar) btnExportar.disabled = state.records.length === 0;
}

function renderizarDashboard() {
  const container = document.getElementById('xmlFaenelloDashboard');
  if (!container) return;

  const totalNaoRetido = state.records.filter((record) => record.isIssRetido === 'N').reduce((acc, record) => acc + toNumber(record.valorIss), 0);
  const totalNaoRetidoForaFb = calcularTotalNaoRetidoForaFb(state.records);

  container.innerHTML = [
    criarCardDashboard('Total faturamento', formatMoney(state.totals.faturamento), 'Soma de todas as notas processadas.'),
    criarCardDashboard('Total tributado em Francisco Beltrão', formatMoney(state.totals.tributadoFb), 'Notas com tpTributacao = "Tributado no município".'),
    criarCardDashboard('Total ISSQN retido', formatMoney(state.totals.issRetido), 'Soma do valor ISS das notas com retenção.'),
    criarCardDashboard('Total ISSQN não retido', formatMoney(totalNaoRetido), 'Base para a consolidação por município de tributação.'),
    criarCardDashboard('Total ISSQN não retido fora de Francisco Beltrão', formatMoney(totalNaoRetidoForaFb), 'Soma das notas sem retenção tributadas fora de Francisco Beltrão.'),
  ].join('');
}

function criarCardDashboard(titulo, valor, descricao) {
  return `
    <article class="xml-faenello-stat-card">
      <div class="xml-faenello-stat-title">${escapeHtml(titulo)}</div>
      <div class="xml-faenello-stat-value">${escapeHtml(valor)}</div>
      <div class="xml-faenello-stat-desc">${escapeHtml(descricao)}</div>
    </article>
  `;
}

function renderizarMunicipios() {
  const tbody = document.getElementById('xmlFaenelloMunicipiosBody');
  if (!tbody) return;

  if (!state.municipioTotals.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="xml-faenello-empty-table">Nenhuma NFS-e com ISS não retido foi encontrada.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.municipioTotals.map((item) => `
    <tr>
      <td>${escapeHtml(item.municipio)}</td>
      <td>${escapeHtml(String(item.quantidade))}</td>
      <td>${escapeHtml(formatMoney(item.total))}</td>
    </tr>
  `).join('');
}

function renderizarTabela() {
  const tbody = document.getElementById('xmlFaenelloTableBody');
  if (!tbody) return;

  tbody.innerHTML = state.records.map((record) => `
    <tr>
      <td class="xml-faenello-col-num">${escapeHtml(record.nrNfse || '—')}</td>
      <td>${escapeHtml(record.tributadoEm || '—')}</td>
      <td class="xml-faenello-col-center">${escapeHtml(record.isIssRetido || '—')}</td>
      <td>${escapeHtml(record.cliente || '—')}</td>
      <td class="xml-faenello-col-doc">${escapeHtml(record.documento || '—')}</td>
      <td class="xml-faenello-col-money">${escapeHtml(formatMoney(record.valorTotalNota))}</td>
      <td class="xml-faenello-col-money">${escapeHtml(formatMoney(record.baseCalculoIss))}</td>
      <td class="xml-faenello-col-money">${escapeHtml(formatMoney(record.valorIss))}</td>
    </tr>
  `).join('');
}

async function exportarXlsx() {
  if (!state.records.length) {
    setStatus('Carregue um XML antes de exportar.');
    return;
  }

  if (typeof XLSX === 'undefined') {
    setStatus('Biblioteca XLSX nao carregada.');
    return;
  }

  const detailRows = state.records.map((record) => ({
    'Nr NFSE': record.nrNfse || '',
    'Tributado em': record.tributadoEm || '',
    'ISS retido': record.isIssRetido || '',
    'Cliente': record.cliente || '',
    'CPF/CNPJ': record.documento || '',
    'Valor total da nota': record.valorTotalNota,
    'Base de calculo ISS': record.baseCalculoIss,
    'Valor ISS': record.valorIss,
  }));

  const resumoRows = [
    ['Indicador', 'Valor'],
    ['Total faturamento', state.totals.faturamento],
    ['Total tributado em Francisco Beltrão', state.totals.tributadoFb],
    ['Total ISSQN retido', state.totals.issRetido],
    ['Total ISSQN não retido', state.records.filter((record) => record.isIssRetido === 'N').reduce((acc, record) => acc + toNumber(record.valorIss), 0)],
    ['Total ISSQN não retido fora de Francisco Beltrão', calcularTotalNaoRetidoForaFb(state.records)],
  ];

  const municipioRows = [
    ['Município', 'Qtde NFS-e', 'Total ISSQN não retido'],
    ...state.municipioTotals.map((item) => [item.municipio, item.quantidade, item.total]),
  ];

  const wb = XLSX.utils.book_new();
  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  const wsResumo = XLSX.utils.aoa_to_sheet(resumoRows);
  const wsMunicipios = XLSX.utils.aoa_to_sheet(municipioRows);

  wsDetail['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 12 },
    { wch: 34 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
  ];

  wsResumo['!cols'] = [{ wch: 36 }, { wch: 18 }];
  wsMunicipios['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 18 }];

  aplicarFormatoMonetarioSheet(wsDetail, [5, 6, 7], detailRows.length + 1);
  aplicarFormatoMonetarioSheet(wsResumo, [1], 5);
  aplicarFormatoMonetarioSheet(wsMunicipios, [2], state.municipioTotals.length + 1);

  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalhe');
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
  XLSX.utils.book_append_sheet(wb, wsMunicipios, 'Municipios');

  const baseName = state.fileName ? state.fileName.replace(/\.xml$/i, '') : 'xml-faenello';
  const outputName = `${sanitizeFileName(baseName)}_faenello.xlsx`;

  XLSX.writeFile(wb, outputName);
  setStatus(`XLSX exportado: ${outputName}`);
}

function limparTela() {
  const input = document.getElementById('xmlFaenelloInput');
  if (input) input.value = '';
  limparResultados();
  atualizarVisibilidade();
  setStatus('Pronto para anexar um novo XML.');
}

function limparResultados() {
  state.fileName = '';
  state.records = [];
  state.skippedCancelled = 0;
  state.totals = {
    faturamento: 0,
    tributadoFb: 0,
    issRetido: 0,
  };
  state.municipioTotals = [];

  const dashboard = document.getElementById('xmlFaenelloDashboard');
  if (dashboard) dashboard.innerHTML = '';

  const municipios = document.getElementById('xmlFaenelloMunicipiosBody');
  if (municipios) {
    municipios.innerHTML = '';
  }

  const tabela = document.getElementById('xmlFaenelloTableBody');
  if (tabela) {
    tabela.innerHTML = '';
  }

  const btnExportar = document.getElementById('btnExportarXlsx');
  if (btnExportar) btnExportar.disabled = true;
}

function atualizarVisibilidade() {
  const hasData = state.records.length > 0;
  document.getElementById('xmlFaenelloDashboardCard')?.toggleAttribute('hidden', !hasData);
  document.getElementById('xmlFaenelloTableCard')?.toggleAttribute('hidden', !hasData);
  const empty = document.getElementById('xmlFaenelloEmpty');
  if (empty) {
    empty.toggleAttribute('hidden', hasData);
    empty.querySelector('h2').textContent = hasData ? 'Sem XML carregado' : 'Nenhuma NFS-e ativa encontrada';
    empty.querySelector('p').textContent = hasData
      ? 'Selecione um arquivo XML para ler os dados da Faenello e gerar a planilha.'
      : 'O XML foi processado, mas todas as NFS-e estavam canceladas e foram ignoradas.';
  }
}

function setBusy(isBusy) {
  const btnProcessar = document.getElementById('btnProcessarXml');
  const input = document.getElementById('xmlFaenelloInput');
  if (btnProcessar) btnProcessar.disabled = isBusy;
  if (input) input.disabled = isBusy;
}

function setStatus(message) {
  const el = document.getElementById('xmlFaenelloStatus');
  if (el) el.textContent = message || '';
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value || '').trim();
  if (!text) return 0;

  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(/,/g, '.') : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseFlexibleNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value || '').trim();
  if (!text) return 0;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(/,/g, '.') : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeIssRetido(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return 'N';
  if (text.startsWith('s') || text.includes('sim')) return 'S';
  return 'N';
}

function normalizeIssCancelada(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return 'N';
  if (text.startsWith('s') || text.includes('sim')) return 'S';
  return 'N';
}

function formatDocumento(value) {
  const digits = normalizeText(value).replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return normalizeText(value);
}

function getTextByPath(root, path) {
  let current = root;
  for (const name of path) {
    current = findDirectChildByLocalName(current, name);
    if (!current) return '';
  }
  return normalizeText(current.textContent);
}

function findDirectChildByLocalName(node, name) {
  if (!node || !node.children) return null;
  const target = String(name || '').toLowerCase();
  for (const child of Array.from(node.children)) {
    const localName = String(child.localName || child.nodeName || '').toLowerCase();
    if (localName === target) return child;
  }
  return null;
}

function findAllByLocalName(root, name) {
  const result = [];
  const target = String(name || '').toLowerCase();

  const visit = (node) => {
    if (!node) return;
    if (node.nodeType === 1) {
      const localName = String(node.localName || node.nodeName || '').toLowerCase();
      if (localName === target) result.push(node);
      Array.from(node.children || []).forEach(visit);
    }
  };

  visit(root.documentElement || root);
  return result;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatMoney(value) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : toNumber(value);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function sanitizeFileName(value) {
  return String(value || 'xml-faenello')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function aplicarFormatoMonetarioSheet(sheet, cols, maxRow) {
  if (!sheet || !Array.isArray(cols) || !cols.length) return;

  for (let row = 2; row <= maxRow; row += 1) {
    cols.forEach((colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ c: colIndex, r: row - 1 });
      const cell = sheet[cellRef];
      if (!cell || typeof cell.v !== 'number') return;
      cell.z = 'R$ #,##0.00';
    });
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function lerArquivoComoTexto(file) {
  if (window.WLTextFileReader?.readText) {
    return window.WLTextFileReader.readText(file);
  }

  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file);
  });
}
