// public/js/logs.js
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (typeof inicializarSidebar === 'function') {
      await inicializarSidebar('audit-logs');
    }
  } catch (_) {}

  const whoami = document.getElementById('whoami');
  const btnLogout = document.getElementById('btnLogout');
  const form = document.getElementById('filterForm');
  const msg = document.getElementById('logsMessage');
  const btnClear = document.getElementById('btnClearFilters');

  if (!window.AuthClient) {
    window.location.href = '/login';
    return;
  }

  btnLogout?.addEventListener('click', () => AuthClient.logoutAndRedirect());

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx?.user) {
    window.location.href = '/login';
    return;
  }
  whoami.textContent = `Logado como: ${ctx.user.name} <${ctx.user.email}> (${ctx.user.role})`;

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    await carregarLogs();
  });

  btnClear?.addEventListener('click', async () => {
    document.getElementById('action').value = '';
    document.getElementById('username').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    msg.textContent = '';
    await carregarLogs();
  });

  await carregarLogs();
});

async function carregarLogs() {
  const tbody = document.getElementById('logsTableBody');
  const msg = document.getElementById('logsMessage');
  tbody.innerHTML = '';

  const action = document.getElementById('action').value.trim();
  const usernameOrEmail = document.getElementById('username').value.trim();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  const qs = new URLSearchParams();
  if (action) qs.set('action', action);
  if (usernameOrEmail) qs.set('username', usernameOrEmail);
  if (startDate) qs.set('startDate', startDate);
  if (endDate) qs.set('endDate', endDate);

  try {
    const resp = await AuthClient.authFetch(`/api/admin/audit-logs?${qs.toString()}`, { method: 'GET' });

    if (resp.status === 403) {
      msg.textContent = 'Sem permissão (apenas ADMIN).';
      tbody.innerHTML = `<tr><td colspan="6">Sem permissão.</td></tr>`;
      return;
    }

    const data = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error((data && data.error) ? data.error : 'Erro ao buscar logs');

    const logs = Array.isArray(data) ? data : (data?.logs || []);
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="6">Nenhum registro encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(renderRow).join('');
  } catch (err) {
    console.error(err);
    msg.textContent = err.message || 'Erro inesperado';
    tbody.innerHTML = `<tr><td colspan="6">Erro ao carregar logs.</td></tr>`;
  }
}

function renderRow(l) {
  const when = l.created_at ? new Date(l.created_at) : null;
  const whenTxt = when ? when.toLocaleString() : '-';

  const userLabel =
    (l.name && l.email) ? `${l.name} <${l.email}>` :
    (l.email || l.name || '-');

  const ip = (l.ip || '-').replace(/^::ffff:/, '');
  const status = (l.status || '-').toLowerCase();

  const metaObj = safeParseMeta(l.meta);
  const actionPretty = prettyAction(l.action || '-');
  const actionRaw = l.action || '-';

  // Chips quando meta tiver path/method
  const chips = buildMetaChips(metaObj);

  // JSON formatado (expansível)
  const detailsHtml = buildDetails(metaObj);

  return `
    <tr>
      <td>
        <div>${escapeHtml(whenTxt)}</div>
        ${when ? `<div class="log-muted">${escapeHtml(relativeTime(when))}</div>` : ''}
      </td>

      <td>${escapeHtml(userLabel)}</td>

      <td>
        <div class="log-action" title="${escapeHtml(actionRaw)}">${escapeHtml(actionPretty)}</div>
        ${chips ? `<div class="log-chips">${chips}</div>` : ''}
      </td>

      <td>
        <span class="log-badge ${status === 'ok' ? 'ok' : (status === 'error' ? 'error' : 'muted')}">
          ${escapeHtml(l.status || '-')}
        </span>
      </td>

      <td class="log-mono">${escapeHtml(ip)}</td>

      <td>${detailsHtml}</td>
    </tr>
  `;
}

function buildMetaChips(metaObj) {
  if (!metaObj || typeof metaObj !== 'object') return '';
  const method = metaObj.method ? String(metaObj.method).toUpperCase() : '';
  const path = metaObj.path ? String(metaObj.path) : '';
  if (!method && !path) return '';

  const parts = [];
  if (method) parts.push(`<span class="log-chip">${escapeHtml(method)}</span>`);
  if (path) parts.push(`<span class="log-chip">${escapeHtml(path)}</span>`);
  return parts.join('');
}

function buildDetails(metaObj) {
  if (!metaObj) return `<span class="log-muted">-</span>`;

  const jsonPretty = escapeHtml(JSON.stringify(metaObj, null, 2));

  // <details> dá um UI nativo e leve
  return `
    <details class="log-details">
      <summary class="log-toggle">Ver detalhes</summary>
      <pre class="log-json">${jsonPretty}</pre>
    </details>
  `;
}

function prettyAction(action) {
  // exemplos:
  // page_view_home -> "Acesso: Home"
  // job_create_xxx -> "Job: Criado (xxx)"
  const a = String(action || '').trim();
  if (!a) return '-';

  if (a.startsWith('page_view_')) {
    const page = a.replace('page_view_', '').replaceAll('_', ' ');
    return `Acesso: ${titleCase(page)}`;
  }

  if (a.startsWith('job_create_')) {
    const job = a.replace('job_create_', '').replaceAll('_', ' ');
    return `Job: Criado (${titleCase(job)})`;
  }

  if (a.startsWith('job_error_')) {
    const job = a.replace('job_error_', '').replaceAll('_', ' ');
    return `Job: Erro (${titleCase(job)})`;
  }

  if (a.startsWith('login_')) {
    return `Login: ${titleCase(a.replaceAll('_', ' '))}`;
  }

  return titleCase(a.replaceAll('_', ' '));
}

function titleCase(s) {
  return String(s || '')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function safeParseMeta(meta) {
  if (!meta) return null;
  if (typeof meta === 'object') return meta;
  try {
    return JSON.parse(meta);
  } catch (_) {
    // se for string "solta", ainda mostra
    return { value: String(meta) };
  }
}

function relativeTime(d) {
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `há ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const day = Math.floor(hr / 24);
  return `há ${day}d`;
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
