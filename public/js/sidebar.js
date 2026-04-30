// public/js/sidebar.js

const MENU_CONFIG = [
  {
    id: 'pessoal',
    label: 'Pessoal',
    icon: '&#128578;',
    items: [
      { id: 'cct', label: 'CCT', href: '/cct', icon: '&#128218;' },
      { id: 'cartao-horas-iob', label: 'Importador Cart&atilde;o Horas IOB', href: '/cartao-horas-iob', icon: '&#128339;' },
      { id: 'importador-cartao-horas-bandeira-transportes', label: 'Importador Cart&atilde;o Horas Bandeira Transportes', href: '/importador-cartao-horas-bandeira-transportes', icon: '&#128666;' },
      { id: 'comparador-eventos-holerite', label: 'Comparador de Eventos de Holerite', href: '/comparador-eventos-holerite', icon: '&#128176;' },
      { id: 'ferias-funcionario', label: 'F&eacute;rias por Funcion&aacute;rio', href: '/separador-ferias-funcionario', icon: '&#127958;&#65039;' },
      { id: 'holerites-empresa', label: 'Holerites por Empresa', href: '/separador-holerites-por-empresa', icon: '&#128196;' },
      { id: 'relatorio-ferias', label: 'Relat&oacute;rio de F&eacute;rias por Empresa', href: '/separador-pdf-relatorio-de-ferias', icon: '&#128209;' },
    ],
  },
  {
    id: 'contabil',
    label: 'Cont&aacute;bil',
    icon: '&#128202;',
    items: [
      { id: 'acertos-lotes-internets', label: 'Acertos Lotes Internets', href: '/acertos-lotes-internets', icon: '&#128202;' },
      { id: 'acerto-lotes-toscan', label: 'Acerto Lotes Toscan', href: '/acerto-lotes-toscan', icon: '&#128196;' },
      { id: 'lotes-txt', label: 'Lotes TXT', href: '/lotes-txt', icon: '&#128209;' },
      { id: 'lotes-renasul', label: 'Lotes Renasul', href: '/lotes-renasul', icon: '&#128209;' },
      { id: 'gfbr-gerador-txt', label: 'Gerador TXT GFBR', href: '/gfbr-gerador-txt', icon: '&#128221;' },
      { id: 'conversor-extrato-pdf-ofx', label: 'Conversor Extrato PDF para OFX', href: '/conversor-extrato-pdf-ofx', icon: '&#127974;' },
      { id: 'balancete-transitorio', label: 'Conciliador Conta Transit&oacute;ria', href: '/balancete-transitorio', icon: '&#128196;' },
      { id: 'conciliador-hausen-ocean', label: 'Conciliador Hausen e Ocean', href: '/conciliador-hausen-ocean', icon: '&#128202;' },
      { id: 'conciliador-pis-cofins', label: 'Conciliador PIS-COFINS', href: '/conciliador-pis-cofins', icon: '&#128176;' },
      { id: 'importador-recebimentos-madre-scp', label: 'Importador Recebimentos Madre SCP', href: '/importador-recebimentos-madre-scp', icon: '&#128202;' },
      { id: 'separador-csv-baixa-automatica', label: 'Separador CSV Baixa Autom&aacute;tica', href: '/separador-csv-baixa-automatica', icon: '&#128202;' },
      { id: 'formatador-bernardina', label: 'Formatador DRE Bernadina (XLSM)', href: '/formatador-bernardina', icon: '&#128202;' },
      { id: 'conciliador-cartao-wilson', label: 'Conciliador Cart&atilde;o (Raz&atilde;o x Financeiro)', href: '/conciliador-cartao-wilson', icon: '&#128202;' },
      { id: 'conciliador-cartao-tipo50', label: 'Conciliador Cart&atilde;o Tipo 50', href: '/conciliador-cartao-tipo50', icon: '&#128202;' },
      { id: 'comparador-entradas-bandeira', label: 'Comparador Entradas FSIST x IOB', href: '/comparador-entradas-bandeira', icon: '&#128202;' },
      { id: 'planilha-nrc', label: 'Planilha NRC', href: '/planilha-nrc', icon: '&#128196;' },
    ],
  },
  {
    id: 'fiscal',
    label: 'Fiscal',
    icon: '&#128193;',
    items: [
      { id: 'nfe', label: 'Consulta NF-e', href: '/nfe', icon: '&#129534;' },
      { id: 'calculadora-icms-st', label: 'Calculadora de ICMS ST', href: '/calculadora-icms-st', icon: '&#128196;' },
      { id: 'speds', label: 'SPEDS', href: '/speds', icon: '&#128209;' },
    ],
  },
  {
    id: 'geral',
    label: 'Geral',
    icon: '&#129513;',
    items: [
      { id: 'gerador-atas', label: 'Gerador de Atas', icon: '&#128209;', href: '/gerador-atas' },
      { id: 'pdfa', label: 'Conversor PDF &rarr; PDF/A', href: '/pdf-a', icon: '&#128196;' },
      { id: 'comprimir-pdf', label: 'Comprimir PDF', icon: '&#129513;', href: '/comprimir-pdf' },
      { id: 'extrator-zip-rar', label: 'Extrator ZIP/RAR', href: '/extrator-zip-rar', icon: '&#128230;' },
      { id: 'excel-abas-pdf', label: 'Excel &rarr; Abas em PDF', icon: '&#128196;', href: '/excel-abas-pdf' },
      { id: 'irpf-carne-leao', label: 'IRPF Carne Le&atilde;o', icon: '&#128196;', href: '/irpf-carne-leao' },
      { id: 'cadastro-empresas-brasilapi', label: 'Cadastro de Empresas (BrasilAPI)', icon: '&#127970;', href: '/cadastro-empresas-brasilapi' },
      { id: 'tareffa-empresas-lote', label: 'Tareffa Empresas Lote', icon: '&#128196;', href: '/tareffa-empresas-lote' },
      { id: 'pedidos-alteracao-empresa', label: 'Pedidos de Altera&ccedil;&atilde;o de Empresa', icon: '&#127970;', href: '/pedidos-alteracao-empresa' },
      { id: 'pedidos-inclusao-exclusao-empresa', label: 'Pedidos de Inclus&atilde;o e Exclus&atilde;o de Empresa', icon: '&#127970;', href: '/pedidos-inclusao-exclusao-empresa' },
    ],
  },
  {
    id: 'parcelamentos',
    label: 'Parcelamentos',
    icon: '&#128179;',
    directNavigation: true,
    items: [
      { id: 'parcelamentos', label: 'HUB de Parcelamentos', href: '/parcelamentos', icon: '&#128179;' },
    ],
  },
  {
    id: 'declaracoes',
    label: 'Declara&ccedil;&otilde;es',
    icon: '&#127970;',
    items: [
      { id: 'dimob', label: 'Automa&ccedil;&atilde;o DIMOB', href: '/dimob', icon: '&#127970;' },
      { id: 'giast', label: 'GIAST', href: '/giast', icon: '&#128196;' },
      { id: 'sn', label: 'SN sem movimento', href: '/sn', icon: '&#128196;' },
      { id: 'mit', label: 'MIT/DCTFWEB sem movimento', href: '/mit', icon: '&#128196;' },
      { id: 'ecd-status', label: 'Lista de Empresas para ECD', href: '/ecd-status', icon: '&#128196;' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: '&#128274;',
    adminOnly: true,
    items: [
      { id: 'admin-usuarios', label: 'Usu&aacute;rios', href: '/admin-usuarios', icon: '&#128101;', adminOnly: true },
      { id: 'dashboards', label: 'Dashboards', href: '/dashboards', icon: '&#128202;', adminOnly: true },
      { id: 'admin-pedidos-empresas', label: 'Pedidos de Empresas', href: '/admin-pedidos-empresas', icon: '&#127970;', adminOnly: true },
      { id: 'checklist-ti-criacao-usuario', label: 'Checklist TI - Criacao de Usuario', href: '/checklist-ti-criacao-usuario', icon: '&#128221;', adminOnly: true },
      { id: 'audit-logs', label: 'Logs / Auditoria', href: '/logs', icon: '&#129534;', adminOnly: true },
    ],
  },
];

// Exporta para outras telas (ex.: admin-usuarios montar lista de permissoes)
window.MENU_CONFIG = MENU_CONFIG;

const TOOL_PERMISSION_ALIASES = {
  'conciliador-cartao-tipo50': ['conciliador-cartao-wilson'],
};

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
    let p = raw.split('?')[0].split('#')[0];
    p = p.replace(/^\/+/, '');
    p = p.replace(/\.html$/i, '');
    return p.toLowerCase() || null;
  }
}

function permForItem(item) {
  // Padrao: tool:<slug> (slug vem do href)
  const slug = normalizeToolSlugFromHref(item?.href) || String(item?.id || '').toLowerCase();
  return slug ? `tool:${slug}` : null;
}

function getAllVisibleToolPerms() {
  const perms = new Set();
  MENU_CONFIG.forEach((group) => {
    (group.items || []).forEach((item) => {
      if (group.adminOnly || item.adminOnly) return;
      const perm = permForItem(item);
      if (perm) perms.add(perm.toLowerCase());
    });
  });
  return perms;
}

function hasGlobalToolAccessOnUi(ctx) {
  const role = ctx?.user?.role || null;
  if (role === 'ADMIN') return true;

  const perms = new Set(
    (Array.isArray(ctx?.user?.permissions) ? ctx.user.permissions : [])
      .map((p) => String(p || '').trim().toLowerCase())
      .filter((p) => p.startsWith('tool:'))
  );

  // Sem marcacao de ferramenta: acesso total.
  if (perms.size === 0) return true;
  if (perms.has('tool:*')) return true;

  const allVisible = getAllVisibleToolPerms();
  if (allVisible.size > 0) {
    let hasAll = true;
    for (const perm of allVisible) {
      if (!perms.has(perm)) {
        hasAll = false;
        break;
      }
    }
    if (hasAll) return true;
  }

  return false;
}

function canSeeItem(item, ctx) {
  const role = ctx?.user?.role || null;
  if (item.adminOnly && role !== 'ADMIN') return false;
  if (hasGlobalToolAccessOnUi(ctx)) return true;

  const perms = (Array.isArray(ctx?.user?.permissions) ? ctx.user.permissions : [])
    .map((p) => String(p || '').trim().toLowerCase());

  const needed = permForItem(item);
  if (!needed) return true;
  if (perms.includes('tool:*') || perms.includes(String(needed).toLowerCase())) return true;

  const slug = String(needed || '').replace(/^tool:/, '');
  const aliases = TOOL_PERMISSION_ALIASES[slug] || [];
  return aliases.some((a) => perms.includes(`tool:${String(a).toLowerCase()}`));
}

function gerarSidebarHtml(activePageId, ctx) {
  let html = `
    <a href="/" class="nfe-menu-item">
      <span class="icon">&#127968;</span>
      <span class="label">In&iacute;cio</span>
    </a>
  `;

  MENU_CONFIG.forEach((group) => {
    const role = ctx?.user?.role || null;
    if (group.adminOnly && role !== 'ADMIN') return;

    const visibleItems = (group.items || []).filter((item) => canSeeItem(item, ctx));
    if (visibleItems.length === 0) return;

    if (group.directNavigation && visibleItems.length === 1) {
      const item = visibleItems[0];
      const activeClass = item.id === activePageId ? ' active' : '';
      html += `
        <a href="${item.href}" class="nfe-menu-item nfe-menu-direct${activeClass}" data-group="${group.id}">
          <span class="icon">${item.icon || group.icon || '&#128193;'}</span>
          <span class="label">${item.label || group.label}</span>
        </a>
      `;
      return;
    }

    const hasActive = visibleItems.some((item) => item.id === activePageId);
    const openClass = hasActive ? 'open' : '';

    html += `
      <div class="nfe-menu-group ${openClass}" data-group="${group.id}">
        <button type="button" class="nfe-menu-group-header">
          <span class="icon">${group.icon}</span>
          <span class="label">${group.label}</span>
          <span class="chevron">&#8250;</span>
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

  const userName = escapeHtml(ctx?.user?.name || 'Usuario');
  const userEmail = escapeHtml(ctx?.user?.email || '');
  html += `
    <div class="nfe-menu-spacer"></div>
    <div class="nfe-sidebar-account">
      <div class="nfe-sidebar-account-name">${userName}</div>
      ${userEmail ? `<div class="nfe-sidebar-account-email">${userEmail}</div>` : ''}
      <button type="button" class="nfe-menu-item nfe-menu-action nfe-logout-btn" data-action="logout">
        <span class="icon">&#9166;</span>
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
      <button type="button" class="app-topbar-menu" data-action="toggle-menu" aria-label="Abrir menu">&#9776;</button>
    </div>
    <div class="topbar-center">
      <img src="/img/Logo_preta_negativo-removebg-preview.png" class="topbar-logo" alt="Logo">
    </div>
    <div class="app-topbar-right">
      <button type="button" class="app-topbar-user" data-action="toggle-user-menu" aria-haspopup="menu" aria-expanded="false">
        <span class="app-topbar-user-avatar">&#128100;</span>
        <span class="app-topbar-user-name">${userName}</span>
      </button>
      <div class="app-topbar-user-menu" data-role="user-menu" aria-hidden="true">
        ${userEmail ? `<div class="app-topbar-user-email">${userEmail}</div>` : ''}
        <a href="/" class="app-topbar-user-item">In&iacute;cio</a>
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
  } catch (_) {}

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

  // Em mobile, ao navegar para uma pagina, fecha o drawer para nao parecer preso aberto.
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
      } catch (_) {}
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
      } catch (_) {}
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
