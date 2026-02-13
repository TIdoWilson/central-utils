const express = require('express');

const TOOL_PERM_RE = /^tool:[A-Za-z0-9._-]+$|^tool:\*$/;

module.exports = function createAdminRoutes(deps) {
  const {
    pool,
    bcrypt,
    requireAuth,
    requireRole,
    requireCsrf,
    uploadAdminUsers,
    auditLog,
    sanitizeUserRow,
    normalizeRole,
    isValidEmail,
  } = deps;

  const router = express.Router();

  router.get('/users', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, is_active, created_at, last_login_at
       FROM auth_users
       ORDER BY id DESC`
    );
    const users = rows.map(sanitizeUserRow);
    if (String(req.query?.format || '').toLowerCase() === 'array') {
      return res.json(users);
    }
    return res.json({ users });
  });

  router.post('/users', requireAuth, requireRole('ADMIN'), requireCsrf, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role = normalizeRole(req.body?.role);

    if (!name || !isValidEmail(email) || password.length < 6) {
      return res.status(400).json({ error: 'Dados inválidos (nome, e-mail, senha>=6)' });
    }

    const hash = await bcrypt.hash(password, 10);

    try {
      const { rows } = await pool.query(
        `INSERT INTO auth_users (name, email, password_hash, role, is_active)
         VALUES ($1,$2,$3,$4,true)
         RETURNING id, name, email, role, is_active, created_at, last_login_at`,
        [name, email, hash, role]
      );

      await auditLog(req, 'user_create', 'ok', { target_email: email, target_user_id: rows[0]?.id });
      return res.json({ user: sanitizeUserRow(rows[0]) });
    } catch (e) {
      if (String(e.message || '').includes('unique')) {
        return res.status(409).json({ error: 'E-mail já existe' });
      }
      console.error(e);
      await auditLog(req, 'user_create', 'error', { target_email: email, reason: 'server_error' });
      return res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.patch('/users/:id', requireAuth, requireRole('ADMIN'), requireCsrf, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    if (req.body?.is_active === false && req.user?.id === id) {
      return res.status(400).json({ error: 'Você não pode desativar seu próprio usuário' });
    }

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = normalizeRole(req.body?.role);
    const isActive = req.body?.is_active;

    if (!name || !isValidEmail(email) || (isActive !== undefined && typeof isActive !== 'boolean')) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const { rows } = await pool.query(
      `UPDATE auth_users
       SET name=$1, email=$2, role=$3, is_active=COALESCE($4,is_active)
       WHERE id=$5
       RETURNING id, name, email, role, is_active, created_at, last_login_at`,
      [name, email, role, isActive ?? null, id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    await auditLog(req, 'user_update', 'ok', { target_user_id: id, target_email: email });
    res.json({ user: sanitizeUserRow(rows[0]) });
  });

  router.patch('/users/:id/password', requireAuth, requireRole('ADMIN'), requireCsrf, async (req, res) => {
    const id = Number(req.params.id);
    const password = String(req.body?.password || '');
    if (!Number.isFinite(id) || password.length < 6) return res.status(400).json({ error: 'Dados inválidos' });

    const hash = await bcrypt.hash(password, 10);

    await pool.query(`UPDATE auth_users SET password_hash=$1 WHERE id=$2`, [hash, id]);
    await pool.query(`DELETE FROM auth_sessions WHERE user_id=$1`, [id]).catch(() => {});
    await auditLog(req, 'user_password_reset', 'ok', { target_user_id: id });

    res.json({ ok: true });
  });

  router.delete('/users/:id', requireAuth, requireRole('ADMIN'), requireCsrf, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    if (req.user?.id === id) return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário' });

    await pool.query(`DELETE FROM auth_users WHERE id=$1`, [id]);
    await auditLog(req, 'user_delete', 'ok', { target_user_id: id });
    res.json({ ok: true });
  });

  router.post('/users/import', requireAuth, requireRole('ADMIN'), requireCsrf, uploadAdminUsers.single('file'), async (req, res) => {
    const usersText = String(req.body?.usersText || '').trim();
    const fileBuf = req.file?.buffer;

    let text = usersText;
    if (!text && fileBuf) text = fileBuf.toString('utf-8');

    if (!text) return res.status(400).json({ error: 'Envie um arquivo ou cole o texto para importação.' });

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return res.status(400).json({ error: 'Arquivo/vazio.' });

    const startIdx = lines[0].toLowerCase().startsWith('nome;email;senha') ? 1 : 0;

    const results = { total: 0, createdOrUpdated: 0, errors: [] };

    for (let i = startIdx; i < lines.length; i++) {
      results.total++;

      const parts = lines[i].split(';');
      const name = String(parts[0] || '').trim();
      const email = String(parts[1] || '').trim().toLowerCase();
      const pass = String(parts[2] || '');
      const role = normalizeRole(parts[3] || 'USER');

      if (!name || !isValidEmail(email) || pass.length < 6) {
        results.errors.push({ line: i + 1, error: 'Linha inválida (nome/email/senha/role)', raw: lines[i] });
        continue;
      }

      const hash = await bcrypt.hash(pass, 10);

      await pool.query(
        `INSERT INTO auth_users (name, email, password_hash, role, is_active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (email)
         DO UPDATE SET
           name=EXCLUDED.name,
           password_hash=EXCLUDED.password_hash,
           role=EXCLUDED.role,
           is_active=true`,
        [name, email, hash, role]
      );

      results.createdOrUpdated++;
    }

    await auditLog(req, 'users_import', results.errors.length ? 'error' : 'ok', { ...results });
    res.json(results);
  });

  router.get('/audit-logs', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const action = String(req.query?.action || '').trim();
    const username = String(req.query?.username || req.query?.email || '').trim().toLowerCase();
    const startDate = String(req.query?.startDate || '').trim();
    const endDate = String(req.query?.endDate || '').trim();

    const params = [];
    const where = [];

    if (action) { params.push(`%${action}%`); where.push(`action ILIKE $${params.length}`); }
    if (username) { params.push(`%${username}%`); where.push(`(email ILIKE $${params.length})`); }
    if (startDate) { params.push(startDate); where.push(`created_at >= ($${params.length}::date)`); }
    if (endDate) { params.push(endDate); where.push(`created_at < (($${params.length}::date) + INTERVAL '1 day')`); }

    const sql = `
      SELECT id, created_at, user_id, email, action, status, ip, user_agent, meta
      FROM audit_logs
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC
      LIMIT 500
    `;
    const { rows } = await pool.query(sql, params);

    res.json({ logs: rows });
  });

  router.get('/users/:id/permissions', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'ID inválido' });

    const { rows } = await pool.query(
      `SELECT perm FROM auth_user_permissions WHERE user_id = $1 ORDER BY perm ASC`,
      [userId]
    );

    return res.json({ userId, permissions: rows.map((r) => r.perm) });
  });

  router.put('/users/:id/permissions', requireAuth, requireRole('ADMIN'), requireCsrf, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'ID inválido' });

    const permissionsRaw = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const permissions = [...new Set(permissionsRaw.map((p) => String(p || '').trim()).filter((p) => TOOL_PERM_RE.test(p)))];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM auth_user_permissions WHERE user_id = $1`, [userId]);
      for (const perm of permissions) {
        await client.query(
          `INSERT INTO auth_user_permissions (user_id, perm) VALUES ($1, $2) ON CONFLICT (user_id, perm) DO NOTHING`,
          [userId, perm]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await auditLog(req, 'user_permissions_update', 'ok', { target_user_id: userId, permissions_count: permissions.length });
    return res.json({ ok: true, userId, permissions });
  });

  return router;
};
