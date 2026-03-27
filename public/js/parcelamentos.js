/* global AuthClient, inicializarSidebar */

(function () {
  const API_BASE = '/api/parcelamentos';
  const GROUP_ORDER = [
    'PERT 1124',
    'PGFN',
    'ICMS',
    'SIMPLIFICADO',
    'ICMS SC',
    '1124',
    'ITCMD',
    'NÃO PREVIDENCIARIO',
    '4308',
    'PERTSN',
    'RELPSN',
  ];

  const GROUP_LABELS = {
    'PERT 1124': 'PERT 1124',
    PGFN: 'PGFN',
    ICMS: 'ICMS',
    SIMPLIFICADO: 'SIMPLIFICADO',
    'ICMS SC': 'ICMS SC',
    '1124': '1124',
    ITCMD: 'ITCMD',
    'NÃO PREVIDENCIARIO': 'NÃO PREVIDENCIARIO',
    '4308': '4308',
    PERTSN: 'PERTSN',
    RELPSN: 'RELPSN',
  };

  const SORT_LABELS = {
    companyName: 'Empresa / CNPJ',
    cnpj: 'CNPJ',
    parcelamentoNumber: 'Número',
    debitAccount: 'Débito',
    observations: 'Observações',
  };

  const state = {
    items: [],
    loading: false,
    total: 0,
    sortField: 'companyName',
    sortDirection: 'asc',
    editingId: null,
    mode: 'create',
    lastMessage: '',
  };

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizeDigits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
    return date.toLocaleDateString('pt-BR');
  }

  function cleanObservations(value) {
    return String(value || '')
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/^parcelamento original:/i.test(part))
      .filter((part) => !/^fonte planilha:/i.test(part))
      .join(' | ');
  }

  function safeJson(response) {
    return response.json().catch(() => null);
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

  function setModalMode(mode) {
    state.mode = mode === 'edit' ? 'edit' : 'create';
    const title = $('parcelamentosModalTitle');
    const hint = $('parcelamentosModalHint');
    const saveBtn = $('btnSaveParcelamento');

    if (state.mode === 'edit') {
      if (title) title.textContent = 'Editar parcelamento';
      if (hint) hint.textContent = 'Edite apenas os campos manuais. O débito em conta permanece como foi cadastrado inicialmente.';
      if (saveBtn) saveBtn.textContent = 'Salvar alterações';
    } else {
      if (title) title.textContent = 'Novo parcelamento';
      if (hint) hint.textContent = 'Preencha os campos para cadastrar um novo parcelamento.';
      if (saveBtn) saveBtn.textContent = 'Cadastrar parcelamento';
    }
  }

  function fillForm(item = null) {
    $('parcelamentosEditingId').value = item?.id ? String(item.id) : '';
    $('companyName').value = item?.companyName || '';
    $('cnpj').value = item?.cnpjFormatted || formatCnpj(item?.cnpj || '');
    $('parcelamentoType').value = item?.parcelamentoType || '';
    $('parcelamentoNumber').value = item?.parcelamentoNumber || '';
    $('startDate').value = item?.startDate || '';
    $('observations').value = item?.observations || '';

    const debitField = $('debitAccount');
    if (debitField) {
      debitField.checked = !!item?.debitAccount;
      debitField.disabled = state.mode === 'edit';
    }
  }

  function openModal(item = null) {
    const modal = $('parcelamentosModal');
    if (!modal) return;

    state.editingId = item?.id ? Number(item.id) : null;
    setModalMode(item ? 'edit' : 'create');
    fillForm(item);
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
  }

  function validateForm(payload) {
    if (!payload.companyName) return 'Informe o nome da empresa.';
    if (payload.cnpj.length !== 14) return 'Informe um CNPJ com 14 dígitos.';
    if (!payload.parcelamentoType) return 'Informe o tipo do parcelamento.';
    if (!payload.parcelamentoNumber) return 'Informe o número do parcelamento.';
    if (!payload.startDate) return 'Informe a data de início.';
    return '';
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

  function classifyParcelamentoGroup(typeValue) {
    const text = normalizeText(typeValue);
    if (!text) return null;

    if (text.includes('pert') && text.includes('1124')) return 'PERT 1124';
    if (text === 'pgfn' || text.startsWith('pgfn ')) return 'PGFN';
    if (text.includes('icms sc')) return 'ICMS SC';
    if (text === 'icms' || text.startsWith('icms ')) return 'ICMS';
    if (text.includes('simplificad') || text.includes('simples nacional')) return 'SIMPLIFICADO';
    if (text === '1124' || text.startsWith('1124 ')) return '1124';
    if (text.includes('itcmd')) return 'ITCMD';
    if (text.includes('nao previdenciario') || text.includes('previdenciario')) return 'NÃO PREVIDENCIARIO';
    if (text.includes('4308')) return '4308';
    if (text.includes('pertsn') || text.includes('pert sn')) return 'PERTSN';
    if (text.includes('relpsn')) return 'RELPSN';
    return null;
  }

  function compareValues(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'pt-BR', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  function sortValue(item, field) {
    switch (field) {
      case 'cnpj':
        return normalizeDigits(item.cnpj || '');
      case 'parcelamentoNumber':
        return normalizeText(item.parcelamentoNumber || '');
      case 'debitAccount':
        return item.debitAccount ? 1 : 0;
      case 'observations':
        return normalizeText(item.observations || '');
      case 'companyName':
      default:
        return normalizeText(item.companyName || '');
    }
  }

  function sortItems(items) {
    const sorted = [...items];
    const direction = state.sortDirection === 'desc' ? -1 : 1;
    const field = state.sortField;

    sorted.sort((left, right) => {
      const a = sortValue(left, field);
      const b = sortValue(right, field);

      if (typeof a === 'number' && typeof b === 'number') {
        return (a - b) * direction;
      }

      return compareValues(a, b) * direction;
    });

    return sorted;
  }

  function sortArrow(field) {
    if (state.sortField !== field) return '↕';
    return state.sortDirection === 'asc' ? '↑' : '↓';
  }

  function setSort(field) {
    if (state.sortField === field) {
      state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortField = field;
      state.sortDirection = 'asc';
    }
    renderList();
  }

  function renderSortButton(field, label) {
    const activeClass = state.sortField === field ? ' is-active' : '';
    return `
      <button type="button" class="parcelamentos-sort-btn${activeClass}" data-sort-field="${field}">
        <span>${escapeHtml(label)}</span>
        <strong>${sortArrow(field)}</strong>
      </button>
    `;
  }

  function renderRow(item) {
    const observations = cleanObservations(item.observations);
    const debitClass = item.debitAccount ? 'is-on' : 'is-off';
    const debitLabel = item.debitAccount ? 'Débito em conta' : 'Sem débito em conta';

    return `
      <tr data-id="${escapeHtml(String(item.id || ''))}">
        <td class="parcelamentos-company-cell">
          <strong>${escapeHtml(item.companyName || 'Empresa sem nome')}</strong>
          <span>${escapeHtml(item.cnpjFormatted || formatCnpj(item.cnpj))}</span>
        </td>
        <td>${escapeHtml(item.parcelamentoNumber || '-')}</td>
        <td><span class="parcelamentos-debit-pill ${debitClass}">${escapeHtml(debitLabel)}</span></td>
        <td class="parcelamentos-observations-cell">${observations ? escapeHtml(observations) : ''}</td>
        <td class="parcelamentos-actions-cell">
          <button type="button" class="btn btn-secondary parcelamentos-edit-btn" data-action="edit-parcelamento" data-id="${escapeHtml(String(item.id || ''))}">
            Editar
          </button>
        </td>
      </tr>
    `;
  }

  function renderGroup(title, items) {
    const sorted = sortItems(items);
    const label = GROUP_LABELS[title] || title;
    const count = sorted.length;

    return `
      <section class="parcelamentos-group" data-group="${escapeHtml(title)}">
        <div class="parcelamentos-group-header">
          <div>
            <h3>${escapeHtml(label)}</h3>
            <p>${count} registro(s)</p>
          </div>
          <div class="parcelamentos-group-actions">
            <span class="nfe-breadcrumb">Ordenação: ${escapeHtml(SORT_LABELS[state.sortField] || 'Empresa / CNPJ')} ${state.sortDirection === 'asc' ? 'crescente' : 'decrescente'}</span>
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
                <th>${renderSortButton('companyName', 'Empresa / CNPJ')}</th>
                <th>${renderSortButton('parcelamentoNumber', 'Número')}</th>
                <th>${renderSortButton('debitAccount', 'Débito')}</th>
                <th>${renderSortButton('observations', 'Observações')}</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${sorted.length ? sorted.map(renderRow).join('') : '<tr><td class="parcelamentos-table-empty" colspan="5">Nenhum registro neste grupo.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function buildGroupedItems(items) {
    const grouped = new Map();
    GROUP_ORDER.forEach((groupName) => grouped.set(groupName, []));

    for (const item of items) {
      const group = classifyParcelamentoGroup(item.parcelamentoType);
      if (!group) continue;
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(item);
    }

    return GROUP_ORDER
      .map((groupName) => ({ groupName, items: grouped.get(groupName) || [] }))
      .filter((entry) => entry.items.length > 0);
  }

  function renderList() {
    const list = $('parcelamentosList');
    const total = $('parcelamentosTotal');
    if (!list) return;

    if (total) total.textContent = String(state.total || 0);

    if (state.loading) {
      list.innerHTML = '<div class="parcelamentos-table-empty">Carregando parcelamentos...</div>';
      setSummary('Carregando registros do banco de dados.');
      return;
    }

    if (!state.items.length) {
      list.innerHTML = '<div class="parcelamentos-table-empty">Nenhum parcelamento cadastrado ainda.</div>';
      setSummary('Nenhum registro encontrado.');
      return;
    }

    const grouped = buildGroupedItems(state.items);
    if (!grouped.length) {
      list.innerHTML = '<div class="parcelamentos-table-empty">Nenhum parcelamento se encaixa nos grupos configurados.</div>';
      setSummary(`Mostrando ${state.items.length} de ${state.total} registro(s).`);
      return;
    }

    list.innerHTML = grouped.map((entry) => renderGroup(entry.groupName, entry.items)).join('');
    setSummary(`Mostrando ${state.items.length} de ${state.total} registro(s).`);
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

    const editingId = Number(state.editingId || $('parcelamentosEditingId')?.value || 0) || null;
    const isEditing = !!editingId;
    const url = isEditing ? `${API_BASE}/${editingId}` : API_BASE;
    const method = isEditing ? 'PUT' : 'POST';

    setMessage(isEditing ? 'Salvando alterações...' : 'Salvando parcelamento...');

    try {
      const response = await AuthClient.authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || (isEditing ? 'Falha ao atualizar parcelamento.' : 'Falha ao cadastrar parcelamento.'));
      }

      setMessage(isEditing ? 'Parcelamento atualizado com sucesso.' : 'Parcelamento cadastrado com sucesso.');
      $('parcelamentosForm')?.reset();
      state.editingId = null;
      $('parcelamentosEditingId').value = '';
      closeModal();
      await loadParcelamentos({ silentMessage: true });
    } catch (error) {
      console.error(error);
      setMessage(error.message || 'Erro ao salvar parcelamento.', true);
    }
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
      `A importação vai substituir toda a base atual de parcelamentos com os dados de "${fileName}". Deseja continuar?`
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
      setMessage(`Importação concluída: ${imported} registro(s) carregado(s), substituindo ${replacedExisting} anterior(es).`);
      await loadParcelamentos({ silentMessage: true });
    } catch (error) {
      console.error(error);
      setMessage(error.message || 'Erro ao importar planilha.', true);
    } finally {
      const input = $('parcelamentosImportInput');
      if (input) input.value = '';
    }
  }

  function bindEvents() {
    $('btnOpenParcelamentoModal')?.addEventListener('click', () => {
      state.editingId = null;
      setModalMode('create');
      fillForm(null);
      openModal();
    });

    $('btnImportParcelamentos')?.addEventListener('click', () => {
      $('parcelamentosImportInput')?.click();
    });

    $('btnRefreshList')?.addEventListener('click', () => loadParcelamentos());
    $('btnCloseParcelamentoModal')?.addEventListener('click', closeModal);
    $('btnCancelParcelamentoModal')?.addEventListener('click', closeModal);
    $('parcelamentosModalOverlay')?.addEventListener('click', closeModal);

    $('parcelamentosModal')?.addEventListener('click', (event) => {
      if (event.target?.id === 'parcelamentosModal') {
        closeModal();
      }
    });

    $('parcelamentosForm')?.addEventListener('submit', submitForm);
    $('parcelamentosImportInput')?.addEventListener('change', (event) => {
      const [file] = Array.from(event.target?.files || []);
      if (file) importWorkbookFile(file);
    });

    $('parcelamentosList')?.addEventListener('click', (event) => {
      const sortBtn = event.target.closest('.parcelamentos-sort-btn');
      if (sortBtn) {
        const field = sortBtn.getAttribute('data-sort-field');
        if (field) setSort(field);
        return;
      }

      const editBtn = event.target.closest('[data-action="edit-parcelamento"]');
      if (!editBtn) return;

      const id = Number(editBtn.getAttribute('data-id') || 0);
      const item = state.items.find((entry) => Number(entry.id) === id);
      if (!item) {
        setMessage('Parcelamento não encontrado para edição.', true);
        return;
      }

      setModalMode('edit');
      fillForm(item);
      openModal(item);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isModalOpen()) {
        closeModal();
      }
    });
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

    bindEvents();
    await loadParcelamentos();
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
