const LOCAL_DRAFT_KEY = 'checklist-ti-criacao-usuario:draft:v1';

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof inicializarSidebar === 'function') {
    try { await inicializarSidebar('checklist-ti-criacao-usuario'); } catch (_) {}
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
  const currentUserName = String(ctx.user.name || '').trim() || 'Usuario';

  const form = document.getElementById('checklistForm');
  const documentIdEl = document.getElementById('documentId');
  const processNumberEl = document.getElementById('processNumber');
  const requestDateEl = document.getElementById('requestDate');
  const employeeNameEl = document.getElementById('employeeName');
  const cpfEl = document.getElementById('cpf');
  const departmentEl = document.getElementById('department');
  const itResponsibleEl = document.getElementById('itResponsible');
  const systemUserEmailEl = document.getElementById('systemUserEmail');
  const userIobLoginEl = document.getElementById('userIobLogin');
  const machineNameEl = document.getElementById('machineName');
  const sharedFoldersReleasedEl = document.getElementById('sharedFoldersReleased');
  const printersConfiguredEl = document.getElementById('printersConfigured');
  const emailSignatureStandardizedEl = document.getElementById('emailSignatureStandardized');
  const observationsEl = document.getElementById('observations');
  const btnSaveDraft = document.getElementById('btnSaveDraft');
  const btnFinalizeDocument = document.getElementById('btnFinalizeDocument');
  const btnResetForm = document.getElementById('btnResetForm');
  const btnReloadList = document.getElementById('btnReloadList');
  const formMessage = document.getElementById('formMessage');
  const tableBody = document.querySelector('#documentsTable tbody');
  const passwordButtons = Array.from(document.querySelectorAll('button[data-password-target]'));

  const state = {
    currentId: null,
    currentStatus: 'RASCUNHO',
  };

  passwordButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = String(btn.getAttribute('data-password-target') || '');
      const target = document.getElementById(targetId);
      if (target) target.value = generatePassword(14);
      persistLocalDraft();
    });
  });

  form?.addEventListener('input', () => persistLocalDraft());

  btnSaveDraft?.addEventListener('click', async () => {
    await saveDraft({ showMessage: true });
  });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await finalizeDocument();
  });

  btnResetForm?.addEventListener('click', async () => {
    clearForm();
    await loadNextProcessNumber();
  });

  btnReloadList?.addEventListener('click', () => loadDocuments());

  tableBody?.addEventListener('click', async (ev) => {
    const resumeBtn = ev.target?.closest?.('button[data-action="resume"]');
    if (resumeBtn) {
      const id = Number(resumeBtn.getAttribute('data-id'));
      if (!Number.isFinite(id) || id <= 0) return;
      await loadDocumentById(id);
      return;
    }

    const pdfBtn = ev.target?.closest?.('button[data-action="pdf"]');
    if (pdfBtn) {
      const id = Number(pdfBtn.getAttribute('data-id'));
      if (!Number.isFinite(id) || id <= 0) return;
      downloadPdf(id);
      return;
    }

    const deleteBtn = ev.target?.closest?.('button[data-action="delete-draft"]');
    if (deleteBtn) {
      const id = Number(deleteBtn.getAttribute('data-id'));
      if (!Number.isFinite(id) || id <= 0) return;
      await deleteDraft(id);
    }
  });

  setDefaultDate();
  if (itResponsibleEl) itResponsibleEl.value = currentUserName;
  restoreLocalDraft();
  await loadNextProcessNumber();
  await loadDocuments();

  async function loadNextProcessNumber() {
    if (state.currentId && state.currentStatus === 'RASCUNHO') return;
    try {
      const resp = await AuthClient.authFetch('/api/checklist-ti-criacao-usuario/next-process-number', { method: 'GET' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) return;
      if (processNumberEl) processNumberEl.value = data.nextProcessNumber || '';
    } catch (_) {}
  }

  async function loadDocuments() {
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
    try {
      const resp = await AuthClient.authFetch('/api/checklist-ti-criacao-usuario', { method: 'GET' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao listar documentos.');

      const docs = Array.isArray(data.documents) ? data.documents : [];
      if (!docs.length) {
        tableBody.innerHTML = '<tr><td colspan="6">Nenhum documento salvo.</td></tr>';
        return;
      }

      tableBody.innerHTML = docs.map((d) => {
        const statusLabel = d.isFinal ? 'Finalizado' : 'Rascunho';
        const statusClass = d.isFinal ? 'request-status-pill request-status-pill-done' : 'request-status-pill request-status-pill-pending';
        const action = d.isFinal
          ? `<button type="button" class="btn btn-primary btn-sm" data-action="pdf" data-id="${d.id}">PDF</button>`
          : `
            <button type="button" class="btn btn-secondary btn-sm" data-action="resume" data-id="${d.id}">Continuar</button>
            <button type="button" class="btn btn-ghost-danger btn-sm" data-action="delete-draft" data-id="${d.id}">Excluir</button>
          `;
        return `
          <tr>
            <td>${d.id}</td>
            <td>${esc(d.processNumber || '-')}</td>
            <td>${esc(d.employeeName || '-')}</td>
            <td><span class="${statusClass}">${statusLabel}</span></td>
            <td>${formatDateTime(d.updatedAt)}</td>
            <td>${action}</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      tableBody.innerHTML = `<tr><td colspan="6">${esc(e?.message || 'Erro ao listar documentos.')}</td></tr>`;
    }
  }

  async function loadDocumentById(id) {
    try {
      const resp = await AuthClient.authFetch(`/api/checklist-ti-criacao-usuario/${id}`, { method: 'GET' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao carregar documento.');
      applyDocumentToForm(data.document || {});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setFormMessage(e?.message || 'Erro ao carregar documento.', true);
    }
  }

  function applyDocumentToForm(d) {
    state.currentId = Number(d.id || 0) || null;
    state.currentStatus = d.isFinal ? 'FINAL' : 'RASCUNHO';

    if (documentIdEl) documentIdEl.value = state.currentId ? String(state.currentId) : '';
    if (processNumberEl) processNumberEl.value = d.processNumber || '';
    if (requestDateEl) requestDateEl.value = d.requestDate ? String(d.requestDate).slice(0, 10) : '';
    if (employeeNameEl) employeeNameEl.value = d.employeeName || '';
    if (cpfEl) cpfEl.value = d.cpf || '';
    if (departmentEl) departmentEl.value = d.department || '';
    if (itResponsibleEl) itResponsibleEl.value = currentUserName;
    if (systemUserEmailEl) systemUserEmailEl.value = d.systemUserEmail || '';
    if (userIobLoginEl) userIobLoginEl.value = d.userIobLogin || '';
    if (machineNameEl) machineNameEl.value = d.machineName || '';
    if (sharedFoldersReleasedEl) sharedFoldersReleasedEl.checked = !!d.sharedFoldersReleased;
    if (printersConfiguredEl) printersConfiguredEl.checked = !!d.printersConfigured;
    if (emailSignatureStandardizedEl) emailSignatureStandardizedEl.checked = !!d.emailSignatureStandardized;
    if (observationsEl) observationsEl.value = d.observations || '';

    const sp = d.systemPasswords || {};
    setInput('passwordEmailCorporativo', sp.emailCorporativo || '');
    setInput('passwordMicrosoftTeams', sp.microsoftTeams || '');
    setInput('passwordSistemaMonitor', sp.sistemaMonitor || '');
    setInput('passwordSistemaTareffaIntegrador', sp.sistemaTareffaIntegrador || '');
    setInput('passwordSistemaPink', sp.sistemaPink || '');
    setInput('passwordUsuarioIob', sp.usuarioIob || '');

    const locked = state.currentStatus === 'FINAL';
    toggleFormLocked(locked);
    setFormMessage(
      locked
        ? `Documento #${state.currentId} finalizado. Edicao bloqueada.`
        : `Rascunho #${state.currentId} carregado.`,
      false
    );
  }

  function toggleFormLocked(locked) {
    const controls = form?.querySelectorAll('input, textarea, button') || [];
    controls.forEach((el) => {
      const id = el.id || '';
      if (id === 'btnReloadList') return;
      if (id === 'btnResetForm') return;
      if (id === 'documentId') return;
      if (id === 'processNumber') return;
      if (id === 'btnSaveDraft' || id === 'btnFinalizeDocument') {
        el.disabled = !!locked;
        return;
      }
      if (el.hasAttribute('data-password-target')) {
        el.disabled = !!locked;
        return;
      }
      if (el.closest('#documentsTable')) return;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement) {
        if (el.id === 'btnResetForm') return;
        el.disabled = !!locked;
      }
    });
  }

  async function saveDraft({ showMessage = false, silent = false } = {}) {
    const payload = readPayload();
    try {
      const endpoint = state.currentId
        ? `/api/checklist-ti-criacao-usuario/${state.currentId}/draft`
        : '/api/checklist-ti-criacao-usuario/draft';
      const method = state.currentId ? 'PUT' : 'POST';
      const resp = await AuthClient.authFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao salvar rascunho.');

      state.currentId = Number(data?.document?.id || state.currentId || 0) || null;
      state.currentStatus = 'RASCUNHO';
      if (documentIdEl && state.currentId) documentIdEl.value = String(state.currentId);
      persistLocalDraft();
      if (showMessage) setFormMessage('Rascunho salvo com sucesso.', false);
      if (!silent) await loadDocuments();
      return data.document;
    } catch (e) {
      if (!silent) setFormMessage(e?.message || 'Erro ao salvar rascunho.', true);
      return null;
    }
  }

  async function finalizeDocument() {
    setFormMessage('', false);
    const payload = readPayload();
    if (!payload.employeeName || !payload.systemUserEmail || !payload.userIobLogin) {
      setFormMessage('Preencha nome do funcionario, e-mail de usuario e usuario IOB.', true);
      return;
    }

    try {
      if (!state.currentId) {
        const saved = await saveDraft({ silent: true });
        if (!saved?.id) throw new Error('Nao foi possivel criar rascunho antes da finalizacao.');
      }

      const resp = await AuthClient.authFetch(`/api/checklist-ti-criacao-usuario/${state.currentId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao finalizar documento.');

      applyDocumentToForm(data.document || {});
      localStorage.removeItem(LOCAL_DRAFT_KEY);
      await loadDocuments();
      downloadPdf(Number(data?.document?.id));
      setFormMessage(`Documento finalizado. Processo ${data?.document?.processNumber || '-'}.`, false);
    } catch (e) {
      setFormMessage(e?.message || 'Erro ao finalizar documento.', true);
    }
  }

  async function deleteDraft(id) {
    const ok = window.confirm(`Excluir o rascunho #${id}? Esta acao nao pode ser desfeita.`);
    if (!ok) return;

    try {
      const resp = await AuthClient.authFetch(`/api/checklist-ti-criacao-usuario/${id}/draft`, {
        method: 'DELETE',
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao excluir rascunho.');

      if (state.currentId === id) {
        clearForm();
        await loadNextProcessNumber();
      }
      await loadDocuments();
      setFormMessage(`Rascunho #${id} excluido com sucesso.`, false);
    } catch (e) {
      setFormMessage(e?.message || 'Erro ao excluir rascunho.', true);
    }
  }

  function persistLocalDraft() {
    const payload = readPayload();
    const data = { payload, savedAt: new Date().toISOString() };
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(data));
  }

  function restoreLocalDraft() {
    if (state.currentId) return;
    try {
      const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const p = parsed?.payload || {};
      if (requestDateEl && p.requestDate) requestDateEl.value = p.requestDate;
      if (employeeNameEl) employeeNameEl.value = p.employeeName || '';
      if (cpfEl) cpfEl.value = p.cpf || '';
      if (departmentEl) departmentEl.value = p.department || '';
      if (itResponsibleEl) itResponsibleEl.value = currentUserName;
      if (systemUserEmailEl) systemUserEmailEl.value = p.systemUserEmail || '';
      if (userIobLoginEl) userIobLoginEl.value = p.userIobLogin || '';
      if (machineNameEl) machineNameEl.value = p.machineName || '';
      if (sharedFoldersReleasedEl) sharedFoldersReleasedEl.checked = !!p.sharedFoldersReleased;
      if (printersConfiguredEl) printersConfiguredEl.checked = !!p.printersConfigured;
      if (emailSignatureStandardizedEl) emailSignatureStandardizedEl.checked = !!p.emailSignatureStandardized;
      if (observationsEl) observationsEl.value = p.observations || '';

      const sp = p.systemPasswords || {};
      setInput('passwordEmailCorporativo', sp.emailCorporativo || '');
      setInput('passwordMicrosoftTeams', sp.microsoftTeams || '');
      setInput('passwordSistemaMonitor', sp.sistemaMonitor || '');
      setInput('passwordSistemaTareffaIntegrador', sp.sistemaTareffaIntegrador || '');
      setInput('passwordSistemaPink', sp.sistemaPink || '');
      setInput('passwordUsuarioIob', sp.usuarioIob || '');

      setFormMessage('Rascunho local restaurado.', false);
    } catch (_) {}
  }

  function clearForm() {
    state.currentId = null;
    state.currentStatus = 'RASCUNHO';
    if (documentIdEl) documentIdEl.value = '';
    form?.reset();
    setDefaultDate();
    if (itResponsibleEl) itResponsibleEl.value = currentUserName;
    toggleFormLocked(false);
    localStorage.removeItem(LOCAL_DRAFT_KEY);
    setFormMessage('', false);
  }

  function setDefaultDate() {
    if (!requestDateEl) return;
    if (requestDateEl.value) return;
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    requestDateEl.value = `${d.getFullYear()}-${m}-${day}`;
  }

  function setFormMessage(message, isError) {
    if (!formMessage) return;
    formMessage.textContent = String(message || '');
    formMessage.style.color = isError ? '#b91c1c' : '#166534';
  }

  function readPayload() {
    return {
      requestDate: requestDateEl?.value || '',
      employeeName: employeeNameEl?.value || '',
      cpf: cpfEl?.value || '',
      department: departmentEl?.value || '',
      itResponsible: currentUserName,
      systemUserEmail: systemUserEmailEl?.value || '',
      userIobLogin: userIobLoginEl?.value || '',
      machineName: machineNameEl?.value || '',
      sharedFoldersReleased: !!sharedFoldersReleasedEl?.checked,
      printersConfigured: !!printersConfiguredEl?.checked,
      emailSignatureStandardized: !!emailSignatureStandardizedEl?.checked,
      observations: observationsEl?.value || '',
      systemPasswords: {
        emailCorporativo: getInput('passwordEmailCorporativo'),
        microsoftTeams: getInput('passwordMicrosoftTeams'),
        sistemaMonitor: getInput('passwordSistemaMonitor'),
        sistemaTareffaIntegrador: getInput('passwordSistemaTareffaIntegrador'),
        sistemaPink: getInput('passwordSistemaPink'),
        usuarioIob: getInput('passwordUsuarioIob'),
      },
    };
  }
});

function setInput(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = String(value || '');
}

function getInput(id) {
  const el = document.getElementById(id);
  return String(el?.value || '');
}

function generatePassword(length = 14) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*';
  let output = '';
  const values = new Uint32Array(length);
  if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
    window.crypto.getRandomValues(values);
    for (let i = 0; i < values.length; i += 1) output += chars[values[i] % chars.length];
  } else {
    for (let i = 0; i < length; i += 1) output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
}

function downloadPdf(id) {
  const url = `/api/checklist-ti-criacao-usuario/${id}/pdf`;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
