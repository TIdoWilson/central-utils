// public/js/tareffa-empresas-lote.js
document.addEventListener('DOMContentLoaded', async () => {
  // Sidebar
  try {
    if (typeof inicializarSidebar === 'function') {
      await inicializarSidebar('tareffa-empresas-lote');
    }
  } catch (_) {}

  // Auth/CSRF
  if (!window.AuthClient) {
    window.location.href = '/login';
    return;
  }

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx?.user) {
    window.location.href = '/login';
    return;
  }

  const whoami = document.getElementById('whoami');
  if (whoami) {
    whoami.textContent = `Logado como: ${ctx.user.name} <${ctx.user.email}> (${ctx.user.role})`;
  }

  const REGIMES = [
    'Lucro Presumido',
    'Lucro Real',
    'Simples Nacional',
    'Imune',
    'Isento',
    'MEI',
    'Autônomo',
  ];

  const ATIVIDADES = ['Aluguel', 'Comércio', 'Indústria', 'Serviços', 'Tem ICMS'];

  const tbody = document.getElementById('empresasTbody');
  const btnAddRow = document.getElementById('btnAddRow');
  const btnClearAll = document.getElementById('btnClearAll');
  const btnSubmitJob = document.getElementById('btnSubmitJob');

  const jobIdBox = document.getElementById('jobIdBox');
  const jobStatusBox = document.getElementById('jobStatusBox');
  const jobProgressBox = document.getElementById('jobProgressBox');
  const jobLogs = document.getElementById('jobLogs');
  const jobResult = document.getElementById('jobResult');

  if (!tbody) {
    console.error('[tareffa-empresas-lote] tbody #empresasTbody não encontrado.');
    return;
  }

  /* =========================
     LOGS (sem quebrar seleção)
     ========================= */
  let logsBuffer = '';
  let pendingLogsText = null;
  let lockLogs = false; // mouse pressionado dentro do log

  function isSelectingInside(el) {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return false;

    // só considera "selecionando" se houver texto selecionado
    const txt = String(sel.toString() || '');
    if (!txt) return false;

    const range = sel.getRangeAt(0);
    return el.contains(range.commonAncestorContainer);
  }

  function canUpdateLogs() {
    if (!jobLogs) return false;
    if (lockLogs) return false;
    if (isSelectingInside(jobLogs)) return false;
    return true;
  }

  function applyLogsNow(text) {
    if (!jobLogs) return;
    if (jobLogs.textContent !== text) jobLogs.textContent = text;
  }

  function setLogsSafe(newText) {
    logsBuffer = String(newText ?? '');
    if (!jobLogs) return;

    if (!canUpdateLogs()) {
      pendingLogsText = logsBuffer;
      return;
    }

    applyLogsNow(logsBuffer);
  }

  function appendLogsSafe(chunk) {
    setLogsSafe((logsBuffer || '') + String(chunk ?? ''));
  }

  function flushPendingLogsIfSafe() {
    if (!jobLogs) return;
    if (pendingLogsText == null) return;

    if (canUpdateLogs()) {
      logsBuffer = String(pendingLogsText ?? '');
      pendingLogsText = null;
      applyLogsNow(logsBuffer);
    }
  }

  // trava enquanto o mouse está pressionado no log
  jobLogs?.addEventListener('mousedown', () => {
    lockLogs = true;
  });

  // libera no mouseup (em qualquer lugar)
  document.addEventListener('mouseup', () => {
    if (!lockLogs) return;
    lockLogs = false;
    flushPendingLogsIfSafe();
  });

  // seleção por teclado / mudanças de seleção
  document.addEventListener('selectionchange', () => flushPendingLogsIfSafe());
  document.addEventListener('keyup', () => flushPendingLogsIfSafe());

  function stopMenuPortal(menu) {
    if (!menu) return;
    const cleanup = menu.__wlPortalCleanup;
    if (typeof cleanup === 'function') cleanup();
    menu.__wlPortalCleanup = null;
  }

  function startMenuPortal(menu, anchor) {
    if (!menu || !anchor) return;
    stopMenuPortal(menu);
    menu.classList.add('portal');

    const viewportPad = 8;
    const gap = 6;
    let rafId = 0;

    function placeMenu() {
      if (!menu.classList.contains('open')) return;
      if (!menu.isConnected || !anchor.isConnected) return;

      const rect = anchor.getBoundingClientRect();

      const width = Math.min(Math.max(rect.width, 140), Math.max(140, window.innerWidth - viewportPad * 2));
      const left = Math.min(Math.max(rect.left, viewportPad), window.innerWidth - width - viewportPad);

      menu.style.left = `${Math.round(left)}px`;
      menu.style.width = `${Math.round(width)}px`;
      menu.style.right = 'auto';

      const cssMaxHeight = parseFloat(window.getComputedStyle(menu).maxHeight);
      const baseMaxHeight = Number.isFinite(cssMaxHeight) ? cssMaxHeight : 220;
      const desiredHeight = Math.min(menu.scrollHeight || baseMaxHeight, baseMaxHeight);

      const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPad;
      const spaceAbove = rect.top - gap - viewportPad;
      const openUp = spaceBelow < Math.min(desiredHeight, 160) && spaceAbove > spaceBelow;

      const maxForDirection = openUp ? spaceAbove : spaceBelow;
      const appliedMaxHeight = Math.max(120, Math.min(baseMaxHeight, maxForDirection > 0 ? maxForDirection : baseMaxHeight));
      const menuHeight = Math.min(desiredHeight, appliedMaxHeight);

      const rawTop = openUp ? rect.top - gap - menuHeight : rect.bottom + gap;
      const top = Math.max(viewportPad, Math.min(rawTop, window.innerHeight - menuHeight - viewportPad));

      menu.style.top = `${Math.round(top)}px`;
      menu.style.maxHeight = `${Math.floor(appliedMaxHeight)}px`;
    }

    function queuePlaceMenu() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(placeMenu);
    }

    function onViewportChange() {
      queuePlaceMenu();
    }

    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    queuePlaceMenu();

    menu.__wlPortalCleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
      menu.classList.remove('portal');
      menu.style.top = '';
      menu.style.left = '';
      menu.style.right = '';
      menu.style.width = '';
      menu.style.maxHeight = '';
    };
  }

  function closeAllMenus() {
    document.querySelectorAll('.wl-combobox-menu.open').forEach((m) => {
      stopMenuPortal(m);
      m.classList.remove('open');
      m.innerHTML = '';
    });

    document.querySelectorAll('.wl-multi-menu.open').forEach((m) => {
      stopMenuPortal(m);
      m.classList.remove('open');
      m.querySelectorAll('.wl-mini-check').forEach((l) => l.classList.remove('is-active'));
    });
  }

  /* =========================
     CLOSE MENUS (1 listener só)
     ========================= */
  document.addEventListener('click', (e) => {
    // fecha combobox se clicou fora
    if (!e.target.closest('.wl-combobox')) {
      document.querySelectorAll('.wl-combobox-menu.open').forEach((m) => {
        stopMenuPortal(m);
        m.classList.remove('open');
        m.innerHTML = '';
      });
    }

    // fecha multi se clicou fora
    if (!e.target.closest('.wl-multi')) {
      document.querySelectorAll('.wl-multi-menu.open').forEach((m) => {
        stopMenuPortal(m);
        m.classList.remove('open');
        m.querySelectorAll('.wl-mini-check').forEach((l) => l.classList.remove('is-active'));
      });
    }
  });

  /* =========================
     TABLE STATE
     ========================= */
  let rows = [];
  let pollTimer = null;

  function onlyDigits(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function normalizeText(v) {
    return String(v || '').trim();
  }

  function toDateInputFromAny(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return '';
  }

  function toBrDateFromDateInput(v) {
    const s = String(v || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function newRowData() {
    return {
      cnpj: '',
      razaoSocial: '',
      inicioAtividade: '',
      inscricaoEstadual: '',
      regimeTributario: '',
      cnaePrimario: '',
      atividades: [],
      cep: '',
      uf: '',
      municipio: '',
      status: '',
    };
  }

  function setRowStatus(idx, text, kind) {
    const tr = tbody.querySelector(`tr[data-row="${idx}"]`);
    if (!tr) return;
    const cell = tr.querySelector('[data-cell="status"]');
    if (!cell) return;

    cell.textContent = text || '';
    cell.classList.remove('status-ok', 'status-warn', 'status-err');
    if (kind === 'ok') cell.classList.add('status-ok');
    if (kind === 'warn') cell.classList.add('status-warn');
    if (kind === 'err') cell.classList.add('status-err');
  }

  function ensureAtLeastOneRow() {
    if (rows.length === 0) addRowAndFocus(false);
  }

  function addRowAndFocus(focus = true) {
    const idx = rows.length;
    rows.push(newRowData());
    tbody.insertAdjacentHTML('beforeend', renderRow(idx, rows[idx]));
    wireRowCombobox(idx);
    wireAtividadesMulti(idx);

    if (focus) {
      const cnpjInput = tbody.querySelector(`tr[data-row="${idx}"] input[data-field="cnpj"]`);
      cnpjInput?.focus();
    }
  }

  function deleteRow(idx) {
    closeAllMenus();
    rows.splice(idx, 1);
    tbody.innerHTML = '';

    rows.forEach((r, i) => tbody.insertAdjacentHTML('beforeend', renderRow(i, r)));
    rows.forEach((_, i) => {
      wireRowCombobox(i);
      wireAtividadesMulti(i);
    });

    ensureAtLeastOneRow();
  }

  function syncRowToDom(idx) {
    const tr = tbody.querySelector(`tr[data-row="${idx}"]`);
    if (!tr) return;

    const setVal = (field, value) => {
      const el = tr.querySelector(`[data-field="${field}"]`);
      if (!el) return;

      const incoming = value ?? '';
      const current = el.value ?? '';

      if (document.activeElement === el) {
        if (String(current).trim() === '' && String(incoming).trim() !== '') {
          el.value = incoming;
        }
        return;
      }

      el.value = incoming;
    };

    const row = rows[idx];
    if (!row) return;

    setVal('cnpj', row.cnpj);
    setVal('razaoSocial', row.razaoSocial);
    setVal('inicioAtividade', row.inicioAtividade);
    setVal('inscricaoEstadual', row.inscricaoEstadual);
    setVal('regimeTributario', row.regimeTributario);
    setVal('cnaePrimario', row.cnaePrimario);
    setVal('cep', row.cep);
    setVal('uf', row.uf);
    setVal('municipio', row.municipio);

    const btn = tr.querySelector('[data-field="ativBtn"]');
    if (btn) btn.textContent = formatAtividadesLabel(row.atividades);
  }

  function renderRow(idx, r) {
    return `
      <tr data-row="${idx}">
        <td>
          <input class="auth-input" data-field="cnpj" inputmode="numeric" placeholder="00000000000100"
            value="${escapeAttr(r.cnpj)}" />
        </td>

        <td>
          <input class="auth-input" data-field="razaoSocial" placeholder="Razão Social"
            value="${escapeAttr(r.razaoSocial)}" />
        </td>

        <td>
          <input class="auth-input" data-field="inicioAtividade" type="date"
            value="${escapeAttr(r.inicioAtividade)}" />
        </td>

        <td>
          <input class="auth-input" data-field="inscricaoEstadual" placeholder="IE"
            value="${escapeAttr(r.inscricaoEstadual)}" />
        </td>

        <td>
          <div class="wl-combobox" data-field="regimeWrap">
            <input class="auth-input" data-field="regimeTributario" placeholder="Ex.: Simples Nacional"
              value="${escapeAttr(r.regimeTributario)}" autocomplete="off" />
            <div class="wl-combobox-menu" data-field="regimeMenu"></div>
          </div>
        </td>

        <td>
          <input class="auth-input" data-field="cnaePrimario" placeholder="00.00-0-00"
            value="${escapeAttr(r.cnaePrimario)}" />
        </td>

        <td>
          <div class="wl-multi" data-field="ativWrap">
            <button type="button" class="wl-multi-btn" data-field="ativBtn">Selecionar</button>
            <div class="wl-multi-menu" data-field="ativMenu"></div>
          </div>
        </td>

        <td>
          <input class="auth-input" data-field="cep" inputmode="numeric" placeholder="00000000"
            value="${escapeAttr(r.cep)}" />
        </td>

        <td>
          <input class="auth-input" data-field="uf" placeholder="UF"
            value="${escapeAttr(r.uf)}" />
        </td>

        <td>
          <input class="auth-input" data-field="municipio" placeholder="Município"
            value="${escapeAttr(r.municipio)}" />
        </td>

        <td data-cell="status" class="status-cell">${escapeHtml(r.status || '')}</td>

        <td>
          <button class="btn btn-ghost-danger btn-mini" type="button" data-action="deleteRow" title="Remover linha">✕</button>
        </td>
      </tr>
    `;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replaceAll('\n', ' ');
  }

  function wireRowCombobox(idx) {
    const tr = tbody.querySelector(`tr[data-row="${idx}"]`);
    if (!tr) return;

    const input = tr.querySelector('input[data-field="regimeTributario"]');
    const menu = tr.querySelector('div[data-field="regimeMenu"]');
    if (!input || !menu) return;

    let activeIndex = -1;
    let currentOptions = [];

    function closeMenu() {
      stopMenuPortal(menu);
      menu.classList.remove('open');
      menu.innerHTML = '';
      activeIndex = -1;
      currentOptions = [];
    }

    function renderMenu() {
      menu.innerHTML = currentOptions
        .map((x, i) => {
          const cls = i === activeIndex ? 'wl-combobox-item is-active' : 'wl-combobox-item';
          return `<div class="${cls}" data-value="${escapeAttr(x)}" data-idx="${i}">${escapeHtml(x)}</div>`;
        })
        .join('');
    }

    function openMenu(filter) {
      const f = normalizeText(filter).toLowerCase();
      currentOptions = REGIMES.filter((x) => x.toLowerCase().includes(f));
      activeIndex = currentOptions.length ? 0 : -1;
      renderMenu();
      menu.classList.add('open');
      startMenuPortal(menu, input);
    }

    function setActive(delta) {
      if (!currentOptions.length) return;
      activeIndex += delta;
      if (activeIndex < 0) activeIndex = currentOptions.length - 1;
      if (activeIndex >= currentOptions.length) activeIndex = 0;
      renderMenu();
      const el = menu.querySelector(`.wl-combobox-item[data-idx="${activeIndex}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }

    function commitValue(val, moveNext) {
      if (!val) return false;
      input.value = val;
      if (rows[idx]) rows[idx].regimeTributario = val;
      closeMenu();

      if (moveNext) {
        const all = tr.querySelectorAll('input, button, select, textarea');
        const arr = Array.from(all).filter((el) => !el.disabled && el.tabIndex !== -1);
        const pos = arr.indexOf(input);
        if (pos >= 0 && pos + 1 < arr.length) arr[pos + 1].focus();
      } else {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      return true;
    }

    function commitBest(moveNext) {
      if (currentOptions.length === 1) return commitValue(currentOptions[0], moveNext);
      if (activeIndex >= 0 && currentOptions[activeIndex]) return commitValue(currentOptions[activeIndex], moveNext);

      const typed = normalizeText(input.value);
      const exact = REGIMES.find((x) => x.toLowerCase() === typed.toLowerCase());
      if (exact) return commitValue(exact, moveNext);

      return false;
    }

    input.addEventListener('focus', () => openMenu(input.value));
    input.addEventListener('input', () => openMenu(input.value));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMenu();
        return;
      }

      if (e.key === 'ArrowDown') {
        if (!menu.classList.contains('open')) openMenu(input.value);
        e.preventDefault();
        setActive(+1);
        return;
      }

      if (e.key === 'ArrowUp') {
        if (!menu.classList.contains('open')) openMenu(input.value);
        e.preventDefault();
        setActive(-1);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (!menu.classList.contains('open')) openMenu(input.value);
        const ok = commitBest(false);
        if (!ok) closeMenu();
        return;
      }

      if (e.key === 'Tab' && !e.shiftKey) {
        if (!menu.classList.contains('open')) return;
        const ok = commitBest(true);
        if (ok) e.preventDefault();
        else closeMenu();
        return;
      }
    });

    menu.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.wl-combobox-item');
      if (!item) return;
      const val = item.getAttribute('data-value') || '';
      commitValue(val, false);
    });
  }

  async function lookupCnpj(idx) {
    const row = rows[idx];
    if (!row) return;

    const cnpj = onlyDigits(row.cnpj);
    if (cnpj.length !== 14) return;

    setRowStatus(idx, 'Buscando CNPJ...', 'warn');

    try {
      const resp = await AuthClient.authFetch(`/api/cnpj/${cnpj}`, { method: 'GET' });
      const body = await resp.json().catch(() => null);

      if (!resp.ok || !body?.ok || !body?.data) {
        setRowStatus(idx, body?.error || 'CNPJ: sem retorno (preencha manual)', 'warn');
        return;
      }

      const data = body.data;

      function pickRegimeFromApi(d) {
        if (d.opcao_pelo_mei === true || d.data_opcao_pelo_mei) return 'MEI';

        const temSimples = d.opcao_pelo_simples === true || d.data_opcao_pelo_simples;
        const excluidoSimples = Boolean(d.data_exclusao_do_simples);
        if (temSimples && !excluidoSimples) return 'Simples Nacional';

        const arr = Array.isArray(d.regime_tributario) ? d.regime_tributario : [];
        if (arr.length) {
          const last = [...arr].sort((a, b) => (b.ano || 0) - (a.ano || 0))[0];
          const f = String(last.forma_de_tributacao || '').toUpperCase();

          if (f.includes('LUCRO PRESUMIDO')) return 'Lucro Presumido';
          if (f.includes('LUCRO REAL')) return 'Lucro Real';
          if (f.includes('IMUNE')) return 'Imune';
          if (f.includes('ISENTA')) return 'Isento';
        }
        return '';
      }

      const regime = pickRegimeFromApi(data);
      if (regime && !row.regimeTributario) row.regimeTributario = regime;

      const razao = data.razao_social || '';
      const abertura = data.data_inicio_atividade || data.abertura || '';
      const uf = data.uf || '';
      const municipio = data.municipio || '';
      const cep = data.cep || '';
      const cnae = data.cnae_fiscal || '';

      if (razao && !row.razaoSocial) row.razaoSocial = razao;

      const dateInput = toDateInputFromAny(abertura);
      if (dateInput && !row.inicioAtividade) row.inicioAtividade = dateInput;

      if (uf && !row.uf) row.uf = uf;
      if (municipio && !row.municipio) row.municipio = municipio;
      if (cep && !row.cep) row.cep = onlyDigits(cep).slice(0, 8);

      if (cnae && !row.cnaePrimario) row.cnaePrimario = String(cnae);

      syncRowToDom(idx);
      setRowStatus(idx, 'CNPJ OK', 'ok');
    } catch (err) {
      console.error(err);
      setRowStatus(idx, 'Erro ao consultar CNPJ', 'err');
    }
  }

  async function lookupCep(idx) {
    const row = rows[idx];
    if (!row) return;

    const cep = onlyDigits(row.cep);
    if (cep.length !== 8) return;

    setRowStatus(idx, 'Buscando CEP...', 'warn');

    try {
      const resp = await AuthClient.authFetch(`/api/cep/${cep}`, { method: 'GET' });
      const body = await resp.json().catch(() => null);

      if (!resp.ok || !body?.ok || !body?.data) {
        setRowStatus(idx, body?.error || 'CEP: sem retorno (preencha manual)', 'warn');
        return;
      }

      const data = body.data;
      const uf = data.state || data.uf || '';
      const municipio = data.city || data.municipio || data.localidade || '';

      if (uf) row.uf = String(uf).toUpperCase().slice(0, 2);
      if (municipio) row.municipio = municipio;

      syncRowToDom(idx);
      setRowStatus(idx, 'CEP OK', 'ok');
    } catch (err) {
      console.error(err);
      setRowStatus(idx, 'Erro ao consultar CEP', 'err');
    }
  }

  function rerenderRow(idx) {
    closeAllMenus();
    const tr = tbody.querySelector(`tr[data-row="${idx}"]`);
    if (!tr) return;
    tr.outerHTML = renderRow(idx, rows[idx]);
    wireRowCombobox(idx);
    wireAtividadesMulti(idx); // ✅ importante
  }

  function handlePasteCnpjs(e, idx) {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text || !text.includes('\n')) return;

    const lines = text
      .split(/\r?\n/)
      .map((x) => onlyDigits(x))
      .filter((x) => x.length);

    if (!lines.length) return;

    e.preventDefault();
    while (rows.length < idx + lines.length) addRowAndFocus(false);

    lines.forEach((cnpj, i) => {
      const rowIdx = idx + i;
      rows[rowIdx].cnpj = cnpj.slice(0, 14);
      rerenderRow(rowIdx);
      lookupCnpj(rowIdx);
    });
  }

  function formatAtividadesLabel(list) {
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) return 'Selecionar';
    if (arr.length <= 2) return arr.join(', ');
    return `${arr.length} selecionadas`;
  }

  function wireAtividadesMulti(idx) {
    const tr = tbody.querySelector(`tr[data-row="${idx}"]`);
    if (!tr) return;

    const btn = tr.querySelector('[data-field="ativBtn"]');
    const menu = tr.querySelector('[data-field="ativMenu"]');
    if (!btn || !menu) return;

    const row = rows[idx];
    if (!row) return;

    btn.textContent = formatAtividadesLabel(row.atividades);

    menu.innerHTML = ATIVIDADES.map((a) => {
      const checked = (row.atividades || []).includes(a) ? 'checked' : '';
      return `
        <label class="wl-mini-check">
          <input type="checkbox" data-atividade="${escapeAttr(a)}" ${checked}/>
          <span>${escapeHtml(a)}</span>
        </label>
      `;
    }).join('');

    const checkboxes = Array.from(menu.querySelectorAll('input[type="checkbox"]'));

    function highlightActive(cb) {
      menu.querySelectorAll('.wl-mini-check').forEach((l) => l.classList.remove('is-active'));
      const label = cb?.closest('.wl-mini-check');
      if (label) label.classList.add('is-active');
    }

    function setFocusAt(i) {
      if (!checkboxes.length) return;
      const clamped = Math.max(0, Math.min(i, checkboxes.length - 1));
      checkboxes.forEach((c) => (c.tabIndex = -1));
      const cb = checkboxes[clamped];
      cb.tabIndex = 0;
      cb.focus();
      highlightActive(cb);
    }

    function open() {
      menu.classList.add('open');
      startMenuPortal(menu, btn);
      const firstChecked = checkboxes.findIndex((c) => c.checked);
      setFocusAt(firstChecked >= 0 ? firstChecked : 0);
    }

    function close(focusBtn = false) {
      stopMenuPortal(menu);
      menu.classList.remove('open');
      menu.querySelectorAll('.wl-mini-check').forEach((l) => l.classList.remove('is-active'));
      if (focusBtn) btn.focus();
    }

    function isOpen() {
      return menu.classList.contains('open');
    }

    function updateRowsFromMenu() {
      const set = new Set();
      checkboxes.forEach((cb) => {
        if (cb.checked) set.add(cb.getAttribute('data-atividade'));
      });
      row.atividades = Array.from(set).filter(Boolean);
      btn.textContent = formatAtividadesLabel(row.atividades);
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen()) close(true);
      else open();
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!isOpen()) open();
      }
    });

    menu.addEventListener('change', () => updateRowsFromMenu());

    menu.addEventListener('keydown', (e) => {
      if (!isOpen()) return;

      const active = document.activeElement;
      const curIdx = checkboxes.indexOf(active);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusAt(curIdx < 0 ? 0 : (curIdx + 1) % checkboxes.length);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusAt(curIdx < 0 ? 0 : (curIdx - 1 + checkboxes.length) % checkboxes.length);
        return;
      }

      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (curIdx >= 0) {
          checkboxes[curIdx].click();
          highlightActive(checkboxes[curIdx]);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        close(false);

        const focusables = Array.from(tr.querySelectorAll('input, button, select, textarea'))
          .filter((el) => !el.disabled && el.tabIndex !== -1)
          .filter((el) => !menu.contains(el));

        const pos = focusables.indexOf(btn);
        if (pos === -1) return;

        const next = e.shiftKey ? focusables[pos - 1] : focusables[pos + 1];
        if (next) next.focus();
        return;
      }
    });

    if (checkboxes.length) {
      checkboxes.forEach((c) => (c.tabIndex = -1));
      checkboxes[0].tabIndex = 0;
    }
  }

  // Delegação de eventos na tabela
  tbody.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-row]');
    if (!tr) return;
    const idx = Number(tr.getAttribute('data-row'));
    const field = e.target.getAttribute('data-field');
    if (!field) return;
    if (!rows[idx]) return;

    if (field === 'cnpj') rows[idx].cnpj = onlyDigits(e.target.value).slice(0, 14);
    if (field === 'razaoSocial') rows[idx].razaoSocial = normalizeText(e.target.value);
    if (field === 'inicioAtividade') rows[idx].inicioAtividade = e.target.value;
    if (field === 'inscricaoEstadual') rows[idx].inscricaoEstadual = normalizeText(e.target.value);
    if (field === 'regimeTributario') rows[idx].regimeTributario = normalizeText(e.target.value);
    if (field === 'cnaePrimario') rows[idx].cnaePrimario = normalizeText(e.target.value);
    if (field === 'cep') rows[idx].cep = onlyDigits(e.target.value).slice(0, 8);
    if (field === 'uf') rows[idx].uf = normalizeText(e.target.value).toUpperCase().slice(0, 2);
    if (field === 'municipio') rows[idx].municipio = normalizeText(e.target.value);

    setRowStatus(idx, '', null);
  });

  tbody.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-row]');
    if (!tr) return;
    const idx = Number(tr.getAttribute('data-row'));
    const field = e.target.getAttribute('data-field');

    if ((e.key === 'Tab' || e.key === 'Enter') && field === 'cnpj') {
      setTimeout(() => lookupCnpj(idx), 0);
    }

    if ((e.key === 'Tab' || e.key === 'Enter') && field === 'cep') {
      setTimeout(() => lookupCep(idx), 0);
    }

    if (e.key === 'Tab' && !e.shiftKey && field === 'municipio') {
      const isLastRow = idx === rows.length - 1;
      if (isLastRow) {
        e.preventDefault();
        addRowAndFocus(true);
      }
    }
  });

  tbody.addEventListener('paste', (e) => {
    const tr = e.target.closest('tr[data-row]');
    if (!tr) return;
    const idx = Number(tr.getAttribute('data-row'));
    const field = e.target.getAttribute('data-field');
    if (field === 'cnpj') handlePasteCnpjs(e, idx);
  });

  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-row]');
    const btn = e.target.closest('[data-action]');
    if (!tr || !btn) return;

    const idx = Number(tr.getAttribute('data-row'));
    const action = btn.getAttribute('data-action');
    if (action === 'deleteRow') deleteRow(idx);
  });

  btnAddRow?.addEventListener('click', () => addRowAndFocus(true));

  btnClearAll?.addEventListener('click', () => {
    closeAllMenus();
    const jobSection = document.getElementById('jobSection');
    if (jobSection) jobSection.hidden = true;

    rows = [];
    tbody.innerHTML = '';
    stopPolling();
    if (jobIdBox) jobIdBox.textContent = '';
    if (jobStatusBox) jobStatusBox.textContent = '';
    if (jobProgressBox) jobProgressBox.textContent = '';
    setLogsSafe('');
    if (jobResult) jobResult.textContent = '';
    ensureAtLeastOneRow();
  });

  btnSubmitJob?.addEventListener('click', async () => {
    stopPolling();
    setLogsSafe('');
    if (jobResult) jobResult.textContent = '';

    const payloadCompanies = rows
      .map((r) => ({
        cnpj: onlyDigits(r.cnpj),
        razaoSocial: normalizeText(r.razaoSocial),
        inicioAtividade: toBrDateFromDateInput(r.inicioAtividade),
        inscricaoEstadual: normalizeText(r.inscricaoEstadual),
        regimeTributario: normalizeText(r.regimeTributario),
        cnaePrimario: normalizeText(r.cnaePrimario),
        atividades: Array.isArray(r.atividades) ? r.atividades : [],
        cep: onlyDigits(r.cep),
        uf: normalizeText(r.uf),
        municipio: normalizeText(r.municipio),
      }))
      .filter((x) => x.cnpj && x.cnpj.length === 14);

    if (!payloadCompanies.length) {
      alert('Informe ao menos 1 CNPJ válido (14 dígitos).');
      return;
    }

    btnSubmitJob.disabled = true;
    btnSubmitJob.textContent = 'Enviando...';

    try {
      const resp = await AuthClient.authFetch('/api/tareffa-empresas-lote/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          companies: payloadCompanies,
          options: { headless: false },
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Falha ao criar job');

      const jobKey = data.jobKey ?? data.jobId;

      if (jobIdBox) jobIdBox.textContent = jobKey;
      if (jobStatusBox) jobStatusBox.textContent = 'Criado';
      if (jobProgressBox) jobProgressBox.textContent = '0%';
      setLogsSafe('Job criado. Aguardando início...\n');

      const jobSection = document.getElementById('jobSection');
      if (jobSection) jobSection.hidden = false;

      startPolling(jobKey);
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Erro ao criar job');
    } finally {
      btnSubmitJob.disabled = false;
      btnSubmitJob.textContent = 'Cadastrar';
    }
  });

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function pollJob(jobKey) {
    try {
      const url = `/api/tareffa-empresas-lote/jobs/${encodeURIComponent(jobKey)}`;
      const resp = await AuthClient.authFetch(url, { headers: { Accept: 'application/json' } });

      const raw = await resp.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {}

      if (!resp.ok) {
        if (jobStatusBox) jobStatusBox.textContent = `Erro (${resp.status})`;
        appendLogsSafe(`\n[ERRO] GET ${url} -> ${resp.status}\n${raw}\n`);
        return;
      }

      if (jobStatusBox) jobStatusBox.textContent = data.status || '';
      if (jobProgressBox) jobProgressBox.textContent = (data.progress ?? 0) + '%';

      let logsText = '';
      if (Array.isArray(data.logs)) logsText = data.logs.join('\n');
      else if (typeof data.logs === 'string') logsText = data.logs;

      setLogsSafe(logsText);
    } catch (err) {
      if (jobStatusBox) jobStatusBox.textContent = 'Erro';
      appendLogsSafe(`\n[ERRO] Polling falhou: ${err?.message || err}\n`);
    }
  }

  function startPolling(jobKey) {
    stopPolling();
    pollJob(jobKey);
    pollTimer = setInterval(() => pollJob(jobKey), 1000);
  }

  // inicializa 1ª linha
  ensureAtLeastOneRow();
});
