const express = require('express');

const TOOL_PERM_RE = /^tool:[A-Za-z0-9._-]+$|^tool:\*$/;
const REQUEST_SOURCE_CONFIG = {
  alteracao: {
    table: 'company_change_requests',
    detailsColumn: 'change_description',
    select: `
      SELECT
        id,
        'alteracao'::text AS source,
        'ALTERACAO'::text AS request_type,
        company_name,
        requester_full_name,
        requester_login,
        requester_email,
        change_description AS details,
        status,
        created_at
      FROM company_change_requests
    `,
  },
  inclusao_exclusao: {
    table: 'company_include_exclude_requests',
    detailsColumn: 'request_details',
    select: `
      SELECT
        id,
        'inclusao_exclusao'::text AS source,
        request_type,
        company_name,
        requester_full_name,
        requester_login,
        requester_email,
        request_details AS details,
        status,
        created_at
      FROM company_include_exclude_requests
    `,
  },
};

function normalizeDecision(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'confirmar' || s === 'aprovar') return 'confirmar';
  if (s === 'negar' || s === 'reprovar') return 'negar';
  return null;
}

function buildMailerFromEnv() {
  const host = String(process.env.EMAIL_HOST || '').trim();
  const portRaw = String(process.env.EMAIL_PORT || '').trim();
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '').trim();
  const from = String(process.env.EMAIL_FROM || user || '').trim();

  if (!host || !portRaw || !user || !pass || !from) {
    return { enabled: false, from, sendMail: null, reason: 'Configurações de e-mail ausentes.' };
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    return { enabled: false, from, sendMail: null, reason: 'EMAIL_PORT inválido.' };
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_) {
    return { enabled: false, from, sendMail: null, reason: 'Dependência nodemailer não instalada.' };
  }

  const secureEnv = String(process.env.EMAIL_SECURE || '').trim().toLowerCase();
  const secure = ['1', 'true', 'yes', 'on'].includes(secureEnv) || port === 465;
  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return { enabled: true, from, sendMail: async (opts) => transporter.sendMail(opts), reason: null };
}

function buildDecisionEmailTemplate({ source, requestType, decision, companyName }) {
  const approved = decision === 'confirmar';

  if (source === 'alteracao') {
    return approved
      ? {
          subject: `Alteração concluída - ${companyName}`,
          text: `A modificação solicitada para a empresa ${companyName} foi concluída com sucesso.`,
        }
      : {
          subject: `Alteração não aprovada - ${companyName}`,
          text: `A modificação solicitada para a empresa ${companyName} não foi aprovada.`,
        };
  }

  if (String(requestType || '').toUpperCase() === 'EXCLUSAO') {
    return approved
      ? {
          subject: `Exclusão concluída - ${companyName}`,
          text: `A empresa ${companyName} foi excluída com sucesso.`,
        }
      : {
          subject: `Exclusão não aprovada - ${companyName}`,
          text: `A empresa ${companyName} não foi excluída.`,
        };
  }

  return approved
    ? {
        subject: `Inclusão concluída - ${companyName}`,
        text: `A empresa ${companyName} foi adicionada com sucesso.`,
      }
    : {
        subject: `Inclusão não aprovada - ${companyName}`,
        text: `A empresa ${companyName} não foi adicionada.`,
      };
}

async function sendDecisionEmail({ mailer, to, fullName, source, requestType, decision, companyName, details, requestId }) {
  if (!mailer?.enabled || typeof mailer.sendMail !== 'function') {
    return { sent: false, error: mailer?.reason || 'E-mail indisponível.' };
  }
  if (!to) return { sent: false, error: 'Solicitante sem e-mail cadastrado.' };

  const template = buildDecisionEmailTemplate({ source, requestType, decision, companyName });
  const subject = template.subject;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111827">
      <p>Olá, ${fullName}.</p>
      <p>${template.text}</p>
      <p>Pedido: ${requestId}.</p>
    </div>
  `;
  const text = [
    `Olá, ${fullName}.`,
    template.text,
    `Pedido: ${requestId}.`,
  ].join('\n');

  try {
    await mailer.sendMail({ from: mailer.from, to, subject, text, html });
    return { sent: true, error: null };
  } catch (e) {
    return { sent: false, error: e?.message || 'Falha ao enviar e-mail.' };
  }
}

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
  const mailer = buildMailerFromEnv();

  router.get('/users', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.role,
         u.is_active,
         u.created_at,
         u.last_login_at,
         COALESCE(ARRAY_AGG(p.perm) FILTER (WHERE p.perm IS NOT NULL), '{}') AS permissions
       FROM auth_users u
       LEFT JOIN auth_user_permissions p ON p.user_id = u.id
       GROUP BY u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.last_login_at
       ORDER BY u.id DESC`
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

  router.get('/dashboard-metrics', requireAuth, requireRole('ADMIN'), async (req, res) => {
    try {
      const processingActionWhitelist = [
        'pdfa_convert',
        'dimob_parse_sped',
        'office_companies_import_manual',
        'office_companies_import_file',
        'office_companies_refresh',
        'office_companies_refresh_all',
      ];

      const processingSql = `
        WITH processing_logs AS (
          SELECT status
          FROM audit_logs
          WHERE status IN ('ok', 'error')
            AND action NOT LIKE 'page_view_%'
            AND action NOT IN ('login_success', 'login_failed', 'logout')
            AND (
              action LIKE 'job_create_%'
              OR action LIKE 'job_error_%'
              OR action = ANY($1::text[])
              OR (
                meta IS NOT NULL
                AND (
                  meta ? 'files'
                  OR meta ? 'file'
                  OR meta ? 'fileId'
                  OR meta ? 'filename'
                  OR meta ? 'arquivo'
                  OR meta ? 'jobId'
                )
              )
            )
        )
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE status = 'ok')::bigint AS success,
          COUNT(*) FILTER (WHERE status = 'error')::bigint AS error
        FROM processing_logs
      `;

      const accessTotalsSql = `
        SELECT
          COUNT(*) FILTER (WHERE action LIKE 'page_view_%')::bigint AS total,
          COUNT(*) FILTER (
            WHERE action LIKE 'page_view_%'
              AND created_at >= (NOW() - INTERVAL '7 day')
          )::bigint AS last_7_days
        FROM audit_logs
      `;

      const accessPerDaySql = `
        WITH days AS (
          SELECT (date_trunc('day', NOW()) - (offs * INTERVAL '1 day'))::date AS day
          FROM generate_series(6, 0, -1) AS offs
        ),
        hits AS (
          SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::bigint AS accesses
          FROM audit_logs
          WHERE action LIKE 'page_view_%'
            AND created_at >= (date_trunc('day', NOW()) - INTERVAL '6 day')
          GROUP BY 1
        )
        SELECT
          TO_CHAR(days.day, 'YYYY-MM-DD') AS day,
          COALESCE(hits.accesses, 0)::bigint AS accesses
        FROM days
        LEFT JOIN hits ON hits.day = days.day
        ORDER BY days.day ASC
      `;

      const accessByUserSql = `
        SELECT
          COALESCE(NULLIF(u.name, ''), NULLIF(split_part(a.email, '@', 1), ''), 'Usuário removido') AS user_name,
          COALESCE(NULLIF(a.email, ''), NULLIF(u.email, ''), 'sem-email') AS email,
          COUNT(*)::bigint AS accesses_total,
          COUNT(*) FILTER (
            WHERE a.created_at >= (NOW() - INTERVAL '7 day')
          )::bigint AS accesses_last_7_days,
          MAX(a.created_at) AS last_access_at
        FROM audit_logs a
        LEFT JOIN auth_users u ON u.id = a.user_id
        WHERE a.action LIKE 'page_view_%'
        GROUP BY 1, 2
        ORDER BY accesses_total DESC, accesses_last_7_days DESC, email ASC
        LIMIT 200
      `;

      const [
        processingResp,
        accessTotalsResp,
        accessPerDayResp,
        accessByUserResp,
      ] = await Promise.all([
        pool.query(processingSql, [processingActionWhitelist]),
        pool.query(accessTotalsSql),
        pool.query(accessPerDaySql),
        pool.query(accessByUserSql),
      ]);

      const processingRow = processingResp.rows?.[0] || {};
      const totalProcessing = Number(processingRow.total || 0);
      const successProcessing = Number(processingRow.success || 0);
      const errorProcessing = Number(processingRow.error || 0);
      const errorPercent = totalProcessing > 0
        ? Number(((errorProcessing * 100) / totalProcessing).toFixed(2))
        : 0;
      const successPercent = totalProcessing > 0
        ? Number(((successProcessing * 100) / totalProcessing).toFixed(2))
        : 0;

      const accessTotalsRow = accessTotalsResp.rows?.[0] || {};
      const totalAccesses = Number(accessTotalsRow.total || 0);
      const last7DaysAccesses = Number(accessTotalsRow.last_7_days || 0);

      const accessesByDay = (accessPerDayResp.rows || []).map((row) => ({
        day: String(row.day || ''),
        accesses: Number(row.accesses || 0),
      }));

      const accessesByUser = (accessByUserResp.rows || []).map((row) => ({
        userName: String(row.user_name || 'Usuário removido'),
        email: String(row.email || 'sem-email'),
        accessesTotal: Number(row.accesses_total || 0),
        accessesLast7Days: Number(row.accesses_last_7_days || 0),
        lastAccessAt: row.last_access_at || null,
      }));

      return res.json({
        processing: {
          total: totalProcessing,
          success: successProcessing,
          error: errorProcessing,
          errorPercent,
          successPercent,
        },
        accesses: {
          total: totalAccesses,
          last7Days: last7DaysAccesses,
          byDay: accessesByDay,
          byUser: accessesByUser,
        },
      });
    } catch (e) {
      console.error('admin dashboard metrics error:', e?.message || e);
      return res.status(500).json({ error: 'Erro ao carregar métricas do dashboard.' });
    }
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

  router.get('/company-requests', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const source = String(req.query?.source || '').trim().toLowerCase();
    try {
      if (source && REQUEST_SOURCE_CONFIG[source]) {
        const cfg = REQUEST_SOURCE_CONFIG[source];
        const { rows } = await pool.query(`${cfg.select} ORDER BY created_at DESC LIMIT 500`);
        return res.json({ requests: rows });
      }

      const unionSql = `
        ${REQUEST_SOURCE_CONFIG.alteracao.select}
        UNION ALL
        ${REQUEST_SOURCE_CONFIG.inclusao_exclusao.select}
        ORDER BY created_at DESC
        LIMIT 1000
      `;
      const { rows } = await pool.query(unionSql);
      return res.json({ requests: rows });
    } catch (e) {
      console.error('admin company requests list error:', e?.message || e);
      return res.status(500).json({ error: 'Erro ao listar pedidos de empresa.' });
    }
  });


  router.patch('/company-requests/:source/:id/decision', requireAuth, requireRole('ADMIN'), requireCsrf, async (req, res) => {
    const source = String(req.params.source || '').trim().toLowerCase();
    const id = Number(req.params.id);
    const decision = normalizeDecision(req.body?.decision);
    const cfg = REQUEST_SOURCE_CONFIG[source];

    if (!cfg) return res.status(400).json({ error: 'Origem inválida.' });
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
    if (!decision) return res.status(400).json({ error: 'Decisão inválida.' });

    try {
      const { rows } = await pool.query(
        `UPDATE ${cfg.table}
         SET status=$2, completed_at=NOW()
         WHERE id=$1 AND status='PENDENTE'
         RETURNING id, company_name, requester_full_name, requester_login, requester_email, ${cfg.detailsColumn} AS details, request_type`,
        [id, decision === 'confirmar' ? 'CONCLUIDO' : 'NEGADO']
      );

      if (!rows.length) {
        const check = await pool.query(`SELECT id, status FROM ${cfg.table} WHERE id=$1 LIMIT 1`, [id]);
        if (!check.rows.length) return res.status(404).json({ error: 'Pedido não encontrado.' });
        return res.status(409).json({ error: 'Pedido já foi decidido anteriormente.' });
      }

      const row = rows[0];
      const emailResult = await sendDecisionEmail({
        mailer,
        to: row.requester_email,
        fullName: row.requester_full_name,
        source,
        requestType: row.request_type,
        decision,
        companyName: row.company_name,
        details: row.details,
        requestId: row.id,
      });

      await pool.query(
        `UPDATE ${cfg.table}
         SET email_sent_at = CASE WHEN $2::boolean THEN NOW() ELSE NULL END,
             email_error = $3
         WHERE id = $1`,
        [id, emailResult.sent, emailResult.error]
      );

      await auditLog(req, 'company_request_decision', emailResult.sent ? 'ok' : 'error', {
        source,
        request_id: id,
        decision,
        company_name: row.company_name,
        requester_login: row.requester_login,
        email_sent: emailResult.sent,
        email_error: emailResult.error,
      });

      return res.json({
        ok: true,
        source,
        id,
        decision,
        status: decision === 'confirmar' ? 'CONCLUIDO' : 'NEGADO',
        email: emailResult,
      });
    } catch (e) {
      console.error('admin company request decision error:', e?.message || e);
      await auditLog(req, 'company_request_decision', 'error', { source, request_id: id, decision, reason: 'server_error' });
      return res.status(500).json({ error: 'Erro ao processar decisão do pedido.' });
    }
  });

  return router;
};

