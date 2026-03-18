const COLUMN_PREFS_KEY = 'cadastro_empresas_brasilapi_columns_v2';

const COLUMN_DEFS = [
  { key: 'cnpjFormatted', label: 'CNPJ', defaultVisible: true, render: (row) => esc(row.cnpjFormatted || row.cnpj) },
  { key: 'razaoSocial', label: 'Razão social', defaultVisible: true, render: (row) => esc(row.razaoSocial) },
  { key: 'nomeFantasia', label: 'Nome fantasia', defaultVisible: true, render: (row) => esc(row.nomeFantasia) },
  { key: 'situacaoCadastral', label: 'Situação', defaultVisible: true, render: (row) => esc(row.situacaoCadastral) },
  { key: 'municipio', label: 'Município', defaultVisible: true, render: (row) => esc(row.municipio) },
  { key: 'uf', label: 'UF', defaultVisible: true, render: (row) => esc(row.uf) },
  { key: 'porte', label: 'Porte', defaultVisible: false, render: (row) => esc(row.porte) },
  { key: 'regimeTributarioAtual', label: 'Regime Tributário', defaultVisible: true, render: (row) => esc(composeRegimeAtual(row)) },
  { key: 'atividadePrincipalDescricao', label: 'CNAE principal', defaultVisible: true, render: (row) => esc(composeCnaePrincipal(row)) },
  { key: 'email', label: 'E-mail', defaultVisible: false, render: (row) => esc(row.email) },
  { key: 'dddTelefone1', label: 'Telefone', defaultVisible: false, render: (row) => esc(composePhones(row)) },
  { key: 'atualizadoEm', label: 'Atualizado em', defaultVisible: true, render: (row) => esc(formatDateTime(row.atualizadoEm)) },
];

const EXTRA_COLUMN_DEFS = [
  { key: 'metaSummary', label: 'Sócios/CNAEs', defaultVisible: true },
  { key: 'rowActions', label: 'Ações', defaultVisible: true },
];

const REGIME_MANUAL_OPTIONS = [
  'LUCRO REAL',
  'LUCRO PRESUMIDO',
  'SIMPLES NACIONAL',
  'SIMEI',
  'INATIVA',
  'EXCLUIDA DO SIMPLES NACIONAL',
  'EXCLUIDA DO SIMEI',
  'ISENTA DO IRPJ',
  'IMUNE DO IRPJ',
];

const SELECTOR_COLUMN_DEFS = [...COLUMN_DEFS, ...EXTRA_COLUMN_DEFS];

const state = {
  page: 1,
  pageSize: 50,
  total: 0,
  items: [],
  visibleColumns: new Set(),
  cnaeHints: [],
  lastFailures: [],
  lastFailedCnpjs: [],
  filtersAutoTimer: null,
  editingRegimeCompanyId: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof inicializarSidebar === 'function') {
    try {
      await inicializarSidebar('cadastro-empresas-brasilapi');
    } catch (_) {}
  }

  if (!window.AuthClient) {
    window.location.href = '/login';
    return;
  }

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx.user) {
    window.location.href = '/login';
    return;
  }

  const whoami = document.getElementById('whoami');
  if (whoami) {
    whoami.textContent = `Logado como: ${ctx.user.name} <${ctx.user.email}> (${ctx.user.role})`;
  }

  hydrateColumns();
  renderColumnSelector();
  bindEvents();
  await loadMetaFilters();
  await loadCompanies(1);
});

function bindEvents() {
  const btnImportManual = document.getElementById('btnImportManual');
  const btnImportFile = document.getElementById('btnImportFile');
  const btnRefreshListed = document.getElementById('btnRefreshListed');
  const btnRefreshAll = document.getElementById('btnRefreshAll');
  const btnApplyFilters = document.getElementById('btnApplyFilters');
  const btnClearFilters = document.getElementById('btnClearFilters');
  const btnReloadList = document.getElementById('btnReloadList');
  const btnRetryFailures = document.getElementById('btnRetryFailures');
  const btnDownloadFailures = document.getElementById('btnDownloadFailures');
  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');
  const pageSizeEl = document.getElementById('pageSize');
  const importFileEl = document.getElementById('importFile');
  const tbody = document.querySelector('#companiesTable tbody');

  btnImportManual.addEventListener('click', importManualCnpjs);
  btnImportFile.addEventListener('click', importFileCnpjs);
  btnRefreshListed.addEventListener('click', refreshListedCompanies);
  btnRefreshAll.addEventListener('click', refreshAllCompanies);
  btnApplyFilters.addEventListener('click', () => loadCompanies(1));
  btnClearFilters.addEventListener('click', async () => {
    resetFilters();
    await loadCompanies(1);
  });
  btnReloadList.addEventListener('click', () => loadCompanies(state.page));
  btnRetryFailures.addEventListener('click', retryLastFailures);
  btnDownloadFailures.addEventListener('click', downloadFailuresCsv);
  btnExportExcel.addEventListener('click', exportFilteredToExcel);
  btnPrevPage.addEventListener('click', () => loadCompanies(Math.max(1, state.page - 1)));
  btnNextPage.addEventListener('click', () => {
    const maxPage = Math.max(1, Math.ceil(state.total / state.pageSize));
    loadCompanies(Math.min(maxPage, state.page + 1));
  });

  pageSizeEl.addEventListener('change', () => {
    state.pageSize = Number(pageSizeEl.value) || 50;
    loadCompanies(1);
  });

  // Filtros automáticos (debounce): não precisa clicar em "Aplicar filtros" toda vez.
  [
    'filterSearch',
    'filterPartner',
    'filterCnaes',
  ].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('input', scheduleAutoFilter);
  });

  [
    'filterCnaeMode',
    'filterSituacao',
    'filterUf',
    'filterPorte',
    'filterRegime',
    'filterNaturezaJuridica',
    'filterMunicipio',
  ].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('change', () => loadCompanies(1));
  });

  importFileEl?.addEventListener('change', () => {
    updateFileBadge(importFileEl.files?.[0] || null);
  });

  tbody.addEventListener('click', async (ev) => {
    const partnersBtn = ev.target?.closest?.('button[data-action="show-partners"]');
    if (partnersBtn) {
      const id = Number(partnersBtn.getAttribute('data-id'));
      const item = state.items.find((row) => Number(row.id) === id);
      if (item) {
        openDetailModal({
          title: `Sócios - ${item.razaoSocial || item.cnpjFormatted || item.cnpj || ''}`,
          html: buildPartnersHtml(item),
        });
      }
      return;
    }

    const cnaesBtn = ev.target?.closest?.('button[data-action="show-cnaes"]');
    if (cnaesBtn) {
      const id = Number(cnaesBtn.getAttribute('data-id'));
      const item = state.items.find((row) => Number(row.id) === id);
      if (item) {
        openDetailModal({
          title: `CNAEs - ${item.razaoSocial || item.cnpjFormatted || item.cnpj || ''}`,
          html: buildCnaesHtml(item),
        });
      }
      return;
    }

    const regimeBtn = ev.target?.closest?.('button[data-action="show-regime"]');
    if (regimeBtn) {
      const id = Number(regimeBtn.getAttribute('data-id'));
      const item = state.items.find((row) => Number(row.id) === id);
      if (item) {
        openDetailModal({
          title: `Regime Tributário - ${item.razaoSocial || item.cnpjFormatted || item.cnpj || ''}`,
          html: buildRegimeHtml(item),
        });
      }
      return;
    }

    const editRegimeBtn = ev.target?.closest?.('button[data-action="edit-regime"]');
    if (editRegimeBtn) {
      const id = Number(editRegimeBtn.getAttribute('data-id'));
      const item = state.items.find((row) => Number(row.id) === id);
      if (!item) return;
      openRegimeEditModal(item);
      return;
    }

    const refreshBtn = ev.target?.closest?.('button[data-action="refresh-company"]');
    if (refreshBtn) {
      const cnpj = String(refreshBtn.getAttribute('data-cnpj') || '').trim();
      if (!cnpj) return;
      refreshBtn.disabled = true;
      try {
        await runRefresh([cnpj]);
      } finally {
        refreshBtn.disabled = false;
      }
    }
  });

  const modal = document.getElementById('companyDetailModal');
  modal.addEventListener('click', (ev) => {
    const closeBtn = ev.target?.closest?.('[data-action="close-detail"]');
    if (closeBtn) closeDetailModal();
  });

  const regimeModal = document.getElementById('regimeEditModal');
  regimeModal?.addEventListener('click', (ev) => {
    const closeBtn = ev.target?.closest?.('[data-action="close-regime-edit"]');
    if (closeBtn) closeRegimeEditModal();
  });

  const regimeForm = document.getElementById('regimeEditForm');
  regimeForm?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const id = Number(state.editingRegimeCompanyId);
    if (!id) return;
    const select = document.getElementById('regimeManualSelect');
    const custom = document.getElementById('regimeManualCustom');
    const selected = String(select?.value || '');
    const manualValue = selected === '__CUSTOM__' ? String(custom?.value || '').trim() : selected;
    await saveManualRegime(id, manualValue);
  });

  const regimeSelect = document.getElementById('regimeManualSelect');
  regimeSelect?.addEventListener('change', () => {
    toggleRegimeCustomInput();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      closeDetailModal();
      closeRegimeEditModal();
    }
  });

  updateFileBadge(importFileEl?.files?.[0] || null);
}

async function loadMetaFilters() {
  try {
    const response = await AuthClient.authFetch('/api/cadastro-empresas-brasilapi/meta', { method: 'GET' });
    const data = await readApiResponse(response);
    if (!response.ok || data.error) throw new Error(data.error || `Falha ao carregar filtros (HTTP ${response.status}).`);

    fillSelect('filterUf', data.ufs || [], 'Todas');
    fillSelect('filterSituacao', data.situacoes || [], 'Todas');
    fillSelect('filterPorte', data.portes || [], 'Todos');
    fillRegimeSelect(data.regimesTributarios || []);
    fillSelect('filterNaturezaJuridica', data.naturezasJuridicas || [], 'Todas');
    fillSelect('filterMunicipio', data.municipios || [], 'Todos');
    fillCnaeSuggestions(Array.isArray(data.cnaes) ? data.cnaes : []);
  } catch (error) {
    showMessage(error.message || 'Falha ao carregar filtros.', true);
  }
}

async function loadCompanies(page) {
  state.page = Math.max(1, Number(page) || 1);
  state.pageSize = Number(document.getElementById('pageSize')?.value || state.pageSize || 50);
  const tbody = document.querySelector('#companiesTable tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="99">Carregando...</td></tr>';
  }

  try {
    const params = buildFilterParams();
    params.set('page', String(state.page));
    params.set('pageSize', String(state.pageSize));

    const response = await AuthClient.authFetch(`/api/cadastro-empresas-brasilapi/companies?${params.toString()}`, { method: 'GET' });
    const data = await readApiResponse(response);
    if (!response.ok || data.error) throw new Error(data.error || `Erro ao listar empresas (HTTP ${response.status}).`);

    state.items = Array.isArray(data.items) ? data.items : [];
    state.total = Number(data.total || 0);
    state.page = Number(data.page || state.page);
    state.pageSize = Number(data.pageSize || state.pageSize);

    renderTable();
    renderPagination();
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="99">${esc(error.message || 'Erro ao listar empresas.')}</td></tr>`;
    }
    renderPagination();
  }
}

async function readApiResponse(response) {
  const text = await response.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return { error: text.slice(0, 500) };
  }
}

function renderTable() {
  const headRow = document.getElementById('companiesHeadRow');
  const tbody = document.querySelector('#companiesTable tbody');
  const summary = document.getElementById('tableSummary');

  if (!headRow || !tbody) return;

  const columns = getVisibleColumnDefs();
  const showMetaSummary = state.visibleColumns.has('metaSummary');
  const showRowActions = state.visibleColumns.has('rowActions');

  const headParts = [
    ...columns.map((column) => `<th class="col-${esc(column.key)}">${esc(column.label)}</th>`),
  ];
  if (showMetaSummary) headParts.push('<th class="col-meta">Sócios/CNAEs</th>');
  if (showRowActions) headParts.push('<th class="col-actions">Ações</th>');
  headRow.innerHTML = headParts.join('');

  if (!state.items.length) {
    const extraCols = (showMetaSummary ? 1 : 0) + (showRowActions ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${columns.length + extraCols}">Nenhuma empresa encontrada.</td></tr>`;
    if (summary) summary.textContent = 'Nenhum registro para os filtros atuais.';
    return;
  }

  const rows = [];
  for (const item of state.items) {
    const partners = Array.isArray(item.partners) ? item.partners : [];
    const cnaes = Array.isArray(item.cnaes) ? item.cnaes : [];
    const rowParts = [
      columns.map((column) => `<td class="col-${esc(column.key)}">${column.render(item)}</td>`).join(''),
    ];

    if (showMetaSummary) {
      rowParts.push(`
        <td class="col-meta">
          <div class="cadastro-empresas-meta-cell">
            <span>${partners.length} sócio(s) / ${cnaes.length} CNAE(s)</span>
          </div>
        </td>
      `);
    }

    if (showRowActions) {
      rowParts.push(`
        <td class="col-actions">
          <div class="cadastro-empresas-row-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="show-partners" data-id="${item.id}">
              Sócios
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="show-cnaes" data-id="${item.id}">
              CNAEs
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="show-regime" data-id="${item.id}">
              Regime
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-regime" data-id="${item.id}">
              Editar regime
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="refresh-company" data-cnpj="${esc(item.cnpj)}">
              Atualizar
            </button>
          </div>
        </td>
      `);
    }

    rows.push(`
      <tr>
        ${rowParts.join('')}
      </tr>
    `);
  }

  tbody.innerHTML = rows.join('');

  if (summary) {
    const pageStart = state.total ? ((state.page - 1) * state.pageSize + 1) : 0;
    const pageEnd = Math.min(state.total, state.page * state.pageSize);
    summary.textContent = `Mostrando ${pageStart} a ${pageEnd} de ${state.total} empresas.`;
  }
}

function renderExpandedContent(item) {
  const partners = Array.isArray(item.partners) ? item.partners : [];
  const cnaes = Array.isArray(item.cnaes) ? item.cnaes : [];

  const partnersHtml = partners.length
    ? `<ul class="cadastro-empresas-list">
        ${partners.map((p) => `<li><strong>${esc(p.partnerName)}</strong>${p.qualification ? ` - ${esc(p.qualification)}` : ''}</li>`).join('')}
      </ul>`
    : '<p class="cadastro-empresas-muted">Nenhum sócio retornado pelo BrasilAPI para este CNPJ.</p>';

  const cnaesHtml = cnaes.length
    ? `<ul class="cadastro-empresas-list">
        ${cnaes.map((c) => `<li>${c.isPrimary ? '<strong>[Principal]</strong> ' : ''}${esc(formatCnae(c))}</li>`).join('')}
      </ul>`
    : '<p class="cadastro-empresas-muted">Nenhum CNAE registrado.</p>';

  return `
    <div class="cadastro-empresas-expanded-content">
      <div>
        <h3>Sócios</h3>
        ${partnersHtml}
      </div>
      <div>
        <h3>CNAEs</h3>
        ${cnaesHtml}
      </div>
    </div>
  `;
}

function buildPartnersHtml(item) {
  const partners = Array.isArray(item.partners) ? item.partners : [];
  if (!partners.length) {
    return '<p class="cadastro-empresas-muted">Nenhum sócio retornado pela BrasilAPI para este CNPJ.</p>';
  }
  return `<ul class="cadastro-empresas-list">${partners.map((p) => `<li><strong>${esc(p.partnerName)}</strong>${p.qualification ? ` - ${esc(p.qualification)}` : ''}</li>`).join('')}</ul>`;
}

function buildCnaesHtml(item) {
  const cnaes = Array.isArray(item.cnaes) ? item.cnaes : [];
  if (!cnaes.length) {
    return '<p class="cadastro-empresas-muted">Nenhum CNAE registrado para esta empresa.</p>';
  }
  return `<ul class="cadastro-empresas-list">${cnaes.map((c) => `<li>${c.isPrimary ? '<strong>[Principal]</strong> ' : ''}${esc(formatCnae(c))}</li>`).join('')}</ul>`;
}

function buildRegimeHtml(item) {
  const yesNo = (value) => {
    if (value === true) return 'Sim';
    if (value === false) return 'Não';
    return 'Não informado';
  };
  const historico = getRegimeHistory(item);
  const allFlagsEmpty = [
    item.opcaoSimples,
    item.dataOpcaoSimples,
    item.dataExclusaoSimples,
    item.opcaoMei,
    item.dataOpcaoMei,
    item.dataExclusaoMei,
  ].every((v) => v === null || v === undefined || v === '');
  const regimeAtual = composeRegimeAtual(item);

  const historicoHtml = historico.length
    ? `
      <div class="cadastro-regime-history-wrap">
        <table class="cadastro-regime-history-table">
          <thead>
            <tr>
              <th>Ano</th>
              <th>Forma de tributação</th>
              <th>Qtd. escriturações</th>
              <th>CNPJ SCP</th>
            </tr>
          </thead>
          <tbody>
            ${historico.map((row) => `
              <tr>
                <td>${esc(row.ano - '-')}</td>
                <td>${esc(row.formaDeTributacao || '-')}</td>
                <td>${esc(row.quantidadeDeEscrituracoes - '-')}</td>
                <td>${esc(row.cnpjDaScp || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : '<p class="cadastro-empresas-muted" style="margin-top:10px;">Sem histórico em `regime_tributario` para este CNPJ na resposta atual da BrasilAPI.</p>';

  return `
    <p style="margin: 0 0 10px;"><strong>Regime Tributário atual:</strong> ${esc(regimeAtual || 'Não informado')}</p>
    <p style="margin: 0 0 10px;"><strong>Regime manual:</strong> ${esc(normalizeRegimeLabel(item.regimeTributarioManual || '') || 'Não informado')}</p>
    <h4 style="margin: 0 0 8px; font-size: 14px;">Histórico de mudança de regime</h4>
    ${historicoHtml}
    <h4 style="margin: 12px 0 8px; font-size: 14px;">Simples/MEI (indicadores BrasilAPI)</h4>
    <div class="cadastro-regime-grid">
      <div><strong>Optante Simples:</strong> ${esc(yesNo(item.opcaoSimples))}</div>
      <div><strong>Data opção Simples:</strong> ${esc(formatDateOnly(item.dataOpcaoSimples))}</div>
      <div><strong>Data exclusão Simples:</strong> ${esc(formatDateOnly(item.dataExclusaoSimples))}</div>
      <div><strong>Optante MEI:</strong> ${esc(yesNo(item.opcaoMei))}</div>
      <div><strong>Data opção MEI:</strong> ${esc(formatDateOnly(item.dataOpcaoMei))}</div>
      <div><strong>Data exclusão MEI:</strong> ${esc(formatDateOnly(item.dataExclusaoMei))}</div>
    </div>
    ${allFlagsEmpty && !historico.length ? '<p class="cadastro-empresas-muted" style="margin-top:10px;">Sem indicadores de regime preenchidos. Recomendação: usar "Atualizar todos os cadastrados".</p>' : ''}
  `;
}

async function saveManualRegime(id, regimeTributarioManual) {
  try {
    const response = await AuthClient.authFetch(`/api/cadastro-empresas-brasilapi/companies/${id}/regime-manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regimeTributarioManual }),
    });
    const data = await readApiResponse(response);
    if (!response.ok || data.error) throw new Error(data.error || `Falha ao salvar regime (HTTP ${response.status}).`);

    const updated = data?.company || null;
    if (updated) {
      const idx = state.items.findIndex((row) => Number(row.id) === Number(updated.id));
      if (idx >= 0) state.items[idx] = updated;
      renderTable();
      renderPagination();
    } else {
      await loadCompanies(state.page);
    }
    await loadMetaFilters();
    closeRegimeEditModal();
    showMessage('Regime tributário manual salvo com sucesso.', false);
  } catch (error) {
    showMessage(error.message || 'Erro ao salvar regime tributário manual.', true);
  }
}

function openDetailModal({ title, html }) {
  const modal = document.getElementById('companyDetailModal');
  const modalTitle = document.getElementById('companyDetailTitle');
  const modalBody = document.getElementById('companyDetailBody');
  if (!modal || !modalTitle || !modalBody) return;
  modalTitle.textContent = String(title || 'Detalhes');
  modalBody.innerHTML = String(html || '');
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeDetailModal() {
  const modal = document.getElementById('companyDetailModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

function renderPagination() {
  const pageInfo = document.getElementById('pageInfo');
  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');

  const maxPage = Math.max(1, Math.ceil(state.total / Math.max(1, state.pageSize)));
  if (pageInfo) pageInfo.textContent = `Página ${state.page} de ${maxPage}`;
  if (btnPrev) btnPrev.disabled = state.page <= 1;
  if (btnNext) btnNext.disabled = state.page >= maxPage;
}

function renderColumnSelector() {
  const container = document.getElementById('columnSelector');
  if (!container) return;

  container.innerHTML = SELECTOR_COLUMN_DEFS.map((column) => `
    <label class="cadastro-empresas-check">
      <input
        type="checkbox"
        data-column-key="${column.key}"
        ${state.visibleColumns.has(column.key) ? 'checked' : ''}
      />
      ${esc(column.label)}
    </label>
  `).join('');

  container.querySelectorAll('input[type="checkbox"][data-column-key]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const key = checkbox.getAttribute('data-column-key');
      if (!key) return;

      if (checkbox.checked) state.visibleColumns.add(key);
      else state.visibleColumns.delete(key);

      if (state.visibleColumns.size === 0) {
        state.visibleColumns.add(COLUMN_DEFS[0].key);
      }

      persistColumns();
      renderTable();
    });
  });
}

async function importManualCnpjs() {
  const raw = getInputValue('manualCnpjs');
  if (!raw) {
    const fileEl = document.getElementById('importFile');
    const hasFile = !!fileEl?.files?.[0];
    if (hasFile) {
      await importFileCnpjs();
      return;
    }
    showMessage('Informe pelo menos um CNPJ para importar ou selecione um arquivo.', true);
    return;
  }

  const cnpjs = extractCnpjsFromText(raw);
  if (!cnpjs.length) {
    showMessage('Nenhum CNPJ válido foi encontrado no texto informado.', true);
    return;
  }

  await runImport({
    endpoint: '/api/cadastro-empresas-brasilapi/import',
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cnpjs,
        forceRefresh: !!document.getElementById('forceRefresh').checked,
      }),
    },
  });
}

async function importFileCnpjs() {
  const fileEl = document.getElementById('importFile');
  const file = fileEl?.files?.[0];
  if (!file) {
    showMessage('Selecione um arquivo para importar.', true);
    return;
  }

  const formData = new FormData();
  formData.set('file', file, file.name);
  formData.set('forceRefresh', document.getElementById('forceRefresh')?.checked ? 'true' : 'false');

  await runImport({
    endpoint: '/api/cadastro-empresas-brasilapi/import-file',
    options: {
      method: 'POST',
      body: formData,
    },
  });
}

async function refreshListedCompanies() {
  const cnpjs = state.items.map((item) => String(item.cnpj || '').trim()).filter(Boolean);
  if (!cnpjs.length) {
    showMessage('Não há empresas na página atual para atualizar.', true);
    return;
  }

  if (!window.confirm(`Atualizar ${cnpjs.length} empresa(s) da página atual?`)) {
    return;
  }

  await runRefresh(cnpjs);
}

async function refreshAllCompanies() {
  if (!window.confirm('Atualizar todos os CNPJs cadastrados no banco? Essa operação pode levar alguns minutos.')) {
    return;
  }

  await runImport({
    endpoint: '/api/cadastro-empresas-brasilapi/refresh-all',
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  });
}

async function runRefresh(cnpjs) {
  return runImport({
    endpoint: '/api/cadastro-empresas-brasilapi/refresh',
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpjs }),
    },
  });
}

async function runImport({ endpoint, options }) {
  setBusy(true);
  showMessage('Processando consulta na BrasilAPI, aguarde...', false);
  try {
    const response = await AuthClient.authFetch(endpoint, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || 'Falha no processamento.');

    const ignored = Number(data.ignorados || 0);
    const processed = Number(data.processados || 0);
    const msg = [
      `Recebidos (CNPJs únicos): ${Number(data.totalRecebidos || 0)}`,
      `Processados: ${Number(data.processados || 0)}`,
      `Inseridos: ${Number(data.inseridos || 0)}`,
      `Atualizados: ${Number(data.atualizados || 0)}`,
      `Ignorados (já cadastrados): ${ignored}`,
      `Falhas: ${Array.isArray(data.falhas) ? data.falhas.length : 0}`,
    ].join(' | ');

    if (Array.isArray(data.falhas) && data.falhas.length > 0) {
      state.lastFailures = data.falhas.slice();
      state.lastFailedCnpjs = data.falhas
        .map((f) => String(f.cnpj || '').replace(/\D/g, ''))
        .filter((cnpj) => cnpj.length === 14);
      showMessage(`${msg}\n\nVeja os detalhes no quadro "Falhas da última execução".`, true);
    } else {
      state.lastFailures = [];
      state.lastFailedCnpjs = [];
      if (ignored > 0 && processed === 0) {
        showMessage(`${msg}\n\nNenhum CNPJ foi reconsultado porque já estavam cadastrados. Marque "Reconsultar CNPJs já cadastrados" para atualizar tudo.`, false);
      } else {
        showMessage(msg, false);
      }
    }
    renderFailuresPanel();
    updateFailuresButtons();

    await loadMetaFilters();
    await loadCompanies(1);
  } catch (error) {
    showMessage(error.message || 'Erro ao processar importação.', true);
  } finally {
    setBusy(false);
    updateFailuresButtons();
  }
}

function setBusy(isBusy) {
  [
    'btnImportManual',
    'btnImportFile',
    'btnRefreshListed',
    'btnRefreshAll',
    'btnApplyFilters',
    'btnClearFilters',
    'btnReloadList',
    'btnExportExcel',
    'btnRetryFailures',
    'btnDownloadFailures',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = isBusy;
  });
}

function updateFailuresButtons() {
  const hasFailures = state.lastFailedCnpjs.length > 0;
  const retryBtn = document.getElementById('btnRetryFailures');
  const downloadBtn = document.getElementById('btnDownloadFailures');
  if (retryBtn) retryBtn.disabled = !hasFailures;
  if (downloadBtn) downloadBtn.disabled = !hasFailures;
}

function renderFailuresPanel() {
  const panel = document.getElementById('failuresPanel');
  const list = document.getElementById('failuresList');
  if (!panel || !list) return;

  if (!state.lastFailures.length) {
    panel.hidden = true;
    list.innerHTML = '';
    return;
  }

  panel.hidden = false;
  list.innerHTML = state.lastFailures
    .map((f) => `<div><strong>${esc(f.cnpj || '-')}</strong>: ${esc(cleanFailureMessage(f.mensagem, f.cnpj))}</div>`)
    .join('');
}

function cleanFailureMessage(message, cnpj) {
  const msg = String(message || '').trim();
  if (!msg) return 'Erro';
  const cnpjDigits = String(cnpj || '').replace(/\D/g, '');
  if (!cnpjDigits) return msg;

  const mask = cnpjDigits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const patterns = [
    new RegExp(`^\\s*CNPJ\\s*${escapeRegExp(mask)}\\s*[-: ]*`, 'i'),
    new RegExp(`^\\s*CNPJ\\s*${escapeRegExp(cnpjDigits)}\\s*[-: ]*`, 'i'),
  ];

  let cleaned = msg;
  for (const p of patterns) cleaned = cleaned.replace(p, '');
  return cleaned.trim() || msg;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+^${}()|[\]\\]/g, '\\$&');
}

async function retryLastFailures() {
  if (!state.lastFailedCnpjs.length) {
    showMessage('Não há falhas pendentes para reprocessar.', true);
    return;
  }

  if (!window.confirm(`Reprocessar ${state.lastFailedCnpjs.length} CNPJ(s) que falharam`)) {
    return;
  }

  await runRefresh(state.lastFailedCnpjs);
}

function downloadFailuresCsv() {
  if (!state.lastFailures.length) return;
  const header = ['cnpj', 'mensagem', 'status'];
  const rows = state.lastFailures.map((f) => [
    String(f.cnpj || ''),
    String(f.mensagem || '').replace(/"/g, '""'),
    String(f.status || ''),
  ]);
  const csv = [
    header.join(';'),
    ...rows.map((r) => `"${r[0]}";"${r[1]}";"${r[2]}"`),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `falhas-cadastro-empresas-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function updateFileBadge(file) {
  const badge = document.getElementById('fileLoadedBadge');
  if (!badge) return;
  if (!file) {
    badge.textContent = 'Nenhum arquivo carregado.';
    badge.classList.remove('is-loaded');
    return;
  }
  badge.textContent = `Arquivo carregado: ${file.name}`;
  badge.classList.add('is-loaded');
}

function showMessage(message, isError) {
  const el = document.getElementById('importResult');
  if (!el) return;
  el.textContent = String(message || '');
  el.style.whiteSpace = 'pre-wrap';
  el.style.color = isError ? '#b91c1c' : '#166534';
}

function hydrateColumns() {
  state.visibleColumns = new Set(SELECTOR_COLUMN_DEFS.filter((column) => column.defaultVisible).map((column) => column.key));
  try {
    const raw = localStorage.getItem(COLUMN_PREFS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const valid = parsed.filter((key) => SELECTOR_COLUMN_DEFS.some((column) => column.key === key));
    if (valid.length > 0) state.visibleColumns = new Set(valid);
  } catch (_) {}
}

function persistColumns() {
  try {
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(Array.from(state.visibleColumns)));
  } catch (_) {}
}

function getVisibleColumnDefs() {
  return COLUMN_DEFS.filter((column) => state.visibleColumns.has(column.key));
}

function fillSelect(id, values, allLabel) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = String(el.value || '');
  const sorted = Array.from(new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  el.innerHTML = `<option value="">${esc(allLabel || 'Todos')}</option>${sorted.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}`;
  if (current && sorted.includes(current)) el.value = current;
}

function fillRegimeSelect(values) {
  const el = document.getElementById('filterRegime');
  if (!el) return;
  const current = String(el.value || '');
  const normalizedValues = Array.from(new Set(
    (values || [])
      .map((item) => normalizeRegimeLabel(item))
      .filter(Boolean)
  ));
  const merged = Array.from(new Set([...REGIME_MANUAL_OPTIONS, ...normalizedValues])).sort((a, b) => a.localeCompare(b));
  el.innerHTML = [
    '<option value="">Todos</option>',
    '<option value="__EMPTY__">Sem Regime Informado</option>',
    ...merged.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`),
  ].join('');
  if (current && Array.from(el.options).some((opt) => opt.value === current)) el.value = current;
}

function normalizeRegimeLabel(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function openRegimeEditModal(item) {
  const modal = document.getElementById('regimeEditModal');
  const title = document.getElementById('regimeEditTitle');
  const company = document.getElementById('regimeEditCompany');
  const select = document.getElementById('regimeManualSelect');
  const customWrap = document.getElementById('regimeManualCustomWrap');
  const customInput = document.getElementById('regimeManualCustom');
  if (!modal || !title || !company || !select || !customWrap || !customInput) return;

  const currentManual = normalizeRegimeLabel(item.regimeTributarioManual || '');
  const currentAuto = normalizeRegimeLabel(composeRegimeAtual(item) || '');
  const options = Array.from(new Set([...REGIME_MANUAL_OPTIONS, ...(currentAuto ? [currentAuto] : [])])).sort((a, b) => a.localeCompare(b));
  select.innerHTML = [
    '<option value="">Usar cálculo automático</option>',
    ...options.map((opt) => `<option value="${esc(opt)}">${esc(opt)}</option>`),
    '<option value="__CUSTOM__">Outro (digitar)</option>',
  ].join('');

  if (currentManual && options.includes(currentManual)) {
    select.value = currentManual;
    customInput.value = '';
  } else if (currentManual) {
    select.value = '__CUSTOM__';
    customInput.value = currentManual;
  } else {
    select.value = '';
    customInput.value = '';
  }

  title.textContent = 'Editar Regime Tributário';
  company.textContent = item.razaoSocial || item.cnpjFormatted || item.cnpj || '';
  state.editingRegimeCompanyId = Number(item.id);
  toggleRegimeCustomInput();
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

function toggleRegimeCustomInput() {
  const select = document.getElementById('regimeManualSelect');
  const customWrap = document.getElementById('regimeManualCustomWrap');
  const customInput = document.getElementById('regimeManualCustom');
  if (!select || !customWrap || !customInput) return;
  const showCustom = String(select.value || '') === '__CUSTOM__';
  customWrap.style.display = showCustom ? '' : 'none';
  customInput.required = showCustom;
  if (!showCustom) customInput.value = '';
}

function closeRegimeEditModal() {
  const modal = document.getElementById('regimeEditModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  state.editingRegimeCompanyId = null;
}

function fillCnaeSuggestions(cnaes) {
  const list = document.getElementById('cnaeSuggestions');
  if (!list) return;
  state.cnaeHints = Array.isArray(cnaes) ? cnaes : [];
  list.innerHTML = state.cnaeHints
    .slice(0, 800)
    .map((item) => `<option value="${esc(item.code)}">${esc(item.code)} - ${esc(item.description || '')}</option>`)
    .join('');
}

function resetFilters() {
  ['filterSearch', 'filterPartner', 'filterCnaes'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['filterCnaeMode', 'filterSituacao', 'filterUf', 'filterPorte', 'filterRegime', 'filterNaturezaJuridica', 'filterMunicipio'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const pageSize = document.getElementById('pageSize');
  if (pageSize) pageSize.value = '50';
  state.pageSize = 50;
}

function getInputValue(id) {
  const el = document.getElementById(id);
  return String(el.value || '').trim();
}

function buildFilterParams() {
  const params = new URLSearchParams();
  const search = getInputValue('filterSearch');
  const partner = getInputValue('filterPartner');
  const cnaes = getInputValue('filterCnaes');
  const cnaeMode = getInputValue('filterCnaeMode') || 'any';
  const situacao = getInputValue('filterSituacao');
  const uf = getInputValue('filterUf');
  const porte = getInputValue('filterPorte');
  const regime = getInputValue('filterRegime');
  const naturezaJuridica = getInputValue('filterNaturezaJuridica');
  const municipio = getInputValue('filterMunicipio');

  if (search) params.set('search', search);
  if (partner) params.set('partner', partner);
  if (cnaes) params.set('cnaes', cnaes);
  if (cnaeMode) params.set('cnaeMode', cnaeMode);
  if (situacao) params.set('situacao', situacao);
  if (uf) params.set('uf', uf);
  if (porte) params.set('porte', porte);
  if (regime) params.set('regime', regime);
  if (naturezaJuridica) params.set('naturezaJuridica', naturezaJuridica);
  if (municipio) params.set('municipio', municipio);
  return params;
}

function scheduleAutoFilter() {
  if (state.filtersAutoTimer) clearTimeout(state.filtersAutoTimer);
  state.filtersAutoTimer = setTimeout(() => {
    loadCompanies(1);
  }, 350);
}

async function exportFilteredToExcel() {
  try {
    const params = buildFilterParams();
    const qs = params.toString();
    const endpoint = qs
      ? `/api/cadastro-empresas-brasilapi/export.xlsx?${qs}`
      : '/api/cadastro-empresas-brasilapi/export.xlsx';

    const response = await AuthClient.authFetch(endpoint, { method: 'GET' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Erro ao exportar Excel.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `empresas-filtradas-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showMessage(error.message || 'Erro ao exportar Excel.', true);
  }
}

function extractCnpjsFromText(text) {
  const matches = String(text || '').match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
  const unique = new Set();
  for (const match of matches) {
    const digits = String(match).replace(/\D/g, '');
    if (digits.length === 14) unique.add(digits);
  }
  return Array.from(unique);
}

function composeCnaePrincipal(row) {
  const code = String(row.atividadePrincipalCodigo || '').trim();
  const description = String(row.atividadePrincipalDescricao || '').trim();
  if (!code && !description) return '';
  return `${code}${description ? ` - ${description}` : ''}`;
}

function composePhones(row) {
  const first = String(row.dddTelefone1 || '').trim();
  const second = String(row.dddTelefone2 || '').trim();
  if (first && second) return `${first} / ${second}`;
  return first || second || '';
}

function getRegimeHistory(row) {
  const raw = row?.rawResponse?.regime_tributario;
  const list = Array.isArray(raw) ? raw : [];
  const normalized = [];
  for (const item of list) {
    const ano = Number.isFinite(Number(item.ano)) ? Number(item.ano) : null;
    const formaDeTributacao = String(item.forma_de_tributacao || '').trim();
    const quantidadeDeEscrituracoes = Number.isFinite(Number(item.quantidade_de_escrituracoes))
      ? Number(item.quantidade_de_escrituracoes)
      : null;
    const cnpjDaScp = String(item.cnpj_da_scp || '').trim();
    if (ano === null && !formaDeTributacao && quantidadeDeEscrituracoes === null && !cnpjDaScp) continue;
    normalized.push({
      ano,
      formaDeTributacao,
      quantidadeDeEscrituracoes,
      cnpjDaScp,
    });
  }
  normalized.sort((a, b) => {
    const anoA = Number.isFinite(a.ano) ? a.ano : 0;
    const anoB = Number.isFinite(b.ano) ? b.ano : 0;
    if (anoA !== anoB) return anoB - anoA;
    const qtdA = Number.isFinite(a.quantidadeDeEscrituracoes) ? a.quantidadeDeEscrituracoes : 0;
    const qtdB = Number.isFinite(b.quantidadeDeEscrituracoes) ? b.quantidadeDeEscrituracoes : 0;
    return qtdB - qtdA;
  });
  return normalized;
}

function composeRegimeAtual(row) {
  const situacao = String(row.situacaoCadastral || '').trim().toUpperCase();
  const isBaixada = situacao === 'BAIXADA';
  const fromRow = normalizeRegimeLabel(row.regimeTributarioAtual || '');
  if (fromRow) return fromRow;

  if (row.opcaoMei === true) return 'SIMEI';
  if (row.opcaoSimples === true) return 'SIMPLES NACIONAL';

  const historico = getRegimeHistory(row);
  for (const item of historico) {
    if (item.formaDeTributacao) return item.formaDeTributacao;
  }
  if (isBaixada && row.dataExclusaoMei) return 'EXCLUIDA DO SIMEI';
  if (isBaixada && row.dataExclusaoSimples) return 'EXCLUIDA DO SIMPLES NACIONAL';
  return '';
}

function formatCnae(cnae) {
  const code = String(cnae.code || '').trim();
  const description = String(cnae.description || '').trim();
  if (!code && !description) return '-';
  return `${code}${description ? ` - ${description}` : ''}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

function formatDateOnly(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('pt-BR');
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

