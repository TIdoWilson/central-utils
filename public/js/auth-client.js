// public/js/auth-client.js
let _authCache = null;
let _authLoading = null;

async function getAuthContext(force = false) {
  if (_authCache && !force) return _authCache;

  if (_authLoading && !force) return _authLoading;

  _authLoading = (async () => {
    const resp = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });

    if (!resp.ok) {
      _authCache = null;
      return null;
    }

    const data = await resp.json().catch(() => null);
    _authCache = data;
    return _authCache;
  })().finally(() => {
    _authLoading = null;
  });

  return _authLoading;
}

function _isMutation(method) {
  const m = String(method || 'GET').toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

async function authFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();

  // login é público e não usa CSRF (mas pode ser chamado com fetch direto do login.js)
  const isLogin = url === '/api/auth/login';

  // carrega contexto (se não for login)
  let ctx = null;
  if (!isLogin) {
    ctx = await getAuthContext();
    if (!ctx) {
      window.location.href = '/login';
      throw new Error('Não autenticado');
    }
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  // injeta CSRF nas mutações (exceto login)
  if (!isLogin && _isMutation(method)) {
    headers.set('x-csrf-token', ctx?.csrfToken || '');
  }

  // sempre inclui cookies (wl_session)
  const doFetch = () =>
    fetch(url, {
      ...options,
      method,
      headers,
      credentials: 'include',
    });

  let resp = await doFetch();

  // sessão expirada
  if (resp.status === 401) {
    _authCache = null;
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }

  // CSRF inválido/ausente: recarrega /me e repete 1x
  if (!isLogin && resp.status === 403 && _isMutation(method)) {
    let body = null;
    try {
      body = await resp.clone().json();
    } catch (_) {}

    if (body && (body.code === 'csrf_invalid' || body.code === 'csrf_missing')) {
      ctx = await getAuthContext(true);
      if (!ctx) {
        window.location.href = '/login';
        throw new Error('Não autenticado');
      }

      headers.set('x-csrf-token', ctx.csrfToken || '');
      resp = await doFetch();

      if (resp.status === 401) {
        _authCache = null;
        window.location.href = '/login';
        throw new Error('Sessão expirada');
      }
    }
  }

  return resp;
}

async function logoutAndRedirect() {
  try {
    // logout é autenticado; CSRF recomendado (você já injeta):contentReference[oaicite:3]{index=3}
    await authFetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch (_) {}
  _authCache = null;
  window.location.href = '/login';
}

window.AuthClient = { getAuthContext, authFetch, logoutAndRedirect };
