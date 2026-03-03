document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('loginMessage');
  const btn = document.getElementById('btnLogin');
  const passwordInput = document.getElementById('password');
  const passwordToggle = document.getElementById('passwordToggle');

  function setMsg(text) {
    if (!msg) return;
    msg.textContent = text || '';
  }

  function updatePasswordToggle() {
    if (!passwordInput || !passwordToggle) return;
    const isVisible = passwordInput.type === 'text';
    passwordToggle.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
    passwordToggle.setAttribute('aria-label', isVisible ? 'Ocultar senha' : 'Mostrar senha');
    passwordToggle.classList.toggle('is-visible', isVisible);
  }

  passwordToggle?.addEventListener('click', () => {
    if (!passwordInput) return;
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    updatePasswordToggle();
    passwordInput.focus({ preventScroll: true });
    const valueLength = passwordInput.value.length;
    passwordInput.setSelectionRange(valueLength, valueLength);
  });

  updatePasswordToggle();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('');
    if (btn) btn.disabled = true;

    const email = (document.getElementById('email')?.value || '').trim().toLowerCase();
    const password = passwordInput?.value || '';

    if (!email || !email.includes('@') || !password) {
      setMsg('Informe e-mail e senha.');
      if (btn) btn.disabled = false;
      return;
    }

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include', // <- importante para garantir cookie/sessão
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      // Trata rate-limit do backend (ex.: 429)
      if (resp.status === 429) {
        setMsg('Muitas tentativas. Aguarde um pouco e tente novamente.');
        return;
      }

      // tenta ler json, mas sem quebrar se vier vazio
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        // backend pode mandar { error: "..." }
        throw new Error(data.error || 'Falha no login');
      }

      // Sucesso: cookie httpOnly já foi setado pelo server
      window.location.href = '/';
    } catch (err) {
      setMsg(err?.message || 'Erro inesperado');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
});
