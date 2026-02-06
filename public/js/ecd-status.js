// public/js/ecd-status.js

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof inicializarSidebar === 'function') {
    try { await inicializarSidebar('ecd-status'); } catch {}
  }

  if (!window.AuthClient) {
    window.location.href = '/login';
    return;
  }

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx) {
    window.location.href = '/login';
    return;
  }

  const isAdmin = (ctx?.user?.role || '').toUpperCase() === 'ADMIN';

  const tableBody = document.querySelector('#ecdTable tbody');
  const searchCodeInput = document.getElementById('ecdSearchCode');
  const searchNameInput = document.getElementById('ecdSearchName');
  const searchCnpjInput = document.getElementById('ecdSearchCnpj');
  const statusFilter = document.getElementById('ecdStatusFilter');

  const detailsEmpty = document.getElementById('ecdDetailsEmpty');
  const detailsWrap = document.getElementById('ecdDetails');
  const codeEl = document.getElementById('ecdCode');
  const nameEl = document.getElementById('ecdName');
  const cnpjEl = document.getElementById('ecdCnpj');
  const tipoSel = document.getElementById('ecdTipo');
  const dfcSel = document.getElementById('ecdDfc');
  const saveBtn = document.getElementById('ecdSaveBtn');
  const statusMsg = document.getElementById('ecdStatusMsg');
  const filesMsg = document.getElementById('ecdFilesMsg');
  const forceWrap = document.getElementById('ecdAdminForceWrap');
  const forceChk = document.getElementById('ecdForce');
  if (forceWrap) forceWrap.style.display = 'none';

  let companies = [];
  let filtered = [];
  let selected = null;

  function setStatus(msg, isError) {
    if (!statusMsg) return;
    statusMsg.textContent = msg || '';
    statusMsg.style.color = isError ? 'red' : 'green';
  }

  function setFilesMsg(msg, isInfo) {
    if (!filesMsg) return;
    filesMsg.textContent = msg || '';
    filesMsg.style.color = isInfo ? '#0ea5e9' : '';
  }

  function normalize(s) {
    return String(s || '').toLowerCase();
  }

  function applyFilter() {
    const qCode = normalize(searchCodeInput?.value || '');
    const qName = normalize(searchNameInput?.value || '');
    const qCnpj = normalize(searchCnpjInput?.value || '');
    const qStatus = String(statusFilter?.value || '').trim();

    filtered = companies.filter((c) => {
      const code = normalize(c.code);
      const name = normalize(c.name);
      const cnpj = normalize(c.cnpj);

      if (qCode && code !== qCode) return false;
      if (qName && !name.includes(qName)) return false;
      if (qCnpj && !cnpj.includes(qCnpj)) return false;
      if (qStatus) {
        const st = c.status || null;
        const erro = String(st?.erro || '').toUpperCase() === 'Y';
        const arquivosFlag = String(st?.arquivosNaPasta || '').toUpperCase();
        const arquivosNaPasta = arquivosFlag === 'Y' || arquivosFlag === 'S';
        const completa = Boolean(st?.completed);

        let statusLabel = 'Pendente';
        if (erro) statusLabel = 'ERRO';
        else if (completa && arquivosNaPasta) statusLabel = 'Completo';
        else if (completa && !arquivosNaPasta) statusLabel = 'Na Fila';

        if (statusLabel !== qStatus) return false;
      }
      return true;
    });

    renderTable();
  }

  function renderTable() {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    filtered.forEach((c) => {
      const tr = document.createElement('tr');
      const st = c.status || null;
      const erro = String(st?.erro || '').toUpperCase() === 'Y';
      const arquivosFlag = String(st?.arquivosNaPasta || '').toUpperCase();
      const arquivosNaPasta = arquivosFlag === 'Y' || arquivosFlag === 'S';
      const completa = Boolean(st?.completed);

      let statusLabel = 'Pendente';
      if (erro) {
        statusLabel = 'ERRO';
      } else if (completa && arquivosNaPasta) {
        statusLabel = 'Completo';
      } else if (completa && !arquivosNaPasta) {
        statusLabel = 'Na Fila';
      }

      tr.innerHTML = `
        <td>${c.code}</td>
        <td>${c.name}</td>
        <td>${c.cnpj}</td>
        <td>${c.defaultTipo}</td>
        <td>${statusLabel}</td>
        <td><button class="btn btn-secondary" data-code="${c.code}">Selecionar</button></td>
      `;

      const nameCell = tr.children[1];
      const statusCell = tr.children[4];
      if (erro) {
        if (nameCell) nameCell.style.color = 'red';
        if (statusCell) statusCell.style.color = 'red';
      } else if (statusLabel === 'Na Fila') {
        if (statusCell) statusCell.style.color = '#eab308';
      } else if (statusLabel === 'Completo') {
        if (statusCell) statusCell.style.color = '#22c55e';
      }

      const btn = tr.querySelector('button');
      btn.addEventListener('click', () => selectCompany(c.code));

      tableBody.appendChild(tr);
    });
  }

  function updateDetails() {
    if (!selected) {
      detailsEmpty.style.display = 'block';
      detailsWrap.style.display = 'none';
      return;
    }

    detailsEmpty.style.display = 'none';
    detailsWrap.style.display = 'block';

    codeEl.textContent = selected.code;
    nameEl.textContent = selected.name;
    cnpjEl.textContent = selected.cnpj;

    const st = selected.status || null;
    const locked = Boolean(st?.completed);
    const arquivosFlag = String(st?.arquivosNaPasta || 'N').toUpperCase();
    const arquivosNaPasta = arquivosFlag === 'Y' || arquivosFlag === 'S';
    const erro = String(st?.erro || '').toUpperCase() === 'Y';

    tipoSel.value = st?.simples || selected.defaultTipo || '';
    dfcSel.value = (typeof st?.dfc === 'boolean') ? String(st.dfc) : '';

    tipoSel.disabled = locked && !isAdmin;
    dfcSel.disabled = locked && !isAdmin;

    if (saveBtn) saveBtn.disabled = locked && !isAdmin;

    if (erro) {
      setStatus('ERRO registrado. Somente ADMIN pode alterar.', true);
    } else if (locked) {
      setStatus('Registro gerado e bloqueado. Somente ADMIN pode alterar.', true);
    } else {
      setStatus('', false);
    }

    if (arquivosNaPasta) {
      setFilesMsg('Arquivos na Pasta', true);
    } else {
      setFilesMsg('', false);
    }
  }

  function selectCompany(code) {
    selected = companies.find((c) => c.code === code) || null;
    if (forceChk) forceChk.checked = false;
    updateDetails();
  }

  async function loadCompanies() {
    const resp = await AuthClient.authFetch('/api/ecd/companies');
    if (!resp.ok) throw new Error('Erro ao carregar empresas');
    const data = await resp.json();
    companies = (data.companies || []).sort((a, b) => {
      const na = Number(a.code);
      const nb = Number(b.code);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.code).localeCompare(String(b.code));
    });
    filtered = companies;
    renderTable();
  }

  async function saveStatus() {
    if (!selected) return;

    const simples = tipoSel.value;
    const dfcRaw = dfcSel.value;

    if (!simples || (dfcRaw !== 'true' && dfcRaw !== 'false')) {
      setStatus('Preencha Tipo e DFC antes de salvar.', true);
      return;
    }

    const payload = {
      code: selected.code,
      simples,
      dfc: dfcRaw === 'true',
    };

    const resp = await AuthClient.authFetch('/api/ecd/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      setStatus(data.error || 'Erro ao salvar.', true);
      return;
    }

    setStatus('Salvo e gerado com sucesso.', false);
    await loadCompanies();
    selectCompany(selected.code);
  }

  if (searchCodeInput) searchCodeInput.addEventListener('input', applyFilter);
  if (searchNameInput) searchNameInput.addEventListener('input', applyFilter);
  if (searchCnpjInput) searchCnpjInput.addEventListener('input', applyFilter);
  if (statusFilter) statusFilter.addEventListener('change', applyFilter);

  if (saveBtn) {
    saveBtn.addEventListener('click', saveStatus);
  }

  try {
    await loadCompanies();
  } catch (e) {
    setStatus('Falha ao carregar empresas.', true);
  }
});
