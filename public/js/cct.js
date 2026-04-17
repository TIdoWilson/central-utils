/* global AuthClient, inicializarSidebar */

(function () {
  const API_BASE = '/api/cct';
  const RESULTS_PER_PAGE = 50;
  const HISTORY_FULL_LIMIT = 10;
  const CCT_BUILD = '20260417-8';

  const state = {
    items: [],
    selectedId: null,
    detailItem: null,
    detailLoading: false,
    detailError: '',
    detailRequestSeq: 0,
    listRequestSeq: 0,
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
    debug: {
      lines: [],
    },
    requestInFlight: false,
  };
  let hasBooted = false;
  const handledSubmitEvents = new WeakSet();

  function $(id) {
    return document.getElementById(id);
  }

  function resolveRequestForm(explicitForm, event) {
    if (explicitForm && explicitForm.tagName === 'FORM') return explicitForm;

    const eventTarget = event?.currentTarget || event?.target || null;
    if (eventTarget?.tagName === 'FORM') return eventTarget;
    if (eventTarget?.form?.tagName === 'FORM') return eventTarget.form;

    return $('cctRequestForm');
  }

  function resolveRequestInput(form) {
    const formInput = form?.elements?.namedItem?.('cnpj');
    if (formInput && typeof formInput.value === 'string') return formInput;
    return $('cctRequestCnpj');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeCnpjDigits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function safeJson(response) {
    return response.json().catch(() => null);
  }

  function setFeedback(message) {
    const el = $('cctFeedback');
    if (el) el.textContent = message || '';
  }

  function setRequestFeedback(message) {
    const el = $('cctRequestFeedback');
    if (el) el.textContent = message || '';
  }

  function formatDebugObject(payload) {
    if (!payload || typeof payload !== 'object') return '';
    try {
      const text = JSON.stringify(payload);
      if (text.length <= 320) return text;
      return `${text.slice(0, 317)}...`;
    } catch (_) {
      return '';
    }
  }

  function renderDebugLog() {
    return;
  }

  function addDebugLog() {
    return;
  }

  function clearDebugLog() {
    state.debug.lines = [];
  }


  function ensureRenderMounts() {
    let results = $('cctResults');
    let detailMount = $('cctDetailMount');

    if (results && detailMount) {
      return { results, detailMount, healed: false };
    }

    const card = document.querySelector('.cct-results-card');
    if (!card) {
      return { results: null, detailMount: null, healed: false };
    }

    const footer = card.querySelector('.cct-results-footer');

    if (!results) {
      results = document.createElement('div');
      results.id = 'cctResults';
      results.className = 'cct-results-grid';
      card.insertBefore(results, footer || null);
    }

    if (!detailMount) {
      detailMount = document.createElement('div');
      detailMount.id = 'cctDetailMount';
      card.insertBefore(detailMount, footer || null);
    }

    return { results, detailMount, healed: true };
  }

  function formatHistoryTimestamp(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return String(timestamp);
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function formatHistoryLabel(status) {
    const map = {
      'pedido recebido': 'Pedido recebido',
      'download realizado': 'Download realizado',
      'nao retornou nenhuma convencao': 'Nao retornou nenhuma convencao',
      'erro na busca': 'Erro na busca',
    };
    return map[normalizeText(status)] || String(status || '-');
  }

  function formatClauseOrdinal(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    if (/^\d+$/.test(raw)) return `${raw}\u00AA`;
    return raw;
  }

  function buildQuery(filters) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
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

  function buildPaginationSummary() {
    const pagination = state.pagination || {};
    const totalFiltrados = Number(pagination.totalFiltrados || 0);
    const page = Number(pagination.page || 1);
    const totalPages = Number(pagination.totalPages || 0);
    const startIndex = Number(pagination.startIndex || 0);
    const endIndex = Number(pagination.endIndex || 0);
    if (!totalFiltrados) {
      return 'Nenhuma convencao nesta busca.';
    }
    return `Mostrando ${startIndex || 1} a ${endIndex || totalFiltrados} de ${totalFiltrados} convencoes. Pagina ${page} de ${totalPages || 1}.`;
  }

  function writePaginationSummary(summary) {
    const topInfo = $('cctResultsInfo');
    const bottomInfo = $('cctPaginationInfo');
    if (topInfo) topInfo.textContent = summary;
    if (bottomInfo) bottomInfo.textContent = summary;
  }

  function updatePaginationControls() {
    const prevButtons = [$('#btnCctPrevPageTop'), $('#btnCctPrevPageBottom')].filter(Boolean);
    const nextButtons = [$('#btnCctNextPageTop'), $('#btnCctNextPageBottom')].filter(Boolean);
    const pagination = state.pagination || {};

    const hasPreviousPage = !!pagination.hasPreviousPage;
    const hasNextPage = !!pagination.hasNextPage;

    prevButtons.forEach((button) => {
      button.hidden = false;
      button.disabled = !hasPreviousPage;
      button.style.opacity = hasPreviousPage ? '1' : '0.55';
      button.style.pointerEvents = hasPreviousPage ? 'auto' : 'none';
    });
    nextButtons.forEach((button) => {
      button.hidden = false;
      button.disabled = !hasNextPage;
      button.style.opacity = hasNextPage ? '1' : '0.55';
      button.style.pointerEvents = hasNextPage ? 'auto' : 'none';
    });

    const summary = buildPaginationSummary();
    writePaginationSummary(summary);
  }

  function syncPaginationUiSoon() {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => updatePaginationControls());
    } else {
      setTimeout(updatePaginationControls, 0);
    }
    setTimeout(updatePaginationControls, 120);
  }

  function hydrateUiFromState() {
    const totalFiltrados = Number(state.pagination?.totalFiltrados || 0);
    if (totalFiltrados > 0) {
      writePaginationSummary(buildPaginationSummary());
      const feedback = $('cctFeedback');
      if (feedback && /carregando/i.test(String(feedback.textContent || ''))) {
        feedback.textContent = 'Consulta atualizada automaticamente.';
      }
    }
    updatePaginationControls();
  }

  function startUiWatchdog() {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      hydrateUiFromState();
      if (ticks >= 20) {
        clearInterval(timer);
      }
    }, 1000);
  }

  function getTopbarHeight() {
    const topbar = document.querySelector('.app-topbar, .topbar');
    if (!topbar) return 70;
    const value = Number(topbar.getBoundingClientRect().height || 0);
    return value > 0 ? value : 70;
  }

  function scrollBelowTopbar(element, extraOffset = 12) {
    if (!element) return;
    const topbarHeight = getTopbarHeight();
    const targetTop = window.scrollY + element.getBoundingClientRect().top - topbarHeight - Number(extraOffset || 0);
    window.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
  }

  function scrollToResultsSection() {
    const anchor = document.querySelector('[data-cct-results-anchor="1"]');
    if (anchor) scrollBelowTopbar(anchor, 8);
  }

  function scrollToPageTop() {
    const target = document.querySelector('.nfe-main .nfe-header') || document.querySelector('.nfe-main');
    if (target) {
      scrollBelowTopbar(target, 8);
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  function renderCard(item) {
    const activeClass = item.id === state.selectedId ? ' active' : '';
    const statusClass = item.vigenciaStatus === 'vigente'
      ? 'cct-status-vigente'
      : item.vigenciaStatus === 'nao-vigente'
        ? 'cct-status-nao-vigente'
        : '';
    const sindicatos = Array.isArray(item.sindicatosCelebrantes)
      ? item.sindicatosCelebrantes.map((entry) => entry?.nome).filter(Boolean).slice(0, 2).join(' | ')
      : '';
    const description = sindicatos || item.abrangencia || 'Sem descricao adicional.';
    const tags = [
      { value: `${Number(item.quantidadeClausulas || 0)} clausulas`, title: `Numero de clausulas: ${Number(item.quantidadeClausulas || 0)}` },
      { value: item.numeroSolicitacao || 'Sem solicitacao', title: `Solicitacao: ${item.numeroSolicitacao || 'Sem solicitacao'}` },
      { value: item.vigenciaStatus === 'vigente' ? 'Vigente' : item.vigenciaStatus === 'nao-vigente' ? 'Nao vigente' : 'Status indisponivel', title: `Situacao: ${item.vigenciaStatus || '-'}`, className: statusClass },
      { value: item.abrangenciaTerritorial || 'Sem territorio', title: `Abrangencia territorial: ${item.abrangenciaTerritorial || 'Sem territorio'}` },
    ];

    return `
      <article class="cct-card${activeClass}" data-cct-item="${escapeHtml(item.id)}">
        <button type="button" class="cct-card-main" data-action="select" data-id="${escapeHtml(item.id)}">
          <div>
            <h3 class="cct-card-title">${escapeHtml(item.nome || 'Convencao sem nome')}</h3>
            <div class="cct-card-tags">
              ${tags.map((tag) => `<span class="cct-card-tag${tag.className ? ` ${tag.className}` : ''}" title="${escapeHtml(tag.title)}">${escapeHtml(tag.value)}</span>`).join('')}
            </div>
          </div>
          <p class="cct-card-description" title="${escapeHtml(description)}">${escapeHtml(description)}</p>
        </button>
      </article>
    `;
  }

  function renderDetailBox(title, content) {
    const safeContent = escapeHtml(String(content || '-')).replace(/\n/g, '<br>');
    return `
      <div class="cct-detail-box">
        <strong>${escapeHtml(title)}</strong>
        <span class="cct-detail-box-text">${safeContent}</span>
        <button type="button" class="cct-detail-box-toggle" hidden>Ver mais</button>
      </div>
    `;
  }

  function renderDetailPanel(item) {
    const clauses = Array.isArray(item.clausulas) ? item.clausulas : [];
    const summary = Array.isArray(item.sumarioClausulas) ? item.sumarioClausulas : [];
    const hasDownload = !!item.downloadDisponivel;
    const summaryMarkup = summary.length
      ? summary.map((clause, index) => `
          <button type="button" class="cct-sumario-item" data-target="${escapeHtml(makeClauseId(clause, index))}">
            <span>${escapeHtml(formatClauseOrdinal(clause.numero || `${index + 1}`))}</span>
            <strong>${escapeHtml(clause.titulo || 'Sem titulo')}</strong>
          </button>
        `).join('')
      : '<div class="cct-empty">Nenhuma clausula encontrada.</div>';
    const clausesMarkup = clauses.length
      ? clauses.map((clause, index) => `
          <article class="cct-clause-card" id="${escapeHtml(makeClauseId(clause, index))}">
            <div class="cct-clause-head">
              <span class="cct-clause-ordinal">${escapeHtml(formatClauseOrdinal(clause.numero || `${index + 1}`))}</span>
              <h3>${escapeHtml(clause.titulo || 'Sem titulo')}</h3>
            </div>
            <div class="cct-clause-body">
              <p class="cct-clause-text">${escapeHtml(clause.texto || clause.resumo || 'Sem resumo disponivel.')}</p>
              <button type="button" class="cct-clause-toggle" hidden>Ver mais</button>
            </div>
          </article>
        `).join('')
      : '<div class="cct-empty">Nenhuma clausula resumida disponivel.</div>';

    return `
      <section class="cct-detail-panel">
        <div class="cct-detail-header">
          <div>
            <h2>${escapeHtml(item.nome || 'Detalhe da convencao')}</h2>
            <p>Registro ${escapeHtml(item.numeroRegistro || '-')} | Solicitacao ${escapeHtml(item.numeroSolicitacao || '-')}</p>
          </div>
          <div class="cct-results-header-actions">
            <a class="cct-download-link${hasDownload ? '' : ' disabled'}" href="${hasDownload ? `${API_BASE}/${encodeURIComponent(item.id)}/download` : '#'}"${hasDownload ? ` download="${escapeHtml(item.downloadFileName || '')}"` : ' aria-disabled="true"'}>Baixar convencao completa</a>
          </div>
        </div>

        <div class="cct-detail-grid">
          ${renderDetailBox('Registro', item.dataRegistroMte || '-')}
          ${renderDetailBox('Prazo para oposicao', item.prazoOposicao || '-')}
          ${renderDetailBox('Periodo', `${item.vigencia || '-'}\nData-base: ${item.dataBase || '-'}`)}
          ${renderDetailBox('O que cobre', item.abrangencia || '-')}
          ${renderDetailBox('Onde vale', item.abrangenciaTerritorial || '-')}
        </div>

        <div class="cct-sumario">
          <div class="cct-results-header">
            <div>
              <h2>Resumo rapido</h2>
              <p>Clique em um item para ir direto ao trecho correspondente.</p>
            </div>
          </div>
          <div class="cct-sumario-grid">
            ${summaryMarkup}
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
      </section>
    `;
  }

  function renderDetailStatePanel(title, message, isError = false) {
    return `
      <section class="cct-detail-panel cct-detail-panel-state${isError ? ' cct-detail-panel-error' : ''}">
        <div class="cct-detail-header">
          <div>
            <h2>${escapeHtml(title || 'Detalhe da convencao')}</h2>
            <p>${escapeHtml(message || '')}</p>
          </div>
        </div>
      </section>
    `;
  }

  function attachClauseExpanders() {
    document.querySelectorAll('.cct-clause-card').forEach((card) => {
      const textEl = card.querySelector('.cct-clause-text');
      const toggle = card.querySelector('.cct-clause-toggle');
      if (!textEl || !toggle) return;

      card.classList.remove('is-collapsed', 'is-expanded');
      toggle.hidden = true;
      toggle.textContent = 'Ver mais';

      const lineHeight = Number.parseFloat(window.getComputedStyle(textEl).lineHeight) || 24;
      const collapsedHeight = Math.ceil(lineHeight * 5);
      textEl.style.setProperty('--cct-collapsed-height', `${collapsedHeight}px`);

      if (textEl.scrollHeight <= collapsedHeight + 2) return;

      card.classList.add('is-collapsed');
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        const expanded = card.classList.toggle('is-expanded');
        card.classList.toggle('is-collapsed', !expanded);
        toggle.textContent = expanded ? 'Ver menos' : 'Ver mais';
      });
    });
  }

  function attachDetailBoxExpanders() {
    document.querySelectorAll('.cct-detail-box').forEach((box) => {
      const textEl = box.querySelector('.cct-detail-box-text');
      const toggle = box.querySelector('.cct-detail-box-toggle');
      if (!textEl || !toggle) return;

      box.classList.remove('is-collapsed', 'is-expanded');
      toggle.hidden = true;
      toggle.textContent = 'Ver mais';

      const lineHeight = Number.parseFloat(window.getComputedStyle(textEl).lineHeight) || 24;
      const collapsedHeight = Math.ceil(lineHeight * 5);
      textEl.style.setProperty('--cct-detail-collapsed-height', `${collapsedHeight}px`);

      if (textEl.scrollHeight <= collapsedHeight + 2) return;

      box.classList.add('is-collapsed');
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        const expanded = box.classList.toggle('is-expanded');
        box.classList.toggle('is-collapsed', !expanded);
        toggle.textContent = expanded ? 'Ver menos' : 'Ver mais';
      });
    });
  }

  function buildInlineDetailMarkup() {
    if (!state.selectedId) return '';
    if (state.detailLoading) {
      return renderDetailStatePanel('Carregando convencao', 'Buscando conteudo completo da convencao selecionada...');
    }
    if (state.detailError) {
      return renderDetailStatePanel('Falha ao carregar convencao', state.detailError, true);
    }
    if (state.detailItem) {
      return renderDetailPanel(state.detailItem);
    }
    return '';
  }

  function scrollToSelectedCard() {
    if (!state.selectedId) return;
    const card = Array.from(document.querySelectorAll('.cct-card')).find((el) => el.getAttribute('data-cct-item') === state.selectedId);
    if (card) {
      scrollBelowTopbar(card, 8);
    }
  }

  function renderResults() {
    try {
      const mounts = ensureRenderMounts();
      const results = mounts.results;
      const detailMount = mounts.detailMount;
      if (!results || !detailMount) {
        updatePaginationControls();
        return;
      }

      if (!state.items.length) {
        results.innerHTML = '<div class="cct-empty">Nenhuma convencao localizada. Ajuste os filtros e pesquise novamente.</div>';
        detailMount.innerHTML = '';
        updatePaginationControls();
        return;
      }

      const inlineDetailMarkup = buildInlineDetailMarkup();
      results.innerHTML = state.items.map((item) => {
        const cardMarkup = renderCard(item);
        if (!inlineDetailMarkup || item.id !== state.selectedId) {
          return cardMarkup;
        }
        return `${cardMarkup}<div class="cct-inline-detail">${inlineDetailMarkup}</div>`;
      }).join('');

      detailMount.innerHTML = '';

      results.querySelectorAll('[data-action="select"]').forEach((button) => {
        button.addEventListener('click', () => {
          const id = button.getAttribute('data-id');
          if (id) toggleDetail(id);
        });
      });

      document.querySelectorAll('.cct-sumario-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-target');
          const target = targetId ? document.getElementById(targetId) : null;
          if (target) scrollBelowTopbar(target);
        });
      });

      attachDetailBoxExpanders();
      attachClauseExpanders();
      updatePaginationControls();
    } catch (error) {
      console.error('[CCT] Erro de renderizacao:', error);
      const results = $('cctResults');
      const detailMount = $('cctDetailMount');
      if (results) {
        results.innerHTML = '<div class="cct-empty">Falha ao renderizar a lista de convencoes. Recarregue a pagina.</div>';
      }
      if (detailMount) {
        detailMount.innerHTML = '';
      }
      updatePaginationControls();
    }
  }

  function toggleDetail(id) {

    if (!id) return;
    if (state.selectedId === id && !state.detailLoading) {
      state.selectedId = null;
      state.detailItem = null;
      state.detailLoading = false;
      state.detailError = '';
      renderResults();
      return;
    }
    loadDetail(id);
  }

    async function loadResults(page = 1, options = {}) {
    const requestSeq = (state.listRequestSeq || 0) + 1;
    state.listRequestSeq = requestSeq;
    const filters = getFormFilters();
    const query = buildQuery({
      ...filters,
      page,
      limit: RESULTS_PER_PAGE,
    });

    setFeedback('Carregando convencoes...');
    const startedAt = Date.now();
    addDebugLog('info', 'Iniciando consulta de convencoes', {
      page,
      limit: RESULTS_PER_PAGE,
      query: query || '(sem filtros)',
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      let response;
      try {
        response = await AuthClient.authFetch(`${API_BASE}${query ? `?${query}` : ''}`, { method: 'GET', signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      const data = await safeJson(response);
      if (requestSeq !== state.listRequestSeq) return;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao consultar convencoes.');
      }

      state.items = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
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
      updatePaginationControls();
      syncPaginationUiSoon();

      if (state.selectedId) {
        const stillExists = state.items.some((item) => item.id === state.selectedId);
        if (!stillExists) {
          state.selectedId = null;
          state.detailItem = null;
          state.detailLoading = false;
          state.detailError = '';
        }
      }

      renderResults();
      addDebugLog('info', 'Consulta de convencoes concluida', {
        ms: Date.now() - startedAt,
        status: response.status,
        source: meta.source || 'desconhecida',
        totalFiltrados: Number(meta.totalFiltrados || 0),
        itensRecebidos: state.items.length,
      });

      const warnings = Array.isArray(data.meta?.warnings) ? data.meta.warnings : [];
      if (!state.items.length && warnings.length) {
        setFeedback(warnings[0]);
      } else if (warnings.length) {
        setFeedback(`Consulta atualizada. ${warnings.length} aviso(s) de leitura foram detectados.`);
      } else {
        setFeedback('Consulta atualizada automaticamente.');
      }
    } catch (error) {
      if (requestSeq !== state.listRequestSeq) return;
      console.error(error);
      addDebugLog('error', 'Falha na consulta de convencoes', {
        ms: Date.now() - startedAt,
        message: String(error?.message || error),
      });
      state.items = [];
      state.detailItem = null;
      state.detailLoading = false;
      state.detailError = '';
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
      const message = error?.name === 'AbortError'
        ? 'Tempo esgotado ao carregar convencoes. Tente novamente.'
        : (error.message || 'Erro ao carregar convencoes.');
      setFeedback(message);
    }

    if (options.scrollToResults) {
      scrollToResultsSection();
    }
  }
  async function loadDetail(id) {
    if (!id) return;
    const requestSeq = (state.detailRequestSeq || 0) + 1;
    state.detailRequestSeq = requestSeq;
    state.selectedId = id;
    state.detailLoading = true;
    state.detailError = '';
    state.detailItem = null;
    renderResults();
    scrollToSelectedCard();
    setFeedback('Carregando a convencao...');

    try {
      const response = await AuthClient.authFetch(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'GET' });
      const data = await safeJson(response);
      if (requestSeq !== state.detailRequestSeq || state.selectedId !== id) return;
      if (!response.ok || !data?.ok || !data.item) {
        throw new Error(data?.error || 'Falha ao carregar a convencao selecionada.');
      }

      state.detailLoading = false;
      state.detailError = '';
      state.detailItem = data.item;
      renderResults();
      setFeedback(`Convencao ${data.item.numeroRegistro || ''} carregada.`);
      scrollToSelectedCard();
    } catch (error) {
      if (requestSeq !== state.detailRequestSeq || state.selectedId !== id) return;
      console.error(error);
      state.detailLoading = false;
      state.detailItem = null;
      state.detailError = error.message || 'Erro ao carregar detalhes da convencao.';
      renderResults();
      setFeedback(error.message || 'Erro ao carregar detalhes da convencao.');
    }
  }

  function setHistoryModalOpen(open) {
    const modal = $('#cctHistoryModal');
    if (!modal) return;
    state.historyModal.open = !!open;
    modal.hidden = !state.historyModal.open;
  }

  function renderHistoryModal() {
    const list = $('#cctHistoryModalList');
    const info = $('#cctHistoryModalInfo');
    const prev = $('#btnCctHistoryPrev');
    const next = $('#btnCctHistoryNext');
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

  function renderHistoryLine(item) {
    const label = item?.label || item?.status || '-';
    const when = formatHistoryTimestamp(item?.timestamp || '');
    const cnpj = item?.cnpj || '-';
    const user = item?.user || 'usuario-desconhecido';
    const details = String(item?.details || '').trim();
    const tail = details ? ` | ${details}` : '';
    return `${when} | ${cnpj} | ${label} | ${user}${tail}`;
  }

  async function loadFullHistoryPage(page = 1) {
    state.historyModal.loading = true;
    renderHistoryModal();

    try {
      const safePage = Math.max(1, Number(page || 1));
      const query = `scope=full&page=${safePage}&limit=${HISTORY_FULL_LIMIT}`;
      let response = await AuthClient.authFetch(`${API_BASE}/historico?${query}`, { method: 'GET' });
      let data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        response = await AuthClient.authFetch(`${API_BASE}/history?${query}`, { method: 'GET' });
        data = await safeJson(response);
      }
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

  async function submitCnpjRequest(event, explicitForm) {
    if (event && handledSubmitEvents.has(event)) return;
    if (event) handledSubmitEvents.add(event);
    if (event) {
      event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }
    if (state.requestInFlight) return;

    const form = resolveRequestForm(explicitForm, event);
    const input = resolveRequestInput(form);
    const rawValue = String(input?.value || '').trim();
    const cnpj = normalizeCnpjDigits(rawValue);

    if (cnpj.length !== 14) {
      setRequestFeedback('Digite um CNPJ valido com 14 digitos.');
      input?.focus();
      return;
    }

    setRequestFeedback('Incluindo CNPJ na fila...');
    state.requestInFlight = true;
    const includeButton = $('#btnCctIncluir');
    if (includeButton) includeButton.disabled = true;

    try {
      let response = await AuthClient.authFetch(`${API_BASE}/requisicoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cnpj }),
      });
      let data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        response = await AuthClient.authFetch(`${API_BASE}/request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cnpj }),
        });
        data = await safeJson(response);
      }
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao incluir CNPJ.');
      }

      if (data.duplicate) {
        setRequestFeedback(data.message || 'CNPJ ja existe na lista.');
      } else {
        setRequestFeedback(data.message || 'CNPJ incluido na fila.');
        if (input) input.value = '';
      }

      if (state.historyModal.open) {
        await loadFullHistoryPage(state.historyModal.page || 1);
      }
    } catch (error) {
      console.error(error);
      setRequestFeedback(error.message || 'Erro ao incluir CNPJ.');
    } finally {
      state.requestInFlight = false;
      if (includeButton) includeButton.disabled = false;
    }
  }

  function resetFilters(event) {
    if (event) event.preventDefault();
    const form = $('#cctFilterForm');
    form?.reset();
    const nome = $('#filtroNome');
    const vigencia = $('#filtroVigencia');
    const dataBaseMes = $('#filtroDataBaseMes');
    const abrangencia = $('#filtroAbrangencia');
    const abrangenciaTerritorial = $('#filtroAbrangenciaTerritorial');
    if (nome) nome.value = '';
    if (vigencia) vigencia.value = 'todos';
    if (dataBaseMes) dataBaseMes.value = '';
    if (abrangencia) abrangencia.value = '';
    if (abrangenciaTerritorial) abrangenciaTerritorial.value = '';
    state.selectedId = null;
    state.detailItem = null;
    state.detailLoading = false;
    state.detailError = '';
    loadResults(1);
  }

  function updateBackToTopButton() {
    const button = $('#cctScrollTop');
    if (!button) return;
    button.hidden = false;
    button.style.opacity = window.scrollY < 220 ? '0.7' : '1';
  }

  function scrollToTop() {
    scrollToPageTop();
    const scrollRoot = document.scrollingElement || document.documentElement || document.body;
    if (scrollRoot && typeof scrollRoot.scrollTo === 'function') {
      scrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function goToPreviousPage() {
    const currentPage = Number(state.pagination?.page || 1);
    if (currentPage > 1) {
      const targetPage = currentPage - 1;
      stagePagination(targetPage);
      scrollToResultsSection();
      loadResults(targetPage, { scrollToResults: true });
    }
  }

  function goToNextPage() {
    const currentPage = Number(state.pagination?.page || 1);
    const totalPages = Number(state.pagination?.totalPages || 0);
    if (totalPages && currentPage < totalPages) {
      const targetPage = currentPage + 1;
      stagePagination(targetPage);
      scrollToResultsSection();
      loadResults(targetPage, { scrollToResults: true });
    }
  }

  function stagePagination(page) {
    const totalFiltrados = Number(state.pagination?.totalFiltrados || 0);
    const perPage = Number(state.pagination?.perPage || RESULTS_PER_PAGE);
    const totalPages = Number(state.pagination?.totalPages || 0);
    const safePage = Math.max(1, Math.min(Number(page || 1), totalPages || Number(page || 1)));
    const startIndex = totalFiltrados ? (((safePage - 1) * perPage) + 1) : 0;
    const endIndex = totalFiltrados ? Math.min(safePage * perPage, totalFiltrados) : 0;

    state.pagination = {
      ...state.pagination,
      page: safePage,
      startIndex,
      endIndex,
      hasPreviousPage: safePage > 1,
      hasNextPage: totalPages ? safePage < totalPages : false,
    };

    writePaginationSummary(`Carregando pagina ${safePage} de ${totalPages || 1}...`);
    updatePaginationControls();
  }

  async function initSidebarSafe() {
    if (typeof inicializarSidebar !== 'function') return;

    const timeoutMs = 6000;
    let timeoutId = null;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ timeout: true }), timeoutMs);
    });

    try {
      const result = await Promise.race([
        Promise.resolve().then(() => inicializarSidebar('cct')).then(() => ({ timeout: false })),
        timeoutPromise,
      ]);

      if (result && result.timeout) {
        console.warn('[CCT] Sidebar demorou para inicializar e foi ignorada para nao travar a tela.');
      }
    } catch (sidebarError) {
      console.warn('Falha ao inicializar sidebar na CCT:', sidebarError);
      setFeedback('Aviso: falha temporaria ao carregar a sidebar. A listagem da CCT continuara disponivel.');
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  window.__cctBuild = CCT_BUILD;
  window.__cctState = state;
  window.__cctClearFilters = () => resetFilters();
  window.__cctForceSearch = () => loadResults(1);
  window.__cctSubmitRequest = (event, form) => {
    void submitCnpjRequest(event, form);
    return false;
  };
  window.__cctOpenHistory = () => openFullHistoryModal();
  window.__cctGoPrevPage = () => goToPreviousPage();
  window.__cctGoNextPage = () => goToNextPage();
  window.__cctScrollTop = () => scrollToTop();
  window.__cctRefreshUi = () => syncPaginationUiSoon();

    async function boot() {
    if (hasBooted) return;
    hasBooted = true;
    try {
      addDebugLog('info', 'Boot da tela CCT iniciado');

      $('#cctFilterForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadResults(1);
      });

      $('#btnCctPesquisar')?.addEventListener('click', (event) => {
        if (event) event.preventDefault();
        loadResults(1);
      });

      $('#cctRequestForm')?.addEventListener('submit', (event) => {
        void submitCnpjRequest(event, event.currentTarget);
      });

      $('#btnLimparFiltrosCct')?.addEventListener('click', (event) => {
        resetFilters(event);
      });

      $('#btnCctHistorico')?.addEventListener('click', () => {
        openFullHistoryModal();
      });

      $('#btnCctHistoryClose')?.addEventListener('click', () => {
        closeFullHistoryModal();
      });

      $('#cctHistoryModal')?.addEventListener('click', (event) => {
        if (event.target && event.target.id === 'cctHistoryModal') {
          closeFullHistoryModal();
        }
      });

      $('#btnCctHistoryPrev')?.addEventListener('click', () => {
        const page = Number(state.historyModal.page || 1);
        if (page > 1) {
          loadFullHistoryPage(page - 1);
        }
      });

      $('#btnCctHistoryNext')?.addEventListener('click', () => {
        const page = Number(state.historyModal.page || 1);
        const totalPages = Number(state.historyModal.totalPages || 0);
        if (totalPages && page < totalPages) {
          loadFullHistoryPage(page + 1);
        }
      });

      $('#btnCctPrevPageTop')?.addEventListener('click', () => {
        goToPreviousPage();
      });

      $('#btnCctPrevPageBottom')?.addEventListener('click', () => {
        goToPreviousPage();
      });

      $('#btnCctNextPageTop')?.addEventListener('click', () => {
        goToNextPage();
      });

      $('#btnCctNextPageBottom')?.addEventListener('click', () => {
        goToNextPage();
      });

      $('#cctScrollTop')?.addEventListener('click', (event) => {
        if (event) event.preventDefault();
        scrollToTop();
      });
      window.addEventListener('scroll', updateBackToTopButton, { passive: true });
      window.addEventListener('error', (event) => {
        addDebugLog('error', 'Erro global de pagina', {
          message: String(event?.message || ''),
          source: String(event?.filename || ''),
          line: Number(event?.lineno || 0),
        });
      });
      window.addEventListener('unhandledrejection', (event) => {
        addDebugLog('error', 'Promise rejeitada sem tratamento', {
          reason: String(event?.reason?.message || event?.reason || ''),
        });
      });

      await initSidebarSafe();
      updatePaginationControls();
      syncPaginationUiSoon();
      startUiWatchdog();
      await loadResults(1);
      renderHistoryModal();
      updateBackToTopButton();
      addDebugLog('info', 'Boot da tela CCT concluido');
    } catch (error) {
      console.error(error);
      addDebugLog('error', 'Falha no boot da tela CCT', { message: String(error?.message || error) });
      setFeedback(error.message || 'Falha ao carregar a tela da CCT.');
    }
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    void boot();
  }

  setTimeout(() => {
    const info = $('cctResultsInfo')?.textContent || '';
    const stillLoading = /carregando/i.test(String(info));
    const hasData = Number(state.pagination?.totalFiltrados || 0) > 0 || Number(state.items?.length || 0) > 0;
    if (!hasData && stillLoading) {
      void loadResults(1);
    }
  }, 4000);

  setTimeout(() => {
    hydrateUiFromState();
  }, 600);
})();

