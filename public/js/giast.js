/* global AuthClient, inicializarSidebar */

(function () {
  const UFS = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function toLocalYmd(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function getTodayYmd() {
    return toLocalYmd(new Date());
  }

  function getDefaultDueDate() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-09`;
  }

  function getDefaultPeriodRefPreviousMonth() {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${pad2(prev.getMonth() + 1)}${prev.getFullYear()}`;
  }

  function formatCnpj(value) {
    const d = onlyDigits(value).slice(0, 14);
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  function formatCpf(value) {
    const d = onlyDigits(value).slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }

  function formatPhone(value) {
    const d = onlyDigits(value).slice(0, 13);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function parseMoney(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(2)) : null;
    }

    const raw = String(value || '').trim();
    if (!raw) return null;

    let normalized = raw.replace(/\s+/g, '');
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (normalized.includes(',')) {
      normalized = normalized.replace(',', '.');
    }

    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) return null;
    return Number(n.toFixed(2));
  }

  function fmtMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function moneyInputValue(value) {
    if (value === null || value === undefined || value === '') return '';
    const parsed = parseMoney(value);
    if (parsed === null) return '';
    return String(parsed).replace('.', ',');
  }

  function normalizePeriodRef(value) {
    const digits = onlyDigits(value || '');
    if (digits.length !== 6) return null;
    const month = Number(digits.slice(0, 2));
    const year = Number(digits.slice(2));
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(year) || year < 2000 || year > 2199) return null;
    return digits;
  }

  function toDownloadBlobFromBase64(base64Text) {
    const binary = window.atob(base64Text || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'text/plain;charset=latin1' });
  }

  function enableArrowNavigation(scope) {
    if (!scope) return;

    const selector = [
      'input:not([type="hidden"]):not([disabled]):not([readonly])',
      'textarea:not([disabled]):not([readonly])',
      'select:not([disabled])',
    ].join(', ');

    function visibleFields() {
      return Array.from(scope.querySelectorAll(selector)).filter((el) => el.offsetParent !== null);
    }

    function shouldKeepNativeHorizontalBehavior(field, key) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return false;
      }

      const isTextInput =
        field instanceof HTMLTextAreaElement
        || ['text', 'search', 'url', 'tel', 'password', 'email', 'number'].includes(field.type);

      if (!isTextInput) return false;

      const start = field.selectionStart;
      const end = field.selectionEnd;
      if (start === null || end === null) return false;
      if (start !== end) return true;
      if (key === 'ArrowLeft' && start > 0) return true;
      if (key === 'ArrowRight' && end < field.value.length) return true;
      return false;
    }

    function moveByStep(current, step) {
      const fields = visibleFields();
      const idx = fields.indexOf(current);
      if (idx < 0) return;
      const target = fields[idx + step];
      if (target && typeof target.focus === 'function') target.focus();
    }

    function moveVerticalInTable(current, direction) {
      const row = current.closest('tr');
      const cell = current.closest('td,th');
      const table = current.closest('table');
      if (!row || !cell || !table) return false;

      const rows = Array.from(table.querySelectorAll('tbody tr')).filter((r) => r.offsetParent !== null);
      const rowIndex = rows.indexOf(row);
      if (rowIndex < 0) return false;

      const targetRow = rows[rowIndex + direction];
      if (!targetRow) return false;

      const colIndex = Array.from(row.children).indexOf(cell);
      const targetCell = targetRow.children[colIndex] || targetRow.children[targetRow.children.length - 1];
      if (!targetCell) return false;

      const targetField = targetCell.querySelector(selector) || targetRow.querySelector(selector);
      if (!targetField) return false;

      targetField.focus();
      return true;
    }

    scope.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;

      const target = event.target;
      const isField =
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement;

      if (!isField) return;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!moveVerticalInTable(target, -1)) moveByStep(target, -1);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!moveVerticalInTable(target, 1)) moveByStep(target, 1);
        return;
      }

      if (shouldKeepNativeHorizontalBehavior(target, event.key)) return;

      event.preventDefault();
      moveByStep(target, event.key === 'ArrowLeft' ? -1 : 1);
    }, true);
  }

  window.addEventListener('DOMContentLoaded', async () => {
    if (typeof inicializarSidebar === 'function') {
      await inicializarSidebar('giast');
    }

    if (!window.AuthClient) {
      window.location.href = '/login';
      return;
    }

    const ctx = await AuthClient.getAuthContext().catch(() => null);
    if (!ctx?.user) {
      window.location.href = '/login';
      return;
    }

    const declarantSelect = $('giastDeclarantSelect');
    const declarantTrigger = $('giastDeclarantTrigger');
    const btnNewDeclarant = $('btnGiastNewDeclarant');
    const btnEditDeclarant = $('btnGiastEditDeclarant');

    const declarantEditor = $('giastDeclarantEditor');
    const editorTitle = $('giastEditorTitle');
    const btnSaveDeclarant = $('btnGiastSaveDeclarant');
    const btnCancelDeclarant = $('btnGiastCancelDeclarant');
    const btnDeleteDeclarantEditor = $('btnGiastDeleteDeclarantEditor');

    const declarantName = $('giastDeclarantName');
    const declarantCnpj = $('giastDeclarantCnpj');
    const declarantCpf = $('giastDeclarantCpf');
    const declarantRole = $('giastDeclarantRole');
    const declarantPhone = $('giastDeclarantPhone');
    const declarantEmail = $('giastDeclarantEmail');
    const declarantCity = $('giastDeclarantCity');
    const ieTbody = $('giastIeTbody');

    const generateSection = $('giastGenerateSection');
    const periodRefInput = $('giastPeriodRef');
    const spedFileInput = $('giastSpedFile');
    const rowsTbody = $('giastRowsTbody');
    const btnAddRow = $('btnGiastAddRow');
    const btnImportSped = $('btnGiastImportSped');
    const btnGenerateTxt = $('btnGiastGenerateTxt');
    const declarantStatusEl = $('giastDeclarantStatus');
    const statusEl = $('giastStatus');
    const logEl = $('giastLog');

    let declarants = [];
    let currentDeclarantId = null;
    let currentDeclarantData = null;
    let lastSelectedDeclarantId = null;
    let editorMode = 'hidden';
    let declarantMenuEl = null;

    function log(message) {
      if (!logEl) return;
      const stamp = new Date().toLocaleString('pt-BR');
      logEl.textContent = `${logEl.textContent}[${stamp}] ${message}\n`;
      logEl.scrollTop = logEl.scrollHeight;
    }

    function setStatus(message, isError = false) {
      [declarantStatusEl, statusEl].forEach((el) => {
        if (!el) return;
        el.textContent = message || '';
        el.style.color = isError ? '#b91c1c' : '#14532d';
      });
    }

    function clearStatus() {
      [declarantStatusEl, statusEl].forEach((el) => {
        if (!el) return;
        el.textContent = '';
        el.style.color = '';
      });
    }

    function setEditorVisible(visible) {
      if (!declarantEditor) return;
      declarantEditor.classList.toggle('is-hidden', !visible);
    }

    function setEditorMode(mode) {
      editorMode = mode;

      const visible = mode !== 'hidden';
      setEditorVisible(visible);

      if (editorTitle) {
        editorTitle.textContent = mode === 'edit' ? 'Editar declarante' : 'Novo declarante';
      }

      if (btnDeleteDeclarantEditor) {
        btnDeleteDeclarantEditor.classList.toggle('is-hidden', mode !== 'edit');
      }

      if (btnEditDeclarant) {
        btnEditDeclarant.disabled = !currentDeclarantId || mode === 'edit' || mode === 'new';
      }
    }

    function setGenerateVisible(visible) {
      if (!generateSection) return;
      generateSection.classList.toggle('is-hidden', !visible);
    }

    function ensureDeclarantMenu() {
      if (declarantMenuEl) return declarantMenuEl;
      const el = document.createElement('div');
      el.id = 'giastDeclarantMenu';
      el.className = 'giast-declarant-menu is-hidden';
      el.setAttribute('role', 'listbox');
      document.body.appendChild(el);
      declarantMenuEl = el;
      return declarantMenuEl;
    }

    function syncDeclarantTriggerLabel() {
      if (!declarantTrigger || !declarantSelect) return;
      const selected = declarantSelect.selectedOptions?.[0];
      const hasValue = Boolean(declarantSelect.value);
      declarantTrigger.textContent = hasValue
        ? String(selected?.textContent || 'Selecione um declarante...')
        : 'Selecione um declarante...';
      declarantTrigger.classList.toggle('is-placeholder', !hasValue);
    }

    function closeDeclarantMenu() {
      const menu = ensureDeclarantMenu();
      menu.classList.add('is-hidden');
      if (declarantTrigger) declarantTrigger.setAttribute('aria-expanded', 'false');
    }

    function positionDeclarantMenu() {
      const menu = ensureDeclarantMenu();
      const anchor = declarantTrigger?.closest('.giast-select-wrap');
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const top = rect.bottom + 4;
      const maxHeight = Math.max(160, Math.min(360, viewportH - top - 8));

      menu.style.left = `${Math.max(8, rect.left)}px`;
      menu.style.top = `${top}px`;
      menu.style.width = `${rect.width}px`;
      menu.style.maxHeight = `${maxHeight}px`;
    }

    function openDeclarantMenu() {
      if (!declarantSelect || !declarantTrigger) return;

      const menu = ensureDeclarantMenu();
      const currentValue = String(declarantSelect.value || '');
      const options = Array.from(declarantSelect.options || []);

      menu.innerHTML = '';
      options.forEach((option) => {
        const value = String(option.value || '');
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'giast-declarant-option';
        if (!value) item.classList.add('is-placeholder-option');
        if (value === currentValue) item.classList.add('is-selected');
        item.textContent = String(option.textContent || '');
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', value === currentValue ? 'true' : 'false');
        item.addEventListener('click', () => {
          closeDeclarantMenu();
          declarantSelect.value = value;
          declarantSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });
        menu.appendChild(item);
      });

      positionDeclarantMenu();
      menu.classList.remove('is-hidden');
      declarantTrigger.setAttribute('aria-expanded', 'true');
    }

    function getUfOptions(selected) {
      return ['<option value="">Selecione</option>']
        .concat(UFS.map((uf) => {
          const sel = uf === selected ? ' selected' : '';
          return `<option value="${uf}"${sel}>${uf}</option>`;
        }))
        .join('');
    }

    function buildIeTable(stateRegistrations = {}) {
      if (!ieTbody) return;
      const rows = UFS.map((uf) => {
        const value = String(stateRegistrations?.[uf] || '');
        return `
          <div class="giast-ie-item">
            <span class="giast-ie-uf">${uf}</span>
            <input
              type="text"
              class="giast-ie-input"
              data-uf="${uf}"
              value="${value}"
              maxlength="20"
              placeholder="Inscricao Estadual"
            />
          </div>
        `;
      });
      ieTbody.innerHTML = rows.join('');
    }

    function collectStateRegistrations() {
      const result = {};
      ieTbody.querySelectorAll('.giast-ie-input').forEach((input) => {
        const uf = String(input.getAttribute('data-uf') || '').toUpperCase();
        const ie = String(input.value || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
        if (uf && ie) result[uf] = ie;
      });
      return result;
    }

    function clearDeclarantForm() {
      if (declarantName) declarantName.value = '';
      if (declarantCnpj) declarantCnpj.value = '';
      if (declarantCpf) declarantCpf.value = '';
      if (declarantRole) declarantRole.value = '';
      if (declarantPhone) declarantPhone.value = '';
      if (declarantEmail) declarantEmail.value = '';
      if (declarantCity) declarantCity.value = '';
      buildIeTable({});
    }

    function fillDeclarantForm(declarant) {
      if (declarantName) declarantName.value = String(declarant?.name || '');
      if (declarantCnpj) declarantCnpj.value = formatCnpj(declarant?.cnpj || '');
      if (declarantCpf) declarantCpf.value = formatCpf(declarant?.cpf || '');
      if (declarantRole) declarantRole.value = String(declarant?.roleTitle || '');

      const phoneDdd = String(declarant?.phoneDdd || '');
      const phoneNumber = String(declarant?.phoneNumber || '');
      if (declarantPhone) declarantPhone.value = formatPhone(`${phoneDdd}${phoneNumber}`);

      if (declarantEmail) declarantEmail.value = String(declarant?.email || '');
      if (declarantCity) declarantCity.value = String(declarant?.signingCity || '');

      buildIeTable(declarant?.stateRegistrations || {});
    }

    function createRowItem(row = {}) {
      const dueDate = row.dueDate || getDefaultDueDate();
      const valueIcms = moneyInputValue(row.valueIcms);
      const valueFcp = moneyInputValue(row.valueFcp);
      const valueDevolutions = moneyInputValue(row.valueDevolutions);
      const valuePrepayments = moneyInputValue(row.valuePrepayments);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <select class="sn-select giast-row-uf">${getUfOptions(row.uf || '')}</select>
        </td>
        <td>
          <input type="date" class="giast-row-date" value="${dueDate}" />
        </td>
        <td>
          <input type="text" class="giast-row-icms" placeholder="0,00" value="${valueIcms}" />
        </td>
        <td>
          <input type="text" class="giast-row-fcp" placeholder="0,00" value="${valueFcp}" />
        </td>
        <td>
          <input type="text" class="giast-row-devolutions" placeholder="0,00" value="${valueDevolutions}" />
        </td>
        <td>
          <input type="text" class="giast-row-prepayments" placeholder="0,00" value="${valuePrepayments}" />
        </td>
        <td>
          <button type="button" class="btn btn-secondary giast-row-remove">Remover</button>
        </td>
      `;

      tr.querySelector('.giast-row-remove')?.addEventListener('click', () => {
        tr.remove();
        if (!rowsTbody.querySelector('tr')) {
          rowsTbody.appendChild(createRowItem());
        }
      });

      return tr;
    }

    function populateRowsFromDeclarant(declarant) {
      const stateRegistrations = declarant?.stateRegistrations || {};
      const selectedUfs = UFS.filter((uf) => String(stateRegistrations[uf] || '').trim());

      rowsTbody.innerHTML = '';

      if (!selectedUfs.length) {
        rowsTbody.appendChild(createRowItem());
        return;
      }

      selectedUfs.forEach((uf) => {
        rowsTbody.appendChild(createRowItem({
          uf,
          dueDate: getDefaultDueDate(),
          valueIcms: '',
          valueFcp: '',
          valueDevolutions: '',
          valuePrepayments: '',
        }));
      });
    }

    function buildDeclarantPayload() {
      const cnpj = onlyDigits(declarantCnpj?.value || '');
      const cpf = onlyDigits(declarantCpf?.value || '');
      const phoneDigits = onlyDigits(declarantPhone?.value || '');

      return {
        name: String(declarantName?.value || '').trim(),
        cnpj,
        cpf,
        roleTitle: String(declarantRole?.value || '').trim(),
        phoneDdd: phoneDigits.slice(0, 4),
        phoneNumber: phoneDigits.slice(4),
        email: String(declarantEmail?.value || '').trim(),
        signingCity: String(declarantCity?.value || '').trim(),
        signingDate: getTodayYmd(),
        stateRegistrations: collectStateRegistrations(),
      };
    }

    function renderDeclarantSelect(selectedId = null) {
      if (!declarantSelect) return;

      const options = ['<option value="">Selecione um declarante...</option>'];

      declarants.forEach((d) => {
        const cnpjFmt = formatCnpj(d.cnpj || '');
        options.push(`<option value="${d.id}">${d.name} - ${cnpjFmt}</option>`);
      });

      declarantSelect.innerHTML = options.join('');

      if (selectedId) {
        declarantSelect.value = String(selectedId);
      } else {
        declarantSelect.value = '';
      }

      syncDeclarantTriggerLabel();
      closeDeclarantMenu();
    }

    async function loadDeclarants(preferId = null) {
      const resp = await AuthClient.authFetch('/api/giast/declarantes', { method: 'GET' });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || 'Erro ao carregar declarantes.');
      }

      declarants = Array.isArray(data.declarantes) ? data.declarantes : [];
      renderDeclarantSelect(preferId || currentDeclarantId || null);

      if (preferId) {
        await loadDeclarantDetail(preferId);
      }
    }

    async function loadDeclarantDetail(id) {
      const declarantId = Number(id);
      if (!Number.isInteger(declarantId) || declarantId <= 0) {
        currentDeclarantId = null;
        currentDeclarantData = null;
        setGenerateVisible(false);
        return;
      }

      const resp = await AuthClient.authFetch(`/api/giast/declarantes/${declarantId}`, { method: 'GET' });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || 'Erro ao carregar detalhes do declarante.');
      }

      currentDeclarantId = declarantId;
      currentDeclarantData = data.declarant || null;
      lastSelectedDeclarantId = declarantId;

      fillDeclarantForm(currentDeclarantData);
      setEditorMode('hidden');
      setGenerateVisible(true);
      populateRowsFromDeclarant(currentDeclarantData);

      if (declarantSelect) declarantSelect.value = String(declarantId);
      syncDeclarantTriggerLabel();
      closeDeclarantMenu();
    }

    function enterCreateMode() {
      currentDeclarantId = null;
      currentDeclarantData = null;
      setEditorMode('new');
      setGenerateVisible(false);
      clearDeclarantForm();
      if (declarantSelect) declarantSelect.value = '';
      syncDeclarantTriggerLabel();
      closeDeclarantMenu();
      declarantName?.focus();
    }

    async function enterEditMode() {
      const declarantId = Number(currentDeclarantId || lastSelectedDeclarantId || 0);
      if (!declarantId) {
        setStatus('Selecione um declarante para editar.', true);
        return;
      }

      await loadDeclarantDetail(declarantId);
      setEditorMode('edit');
      declarantName?.focus();
    }

    async function cancelDeclarantEditor() {
      setEditorMode('hidden');

      if (declarants.length) {
        const firstId = Number(lastSelectedDeclarantId || declarants[0].id);
        await loadDeclarantDetail(firstId);
        return;
      }

      if (declarantSelect) declarantSelect.value = '';
      syncDeclarantTriggerLabel();
      closeDeclarantMenu();
      setGenerateVisible(false);
    }

    async function saveDeclarant() {
      clearStatus();
      if (btnSaveDeclarant) btnSaveDeclarant.disabled = true;
      setStatus('Salvando declarante...');

      try {
        const payload = buildDeclarantPayload();
        if (!payload.name) {
          setStatus('Informe o nome do declarante.', true);
          return;
        }
        if ((payload.cnpj || '').length !== 14) {
          setStatus('Informe um CNPJ valido com 14 digitos.', true);
          return;
        }

        const isUpdate = editorMode === 'edit' && Number.isInteger(currentDeclarantId) && currentDeclarantId > 0;
        const url = isUpdate
          ? `/api/giast/declarantes/${currentDeclarantId}`
          : '/api/giast/declarantes';

        const resp = await AuthClient.authFetch(url, {
          method: isUpdate ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.ok) {
          setStatus(data?.error || 'Erro ao salvar declarante.', true);
          return;
        }

        const declarantId = Number(data?.declarant?.id || 0);
        if (!declarantId) {
          setStatus('Declarante salvo, mas sem ID de retorno.', true);
          return;
        }

        const warning = String(data?.warning || '').trim();
        if (warning) {
          setStatus(`Declarante salvo. ${warning}`);
          log(`Aviso ao salvar declarante: ${warning}`);
        } else {
          setStatus('Declarante salvo com sucesso.');
        }
        log(`Declarante salvo: ${payload.name} (${formatCnpj(payload.cnpj)})`);

        currentDeclarantId = declarantId;
        lastSelectedDeclarantId = declarantId;
        setEditorMode('hidden');

        await loadDeclarants(declarantId);
        await loadDeclarantDetail(declarantId);
      } finally {
        if (btnSaveDeclarant) btnSaveDeclarant.disabled = false;
      }
    }

    async function deleteDeclarant() {
      clearStatus();
      if (!currentDeclarantId) {
        setStatus('Selecione um declarante para excluir.', true);
        return;
      }

      const yes = window.confirm('Deseja realmente excluir este declarante?');
      if (!yes) return;

      const resp = await AuthClient.authFetch(`/api/giast/declarantes/${currentDeclarantId}`, {
        method: 'DELETE',
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) {
        setStatus(data?.error || 'Erro ao excluir declarante.', true);
        return;
      }

      const removedId = currentDeclarantId;
      currentDeclarantId = null;
      currentDeclarantData = null;
      if (lastSelectedDeclarantId === removedId) lastSelectedDeclarantId = null;
      setEditorMode('hidden');

      setStatus('Declarante excluido com sucesso.');
      log(`Declarante ${removedId} excluido.`);

      await loadDeclarants();

      if (declarants.length) {
        const nextId = Number(declarants[0].id);
        await loadDeclarantDetail(nextId);
      } else {
        if (declarantSelect) declarantSelect.value = '';
        currentDeclarantData = null;
        setGenerateVisible(false);
      }
    }

    async function importSpedAndPrefill() {
      clearStatus();

      if (!currentDeclarantId) {
        setStatus('Selecione um declarante antes de importar o SPED.', true);
        return;
      }

      const spedFile = spedFileInput?.files?.[0] || null;
      if (!spedFile) {
        setStatus('Selecione um arquivo SPED (TXT) para importar.', true);
        return;
      }

      if (btnImportSped) btnImportSped.disabled = true;
      setStatus('Importando SPED e preenchendo dados...');

      try {
        const formData = new FormData();
        formData.append('declarantId', String(currentDeclarantId));
        formData.append('spedFile', spedFile, spedFile.name);

        const resp = await AuthClient.authFetch('/api/giast/import-sped', {
          method: 'POST',
          body: formData,
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.ok) {
          setStatus(data?.error || 'Erro ao importar SPED.', true);
          return;
        }

        const periodRef = normalizePeriodRef(data?.periodRef || '');
        if (periodRef && periodRefInput) {
          periodRefInput.value = periodRef;
        }

        if (data?.stateRegistrations && typeof data.stateRegistrations === 'object') {
          const nextDeclarant = { ...(currentDeclarantData || {}) };
          nextDeclarant.stateRegistrations = data.stateRegistrations;
          currentDeclarantData = nextDeclarant;
          buildIeTable(data.stateRegistrations);
        }

        const rows = Array.isArray(data?.rows) ? data.rows : [];
        rowsTbody.innerHTML = '';

        if (!rows.length) {
          rowsTbody.appendChild(createRowItem());
        } else {
          rows.forEach((row) => rowsTbody.appendChild(createRowItem({
            uf: row.uf,
            dueDate: row.dueDate || getDefaultDueDate(),
            valueIcms: row.valueIcms ?? 0,
            valueFcp: row.valueFcp ?? 0,
            valueDevolutions: row.valueDevolutions ?? 0,
            valuePrepayments: row.valuePrepayments ?? 0,
          })));
        }

        const stats = data?.stats || {};
        const rowsImported = Number(stats.rowsImported || rows.length);
        const iesImported = Number(stats.importedIeFrom0015 || 0);

        setStatus(
          `Importacao concluida. ${rowsImported} UF(s) preenchida(s) e ${iesImported} inscricao(oes) atualizada(s) pelo 0015.`
        );

        log(`SPED importado: ${spedFile.name}`);
        log(`UFs preenchidas: ${rowsImported}. Inscricoes atualizadas pelo 0015: ${iesImported}.`);

        const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
        warnings.forEach((warning) => log(`Aviso importacao SPED: ${warning}`));
      } catch (error) {
        setStatus(error?.message || 'Erro inesperado ao importar SPED.', true);
      } finally {
        if (btnImportSped) btnImportSped.disabled = false;
        if (spedFileInput) spedFileInput.value = '';
      }
    }

    function collectRowsPayload() {
      const rows = [];
      const seen = new Set();

      const allRows = Array.from(rowsTbody.querySelectorAll('tr'));
      if (!allRows.length) {
        return { error: 'Inclua ao menos uma UF para gerar o TXT.' };
      }

      for (let i = 0; i < allRows.length; i += 1) {
        const line = i + 1;
        const tr = allRows[i];

        const uf = String(tr.querySelector('.giast-row-uf')?.value || '').toUpperCase();
        if (!UFS.includes(uf)) {
          return { error: `Linha ${line}: selecione a UF.` };
        }
        if (seen.has(uf)) {
          return { error: `Linha ${line}: UF ${uf} repetida.` };
        }
        seen.add(uf);

        const dueDate = String(tr.querySelector('.giast-row-date')?.value || '').trim();
        if (!dueDate) {
          return { error: `Linha ${line}: informe a data de vencimento.` };
        }

        const valueIcms = parseMoney(tr.querySelector('.giast-row-icms')?.value || '');
        if (valueIcms === null) {
          return { error: `Linha ${line}: valor DIFAL invalido.` };
        }

        const rawFcp = String(tr.querySelector('.giast-row-fcp')?.value || '').trim();
        const valueFcp = rawFcp ? parseMoney(rawFcp) : 0;
        if (valueFcp === null) {
          return { error: `Linha ${line}: valor FCP invalido.` };
        }

        const rawDevolutions = String(tr.querySelector('.giast-row-devolutions')?.value || '').trim();
        const valueDevolutions = rawDevolutions ? parseMoney(rawDevolutions) : 0;
        if (valueDevolutions === null) {
          return { error: `Linha ${line}: devolucoes/anulacoes invalido.` };
        }

        const rawPrepayments = String(tr.querySelector('.giast-row-prepayments')?.value || '').trim();
        const valuePrepayments = rawPrepayments ? parseMoney(rawPrepayments) : 0;
        if (valuePrepayments === null) {
          return { error: `Linha ${line}: pagamentos antecipados invalido.` };
        }

        rows.push({
          uf,
          dueDate,
          valueIcms,
          valueFcp,
          valueDevolutions,
          valuePrepayments,
        });
      }

      return { rows };
    }

    async function generateTxt() {
      clearStatus();

      if (!currentDeclarantId) {
        setStatus('Selecione um declarante antes de gerar o TXT.', true);
        return;
      }

      const periodRef = normalizePeriodRef(periodRefInput?.value || '');
      if (!periodRef) {
        setStatus('Periodo de referencia invalido. Use MMAAAA.', true);
        return;
      }

      const collected = collectRowsPayload();
      if (collected.error) {
        setStatus(collected.error, true);
        return;
      }

      const payload = {
        declarantId: currentDeclarantId,
        periodRef,
        rows: collected.rows,
      };

      btnGenerateTxt.disabled = true;
      setStatus('Gerando TXT da GIA-ST...');

      try {
        const resp = await AuthClient.authFetch('/api/giast/generate-txt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.ok) {
          setStatus(data?.error || 'Erro ao gerar TXT.', true);
          return;
        }

        if (!data.txtBase64) {
          setStatus('Resposta sem arquivo para download.', true);
          return;
        }

        const fileName = data.fileName || `GIAST_${periodRef}.txt`;
        const blob = toDownloadBlobFromBase64(data.txtBase64);
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        const blocks = Number(data.blockCount || 0);
        setStatus('TXT gerado com sucesso.');
        log(`Arquivo ${fileName} gerado com ${blocks} bloco(s).`);

        collected.rows.forEach((row) => {
          log(`UF ${row.uf} | Vencimento ${row.dueDate} | DIFAL ${fmtMoney(row.valueIcms)} | FCP ${fmtMoney(row.valueFcp)} | Devolucoes ${fmtMoney(row.valueDevolutions)} | Antecipados ${fmtMoney(row.valuePrepayments)}`);
        });
      } catch (error) {
        setStatus(error?.message || 'Erro inesperado na geracao.', true);
      } finally {
        btnGenerateTxt.disabled = false;
      }
    }

    declarantCnpj?.addEventListener('input', () => {
      declarantCnpj.value = formatCnpj(declarantCnpj.value);
    });

    declarantCpf?.addEventListener('input', () => {
      declarantCpf.value = formatCpf(declarantCpf.value);
    });

    declarantPhone?.addEventListener('input', () => {
      declarantPhone.value = formatPhone(declarantPhone.value);
    });

    periodRefInput?.addEventListener('input', () => {
      periodRefInput.value = onlyDigits(periodRefInput.value).slice(0, 6);
    });

    declarantTrigger?.addEventListener('click', () => {
      const menu = ensureDeclarantMenu();
      const isOpen = !menu.classList.contains('is-hidden');
      if (isOpen) {
        closeDeclarantMenu();
        return;
      }
      openDeclarantMenu();
    });

    declarantTrigger?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDeclarantMenu();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDeclarantMenu();
      }
    });

    document.addEventListener('pointerdown', (event) => {
      const menu = ensureDeclarantMenu();
      if (menu.classList.contains('is-hidden')) return;

      const insideMenu = menu.contains(event.target);
      const insideTrigger = declarantTrigger?.contains(event.target);
      if (insideMenu || insideTrigger) return;

      closeDeclarantMenu();
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeDeclarantMenu();
      }
    });

    window.addEventListener('resize', closeDeclarantMenu);
    window.addEventListener('scroll', closeDeclarantMenu, true);

    declarantSelect?.addEventListener('change', async () => {
      clearStatus();
      syncDeclarantTriggerLabel();
      const selected = String(declarantSelect.value || '');

      if (!selected) {
        currentDeclarantId = null;
        currentDeclarantData = null;
        lastSelectedDeclarantId = null;
        setEditorMode('hidden');
        setGenerateVisible(false);
        syncDeclarantTriggerLabel();
        closeDeclarantMenu();
        return;
      }

      try {
        await loadDeclarantDetail(Number(selected));
      } catch (error) {
        setStatus(error?.message || 'Erro ao selecionar declarante.', true);
      }
    });

    btnNewDeclarant?.addEventListener('click', () => {
      clearStatus();
      enterCreateMode();
    });

    btnEditDeclarant?.addEventListener('click', async () => {
      clearStatus();
      try {
        await enterEditMode();
      } catch (error) {
        setStatus(error?.message || 'Erro ao abrir edicao do declarante.', true);
      }
    });

    btnCancelDeclarant?.addEventListener('click', async () => {
      clearStatus();
      try {
        await cancelDeclarantEditor();
      } catch (error) {
        setStatus(error?.message || 'Erro ao cancelar cadastro.', true);
      }
    });

    btnSaveDeclarant?.addEventListener('click', async () => {
      try {
        await saveDeclarant();
      } catch (error) {
        setStatus(error?.message || 'Erro ao salvar declarante.', true);
      }
    });

    btnDeleteDeclarantEditor?.addEventListener('click', async () => {
      try {
        await deleteDeclarant();
      } catch (error) {
        setStatus(error?.message || 'Erro ao excluir declarante.', true);
      }
    });

    btnAddRow?.addEventListener('click', () => {
      rowsTbody.appendChild(createRowItem());
    });

    btnImportSped?.addEventListener('click', async () => {
      await importSpedAndPrefill();
    });

    btnGenerateTxt?.addEventListener('click', generateTxt);

    if (periodRefInput) {
      periodRefInput.value = getDefaultPeriodRefPreviousMonth();
    }

    rowsTbody.innerHTML = '';
    rowsTbody.appendChild(createRowItem());

    setEditorMode('hidden');
    setGenerateVisible(false);
    clearDeclarantForm();
    syncDeclarantTriggerLabel();
    closeDeclarantMenu();

    enableArrowNavigation(document.querySelector('.nfe-main') || document.body);

    try {
      await loadDeclarants();

      if (declarants.length) {
        const firstId = Number(declarants[0].id);
        await loadDeclarantDetail(firstId);
      }

      log('Tela GIAST inicializada.');
    } catch (error) {
      setStatus(error?.message || 'Falha ao inicializar tela GIAST.', true);
    }
  });
})();
