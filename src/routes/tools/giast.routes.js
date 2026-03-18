const express = require('express');
const createGiastService = require('../../services/giast.service');

const giastService = createGiastService();

module.exports = function createGiastRoutes(deps = {}) {
  const {
    requireCsrf,
    auditLog,
    pool,
    axios,
    PY_API_URL,
  } = deps;

  if (!pool) {
    throw new Error('createGiastRoutes: pool nao informado.');
  }
  if (!axios) {
    throw new Error('createGiastRoutes: axios nao informado.');
  }

  const router = express.Router();
  const pyBase = PY_API_URL || 'http://127.0.0.1:8001';
  let schemaPromise = null;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS giast_declarants (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            cnpj CHAR(14) NOT NULL UNIQUE,
            cpf CHAR(11) NULL,
            role_title TEXT NULL,
            phone_ddd VARCHAR(4) NULL,
            phone_number VARCHAR(9) NULL,
            fax_ddd VARCHAR(4) NULL,
            fax_number VARCHAR(9) NULL,
            email TEXT NULL,
            signing_city TEXT NULL,
            signing_date DATE NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS giast_declarant_state_regs (
            id BIGSERIAL PRIMARY KEY,
            declarant_id BIGINT NOT NULL REFERENCES giast_declarants(id) ON DELETE CASCADE,
            uf CHAR(2) NOT NULL,
            state_registration VARCHAR(20) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (declarant_id, uf)
          );
        `);

        await pool.query('CREATE INDEX IF NOT EXISTS idx_giast_declarants_name ON giast_declarants (LOWER(name));');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_giast_declarants_cnpj ON giast_declarants (cnpj);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_giast_state_regs_declarant_id ON giast_declarant_state_regs (declarant_id);');
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  function mapListRows(rows) {
    return rows.map((row) => giastService.mapDeclarantDbRow(row));
  }

  async function listDeclarants() {
    const result = await pool.query(`
      SELECT
        d.id,
        d.name,
        d.cnpj,
        d.cpf,
        d.role_title,
        d.phone_ddd,
        d.phone_number,
        d.fax_ddd,
        d.fax_number,
        d.email,
        d.signing_city,
        d.signing_date,
        COALESCE(
          jsonb_object_agg(r.uf, r.state_registration) FILTER (WHERE r.uf IS NOT NULL),
          '{}'::jsonb
        ) AS state_regs
      FROM giast_declarants d
      LEFT JOIN giast_declarant_state_regs r ON r.declarant_id = d.id
      GROUP BY d.id
      ORDER BY d.name ASC, d.id ASC
    `);
    return mapListRows(result.rows);
  }

  async function getDeclarantById(id) {
    const result = await pool.query(`
      SELECT
        d.id,
        d.name,
        d.cnpj,
        d.cpf,
        d.role_title,
        d.phone_ddd,
        d.phone_number,
        d.fax_ddd,
        d.fax_number,
        d.email,
        d.signing_city,
        d.signing_date,
        COALESCE(
          jsonb_object_agg(r.uf, r.state_registration) FILTER (WHERE r.uf IS NOT NULL),
          '{}'::jsonb
        ) AS state_regs
      FROM giast_declarants d
      LEFT JOIN giast_declarant_state_regs r ON r.declarant_id = d.id
      WHERE d.id = $1
      GROUP BY d.id
      LIMIT 1
    `, [id]);

    if (!result.rows.length) return null;
    return giastService.mapDeclarantDbRow(result.rows[0]);
  }

  async function replaceStateRegistrations(client, declarantId, stateRegistrations) {
    await client.query('DELETE FROM giast_declarant_state_regs WHERE declarant_id = $1', [declarantId]);

    const entries = Object.entries(stateRegistrations || {});
    for (const [uf, stateRegistration] of entries) {
      const normalizedUf = giastService.normalizeUf(uf);
      if (!normalizedUf) continue;

      await client.query(
        `
          INSERT INTO giast_declarant_state_regs (
            declarant_id,
            uf,
            state_registration,
            updated_at
          )
          VALUES ($1, $2, $3, NOW())
        `,
        [declarantId, normalizedUf, String(stateRegistration)]
      );
    }
  }

  async function replaceStateRegistrationsBestEffort(client, declarantId, stateRegistrations) {
    const savepoint = 'giast_ie_savepoint';
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
      await replaceStateRegistrations(client, declarantId, stateRegistrations);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      return null;
    } catch (error) {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      return 'Inscricoes estaduais nao foram salvas neste momento. Edite e tente novamente se necessario.';
    }
  }

  router.get('/health', async (_req, res) => {
    try {
      await ensureSchema();
      return res.json({ ok: true, tool: 'giast' });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Falha ao validar schema.' });
    }
  });

  router.get('/declarantes', async (req, res) => {
    try {
      await ensureSchema();
      const declarantes = await listDeclarants();
      return res.json({ ok: true, declarantes });
    } catch (error) {
      console.error('giast list declarantes error:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'Erro ao listar declarantes.' });
    }
  });

  router.get('/declarantes/:id', async (req, res) => {
    try {
      await ensureSchema();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'ID invalido.' });
      }

      const declarant = await getDeclarantById(id);
      if (!declarant) {
        return res.status(404).json({ ok: false, error: 'Declarante nao encontrado.' });
      }

      return res.json({ ok: true, declarant });
    } catch (error) {
      console.error('giast get declarant error:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'Erro ao carregar declarante.' });
    }
  });

  router.post('/declarantes', requireCsrf, async (req, res) => {
    const client = await pool.connect();
    try {
      await ensureSchema();
      const payload = giastService.normalizeDeclarantPayload(req.body || {});

      await client.query('BEGIN');

      const dup = await client.query(
        'SELECT id FROM giast_declarants WHERE cnpj = $1 LIMIT 1',
        [payload.cnpj]
      );
      if (dup.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Ja existe declarante com este CNPJ.' });
      }

      const insert = await client.query(
        `
          INSERT INTO giast_declarants (
            name,
            cnpj,
            cpf,
            role_title,
            phone_ddd,
            phone_number,
            fax_ddd,
            fax_number,
            email,
            signing_city,
            signing_date,
            updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
          RETURNING id
        `,
        [
          payload.name,
          payload.cnpj,
          payload.cpf || null,
          payload.roleTitle || null,
          payload.phoneDdd || null,
          payload.phoneNumber || null,
          payload.faxDdd || null,
          payload.faxNumber || null,
          payload.email || null,
          payload.signingCity || null,
          payload.signingDate || null,
        ]
      );

      const declarantId = Number(insert.rows[0].id);
      const ieWarning = await replaceStateRegistrationsBestEffort(
        client,
        declarantId,
        payload.stateRegistrations
      );

      await client.query('COMMIT');

      const declarant = await getDeclarantById(declarantId);
      await auditLog?.(req, 'giast_declarant_create', 'ok', {
        declarantId,
        cnpj: payload.cnpj,
        ieWarning: Boolean(ieWarning),
      });

      return res.status(201).json({ ok: true, declarant, warning: ieWarning || null });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('giast create declarant error:', error?.message || error);
      await auditLog?.(req, 'giast_declarant_create', 'error', { error: String(error?.message || error) });
      return res.status(400).json({ ok: false, error: error?.message || 'Erro ao criar declarante.' });
    } finally {
      client.release();
    }
  });

  router.put('/declarantes/:id', requireCsrf, async (req, res) => {
    const client = await pool.connect();
    try {
      await ensureSchema();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'ID invalido.' });
      }

      const payload = giastService.normalizeDeclarantPayload(req.body || {});
      await client.query('BEGIN');

      const existing = await client.query('SELECT id FROM giast_declarants WHERE id = $1 LIMIT 1', [id]);
      if (!existing.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'Declarante nao encontrado.' });
      }

      const dup = await client.query(
        'SELECT id FROM giast_declarants WHERE cnpj = $1 AND id <> $2 LIMIT 1',
        [payload.cnpj, id]
      );
      if (dup.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Ja existe outro declarante com este CNPJ.' });
      }

      await client.query(
        `
          UPDATE giast_declarants
          SET
            name = $2,
            cnpj = $3,
            cpf = $4,
            role_title = $5,
            phone_ddd = $6,
            phone_number = $7,
            fax_ddd = $8,
            fax_number = $9,
            email = $10,
            signing_city = $11,
            signing_date = $12,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          id,
          payload.name,
          payload.cnpj,
          payload.cpf || null,
          payload.roleTitle || null,
          payload.phoneDdd || null,
          payload.phoneNumber || null,
          payload.faxDdd || null,
          payload.faxNumber || null,
          payload.email || null,
          payload.signingCity || null,
          payload.signingDate || null,
        ]
      );

      const ieWarning = await replaceStateRegistrationsBestEffort(
        client,
        id,
        payload.stateRegistrations
      );
      await client.query('COMMIT');

      const declarant = await getDeclarantById(id);
      await auditLog?.(req, 'giast_declarant_update', 'ok', {
        declarantId: id,
        cnpj: payload.cnpj,
        ieWarning: Boolean(ieWarning),
      });

      return res.json({ ok: true, declarant, warning: ieWarning || null });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('giast update declarant error:', error?.message || error);
      await auditLog?.(req, 'giast_declarant_update', 'error', { error: String(error?.message || error) });
      return res.status(400).json({ ok: false, error: error?.message || 'Erro ao atualizar declarante.' });
    } finally {
      client.release();
    }
  });

  router.delete('/declarantes/:id', requireCsrf, async (req, res) => {
    try {
      await ensureSchema();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'ID invalido.' });
      }

      const removed = await pool.query(
        'DELETE FROM giast_declarants WHERE id = $1 RETURNING id, cnpj',
        [id]
      );

      if (!removed.rows.length) {
        return res.status(404).json({ ok: false, error: 'Declarante nao encontrado.' });
      }

      await auditLog?.(req, 'giast_declarant_delete', 'ok', {
        declarantId: id,
        cnpj: removed.rows[0].cnpj,
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error('giast delete declarant error:', error?.message || error);
      await auditLog?.(req, 'giast_declarant_delete', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro ao excluir declarante.' });
    }
  });

  router.post('/generate-txt', requireCsrf, async (req, res) => {
    const traceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      await ensureSchema();

      const declarantId = Number(req.body?.declarantId);
      if (!Number.isInteger(declarantId) || declarantId <= 0) {
        return res.status(400).json({ ok: false, error: 'Selecione um declarante valido.' });
      }

      const periodRef = giastService.normalizePeriodRef(req.body?.periodRef);
      if (!periodRef) {
        return res.status(400).json({ ok: false, error: 'Periodo de referencia invalido. Use MMAAAA.' });
      }

      const rows = giastService.normalizeDeclarationRows(req.body?.rows);
      const declarant = await getDeclarantById(declarantId);
      if (!declarant) {
        return res.status(404).json({ ok: false, error: 'Declarante nao encontrado.' });
      }

      const missingIe = rows
        .filter((row) => !declarant.stateRegistrations?.[row.uf])
        .map((row) => row.uf);

      if (missingIe.length) {
        return res.status(400).json({
          ok: false,
          error: `Preencha a inscricao estadual para: ${missingIe.join(', ')}.`,
        });
      }

      const pyPayload = {
        periodRef,
        fileName: `GIAST_${declarant.cnpj}_${periodRef}.txt`,
        declarant: {
          cnpj: declarant.cnpj,
          name: declarant.name,
          cpf: declarant.cpf || '',
          role: declarant.roleTitle || '',
          phoneDdd: declarant.phoneDdd || '',
          phoneNumber: declarant.phoneNumber || '',
          faxDdd: declarant.faxDdd || '',
          faxNumber: declarant.faxNumber || '',
          email: declarant.email || '',
          location: declarant.signingCity || '',
          signatureDate: declarant.signingDate || giastService.todayYmd(),
          stateRegistrations: declarant.stateRegistrations || {},
        },
        entries: rows.map((row) => ({
          uf: row.uf,
          dueDate: row.dueDate,
          valueIcms: row.valueIcms,
          valueFcp: row.valueFcp,
          valueDevolutions: row.valueDevolutions,
          valuePrepayments: row.valuePrepayments,
        })),
      };

      const pyResp = await axios.post(`${pyBase}/api/giast/gerar`, pyPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000,
      });

      await auditLog?.(req, 'giast_generate_txt', 'ok', {
        traceId,
        declarantId,
        periodRef,
        rowCount: rows.length,
      });

      return res.json(pyResp.data);
    } catch (error) {
      const status = Number(error?.response?.status) || 500;
      const detail = error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || 'Erro interno ao gerar TXT.';

      console.error('giast generate txt error:', detail);
      await auditLog?.(req, 'giast_generate_txt', 'error', {
        traceId,
        error: String(detail),
      });

      return res.status(status).json({
        ok: false,
        traceId,
        error: typeof detail === 'string' ? detail : JSON.stringify(detail),
      });
    }
  });

  return router;
};
