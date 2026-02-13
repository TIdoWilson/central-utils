// public/js/auth-client.js
(function () {
  const nativeFetch = window.fetch.bind(window);

  const AuthClient = {
    _ctx: null,
    _nativeFetch: nativeFetch,

    async getAuthContext(force = false) {
      if (!force && this._ctx) return this._ctx;

      const resp = await this._nativeFetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (resp.status === 401) {
        this._ctx = null;
        return null;
      }

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.user) {
        this._ctx = null;
        return null;
      }

      this._ctx = {
        user: data.user,
        csrfToken: data.csrfToken,
        rbacStrict: !!data.rbacStrict,
      };

      return this._ctx;
    },

    clearCache() {
      this._ctx = null;
    },

    async authFetch(url, options = {}) {
      const opts = { ...options };
      opts.credentials = 'include';

      const headers = new Headers(opts.headers || {});
      headers.set('Accept', 'application/json');

      const method = String(opts.method || 'GET').toUpperCase();
      const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);

      if (isMutation && !headers.has('x-csrf-token')) {
        const ctx = await this.getAuthContext();
        if (ctx?.csrfToken) headers.set('x-csrf-token', ctx.csrfToken);
      }

      opts.headers = headers;

      const resp = await this._nativeFetch(url, opts);

      if (resp.status === 401) {
        this._ctx = null;
        window.location.href = '/login';
      }

      return resp;
    },

    async logoutAndRedirect() {
      try {
        await this.authFetch('/api/auth/logout', { method: 'POST' });
      } catch (_) {}
      this._ctx = null;
      window.location.href = '/login';
    },
  };

  window.AuthClient = AuthClient;

  // Compatibilidade: converte fetch em authFetch automaticamente nas páginas internas.
  if (window.location.pathname !== '/login') {
    window.fetch = async function wrappedFetch(url, options) {
      try {
        const u = typeof url === 'string' ? url : (url?.url || '');
        if (typeof u === 'string' && u.startsWith('/') && !u.startsWith('//')) {
          return AuthClient.authFetch(url, options || {});
        }
      } catch (_) {}
      return nativeFetch(url, options);
    };
  }
})();
