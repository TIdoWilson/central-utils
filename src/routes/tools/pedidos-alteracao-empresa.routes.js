const express = require('express');

function normalizeStatus(value) {
  const s = String(value || '').trim().toUpperCase();
  if (s === 'PENDENTE' || s === 'CONCLUIDO') return s;
  return null;
}

function mapRequestRow(row) {
  return {
    id: row.id,
    companyName: row.company_name,
    fullName: row.requester_full_name,
    requesterLogin: row.requester_login,
    requesterEmail: row.requester_email,
    changeDescription: row.change_description,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    emailSentAt: row.email_sent_at,
    emailError: row.email_error,
  };
}

function buildMailerFromEnv() {
  const host = String(process.env.EMAIL_HOST || '').trim();
  const portRaw = String(process.env.EMAIL_PORT || '').trim();
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '').trim();
  const from = String(process.env.EMAIL_FROM || user || '').trim();

  if (!host || !portRaw || !user || !pass || !from) {
    return {
      enabled: false,
      from,
      sendMail: null,
      reason: 'Configurações de e-mail não encontradas (EMAIL_HOST/PORT/USER/PASS/FROM).',
    };
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    return {
      enabled: false,
      from,
      sendMail: null,
      reason: 'EMAIL_PORT inválido.',
    };
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_) {
    return {
      enabled: false,
      from,
      sendMail: null,
      reason: 'Dependência nodemailer não instalada.',
    };
  }

  const secureEnv = String(process.env.EMAIL_SECURE || '').trim().toLowerCase();
  const secure = ['1', 'true', 'yes', 'on'].includes(secureEnv) || port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return {
    enabled: true,
    from,
    sendMail: async (options) => transporter.sendMail(options),
    reason: null,
  };
}

async function sendConclusionEmail({ mailer, to, fullName, companyName, changeDescription, requestId }) {
  if (!mailer?.enabled || typeof mailer.sendMail !== 'function') {
    return { sent: false, error: mailer?.reason || 'E-mail indisponível.' };
  }

  if (!to) {
    return { sent: false, error: 'Solicitante sem e-mail cadastrado.' };
  }

  const assunto = `Alteração concluída - ${companyName}`;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111827">
      <p>Olá, ${fullName}.</p>
      <p>A modificação solicitada para a empresa ${companyName} foi concluída com sucesso.</p>
      <p>Pedido: ${requestId}.</p>
    </div>
  `;

  const text = [
    `Olá, ${fullName}.`,
    `A modificação solicitada para a empresa ${companyName} foi concluída com sucesso.`,
    `Pedido: ${requestId}.`,
  ].join('\n');

  try {
    await mailer.sendMail({
      from: mailer.from,
      to,
      subject: assunto,
      text,
      html,
    });
    return { sent: true, error: null };
  } catch (e) {
    return { sent: false, error: e?.message || 'Falha ao enviar e-mail.' };
  }
}

module.exports = function createPedidosAlteracaoEmpresaRoutes(deps) {
  const {
    pool,
    requireCsrf,
    requireRole,
    auditLog,
  } = deps;

  const router = express.Router();
  const mailer = buildMailerFromEnv();

  router.get('/', async (req, res) => {
    try {
      const status = normalizeStatus(req.query?.status);
      const where = [];
      const params = [];

      if (status) {
        params.push(status);
        where.push(`status = $${params.length}`);
      }

      const sql = `
        SELECT
          id,
          company_name,
          requester_full_name,
          requester_login,
          requester_email,
          change_description,
          status,
          created_at,
          completed_at,
          email_sent_at,
          email_error
        FROM company_change_requests
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT 500
      `;

      const { rows } = await pool.query(sql, params);
      return res.json({ requests: rows.map(mapRequestRow) });
    } catch (e) {
      console.error('company change request list error:', e?.message || e);
      return res.status(500).json({ error: 'Erro ao listar pedidos.' });
    }
  });

  router.post('/', requireCsrf, async (req, res) => {
    const companyName = String(req.body?.companyName || '').trim();
    const fullName = String(req.body?.fullName || '').trim();
    const changeDescription = String(req.body?.changeDescription || '').trim();
    const requesterLogin = String(req.user?.email || req.user?.name || '').trim();
    const requesterEmail = String(req.user?.email || '').trim();

    if (!companyName || !fullName || !changeDescription) {
      return res.status(400).json({ error: 'Preencha empresa, nome completo e alteração necessária.' });
    }

    if (!requesterLogin || !requesterEmail) {
      return res.status(400).json({ error: 'Usuário sem login/e-mail válido para registrar o pedido.' });
    }

    if (companyName.length > 180 || fullName.length > 180 || changeDescription.length > 4000) {
      return res.status(400).json({ error: 'Dados fora do limite permitido.' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO company_change_requests
          (company_name, requester_full_name, requester_login, requester_email, change_description, status)
         VALUES ($1,$2,$3,$4,$5,'PENDENTE')
         RETURNING
          id,
          company_name,
          requester_full_name,
          requester_login,
          requester_email,
          change_description,
          status,
          created_at,
          completed_at,
          email_sent_at,
          email_error`,
        [companyName, fullName, requesterLogin, requesterEmail, changeDescription]
      );

      const created = rows[0];
      await auditLog(req, 'company_change_request_create', 'ok', {
        request_id: created?.id,
        company_name: companyName,
      });

      return res.status(201).json({ request: mapRequestRow(created) });
    } catch (e) {
      console.error('company change request create error:', e?.message || e);
      await auditLog(req, 'company_change_request_create', 'error', {
        reason: 'server_error',
      });
      return res.status(500).json({ error: 'Erro ao criar pedido.' });
    }
  });

  router.patch('/:id/concluir', requireRole('ADMIN'), requireCsrf, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    try {
      const upd = await pool.query(
        `UPDATE company_change_requests
         SET status='CONCLUIDO', completed_at=NOW()
         WHERE id=$1 AND status='PENDENTE'
         RETURNING
          id,
          company_name,
          requester_full_name,
          requester_login,
          requester_email,
          change_description,
          status,
          created_at,
          completed_at,
          email_sent_at,
          email_error`,
        [id]
      );

      if (!upd.rows.length) {
        const existing = await pool.query(
          `SELECT id, status FROM company_change_requests WHERE id=$1 LIMIT 1`,
          [id]
        );
        if (!existing.rows.length) return res.status(404).json({ error: 'Pedido não encontrado.' });
        return res.status(409).json({ error: 'Pedido já está concluído.' });
      }

      const row = upd.rows[0];
      const emailResult = await sendConclusionEmail({
        mailer,
        to: row.requester_email,
        fullName: row.requester_full_name,
        companyName: row.company_name,
        changeDescription: row.change_description,
        requestId: row.id,
      });

      const savedEmail = await pool.query(
        `UPDATE company_change_requests
         SET email_sent_at = CASE WHEN $2::boolean THEN NOW() ELSE NULL END,
             email_error = $3
         WHERE id = $1
         RETURNING
          id,
          company_name,
          requester_full_name,
          requester_login,
          requester_email,
          change_description,
          status,
          created_at,
          completed_at,
          email_sent_at,
          email_error`,
        [id, emailResult.sent, emailResult.error]
      );

      await auditLog(req, 'company_change_request_complete', emailResult.sent ? 'ok' : 'error', {
        request_id: id,
        email_sent: emailResult.sent,
        email_error: emailResult.error,
      });

      return res.json({
        ok: true,
        request: mapRequestRow(savedEmail.rows[0] || row),
        email: emailResult,
      });
    } catch (e) {
      console.error('company change request conclude error:', e?.message || e);
      await auditLog(req, 'company_change_request_complete', 'error', {
        request_id: id,
        reason: 'server_error',
      });
      return res.status(500).json({ error: 'Erro ao concluir pedido.' });
    }
  });

  return router;
};
