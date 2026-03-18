const express = require('express');

function normalizeRequestType(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'INCLUSAO' || raw === 'EXCLUSAO') return raw;
  return null;
}

function normalizeStatus(value) {
  const s = String(value || '').trim().toUpperCase();
  if (s === 'PENDENTE' || s === 'CONCLUIDO') return s;
  return null;
}

function mapRow(row) {
  return {
    id: row.id,
    requestType: row.request_type,
    companyName: row.company_name,
    requesterFullName: row.requester_full_name,
    requesterLogin: row.requester_login,
    requesterEmail: row.requester_email,
    requestDetails: row.request_details,
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

async function sendConclusionEmail({ mailer, to, fullName, companyName, requestType, requestDetails, requestId }) {
  if (!mailer?.enabled || typeof mailer.sendMail !== 'function') {
    return { sent: false, error: mailer?.reason || 'E-mail indisponível.' };
  }

  if (!to) {
    return { sent: false, error: 'Solicitante sem e-mail cadastrado.' };
  }

  const isExclusao = requestType === 'EXCLUSAO';
  const assunto = isExclusao
    ? `Exclusão concluída - ${companyName}`
    : `Inclusão concluída - ${companyName}`;
  const textoPrincipal = isExclusao
    ? `A empresa ${companyName} foi excluída com sucesso.`
    : `A empresa ${companyName} foi adicionada com sucesso.`;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111827">
      <p>Olá, ${fullName}.</p>
      <p>${textoPrincipal}</p>
      <p>Pedido: ${requestId}.</p>
    </div>
  `;

  const text = [
    `Olá, ${fullName}.`,
    textoPrincipal,
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

module.exports = function createPedidosInclusaoExclusaoEmpresaRoutes(deps) {
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
      const type = normalizeRequestType(req.query?.type);
      const status = normalizeStatus(req.query?.status);
      const params = [];
      const where = [];

      if (type) {
        params.push(type);
        where.push(`request_type = $${params.length}`);
      }
      if (status) {
        params.push(status);
        where.push(`status = $${params.length}`);
      }

      const sql = `
        SELECT
          id,
          request_type,
          company_name,
          requester_full_name,
          requester_login,
          requester_email,
          request_details,
          status,
          created_at,
          completed_at,
          email_sent_at,
          email_error
        FROM company_include_exclude_requests
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT 500
      `;

      const { rows } = await pool.query(sql, params);
      return res.json({ requests: rows.map(mapRow) });
    } catch (e) {
      console.error('include/exclude list error:', e?.message || e);
      return res.status(500).json({ error: 'Erro ao listar pedidos.' });
    }
  });

  router.post('/', requireCsrf, async (req, res) => {
    const requestType = normalizeRequestType(req.body?.requestType);
    const companyName = String(req.body?.companyName || '').trim();
    const requestDetails = String(req.body?.requestDetails || '').trim();

    const requesterFullName = String(req.user?.name || '').trim();
    const requesterLogin = String(req.user?.email || req.user?.name || '').trim();
    const requesterEmail = String(req.user?.email || '').trim();

    if (!requestType) {
      return res.status(400).json({ error: 'Tipo de pedido invalido.' });
    }

    if (!companyName) {
      return res.status(400).json({ error: 'Informe o nome da empresa.' });
    }

    if (!requesterFullName || !requesterLogin || !requesterEmail) {
      return res.status(400).json({ error: 'Conta sem dados suficientes para auditoria.' });
    }

    if (companyName.length > 180 || requestDetails.length > 4000) {
      return res.status(400).json({ error: 'Dados acima do limite permitido.' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO company_include_exclude_requests
          (request_type, company_name, requester_full_name, requester_login, requester_email, request_details, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING
          id,
          request_type,
          company_name,
          requester_full_name,
          requester_login,
          requester_email,
          request_details,
          status,
          created_at,
          completed_at,
          email_sent_at,
          email_error`,
        [
          requestType,
          companyName,
          requesterFullName,
          requesterLogin,
          requesterEmail,
          requestDetails || null,
          'PENDENTE',
        ]
      );

      const action = requestType === 'INCLUSAO'
        ? 'company_include_request_create'
        : 'company_exclude_request_create';

      await auditLog(req, action, 'ok', {
        request_id: rows[0]?.id,
        request_type: requestType,
        company_name: companyName,
      });

      return res.status(201).json({ request: mapRow(rows[0]) });
    } catch (e) {
      console.error('include/exclude create error:', e?.message || e);
      await auditLog(req, 'company_include_exclude_request_create', 'error', {
        request_type: requestType,
        reason: 'server_error',
      });
      return res.status(500).json({ error: 'Erro ao registrar pedido.' });
    }
  });

  router.patch('/:id/concluir', requireRole('ADMIN'), requireCsrf, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    try {
      const upd = await pool.query(
        `UPDATE company_include_exclude_requests
         SET status='CONCLUIDO', completed_at=NOW()
         WHERE id=$1 AND status='PENDENTE'
         RETURNING
          id,
          request_type,
          company_name,
          requester_full_name,
          requester_login,
          requester_email,
          request_details,
          status,
          created_at,
          completed_at,
          email_sent_at,
          email_error`,
        [id]
      );

      if (!upd.rows.length) {
        const existing = await pool.query(
          `SELECT id, status FROM company_include_exclude_requests WHERE id=$1 LIMIT 1`,
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
        requestType: row.request_type,
        requestDetails: row.request_details,
        requestId: row.id,
      });

      const savedEmail = await pool.query(
        `UPDATE company_include_exclude_requests
         SET email_sent_at = CASE WHEN $2::boolean THEN NOW() ELSE NULL END,
             email_error = $3
         WHERE id = $1
         RETURNING
          id,
          request_type,
          company_name,
          requester_full_name,
          requester_login,
          requester_email,
          request_details,
          status,
          created_at,
          completed_at,
          email_sent_at,
          email_error`,
        [id, emailResult.sent, emailResult.error]
      );

      const action = row.request_type === 'EXCLUSAO'
        ? 'company_exclude_request_complete'
        : 'company_include_request_complete';

      await auditLog(req, action, emailResult.sent ? 'ok' : 'error', {
        request_id: id,
        request_type: row.request_type,
        email_sent: emailResult.sent,
        email_error: emailResult.error,
      });

      return res.json({
        ok: true,
        request: mapRow(savedEmail.rows[0] || row),
        email: emailResult,
      });
    } catch (e) {
      console.error('include/exclude conclude error:', e?.message || e);
      await auditLog(req, 'company_include_exclude_request_complete', 'error', {
        request_id: id,
        reason: 'server_error',
      });
      return res.status(500).json({ error: 'Erro ao concluir pedido.' });
    }
  });

  return router;
};
