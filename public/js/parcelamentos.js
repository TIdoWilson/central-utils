/* global AuthClient, inicializarSidebar */

(function () {
  const API_BASE = '/api/parcelamentos';

  const GROUP_ORDER = [
    { key: 'pert-1124', label: 'PERT 1124' },
    { key: 'pgfn', label: 'PGFN' },
    { key: 'icms', label: 'ICMS' },
    { key: 'simplificado', label: 'SIMPLIFICADO' },
    { key: 'icms-sc', label: 'ICMS SC' },
    { key: '1124', label: '1124' },
    { key: 'itcmd', label: 'ITCMD' },
    { key: 'nao-previdenciario', label: 'NÃO PREVIDENCIARIO' },
    { key: '4308', label: '4308' },
    { key: 'pertsn', label: 'PERTSN' },
    { key: 'relpsn', label: 'RELPSN' },
  ];

  const state = {
    items: [],
    loading: false,
    total: 0,
    lastMessage: '',
    sortKey: 'companyName',
    sortDir: 'asc',
    editId: null,
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

  function normalizeDigits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function formatCnpj(value) {
    const digits = normalizeDigits(value);
    if (digits.length !== 14) return String(value || '').trim() || '-';
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value || '-');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());
    return `${day}/${month}/${year}`;
  }

  function formatDateInput(value) {
    const raw = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }

  function safeJson(resp) {
    return resp.json().catch(() => null);
  }

  function setMessage(message, isError = false) {
    const el = $('parcelamentosMessage');
    if (!el) return;
    el.textContent = String(message || '');
    el.style.color = isError ? '#b91c1c' : '#166534';
    state.lastMessage = String(message || '');
  }

  function setSummary(message) {
    const el = $('parcelamentosSummary');
    if (!el) return;
    el.textContent = String(message || '');
  }

  function isModalOpen() {
    const modal = $('parcelamentosModal');
    return !!modal && !modal.classList.contains('hidden');
  }

  function resetForm() {
    $('parcelamentosForm')?.reset();
    if ($('debitAccount')) $('debitAccount').checked = false;
    if ($('parcelamentoId')) $('parcelamentoId').value = '';
  }

  function setModalMode(mode, item = null) {
    const title = $('parcelamentosModalTitle');
    const hint = $('parcelamentosModalHint');
    const save = $('btnSaveParcelamento');
    const debitField = $('parcelamentosDebitField');
    const idInput = $('parcelamentoId');

    state.editId = mode === 'edit' && item ? Number(item.id || 0) || null : null;
    if (idInput) idInput.value = state.editId ? String(state.editId) : '';

    if (title) title.textContent = mode === 'edit' ? 'Editar parcelamento' : 'Novo parcelamento';
    if (save) save.textContent = mode === 'edit' ? 'Salvar alteracoes' : 'Cadastrar parcelamento';
    if (hint) {
      hint.textContent = mode === 'edit'
        ? 'Edite apenas os campos manuais. O debito em conta permanece como foi cadastrado inicialmente.'
        : 'Preencha os dados abaixo para salvar o parcelamento no banco. O campo de debito em conta e definido apenas no cadastro inicial.';
    }
    if (debitField) debitField.hidden = mode === 'edit';
  }

  function openCreateModal() {
    const modal = $('parcelamentosModal');
    if (!modal) return;

    resetForm();
    setModalMode('create');
    setMessage('');

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    window.setTimeout(() => {
      $('companyName')?.focus();
    }, 0);
  }

  function openEditModal(item) {
    const modal = $('parcelamentosModal');
    if (!modal || !item) return;

    resetForm();
    setModalMode('edit', item);

    if ($('companyName')) $('companyName').value = item.companyName || '';
    if ($('cnpj')) $('cnpj').value = item.cnpjFormatted || formatCnpj(item.cnpj) || '';
    if ($('parcelamentoType')) $('parcelamentoType').value = item.parcelamentoType || '';
    if ($('parcelamentoNumber')) $('parcelamentoNumber').value = item.parcelamentoNumber || '';
    if ($('startDate')) $('startDate').value = formatDateInput(item.startDate);
    if ($('observations')) $('observations').value = item.observations || '';

    setMessage('');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    window.setTimeout(() => {
      $('companyName')?.focus();
    }, 0);
  }

  function closeModal() {
    const modal = $('parcelamentosModal');
    if (!modal) return;

    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setModalMode('create');
    resetForm();
  }

  function normalizeGroupKey(item) {
    const typeText = normalizeText(item?.parcelamentoType);
    const numberText = normalizeText(item?.parcelamentoNumber);
    const combined = `${typeText} ${numberText}`.trim();

    if (/pert\s*1124/.test(combined) || (/pert/.test(combined) && /\b1124\b/.test(combined))) return 'pert-1124';
    if (/pgfn/.test(combined)) return 'pgfn';
    if (/^icms\s*sc\b/.test(typeText) || /\bicms\s*sc\b/.test(combined)) return 'icms-sc';
    if (/^icms\b/.test(typeText) || /\bicms\b/.test(combined)) return 'icms';
    if (/^simplificado\b/.test(typeText) || /\bsimplificado\b/.test(combined)) return 'simplificado';
    if (/\b1124\b/.test(combined)) return '1124';
    if (/itcmd/.test(combined)) return 'itcmd';
    if (/nao previdenciario/.test(combined) || /não previdenciario/.test(combined)) return 'nao-previdenciario';
    if (/\b4308\b/.test(combined)) return '4308';
    if (/pertsn/.test(combined)) return 'pertsn';
    if (/relpsn/.test(combined)) return 'relpsn';
    return null;
  }

  function compareStrings(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  function compareItems(a, b, key) {
    switch (key) {
      case 'companyName':
        return compareStrings(a.companyName, b.companyName) || compareStrings(a.cnpj, b.cnpj);
      case 'cnpj':
        return compareStrings(normalizeDigits(a.cnpj), normalizeDigits(b.cnpj)) || compareStrings(a.companyName, b.companyName);
      case 'parcelamentoNumber':
        return compareStrings(a.parcelamentoNumber, b.parcelamentoNumber) || compareStrings(a.companyName, b.companyName);
      case 'startDate':
        return compareStrings(a.startDate, b.startDate) || compareStrings(a.companyName, b.companyName);
      case 'debitAccount':
        return Number(!!a.debitAccount) - Number(!!b.debitAccount) || compareStrings(a.companyName, b.companyName);
      case 'observations':
        return compareStrings(a.observations || '', b.observations || '') || compareStrings(a.companyName, b.companyName);
      default:
        return compareStrings(a.companyName, b.companyName);
    }
  }

  function toggleSort(key) {
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortKey = key;
      state.sortDir = key === 'startDate' ? 'desc' : 'asc';
    }
    renderList();
  }

  function getSortedItems(items) {
    const list = Array.isArray(items) ? [...items] : [];
    const direction = state.sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => compareItems(a, b, state.sortKey) * direction);
    return list;
  }

  function groupItems(items) {
    const map = new Map(GROUP_ORDER.map((group) => [group.key, []]));
    for (const item of getSortedItems(items)) {
      const key = normalizeGroupKey(item);
      if (!key || !map.has(key)) continue;
      const bucket = map.get(key);
      bucket.push(item);
    }
    return GROUP_ORDER
      .map((group) => ({ ...group, items: map.get(group.key) || [] }))
      .filter((group) => group.items.length > 0);
  }

  function sortArrow(key) {
    if (state.sortKey !== key) return '';
    return state.sortDir === 'asc' ? '^' : 'v';
  }

  function sortButton(key, label) {
    return `
      <button type="button" class="parcelamentos-sort-btn ${state.sortKey === key ? 'is-active' : ''}" data-sort-key="${escapeHtml(key)}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(sortArrow(key))}</strong>
      </button>
    `;
  }

  function renderGroup(group) {
    const rows = group.items.map((item) => {
      const observations = String(item.observations || '').trim();
      return `
        <tr data-parcelamento-id="${escapeHtml(String(item.id || ''))}">
          <td class="parcelamentos-company-cell">
            <strong>${escapeHtml(item.companyName || 'Empresa sem nome')}</strong>
            <span>${escapeHtml(item.cnpjFormatted || formatCnpj(item.cnpj))}</span>
          </td>
          <td>${escapeHtml(item.parcelamentoNumber || '-')}</td>
          <td>
            <span class="parcelamentos-debit-pill ${item.debitAccount ? 'is-on' : 'is-off'}">
              ${escapeHtml(item.debitAccount ? 'Sim' : 'Nao')}
            </span>
          </td>
          <td class="parcelamentos-observations-cell">${observations ? escapeHtml(observations) : ''}</td>
          <td class="parcelamentos-actions-cell">
            <button type="button" class="btn btn-secondary parcelamentos-edit-btn" data-parcelamento-id="${escapeHtml(String(item.id || ''))}">
              Editar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <section class="parcelamentos-group">
        <div class="parcelamentos-group-header">
          <div>
            <h3>${escapeHtml(group.label)}</h3>
            <p>${escapeHtml(String(group.items.length))} registro(s)</p>
          </div>
        </div>
        <div class="parcelamentos-table-wrap">
          <table class="parcelamentos-table">
            <colgroup>
              <col class="parcelamentos-col-company" />
              <col class="parcelamentos-col-number" />
              <col class="parcelamentos-col-debit" />
              <col class="parcelamentos-col-observations" />
              <col class="parcelamentos-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>${sortButton('companyName', 'Empresa / CNPJ')}</th>
                <th>${sortButton('parcelamentoNumber', 'Numero')}</th>
                <th>${sortButton('debitAccount', 'Debito em conta')}</th>
                <th>${sortButton('observations', 'Observacoes')}</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderList() {
    const list = $('parcelamentosList');
    const total = $('parcelamentosTotal');
    if (!list) return;

    if (total) total.textContent = String(state.total || 0);

    if (state.loading) {
      list.innerHTML = `
        <div class="parcelamentos-table-wrap">
          <table class="parcelamentos-table">
            <colgroup>
              <col class="parcelamentos-col-company" />
              <col class="parcelamentos-col-number" />
              <col class="parcelamentos-col-debit" />
              <col class="parcelamentos-col-observations" />
              <col class="parcelamentos-col-actions" />
            </colgroup>
            <tbody>
              <tr>
                <td colspan="5" class="parcelamentos-table-empty">Carregando parcelamentos...</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
      setSummary('Carregando registros do banco de dados.');
      return;
    }

    if (!state.items.length) {
      list.innerHTML = `
        <div class="parcelamentos-table-wrap">
          <table class="parcelamentos-table">
            <colgroup>
              <col class="parcelamentos-col-company" />
              <col class="parcelamentos-col-number" />
              <col class="parcelamentos-col-debit" />
              <col class="parcelamentos-col-observations" />
              <col class="parcelamentos-col-actions" />
            </colgroup>
            <tbody>
              <tr>
                <td colspan="5" class="parcelamentos-table-empty">Nenhum parcelamento cadastrado ainda.</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
      setSummary('Nenhum registro encontrado.');
      return;
    }

    const groups = groupItems(state.items);
    setSummary(`Mostrando ${state.items.length} de ${state.total} registro(s).`);
    list.innerHTML = groups.map(renderGroup).join('');
  }

  function getFormData() {
    return {
      companyName: String($('companyName')?.value || '').trim(),
      cnpj: normalizeDigits($('cnpj')?.value || ''),
      parcelamentoType: String($('parcelamentoType')?.value || '').trim(),
      parcelamentoNumber: String($('parcelamentoNumber')?.value || '').trim(),
      startDate: String($('startDate')?.value || '').trim(),
      debitAccount: !!$('debitAccount')?.checked,
      observations: String($('observations')?.value || '').trim(),
    };
  }

  function validateForm(payload) {
    if (!payload.companyName) return 'Informe o nome da empresa.';
    if (payload.cnpj.length !== 14) return 'Informe um CNPJ com 14 digitos.';
    if (!payload.parcelamentoType) return 'Informe o tipo do parcelamento.';
    if (!payload.parcelamentoNumber) return 'Informe o numero do parcelamento.';
    if (!payload.startDate) return 'Informe a data de inicio.';
    return '';
  }

  async function importWorkbookFile(file) {
    if (!file) return;

    const fileName = String(file.name || 'planilha.xlsx');
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      setMessage('Selecione um arquivo Excel .xlsx ou .xls.', true);
      return;
    }

    const confirmed = window.confirm(
      `A importacao vai substituir toda a base atual de parcelamentos com os dados de "${fileName}". Deseja continuar?`
    );
    if (!confirmed) return;

    const formData = new FormData();
    formData.append('file', file, fileName);

    setMessage('Importando planilha e atualizando a base...');

    try {
      const response = await AuthClient.authFetch(`${API_BASE}/import-file`, {
        method: 'POST',
        body: formData,
      });

      const data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao importar planilha.');
      }

      const imported = Number(data?.imported || 0);
      const replacedExisting = Number(data?.replacedExisting || 0);
      setMessage(`Importacao concluida: ${imported} registro(s) carregado(s), substituindo ${replacedExisting} anterior(es).`);
      await loadParcelamentos({ silentMessage: true });
    } catch (error) {
      console.error(error);
      setMessage(error.message || 'Erro ao importar planilha.', true);
    } finally {
      const input = $('parcelamentosImportInput');
      if (input) input.value = '';
    }
  }

  async function loadParcelamentos(options = {}) {
    const silentMessage = !!options.silentMessage;
    state.loading = true;
    renderList();

    try {
      const response = await AuthClient.authFetch(API_BASE, { method: 'GET' });
      const data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao carregar parcelamentos.');
      }

      state.items = Array.isArray(data.items) ? data.items : [];
      state.total = Number(data?.meta?.total || state.items.length || 0);
      state.loading = false;
      renderList();
      if (!silentMessage) {
        setMessage(state.items.length ? 'Lista atualizada.' : 'Nenhum parcelamento cadastrado ainda.');
      }
      return state.items;
    } catch (error) {
      console.error(error);
      state.items = [];
      state.total = 0;
      state.loading = false;
      renderList();
      if (!silentMessage) {
        setMessage(error.message || 'Erro ao carregar parcelamentos.', true);
      }
      return [];
    }
  }

  async function submitForm(event) {
    event.preventDefault();

    const payload = getFormData();
    const validationError = validateForm(payload);
    if (validationError) {
      setMessage(validationError, true);
      return;
    }

    const editingId = state.editId;
    const isEditing = Number.isFinite(editingId) && editingId > 0;
    setMessage(isEditing ? 'Salvando alteracoes...' : 'Salvando parcelamento...');

    try {
      const response = await AuthClient.authFetch(
        isEditing ? `${API_BASE}/${editingId}` : API_BASE,
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || (isEditing ? 'Falha ao atualizar parcelamento.' : 'Falha ao cadastrar parcelamento.'));
      }

      setMessage(isEditing ? 'Parcelamento atualizado com sucesso.' : 'Parcelamento cadastrado com sucesso.');
      closeModal();
      await loadParcelamentos({ silentMessage: true });
    } catch (error) {
      console.error(error);
      setMessage(error.message || (isEditing ? 'Erro ao atualizar parcelamento.' : 'Erro ao cadastrar parcelamento.'), true);
    }
  }

  async function boot() {
    if (typeof inicializarSidebar === 'function') {
      await inicializarSidebar('parcelamentos');
    }

    const ctx = await AuthClient.getAuthContext().catch(() => null);
    if (!ctx?.user) {
      window.location.href = '/login';
      return;
    }

    const whoami = $('whoami');
    if (whoami) {
      whoami.textContent = `Logado como: ${ctx.user.name} <${ctx.user.email}> (${ctx.user.role})`;
    }

    $('btnOpenParcelamentoModal')?.addEventListener('click', openCreateModal);
    $('btnImportParcelamentos')?.addEventListener('click', () => {
      $('parcelamentosImportInput')?.click();
    });
    $('btnCloseParcelamentoModal')?.addEventListener('click', closeModal);
    $('btnCancelParcelamentoModal')?.addEventListener('click', closeModal);
    $('parcelamentosModalOverlay')?.addEventListener('click', closeModal);
    $('parcelamentosModal')?.addEventListener('click', (event) => {
      if (event.target?.id === 'parcelamentosModal') {
        closeModal();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isModalOpen()) {
        closeModal();
      }
    });

    $('parcelamentosForm')?.addEventListener('submit', submitForm);
    $('btnRefreshList')?.addEventListener('click', () => loadParcelamentos());
    $('parcelamentosImportInput')?.addEventListener('change', (event) => {
      const [file] = Array.from(event.target?.files || []);
      if (file) {
        importWorkbookFile(file);
      }
    });

    $('parcelamentosList')?.addEventListener('click', (event) => {
      const sortButton = event.target?.closest?.('.parcelamentos-sort-btn');
      if (sortButton) {
        toggleSort(sortButton.getAttribute('data-sort-key') || 'companyName');
        return;
      }

      const button = event.target?.closest?.('.parcelamentos-edit-btn');
      if (!button) return;
      const id = Number(button.getAttribute('data-parcelamento-id') || 0);
      const item = state.items.find((entry) => Number(entry.id) === id);
      if (item) {
        openEditModal(item);
      }
    });

    await loadParcelamentos();
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
