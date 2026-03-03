document.addEventListener('DOMContentLoaded', async () => {
  if (typeof inicializarSidebar === 'function') {
    await inicializarSidebar('sn');
  }

  if (!window.AuthClient) {
    console.error('AuthClient não carregado. Inclua /js/auth-client.js antes do /js/sn.js');
    window.location.href = '/login';
    return;
  }

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx) {
    window.location.href = '/login';
    return;
  }

  const paMes = document.getElementById('paMes');
  const paAno = document.getElementById('paAno');
  const companiesOptions = document.getElementById('companiesOptions');
  const snCompaniesMeta = document.getElementById('snCompaniesMeta');
  const snCompanySearch = document.getElementById('snCompanySearch');

  const btnEnviar =
    document.getElementById('btnEnviarDeclaracao') || document.getElementById('btnEnviarDecl');
  const btnConsultar = document.getElementById('btnConsultarRecibos');
  const btnDownloadTodos = document.getElementById('btnDownloadTodosRecibos');

  const snStatus = document.getElementById('snStatus');
  const consumoInfo = document.getElementById('consumoInfo');

  const companyModal = document.getElementById('companyModal');
  const companyModalOverlay = document.getElementById('companyModalOverlay');
  const companyModalTitle = document.getElementById('companyModalTitle');
  const btnOpenCompanyModal =
    document.getElementById('btnOpenCompanyModal') || document.getElementById('openCompanyModal');
  const btnCloseCompanyModal = document.getElementById('closeCompanyModal');
  const btnSaveCompany = document.getElementById('btnSaveCompany');
  const snCompanyForm = document.getElementById('snCompanyForm');
  const snCompanyMessage = document.getElementById('snCompanyMessage');
  const companyIdInput = document.getElementById('cadCompanyId');
  const cnpjInput = document.getElementById('cadCnpj');
  const razaoInput = document.getElementById('cadRazao');

  const companiesDropdown = document.getElementById('companiesDropdown');
  if (companiesDropdown && companiesOptions) {
    companiesDropdown.addEventListener('click', () => companiesOptions.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!companiesOptions.contains(e.target) && !companiesDropdown.contains(e.target)) {
        companiesOptions.classList.remove('open');
      }
    });
  }

  let lastSnResults = null;
  let companyModalMode = 'create';
  let currentCompanies = [];
  let selectedCompanyIds = new Set();
  let lastCnpjLookup = '';
  let lastAutoFilledRazao = '';

  function extractReceiptIds(data) {
    const fromTop = Array.isArray(data?.receiptIds) ? data.receiptIds : [];
    const fromRows = Array.isArray(data?.resultados)
      ? data.resultados.filter((r) => r?.receiptId).map((r) => r.receiptId)
      : [];
    return Array.from(new Set([...fromTop, ...fromRows]));
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function formatCnpj(value) {
    const digits = onlyDigits(value).slice(0, 14);
    if (!digits) return '';
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function getDefaultApuracaoPeriod() {
    const now = new Date();
    const defaultDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      mes: String(defaultDate.getMonth() + 1).padStart(2, '0'),
      ano: String(defaultDate.getFullYear()),
    };
  }

  function setCompanyMessage(message, color = '') {
    if (!snCompanyMessage) return;
    snCompanyMessage.textContent = message || '';
    snCompanyMessage.style.color = color;
    if (message) {
      snCompanyMessage.dataset.state = color === 'red' ? 'error' : 'info';
    } else {
      delete snCompanyMessage.dataset.state;
    }
  }

  function setCompanySaving(isSaving) {
    if (btnSaveCompany) {
      btnSaveCompany.disabled = isSaving;
      btnSaveCompany.textContent = isSaving
        ? (companyModalMode === 'edit' ? 'Salvando...' : 'Salvando...')
        : (companyModalMode === 'edit' ? 'Salvar alterações' : 'Salvar');
    }
    if (btnCloseCompanyModal) btnCloseCompanyModal.disabled = isSaving;
    if (cnpjInput) cnpjInput.disabled = isSaving;
    if (razaoInput) razaoInput.disabled = isSaving;
  }

  async function readResponsePayload(resp) {
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return resp.json().catch(() => ({}));
    }

    const text = await resp.text().catch(() => '');
    return {
      rawText: text,
      error: text ? text.slice(0, 240) : '',
    };
  }

  function syncSelectAllState() {
    const chkAll = document.getElementById('chkAllCompanies');
    if (!chkAll) return;
    const companyCheckboxes = Array.from(document.querySelectorAll('.sn-company-checkbox'));
    const total = companyCheckboxes.length;
    const checked = companyCheckboxes.filter((checkbox) => checkbox.checked).length;
    chkAll.checked = total > 0 && checked === total;
    chkAll.indeterminate = checked > 0 && checked < total;
  }

  function resetCompanyForm() {
    companyModalMode = 'create';
    lastCnpjLookup = '';
    lastAutoFilledRazao = '';

    if (companyIdInput) companyIdInput.value = '';
    if (cnpjInput) cnpjInput.value = '';
    if (razaoInput) razaoInput.value = '';
    if (companyModalTitle) companyModalTitle.textContent = 'Cadastrar empresa';
    if (btnSaveCompany) btnSaveCompany.textContent = 'Salvar';
    setCompanyMessage('');
  }

  function openCreateCompanyModal() {
    if (!companyModal) return;
    resetCompanyForm();
    companyModal.classList.remove('hidden');
    setCompanySaving(false);
    cnpjInput?.focus();
  }

  function openEditCompanyModal(company) {
    if (!companyModal || !company) return;

    companyModalMode = 'edit';
    lastCnpjLookup = onlyDigits(company.cnpj);
    lastAutoFilledRazao = String(company.razaoSocial || '').trim();

    if (companyIdInput) companyIdInput.value = String(company.id || '');
    if (cnpjInput) cnpjInput.value = formatCnpj(company.cnpj);
    if (razaoInput) razaoInput.value = String(company.razaoSocial || '');
    if (companyModalTitle) companyModalTitle.textContent = 'Editar empresa';
    if (btnSaveCompany) btnSaveCompany.textContent = 'Salvar alterações';
    setCompanyMessage('');
    setCompanySaving(false);

    companyModal.classList.remove('hidden');
    razaoInput?.focus();
  }

  function closeCompanyModal() {
    if (!companyModal) return;
    companyModal.classList.add('hidden');
  }

  async function buscarRazaoSocialPorCnpj(force = false) {
    if (!cnpjInput || !razaoInput) return;

    const cnpj = onlyDigits(cnpjInput.value);
    cnpjInput.value = formatCnpj(cnpj);

    if (cnpj.length !== 14) {
      if (!cnpj) {
        lastCnpjLookup = '';
      }
      return;
    }

    if (!force && cnpj === lastCnpjLookup) {
      return;
    }

    try {
      setCompanyMessage('Consultando CNPJ na BrasilAPI...');

      const resp = await AuthClient.authFetch(`/api/cnpj/${cnpj}`);
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.ok) {
        lastCnpjLookup = cnpj;
        setCompanyMessage(data.error || 'CNPJ não encontrado. Preencha manualmente.', 'red');
        return;
      }

      const razaoApi = String(data?.data?.razao_social || '').trim();
      const razaoAtual = String(razaoInput.value || '').trim();
      const canReplace =
        !razaoAtual ||
        razaoAtual === lastAutoFilledRazao ||
        companyModalMode === 'create';

      if (razaoApi && canReplace) {
        razaoInput.value = razaoApi;
        lastAutoFilledRazao = razaoApi;
        setCompanyMessage('Razão social preenchida automaticamente. Revise se necessário.', '#166534');
      } else if (razaoApi) {
        setCompanyMessage('CNPJ localizado. Mantido o texto já digitado na razão social.', '#166534');
      } else {
        setCompanyMessage('CNPJ localizado, mas sem razão social retornada. Complete manualmente.', '#92400e');
      }

      lastCnpjLookup = cnpj;
    } catch (err) {
      console.error('Erro ao consultar CNPJ na SN:', err);
      lastCnpjLookup = cnpj;
      setCompanyMessage('Erro ao consultar CNPJ. Preencha manualmente.', 'red');
    }
  }

  btnOpenCompanyModal?.addEventListener('click', openCreateCompanyModal);
  btnCloseCompanyModal?.addEventListener('click', closeCompanyModal);
  companyModalOverlay?.addEventListener('click', closeCompanyModal);

  cnpjInput?.addEventListener('input', () => {
    const digits = onlyDigits(cnpjInput.value).slice(0, 14);
    cnpjInput.value = formatCnpj(digits);
    if (digits.length < 14 && lastCnpjLookup === digits) {
      lastCnpjLookup = '';
    }
    if (digits.length === 14) {
      buscarRazaoSocialPorCnpj();
    }
  });

  cnpjInput?.addEventListener('blur', () => {
    buscarRazaoSocialPorCnpj();
  });

  cnpjInput?.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    await buscarRazaoSocialPorCnpj(true);
    razaoInput?.focus();
    razaoInput?.select();
  });

  snCompanySearch?.addEventListener('input', () => {
    renderCompaniesList();
  });

  if (paAno) {
    const now = new Date();
    const anoAtual = now.getFullYear();
    const start = anoAtual - 5;
    const end = anoAtual + 1;
    paAno.innerHTML = '<option value="">Selecione</option>';
    for (let a = end; a >= start; a--) {
      const opt = document.createElement('option');
      opt.value = String(a);
      opt.textContent = String(a);
      paAno.appendChild(opt);
    }
  }

  const defaultApuracao = getDefaultApuracaoPeriod();
  if (paMes && !paMes.value) {
    paMes.value = defaultApuracao.mes;
  }
  if (paAno && !paAno.value) {
    paAno.value = defaultApuracao.ano;
  }

  snCompanyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const companyId = Number(companyIdInput?.value || 0);
    const cnpj = onlyDigits(cnpjInput?.value || '');
    const razaoSocial = String(razaoInput?.value || '').trim();
    const isEdit = companyModalMode === 'edit' && Number.isFinite(companyId) && companyId > 0;

    setCompanyMessage('');

    if (!cnpj || !razaoSocial) {
      setCompanyMessage('Preencha CNPJ e Razão Social.', 'red');
      return;
    }
    if (cnpj.length !== 14) {
      setCompanyMessage('CNPJ deve ter 14 dígitos.', 'red');
      return;
    }

    try {
      setCompanySaving(true);
      const url = isEdit ? `/api/sn/companies/${companyId}` : '/api/sn/companies';
      const method = isEdit ? 'PUT' : 'POST';

      const resp = await AuthClient.authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj, razaoSocial }),
      });

      const data = await readResponsePayload(resp);

      if (!resp.ok) {
        let msg = data.error || (isEdit ? 'Erro ao atualizar empresa.' : 'Erro ao cadastrar empresa.');
        if (resp.status === 404 && isEdit) {
          msg =
            'A rota de edição não respondeu (HTTP 404). Se o backend acabou de ser alterado, reinicie o serviço Node.';
        } else if (resp.status >= 500) {
          msg = `${msg} (HTTP ${resp.status})`;
        }
        setCompanyMessage(
          msg,
          'red'
        );
        return;
      }

      await carregarEmpresas();
      closeCompanyModal();
    } catch (err) {
      console.error(err);
      setCompanyMessage(
        `${isEdit ? 'Erro inesperado ao atualizar empresa.' : 'Erro inesperado ao cadastrar empresa.'} ${err?.message || ''}`.trim(),
        'red'
      );
    } finally {
      setCompanySaving(false);
    }
  });

  function getSelectedCompanyIds() {
    return new Set(selectedCompanyIds);
  }

  function getCompanyFilterTerm() {
    return normalizeText(snCompanySearch?.value || '');
  }

  function getFilteredCompanies() {
    const filterTerm = getCompanyFilterTerm();
    if (!filterTerm) {
      return currentCompanies.slice();
    }

    return currentCompanies.filter((company) => {
      const cnpjDigits = onlyDigits(company.cnpj);
      const cnpjFormatted = formatCnpj(cnpjDigits);
      const razao = String(company.razaoSocial || '');
      const haystack = normalizeText(`${cnpjDigits} ${cnpjFormatted} ${razao}`);
      return haystack.includes(filterTerm);
    });
  }

  function updateCompaniesMeta(filteredCompanies) {
    if (!snCompaniesMeta) return;
    const total = currentCompanies.length;
    const visible = filteredCompanies.length;
    const selectedTotal = selectedCompanyIds.size;

    if (total === 0) {
      snCompaniesMeta.textContent = 'Nenhuma empresa cadastrada.';
      return;
    }

    if (getCompanyFilterTerm()) {
      const selectionText =
        selectedTotal === 1
          ? '1 selecionada no total.'
          : `${selectedTotal} selecionadas no total.`;
      snCompaniesMeta.textContent = `${visible} de ${total} empresas exibidas. ${selectionText}`;
      return;
    }

    const totalText = total === 1 ? '1 empresa cadastrada.' : `${total} empresas cadastradas.`;
    const selectionText =
      selectedTotal === 0
        ? 'Nenhuma selecionada.'
        : selectedTotal === 1
          ? '1 selecionada.'
          : `${selectedTotal} selecionadas.`;

    snCompaniesMeta.textContent = `${totalText} ${selectionText}`;
  }

  function areAllFilteredCompaniesSelected(filteredCompanies) {
    if (!Array.isArray(filteredCompanies) || filteredCompanies.length === 0) {
      return false;
    }

    return filteredCompanies.every((company) => selectedCompanyIds.has(Number(company.id)));
  }

  function getFilteredSelectedCount(filteredCompanies) {
    if (!Array.isArray(filteredCompanies) || filteredCompanies.length === 0) {
      return 0;
    }

    return filteredCompanies.filter((company) => selectedCompanyIds.has(Number(company.id))).length;
  }

  function renderCompaniesList() {
    if (!companiesOptions) return;

    const selectedIds = getSelectedCompanyIds();
    const filteredCompanies = getFilteredCompanies();
    const filteredSelectedCount = getFilteredSelectedCount(filteredCompanies);
    const allFilteredSelected = areAllFilteredCompaniesSelected(filteredCompanies);

    companiesOptions.innerHTML = '';

    const selectAllRow = document.createElement('div');
    selectAllRow.className = 'sn-company-row';

    const selectAllLabel = document.createElement('label');
    selectAllLabel.className = 'sn-company-option';

    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.id = 'chkAllCompanies';
    selectAllCheckbox.checked = allFilteredSelected;
    selectAllCheckbox.indeterminate =
      filteredSelectedCount > 0 && filteredSelectedCount < filteredCompanies.length;

    const selectAllText = document.createElement('span');
    selectAllText.textContent = filteredCompanies.length > 0
      ? 'Selecionar todas as exibidas'
      : 'Nenhuma empresa encontrada';

    selectAllLabel.appendChild(selectAllCheckbox);
    selectAllLabel.appendChild(selectAllText);
    selectAllRow.appendChild(selectAllLabel);
    companiesOptions.appendChild(selectAllRow);

    filteredCompanies.forEach((company) => {
      const row = document.createElement('div');
      row.className = 'sn-company-row';

      const label = document.createElement('label');
      label.className = 'sn-company-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'sn-company-checkbox';
      checkbox.value = String(company.id);
      checkbox.checked = selectedIds.has(Number(company.id));

      const text = document.createElement('span');
      text.textContent = `${formatCnpj(company.cnpj)} — ${company.razaoSocial}`;

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'btn btn-secondary sn-company-edit';
      editButton.textContent = 'Editar';
      editButton.addEventListener('click', () => openEditCompanyModal(company));

      checkbox.addEventListener('change', () => {
        const id = Number(checkbox.value);
        if (checkbox.checked) {
          selectedCompanyIds.add(id);
        } else {
          selectedCompanyIds.delete(id);
        }
        syncSelectAllState();
      });

      label.appendChild(checkbox);
      label.appendChild(text);
      row.appendChild(label);
      row.appendChild(editButton);
      companiesOptions.appendChild(row);
    });

    selectAllCheckbox.disabled = filteredCompanies.length === 0;
    selectAllCheckbox.addEventListener('change', () => {
      const checked = selectAllCheckbox.checked;
      selectAllCheckbox.indeterminate = false;
      document.querySelectorAll('.sn-company-checkbox').forEach((checkbox) => {
        checkbox.checked = checked;
        const id = Number(checkbox.value);
        if (checked) {
          selectedCompanyIds.add(id);
        } else {
          selectedCompanyIds.delete(id);
        }
      });
      syncSelectAllState();
    });

    syncSelectAllState();
    updateCompaniesMeta(filteredCompanies);
  }

  async function carregarEmpresas() {
    if (!companiesOptions) return;

    const previousSearch = snCompanySearch?.value || '';

    if (snCompanySearch) {
      snCompanySearch.value = previousSearch;
    }

    try {
      const resp = await AuthClient.authFetch('/api/sn/companies');
      if (!resp.ok) {
        if (snCompaniesMeta) snCompaniesMeta.textContent = 'Erro ao carregar empresas.';
        return;
      }

      const empresas = await resp.json();
      currentCompanies = Array.isArray(empresas) ? empresas : [];
      selectedCompanyIds = new Set(
        Array.from(selectedCompanyIds).filter((id) =>
          currentCompanies.some((company) => Number(company.id) === id)
        )
      );
      renderCompaniesList();
    } catch (err) {
      console.error('Erro ao carregar empresas SN:', err);
      if (snCompaniesMeta) snCompaniesMeta.textContent = 'Erro ao carregar empresas.';
    }
  }

  function atualizarResumoConsumo(resumo) {
    if (!consumoInfo) return;
    if (!resumo) {
      consumoInfo.textContent = 'Nenhuma operação realizada.';
      return;
    }

    const totalOps = resumo.totalOperacoes ?? resumo.totalRequisicoes ?? 0;
    const totalSucesso = resumo.totalSucesso ?? 0;
    const totalErro = resumo.totalErro ?? 0;
    const precoUnitario = (resumo.precoUnitario ?? 0.4).toFixed(2);
    const valorTotal = (resumo.valorTotal ?? 0).toFixed(2);

    consumoInfo.textContent =
      'Operações: ' +
      totalOps +
      ' | Sucessos: ' +
      totalSucesso +
      ' | Erros: ' +
      totalErro +
      ' | Preço unitário atual: R$ ' +
      precoUnitario +
      ' | Valor total estimado: R$ ' +
      valorTotal;
  }

  async function carregarResumo() {
    try {
      const resp = await AuthClient.authFetch('/api/sn/summary');
      if (!resp.ok) return;
      const resumo = await resp.json();
      atualizarResumoConsumo(resumo);
    } catch (err) {
      console.error('Erro ao carregar resumo SN:', err);
    }
  }

  function getPeriodoEEmpresas() {
    if (!paMes || !paAno || !snStatus) return null;

    const mes = String(paMes.value || '').trim();
    const ano = String(paAno.value || '').trim();

    if (!mes || !ano) {
      snStatus.textContent = 'Selecione mês e ano do período de apuração.';
      return null;
    }

    const pa = Number(ano + mes);
    const ids = Array.from(selectedCompanyIds).filter((id) => Number.isFinite(id));
    const all = currentCompanies.length > 0 && ids.length === currentCompanies.length;

    if (!all && ids.length === 0) {
      snStatus.textContent = 'Selecione pelo menos uma empresa (ou marque "Selecionar todas").';
      return null;
    }

    return { pa, all, companyIds: ids };
  }

  function setSending(isSending) {
    if (btnEnviar) btnEnviar.disabled = isSending;
    if (btnConsultar) btnConsultar.disabled = isSending;
  }

  function renderResultados(resultados) {
    const table = document.getElementById('snResultsTable');
    const tbody = table?.querySelector('tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    (resultados || []).forEach((resultado) => {
      const tr = document.createElement('tr');

      const tdCnpj = document.createElement('td');
      tdCnpj.textContent = resultado.cnpj ? formatCnpj(resultado.cnpj) : '-';

      const tdRazao = document.createElement('td');
      tdRazao.textContent = resultado.razaoSocial || '-';

      const tdOp = document.createElement('td');
      tdOp.textContent = resultado.operacao || resultado.tipo || '-';

      const tdStatus = document.createElement('td');
      tdStatus.textContent = resultado.status || (resultado.sucesso ? 'Sucesso' : 'Erro');

      const tdMsg = document.createElement('td');
      if (Array.isArray(resultado.mensagens) && resultado.mensagens.length) {
        tdMsg.textContent = resultado.mensagens.map((m) => m.texto || m).join(' | ');
      } else if (resultado.mensagem) {
        tdMsg.textContent = resultado.mensagem;
      } else if (resultado.error) {
        tdMsg.textContent = resultado.error;
      } else {
        tdMsg.textContent = '-';
      }

      const tdRecibo = document.createElement('td');
      if (resultado.receiptId && resultado.sucesso) {
        const link = document.createElement('a');
        link.href = '/api/sn/receipt/' + resultado.receiptId;
        link.target = '_blank';
        link.textContent = 'Abrir recibo';
        tdRecibo.appendChild(link);
      } else {
        tdRecibo.textContent = '-';
      }

      tr.appendChild(tdCnpj);
      tr.appendChild(tdRazao);
      tr.appendChild(tdOp);
      tr.appendChild(tdStatus);
      tr.appendChild(tdMsg);
      tr.appendChild(tdRecibo);
      tbody.appendChild(tr);
    });
  }

  btnEnviar?.addEventListener('click', async () => {
    if (!snStatus) return;

    snStatus.textContent = '';
    lastSnResults = null;
    if (btnDownloadTodos) btnDownloadTodos.disabled = true;

    const params = getPeriodoEEmpresas();
    if (!params) return;

    setSending(true);
    snStatus.textContent = 'Enviando declarações...';

    try {
      const resp = await AuthClient.authFetch('/api/sn/declaration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          indicadorTransmissao: true,
          indicadorComparacao: false,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        let msgErro = data.error || 'Erro ao enviar declarações.';
        if (data.status) msgErro += ' (HTTP ' + data.status + ')';
        snStatus.textContent = msgErro;
        return;
      }

      const receiptIds = extractReceiptIds(data);
      lastSnResults = { ...data, receiptIds };

      if (btnDownloadTodos) btnDownloadTodos.disabled = receiptIds.length === 0;

      renderResultados(data.resultados);
      snStatus.textContent = 'Declarações enviadas.';

      if (data.resumoConsumo) atualizarResumoConsumo(data.resumoConsumo);
    } catch (err) {
      console.error(err);
      snStatus.textContent = err?.message || 'Erro inesperado.';
    } finally {
      setSending(false);
    }
  });

  btnConsultar?.addEventListener('click', async () => {
    if (!snStatus) return;

    snStatus.textContent = '';
    lastSnResults = null;
    if (btnDownloadTodos) btnDownloadTodos.disabled = true;

    const params = getPeriodoEEmpresas();
    if (!params) return;

    setSending(true);
    snStatus.textContent = 'Consultando recibos...';

    try {
      const resp = await AuthClient.authFetch('/api/sn/consult-last', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        let msgErro = data.error || 'Erro ao consultar recibos.';
        if (data.status) msgErro += ' (HTTP ' + data.status + ')';
        snStatus.textContent = msgErro;
        return;
      }

      const receiptIds = extractReceiptIds(data);
      lastSnResults = { ...data, receiptIds };

      if (btnDownloadTodos) btnDownloadTodos.disabled = receiptIds.length === 0;

      renderResultados(data.resultados);
      snStatus.textContent = 'Consultas de recibo concluídas.';

      if (data.resumoConsumo) atualizarResumoConsumo(data.resumoConsumo);
    } catch (err) {
      console.error(err);
      snStatus.textContent = err?.message || 'Erro inesperado.';
    } finally {
      setSending(false);
    }
  });

  btnDownloadTodos?.addEventListener('click', async () => {
    const receiptIds = lastSnResults?.receiptIds || [];

    if (!receiptIds.length) {
      alert('Nenhum recibo disponível para download.');
      return;
    }

    try {
      btnDownloadTodos.disabled = true;
      btnDownloadTodos.textContent = 'Gerando ZIP...';

      const resp = await AuthClient.authFetch('/api/sn/receipts/batch-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error('Erro ao baixar ZIP:', err);
        alert(err.error || 'Erro ao gerar o arquivo ZIP de recibos.');
        return;
      }

      const blob = await resp.blob();
      const cd = resp.headers.get('content-disposition') || '';
      const match = cd.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || 'recibos-sn.zip';

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      console.error(err);
      alert('Erro ao baixar os recibos.');
    } finally {
      btnDownloadTodos.disabled = false;
      btnDownloadTodos.textContent = 'Baixar todos os recibos';
    }
  });

  await carregarEmpresas();
  await carregarResumo();
});
