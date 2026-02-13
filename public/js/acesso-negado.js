document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (window.inicializarSidebar) {
      await window.inicializarSidebar('__forbidden__');
    }
  } catch (_) {}

  const logoutBtn = document.getElementById('forbiddenLogoutBtn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', async () => {
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
