/* global AuthClient, inicializarSidebar */

(function () {
  const API_BASE = '/api/cct';
  const RESULTS_PER_PAGE = 50;
  const STATUS_LABELS = {
    vigente: 'Vigente',
    'nao-vigente': 'Nao vigente',
    desconhecida: 'Vigencia nao identificada',
  };
  const HISTORY_FULL_LIMIT = 10;

  const state = {
    items: [],
    selectedId: null,
    detailItem: null,
    historyModal: {
      open: false,
      items: [],
      loading: false,
      page: 1,
      totalPages: 0,
      totalItems: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    },
    pagination: {
      page: 1,
      perPage: RESULTS_PER_PAGE,
      totalFiltrados: 0,
      totalPages: 0,
      hasPreviousPage: false,
      hasNextPage: false,
      startIndex: 0,
      endIndex: 0,
    },
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizePlainText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatClauseOrdinal(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';

    if (/^\d+$/.test(raw)) {
      return `${raw}\u00AA`;
    }

    if (/\d/.test(raw)) {
      return raw;
    }

    const ordinalMap = {
      primeira: 1,
      segunda: 2,
      terceira: 3,
      quarta: 4,
      quinta: 5,
      sexta: 6,
      setima: 7,
      oitava: 8,
      nona: 9,
      decima: 10,
      vigesima: 20,
      trigesima: 30,
      quadragesima: 40,
      quinquagesima: 50,
    };

    const total = normalizePlainText(raw)
      .split(' ')
      .reduce((sum, token) => sum + (ordinalMap[token] || 0), 0);

    return total ? `${total}\u00AA` : raw;
  }

  function safeJson(response) {
    return response.json().catch(() => null);
  }

  function setFeedback(message) {
    const feedback = $('cctFeedback');
    if (feedback) feedback.textContent = message || '';
  }

  function setRequestFeedback(message) {
    const feedback = $('cctRequestFeedback');
    if (feedback) feedback.textContent = message || '';
  }

  function normalizeCnpjDigits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function formatHistoryLabel(status) {
    const map = {
      'download realizado': 'Download realizado',
      'não retornou nenhuma convenção': 'Nao retornou nenhuma convencao',
      'erro na busca': 'Erro na busca',
    };
    return map[String(status || '').trim().toLowerCase()] || String(status || '-');
  }

  function formatHistoryTimestamp(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return String(timestamp);
    return date.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  function updateHistoryButtonLabel() {
    const button = $('btnCctHistorico');
    if (!button) return;
    button.textContent = 'Historico completo';
  }

  function renderRequestHistoryLegacy() {
    const panel = $('cctHistoryPanel');
    const list = $('cctHistoryList');
    if (!panel || !list) return;

    updateHistoryButtonLabel();

    if (state.historyLoading) {
      list.innerHTML = '<div class="cct-empty">Carregando historico...</div>';
      return;
    }

    if (!state.historyItems.length) {
      list.innerHTML = '<div class="cct-empty">Nenhum registro de historico encontrado.</div>';
      return;
    }

    list.innerHTML = state.historyItems.map((item) => `
      <article class="cct-history-item">
        <strong>${escapeHtml(item.label || item.status || '-')}</strong>
        <small>${escapeHtml(item.cnpj || '-')} • ${escapeHtml(formatHistoryTimestamp(item.timestamp))}</small>
        ${item.user ? `<em>${escapeHtml(item.user)}</em>` : ''}
        <p>${escapeHtml(item.details || item.raw || '')}</p>
      </article>
    `).join('');
  }

  function renderHistoryLine(item) {
    const label = item?.label || item?.status || '-';
    const when = formatHistoryTimestamp(item?.timestamp || '');
    const cnpj = item?.cnpj || '-';
    const user = item?.user || 'usuario-desconhecido';
    const details = String(item?.details || '').trim();
    const tail = details ? ` | ${details}` : '';
    return `${when} | ${cnpj} | ${label} | ${user}${tail}`;
  }

  function renderRequestHistory() {
    const list = $('cctHistoryList');
    if (!list) return;

    if (state.historyLoading) {
      list.innerHTML = '<div class="cct-empty">Carregando historico...</div>';
      return;
    }

    if (!state.historyItems.length) {
      list.innerHTML = '<div class="cct-empty">Nenhum registro de historico encontrado.</div>';
      return;
    }

    list.innerHTML = state.historyItems
      .map((item) => `<div class="cct-history-line" title="${escapeHtml(renderHistoryLine(item))}">${escapeHtml(renderHistoryLine(item))}</div>`)
      .join('');
  }

  function setHistoryModalOpen(open) {
    const modal = $('cctHistoryModal');
    if (!modal) return;
    state.historyModal.open = !!open;
    modal.hidden = !state.historyModal.open;
  }

  function renderHistoryModal() {
    const list = $('cctHistoryModalList');
    const info = $('cctHistoryModalInfo');
    const prev = $('btnCctHistoryPrev');
    const next = $('btnCctHistoryNext');
    if (!list || !info || !prev || !next) return;

    if (state.historyModal.loading) {
      list.innerHTML = '<div class="cct-empty">Carregando historico completo...</div>';
      info.textContent = 'Carregando...';
      prev.hidden = true;
      next.hidden = true;
      return;
    }

    if (!state.historyModal.items.length) {
      list.innerHTML = '<div class="cct-empty">Nenhum registro de historico encontrado.</div>';
    } else {
      list.innerHTML = state.historyModal.items
        .map((item) => `<div class="cct-history-line" title="${escapeHtml(renderHistoryLine(item))}">${escapeHtml(renderHistoryLine(item))}</div>`)
        .join('');
    }

    const total = Number(state.historyModal.totalItems || 0);
    const page = Number(state.historyModal.page || 1);
    const totalPages = Number(state.historyModal.totalPages || 0);
    info.textContent = total
      ? `Mostrando pagina ${page} de ${totalPages}. Total: ${total}.`
      : 'Sem registros para exibir.';

    prev.hidden = !state.historyModal.hasPreviousPage;
    next.hidden = !state.historyModal.hasNextPage;
  }

  function updatePaginationControls() {
    const prevButtons = [
      $('btnCctPrevPageTop'),
      $('btnCctPrevPageBottom'),
    ].filter(Boolean);
    const nextButtons = [
      $('btnCctNextPageTop'),
      $('btnCctNextPageBottom'),
    ].filter(Boolean);
    const infoItems = [
      $('cctResultsInfo'),
      $('cctPaginationInfo'),
    ].filter(Boolean);
    const pagination = state.pagination || {};
    const totalFiltrados = Number(pagination.totalFiltrados || 0);
    const page = Number(pagination.page || 1);
    const totalPages = Number(pagination.totalPages || 0);
    const startIndex = Number(pagination.startIndex || 0);
    const endIndex = Number(pagination.endIndex || 0);

    prevButtons.forEach((button) => {
      button.hidden = !pagination.hasPreviousPage;
    });

    nextButtons.forEach((button) => {
      button.hidden = !pagination.hasNextPage;
    });

    const summary = !totalFiltrados
      ? 'Nenhuma convencao nesta busca.'
      : `Mostrando ${startIndex} a ${endIndex} de ${totalFiltrados} convenios. Pagina ${page} de ${totalPages || 1}.`;

    infoItems.forEach((item) => {
      item.textContent = summary;
    });
  }

  function formatPaginationSummary() {
    const pagination = state.pagination || {};
    const totalFiltrados = Number(pagination.totalFiltrados || state.items.length || 0);
    const page = Number(pagination.page || 1);
    const totalPages = Number(pagination.totalPages || 0);
    const startIndex = Number(pagination.startIndex || 0);
    const endIndex = Number(pagination.endIndex || 0);

    if (!totalFiltrados) {
      return 'Nenhuma convencao nesta busca.';
    }

    return `Mostrando ${startIndex || 1} a ${endIndex || totalFiltrados} de ${totalFiltrados} convenios. Pagina ${page} de ${totalPages || 1}.`;
  }

  function getFormFilters() {
    return {
      nome: $('filtroNome')?.value?.trim() || '',
      vigencia: $('filtroVigencia')?.value || 'todos',
      dataBaseMes: $('filtroDataBaseMes')?.value || '',
      abrangencia: $('filtroAbrangencia')?.value?.trim() || '',
      abrangenciaTerritorial: $('filtroAbrangenciaTerritorial')?.value?.trim() || '',
    };
  }

  function buildQuery(filters) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }

  function formatStatus(item) {
    const raw = String(item?.vigenciaStatus || '').trim();
    return STATUS_LABELS[raw] || 'Status indisponivel';
  }

  function formatPrazo(prazo) {
    const data = String(prazo?.data || '').trim();
    const clausula = String(prazo?.clausula || '').trim();
    if (data && clausula) return `${data} (${clausula})`;
    return data || clausula || '-';
  }

  function makeClauseId(clause, index) {
    const raw = String(clause?.numero || clause?.titulo || index + 1)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `cct-clause-${raw || index + 1}`;
  }

  function scrollBelowTopbar(element) {
    if (!element) return;
    const topbar = document.querySelector('.app-topbar');
    const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 70;
    const margin = 12;
    const targetTop = window.scrollY + element.getBoundingClientRect().top - topbarHeight - margin;
    window.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
  }

  function getActiveDetail(itemId) {
    if (state.detailItem && state.detailItem.id === itemId) {
      return state.detailItem;
    }
    return null;
  }

  function toggleDetail(id) {
    if (!id) return;

    if (state.selectedId === id && state.detailItem?.id === id) {
      state.selectedId = null;
      state.detailItem = null;
      renderResults();
      setFeedback('Convencao fechada.');
      return;
    }

    loadDetail(id);
  }

  function renderResults() {
    const results = $('cctResults');
    const info = $('cctResultsInfo');
    if (!results || !info) return;

    if (!state.items.length) {
      info.textContent = 'Nenhuma convencao encontrada para os filtros atuais.';
      results.innerHTML = '<div class="cct-empty">Nenhuma convencao localizada. Ajuste os filtros e pesquise novamente.</div>';
      updatePaginationControls();
      return;
    }

    const pagination = state.pagination || {};
    const totalFiltrados = Number(pagination.totalFiltrados || state.items.length);
    if (totalFiltrados > 0) {
      info.textContent = formatPaginationSummary();
    } else {
      info.textContent = 'Nenhuma convencao encontrada para os filtros atuais.';
    }
    results.innerHTML = state.items.map((item) => {
      const activeClass = item.id === state.selectedId ? ' active' : '';
      const statusClass = item.vigenciaStatus === 'vigente'
        ? 'cct-status-vigente'
        : item.vigenciaStatus === 'nao-vigente'
          ? 'cct-status-nao-vigente'
          : '';
      const sindicatos = Array.isArray(item.sindicatosCelebrantes)
        ? item.sindicatosCelebrantes
          .map((entry) => entry?.nome)
          .filter(Boolean)
          .slice(0, 2)
          .join(' | ')
        : '';
      const statusText = formatStatus(item);
      const cardDescription = sindicatos || item.abrangencia || 'Sem descricao adicional.';
      const metaTags = [
        { value: `${Number(item.quantidadeClausulas || 0)} clausulas`, title: `Numero de clausulas: ${Number(item.quantidadeClausulas || 0)}` },
        { value: item.numeroSolicitacao || 'Sem solicitacao', title: `Solicitacao: ${item.numeroSolicitacao || 'Sem solicitacao'}` },
        { value: statusText, title: `Situacao: ${statusText}`, className: statusClass },
        { value: item.abrangenciaTerritorial || 'Sem territorio', title: `Abrangencia territorial: ${item.abrangenciaTerritorial || 'Sem territorio'}`, className: 'cct-tag-territorial' },
      ];
      const detail = getActiveDetail(item.id);
      const detailHtml = detail ? renderInlineDetail(detail) : '';
      return `
        <article class="cct-card${activeClass}" data-cct-item="${escapeHtml(item.id)}">
          <div class="cct-card-main" data-action="select" data-id="${escapeHtml(item.id)}">
            <div>
              <h3 class="cct-card-title">${escapeHtml(item.nome || 'Convencao sem nome')}</h3>
              <div class="cct-card-tags cct-card-tags-top">
                ${metaTags.map((tag, index) => `
                  <span class="cct-card-tag${tag.className ? ` ${tag.className}` : ''}" title="${escapeHtml(tag.title)}">${escapeHtml(tag.value)}</span>
                `).join('')}
              </div>
              <p class="cct-card-description" title="${escapeHtml(cardDescription)}">${escapeHtml(cardDescription)}</p>
            </div>
          </div>
          ${detailHtml}
        </article>
      `;
    }).join('');

    results.querySelectorAll('[data-action="select"]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-id');
        if (!id) return;
        toggleDetail(id);
      });
    });

    results.querySelectorAll('.cct-sumario-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const target = targetId ? document.getElementById(targetId) : null;
        if (target) {
          scrollBelowTopbar(target);
        }
      });
    });

    setupExpandableBoxes();
    updatePaginationControls();
  }

  function renderInlineDetail(item) {
    const sumarioItems = Array.isArray(item.sumarioClausulas) ? item.sumarioClausulas : [];
    const clauseItems = Array.isArray(item.clausulas) ? item.clausulas : [];
    const hasDownload = !!item.downloadDisponivel;
    const sumarioMarkup = sumarioItems.length
      ? sumarioItems.map((clause, index) => `
          <button type="button" class="cct-sumario-item" data-target="${escapeHtml(makeClauseId(clause, index))}">
            <span>${escapeHtml(formatClauseOrdinal(clause.numero || '-'))}</span>
            <strong>${escapeHtml(clause.titulo || 'Sem titulo')}</strong>
          </button>
        `).join('')
      : '<div class="cct-empty">Nenhuma clausula encontrada.</div>';

    const clausesMarkup = clauseItems.length
      ? clauseItems.map((clause, index) => `
          <article class="cct-clause-card" id="${escapeHtml(makeClauseId(clause, index))}">
            <h3>${escapeHtml(formatClauseOrdinal(clause.numero || '-'))} - ${escapeHtml(clause.titulo || 'Sem titulo')}</h3>
            <p>${escapeHtml(clause.resumo || clause.texto || 'Sem resumo disponivel.')}</p>
          </article>
        `).join('')
      : '<div class="cct-empty">Nenhuma clausula resumida disponivel para esta convencao.</div>';

    return `
      <div class="cct-inline-detail">
        <div class="cct-detail-header cct-detail-header-actions">
          <a class="cct-download-link${hasDownload ? '' : ' disabled'}" href="${hasDownload ? `${API_BASE}/${encodeURIComponent(item.id)}/download` : '#'}"${hasDownload ? ` download="${escapeHtml(item.downloadFileName || '')}"` : ' aria-disabled="true"'}>Baixar convencao completa</a>
        </div>

        <div class="cct-detail-grid">
          ${renderDetailBox('Registro', item.dataRegistroMte || '-', false)}
          ${renderDetailBox('Prazo para oposição', formatPrazo(item.prazoOposicao), true)}
          ${renderDetailBox('Periodo', `${item.vigencia || '-'}\nData-base: ${item.dataBase || '-'}`, false)}
          ${renderDetailBox('O que cobre', item.abrangencia || '-', true)}
          ${renderDetailBox('Onde vale', item.abrangenciaTerritorial || '-', true)}
        </div>

        <div class="cct-sumario">
          <div class="cct-results-header">
            <div>
              <h2>Resumo rapido</h2>
              <p>Clique em um item para ir direto ao trecho correspondente.</p>
            </div>
          </div>
          <div class="cct-sumario-card">
            <div class="cct-sumario-grid">
              ${sumarioMarkup}
            </div>
          </div>
        </div>

        <div>
          <div class="cct-results-header">
            <div>
              <h2>Trechos resumidos</h2>
              <p>Resumos curtos para leitura rapida.</p>
            </div>
          </div>
          <div class="cct-clause-grid">
            ${clausesMarkup}
          </div>
        </div>
      </div>
    `;
  }

  function renderDetailBox(title, content, expandable) {
    const safeId = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const text = String(content || '-').replace(/\n/g, '<br>');
    return `
      <div class="cct-detail-box${expandable ? ' cct-detail-box-expandable' : ''}" data-expandable="${expandable ? '1' : '0'}">
        <strong>${escapeHtml(title)}</strong>
        <div class="cct-detail-copy">
          <div class="cct-detail-text" id="box-${safeId}">${text}</div>
        </div>
        ${expandable ? '<button type="button" class="cct-more-btn" hidden>Ver mais</button>' : ''}
      </div>
    `;
  }

  function setupExpandableBoxes() {
    document.querySelectorAll('.cct-detail-box[data-expandable="1"]').forEach((box) => {
      const text = box.querySelector('.cct-detail-text');
      const btn = box.querySelector('.cct-more-btn');
      if (!text || !btn) return;

      const needsMore = text.scrollHeight > text.clientHeight + 2;
      btn.hidden = !needsMore;
      btn.textContent = 'Ver mais';

      if (!needsMore) {
        box.classList.remove('expanded');
        return;
      }

      btn.onclick = () => {
        const expanded = box.classList.toggle('expanded');
        btn.textContent = expanded ? 'Ver menos' : 'Ver mais';
      };
    });
  }

  function updateBackToTopButton() {
    const button = $('cctScrollTop');
    if (!button) return;
    button.hidden = window.scrollY < 220;
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function scrollToResultsSection() {
    const anchor = document.querySelector('[data-cct-results-anchor="1"]');
    if (anchor) {
      scrollBelowTopbar(anchor);
    }
  }

  async function loadResults(page = 1, options = {}) {
    const filters = getFormFilters();
    const query = buildQuery({
      ...filters,
      page,
      limit: RESULTS_PER_PAGE,
    });
    setFeedback('Carregando convenções...');

    try {
      const response = await AuthClient.authFetch(`${API_BASE}${query ? `?${query}` : ''}`, { method: 'GET' });
      const data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao consultar convencoes.');
      }

      state.items = Array.isArray(data.items) ? data.items : [];
      const source = String(data?.meta?.source || '').trim().toLowerCase();
      const sourceLabel = source === 'database' ? 'banco de dados' : 'arquivos da pasta';
      const meta = data.meta || {};
      state.pagination = {
        page: Number(meta.page || page || 1),
        perPage: Number(meta.perPage || RESULTS_PER_PAGE),
        totalFiltrados: Number(meta.totalFiltrados || 0),
        totalPages: Number(meta.totalPages || 0),
        hasPreviousPage: !!meta.hasPreviousPage,
        hasNextPage: !!meta.hasNextPage,
        startIndex: Number(meta.startIndex || 0),
        endIndex: Number(meta.endIndex || 0),
      };
      renderResults();

      const warnings = Array.isArray(data.meta?.warnings) ? data.meta.warnings : [];
      if (!state.items.length && warnings.length) {
        setFeedback(warnings[0]);
      } else if (warnings.length) {
        setFeedback(`Consulta atualizada. ${warnings.length} aviso(s) de leitura foram detectados.`);
      } else {
        setFeedback(`Consulta atualizada automaticamente a partir do ${sourceLabel}.`);
      }

      if (state.selectedId) {
        const stillExists = state.items.some((item) => item.id === state.selectedId);
        if (!stillExists) {
          state.selectedId = null;
          state.detailItem = null;
        }
      }
    } catch (error) {
      console.error(error);
      state.items = [];
      state.pagination = {
        page: 1,
        perPage: RESULTS_PER_PAGE,
        totalFiltrados: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
        startIndex: 0,
        endIndex: 0,
      };
      renderResults();
      state.detailItem = null;
      setFeedback(error.message || 'Erro ao carregar convencoes.');
    }

    if (options.scrollToResults) {
      scrollToResultsSection();
    }
  }

  async function loadDetail(id) {
    if (!id) return;
    state.selectedId = id;
    state.detailItem = null;
    renderResults();
    setFeedback('Carregando a convencao...');

    try {
      const response = await AuthClient.authFetch(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'GET' });
      const data = await safeJson(response);
      if (!response.ok || !data?.ok || !data.item) {
        throw new Error(data?.error || 'Falha ao carregar a convencao selecionada.');
      }

      state.detailItem = data.item;
      renderResults();
      const card = document.querySelector(`[data-cct-item="${CSS.escape(id)}"]`);
      if (card) {
        scrollBelowTopbar(card);
      }
      setFeedback('Convencao carregada.');
    } catch (error) {
      console.error(error);
      state.detailItem = null;
      setFeedback(error.message || 'Erro ao carregar detalhes da convencao.');
    }
  }

  async function loadRequestHistory() {
    state.historyLoading = true;
    renderRequestHistory();

    try {
      const response = await AuthClient.authFetch(`${API_BASE}/historico?scope=recent`, { method: 'GET' });
      const data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao carregar o historico.');
      }

      state.historyItems = Array.isArray(data.items) ? data.items : [];
      state.historyMeta = data.meta || state.historyMeta;
      state.historyLoading = false;
      renderRequestHistory();
      return state.historyItems;
    } catch (error) {
      console.error(error);
      state.historyLoading = false;
      state.historyItems = [];
      state.historyMeta = {
        scope: 'recent',
        runId: '',
        totalItems: 0,
        page: 1,
        perPage: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      };
      renderRequestHistory();
      setRequestFeedback(error.message || 'Erro ao carregar historico.');
      return [];
    }
  }

  async function loadFullHistoryPage(page = 1) {
    state.historyModal.loading = true;
    renderHistoryModal();

    try {
      const safePage = Math.max(1, Number(page || 1));
      const response = await AuthClient.authFetch(`${API_BASE}/historico?scope=full&page=${safePage}&limit=${HISTORY_FULL_LIMIT}`, { method: 'GET' });
      const data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao carregar o historico completo.');
      }

      const meta = data.meta || {};
      state.historyModal.items = Array.isArray(data.items) ? data.items : [];
      state.historyModal.loading = false;
      state.historyModal.page = Number(meta.page || safePage || 1);
      state.historyModal.totalPages = Number(meta.totalPages || 0);
      state.historyModal.totalItems = Number(meta.totalItems || 0);
      state.historyModal.hasPreviousPage = !!meta.hasPreviousPage;
      state.historyModal.hasNextPage = !!meta.hasNextPage;
      renderHistoryModal();
      return state.historyModal.items;
    } catch (error) {
      console.error(error);
      state.historyModal.items = [];
      state.historyModal.loading = false;
      state.historyModal.page = 1;
      state.historyModal.totalPages = 0;
      state.historyModal.totalItems = 0;
      state.historyModal.hasPreviousPage = false;
      state.historyModal.hasNextPage = false;
      renderHistoryModal();
      setRequestFeedback(error.message || 'Erro ao carregar historico completo.');
      return [];
    }
  }

  async function openFullHistoryModal() {
    setHistoryModalOpen(true);
    await loadFullHistoryPage(1);
  }

  function closeFullHistoryModal() {
    setHistoryModalOpen(false);
  }

  async function submitCnpjRequest(event) {
    if (event) event.preventDefault();

    const input = $('cctRequestCnpj');
    const rawValue = String(input?.value || '').trim();
    const cnpj = normalizeCnpjDigits(rawValue);

    if (cnpj.length !== 14) {
      setRequestFeedback('Digite um CNPJ valido com 14 digitos.');
      input?.focus();
      return;
    }

    setRequestFeedback('Incluindo CNPJ na fila...');

    try {
      const response = await AuthClient.authFetch(`${API_BASE}/requisicoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cnpj }),
      });
      const data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao incluir CNPJ.');
      }

      if (data.duplicate) {
        setRequestFeedback(data.message || 'CNPJ ja existe na lista.');
      } else {
        setRequestFeedback(data.message || 'CNPJ incluido na fila.');
        if (input) input.value = '';
      }

      await loadRequestHistory();
      if (state.historyModal.open) {
        await loadFullHistoryPage(state.historyModal.page || 1);
      }
    } catch (error) {
      console.error(error);
      setRequestFeedback(error.message || 'Erro ao incluir CNPJ.');
    }
  }

  function resetFilters() {
    $('cctFilterForm')?.reset();
    state.selectedId = null;
    state.detailItem = null;
    loadResults(1);
  }

  async function boot() {
    if (typeof inicializarSidebar === 'function') {
      await inicializarSidebar('cct');
    }

    $('cctFilterForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      loadResults(1);
    });

    $('btnLimparFiltrosCct')?.addEventListener('click', () => {
      resetFilters();
    });

    $('cctRequestForm')?.addEventListener('submit', submitCnpjRequest);

    $('btnCctHistorico')?.addEventListener('click', () => {
      openFullHistoryModal();
    });

    $('btnCctHistoryClose')?.addEventListener('click', () => {
      closeFullHistoryModal();
    });

    $('cctHistoryModal')?.addEventListener('click', (event) => {
      if (event.target && event.target.id === 'cctHistoryModal') {
        closeFullHistoryModal();
      }
    });

    $('btnCctHistoryPrev')?.addEventListener('click', () => {
      const page = Number(state.historyModal.page || 1);
      if (page > 1) {
        loadFullHistoryPage(page - 1);
      }
    });

    $('btnCctHistoryNext')?.addEventListener('click', () => {
      const page = Number(state.historyModal.page || 1);
      const totalPages = Number(state.historyModal.totalPages || 0);
      if (totalPages && page < totalPages) {
        loadFullHistoryPage(page + 1);
      }
    });

    $('btnCctPrevPageTop')?.addEventListener('click', () => {
      const currentPage = Number(state.pagination?.page || 1);
      if (currentPage > 1) {
        loadResults(currentPage - 1, { scrollToResults: true });
      }
    });

    $('btnCctPrevPageBottom')?.addEventListener('click', () => {
      const currentPage = Number(state.pagination?.page || 1);
      if (currentPage > 1) {
        loadResults(currentPage - 1, { scrollToResults: true });
      }
    });

    $('btnCctNextPageTop')?.addEventListener('click', () => {
      const currentPage = Number(state.pagination?.page || 1);
      const totalPages = Number(state.pagination?.totalPages || 0);
      if (totalPages && currentPage < totalPages) {
        loadResults(currentPage + 1, { scrollToResults: true });
      }
    });

    $('btnCctNextPageBottom')?.addEventListener('click', () => {
      const currentPage = Number(state.pagination?.page || 1);
      const totalPages = Number(state.pagination?.totalPages || 0);
      if (totalPages && currentPage < totalPages) {
        loadResults(currentPage + 1, { scrollToResults: true });
      }
    });

    $('cctScrollTop')?.addEventListener('click', () => {
      scrollToTop();
    });

    window.addEventListener('scroll', updateBackToTopButton, { passive: true });

    await loadResults(1);
    await loadRequestHistory();
    renderHistoryModal();
    updateBackToTopButton();
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
