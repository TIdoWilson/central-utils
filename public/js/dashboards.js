document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (typeof inicializarSidebar === 'function') {
      await inicializarSidebar('dashboards');
    }
  } catch (_) {}

  const whoami = document.getElementById('whoami');
  const msg = document.getElementById('dashboardsMessage');
  const btnRefresh = document.getElementById('btnRefreshDashboards');
  const btnLogout = document.getElementById('btnLogout');

  if (!window.AuthClient) {
    window.location.href = '/login';
    return;
  }

  btnLogout?.addEventListener('click', () => AuthClient.logoutAndRedirect());
  btnRefresh?.addEventListener('click', () => loadDashboardMetrics());

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx?.user) {
    window.location.href = '/login';
    return;
  }

  if (String(ctx.user.role || '').toUpperCase() !== 'ADMIN') {
    window.location.href = '/acesso-negado';
    return;
  }

  if (whoami) {
    whoami.textContent = `Logado como: ${ctx.user.name} <${ctx.user.email}> (${ctx.user.role})`;
  }
  if (msg) msg.textContent = '';

  await loadDashboardMetrics();
});

async function loadDashboardMetrics() {
  const msg = document.getElementById('dashboardsMessage');
  const tbody = document.getElementById('accessByUserTableBody');
  if (msg) msg.textContent = '';
  if (tbody) tbody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';

  try {
    const resp = await AuthClient.authFetch('/api/admin/dashboard-metrics', { method: 'GET' });

    if (resp.status === 403) {
      if (msg) msg.textContent = 'Sem permissão (apenas ADMIN).';
      if (tbody) tbody.innerHTML = '<tr><td colspan="5">Sem permissão.</td></tr>';
      return;
    }

    const data = await resp.json().catch(() => null);
    if (!resp.ok || data?.error) {
      throw new Error((data && data.error) ? data.error : 'Erro ao carregar dashboard.');
    }

    const processing = data?.processing || {};
    const accesses = data?.accesses || {};

    renderSummary(processing, accesses);
    renderErrorDonut(processing);
    renderAccessesByDay(Array.isArray(accesses.byDay) ? accesses.byDay : []);
    renderAccessesByUser(Array.isArray(accesses.byUser) ? accesses.byUser : []);
  } catch (e) {
    if (msg) msg.textContent = e?.message || 'Erro ao carregar dashboard.';
    if (tbody) tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar dados.</td></tr>';
  }
}

function renderSummary(processing, accesses) {
  setText('metricProcessingTotal', formatInt(processing.total));
  setText('metricProcessingSuccess', formatInt(processing.success));
  setText('metricProcessingError', formatInt(processing.error));
  setText('metricAccessLast7Days', formatInt(accesses.last7Days));
  setText('metricAccessTotal', formatInt(accesses.total));
  setText('metricUsersMapped', formatInt((Array.isArray(accesses.byUser) ? accesses.byUser.length : 0)));
  setText('metricErrorPercent', formatPercent(processing.errorPercent));
  setText('metricSuccessPercent', formatPercent(processing.successPercent));
}

function renderErrorDonut(processing) {
  const donut = document.getElementById('errorRateDonut');
  const center = document.getElementById('errorRateCenter');
  if (!donut) return;

  const errorPercent = clampNumber(processing?.errorPercent, 0, 100);
  donut.style.setProperty('--error-pct', '0%');
  if (center) center.textContent = formatPercent(errorPercent);

  window.setTimeout(() => {
    donut.style.setProperty('--error-pct', `${errorPercent}%`);
  }, 40);
}

function renderAccessesByDay(rows) {
  const chart = document.getElementById('accessByDayChart');
  if (!chart) return;

  chart.classList.remove('is-ready');

  if (!rows.length) {
    chart.innerHTML = '<div class="dashboard-empty">Sem dados de acesso nos últimos 7 dias.</div>';
    return;
  }

  const maxValue = Math.max(1, ...rows.map((r) => Number(r?.accesses || 0)));
  chart.innerHTML = rows.map((row, idx) => {
    const day = String(row?.day || '');
    const accesses = Number(row?.accesses || 0);
    const widthPct = Math.max(2, Math.round((accesses / maxValue) * 100));
    return `
      <div class="dashboard-bar-row">
        <div class="dashboard-bar-day">${escapeHtml(formatDay(day))}</div>
        <div class="dashboard-bar-track">
          <div class="dashboard-bar-fill" style="--target-width:${widthPct}%; --delay:${idx * 80}ms;"></div>
        </div>
        <div class="dashboard-bar-value">${formatInt(accesses)}</div>
      </div>
    `;
  }).join('');

  window.requestAnimationFrame(() => {
    chart.classList.add('is-ready');
  });
}

function renderAccessesByUser(rows) {
  const tbody = document.getElementById('accessByUserTableBody');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum acesso encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const userName = escapeHtml(row?.userName || '-');
    const email = escapeHtml(row?.email || '-');
    const last7 = formatInt(row?.accessesLast7Days || 0);
    const total = formatInt(row?.accessesTotal || 0);
    const lastAccess = formatDateTime(row?.lastAccessAt);
    return `
      <tr>
        <td>${userName}</td>
        <td>${email}</td>
        <td>${last7}</td>
        <td>${total}</td>
        <td>${escapeHtml(lastAccess)}</td>
      </tr>
    `;
  }).join('');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? '');
}

function formatInt(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatPercent(value) {
  const n = clampNumber(value, 0, 100);
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDay(isoDate) {
  if (!isoDate) return '-';
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

