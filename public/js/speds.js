/* global AuthClient, inicializarSidebar */

(function () {
  const SLUG = 'speds';
  const API_BASE = '/api/speds';
  const Y570_TEMPLATE_ID = 'ecf-y570-fontes-pagadoras';
  const L210_TEMPLATE_ID = 'ecf-gerador-bloco-custo-l210';

  const state = {
    spedTypes: [],
    templates: [],
    currentTemplate: null,
    y570Preview: null,
    l210Rows: [],
    l210Config: {
      apuracao: 'mensal',
      anoDeclaracao: '',
      saldoInicialEstoque: '0,00',
    },
    y570Filters: {
      cnpj: '',
      nome: '',
      codigo: '',
    },
    lastAutoDownloadPath: '',
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

  async function safeJson(resp) {
    try {
      return await resp.json();
    } catch (_) {
      return null;
    }
  }

  function setStatus(msg, isError) {
    const el = $('runStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? '#b91c1c' : '#1e293b';
  }

  function setErrors(errors) {
    const box = $('runErrors');
    if (!box) return;
    if (!errors || errors.length === 0) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = `<strong>Validação:</strong><br>${errors.map((e) => `- ${escapeHtml(e)}`).join('<br>')}`;
  }

  function clearResult({ preserveL210State = false } = {}) {
    $('runSummary').innerHTML = '';
    $('downloadList').innerHTML = '';
    renderValidationInsights(null);
    setErrors([]);
    state.y570Preview = null;
    if (!preserveL210State) {
      state.l210Rows = [];
      state.l210Config = {
        apuracao: 'mensal',
        anoDeclaracao: '',
        saldoInicialEstoque: '0,00',
      };
    }
    state.lastAutoDownloadPath = '';
    state.y570Filters = {
      cnpj: '',
      nome: '',
      codigo: '',
    };
    const panel = $('y570Panel');
    const box = $('y570Preview');
    if (panel) panel.style.display = 'none';
    if (box) box.innerHTML = '';
    const l210Panel = $('l210Panel');
    const l210Box = $('l210Preview');
    if (l210Panel) l210Panel.style.display = 'none';
    if (l210Box) l210Box.innerHTML = '';
  }

  function normalizeExtension(name) {
    const raw = String(name || '').trim().toLowerCase();
    if (!raw) return '';
    const lastDot = raw.lastIndexOf('.');
    return lastDot >= 0 ? raw.slice(lastDot) : '';
  }

  function formatExtensionList(list) {
    return (Array.isArray(list) ? list : [])
      .map((item) => normalizeExtension(item))
      .filter(Boolean);
  }

  function findInputElementByKey(inputKey) {
    const all = Array.from(document.querySelectorAll('[data-input-key]'));
    return all.find((el) => el.getAttribute('data-input-key') === String(inputKey || '')) || null;
  }

  function validateFilesByTemplate(template) {
    const errors = [];
    if (!template) return errors;

    for (const input of template.inputs || []) {
      const key = String(input?.key || '');
      const label = String(input?.label || key || 'arquivo');
      const el = findInputElementByKey(key);
      const files = el?.files ? Array.from(el.files) : [];
      const allowed = formatExtensionList(input?.acceptedExtensions || []);

      if (input?.required && files.length === 0) {
        errors.push(`Campo obrigatório sem arquivo: ${label}.`);
      }

      if (!input?.multiple && files.length > 1) {
        errors.push(`O campo ${label} aceita apenas 1 arquivo.`);
      }

      for (const file of files) {
        const ext = normalizeExtension(file?.name || '');
        if (allowed.length > 0 && (!ext || !allowed.includes(ext))) {
          const allowedText = allowed.join(', ');
          errors.push(`Formato inválido em ${label}: ${file.name} (permitidos: ${allowedText}).`);
        }
      }
    }

    return errors;
  }

  function validateRequiredFields(template) {
    const errors = [];
    if (!template) return errors;

    const fieldsData = collectFields();
    for (const field of template.fields || []) {
      if (!field?.required) continue;
      const value = fieldsData[field.key];
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push(`Campo obrigatório não informado: ${field.label}.`);
      }
    }
    return errors;
  }

  function validateTemplateSpecificRules(template) {
    const errors = [];
    if (!template) return errors;

    if (String(template.id || '') === 'ecd-comparar-j150-dre-mensal') {
      const dreInput = findInputElementByKey('dre_mensal');
      const balancoInput = findInputElementByKey('balanco_patrimonial');
      const dreCount = dreInput?.files ? dreInput.files.length : 0;
      const balancoCount = balancoInput?.files ? balancoInput.files.length : 0;
      if (dreCount === 0 && balancoCount === 0) {
        errors.push('Envie ao menos um arquivo: DRE mensal e/ou balanco patrimonial.');
      }
    } else if (isL210Template(template)) {
      let payload = null;
      try {
        const hidden = $('l210ManualRowsJson');
        payload = JSON.parse(String(hidden?.value || '{}'));
      } catch (_) {
        errors.push('Nao foi possivel ler o quadro manual do L210.');
        return errors;
      }

      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const apuracao = normalizeL210Apuracao(payload?.apuracao || $('field__apuracao')?.value || 'mensal');
      const anoDeclaracao = normalizeL210Year(payload?.ano_declaracao || $('field__ano_declaracao')?.value || '');
      const saldoInicial = String(payload?.saldo_inicial_estoque || '').trim();
      const expectedRows = apuracao === 'trimestral' ? 4 : 12;

      if (anoDeclaracao.length !== 4) {
        errors.push('Informe o ano da declaracao no quadro L210.');
      }
      if (!saldoInicial) {
        errors.push('Informe o saldo inicial do estoque no quadro L210.');
      }
      if (rows.length !== expectedRows) {
        errors.push(`O quadro L210 precisa ter ${expectedRows} linhas para a apuracao selecionada.`);
        return errors;
      }

      rows.forEach((row, index) => {
        const label = String(row?.periodo || `Linha ${index + 1}`).trim();
        if (!label) {
          errors.push(`Informe o periodo na linha ${index + 1} do quadro L210.`);
        }
        if (!String(row?.estoque_final || '').trim()) {
          errors.push(`Informe o saldo final na linha ${index + 1} (${label}).`);
        }
        if (!String(row?.custo || '').trim()) {
          errors.push(`Informe o custo do periodo na linha ${index + 1} (${label}).`);
        }
      });
    }

    return errors;
  }

  function isY570Template(template) {
    return String(template?.id || '') === Y570_TEMPLATE_ID;
  }

  function isL210Template(template) {
    return String(template?.id || '') === L210_TEMPLATE_ID;
  }

  function formatPtBrMoneyInput(value) {
    const num = typeof value === 'number' ? value : parsePtBrMoneyInput(value);
    if (!Number.isFinite(num)) return '0,00';
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  function parsePtBrMoneyInput(value) {
    const text = String(value ?? '').trim();
    if (!text) return 0;
    const normalized = text
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  }

  function getL210DefaultYear() {
    return String(new Date().getFullYear() - 1);
  }

  function normalizeL210Apuracao(value) {
    return String(value || '').trim().toLowerCase() === 'trimestral' ? 'trimestral' : 'mensal';
  }

  function normalizeL210Year(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
    if (digits.length === 4) return digits;
    return getL210DefaultYear();
  }

  function getL210PeriodSpecs(apuracao, anoDeclaracao) {
    const year = normalizeL210Year(anoDeclaracao);
    if (normalizeL210Apuracao(apuracao) === 'trimestral') {
      return [1, 2, 3, 4].map((quarter) => ({
        key: `${year}-T${quarter}`,
        label: `${quarter}T/${year}`,
      }));
    }
    return Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0');
      return {
        key: `${year}-${month}`,
        label: `${month}/${year}`,
      };
    });
  }

  function readL210ConfigFromDom() {
    const apuracao = normalizeL210Apuracao($('field__apuracao')?.value || state.l210Config.apuracao);
    const anoDeclaracao = normalizeL210Year($('field__ano_declaracao')?.value || state.l210Config.anoDeclaracao);
    const saldoInicialEstoque = formatPtBrMoneyInput(
      parsePtBrMoneyInput($('field__saldo_inicial_estoque')?.value || state.l210Config.saldoInicialEstoque || '0,00')
    );
    return {
      apuracao,
      anoDeclaracao,
      saldoInicialEstoque,
    };
  }

  function buildL210RowsForConfig(config, previousRows = []) {
    const periodSpecs = getL210PeriodSpecs(config.apuracao, config.anoDeclaracao);
    return periodSpecs.map((spec, index) => {
      const previous = previousRows[index] || {};
      return {
        id: previous.id || `l210-${spec.key}-${index}`,
        periodoKey: spec.key,
        periodo: spec.label,
        estoqueFinal: String(previous.estoqueFinal || ''),
        custoPeriodo: String(previous.custoPeriodo || ''),
      };
    });
  }

  function computeL210DerivedRows(rows, config) {
    const initialOpening = parsePtBrMoneyInput(config.saldoInicialEstoque);
    const isMonthly = normalizeL210Apuracao(config.apuracao) === 'mensal';
    let cumulativeCost = 0;
    let previousFinal = initialOpening;

    return rows.map((row, index) => {
      const estoqueFinal = parsePtBrMoneyInput(row.estoqueFinal);
      const custoPeriodo = parsePtBrMoneyInput(row.custoPeriodo);
      const opening = isMonthly ? initialOpening : (index === 0 ? initialOpening : previousFinal);

      if (isMonthly) {
        cumulativeCost += custoPeriodo;
      } else {
        cumulativeCost = custoPeriodo;
      }

      const custoAcumulado = cumulativeCost;
      const compras = estoqueFinal + custoAcumulado - opening;
      previousFinal = estoqueFinal;

      return {
        ...row,
        saldoInicial: formatPtBrMoneyInput(opening),
        estoqueFinal: formatPtBrMoneyInput(estoqueFinal),
        custoPeriodo: formatPtBrMoneyInput(custoPeriodo),
        custoAcumulado: formatPtBrMoneyInput(custoAcumulado),
        compras: formatPtBrMoneyInput(compras),
      };
    });
  }

  function syncL210RowsFromConfig({ preserveRows = true } = {}) {
    const config = readL210ConfigFromDom();
    const previousRows = preserveRows ? (Array.isArray(state.l210Rows) ? state.l210Rows.slice() : []) : [];
    state.l210Config = config;
    state.l210Rows = buildL210RowsForConfig(config, previousRows);
    syncL210ManualRowsField();
    return config;
  }

  function buildL210ManualPayload() {
    const config = state.l210Config || readL210ConfigFromDom();
    const rows = computeL210DerivedRows(Array.isArray(state.l210Rows) ? state.l210Rows : [], config);
    return {
      apuracao: config.apuracao,
      ano_declaracao: config.anoDeclaracao,
      saldo_inicial_estoque: config.saldoInicialEstoque,
      rows: rows.map((row) => ({
        periodo: row.periodo,
        periodo_key: row.periodoKey,
        estoque_inicial: row.saldoInicial,
        estoque_final: row.estoqueFinal,
        custo: row.custoPeriodo,
        custo_acumulado: row.custoAcumulado,
        compras: row.compras,
      })),
    };
  }

  function syncL210ManualRowsField() {
    const hidden = $('l210ManualRowsJson');
    const payload = buildL210ManualPayload();
    if (!hidden) return payload;
    hidden.value = JSON.stringify(payload);
    return payload;
  }

  function refreshL210ManualPanelRows(payload = null) {
    const panel = $('l210Preview');
    if (!panel) return null;

    const currentPayload = payload || syncL210ManualRowsField() || buildL210ManualPayload();
    const rows = Array.isArray(currentPayload.rows) ? currentPayload.rows : [];

    rows.forEach((row, index) => {
      const rowEl = panel.querySelector(`tr[data-l210-row-index="${index}"]`);
      if (!rowEl) return;

      const setValue = (selector, value) => {
        const input = rowEl.querySelector(selector);
        if (!input || input === document.activeElement) return;
        input.value = value;
      };

      setValue('[data-l210-derived="periodo"]', row.periodo || '');
      setValue('[data-l210-derived="saldoInicial"]', row.estoque_inicial || '0,00');
      setValue('[data-l210-derived="custoAcumulado"]', row.custo_acumulado || '0,00');
      setValue('[data-l210-derived="compras"]', row.compras || '0,00');
    });

    return currentPayload;
  }

  function renderL210ManualPanel() {
    const panel = $('l210Preview');
    if (!panel) return;

    const config = state.l210Config || readL210ConfigFromDom();
    const rows = computeL210DerivedRows(Array.isArray(state.l210Rows) ? state.l210Rows : [], config);
    const rowsHtml = rows.map((row, index) => `
        <tr data-l210-row-index="${escapeHtml(String(index))}" data-l210-row-id="${escapeHtml(row.id || '')}" data-l210-nav-table="l210" data-l210-nav-row="${escapeHtml(String(index + 1))}">
          <td><input type="text" class="speds-input is-readonly" data-l210-derived="periodo" data-l210-row-index="${escapeHtml(String(index))}" value="${escapeHtml(row.periodo || '')}" readonly /></td>
          <td><input type="text" class="speds-input is-readonly" data-l210-derived="saldoInicial" data-l210-row-index="${escapeHtml(String(index))}" value="${escapeHtml(row.saldoInicial || '')}" readonly /></td>
          <td><input type="text" class="speds-input" inputmode="decimal" data-l210-field="estoqueFinal" data-l210-nav-slot="0" data-l210-row-index="${escapeHtml(String(index))}" value="${escapeHtml(row.estoqueFinal || '')}" placeholder="0,00" /></td>
          <td><input type="text" class="speds-input" inputmode="decimal" data-l210-field="custoPeriodo" data-l210-nav-slot="1" data-l210-row-index="${escapeHtml(String(index))}" value="${escapeHtml(row.custoPeriodo || '')}" placeholder="0,00" /></td>
          <td><input type="text" class="speds-input is-readonly" data-l210-derived="custoAcumulado" data-l210-row-index="${escapeHtml(String(index))}" value="${escapeHtml(row.custoAcumulado || '0,00')}" readonly /></td>
          <td><input type="text" class="speds-input is-readonly" data-l210-derived="compras" data-l210-row-index="${escapeHtml(String(index))}" value="${escapeHtml(row.compras || '0,00')}" readonly /></td>
        </tr>
      `).join('');

    panel.innerHTML = `
      <div class="speds-l210-section">
        <div class="speds-l210-head">
          <div>
            <h3>Quadro manual L210</h3>
            <p>O quadro monta automaticamente 12 linhas para apuração mensal ou 4 linhas para apuração trimestral. O saldo inicial de janeiro e replicado para os demais periodos.</p>
          </div>
        </div>
        <div class="speds-l210-table-wrap">
          <table class="speds-y570-table speds-l210-table">
            <colgroup>
              <col class="speds-col-l210-periodo" />
              <col class="speds-col-l210-money" />
              <col class="speds-col-l210-money" />
              <col class="speds-col-l210-money" />
              <col class="speds-col-l210-money" />
              <col class="speds-col-l210-money" />
            </colgroup>
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Saldo inicial</th>
                <th>Saldo final</th>
                <th>Custo do periodo</th>
                <th>Custo acumulado</th>
                <th>Compras calculadas</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="6">Nenhuma linha gerada.</td></tr>'}
            </tbody>
          </table>
        </div>
        <textarea id="l210ManualRowsJson" data-field-key="manual_rows_json" hidden></textarea>
      </div>
    `;

    refreshL210ManualPanelRows(syncL210ManualRowsField());
  }

  function bindL210ConfigPanel() {
    const box = $('dynamicFields');
    if (!box || box.dataset.l210ConfigBound === '1') return;
    box.dataset.l210ConfigBound = '1';

    box.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('[data-l210-config-field]')) return;
      syncL210RowsFromConfig({ preserveRows: true });
      renderL210ManualPanel();
    });

    box.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('[data-l210-config-field]')) return;
      if (target.getAttribute('data-l210-config-field') === 'ano_declaracao') {
        target.value = String(target.value || '').replace(/\D/g, '').slice(0, 4);
      }
    });

    box.addEventListener('focusout', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('[data-l210-config-field]')) return;
      if (target.getAttribute('data-l210-config-field') === 'ano_declaracao') {
        target.value = normalizeL210Year(target.value);
        state.l210Config = readL210ConfigFromDom();
        refreshL210ManualPanelRows(syncL210ManualRowsField());
        return;
      }
      if (target.getAttribute('data-l210-config-field') !== 'saldo_inicial_estoque') return;
      target.value = formatPtBrMoneyInput(target.value);
      state.l210Config = readL210ConfigFromDom();
      refreshL210ManualPanelRows(syncL210ManualRowsField());
    });
  }

  function bindL210ManualPanel() {
    const panel = $('l210Preview');
    if (!panel || panel.dataset.l210RowsBound === '1') return;
    panel.dataset.l210RowsBound = '1';

    panel.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const rowIndex = Number(target.getAttribute('data-l210-row-index'));
      const field = target.getAttribute('data-l210-field');
      if (!Number.isFinite(rowIndex) || !field) return;

      const row = state.l210Rows[rowIndex];
      if (!row) return;

      if (field === 'estoqueFinal') {
        row.estoqueFinal = String(target.value || '');
      } else if (field === 'custoPeriodo') {
        row.custoPeriodo = String(target.value || '');
      } else {
        return;
      }

      refreshL210ManualPanelRows(syncL210ManualRowsField());
    });

    panel.addEventListener('focusout', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const rowIndex = Number(target.getAttribute('data-l210-row-index'));
      const field = target.getAttribute('data-l210-field');
      if (!Number.isFinite(rowIndex) || !field) return;
      if (field !== 'estoqueFinal' && field !== 'custoPeriodo') return;

      const row = state.l210Rows[rowIndex];
      if (!row) return;

      target.value = formatPtBrMoneyInput(target.value);
      row[field] = String(target.value || '');
      refreshL210ManualPanelRows(syncL210ManualRowsField());
    });
  }

  function bindL210KeyboardNavigation() {
    const root = $('spedsForm');
    if (!root || root.dataset.l210NavBound === '1') return;
    root.dataset.l210NavBound = '1';

    const isFocusableNavTarget = (el) => (
      el instanceof HTMLElement
      && !el.hasAttribute('disabled')
      && el.offsetParent !== null
    );

    const findNavTargetInRow = (row, slot) => {
      if (!row || !(row instanceof HTMLElement)) return null;
      const candidates = Array.from(row.querySelectorAll(`[data-l210-nav-slot="${slot}"]`));
      return candidates.find(isFocusableNavTarget) || null;
    };

    const getVisibleRows = () => Array.from(root.querySelectorAll('[data-l210-nav-table="l210"][data-l210-nav-row]'))
      .filter((row) => row instanceof HTMLElement && row.offsetParent !== null);

    const findNavTargetByTraversal = (visibleRows, startIndex, slot, deltaRows, deltaSlots) => {
      const maxSearchRows = visibleRows.length;
      for (let rowStep = deltaRows ? deltaRows : 0, visited = 0; visited < maxSearchRows; visited += 1, rowStep += deltaRows) {
        const row = visibleRows[startIndex + rowStep];
        if (!row) break;
        if (deltaSlots !== 0) {
          const nextSlot = slot + (deltaSlots * (visited + 1));
          const target = findNavTargetInRow(row, nextSlot);
          if (target) return target;
        } else {
          const target = findNavTargetInRow(row, slot);
          if (target) return target;
        }
      }
      return null;
    };

    root.addEventListener('keydown', (event) => {
      const key = String(event.key || '');
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      if (!target || !(target instanceof HTMLElement)) return;
      if (!target.matches('input:not([disabled]), textarea:not([disabled])')) return;

      const currentRow = target.closest('[data-l210-nav-table="l210"][data-l210-nav-row]');
      if (!currentRow) return;

      const slotIndex = Number(target.getAttribute('data-l210-nav-slot'));
      if (!Number.isFinite(slotIndex)) return;

      const visibleRows = getVisibleRows();
      const currentVisibleIndex = visibleRows.indexOf(currentRow);
      if (currentVisibleIndex < 0) return;

      const isTextLike = target.matches('input[type="text"], textarea');
      const hasSelection = typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number'
        && target.selectionStart !== target.selectionEnd;
      const atStart = typeof target.selectionStart === 'number' ? target.selectionStart === 0 : false;
      const atEnd = typeof target.selectionEnd === 'number'
        ? target.selectionEnd === String(target.value || '').length
        : false;

      if (key === 'ArrowLeft' && isTextLike && !hasSelection && !atStart) return;
      if (key === 'ArrowRight' && isTextLike && !hasSelection && !atEnd) return;

      let nextElement = null;
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const delta = key === 'ArrowLeft' ? -1 : 1;
        nextElement = findNavTargetInRow(currentRow, slotIndex + delta);
        if (!nextElement) {
          nextElement = findNavTargetByTraversal(visibleRows, currentVisibleIndex, slotIndex, delta, 0);
        }
      } else if (key === 'ArrowUp' || key === 'ArrowDown') {
        const delta = key === 'ArrowUp' ? -1 : 1;
        nextElement = findNavTargetByTraversal(visibleRows, currentVisibleIndex, slotIndex, delta, 0);
      }

      if (!nextElement || !(nextElement instanceof HTMLElement)) return;

      event.preventDefault();
      nextElement.focus();
      if (typeof nextElement.select === 'function' && nextElement.matches('input[type="text"], textarea')) {
        nextElement.select();
      }
    });
  }

  function isY570EnabledFlag(value) {
    const text = String(value || '').trim().toLowerCase();
    return text === 'sim' || text === 's' || text === 'yes' || text === 'true' || text === '1';
  }

  function normalizeY570FilterText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizeY570CodeInput(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.padStart(4, '0').slice(-4);
  }

  function getY570CodeMap(preview) {
    return new Map((Array.isArray(preview?.codes) ? preview.codes : []).map((item) => [String(item.code || ''), item]));
  }

  function getY570VisibleSources(preview) {
    const codeMap = getY570CodeMap(preview);
    return (Array.isArray(preview?.sources) ? preview.sources : []).filter((row) => codeMap.has(String(row?.code || '')));
  }

  function computeY570Amounts(sourceRow, codeRow) {
    const rendimentoEcf = parsePtBrMoneyInput(sourceRow?.rendimentoEcf ?? sourceRow?.rendimentoEcfNumber ?? sourceRow?.rendimentoOriginal);
    const aliquotaIrrf = parsePtBrMoneyInput(codeRow?.aliquotaIrrf);
    const aliquotaCsll = parsePtBrMoneyInput(codeRow?.aliquotaCsll);
    const code = normalizeY570CodeInput(sourceRow?.code);
    const irrf = code === '3426'
      ? parsePtBrMoneyInput(sourceRow?.tributoRetidoOriginal)
      : ((codeRow?.irrfTributable ?? isY570EnabledFlag(codeRow?.irrf))
      ? (rendimentoEcf * aliquotaIrrf) / 100
      : 0);
    const csll = (codeRow?.csllTributable ?? isY570EnabledFlag(codeRow?.csll))
      ? (rendimentoEcf * aliquotaCsll) / 100
      : 0;
    return {
      rendimentoEcf,
      irrf,
      csll,
    };
  }

  function computeY570PreviewTotals(preview) {
    const sources = getY570VisibleSources(preview);
    return sources.reduce((acc, row) => {
      acc.fontes += 1;
      acc.rendimentoOriginal += parsePtBrMoneyInput(row.rendimentoOriginal);
      acc.tributoRetidoOriginal += parsePtBrMoneyInput(row.tributoRetidoOriginal);
      acc.rendimentoEcf += parsePtBrMoneyInput(row.rendimentoEcf);
      acc.irrf += parsePtBrMoneyInput(row.irrf);
      acc.csll += parsePtBrMoneyInput(row.csll);
      return acc;
    }, {
      fontes: 0,
      rendimentoOriginal: 0,
      tributoRetidoOriginal: 0,
      rendimentoEcf: 0,
      irrf: 0,
      csll: 0,
    });
  }

  function syncY570PreviewFromDom({ recalculate = false } = {}) {
    if (!state.y570Preview) return;
    const preview = state.y570Preview;
    const codeMap = getY570CodeMap(preview);

    document.querySelectorAll('[data-y570-code-row]').forEach((el) => {
      const code = el.getAttribute('data-y570-code-row');
      const codeRow = codeMap.get(String(code || ''));
      if (!codeRow) return;
      const inputIrrf = el.querySelector('[data-y570-code-aliquota-irrf]');
      const inputCsll = el.querySelector('[data-y570-code-aliquota-csll]');
      if (inputIrrf) {
        codeRow.aliquotaIrrf = String(inputIrrf.value || '').trim();
      }
      if (inputCsll) {
        codeRow.aliquotaCsll = String(inputCsll.value || '').trim();
      }
    });

    document.querySelectorAll('[data-y570-source-row]').forEach((el) => {
      const key = el.getAttribute('data-y570-source-row');
      const sourceRow = (preview.sources || []).find((item) => String(item.key || '') === String(key || ''));
      if (!sourceRow) return;
      const codeInput = el.querySelector('[data-y570-source-code]');
      const rendimentoInput = el.querySelector('[data-y570-source-rendimento]');
      const orgaoInput = el.querySelector('[data-y570-source-orgao]');
      const irrfInput = el.querySelector('[data-y570-source-irrf]');
      const csllInput = el.querySelector('[data-y570-source-csll]');
      if (codeInput) {
        sourceRow.code = normalizeY570CodeInput(codeInput.value || sourceRow.code || '');
      }
      if (rendimentoInput) {
        sourceRow.rendimentoEcf = String(rendimentoInput.value || '').trim();
      }
      if (orgaoInput) {
        sourceRow.orgaoPublico = orgaoInput.checked ? 'S' : 'N';
      }
      if (irrfInput) {
        sourceRow.irrf = String(irrfInput.value || '').trim();
      }
      if (csllInput) {
        sourceRow.csll = String(csllInput.value || '').trim();
      }

      if (recalculate) {
        const codeRow = codeMap.get(String(sourceRow.code || '')) || {};
        const amounts = computeY570Amounts(sourceRow, codeRow);
        const irrfFormatted = formatPtBrMoneyInput(amounts.irrf);
        const csllFormatted = formatPtBrMoneyInput(amounts.csll);
        sourceRow.rendimentoEcf = formatPtBrMoneyInput(amounts.rendimentoEcf);
        sourceRow.rendimentoEcfNumber = amounts.rendimentoEcf;
        sourceRow.irrf = irrfFormatted;
        sourceRow.csll = csllFormatted;
        sourceRow.irrfAuto = irrfFormatted;
        sourceRow.csllAuto = csllFormatted;
      }
    });

    if (!recalculate) return;

    for (const sourceRow of preview.sources || []) {
      if (sourceRow.irrfAuto === undefined) {
        sourceRow.irrfAuto = String(sourceRow.irrf || '0,00').trim() || '0,00';
      }
      if (sourceRow.csllAuto === undefined) {
        sourceRow.csllAuto = String(sourceRow.csll || '0,00').trim() || '0,00';
      }
    }
  }

  function applyY570SourceFilters() {
    const preview = state.y570Preview;
    if (!preview) return;
    const filters = state.y570Filters || {};
    const filterCnpj = normalizeY570FilterText(filters.cnpj || '');
    const filterNome = normalizeY570FilterText(filters.nome || '');
    const filterCodigo = normalizeY570FilterText(filters.codigo || '');

    document.querySelectorAll('[data-y570-source-row]').forEach((el) => {
      const searchCnpj = normalizeY570FilterText(el.getAttribute('data-y570-search-cnpj') || '');
      const searchNome = normalizeY570FilterText(el.getAttribute('data-y570-search-nome') || '');
      const searchCodigo = normalizeY570FilterText(el.getAttribute('data-y570-search-codigo') || '');
      const visible =
        (!filterCnpj || searchCnpj.includes(filterCnpj))
        && (!filterNome || searchNome.includes(filterNome))
        && (!filterCodigo || searchCodigo.includes(filterCodigo));
      el.style.display = visible ? '' : 'none';
    });
  }

  function bindY570KeyboardNavigation() {
    const box = $('y570Preview');
    if (!box || box.dataset.y570NavBound === '1') return;
    box.dataset.y570NavBound = '1';

    const isFocusableNavTarget = (el) => (
      el instanceof HTMLElement
      && !el.hasAttribute('disabled')
      && el.offsetParent !== null
    );

    const findNavTargetInRow = (row, slot) => {
      if (!row || !(row instanceof HTMLElement)) return null;
      const candidates = Array.from(row.querySelectorAll(`[data-y570-nav-slot="${slot}"]`));
      return candidates.find(isFocusableNavTarget) || null;
    };

    const findNavTargetByTraversal = (visibleRows, startIndex, slot, deltaRows, deltaSlots) => {
      const maxSearchRows = visibleRows.length;
      for (let rowStep = deltaRows ? deltaRows : 0, visited = 0; visited < maxSearchRows; visited += 1, rowStep += deltaRows) {
        const row = visibleRows[startIndex + rowStep];
        if (!row) break;
        if (deltaSlots !== 0) {
          const nextSlot = slot + (deltaSlots * (visited + 1));
          const target = findNavTargetInRow(row, nextSlot);
          if (target) return target;
        } else {
          const target = findNavTargetInRow(row, slot);
          if (target) return target;
        }
      }
      return null;
    };

    box.addEventListener('keydown', (event) => {
      const key = String(event.key || '');
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      if (!target || !(target instanceof HTMLElement)) return;
      if (!target.matches('input:not([disabled]), textarea:not([disabled]), select:not([disabled])')) return;

      const currentRow = target.closest('tr[data-y570-nav-table][data-y570-nav-row]');
      if (!currentRow) return;
      const tableKey = currentRow.getAttribute('data-y570-nav-table') || '';
      const rowIndex = Number(currentRow.getAttribute('data-y570-nav-row'));
      const slotIndex = Number(target.getAttribute('data-y570-nav-slot'));
      if (!Number.isFinite(rowIndex) || !Number.isFinite(slotIndex)) return;

      const visibleRows = Array.from(box.querySelectorAll(`tr[data-y570-nav-table="${CSS.escape(tableKey)}"][data-y570-nav-row]`))
        .filter((row) => row instanceof HTMLElement && row.offsetParent !== null);
      const currentVisibleIndex = visibleRows.indexOf(currentRow);
      if (currentVisibleIndex < 0) return;

      const isTextLike = target.matches('input[type="text"], textarea');
      const hasSelection = typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number'
        && target.selectionStart !== target.selectionEnd;
      const atStart = typeof target.selectionStart === 'number' ? target.selectionStart === 0 : false;
      const atEnd = typeof target.selectionEnd === 'number'
        ? target.selectionEnd === String(target.value || '').length
        : false;

      if (key === 'ArrowLeft' && isTextLike && !hasSelection && !atStart) return;
      if (key === 'ArrowRight' && isTextLike && !hasSelection && !atEnd) return;

      let nextElement = null;
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const delta = key === 'ArrowLeft' ? -1 : 1;
        nextElement = findNavTargetInRow(currentRow, slotIndex + delta);
        if (!nextElement) {
          nextElement = findNavTargetByTraversal(visibleRows, currentVisibleIndex, slotIndex, delta, 0);
        }
      } else if (key === 'ArrowUp' || key === 'ArrowDown') {
        const delta = key === 'ArrowUp' ? -1 : 1;
        nextElement = findNavTargetByTraversal(visibleRows, currentVisibleIndex, slotIndex, delta, 0);
      }

      if (!nextElement || !(nextElement instanceof HTMLElement)) return;

      event.preventDefault();
      nextElement.focus();
      if (typeof nextElement.select === 'function' && nextElement.matches('input[type="text"], textarea')) {
        nextElement.select();
      }
    });
  }

  function renderY570Preview(preview) {
    const panel = $('y570Panel');
    const box = $('y570Preview');
    if (!panel || !box) return;

    state.y570Preview = preview || null;
    if (!preview) {
      panel.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    panel.style.display = 'block';

    const stats = preview.stats || {};
    const codeMap = getY570CodeMap(preview);
    const visibleSources = getY570VisibleSources(preview);
    const totals = computeY570PreviewTotals(preview);
    const codeOptionsHtml = (preview.codes || []).map((row) => `<option value="${escapeHtml(row.code || '')}">${escapeHtml(`${row.code || ''} - ${row.description || ''}`)}</option>`).join('');
    const summaryCards = [
      { label: 'Fontes agrupadas', value: totals.fontes || stats.fontesAgrupadas || visibleSources.length },
      { label: 'Códigos utilizáveis na ECF', value: stats.codigosLocalizados ?? (preview.codes || []).length },
      { label: 'Códigos não localizados', value: stats.codigosNaoLocalizados ?? (preview.missing || []).length },
      { label: 'Rendimento original', value: formatPtBrMoneyInput(totals.rendimentoOriginal || parsePtBrMoneyInput(stats.rendimentoTotal)) },
      { label: 'Tributo retido original', value: formatPtBrMoneyInput(totals.tributoRetidoOriginal || parsePtBrMoneyInput(stats.tributoTotal)) },
      { label: 'Rendimento ECF', value: formatPtBrMoneyInput(totals.rendimentoEcf || parsePtBrMoneyInput(stats.rendimentoEcfTotal)) },
      { label: 'IRRF', value: formatPtBrMoneyInput(totals.irrf || parsePtBrMoneyInput(stats.irrfTotal)) },
      { label: 'CSLL', value: formatPtBrMoneyInput(totals.csll || parsePtBrMoneyInput(stats.csllTotal)) },
    ];

    const codesHtml = (preview.codes || []).map((row, index) => {
      const irrfTributable = Boolean(row.irrfTributable) || isY570EnabledFlag(row.irrf);
      const csllTributable = Boolean(row.csllTributable) || isY570EnabledFlag(row.csll);
      const orgaoEditable = String(row.orgaoPublico || '').toLowerCase() === 'sim ou nao';
      const aliquotaIrrf = formatPtBrMoneyInput(row.aliquotaIrrf || 0);
      const aliquotaCsll = formatPtBrMoneyInput(row.aliquotaCsll || (csllTributable ? 1 : 0));
      return `
        <tr data-y570-code-row="${escapeHtml(row.code || '')}" data-y570-nav-table="codes" data-y570-nav-row="${escapeHtml(String(index))}">
          <td><strong>${escapeHtml(row.code || '')}</strong></td>
          <td>${escapeHtml(row.description || '')}</td>
          <td><span class="speds-y570-badge ${orgaoEditable ? 'is-warn' : 'is-ok'}">${escapeHtml(row.orgaoPublico || '')}</span></td>
          <td><span class="speds-y570-badge ${irrfTributable ? 'is-ok' : 'is-warn'}">${irrfTributable ? 'Sim' : 'Não'}</span></td>
          <td><input type="text" inputmode="decimal" data-y570-code-aliquota-irrf data-y570-nav-slot="0" value="${escapeHtml(aliquotaIrrf)}" placeholder="0,00" ${irrfTributable ? '' : 'disabled'} /></td>
          <td><span class="speds-y570-badge ${csllTributable ? 'is-ok' : 'is-warn'}">${csllTributable ? 'Sim' : 'Não'}</span></td>
          <td><input type="text" inputmode="decimal" data-y570-code-aliquota-csll data-y570-nav-slot="1" value="${escapeHtml(aliquotaCsll)}" placeholder="0,00" ${csllTributable ? '' : 'disabled'} /></td>
          <td>${escapeHtml(String(row.occurrences || 0))}</td>
        </tr>
      `;
    }).join('');

    const sourcesHtml = visibleSources.map((row, index) => {
      const codeRow = codeMap.get(String(row.code || '')) || {};
      const orgaoEditable = String(codeRow.orgaoPublico || '').toLowerCase() === 'sim ou nao';
      const orgaoChecked = String(row.orgaoPublico || 'N').toUpperCase() === 'S';
      const rendimentoValue = formatPtBrMoneyInput(row.rendimentoEcf || row.rendimentoEcfNumber || row.rendimentoOriginal || 0);
      const irrfValue = formatPtBrMoneyInput(row.irrf ?? row.irrfAuto ?? 0);
      const csllValue = formatPtBrMoneyInput(row.csll ?? row.csllAuto ?? 0);
      return `
        <tr data-y570-source-row="${escapeHtml(row.key || '')}" data-y570-nav-table="sources" data-y570-nav-row="${escapeHtml(String(index))}" data-y570-search-cnpj="${escapeHtml(row.cnpj || '')}" data-y570-search-nome="${escapeHtml(row.nome || '')}" data-y570-search-codigo="${escapeHtml(row.code || '')}">
          <td>${escapeHtml(row.cnpj || '')}</td>
          <td>${escapeHtml(row.nome || '')}</td>
          <td><input type="text" inputmode="numeric" maxlength="4" list="y570CodeOptions" data-y570-source-code data-y570-nav-slot="0" value="${escapeHtml(row.code || '')}" /></td>
          <td>
            <label class="speds-inline-checkbox${orgaoEditable ? '' : ' is-disabled'}">
              <input type="checkbox" data-y570-source-orgao data-y570-nav-slot="1" ${orgaoChecked ? 'checked' : ''} ${orgaoEditable ? '' : 'disabled'} />
              <span>${orgaoEditable ? 'Editar' : codeRow.orgaoPublico || row.orgaoPublico || 'N'}</span>
            </label>
          </td>
          <td>${escapeHtml(row.rendimentoOriginal || '0,00')}</td>
          <td>${escapeHtml(row.tributoRetidoOriginal || '0,00')}</td>
          <td><input type="text" inputmode="decimal" data-y570-source-rendimento data-y570-nav-slot="2" value="${escapeHtml(rendimentoValue)}" /></td>
          <td><input type="text" inputmode="decimal" data-y570-source-irrf data-y570-nav-slot="3" value="${escapeHtml(irrfValue)}" /></td>
          <td><input type="text" inputmode="decimal" data-y570-source-csll data-y570-nav-slot="4" value="${escapeHtml(csllValue)}" /></td>
        </tr>
      `;
    }).join('');

    const totalRowHtml = `
      <tr class="speds-y570-total-row">
        <td><strong>TOTAL GERAL</strong></td>
        <td></td>
        <td></td>
        <td></td>
        <td>${escapeHtml(formatPtBrMoneyInput(totals.rendimentoOriginal))}</td>
        <td>${escapeHtml(formatPtBrMoneyInput(totals.tributoRetidoOriginal))}</td>
        <td>${escapeHtml(formatPtBrMoneyInput(totals.rendimentoEcf))}</td>
        <td>${escapeHtml(formatPtBrMoneyInput(totals.irrf))}</td>
        <td>${escapeHtml(formatPtBrMoneyInput(totals.csll))}</td>
      </tr>
    `;

    const missingHtml = (preview.missing || []).map((row) => `
      <tr class="is-missing">
        <td><strong>${escapeHtml(row.code || '')}</strong></td>
        <td>${escapeHtml(String(row.occurrences || 0))}</td>
      </tr>
    `).join('');

    box.innerHTML = `
      <div class="speds-y570-section">
        <h3>Resumo</h3>
        <div class="speds-y570-summary">
          ${summaryCards.map((item) => `
            <div class="speds-y570-summary-card">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(String(item.value ?? '-'))}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="speds-y570-section">
        <h3>Codigos utilizaveis na ECF</h3>
        <p>Use as colunas de alíquota do IRRF e da CSLL para definir os percentuais do DARF. Os campos de fontes pagadoras continuam editáveis e são recalculados automaticamente quando os percentuais mudam.</p>
        <div class="speds-y570-table-wrap">
          <table class="speds-y570-table speds-y570-codes-table">
            <colgroup>
              <col class="speds-col-code" />
              <col class="speds-col-description" />
              <col class="speds-col-orgao" />
              <col class="speds-col-irrf-flag" />
              <col class="speds-col-irrf-rate" />
              <col class="speds-col-csll-flag" />
              <col class="speds-col-csll-rate" />
              <col class="speds-col-occurrences" />
            </colgroup>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Descricao</th>
                <th>Orgao publico</th>
                <th>IRRF</th>
                <th>Aliquota IRRF (%)</th>
                <th>CSLL</th>
                <th>Aliquota CSLL (%)</th>
                <th>Ocorrencias</th>
              </tr>
            </thead>
            <tbody>${codesHtml || '<tr><td colspan="8">Nenhum codigo utilizavel na ECF.</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="speds-y570-section">
        <h3>Fontes pagadoras</h3>
        <p>Os campos CNPJ, nome e valores originais vêm do TXT. Rendimento ECF, IRRF, CSLL e o checkbox de órgão público ficam prontos para revisão antes da exportação.</p>
        <div class="speds-y570-filters">
          <label class="speds-field">
            <span>CNPJ</span>
            <input type="text" class="speds-input" data-y570-filter-cnpj value="${escapeHtml(state.y570Filters.cnpj || '')}" placeholder="Filtrar por CNPJ" />
          </label>
          <label class="speds-field">
            <span>Nome</span>
            <input type="text" class="speds-input" data-y570-filter-nome value="${escapeHtml(state.y570Filters.nome || '')}" placeholder="Filtrar por nome" />
          </label>
          <label class="speds-field">
            <span>Código DARF</span>
            <input type="text" class="speds-input" data-y570-filter-codigo value="${escapeHtml(state.y570Filters.codigo || '')}" placeholder="Filtrar por código" />
          </label>
        </div>
        <div class="speds-y570-table-wrap">
          <table class="speds-y570-table speds-y570-sources-table">
            <colgroup>
              <col class="speds-col-cnpj" />
              <col class="speds-col-nome" />
              <col class="speds-col-codigo" />
              <col class="speds-col-orgao" />
              <col class="speds-col-rend-orig" />
              <col class="speds-col-trib-orig" />
              <col class="speds-col-rend-ecf" />
              <col class="speds-col-irrf" />
              <col class="speds-col-csll" />
            </colgroup>
            <thead>
              <tr>
                <th>CNPJ</th>
                <th>Nome</th>
                <th>Codigo DARF</th>
                <th>Orgao publico</th>
                <th>Rendimento original</th>
                <th>Tributo retido original</th>
                <th>Rendimento ECF</th>
                <th>IRRF</th>
                <th>CSLL</th>
              </tr>
            </thead>
            <tbody class="speds-y570-total-top">${totalRowHtml}</tbody>
            <tbody>${sourcesHtml || '<tr><td colspan="9">Nenhuma fonte pagadora encontrada.</td></tr>'}</tbody>
            <tfoot>${totalRowHtml}</tfoot>
          </table>
        </div>
      </div>

      <datalist id="y570CodeOptions">${codeOptionsHtml}</datalist>

      <div class="speds-y570-section">
        <h3>Codigos nao localizados</h3>
        <div class="speds-y570-table-wrap">
          <table class="speds-y570-table">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Ocorrencias</th>
              </tr>
            </thead>
            <tbody>${missingHtml || '<tr><td colspan="2">Nenhum codigo fora da base aceita.</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="speds-y570-actions">
        <button type="button" class="btn btn-secondary" id="btnRecalcularY570">Recalcular quadros</button>
        <button type="button" class="btn btn-primary" id="btnExportY570Txt">Gerar TXT Y570</button>
      </div>
    `;

    const refreshBtn = $('btnRecalcularY570');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        syncY570PreviewFromDom({ recalculate: true });
        renderY570Preview(state.y570Preview);
      };
    }

    const exportBtn = $('btnExportY570Txt');
    if (exportBtn) {
      exportBtn.onclick = handleExportY570Txt;
    }

    bindY570KeyboardNavigation();

    document.querySelectorAll('[data-y570-code-aliquota-irrf], [data-y570-code-aliquota-csll], [data-y570-source-code], [data-y570-source-rendimento], [data-y570-source-irrf], [data-y570-source-csll], [data-y570-source-orgao]').forEach((el) => {
      if (el.dataset.y570Bound === '1') return;
      el.dataset.y570Bound = '1';
      el.addEventListener('change', () => {
        const requiresRecalc = Boolean(
          el.hasAttribute('data-y570-code-aliquota-irrf')
          || el.hasAttribute('data-y570-code-aliquota-csll')
          || el.hasAttribute('data-y570-source-code')
          || el.hasAttribute('data-y570-source-rendimento')
        );
        syncY570PreviewFromDom({ recalculate: requiresRecalc });
        renderY570Preview(state.y570Preview);
      });
    });

    document.querySelectorAll('[data-y570-filter-cnpj], [data-y570-filter-nome], [data-y570-filter-codigo]').forEach((el) => {
      if (el.dataset.y570FilterBound === '1') return;
      el.dataset.y570FilterBound = '1';
      el.addEventListener('input', () => {
        state.y570Filters = state.y570Filters || {};
        state.y570Filters.cnpj = $('y570Preview').querySelector('[data-y570-filter-cnpj]')?.value || '';
        state.y570Filters.nome = $('y570Preview').querySelector('[data-y570-filter-nome]')?.value || '';
        state.y570Filters.codigo = $('y570Preview').querySelector('[data-y570-filter-codigo]')?.value || '';
        applyY570SourceFilters();
      });
    });

    applyY570SourceFilters();
  }

  async function handleExportY570Txt() {
    if (!state.y570Preview) {
      setStatus('Monte os quadros do Y570 antes de gerar o TXT.', true);
      return;
    }

    syncY570PreviewFromDom({ recalculate: false });

    const submitBtn = $('btnRunTemplate');
    const exportBtn = $('btnExportY570Txt');
    if (submitBtn) submitBtn.disabled = true;
    if (exportBtn) exportBtn.disabled = true;
    setStatus('Gerando o TXT final do Y570...', false);

    try {
      const resp = await AuthClient.authFetch(`${API_BASE}/y570/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: state.y570Preview.jobId,
          preview: state.y570Preview,
        }),
      });
      const data = await safeJson(resp);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao gerar o TXT final do Y570.');
      }

      setStatus(`TXT gerado com sucesso (job ${data.jobId}).`, false);
      renderDownloads(data.artifact || null);
    } catch (error) {
      console.error(error);
      setStatus(error?.message || 'Erro ao gerar o TXT final do Y570.', true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (exportBtn) exportBtn.disabled = false;
    }
  }

  function bindInputValidation(template) {
    document.querySelectorAll('[data-input-key]').forEach((el) => {
      el.addEventListener('change', () => {
        const errors = validateFilesByTemplate(template);
        setErrors(errors);
      });
    });
  }

  async function loadSpedTypes() {
    const resp = await AuthClient.authFetch(`${API_BASE}/types`, { method: 'GET' });
    const data = await safeJson(resp);
    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || 'Falha ao carregar tipos de SPED.');
    }

    state.spedTypes = Array.isArray(data.spedTypes) ? data.spedTypes : [];
    const select = $('spedTypeSelect');
    select.innerHTML = '';

    for (const type of state.spedTypes) {
      const opt = document.createElement('option');
      opt.value = type.id;
      opt.textContent = `${type.label}`;
      select.appendChild(opt);
    }

    const first = state.spedTypes[0] || null;
    if (first) {
      select.value = first.id;
      updateSpedTypeMeta(first);
    }
  }

  function updateSpedTypeMeta(type) {
    const meta = $('spedTypeMeta');
    if (!meta || !type) return;
    meta.textContent = `${type.templates || 0} template(s) disponível(is) | ${type.layoutJsonCount || 0} layout(s) JSON no repositório.`;
  }

  async function loadTemplates(spedType) {
    const resp = await AuthClient.authFetch(`${API_BASE}/templates?spedType=${encodeURIComponent(spedType)}`, {
      method: 'GET',
    });
    const data = await safeJson(resp);
    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || 'Falha ao carregar templates.');
    }

    state.templates = Array.isArray(data.templates) ? data.templates : [];
    const select = $('templateSelect');
    select.innerHTML = '';

    for (const template of state.templates) {
      const opt = document.createElement('option');
      opt.value = template.id;
      opt.textContent = template.title;
      select.appendChild(opt);
    }

    const first = state.templates[0] || null;
    if (first) {
      select.value = first.id;
      $('templateMeta').textContent = first.description || '';
      await loadTemplateDetails(spedType, first.id);
    } else {
      $('templateMeta').textContent = 'Nenhum template cadastrado para este tipo de SPED.';
      renderTemplateDetails(null);
    }
  }

  async function loadTemplateDetails(spedType, templateId) {
    const resp = await AuthClient.authFetch(
      `${API_BASE}/templates/${encodeURIComponent(templateId)}?spedType=${encodeURIComponent(spedType)}`,
      { method: 'GET' }
    );
    const data = await safeJson(resp);
    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || 'Falha ao carregar detalhes do template.');
    }

    state.currentTemplate = data.template || null;
    renderTemplateDetails(state.currentTemplate);
  }

  function renderTemplateDetails(template) {
    const infoEl = $('templateInfo');
    const inputsEl = $('dynamicInputs');
    const fieldsEl = $('dynamicFields');
    const outputFormatEl = $('outputFormatSelect');

    infoEl.innerHTML = '';
    inputsEl.innerHTML = '';
    fieldsEl.innerHTML = '';
    outputFormatEl.innerHTML = '';
    clearResult();

    if (!template) {
      infoEl.innerHTML = '<h3>Sem template selecionado</h3><p>Escolha um tipo de SPED para carregar as funções.</p>';
      return;
    }

    const requirements = (template.inputs || []).map((input) => {
      const req = input.required ? 'Obrigatório' : 'Opcional';
      const multi = input.multiple ? 'Múltiplos arquivos' : 'Arquivo único';
      const accepts = (input.acceptedExtensions || []).join(', ');
      return `
        <div class="speds-requirement">
          <strong>${escapeHtml(input.label)}</strong>
          <div class="speds-muted">${req} - ${multi}</div>
          <div class="speds-muted">Aceita: ${escapeHtml(accepts)}</div>
        </div>
      `;
    }).join('');

    infoEl.innerHTML = `
      <h3>${escapeHtml(template.title)}</h3>
      <p>${escapeHtml(template.description || '')}</p>
      <div class="speds-muted">Script vinculado: ${escapeHtml(template.script?.entry || 'Nao informado')}</div>
      <div class="speds-requirements">${requirements || '<div class="speds-muted">Sem entradas configuradas.</div>'}</div>
    `;

    if (isL210Template(template)) {
      inputsEl.innerHTML = '';
      const fieldMap = new Map((template.fields || []).map((field) => [String(field.key || ''), field]));
      const apuracaoField = fieldMap.get('apuracao') || {};
      const anoField = fieldMap.get('ano_declaracao') || {};
      const saldoField = fieldMap.get('saldo_inicial_estoque') || {};
      const defaultYear = getL210DefaultYear();
      const apuracaoSelected = normalizeL210Apuracao(apuracaoField.defaultValue || 'mensal');
      const anoValue = state.l210Config.anoDeclaracao || anoField.defaultValue || defaultYear;
      const saldoValue = state.l210Config.saldoInicialEstoque || saldoField.defaultValue || '0,00';

      fieldsEl.innerHTML = `
        <div class="speds-l210-stack">
          <div class="speds-l210-config" data-l210-nav-table="l210" data-l210-nav-row="0">
            <label class="auth-label speds-field speds-l210-config-field">
              <span>${escapeHtml(apuracaoField.label || 'Apuracao')}</span>
              <select id="field__apuracao" class="speds-select speds-l210-select" data-field-key="apuracao" data-l210-config-field="apuracao" required>
                <option value="mensal" ${apuracaoSelected === 'mensal' ? 'selected' : ''}>Mensal</option>
                <option value="trimestral" ${apuracaoSelected === 'trimestral' ? 'selected' : ''}>Trimestral</option>
              </select>
            </label>
            <label class="auth-label speds-field speds-l210-config-field">
              <span>${escapeHtml(anoField.label || 'Ano da declaracao')}</span>
              <input id="field__ano_declaracao" class="speds-input speds-l210-small-input" type="number" inputmode="numeric" min="2000" max="2099" required data-field-key="ano_declaracao" data-l210-config-field="ano_declaracao" data-l210-nav-slot="0" value="${escapeHtml(String(anoValue || ''))}" placeholder="${escapeHtml(anoField.placeholder || defaultYear)}" />
            </label>
            <label class="auth-label speds-field speds-l210-config-field">
              <span>${escapeHtml(saldoField.label || 'Saldo inicial do estoque')}</span>
              <input id="field__saldo_inicial_estoque" class="speds-input speds-l210-small-input" type="text" inputmode="decimal" required data-field-key="saldo_inicial_estoque" data-l210-config-field="saldo_inicial_estoque" data-l210-nav-slot="1" value="${escapeHtml(String(saldoValue || '0,00'))}" placeholder="${escapeHtml(saldoField.placeholder || '0,00')}" />
            </label>
          </div>
          <div class="speds-l210-panel">
            <div id="l210Preview"></div>
          </div>
        </div>
      `;
      syncL210RowsFromConfig({ preserveRows: false });
      bindL210ConfigPanel();
      renderL210ManualPanel();
      bindL210ManualPanel();
      bindL210KeyboardNavigation();
    } else {
      for (const input of template.inputs || []) {
        const wrap = document.createElement('div');
        wrap.className = 'auth-label speds-field';
        const accepts = (input.acceptedExtensions || []).join(',');
        const requiredMark = input.required ? ' *' : '';
        wrap.innerHTML = `
          <label for="input__${escapeHtml(input.key)}">${escapeHtml(input.label)}${requiredMark}</label>
          <input
            id="input__${escapeHtml(input.key)}"
            class="speds-input"
            type="file"
            ${input.multiple ? 'multiple' : ''}
            ${input.required ? 'required' : ''}
            accept="${escapeHtml(accepts)}"
            data-input-key="${escapeHtml(input.key)}"
          />
          <span class="speds-file-help">${escapeHtml(input.help || '')}</span>
        `;
        inputsEl.appendChild(wrap);
      }

      for (const field of template.fields || []) {
        const wrap = document.createElement('div');
        wrap.className = 'auth-label speds-field';
        const requiredMark = field.required ? ' *' : '';
        const fieldId = `field__${field.key}`;

        let html = `<label for="${escapeHtml(fieldId)}">${escapeHtml(field.label)}${requiredMark}</label>`;

        if (field.type === 'select') {
          const options = Array.isArray(field.options) ? field.options : [];
          const optsHtml = options
            .map((opt) => {
              const selected = String(opt.value) === String(field.defaultValue || '') ? 'selected' : '';
              return `<option value="${escapeHtml(opt.value)}" ${selected}>${escapeHtml(opt.label)}</option>`;
            })
            .join('');
          html += `<select id="${escapeHtml(fieldId)}" class="speds-select" ${field.required ? 'required' : ''} data-field-key="${escapeHtml(field.key)}">${optsHtml}</select>`;
        } else if (field.type === 'textarea') {
          html += `<textarea id="${escapeHtml(fieldId)}" class="speds-textarea" ${field.required ? 'required' : ''} data-field-key="${escapeHtml(field.key)}" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(field.defaultValue || '')}</textarea>`;
        } else {
          const inputType = field.type === 'number' ? 'number' : 'text';
          html += `<input id="${escapeHtml(fieldId)}" class="speds-input" type="${inputType}" ${field.required ? 'required' : ''} data-field-key="${escapeHtml(field.key)}" value="${escapeHtml(field.defaultValue || '')}" placeholder="${escapeHtml(field.placeholder || '')}" />`;
        }

        wrap.innerHTML = html;
        fieldsEl.appendChild(wrap);
      }
    }

    const outputFormats = Array.isArray(template.outputFormats) ? template.outputFormats : [];
    for (const format of outputFormats) {
      const opt = document.createElement('option');
      opt.value = format;
      opt.textContent = `.${format}`;
      outputFormatEl.appendChild(opt);
    }

    $('templateMeta').textContent = template.description || '';
    bindInputValidation(template);

    const submitBtn = $('btnRunTemplate');
    if (submitBtn) {
      submitBtn.textContent = isY570Template(template) ? 'Montar quadros' : (isL210Template(template) ? 'Gerar TXT' : 'Executar');
    }
  }

  function collectFields() {
    const out = {};
    document.querySelectorAll('[data-field-key]').forEach((el) => {
      const key = el.getAttribute('data-field-key');
      if (!key) return;
      out[key] = el.value;
    });
    return out;
  }

  function buildSummary(summary) {
    const el = $('runSummary');
    if (!summary) {
      el.innerHTML = '';
      return;
    }
    const items = [
      { label: 'Job ID', value: summary.jobId || '-' },
      { label: 'Template', value: summary.templateTitle || '-' },
      { label: 'Arquivos', value: String(Array.isArray(summary.files) ? summary.files.length : 0) },
      { label: 'Campos', value: String(Array.isArray(summary.fields) ? summary.fields.length : 0) },
    ];
    if (summary?.validationFindings) {
      items.push({
        label: 'Pendencias',
        value: String(Number(summary.validationFindings?.totals?.invalidRefs || 0)),
      });
    }
    if (summary?.y570?.stats) {
      items.push({ label: 'Fontes agrupadas', value: String(summary.y570.stats.fontesAgrupadas || 0) });
      items.push({ label: 'Códigos utilizáveis na ECF', value: String(summary.y570.stats.codigosLocalizados || 0) });
      items.push({ label: 'Códigos não localizados', value: String(summary.y570.stats.codigosNaoLocalizados || 0) });
      items.push({ label: 'Rendimento original', value: formatPtBrMoneyInput(summary.y570.stats.rendimentoTotal || 0) });
      items.push({ label: 'Tributo retido original', value: formatPtBrMoneyInput(summary.y570.stats.tributoTotal || 0) });
      items.push({ label: 'Rendimento ECF', value: formatPtBrMoneyInput(summary.y570.stats.rendimentoEcfTotal || 0) });
      items.push({ label: 'IRRF', value: formatPtBrMoneyInput(summary.y570.stats.irrfTotal || 0) });
      items.push({ label: 'CSLL', value: formatPtBrMoneyInput(summary.y570.stats.csllTotal || 0) });
    }

    el.innerHTML = items
      .map((item) => `<div class="speds-kpi"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></div>`)
      .join('');
  }

  function renderValidationInsights(findings) {
    const box = $('validationInsights');
    if (!box) return;

    if (!findings || typeof findings !== 'object') {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    const totals = findings?.totals || {};
    const invalidRefs = Number(totals?.invalidRefs || 0);
    const checks = Number(totals?.checks || 0);
    const grouped = Array.isArray(findings?.groupedIssues) ? findings.groupedIssues : [];
    const firstOccurrences = Array.isArray(findings?.firstOccurrences) ? findings.firstOccurrences : [];
    const missingDomains = Array.isArray(findings?.domainsWithoutDefinitions) ? findings.domainsWithoutDefinitions : [];
    const statusOk = String(findings?.status || '') === 'ok';
    const statusText = statusOk ? 'Sem pendencias encontradas.' : 'Pendencias encontradas. Revise os itens abaixo.';

    const groupedHtml = grouped.length === 0
      ? '<div class="speds-validation-empty">Nenhuma pendencia agrupada.</div>'
      : grouped.slice(0, 12).map((item) => `
          <div class="speds-validation-item">
            <div class="speds-validation-item-top">
              <strong>${escapeHtml(`${item.count}x`)}</strong>
              <span>${escapeHtml(item.domainLabel || item.domain || 'Dominio')}</span>
            </div>
            <div class="speds-validation-item-body">${escapeHtml(item.message || '')}</div>
            <div class="speds-validation-item-help">Onde corrigir: ${escapeHtml(item.expectedDefinition || '')}</div>
            <div class="speds-validation-item-help">Como corrigir: ${escapeHtml(item.howToFix || '')}</div>
          </div>
        `).join('');

    const missingHtml = missingDomains.length === 0
      ? ''
      : `
        <div class="speds-validation-block">
          <h4>Cadastros ausentes no arquivo</h4>
          <div class="speds-validation-list">
            ${missingDomains.map((item) => `
              <div class="speds-validation-item">
                <div class="speds-validation-item-top">
                  <strong>${escapeHtml(item.domain || '')}</strong>
                  <span>${escapeHtml(item.domainLabel || '')}</span>
                </div>
                <div class="speds-validation-item-help">Necessario: ${escapeHtml(item.expectedDefinition || '')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

    const occurrencesHtml = firstOccurrences.length === 0
      ? ''
      : `
        <div class="speds-validation-block">
          <h4>Primeiras linhas com pendencia</h4>
          <div class="speds-validation-lines">
            ${firstOccurrences.slice(0, 12).map((item) => `
              <div class="speds-validation-line">
                Linha ${escapeHtml(String(item.lineNumber || 0))}: ${escapeHtml(item.message || '')}
              </div>
            `).join('')}
          </div>
        </div>
      `;

    box.className = `speds-validation-panel ${statusOk ? 'is-ok' : 'is-issues'}`;
    box.innerHTML = `
      <div class="speds-validation-head">
        <h3>Leitura amigavel da validacao</h3>
        <p>${escapeHtml(statusText)}</p>
      </div>
      <div class="speds-validation-kpis">
        <div class="speds-validation-kpi"><strong>Checagens</strong><span>${escapeHtml(String(checks))}</span></div>
        <div class="speds-validation-kpi"><strong>Pendencias</strong><span>${escapeHtml(String(invalidRefs))}</span></div>
      </div>
      <div class="speds-validation-block">
        <h4>Principais causas</h4>
        <div class="speds-validation-list">${groupedHtml}</div>
      </div>
      ${missingHtml}
      ${occurrencesHtml}
    `;
    box.style.display = 'block';
  }

  function renderDownloads(artifact) {
    const listEl = $('downloadList');
    listEl.innerHTML = '';
    if (!artifact?.downloadPath) return;

    listEl.innerHTML = `
      <div class="speds-download-item">
        <div>
          <strong>${escapeHtml(artifact.fileName || 'Resultado')}</strong>
        <div class="speds-muted">${escapeHtml(artifact.mimeType || '')}</div>
      </div>
      <a class="btn btn-secondary" href="${escapeHtml(artifact.downloadPath)}">Baixar</a>
    </div>
    `;

    if (artifact.downloadPath !== state.lastAutoDownloadPath) {
      state.lastAutoDownloadPath = artifact.downloadPath;
      setTimeout(() => {
        const autoLink = document.createElement('a');
        autoLink.href = artifact.downloadPath;
        autoLink.download = artifact.fileName || '';
        autoLink.rel = 'noopener';
        autoLink.style.display = 'none';
        document.body.appendChild(autoLink);
        autoLink.click();
        autoLink.remove();
      }, 0);
    }
  }

  async function handleRun(event) {
    event.preventDefault();
    setErrors([]);

    const spedType = $('spedTypeSelect').value;
    const templateId = $('templateSelect').value;
    const outputFormat = $('outputFormatSelect').value || 'txt';

    if (!spedType || !templateId) {
      setStatus('Selecione um tipo de SPED e um template antes de executar.', true);
      return;
    }

    const template = state.currentTemplate;
    clearResult({ preserveL210State: isL210Template(template) });
    if (isL210Template(template)) {
      syncL210RowsFromConfig({ preserveRows: true });
      renderL210ManualPanel();
    }
    const fileErrors = validateFilesByTemplate(template);
    const fieldErrors = validateRequiredFields(template);
    const templateRuleErrors = validateTemplateSpecificRules(template);
    const validationErrors = [...fileErrors, ...fieldErrors, ...templateRuleErrors];
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setStatus(
        isL210Template(template)
          ? 'Revise o quadro manual e os campos obrigatórios antes de executar.'
          : 'Revise os anexos e campos obrigatórios antes de executar.',
        true
      );
      return;
    }

    const submitBtn = $('btnRunTemplate');
    submitBtn.disabled = true;
    submitBtn.textContent = isY570Template(template)
      ? 'Montando quadros...'
      : (isL210Template(template) ? 'Gerando TXT...' : 'Executando...');
    setStatus(
      isY570Template(template)
        ? 'Montando os quadros do Y570...'
        : (isL210Template(template) ? 'Gerando o TXT manual do L210...' : 'Processando arquivos...'),
      false
    );

    try {
      if (isY570Template(template)) {
        const formData = new FormData();
        document.querySelectorAll('[data-input-key]').forEach((input) => {
          const key = input.getAttribute('data-input-key');
          if (!key || !input.files) return;
          for (const file of input.files) {
            formData.append(`input__${key}`, file);
          }
        });

        const resp = await AuthClient.authFetch(`${API_BASE}/y570/preview`, {
          method: 'POST',
          body: formData,
        });
        const data = await safeJson(resp);
        if (!resp.ok || !data?.ok) {
          const error = data?.error || 'Falha ao montar o preview do Y570.';
          const details = Array.isArray(data?.details) ? data.details.slice() : [];
          if (data?.traceId) {
            details.unshift(`Trace ID: ${data.traceId}`);
          }
          throw { message: error, details };
        }

        buildSummary(data.summary || data.preview || null);
        renderValidationInsights(null);
        renderY570Preview(data.preview || null);
        renderDownloads(null);
        setStatus(`Quadros montados com sucesso (job ${data.jobId}). Revise e gere o TXT final.`, false);
        submitBtn.textContent = 'Recalcular quadros';
        return;
      }

      const formData = new FormData();
      formData.append('spedType', spedType);
      formData.append('templateId', templateId);
      formData.append('outputFormat', outputFormat);
      formData.append('fieldsJson', JSON.stringify(collectFields()));

      document.querySelectorAll('[data-input-key]').forEach((input) => {
        const key = input.getAttribute('data-input-key');
        if (!key || !input.files) return;
        for (const file of input.files) {
          formData.append(`input__${key}`, file);
        }
      });

      const resp = await AuthClient.authFetch(`${API_BASE}/run`, {
        method: 'POST',
        body: formData,
      });
      const data = await safeJson(resp);
      if (!resp.ok || !data?.ok) {
        const error = data?.error || 'Falha ao executar template.';
        const details = Array.isArray(data?.details) ? data.details.slice() : [];
        if (data?.traceId) {
          details.unshift(`Trace ID: ${data.traceId}`);
        }
        throw { message: error, details };
      }

      setStatus(`Processamento concluído (job ${data.jobId}).`, false);
      buildSummary(data.summary || null);
      renderValidationInsights(data.summary?.validationFindings || null);
      renderDownloads(data.artifact || null);
    } catch (error) {
      console.error(error);
      const details = Array.isArray(error?.details) ? error.details : [];
      setStatus(error?.message || 'Erro ao processar template.', true);
      renderValidationInsights(null);
      setErrors(details);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isY570Template(template)
        ? (state.y570Preview ? 'Recalcular quadros' : 'Montar quadros')
        : (isL210Template(template) ? 'Gerar TXT' : 'Executar')
    }
  }

  async function boot() {
    try {
      if (!window.AuthClient?.authFetch) {
        throw new Error('AuthClient não disponível. Recarregue a página.');
      }

      if (typeof inicializarSidebar === 'function') {
        await inicializarSidebar(SLUG);
      }

      const meResp = await AuthClient.authFetch('/api/auth/me', { method: 'GET' });
      if (!meResp.ok) throw new Error('Sessão inválida. Faça login novamente.');
      const meData = await safeJson(meResp);
      const user = meData?.user;
      const whoami = $('whoami');
      if (whoami && user) {
        const name = String(user.name || 'Usuário');
        const email = String(user.email || '');
        const role = String(user.role || '');
        whoami.textContent = `Logado como: ${name}${email ? ` <${email}>` : ''}${role ? ` (${role})` : ''}`;
      }

      await loadSpedTypes();
      const selectedType = $('spedTypeSelect').value;
      if (selectedType) {
        await loadTemplates(selectedType);
      }

      $('spedTypeSelect').addEventListener('change', async () => {
        const selected = $('spedTypeSelect').value;
        const info = state.spedTypes.find((item) => item.id === selected);
        updateSpedTypeMeta(info || null);
        await loadTemplates(selected);
      });

      $('templateSelect').addEventListener('change', async () => {
        const selectedType = $('spedTypeSelect').value;
        const selectedTemplate = $('templateSelect').value;
        await loadTemplateDetails(selectedType, selectedTemplate);
      });

      $('spedsForm').addEventListener('submit', handleRun);
      setStatus('Selecione o template e envie os arquivos necessários.', false);
    } catch (error) {
      console.error(error);
      setStatus(error?.message || 'Falha ao iniciar página SPEDS.', true);
    }
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
