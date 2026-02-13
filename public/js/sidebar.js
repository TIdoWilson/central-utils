// public/js/sidebar.js

const MENU_CONFIG = [
  {
    id: 'pessoal',
    label: 'Pessoal',
    icon: '🙂',
    items: [
      { id: 'ferias-funcionario', label: 'Férias por Funcionário', href: '/separador-ferias-funcionario', icon: '🏖️' },
      { id: 'holerites-empresa', label: 'Holerites por Empresa', href: '/separador-holerites-por-empresa', icon: '📄' },
      { id: 'relatorio-ferias', label: 'Relatório de Férias por Empresa', href: '/separador-pdf-relatorio-de-ferias', icon: '📑' },
    ],
  },
  {
    id: 'contabil',
    label: 'Contábil',
    icon: '📊',
    items: [
      { id: 'acertos-lotes-internets', label: 'Acertos Lotes Internets', href: '/acertos-lotes-internets', icon: '📊' },
      { id: 'acerto-lotes-toscan', label: 'Acerto Lotes Toscan', href: '/acerto-lotes-toscan', icon: '📄' },
      { id: 'ajuste-diario-gfbr-c', label: 'Ajuste Diario GFBR', href: '/ajuste-diario-gfbr-c', icon: '📄' },
      { id: 'balancete-transitorio', label: 'Conciliador Conta Transitória', href: '/balancete-transitorio', icon: '📄' },
      { id: 'conciliador-hausen-ocean', label: 'Conciliador Hausen e Ocean', href: '/conciliador-hausen-ocean', icon: '📊' },
      { id: 'importador-recebimentos-madre-scp', label: 'Importador Recebimentos Madre SCP', href: '/importador-recebimentos-madre-scp', icon: '📊' },
      { id: 'separador-csv-baixa-automatica', label: 'Separador CSV Baixa Automática', href: '/separador-csv-baixa-automatica', icon: '📊' },
      { id: 'formatador-bernardina', label: 'Formatador DRE Bernadina (XLSM)', href: '/formatador-bernardina', icon: '📊' },
      { id: 'conciliador-cartao-wilson', label: 'Conciliador Cartão (Razão x Financeiro)', href: '/conciliador-cartao-wilson', icon: '📊' }

    ],
  },
  {
    id: 'fiscal',
    label: 'Fiscal',
    icon: '📁',
    items: [
      { id: 'nfe', label: 'Consulta NF-e', href: '/nfe', icon: '🧾' },
      { id: 'calculadora-icms-st', label: 'Calculadora de ICMS ST', href: '/calculadora-ICMS-ST', icon: '📄' },
    ],
  },
  {
    id: 'ferramentas-pdf',
    label: 'Ferramentas PDF',
    icon: '📄',
    items: [
      { id: 'pdfa', label: 'Conversor PDF → PDF/A', href: '/pdf-a', icon: '📄' },
    ],
  },
  {
    id: 'geral',
    label: 'Geral',
    icon: '🧰',
    items: [
      { id: 'gerador-atas', label: 'Gerador de Atas', icon: '📑', href: '/gerador-atas' },
      { id: 'comprimir-pdf', label: 'Comprimir PDF', icon: '🧩', href: '/comprimir-pdf' },
      { id: 'extrator-zip-rar', label: 'Extrator ZIP/RAR', href: '/extrator-zip-rar', icon: '📦' },
      { id: 'excel-abas-pdf', label: 'Excel → Abas em PDF', icon: '📄', href: '/excel-abas-pdf' },
      { id: 'irpf-carne-leao', label: 'IRPF Carne Leão', icon: '📄', href: '/irpf-carne-leao' },
      { id: 'tareffa-empresas-lote', label: 'Tareffa Empresas Lote', icon: '📄', href: '/tareffa-empresas-lote' },
    ],
  },
  {
    id: 'declaracoes',
    label: 'Declarações',
    icon: '🏢',
    items: [
      { id: 'dimob', label: 'Automação DIMOB', href: '/dimob', icon: '🏢' },
      { id: 'sn', label: 'SN sem movimento', href: '/sn', icon: '📄' },
      { id: 'mit', label: 'MIT/DCTFWEB sem movimento', href: '/mit', icon: '📄' },
      { id: 'ecd-status', label: 'Lista de Empresas para ECD', href: '/ecd-status', icon: '📄' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: '🔐',
    adminOnly: true,
    items: [
      { id: 'admin-usuarios', label: 'Usuários', href: '/admin-usuarios', icon: '👥', adminOnly: true },
      { id: 'audit-logs', label: 'Logs / Auditoria', href: '/logs', icon: '🧾', adminOnly: true },
    ],
  },
];

// Exporta pra outras telas (ex.: admin-usuarios montar lista de permissões)
window.MENU_CONFIG = MENU_CONFIG;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeToolSlugFromHref(href) {
  if (!href) return null;
  const raw = String(href).trim();
  if (!raw || raw === '#') return null;

  try {
    const url = new URL(raw, window.location.origin);
    let p = decodeURIComponent(url.pathname || '');
    p = p.replace(/^\/+/, '');
    p = p.replace(/\.html$/i, '');
    return p.toLowerCase();
  } catch (_) {
    // fallback simples
    let p = raw.split('?')[0].split('#')[0];
    p = p.replace(/^\/+/, '');
    p = p.replace(/\.html$/i, '');
    return p.toLowerCase() || null;
  }
}

function permForItem(item) {
  // padrão: tool:<slug> (slug vem do href)
  const slug = normalizeToolSlugFromHref(item?.href) || String(item?.id || '').toLowerCase();
  return slug ? `tool:${slug}` : null;
}

function canSeeItem(item, ctx) {
  const role = ctx?.user?.role || null;
  if (item.adminOnly && role !== 'ADMIN') return false;
  if (role === 'ADMIN') return true;

  const perms = Array.isArray(ctx?.user?.permissions) ? ctx.user.permissions : [];
  const strict = !!ctx?.rbacStrict;

  // modo transição: se NÃO for strict e não tem lista ainda, mostra tudo
  if (!strict && perms.length === 0) return true;

  const needed = permForItem(item);
  if (!needed) return true;
  return perms.includes(needed) || perms.includes('tool:*');
}

function gerarSidebarHtml(activePageId, ctx) {
  let html = `
    <a href="/" class="nfe-menu-item">
      <span class="icon">🏠</span>
      <span class="label">Início</span>
    </a>
  `;

  MENU_CONFIG.forEach((group) => {
    const role = ctx?.user?.role || null;
    if (group.adminOnly && role !== 'ADMIN') return;

    const visibleItems = (group.items || []).filter((item) => canSeeItem(item, ctx));
    if (visibleItems.length === 0) return;

    const hasActive = visibleItems.some((item) => item.id === activePageId);
    const openClass = hasActive ? 'open' : '';

    html += `
      <div class="nfe-menu-group ${openClass}" data-group="${group.id}">
        <button type="button" class="nfe-menu-group-header">
          <span class="icon">${group.icon}</span>
          <span class="label">${group.label}</span>
          <span class="chevron">›</span>
        </button>
        <div class="nfe-menu-subitems">
    `;

    visibleItems.forEach((item) => {
      const activeClass = item.id === activePageId ? ' active' : '';
      html += `
        <a href="${item.href}" class="nfe-menu-item nfe-menu-subitem${activeClass}">
          <span class="icon">${item.icon}</span>
          <span class="label">${item.label}</span>
        </a>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  const userName = escapeHtml(ctx?.user?.name || 'Usuário');
  const userEmail = escapeHtml(ctx?.user?.email || '');
  html += `
    <div class="nfe-menu-spacer"></div>
    <div class="nfe-sidebar-account">
      <div class="nfe-sidebar-account-name">${userName}</div>
      ${userEmail ? `<div class="nfe-sidebar-account-email">${userEmail}</div>` : ''}
      <button type="button" class="nfe-menu-item nfe-menu-action nfe-logout-btn" data-action="logout">
        <span class="icon">⎋</span>
        <span class="label">Sair</span>
      </button>
    </div>
  `;

  return html;
}

function isMobileLayout() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function ensureSidebarBackdrop(layout) {
  if (!layout) return null;
  let backdrop = layout.querySelector('.nfe-sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'nfe-sidebar-backdrop';
    layout.appendChild(backdrop);
  }
  return backdrop;
}

function ensureGlobalTopbar(ctx) {
  const main = document.querySelector('.nfe-main');
  if (!main) return;
  if (main.querySelector('.app-topbar')) return;

  const userName = escapeHtml(ctx?.user?.name || 'Conta');
  const userEmail = escapeHtml(ctx?.user?.email || '');

  const topbar = document.createElement('div');
  topbar.className = 'topbar app-topbar';
  topbar.innerHTML = `
    <div class="topbar-left">
      <button type="button" class="app-topbar-menu" data-action="toggle-menu" aria-label="Abrir menu">☰</button>
    </div>
    <div class="topbar-center">
      <img src="/img/Logo_preta_negativo-removebg-preview.png" class="topbar-logo" alt="Logo">
    </div>
    <div class="app-topbar-right">
      <button type="button" class="app-topbar-user" data-action="toggle-user-menu" aria-haspopup="menu" aria-expanded="false">
        <span class="app-topbar-user-avatar">👤</span>
        <span class="app-topbar-user-name">${userName}</span>
      </button>
      <div class="app-topbar-user-menu" data-role="user-menu" aria-hidden="true">
        ${userEmail ? `<div class="app-topbar-user-email">${userEmail}</div>` : ''}
        <a href="/" class="app-topbar-user-item">Início</a>
        <button type="button" class="app-topbar-user-item app-topbar-user-item-danger" data-action="logout">Sair</button>
      </div>
    </div>
  `;

  main.insertBefore(topbar, main.firstChild);
}

async function inicializarSidebar(activePageId) {
  const nav = document.getElementById('sidebarMenu');
  if (!nav) return;

  let ctx = null;
  try {
    if (window.AuthClient?.getAuthContext) {
      ctx = await AuthClient.getAuthContext();
    }
  } catch (_) { }

  nav.innerHTML = gerarSidebarHtml(activePageId, ctx);

  const layout = document.querySelector('.nfe-layout');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const backdrop = ensureSidebarBackdrop(layout);
  ensureGlobalTopbar(ctx);

  const toggleSidebar = () => {
    if (!layout) return;
    if (isMobileLayout()) {
      layout.classList.toggle('menu-open');
    } else {
      layout.classList.toggle('collapsed');
    }
  };

  if (layout && sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
  }

  if (layout && backdrop) {
    backdrop.addEventListener('click', () => {
      layout.classList.remove('menu-open');
    });
  }

  nav.querySelectorAll('.nfe-menu-group-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.nfe-menu-group');
      if (group) group.classList.toggle('open');
    });
  });

  // Em mobile, ao navegar para uma página, fecha o drawer para não parecer "preso aberto".
  nav.querySelectorAll('a.nfe-menu-item').forEach((link) => {
    link.addEventListener('click', () => {
      if (!layout) return;
      if (isMobileLayout()) layout.classList.remove('menu-open');
    });
  });

  nav.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        if (window.AuthClient?.logoutAndRedirect) {
          await window.AuthClient.logoutAndRedirect();
          return;
        }
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (_) { }
      window.location.href = '/login';
    });
  });

  document.querySelectorAll('.app-topbar .app-topbar-menu[data-action="toggle-menu"]').forEach((btn) => {
    btn.addEventListener('click', toggleSidebar);
  });

  document.querySelectorAll('.app-topbar [data-action="toggle-user-menu"]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const wrapper = btn.closest('.app-topbar-right');
      if (!wrapper) return;
      const menu = wrapper.querySelector('[data-role="user-menu"]');
      if (!menu) return;
      const open = menu.classList.toggle('open');
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  document.querySelectorAll('.app-topbar [data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        if (window.AuthClient?.logoutAndRedirect) {
          await window.AuthClient.logoutAndRedirect();
          return;
        }
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (_) { }
      window.location.href = '/login';
    });
  });

  document.addEventListener('click', (ev) => {
    document.querySelectorAll('.app-topbar [data-role="user-menu"]').forEach((menu) => {
      const wrap = menu.closest('.app-topbar-right');
      if (!wrap || wrap.contains(ev.target)) return;
      menu.classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');
      const trigger = wrap.querySelector('[data-action="toggle-user-menu"]');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  });

  window.addEventListener('resize', () => {
    if (!layout) return;
    if (!isMobileLayout()) layout.classList.remove('menu-open');
  });
}
