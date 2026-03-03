// public/js/home.js
document.addEventListener('DOMContentLoaded', async () => {
  // Acordeon das sessões
  document.querySelectorAll('.session-header').forEach(header => {
    header.addEventListener('click', () => {
      const session = header.closest('.session');
      if (!session) return;
      session.classList.toggle('open');
    });
  });

  // Filtro por permissão
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

    // sem link real → esconde (evita “card morto”)
    if (!href || href === '#') {
      card.style.display = 'none';
      continue;
    }

    const slug = normalizeToolSlugFromHref(href);
    if (!slug) continue;

    // Páginas administrativas só aparecem para ADMIN.
    if (
      (slug === 'admin-usuarios' ||
        slug === 'admin-pedidos-empresas' ||
        slug === 'logs' ||
        slug === 'checklist-ti-criacao-usuario') &&
      role !== 'ADMIN'
    ) {
      card.style.display = 'none';
      continue;
    }

    const needed = `tool:${slug}`;
    if (!allowAll && !perms.map((p) => String(p || '').toLowerCase()).includes(needed.toLowerCase()) && !perms.includes('tool:*')) {
      card.style.display = 'none';
    }
  }

  // Esconde sessões vazias
  document.querySelectorAll('.session').forEach(section => {
    const visible = Array.from(section.querySelectorAll('.carousel-card'))
      .some(c => c.style.display !== 'none');
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
      .filter((p) => p.startsWith('tool:'))
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
