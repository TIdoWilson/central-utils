document.addEventListener('DOMContentLoaded', async () => {
  inicializarSidebar('admin-pedidos-empresas');

  if (!window.AuthClient) {
    window.location.href = '/login';
    return;
  }

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx?.user) {
    window.location.href = '/login';
    return;
  }

  if (String(ctx.user.role || '').toUpperCase() !== 'ADMIN') {
    window.location.href = '/acesso-negado';
    return;
  }

  const whoami = document.getElementById('whoami');
  const sourceFilter = document.getElementById('sourceFilter');
  const statusFilter = document.getElementById('statusFilter');
  const btnReload = document.getElementById('btnReload');
  const tbody = document.getElementById('requestsTableBody');

  if (whoami) {
    whoami.textContent = `Logado como: ${ctx.user.name} <${ctx.user.email}> (${ctx.user.role})`;
  }

  sourceFilter?.addEventListener('change', loadRows);
  statusFilter?.addEventListener('change', loadRows);
  btnReload?.addEventListener('click', loadRows);

  tbody?.addEventListener('click', async (ev) => {
    const btn = ev.target?.closest?.('button[data-action]');
    if (!btn) return;

    const action = String(btn.getAttribute('data-action') || '').trim();
    const source = String(btn.getAttribute('data-source') || '').trim();
    const id = Number(btn.getAttribute('data-id'));
    if (!source || !Number.isFinite(id) || id <= 0) return;

    const decision = action === 'confirm' ? 'confirmar' : action === 'deny' ? 'negar' : null;
    if (!decision) return;

    const ask = decision === 'confirmar'
      ? 'Confirmar mudança deste pedido?'
      : 'Negar mudança deste pedido?';

    if (!confirm(ask)) return;

    btn.disabled = true;

    try {
      const resp = await AuthClient.authFetch(`/api/admin/company-requests/${encodeURIComponent(source)}/${id}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao decidir pedido.');

      await loadRows();

      if (data?.email?.sent) {
        alert('Decisão registrada e e-mail enviado ao solicitante.');
      } else {
        alert(data?.email?.error || 'Decisão registrada, mas o e-mail não foi enviado.');
      }
    } catch (e) {
      alert(e.message || 'Erro ao decidir pedido.');
      btn.disabled = false;
    }
  });

  await loadRows();

  async function loadRows() {
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8">Carregando...</td></tr>';

    try {
      const source = String(sourceFilter?.value || '').trim();
      const status = String(statusFilter?.value || '').trim().toUpperCase();
      const qs = new URLSearchParams();
      if (source) qs.set('source', source);

      const endpoint = qs.toString() ? `/api/admin/company-requests?${qs.toString()}` : '/api/admin/company-requests';
      const resp = await AuthClient.authFetch(endpoint, { method: 'GET' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao carregar pedidos.');

      let rows = Array.isArray(data.requests) ? data.requests : [];
      if (status) rows = rows.filter((r) => String(r.status || '').toUpperCase() === status);

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8">Nenhum registro encontrado.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map((r) => {
        const sourceLabel = r.source === 'inclusao_exclusao' ? 'Inclusão/Exclusão' : 'Alteração';
        const st = String(r.status || '').toUpperCase();
        const statusLabel = st === 'CONCLUIDO' ? 'Concluído' : st === 'NEGADO' ? 'Negado' : 'Pendente';
        const statusClass = st === 'CONCLUIDO'
          ? 'request-status-pill request-status-pill-done'
          : st === 'NEGADO'
            ? 'request-status-pill request-status-pill-denied'
            : 'request-status-pill request-status-pill-pending';

        const actions = st === 'PENDENTE'
          ? `
            <button class="btn btn-primary btn-sm" data-action="confirm" data-source="${escAttr(r.source)}" data-id="${Number(r.id)}">Confirmar mudança</button>
            <button class="btn btn-ghost-danger btn-sm" data-action="deny" data-source="${escAttr(r.source)}" data-id="${Number(r.id)}">Negar mudança</button>
          `
          : '<span class="request-action-muted">-</span>';

        return `
          <tr>
            <td>${esc(sourceLabel)}</td>
            <td>${esc(r.company_name)}</td>
            <td>${esc(r.requester_full_name)}</td>
            <td>${esc(r.requester_login)}</td>
            <td>${esc(r.details || '-')}</td>
            <td>${formatDate(r.created_at)}</td>
            <td><span class="${statusClass}">${statusLabel}</span></td>
            <td>${actions}</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8">${esc(e.message || 'Erro ao carregar pedidos.')}</td></tr>`;
    }
  }
});

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
}

function esc(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(v) {
  return esc(v).replace(/`/g, '&#96;');
}
