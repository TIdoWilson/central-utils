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

  const role = ctx.user.role;
  const perms = Array.isArray(ctx.user.permissions) ? ctx.user.permissions : [];
  const strict = !!ctx.rbacStrict;

  // ADMIN vê tudo
  const allowAll = (role === 'ADMIN') || (!strict && perms.length === 0);

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

    const needed = `tool:${slug}`;
    if (!allowAll && !perms.includes(needed) && !perms.includes('tool:*')) {
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
