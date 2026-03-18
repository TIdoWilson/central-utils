// public/js/home.js

function buildMonoIcon(iconName) {
  // Carrega o SVG em resolução maior para manter nitidez em qualquer escala.
  return `https://api.iconify.design/${iconName}.svg?color=%23000000&width=96&height=96`;
}

const ICON_FALLBACK = buildMonoIcon('mdi:application-cog-outline');

const TOOL_ICON_MAP = {
  'comparador-eventos-holerite': buildMonoIcon('mdi:compare-horizontal'),
  'cartao-horas-iob': buildMonoIcon('mdi:clock-time-four-outline'),
  'separador-ferias-funcionario': buildMonoIcon('mdi:palm-tree'),
  'separador-holerites-por-empresa': buildMonoIcon('mdi:file-account-outline'),
  'separador-pdf-relatorio-de-ferias': buildMonoIcon('mdi:file-document-multiple-outline'),
  'acertos-lotes-internets': buildMonoIcon('mdi:text-box-check-outline'),
  'acerto-lotes-toscan': buildMonoIcon('mdi:file-edit-outline'),
  'lotes-txt': buildMonoIcon('mdi:file-delimited-outline'),
  'conversor-extrato-pdf-ofx': buildMonoIcon('mdi:bank-transfer-out'),
  'ajuste-diario-gfbr-c': buildMonoIcon('mdi:table-edit'),
  'balancete-transitorio': buildMonoIcon('mdi:scale-balance'),
  'conciliador-conta-transitoria-werbran': buildMonoIcon('mdi:scale-balance'),
  'conciliador-razao-iob': buildMonoIcon('mdi:clipboard-check-outline'),
  'conversor-pdf-p-excel': buildMonoIcon('mdi:file-excel-box'),
  'importador-recebimentos-madre-scp': buildMonoIcon('mdi:file-import-outline'),
  'separador-csv-baixa-automatica': buildMonoIcon('mdi:file-delimited-outline'),
  'formatador-bernardina': buildMonoIcon('mdi:table-large-plus'),
  'conciliador-hausen-ocean': buildMonoIcon('mdi:chart-line-variant'),
  'conciliador-pis-cofins': buildMonoIcon('mdi:calculator-variant-outline'),
  'conciliador-cartao-wilson': buildMonoIcon('mdi:credit-card-check-outline'),
  'conciliador-cartao-tipo50': buildMonoIcon('mdi:credit-card-sync-outline'),
  nfe: buildMonoIcon('mdi:receipt-text-check-outline'),
  'calculadora-icms-st': buildMonoIcon('mdi:calculator-variant'),
  speds: buildMonoIcon('mdi:file-cog-outline'),
  pdfa: buildMonoIcon('mdi:file-pdf-box'),
  'pdf-a': buildMonoIcon('mdi:file-pdf-box'),
  'gerador-atas': buildMonoIcon('mdi:file-sign'),
  'comprimir-pdf': buildMonoIcon('mdi:archive-arrow-down-outline'),
  'extrator-zip-rar': buildMonoIcon('mdi:folder-zip-outline'),
  'excel-abas-pdf': buildMonoIcon('mdi:file-export-outline'),
  'irpf-carne-leao': buildMonoIcon('mdi:lion'),
  'pedidos-alteracao-empresa': buildMonoIcon('mdi:office-building-cog-outline'),
  'pedidos-inclusao-exclusao-empresa': buildMonoIcon('mdi:account-multiple-plus-outline'),
  'cadastro-empresas-brasilapi': buildMonoIcon('mdi:domain-plus'),
  'tareffa-empresas-lote': buildMonoIcon('mdi:domain'),
  dimob: buildMonoIcon('mdi:home-city-outline'),
  giast: buildMonoIcon('mdi:file-document-edit-outline'),
  sn: buildMonoIcon('mdi:file-send-outline'),
  mit: buildMonoIcon('mdi:file-upload-outline'),
  'ecd-status': buildMonoIcon('mdi:clipboard-list-outline'),
  'admin-usuarios': buildMonoIcon('mdi:account-group-outline'),
  logs: buildMonoIcon('mdi:text-box-search-outline'),
  'checklist-ti-criacao-usuario': buildMonoIcon('mdi:clipboard-text-outline'),
  'atualizador-empresas-monitor': buildMonoIcon('mdi:update'),
  'fazedor-de-aef': buildMonoIcon('mdi:file-wrench-outline'),
  'consulta-cclass-econet': buildMonoIcon('mdi:magnify'),
  'verificador-de-baixas-automaticas-balao-azul': buildMonoIcon('mdi:file-search-outline'),
  'verificador-de-baixas-de-documentos-do-tareffa': buildMonoIcon('mdi:file-search-outline'),
};

const SECTION_ICON_MAP = {
  pessoal: buildMonoIcon('mdi:account'),
  contabil: buildMonoIcon('mdi:scale-balance'),
  fiscal: buildMonoIcon('mdi:calculator'),
  geral: buildMonoIcon('mdi:toolbox-outline'),
  declaracoes: buildMonoIcon('mdi:clipboard-text-outline'),
  admin: buildMonoIcon('mdi:shield-account-outline'),
  ti: buildMonoIcon('mdi:code-tags'),
  pdf: buildMonoIcon('mdi:file-pdf-box'),
};

const KEYWORD_ICON_RULES = [
  { pattern: /(pdf|ofx|extrato|arquivo)/, icon: buildMonoIcon('mdi:file-document-outline') },
  { pattern: /(excel|csv|planilha|slk)/, icon: buildMonoIcon('mdi:file-excel-outline') },
  { pattern: /(concilia|balancete|contabil|razao)/, icon: buildMonoIcon('mdi:scale-balance') },
  { pattern: /(fiscal|icms|nfe|sped|dctf|mit|dimob|giast)/, icon: buildMonoIcon('mdi:calculator') },
  { pattern: /(usuario|admin|permiss|auditoria|logs)/, icon: buildMonoIcon('mdi:shield-account-outline') },
  { pattern: /(ferias|holerite|ponto|cartao|funcionario)/, icon: buildMonoIcon('mdi:account-hard-hat-outline') },
  { pattern: /(zip|comprimir|extrator)/, icon: buildMonoIcon('mdi:folder-zip-outline') },
];

function getToolIconUrl({ slug, title, sectionId, tags }) {
  const toolSlug = String(slug || '').toLowerCase();
  if (toolSlug && TOOL_ICON_MAP[toolSlug]) return TOOL_ICON_MAP[toolSlug];

  const bag = `${toolSlug} ${String(title || '')} ${String(sectionId || '')} ${tags.join(' ')}`.toLowerCase();
  for (const rule of KEYWORD_ICON_RULES) {
    if (rule.pattern.test(bag)) return rule.icon;
  }

  const sectionKey = String(sectionId || '').toLowerCase();
  if (sectionKey && SECTION_ICON_MAP[sectionKey]) return SECTION_ICON_MAP[sectionKey];

  return ICON_FALLBACK;
}

function applyPreviewIcons() {
  const cards = Array.from(document.querySelectorAll('.carousel-card'));
  for (const card of cards) {
    const iconBox = card.querySelector('.card-icon');
    if (!iconBox) continue;

    const link = card.querySelector('a.btn-card');
    const href = link?.getAttribute('href') || '';
    const slug = normalizeToolSlugFromHref(href) || card.getAttribute('data-script') || '';
    const title = (card.querySelector('.card-title')?.textContent || 'Ferramenta').trim();
    const sectionId = card.closest('.session')?.id || '';
    const tags = Array.from(card.querySelectorAll('.card-tags span'))
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);

    const img = document.createElement('img');
    img.src = getToolIconUrl({ slug, title, sectionId, tags });
    img.alt = title;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onerror = () => {
      if (img.src !== ICON_FALLBACK) img.src = ICON_FALLBACK;
    };

    iconBox.textContent = '';
    iconBox.appendChild(img);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  applyPreviewIcons();

  // Acordeon das sessoes
  document.querySelectorAll('.session-header').forEach((header) => {
    header.addEventListener('click', () => {
      const session = header.closest('.session');
      if (!session) return;
      session.classList.toggle('open');
    });
  });

  // Filtro por permissao
  if (!window.AuthClient) return;

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx?.user) return;
  setupHomeUserMenu(ctx);

  const role = ctx.user.role;
  const perms = Array.isArray(ctx.user.permissions) ? ctx.user.permissions : [];
  const allowAll = hasGlobalToolAccessOnHome(ctx);

  const cards = Array.from(document.querySelectorAll('.carousel-card'));
  for (const card of cards) {
    const link = card.querySelector('a.btn-card');
    const href = link?.getAttribute('href') || '';

    // sem link real -> esconde (evita card morto)
    if (!href || href === '#') {
      card.style.display = 'none';
      continue;
    }

    const slug = normalizeToolSlugFromHref(href);
    if (!slug) continue;

    // Paginas administrativas so aparecem para ADMIN.
    if (
      (slug === 'admin-usuarios'
        || slug === 'admin-pedidos-empresas'
        || slug === 'logs'
        || slug === 'checklist-ti-criacao-usuario')
      && role !== 'ADMIN'
    ) {
      card.style.display = 'none';
      continue;
    }

    const needed = `tool:${slug}`;
    const permList = perms.map((p) => String(p || '').toLowerCase());
    if (!allowAll && !permList.includes(needed.toLowerCase()) && !permList.includes('tool:*')) {
      card.style.display = 'none';
    }
  }

  // Esconde sessoes vazias
  document.querySelectorAll('.session').forEach((section) => {
    const visible = Array.from(section.querySelectorAll('.carousel-card'))
      .some((c) => c.style.display !== 'none');
    if (!visible) section.style.display = 'none';
  });

});

function getAllVisibleToolPermsOnHome() {
  const perms = new Set();
  const cards = Array.from(document.querySelectorAll('.carousel-card'));
  for (const card of cards) {
    const link = card.querySelector('a.btn-card');
    const href = link?.getAttribute('href') || '';
    const slug = normalizeToolSlugFromHref(href);
    if (!slug) continue;
    if (['admin-usuarios', 'admin-pedidos-empresas', 'logs', 'checklist-ti-criacao-usuario'].includes(slug)) continue;
    perms.add(`tool:${slug}`.toLowerCase());
  }
  return perms;
}

function hasGlobalToolAccessOnHome(ctx) {
  const role = String(ctx?.user?.role || '').toUpperCase();
  if (role === 'ADMIN') return true;

  const perms = new Set(
    (Array.isArray(ctx?.user?.permissions) ? ctx.user.permissions : [])
      .map((p) => String(p || '').trim().toLowerCase())
      .filter((p) => p.startsWith('tool:')),
  );

  if (perms.size === 0) return true;
  if (perms.has('tool:*')) return true;

  const known = getAllVisibleToolPermsOnHome();
  if (known.size > 0) {
    let allKnown = true;
    for (const perm of known) {
      if (!perms.has(perm)) {
        allKnown = false;
        break;
      }
    }
    if (allKnown) return true;
  }
  return false;
}

function setupHomeUserMenu(ctx) {
  const btn = document.getElementById('homeUserBtn');
  const menu = document.getElementById('homeUserMenu');
  const logoutBtn = document.getElementById('homeLogoutBtn');
  const userNameEl = document.getElementById('homeUserName');
  const userEmailEl = document.getElementById('homeUserEmail');

  if (!btn || !menu) return;

  if (userNameEl) userNameEl.textContent = ctx?.user?.name || 'Usuário';
  if (userEmailEl) userEmailEl.textContent = ctx?.user?.email || '';

  const closeMenu = () => {
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
  };

  const toggleMenu = () => {
    const willOpen = !menu.classList.contains('open');
    if (willOpen) {
      menu.classList.add('open');
      menu.setAttribute('aria-hidden', 'false');
      btn.setAttribute('aria-expanded', 'true');
    } else {
      closeMenu();
    }
  };

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleMenu();
  });

  document.addEventListener('click', (ev) => {
    if (!menu.contains(ev.target) && ev.target !== btn) closeMenu();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeMenu();
  });

  logoutBtn?.addEventListener('click', async () => {
    closeMenu();
    try {
      if (window.AuthClient?.logoutAndRedirect) {
        await window.AuthClient.logoutAndRedirect();
        return;
      }
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) { }
    window.location.href = '/login';
  });
}

function normalizeToolSlugFromHref(href) {
  const raw = String(href || '').trim();
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
