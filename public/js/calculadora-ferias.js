(function () {
  'use strict';

  const TAB_NAME = 'FÉRIAS 2026';
  const STATE_API = '/api/calculadora-ferias/state';
  const LOCAL_STATE_KEY = 'ferias:shared-cache:v1';
  const LEGACY_PARAMS_KEY = 'ferias:params:v4:ferias-2026';
  const LEGACY_PARAMS_KEY_V3 = 'ferias:params:v3';
  const HISTORY_KEY = 'ferias:history:v6';

  const FORM_DEFAULTS = {
    colaborador: '',
    salario: 0,
    medias: 0,
    diasFerias: 0,
    diasAbono: 0,
    dependentes: 0,
    eConsignado: 0,
  };

  const EXAMPLE_FORM = {
    colaborador: 'Maria da Silva',
    salario: 4500,
    medias: 380,
    diasFerias: 20,
    diasAbono: 10,
    dependentes: 1,
    eConsignado: 120,
  };

  const DEFAULT_PARAMS = {
    diasMes: 30,
    umTerco: 1 / 3,
    dependente: 189.59,
    simplificado: 607.2,
    r10: 0.133145,
    r11: 978.62,
    limiteCalculoNovo: 7350,
    inssTeto: 988.09,
    inss: [
      { ate: 1621.00, aliquota: 0.075 },
      { ate: 2902.84, aliquota: 0.09 },
      { ate: 4354.27, aliquota: 0.12 },
      { ate: 8475.55, aliquota: 0.14 },
    ],
    irrf: [
      { ate: 2428.80, aliquota: 0.0, deducao: 0.0 },
      { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ],
  };

  let currentUser = null;
  let csrfToken = null;
  let sharedState = {
    params: clone(DEFAULT_PARAMS),
    paramAdmins: [],
  };
  let formState = clone(FORM_DEFAULTS);
  let historyState = loadHistory();
  let paramsModalTab = 'geral';
  let paramsDraft = clone(DEFAULT_PARAMS);

  function clone(value) {
    return JSON.parse(JSON.stringify(value, (key, item) => item === Infinity ? '__INF__' : item), (key, item) => item === '__INF__' ? Infinity : item);
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isParamAdmin() {
    if (String(currentUser?.role || '').toUpperCase() === 'ADMIN') return true;
    const email = normalizeEmail(currentUser?.email);
    return !!email && sharedState.paramAdmins.map(normalizeEmail).includes(email);
  }

  function isRootAdmin() {
    return String(currentUser?.role || '').toUpperCase() === 'ADMIN';
  }

  function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function toNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function parseLocaleNumber(value) {
    const text = String(value ?? '').trim();
    if (!text) return 0;
    const normalized = text
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.-]/g, '');
    const numeric = Number.parseFloat(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function formatCurrency(value) {
    const numeric = toNumber(value);
    return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatNumber(value, maxFractionDigits) {
    const numeric = toNumber(value);
    return numeric.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFractionDigits,
    });
  }

  function formatEditableMoney(value) {
    return formatNumber(value, 2);
  }

  function formatEditableDecimal(value) {
    return formatNumber(value, 6);
  }

  function formatEditablePercent(value) {
    return formatNumber(toNumber(value) * 100, 6);
  }

  function formatDays(value) {
    return `${formatNumber(value, 0)} dia${Number(value) === 1 ? '' : 's'}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildParamsSnapshot(params) {
    return {
      ...clone(params),
      irrf: params.irrf.map((faixa) => ({
        ...faixa,
        ate: faixa.ate === Infinity ? null : faixa.ate,
      })),
    };
  }

  function restoreParamsSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return clone(DEFAULT_PARAMS);
    const next = clone(DEFAULT_PARAMS);
    if (Array.isArray(snapshot.inss)) next.inss = snapshot.inss.map((faixa) => ({ ...faixa }));
    if (Array.isArray(snapshot.irrf)) {
      next.irrf = snapshot.irrf.map((faixa, index, list) => ({
        ...faixa,
        ate: faixa.ate == null || index === list.length - 1 ? Infinity : toNumber(faixa.ate),
      }));
    }
    for (const key of ['diasMes', 'umTerco', 'dependente', 'simplificado', 'r10', 'r11', 'limiteCalculoNovo', 'inssTeto']) {
      if (snapshot[key] !== undefined) next[key] = toNumber(snapshot[key]);
    }
    return next;
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(LOCAL_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          params: restoreParamsSnapshot(parsed.params),
          paramAdmins: Array.isArray(parsed.paramAdmins) ? parsed.paramAdmins.map(normalizeEmail).filter(Boolean) : [],
        };
      }
    } catch (_) {}

    const legacyRaw = localStorage.getItem(LEGACY_PARAMS_KEY) || localStorage.getItem(LEGACY_PARAMS_KEY_V3);
    if (legacyRaw) {
      try {
        return {
          params: restoreParamsSnapshot(JSON.parse(legacyRaw)),
          paramAdmins: [],
        };
      } catch (_) {}
    }

    return {
      params: clone(DEFAULT_PARAMS),
      paramAdmins: [],
    };
  }

  function saveLocalState() {
    try {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
        params: buildParamsSnapshot(sharedState.params),
        paramAdmins: sharedState.paramAdmins,
      }));
    } catch (_) {}
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(historyState));
    } catch (_) {}
  }

  function calcINSSProgressivo(base, params) {
    if (base <= 0) return 0;
    let inicio = 0;
    let total = 0;
    for (const faixa of params.inss) {
      const limiteFaixa = faixa.ate === Infinity ? base : faixa.ate;
      const tributavel = Math.max(0, Math.min(base, limiteFaixa) - inicio);
      total += tributavel * faixa.aliquota;
      inicio = limiteFaixa;
      if (base <= limiteFaixa) break;
    }
    return Math.min(total, params.inssTeto);
  }

  function calcIRRF(base, params) {
    if (base <= 0) return 0;
    for (const faixa of params.irrf) {
      if (base <= faixa.ate) {
        return Math.max(0, (base * faixa.aliquota) - faixa.deducao);
      }
    }
    return 0;
  }

  function calcular(input, params) {
    const P = clone(params);
    const salario = toNumber(input.salario);
    const medias = toNumber(input.medias);
    const diasFerias = Math.max(0, toNumber(input.diasFerias));
    const diasAbono = Math.max(0, toNumber(input.diasAbono));
    const dependentes = Math.max(0, Math.trunc(toNumber(input.dependentes)));
    const eConsignado = toNumber(input.eConsignado);
    const valorDia = P.diasMes > 0 ? salario / P.diasMes : 0;
    const valorMediaDia = P.diasMes > 0 ? medias / P.diasMes : 0;

    const valorFerias = valorDia * diasFerias;
    const mediasFerias = valorMediaDia * diasFerias;
    const baseFerias = valorFerias + mediasFerias;
    const tercoFerias = baseFerias * P.umTerco;

    const abonoPecuniario = valorDia * diasAbono;
    const mediasAbono = valorMediaDia * diasAbono;
    const baseAbono = abonoPecuniario + mediasAbono;
    const tercoAbono = baseAbono * P.umTerco;

    const bruto = baseFerias + tercoFerias + baseAbono + tercoAbono;
    const inssBase = baseFerias + tercoFerias;
    const inss = calcINSSProgressivo(inssBase, P);

    const baseTrad = Math.max(0, inssBase - inss - (dependentes * P.dependente));
    const baseSimp = Math.max(0, inssBase - P.simplificado);
    const irrfCompleto = calcIRRF(baseTrad, P);
    const irrfSimplificado = calcIRRF(baseSimp, P);
    const usarSimplificado = irrfSimplificado <= irrfCompleto;
    const irrfBaseEscolhido = usarSimplificado ? irrfSimplificado : irrfCompleto;
    const descontoCalculoNovoPotencial = baseTrad < P.limiteCalculoNovo
      ? Math.max(0, P.r11 - (inssBase * P.r10))
      : 0;
    const irrf = Math.max(0, irrfBaseEscolhido - descontoCalculoNovoPotencial);
    const descontoCalculoNovo = Math.max(0, irrfBaseEscolhido - irrf);

    const totalDescontos = inss + irrf + eConsignado;
    const liquido = bruto - totalDescontos;

    return {
      salario,
      medias,
      diasFerias,
      diasAbono,
      dependentes,
      eConsignado,
      valorDia,
      valorFerias,
      mediasFerias,
      baseFerias,
      tercoFerias,
      abonoPecuniario,
      mediasAbono,
      baseAbono,
      tercoAbono,
      bruto,
      inssBase,
      inss,
      baseTrad,
      baseSimp,
      irrfCompleto,
      irrfSimplificado,
      descontoCalculoNovo,
      irrf,
      totalDescontos,
      liquido,
      regime: usarSimplificado ? 'Simplificado' : 'Completo',
      percentualLiquido: bruto > 0 ? (liquido / bruto) * 100 : 0,
      percentualInss: bruto > 0 ? (inss / bruto) * 100 : 0,
      percentualIrrf: bruto > 0 ? (irrf / bruto) * 100 : 0,
    };
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value;
  }

  function setText(id, text) {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
  }

  function updateMainFormFromState() {
    setValue('colaborador', formState.colaborador || '');
    setValue('salario', formState.salario || '');
    setValue('medias', formState.medias || '');
    setValue('diasFerias', formState.diasFerias || '');
    setValue('diasAbono', formState.diasAbono || '');
    setValue('dependentes', formState.dependentes || '');
    setValue('eConsignado', formState.eConsignado || '');
  }

  function collectMainFormState() {
    formState = {
      colaborador: document.getElementById('colaborador')?.value || '',
      salario: parseLocaleNumber(document.getElementById('salario')?.value),
      medias: parseLocaleNumber(document.getElementById('medias')?.value),
      diasFerias: parseLocaleNumber(document.getElementById('diasFerias')?.value),
      diasAbono: parseLocaleNumber(document.getElementById('diasAbono')?.value),
      dependentes: parseLocaleNumber(document.getElementById('dependentes')?.value),
      eConsignado: parseLocaleNumber(document.getElementById('eConsignado')?.value),
    };
  }

  function renderSummaryCards(result) {
    setText('summaryTotalPeriodo', `${formatNumber(result.diasFerias, 0)}d + ${formatNumber(result.diasAbono, 0)}d = ${formatNumber(result.diasFerias + result.diasAbono, 0)}d`);
    setText('summaryRegime', result.regime.toLowerCase());
    setText('summaryRegimeDetail', `compl. ${formatCurrency(result.irrfCompleto)} • simp. ${formatCurrency(result.irrfSimplificado)}`);
  }

  function renderKpis(result) {
    setText('kpiBruto', formatCurrency(result.bruto));
    setText('kpiBrutoSub', `${formatNumber(result.diasFerias, 0)}d gozadas + ${formatNumber(result.diasAbono, 0)}d abono`);
    setText('kpiINSS', `-${formatCurrency(result.inss)}`);
    setText('kpiINSSSub', `${formatNumber(result.percentualInss, 2)}% sobre férias tributáveis`);
    setText('kpiIRRF', `-${formatCurrency(result.irrf)}`);
    setText('kpiIRRFSub', result.regime.toLowerCase());
    setText('kpiLiquido', formatCurrency(result.liquido));
    setText('kpiLiquidoSub', `${formatNumber(result.percentualLiquido, 2)}% do bruto`);
  }

  function renderDetailCards(result) {
    const cards = [
      { label: '(i) Férias gozadas', value: formatCurrency(result.valorFerias), badges: [`${formatNumber(result.diasFerias, 0)}D`] },
      { label: '(i) Médias s/ férias', value: formatCurrency(result.mediasFerias), badges: [] },
      { label: '(i) 1/3 constitucional', value: formatCurrency(result.tercoFerias), badges: [] },
      { label: '(i) Abono pecuniário', value: formatCurrency(result.abonoPecuniario), badges: [`${formatNumber(result.diasAbono, 0)}D`, 'Isento'] },
      { label: '(i) Médias s/ abono', value: formatCurrency(result.mediasAbono), badges: ['Isento'] },
      { label: '(i) 1/3 s/ abono', value: formatCurrency(result.tercoAbono), badges: ['Isento'] },
      { label: '(i) Base IRRF completo', value: formatCurrency(result.baseTrad), badges: [] },
      { label: '(i) Base IRRF simplif.', value: formatCurrency(result.baseSimp), badges: [] },
      { label: '(−) INSS', value: `-${formatCurrency(result.inss)}`, tone: 'negative', badges: [] },
      { label: '(−) IRRF', value: `-${formatCurrency(result.irrf)}`, tone: 'negative', badges: [result.regime.toUpperCase()] },
      { label: '(−) e-Consignado', value: `-${formatCurrency(result.eConsignado)}`, tone: 'negative', badges: [] },
      { label: '(−) Total descontos', value: `-${formatCurrency(result.totalDescontos)}`, tone: 'negative', badges: [] },
      { label: '(i) Redutor calc. novo', value: `-${formatCurrency(result.descontoCalculoNovo)}`, tone: result.descontoCalculoNovo > 0 ? 'negative' : 'neutral', badges: result.descontoCalculoNovo > 0 ? ['Ativo'] : [] },
    ];

    const grid = document.getElementById('detalhamentoGrid');
    if (!grid) return;
    grid.innerHTML = cards.map((card) => `
      <div class="fer-detail-card ${card.tone === 'negative' ? 'is-negative' : ''}">
        <div class="fer-detail-label">${escapeHtml(card.label)}</div>
        <div class="fer-detail-value">${escapeHtml(card.value)}</div>
        <div class="fer-detail-badges">
          ${card.badges.map((badge) => `<span class="fer-detail-badge">${escapeHtml(badge)}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  function renderComposition(result) {
    const total = Math.max(result.bruto, 0);
    const pieces = [
      { label: 'Férias gozadas (liq.)', value: result.baseFerias + result.tercoFerias, color: '#2f855a' },
      { label: 'Abono pecuniário', value: result.baseAbono + result.tercoAbono, color: '#74c69d' },
      { label: 'INSS', value: result.inss, color: '#e25b5b' },
      { label: 'IRRF', value: result.irrf, color: '#e59b47' },
      { label: 'e-Consignado', value: result.eConsignado, color: '#8c7558' },
    ];
    const bar = document.getElementById('composicaoBar');
    const legend = document.getElementById('composicaoLegend');
    if (!bar || !legend) return;

    if (total <= 0) {
      bar.innerHTML = '<span class="fer-composition-empty">Sem valores para compor.</span>';
      legend.innerHTML = '';
      return;
    }

    bar.innerHTML = pieces.map((piece) => {
      const width = Math.max(2, (piece.value / total) * 100);
      return `<span class="fer-composition-segment" style="width:${width}%;background:${piece.color}"></span>`;
    }).join('');

    legend.innerHTML = pieces.map((piece) => `
      <div class="fer-composition-item">
        <span class="fer-composition-dot" style="background:${piece.color}"></span>
        <span>${escapeHtml(piece.label)}</span>
        <strong>${escapeHtml(formatCurrency(piece.value))}</strong>
      </div>
    `).join('');
  }

  function renderHistory() {
    setText('historyCount', `${historyState.length} cálculo(s) salvo(s) neste navegador.`);
    const body = document.getElementById('historyBody');
    const clearButton = document.getElementById('btnClearHistory');
    if (!body) return;

    if (!historyState.length) {
      body.innerHTML = '<div class="fer-history-empty">Nenhum cálculo salvo. Use <code>Salvar cálculo no histórico</code>.</div>';
      if (clearButton) clearButton.style.display = 'none';
      return;
    }

    if (clearButton) clearButton.style.display = '';
    body.innerHTML = historyState.map((entry) => `
      <div class="fer-history-item">
        <div>
          <div class="fer-history-title">${escapeHtml(entry.colaborador || 'Cálculo sem nome')}</div>
          <div class="fer-history-sub">${escapeHtml(entry.timestamp)}</div>
        </div>
        <div class="fer-history-values">
          <span>Bruto ${escapeHtml(formatCurrency(entry.bruto))}</span>
          <span>Líquido ${escapeHtml(formatCurrency(entry.liquido))}</span>
        </div>
        <div class="fer-history-actions">
          <button class="btn btn-secondary" type="button" data-history-apply="${escapeHtml(entry.id)}">Aplicar</button>
          <button class="btn sal-btn-danger" type="button" data-history-delete="${escapeHtml(entry.id)}">Excluir</button>
        </div>
      </div>
    `).join('');

    body.querySelectorAll('[data-history-apply]').forEach((button) => {
      button.addEventListener('click', () => {
        const entry = historyState.find((item) => item.id === button.dataset.historyApply);
        if (!entry) return;
        formState = clone(entry.form);
        updateMainFormFromState();
        refreshAll();
      });
    });

    body.querySelectorAll('[data-history-delete]').forEach((button) => {
      button.addEventListener('click', () => {
        historyState = historyState.filter((item) => item.id !== button.dataset.historyDelete);
        saveHistory();
        renderHistory();
      });
    });
  }

  function refreshAll() {
    collectMainFormState();
    const result = calcular(formState, sharedState.params);
    renderSummaryCards(result);
    renderKpis(result);
    renderDetailCards(result);
    renderComposition(result);
    renderHistory();
  }

  async function initUser() {
    try {
      const ctx = await window.AuthClient?.getAuthContext?.();
      currentUser = ctx?.user || null;
      csrfToken = ctx?.csrfToken || null;
    } catch (_) {
      currentUser = null;
      csrfToken = null;
    }
    updateAdminUI();
  }

  function updateAdminUI() {
    const button = document.getElementById('btnParams');
    if (button) {
      button.title = isParamAdmin()
        ? 'Parâmetros avançados (edição liberada)'
        : 'Parâmetros avançados (somente visualização)';
    }
  }

  async function loadSharedStateFromServer() {
    try {
      const response = await fetch(STATE_API, { method: 'GET' });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (!data || typeof data !== 'object') return;
      if (data.params) sharedState.params = restoreParamsSnapshot(data.params);
      if (Array.isArray(data.paramAdmins)) sharedState.paramAdmins = data.paramAdmins.map(normalizeEmail).filter(Boolean);
      saveLocalState();
    } catch (_) {}
  }

  async function saveSharedStateToServer() {
    if (!csrfToken) return;
    const payload = {
      params: buildParamsSnapshot(sharedState.params),
      paramAdmins: sharedState.paramAdmins,
    };
    const response = await window.AuthClient.authFetch(STATE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.error || 'Não foi possível salvar o estado compartilhado.');
    }
    saveLocalState();
  }

  function renderTabsCard() {
    const tabs = document.getElementById('feriasTabs');
    if (!tabs) return;
    tabs.innerHTML = `<button class="sal-tab active" data-tab="${escapeHtml(TAB_NAME)}">${escapeHtml(TAB_NAME)}</button>`;
  }

  function openManageTabsModal() {
    const body = document.getElementById('manageTabsBody');
    const dialog = document.getElementById('manageTabsModal');
    if (!body || !dialog) return;
    const admin = isRootAdmin();
    const admins = sharedState.paramAdmins;
    let html = `
      <div class="sal-tabmgr-list">
        <div class="sal-tabmgr-item">
          <span class="sal-tabmgr-name">${escapeHtml(TAB_NAME)} <span class="sal-param-badge" style="background:#dbeafe;color:#1d4ed8">fixa</span></span>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px" type="button" disabled>Modelo 2026</button>
          </div>
        </div>
      </div>
      <p class="sal-tabmgr-note">Esta calculadora está travada em uma única aba operacional. O gerenciamento aqui controla apenas o acesso aos parâmetros avançados.</p>
      <div class="sal-section-title" style="margin-top:20px">Controle de acesso — Parâmetros avançados</div>
      <p class="sal-tabmgr-note">Somente usuários ADMIN ou os e-mails listados poderão editar parâmetros avançados.</p>
    `;

    if (admin) {
      html += '<div class="sal-tabmgr-list" id="feriasAdminList">';
      if (!admins.length) {
        html += '<div class="sal-tabmgr-item"><span class="sal-tabmgr-name sal-tabmgr-dimmed">Nenhum e-mail adicional liberado.</span></div>';
      } else {
        html += admins.map((email) => `
          <div class="sal-tabmgr-item">
            <span class="sal-tabmgr-name">${escapeHtml(email)}</span>
            <button class="btn sal-btn-danger" style="font-size:12px;padding:4px 12px" type="button" data-remove-admin="${escapeHtml(email)}">Remover</button>
          </div>
        `).join('');
      }
      html += `
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
          <input id="newAdminEmail" class="auth-input" type="email" placeholder="email@usuario.com" style="flex:1;margin:0" />
          <button class="btn btn-primary" style="font-size:12px;padding:6px 14px;white-space:nowrap" type="button" id="btnAddAdmin">Adicionar</button>
        </div>
      `;
    } else {
      html += `
        <div class="sal-tabmgr-list">
          ${admins.length ? admins.map((email) => `
            <div class="sal-tabmgr-item">
              <span class="sal-tabmgr-name">${escapeHtml(email)}</span>
            </div>
          `).join('') : '<div class="sal-tabmgr-item"><span class="sal-tabmgr-name sal-tabmgr-dimmed">Nenhum e-mail adicional liberado.</span></div>'}
        </div>
        <p class="sal-tabmgr-note">Somente usuários ADMIN podem alterar a lista de e-mails autorizados.</p>
      `;
    }

    if (currentUser?.email) {
      html += `<p class="sal-tabmgr-note">Seu usuário atual: <strong>${escapeHtml(currentUser.email)}</strong></p>`;
    }

    body.innerHTML = html;

    body.querySelectorAll('[data-remove-admin]').forEach((button) => {
      button.addEventListener('click', async () => {
        sharedState.paramAdmins = sharedState.paramAdmins.filter((email) => email !== button.dataset.removeAdmin);
        try {
          await saveSharedStateToServer();
          openManageTabsModal();
          updateAdminUI();
        } catch (error) {
          alert(error.message);
        }
      });
    });

    body.querySelector('#btnAddAdmin')?.addEventListener('click', async () => {
      const input = body.querySelector('#newAdminEmail');
      const email = normalizeEmail(input?.value);
      if (!email || !email.includes('@')) {
        input?.classList.add('sal-input-error');
        setTimeout(() => input?.classList.remove('sal-input-error'), 1200);
        return;
      }
      if (!sharedState.paramAdmins.includes(email)) {
        sharedState.paramAdmins.push(email);
        sharedState.paramAdmins.sort();
      }
      try {
        await saveSharedStateToServer();
        openManageTabsModal();
        updateAdminUI();
      } catch (error) {
        alert(error.message);
      }
    });

    if (!dialog.open) dialog.showModal();
  }

  function buildParamsModalContent() {
    const body = document.getElementById('paramsModalBody');
    if (!body) return;
    const canEdit = isParamAdmin();
    const saveButton = document.getElementById('btnSaveParamsModal');
    const restoreButton = document.getElementById('btnRestoreParamsModal');
    const params = paramsDraft;
    const tabs = [
      { key: 'geral', label: 'Parâmetros gerais' },
      { key: 'inss', label: 'Tabela INSS' },
      { key: 'irrf', label: 'Tabela IRRF' },
    ];

    let inner = `
      <div class="sal-tabs" style="margin-bottom:14px">
        ${tabs.map((tab) => `<button class="sal-tab ${paramsModalTab === tab.key ? 'active' : ''}" type="button" data-pm-tab="${tab.key}">${escapeHtml(tab.label)}</button>`).join('')}
      </div>
    `;

    if (!canEdit) {
      inner += '<div class="fer-modal-readonly">Modo somente visualização. Peça liberação a um usuário ADMIN ou a um e-mail já autorizado para editar estes parâmetros.</div>';
    }

    inner += `
      <div style="${paramsModalTab === 'geral' ? '' : 'display:none'}" data-pm-panel="geral">
        <div class="sal-advanced-grid">
          <label class="auth-label">Dias do mês padrão<input id="pmDiasMes" class="auth-input" type="text" value="${escapeHtml(formatEditableDecimal(params.diasMes))}" /></label>
          <label class="auth-label">Multiplicador 1/3<input id="pmUmTerco" class="auth-input" type="text" value="${escapeHtml(formatEditableDecimal(params.umTerco))}" /></label>
          <label class="auth-label">Valor por dependente (R$)<input id="pmDependente" class="auth-input" type="text" value="${escapeHtml(formatEditableMoney(params.dependente))}" /></label>
          <label class="auth-label">Dedução simplificada IRRF (R$)<input id="pmSimplificado" class="auth-input" type="text" value="${escapeHtml(formatEditableMoney(params.simplificado))}" /></label>
          <label class="auth-label">Coeficiente R10<input id="pmR10" class="auth-input" type="text" value="${escapeHtml(formatEditableDecimal(params.r10))}" /></label>
          <label class="auth-label">Limite R11 (R$)<input id="pmR11" class="auth-input" type="text" value="${escapeHtml(formatEditableMoney(params.r11))}" /></label>
          <label class="auth-label">Limite do cálculo novo (R$)<input id="pmLimiteCalculoNovo" class="auth-input" type="text" value="${escapeHtml(formatEditableMoney(params.limiteCalculoNovo))}" /></label>
          <label class="auth-label">Teto máximo INSS (R$)<input id="pmInssTeto" class="auth-input" type="text" value="${escapeHtml(formatEditableMoney(params.inssTeto))}" /></label>
        </div>
      </div>
      <div style="${paramsModalTab === 'inss' ? '' : 'display:none'}" data-pm-panel="inss">
        <p class="sal-tabmgr-note" style="margin-top:0">Faixas progressivas aplicadas sobre o valor que excede a faixa anterior.</p>
        <table class="sal-band-table">
          <thead>
            <tr><th>#</th><th>Limite da faixa (até R$)</th><th>Alíquota (%)</th></tr>
          </thead>
          <tbody>
            ${params.inss.map((faixa, index) => `
              <tr>
                <td class="sal-band-idx">${index + 1}</td>
                <td><input class="auth-input" type="text" data-inss-ate="${index}" value="${escapeHtml(formatEditableMoney(faixa.ate))}" /></td>
                <td><input class="auth-input" type="text" data-inss-aliq="${index}" value="${escapeHtml(formatEditablePercent(faixa.aliquota))}" /></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="${paramsModalTab === 'irrf' ? '' : 'display:none'}" data-pm-panel="irrf">
        <p class="sal-tabmgr-note" style="margin-top:0">Tabela 2026 com alíquota e dedução por faixa.</p>
        <table class="sal-band-table">
          <thead>
            <tr><th>#</th><th>Limite da faixa (até R$)</th><th>Alíquota (%)</th><th>Dedução (R$)</th></tr>
          </thead>
          <tbody>
            ${params.irrf.map((faixa, index) => `
              <tr>
                <td class="sal-band-idx">${index + 1}</td>
                <td><input class="auth-input" type="text" data-irrf-ate="${index}" value="${escapeHtml(index === params.irrf.length - 1 ? '∞' : formatEditableMoney(faixa.ate))}" ${index === params.irrf.length - 1 ? 'disabled' : ''} /></td>
                <td><input class="auth-input" type="text" data-irrf-aliq="${index}" value="${escapeHtml(formatEditablePercent(faixa.aliquota))}" /></td>
                <td><input class="auth-input" type="text" data-irrf-ded="${index}" value="${escapeHtml(formatEditableMoney(faixa.deducao))}" /></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    body.innerHTML = inner;
    body.querySelectorAll('[data-pm-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        paramsModalTab = button.dataset.pmTab;
        buildParamsModalContent();
      });
    });

    if (!canEdit) {
      body.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    }
    if (saveButton) saveButton.disabled = !canEdit;
    if (restoreButton) restoreButton.disabled = !canEdit;
  }

  function restoreDefaultParamsInModal() {
    paramsDraft = clone(DEFAULT_PARAMS);
    buildParamsModalContent();
  }

  function readParamsDraftFromModal() {
    const next = clone(paramsDraft);

    const readText = (id) => document.getElementById(id)?.value || '';

    next.diasMes = parseLocaleNumber(readText('pmDiasMes'));
    next.umTerco = parseLocaleNumber(readText('pmUmTerco'));
    next.dependente = parseLocaleNumber(readText('pmDependente'));
    next.simplificado = parseLocaleNumber(readText('pmSimplificado'));
    next.r10 = parseLocaleNumber(readText('pmR10'));
    next.r11 = parseLocaleNumber(readText('pmR11'));
    next.limiteCalculoNovo = parseLocaleNumber(readText('pmLimiteCalculoNovo'));
    next.inssTeto = parseLocaleNumber(readText('pmInssTeto'));

    next.inss = next.inss.map((faixa, index) => ({
      ate: parseLocaleNumber(document.querySelector(`[data-inss-ate="${index}"]`)?.value),
      aliquota: parseLocaleNumber(document.querySelector(`[data-inss-aliq="${index}"]`)?.value) / 100,
    }));

    next.irrf = next.irrf.map((faixa, index, list) => ({
      ate: index === list.length - 1 ? Infinity : parseLocaleNumber(document.querySelector(`[data-irrf-ate="${index}"]`)?.value),
      aliquota: parseLocaleNumber(document.querySelector(`[data-irrf-aliq="${index}"]`)?.value) / 100,
      deducao: parseLocaleNumber(document.querySelector(`[data-irrf-ded="${index}"]`)?.value),
    }));

    return next;
  }

  function openParamsModal() {
    paramsDraft = clone(sharedState.params);
    paramsModalTab = 'geral';
    buildParamsModalContent();
    const saveStatus = document.getElementById('paramsSaveStatus');
    if (saveStatus) saveStatus.textContent = '';
    document.getElementById('paramsModalTitle').textContent = `Parâmetros avançados — ${TAB_NAME}`;
    const dialog = document.getElementById('paramsModal');
    if (dialog && !dialog.open) dialog.showModal();
  }

  async function saveParamsModal() {
    if (!isParamAdmin()) return;
    try {
      sharedState.params = readParamsDraftFromModal();
      await saveSharedStateToServer();
      const saveStatus = document.getElementById('paramsSaveStatus');
      if (saveStatus) saveStatus.textContent = '✓ Salvo!';
      refreshAll();
      setTimeout(() => {
        document.getElementById('paramsModal')?.close();
        if (saveStatus) saveStatus.textContent = '';
      }, 450);
    } catch (error) {
      alert(error.message);
    }
  }

  function saveCurrentToHistory() {
    collectMainFormState();
    const result = calcular(formState, sharedState.params);
    historyState = [
      {
        id: `${Date.now()}`,
        timestamp: new Date().toLocaleString('pt-BR'),
        colaborador: formState.colaborador || 'Cálculo sem nome',
        bruto: result.bruto,
        liquido: result.liquido,
        form: clone(formState),
      },
      ...historyState,
    ].slice(0, 20);
    saveHistory();
    renderHistory();
  }

  function resetFormState(useExample) {
    formState = clone(useExample ? EXAMPLE_FORM : FORM_DEFAULTS);
    updateMainFormFromState();
    refreshAll();
  }

  function bindMainInputs() {
    ['colaborador', 'salario', 'medias', 'diasFerias', 'diasAbono', 'dependentes', 'eConsignado'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', refreshAll);
    });

    document.getElementById('btnLimpar')?.addEventListener('click', () => resetFormState(false));
    document.getElementById('btnExemplo')?.addEventListener('click', () => resetFormState(true));
    document.getElementById('btnSaveHistory')?.addEventListener('click', saveCurrentToHistory);
    document.getElementById('btnClearHistory')?.addEventListener('click', () => {
      if (!historyState.length) return;
      if (!confirm('Apagar todo o histórico salvo desta calculadora?')) return;
      historyState = [];
      saveHistory();
      renderHistory();
    });

    document.getElementById('btnManageTabs')?.addEventListener('click', openManageTabsModal);
    ['btnCloseManageTabs', 'btnCloseManageTabsFooter'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => document.getElementById('manageTabsModal')?.close());
    });
    document.getElementById('manageTabsModal')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });

    document.getElementById('btnParams')?.addEventListener('click', openParamsModal);
    ['btnCloseParamsModal', 'btnCloseParamsModalFooter'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => document.getElementById('paramsModal')?.close());
    });
    document.getElementById('btnRestoreParamsModal')?.addEventListener('click', restoreDefaultParamsInModal);
    document.getElementById('btnSaveParamsModal')?.addEventListener('click', saveParamsModal);
    document.getElementById('paramsModal')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
  }

  async function init() {
    sharedState = loadLocalState();
    formState = clone(FORM_DEFAULTS);
    historyState = loadHistory();

    updateMainFormFromState();
    renderTabsCard();
    bindMainInputs();
    refreshAll();

    if (window.inicializarSidebar) {
      try {
        await window.inicializarSidebar('calculadora-ferias');
      } catch (error) {
        console.warn('[calculadora-ferias] Sidebar indisponível:', error);
      }
    }

    await initUser();
    await loadSharedStateFromServer();
    updateAdminUI();
    refreshAll();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
