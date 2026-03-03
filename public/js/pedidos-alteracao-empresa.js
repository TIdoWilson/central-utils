document.addEventListener('DOMContentLoaded', async () => {
  if (typeof inicializarSidebar === 'function') {
    try { await inicializarSidebar('pedidos-alteracao-empresa'); } catch (_) {}
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

  const isAdmin = String(ctx.user.role || '').toUpperCase() === 'ADMIN';

  const whoami = document.getElementById('whoami');
  const form = document.getElementById('requestForm');
  const companyNameEl = document.getElementById('companyName');
  const requesterNameEl = document.getElementById('requesterName');
  const changeDescriptionEl = document.getElementById('changeDescription');
  const requestMessage = document.getElementById('requestMessage');
  const statusFilter = document.getElementById('statusFilter');
  const btnReloadList = document.getElementById('btnReloadList');
  const tableBody = document.querySelector('#requestsTable tbody');
  const requesterFullName = String(ctx.user.name || '').trim();

  if (whoami) {
    whoami.textContent = `Logado como: ${ctx.user.name} <${ctx.user.email}> (${ctx.user.role})`;
  }

  if (requesterNameEl) {
    requesterNameEl.value = requesterFullName || '(nome não identificado)';
  }

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setRequestMessage('', false);

    const companyName = String(companyNameEl?.value || '').trim();
    const fullName = requesterFullName;
    const changeDescription = String(changeDescriptionEl?.value || '').trim();

    if (!companyName || !fullName || !changeDescription) {
      setRequestMessage('Preencha empresa e alteração necessária. O nome é registrado automaticamente.', true);
      return;
    }

    try {
      const resp = await AuthClient.authFetch('/api/pedidos-alteracao-empresa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, fullName, changeDescription }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao registrar pedido.');

      setRequestMessage('Pedido registrado com sucesso.', false);
      companyNameEl.value = '';
      changeDescriptionEl.value = '';
      await loadRequests();
    } catch (e) {
      setRequestMessage(e.message || 'Erro ao registrar pedido.', true);
    }
  });

  statusFilter?.addEventListener('change', () => {
    loadRequests();
  });

  btnReloadList?.addEventListener('click', () => {
    loadRequests();
  });

  tableBody?.addEventListener('click', async (ev) => {
    const btn = ev.target?.closest?.('button[data-action="concluir"]');
    if (!btn) return;

    const id = Number(btn.getAttribute('data-id'));
    if (!Number.isFinite(id) || id <= 0) return;

    if (!isAdmin) {
      alert('Somente admin pode concluir pedidos.');
      return;
    }

    if (!confirm('Confirmar conclusão do pedido?')) return;

    btn.disabled = true;

    try {
      const resp = await AuthClient.authFetch(`/api/pedidos-alteracao-empresa/${id}/concluir`, {
        method: 'PATCH',
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao concluir pedido.');

      await loadRequests();

      if (data?.email?.sent) {
        alert('Pedido concluído e e-mail enviado para o solicitante.');
      } else {
        const msg = data?.email?.error || 'Pedido concluído, mas o e-mail não foi enviado.';
        alert(msg);
      }
    } catch (e) {
      alert(e.message || 'Erro ao concluir pedido.');
      btn.disabled = false;
    }
  });

  await loadRequests();

  async function loadRequests() {
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';

    try {
      const status = String(statusFilter?.value || '').trim();
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);

      const endpoint = qs.toString()
        ? `/api/pedidos-alteracao-empresa?${qs.toString()}`
        : '/api/pedidos-alteracao-empresa';

      const resp = await AuthClient.authFetch(endpoint, { method: 'GET' });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao carregar pedidos.');

      const requests = Array.isArray(data.requests) ? data.requests : [];
      if (!requests.length) {
        tableBody.innerHTML = '<tr><td colspan="7">Nenhum pedido encontrado.</td></tr>';
        return;
      }

      tableBody.innerHTML = requests.map((r) => {
        const isDone = r.status === 'CONCLUIDO';
        const isDenied = r.status === 'NEGADO';
        const statusClass = isDone
          ? 'status-pill status-pill-done'
          : isDenied
            ? 'status-pill status-pill-denied'
            : 'status-pill status-pill-pending';
        const statusLabel = isDone ? 'Concluído' : isDenied ? 'Negado' : 'Pendente';
        const actions = (isAdmin && r.status === 'PENDENTE')
          ? `<button type="button" class="btn btn-primary btn-sm" data-action="concluir" data-id="${r.id}">Concluir</button>`
          : '<span class="request-action-muted">-</span>';

        return `
          <tr>
            <td>${esc(r.companyName)}</td>
            <td>${esc(r.fullName)}</td>
            <td>${esc(r.requesterLogin)}</td>
            <td><div class="request-description">${esc(r.changeDescription)}</div></td>
            <td>${formatDate(r.createdAt)}</td>
            <td><span class="${statusClass}">${statusLabel}</span></td>
            <td>${actions}</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      tableBody.innerHTML = `<tr><td colspan="7">${esc(e.message || 'Erro ao carregar pedidos.')}</td></tr>`;
    }
  }

  function setRequestMessage(message, isError) {
    if (!requestMessage) return;
    requestMessage.textContent = String(message || '');
    requestMessage.style.color = isError ? '#b91c1c' : '#166534';
  }
});

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
