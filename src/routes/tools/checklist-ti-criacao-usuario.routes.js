const express = require('express');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const SYSTEMS = [
  { key: 'emailCorporativo', label: 'E-mail corporativo' },
  { key: 'microsoftTeams', label: 'Microsoft Teams' },
  { key: 'sistemaMonitor', label: 'Sistema Monitor' },
  { key: 'sistemaTareffaIntegrador', label: 'Sistema Tareffa / Integrador' },
  { key: 'sistemaPink', label: 'Sistema Pink' },
  { key: 'usuarioIob', label: 'Usuario IOB', usesIobLogin: true },
];

function cleanText(value, max = 4000) {
  const v = String(value || '').trim();
  return v ? v.slice(0, max) : '';
}

function cleanBool(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function cleanDateIso(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function formatDateBrFromIso(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function isEmail(value) {
  const v = String(value || '').trim().toLowerCase();
  return !!(v && v.includes('@') && v.includes('.') && v.length <= 320);
}

function normalizePasswords(input) {
  const source = (input && typeof input === 'object') ? input : {};
  const out = {};
  for (const s of SYSTEMS) {
    out[s.key] = cleanText(source[s.key], 180);
  }
  return out;
}

function normalizePayload(body) {
  return {
    requestDate: cleanDateIso(body?.requestDate),
    employeeName: cleanText(body?.employeeName, 180),
    cpf: cleanText(body?.cpf, 20),
    department: cleanText(body?.department, 180),
    systemUserEmail: cleanText(body?.systemUserEmail, 320).toLowerCase(),
    userIobLogin: cleanText(body?.userIobLogin, 180),
    machineName: cleanText(body?.machineName, 180),
    sharedFoldersReleased: cleanBool(body?.sharedFoldersReleased),
    printersConfigured: cleanBool(body?.printersConfigured),
    emailSignatureStandardized: cleanBool(body?.emailSignatureStandardized),
    observations: cleanText(body?.observations, 4000),
    systemPasswords: normalizePasswords(body?.systemPasswords),
  };
}

function validateFinalPayload(payload) {
  if (!payload.employeeName) return 'Informe o nome do funcionario.';
  if (!payload.systemUserEmail) return 'Informe o e-mail de usuario.';
  if (!isEmail(payload.systemUserEmail)) return 'E-mail de usuario invalido.';
  if (!payload.userIobLogin) return 'Informe o usuario IOB.';
  return null;
}

function getActorName(req) {
  return cleanText(req.user?.name || req.auth?.user?.name || '', 180) || 'Usuario';
}

function mapRow(row) {
  return {
    id: row.id,
    processNumber: row.process_number,
    requestDate: row.request_date,
    employeeName: row.employee_name,
    cpf: row.cpf,
    department: row.department,
    itResponsible: row.it_responsible,
    systemUserEmail: row.system_user_email,
    userIobLogin: row.user_iob_login,
    systemPasswords: row.system_passwords || {},
    machineName: row.machine_name,
    sharedFoldersReleased: row.shared_folders_released,
    printersConfigured: row.printers_configured,
    emailSignatureStandardized: row.email_signature_standardized,
    observations: row.observations,
    isFinal: !!row.is_final,
    status: row.is_final ? 'FINAL' : 'RASCUNHO',
    finalizedAt: row.finalized_at,
    createdByName: row.created_by_name,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function buildChecklistPdf(payload) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const marginX = 40;
  const maxWidth = 515;
  let y = 800;

  function drawLine(text, options = {}) {
    const size = options.size || 11;
    const f = options.bold ? bold : font;
    page.drawText(String(text || ''), { x: marginX, y, size, font: f });
    y -= options.gap || 16;
  }

  function drawKeyValue(label, value) {
    drawLine(`${label}: ${value || ''}`, { size: 10, gap: 14 });
  }

  function drawMultiline(label, value) {
    drawLine(`${label}:`, { size: 10, bold: true, gap: 13 });
    const words = String(value || '').split(/\s+/).filter(Boolean);
    if (!words.length) {
      drawLine('-', { size: 10, gap: 12 });
      return;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const w = font.widthOfTextAtSize(test, 10);
      if (w > maxWidth && line) {
        drawLine(line, { size: 10, gap: 12 });
        line = word;
      } else {
        line = test;
      }
    }
    if (line) drawLine(line, { size: 10, gap: 12 });
  }

  drawLine('CHECKLIST DE TI - CRIACAO DE USUARIO (FUNCIONARIO NOVO)', { size: 13, bold: true, gap: 22 });
  drawKeyValue('Processo n', payload.processNumber);
  drawKeyValue('Data', formatDateBrFromIso(payload.requestDate));
  drawKeyValue('Nome do funcionario', payload.employeeName);
  drawKeyValue('CPF', payload.cpf);
  drawKeyValue('Setor', payload.department);
  drawKeyValue('Responsavel TI', payload.itResponsible);

  y -= 6;
  drawLine('ACESSOS E CADASTROS DE SISTEMAS', { size: 11, bold: true, gap: 16 });
  SYSTEMS.forEach((system, index) => {
    drawLine(`${index + 1}) ${system.label}`, { size: 10, bold: true, gap: 13 });
    const username = system.usesIobLogin ? payload.userIobLogin : payload.systemUserEmail;
    drawKeyValue('Usuario', username);
    drawKeyValue('Senha provisoria', payload.systemPasswords?.[system.key] || '');
    y -= 3;
  });

  drawLine('EQUIPAMENTOS E ESTRUTURA', { size: 11, bold: true, gap: 16 });
  drawKeyValue('Nome da maquina', payload.machineName);

  y -= 4;
  drawLine('CONTROLES ADICIONAIS', { size: 11, bold: true, gap: 16 });
  drawLine(`[${payload.sharedFoldersReleased ? 'X' : ' '}] Pastas compartilhadas liberadas`, { size: 10, gap: 14 });
  drawLine(`[${payload.printersConfigured ? 'X' : ' '}] Impressoras configuradas`, { size: 10, gap: 14 });
  drawLine(`[${payload.emailSignatureStandardized ? 'X' : ' '}] Assinatura de e-mail padronizada`, { size: 10, gap: 16 });
  drawMultiline('Observacoes', payload.observations);

  return Buffer.from(await pdf.save());
}

function getTodayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

module.exports = function createChecklistTiCriacaoUsuarioRoutes(deps) {
  const { pool, requireCsrf, auditLog } = deps;
  const router = express.Router();

  router.get('/next-process-number', async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT COALESCE(MAX(process_seq), 0) + 1 AS next_seq FROM checklist_ti_user_creation_forms`);
      const nextSeq = Number(rows?.[0]?.next_seq || 1);
      return res.json({ nextSeq, nextProcessNumber: String(nextSeq).padStart(6, '0') });
    } catch (e) {
      console.error('checklist-ti next-process error:', e?.message || e);
      return res.status(500).json({ error: 'Erro ao consultar proximo processo.' });
    }
  });

  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT
          id, process_number, process_seq, request_date, employee_name, cpf, department, it_responsible,
          system_user_email, user_iob_login, system_passwords, machine_name, shared_folders_released, printers_configured,
          email_signature_standardized, observations, is_final, finalized_at, created_by_name, created_by_email,
          created_at, updated_at
         FROM checklist_ti_user_creation_forms
         ORDER BY updated_at DESC
         LIMIT 500`
      );
      return res.json({ documents: rows.map(mapRow) });
    } catch (e) {
      console.error('checklist-ti list error:', e?.message || e);
      return res.status(500).json({ error: 'Erro ao listar documentos.' });
    }
  });

  router.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID invalido.' });
    try {
      const { rows } = await pool.query(
        `SELECT
          id, process_number, process_seq, request_date, employee_name, cpf, department, it_responsible,
          system_user_email, user_iob_login, system_passwords, machine_name, shared_folders_released, printers_configured,
          email_signature_standardized, observations, is_final, finalized_at, created_by_name, created_by_email,
          created_at, updated_at
         FROM checklist_ti_user_creation_forms
         WHERE id=$1
         LIMIT 1`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Documento nao encontrado.' });
      return res.json({ document: mapRow(rows[0]) });
    } catch (e) {
      console.error('checklist-ti get error:', e?.message || e);
      return res.status(500).json({ error: 'Erro ao consultar documento.' });
    }
  });

  router.get('/:id/pdf', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID invalido.' });
    try {
      const { rows } = await pool.query(
        `SELECT is_final, pdf_bytes, pdf_filename
         FROM checklist_ti_user_creation_forms
         WHERE id=$1
         LIMIT 1`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Documento nao encontrado.' });
      if (!rows[0].is_final) return res.status(409).json({ error: 'Rascunho nao possui PDF definitivo.' });

      const fileName = rows[0].pdf_filename || `checklist-ti-criacao-usuario-${id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(rows[0].pdf_bytes);
    } catch (e) {
      console.error('checklist-ti pdf error:', e?.message || e);
      return res.status(500).json({ error: 'Erro ao baixar PDF.' });
    }
  });

  router.post('/draft', requireCsrf, async (req, res) => {
    const payload = normalizePayload(req.body || {});
    try {
      const actorName = getActorName(req);
      const createdByName = actorName;
      const createdByEmail = cleanText(req.user?.email || req.auth?.user?.email || '', 320).toLowerCase() || 'nao-informado@local';

      const { rows } = await pool.query(
        `INSERT INTO checklist_ti_user_creation_forms (
          process_number, request_date, employee_name, cpf, department, it_responsible, system_user_email,
          user_iob_login, system_passwords, machine_name, shared_folders_released, printers_configured, email_signature_standardized,
          observations, pdf_bytes, pdf_filename, created_by_name, created_by_email, is_final
        ) VALUES (
          NULL, $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, '\\x'::bytea, '', $14, $15, false
        )
        RETURNING
          id, process_number, process_seq, request_date, employee_name, cpf, department, it_responsible,
          system_user_email, user_iob_login, system_passwords, machine_name, shared_folders_released, printers_configured,
          email_signature_standardized, observations, is_final, finalized_at, created_by_name, created_by_email,
          created_at, updated_at`,
        [
          payload.requestDate || getTodayIso(),
          payload.employeeName || '',
          payload.cpf || null,
          payload.department || null,
          actorName,
          payload.systemUserEmail || '',
          payload.userIobLogin || '',
          JSON.stringify(payload.systemPasswords || {}),
          payload.machineName || null,
          payload.sharedFoldersReleased,
          payload.printersConfigured,
          payload.emailSignatureStandardized,
          payload.observations || null,
          createdByName,
          createdByEmail,
        ]
      );

      await auditLog(req, 'checklist_ti_user_draft_create', 'ok', { checklist_id: rows[0]?.id });
      return res.status(201).json({ document: mapRow(rows[0]) });
    } catch (e) {
      console.error('checklist-ti draft create error:', e?.message || e);
      return res.status(500).json({ error: 'Erro ao salvar rascunho.' });
    }
  });

  router.put('/:id/draft', requireCsrf, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID invalido.' });
    const payload = normalizePayload(req.body || {});

    try {
      const existing = await pool.query(`SELECT is_final FROM checklist_ti_user_creation_forms WHERE id=$1 LIMIT 1`, [id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Documento nao encontrado.' });
      if (existing.rows[0].is_final) return res.status(409).json({ error: 'Documento finalizado nao pode ser editado.' });

      const { rows } = await pool.query(
        `UPDATE checklist_ti_user_creation_forms
         SET
          request_date=$2,
          employee_name=$3,
          cpf=$4,
          department=$5,
          it_responsible=$6,
          system_user_email=$7,
          user_iob_login=$8,
          system_passwords=$9::jsonb,
          machine_name=$10,
          shared_folders_released=$11,
          printers_configured=$12,
          email_signature_standardized=$13,
          observations=$14,
          updated_at=NOW()
         WHERE id=$1
         RETURNING
          id, process_number, process_seq, request_date, employee_name, cpf, department, it_responsible,
          system_user_email, user_iob_login, system_passwords, machine_name, shared_folders_released, printers_configured,
          email_signature_standardized, observations, is_final, finalized_at, created_by_name, created_by_email,
          created_at, updated_at`,
        [
          id,
          payload.requestDate || getTodayIso(),
          payload.employeeName || '',
          payload.cpf || null,
          payload.department || null,
          getActorName(req),
          payload.systemUserEmail || '',
          payload.userIobLogin || '',
          JSON.stringify(payload.systemPasswords || {}),
          payload.machineName || null,
          payload.sharedFoldersReleased,
          payload.printersConfigured,
          payload.emailSignatureStandardized,
          payload.observations || null,
        ]
      );

      await auditLog(req, 'checklist_ti_user_draft_update', 'ok', { checklist_id: id });
      return res.json({ document: mapRow(rows[0]) });
    } catch (e) {
      console.error('checklist-ti draft update error:', e?.message || e);
      return res.status(500).json({ error: 'Erro ao atualizar rascunho.' });
    }
  });

  router.post('/:id/finalize', requireCsrf, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID invalido.' });

    const payload = normalizePayload(req.body || {});
    const validationError = validateFinalPayload(payload);
    if (validationError) return res.status(400).json({ error: validationError });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(91774321)');

      const current = await client.query(
        `SELECT
          id, process_number, request_date, employee_name, cpf, department, it_responsible, system_user_email,
          user_iob_login, system_passwords, machine_name, shared_folders_released, printers_configured, email_signature_standardized,
          observations, is_final, finalized_at, created_by_name, created_by_email, created_at, updated_at
         FROM checklist_ti_user_creation_forms
         WHERE id=$1
         FOR UPDATE`,
        [id]
      );
      if (!current.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Documento nao encontrado.' });
      }
      if (current.rows[0].is_final) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Documento ja foi finalizado.' });
      }

      const nextSeqRow = await client.query(`SELECT COALESCE(MAX(process_seq), 0) + 1 AS next_seq FROM checklist_ti_user_creation_forms`);
      const nextSeq = Number(nextSeqRow.rows?.[0]?.next_seq || 1);
      const processNumber = String(nextSeq).padStart(6, '0');

      const pdfBytes = await buildChecklistPdf({
        ...payload,
        itResponsible: getActorName(req),
        processNumber,
      });
      const pdfFilename = `checklist-ti-criacao-usuario-${processNumber}.pdf`;

      const finalized = await client.query(
        `UPDATE checklist_ti_user_creation_forms
         SET
          process_seq=$2,
          process_number=$3,
          request_date=$4,
          employee_name=$5,
          cpf=$6,
          department=$7,
          it_responsible=$8,
          system_user_email=$9,
          user_iob_login=$10,
          system_passwords=$11::jsonb,
          machine_name=$12,
          shared_folders_released=$13,
          printers_configured=$14,
          email_signature_standardized=$15,
          observations=$16,
          is_final=true,
          finalized_at=NOW(),
          pdf_bytes=$17,
          pdf_filename=$18,
          updated_at=NOW()
         WHERE id=$1
         RETURNING
          id, process_number, process_seq, request_date, employee_name, cpf, department, it_responsible,
          system_user_email, user_iob_login, system_passwords, machine_name, shared_folders_released, printers_configured,
          email_signature_standardized, observations, is_final, finalized_at, created_by_name, created_by_email,
          created_at, updated_at`,
        [
          id,
          nextSeq,
          processNumber,
          payload.requestDate || getTodayIso(),
          payload.employeeName,
          payload.cpf || null,
          payload.department || null,
          getActorName(req),
          payload.systemUserEmail,
          payload.userIobLogin,
          JSON.stringify(payload.systemPasswords || {}),
          payload.machineName || null,
          payload.sharedFoldersReleased,
          payload.printersConfigured,
          payload.emailSignatureStandardized,
          payload.observations || null,
          pdfBytes,
          pdfFilename,
        ]
      );

      await client.query('COMMIT');
      await auditLog(req, 'checklist_ti_user_finalize', 'ok', { checklist_id: id, process_number: processNumber });
      return res.json({ document: mapRow(finalized.rows[0]) });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('checklist-ti finalize error:', e?.message || e);
      await auditLog(req, 'checklist_ti_user_finalize', 'error', { checklist_id: id, reason: 'server_error' });
      return res.status(500).json({ error: 'Erro ao finalizar documento.' });
    } finally {
      client.release();
    }
  });

  router.delete('/:id/draft', requireCsrf, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID invalido.' });

    try {
      const existing = await pool.query(
        `SELECT id, is_final FROM checklist_ti_user_creation_forms WHERE id=$1 LIMIT 1`,
        [id]
      );
      if (!existing.rows.length) return res.status(404).json({ error: 'Documento nao encontrado.' });
      if (existing.rows[0].is_final) return res.status(409).json({ error: 'Documento finalizado nao pode ser excluido por esta rota.' });

      await pool.query(`DELETE FROM checklist_ti_user_creation_forms WHERE id=$1 AND is_final=false`, [id]);
      await auditLog(req, 'checklist_ti_user_draft_delete', 'ok', { checklist_id: id });
      return res.json({ ok: true, id });
    } catch (e) {
      console.error('checklist-ti draft delete error:', e?.message || e);
      await auditLog(req, 'checklist_ti_user_draft_delete', 'error', { checklist_id: id, reason: 'server_error' });
      return res.status(500).json({ error: 'Erro ao excluir rascunho.' });
    }
  });

  return router;
};
