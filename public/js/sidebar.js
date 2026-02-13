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
    id: 'ferramentas-pdf',
    label: 'Ferramentas PDF',
    icon: '📄',
    items: [
      { id: 'pdfa', label: 'Conversor PDF → PDF/A', href: '/pdf-a', icon: '📄' },
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

  return html;
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

  if (layout && sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      layout.classList.toggle('collapsed');
    });
  }

  nav.querySelectorAll('.nfe-menu-group-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.nfe-menu-group');
      if (group) group.classList.toggle('open');
    });
  });
}
