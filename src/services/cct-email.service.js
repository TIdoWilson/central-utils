const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

function safeString(value) {
  return String(value || '').trim();
}

function parseList(value, fallback = []) {
  const raw = safeString(value);
  if (!raw) return Array.isArray(fallback) ? fallback.slice() : [];
  return raw
    .split(/[,\n;]+/)
    .map((item) => safeString(item))
    .filter(Boolean);
}

function formatDateBR(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
}

function formatConventionBlock(item) {
  const prefixo = safeString(item?.prefixo) || 'Convencao sem prefixo';
  const numeroRegistro = safeString(item?.numeroRegistro) || safeString(item?.numero_registro) || '-';
  const sindicatos = Array.isArray(item?.sindicatosCelebrantes)
    ? item.sindicatosCelebrantes
    : Array.isArray(item?.sindicatos_celebrantes)
      ? item.sindicatos_celebrantes
      : [];
  const sindicatoLines = sindicatos.length
    ? sindicatos.map((entry) => {
      const nome = safeString(entry?.nome);
      const cnpj = safeString(entry?.cnpj);
      if (nome && cnpj) return `- ${nome} (${cnpj})`;
      if (nome) return `- ${nome}`;
      if (cnpj) return `- ${cnpj}`;
      return '- Sem sindicato informado';
    }).join('\n')
    : '- Sem sindicato informado';
  const dataBase = safeString(item?.dataBase) || safeString(item?.data_base) || '-';
  const prazoOposicao = safeString(item?.prazoOposicao?.data)
    || safeString(item?.prazo_oposicao?.data)
    || '-';

  return [
    `${prefixo} (${numeroRegistro})`,
    'sindicatos inclusos:',
    sindicatoLines,
    `data base: ${dataBase}`,
    `prazo de oposição: ${prazoOposicao}`,
  ].join('\n');
}

function buildEmailBody({ siteUrl, conventions = [] }) {
  const blocks = conventions.map(formatConventionBlock).join('\n\n');
  return [
    `Link para o site: ${siteUrl}`,
    '',
    blocks || 'Nenhuma convencao localizada nesta execucao.',
  ].join('\n');
}

function buildEmailHtml({ siteUrl, conventions = [] }) {
  const blocks = conventions.length
    ? conventions.map((item) => {
      const block = formatConventionBlock(item)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return `<div style="margin:0 0 20px;padding:12px 14px;border:1px solid #d8d8d8;border-radius:10px;background:#fff"><div style="font-weight:700;margin-bottom:8px">${block}</div></div>`;
    }).join('')
    : '<p>Nenhuma convencao localizada nesta execucao.</p>';

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111">
      <p>Link para o site: <a href="${siteUrl}">${siteUrl}</a></p>
      ${blocks}
    </div>
  `;
}

function createCctEmailService(deps = {}) {
  const projectRoot = safeString(deps.projectRoot || process.env.CCT_PROJECT_ROOT || path.join(__dirname, '..', '..'));
  const emailListPath = safeString(
    deps.emailListPath
      || process.env.CCT_EMAIL_LIST_PATH
      || path.join(projectRoot, 'data', 'cct', 'email.txt'),
  );
  const host = safeString(
    deps.host
      || process.env.CCT_SMTP_HOST
      || process.env.EMAIL_HOST
      || '',
  );
  const port = Number(
    deps.port
      || process.env.CCT_SMTP_PORT
      || process.env.EMAIL_PORT
      || 0,
  );
  const secure = deps.secure === undefined
    ? Number(port) === 465
    : !!deps.secure;
  const user = safeString(
    deps.user
      || process.env.CCT_SMTP_USER
      || process.env.EMAIL_USER
      || '',
  );
  const pass = safeString(
    deps.pass
      || process.env.CCT_SMTP_PASS
      || process.env.EMAIL_PASS
      || '',
  );
  const from = safeString(
    deps.from
      || process.env.CCT_EMAIL_FROM
      || process.env.EMAIL_FROM
      || user,
  );
  const siteUrl = safeString(deps.siteUrl || process.env.CCT_SITE_URL || '');
  const errorRecipient = safeString(
    deps.errorRecipient
      || process.env.CCT_ERROR_RECIPIENT
      || process.env.EMAIL_ADMIN
      || '',
  );
  const enabled = !!(host && port && user && pass);

  const transporter = enabled
    ? nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    })
    : null;

  async function readRecipientsFromFile() {
    if (!emailListPath) return [];
    try {
      const content = await fs.promises.readFile(emailListPath, 'utf8');
      return parseList(content);
    } catch (_) {
      return [];
    }
  }

  async function verify() {
    if (!transporter) {
      return { enabled: false };
    }
    await transporter.verify();
    return { enabled: true };
  }

  async function sendMail({ subject, text, html, to: mailTo, cc: mailCc } = {}) {
    if (!transporter) {
      return { sent: false, reason: 'smtp not configured' };
    }

    const targetTo = Array.isArray(mailTo) ? mailTo : parseList(mailTo);
    const targetCc = Array.isArray(mailCc) ? mailCc : parseList(mailCc);
    const finalTo = targetTo.length ? targetTo : await readRecipientsFromFile();
    const finalCc = targetCc;
    if (!finalTo.length) {
      return { sent: false, reason: 'no recipients' };
    }

    const response = await transporter.sendMail({
      from,
      to: finalTo,
      cc: finalCc,
      subject,
      text,
      html,
    });

    return { sent: true, messageId: response?.messageId || '' };
  }

  async function sendScheduledConventionEmail({ conventions = [], startedAt = new Date() } = {}) {
    const items = Array.isArray(conventions) ? conventions.filter(Boolean) : [];
    if (!items.length) {
      return { sent: false, reason: 'no conventions' };
    }

    const subjectDate = formatDateBR(startedAt) || formatDateBR(new Date());
    const subject = `CCT - Convencoes localizadas em ${subjectDate}`;
    const text = buildEmailBody({ siteUrl, conventions: items });
    const html = buildEmailHtml({ siteUrl, conventions: items });
    return sendMail({ subject, text, html });
  }

  async function sendTestEmail({ subject, text, html, to: mailTo, cc: mailCc } = {}) {
    const mailSubject = subject || 'CCT - Teste de SMTP';
    const mailText = text || buildEmailBody({ siteUrl, conventions: [] });
    const mailHtml = html || buildEmailHtml({ siteUrl, conventions: [] });
    return sendMail({
      subject: mailSubject,
      text: mailText,
      html: mailHtml,
      to: mailTo,
      cc: mailCc,
    });
  }

  async function sendErrorEmail({ title = 'Erro na busca CCT', error = '', context = '', startedAt = new Date() } = {}) {
    if (!transporter) {
      return { sent: false, reason: 'smtp not configured' };
    }

    const subjectDate = formatDateBR(startedAt) || formatDateBR(new Date());
    const subject = `${title} em ${subjectDate}`;
    const text = [
      `Erro detectado: ${safeString(title)}`,
      `Data: ${subjectDate}`,
      context ? `Contexto: ${safeString(context)}` : '',
      error ? `Detalhe: ${safeString(error)}` : '',
    ].filter(Boolean).join('\n');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">${safeString(title)}</h2>
        <p><strong>Data:</strong> ${subjectDate}</p>
        ${context ? `<p><strong>Contexto:</strong> ${safeString(context)}</p>` : ''}
        ${error ? `<pre style="white-space:pre-wrap;background:#f7f7f7;border:1px solid #ddd;padding:12px;border-radius:10px">${safeString(error)}</pre>` : ''}
      </div>
    `;

    return sendMail({
      subject,
      text,
      html,
      to: [errorRecipient],
    });
  }

  return {
    enabled,
    verify,
    sendMail,
    sendScheduledConventionEmail,
    sendTestEmail,
    sendErrorEmail,
    readRecipientsFromFile,
    buildEmailBody,
    buildEmailHtml,
  };
}

module.exports = {
  createCctEmailService,
  __private: {
    formatConventionBlock,
    buildEmailBody,
    buildEmailHtml,
    parseList,
  },
};
