const express = require('express');

function toBoolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

module.exports = function createAuthRoutes(deps) {
  const {
    pool,
    bcrypt,
    loginLimiter,
    auditLog,
    requireAuth,
    requireCsrf,
    newTokenHex,
    sha256Hex,
    sanitizeUserRow,
  } = deps;

  const router = express.Router();

  router.post('/login', loginLimiter, async (req, res) => {
    const emailRaw = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!emailRaw || !emailRaw.includes('@') || password.length < 1) {
      await auditLog(req, 'login_failed', 'error', { reason: 'invalid_payload' });
      return res.status(400).json({ error: 'Credenciais inválidas' });
    }

    try {
      const { rows } = await pool.query(
        `SELECT id, name, email, password_hash, role, is_active, created_at, last_login_at
         FROM auth_users
         WHERE email=$1
         LIMIT 1`,
        [emailRaw]
      );

      const user = rows[0];
      if (!user || !user.is_active) {
        await auditLog(req, 'login_failed', 'error', { reason: 'user_not_found_or_inactive', email: emailRaw });
        return res.status(401).json({ error: 'E-mail ou senha inválidos' });
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        await auditLog(req, 'login_failed', 'error', { reason: 'wrong_password', email: emailRaw });
        return res.status(401).json({ error: 'E-mail ou senha inválidos' });
      }

      const sessionToken = newTokenHex(32);
      const tokenHash = sha256Hex(sessionToken);
      const csrfToken = newTokenHex(16);

      const maxAgeSeconds = Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS || 604800);
      const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

      await pool.query(
        `INSERT INTO auth_sessions (user_id, token_hash, csrf_token, expires_at)
         VALUES ($1,$2,$3,$4)`,
        [user.id, tokenHash, csrfToken, expiresAt]
      );

      await pool.query(`UPDATE auth_users SET last_login_at=NOW() WHERE id=$1`, [user.id]).catch(() => {});

      const cookieOpts = [
        `wl_session=${encodeURIComponent(sessionToken)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAgeSeconds}`,
      ];
      if (process.env.NODE_ENV === 'production') cookieOpts.push('Secure');

      res.setHeader('Set-Cookie', cookieOpts.join('; '));

      const safeUser = sanitizeUserRow(user);
      await auditLog(req, 'login_success', 'ok', {}, safeUser);
      return res.json({ user: safeUser, csrfToken });
    } catch (e) {
      console.error('login error:', e.message);
      await auditLog(req, 'login_failed', 'error', { reason: 'server_error' });
      return res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.get('/me', requireAuth, async (req, res) => {
    return res.json({
      user: req.user,
      csrfToken: req.csrfToken,
      rbacStrict: toBoolEnv(process.env.RBAC_STRICT, false),
    });
  });

  router.post('/logout', requireAuth, requireCsrf, async (req, res) => {
    try {
      await pool.query(`DELETE FROM auth_sessions WHERE token_hash=$1`, [req.sessionTokenHash]);
    } catch (e) {
      console.error('logout error:', e.message);
    }

    res.setHeader('Set-Cookie', 'wl_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    await auditLog(req, 'logout', 'ok', {});
    return res.json({ ok: true });
  });

  return router;
};
