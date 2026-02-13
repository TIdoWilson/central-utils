const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const multer = require('multer');
const { Server } = require('socket.io');
const cors = require('cors'); // <<< NOVO
require('dotenv').config();
const axios = require('axios'); // para chamar a API Integra Contador
const { autenticarSerpro } = require("./serpro-auth");
const { Pool } = require('pg'); // << ADICIONE ESTA LINHA
const archiver = require('archiver');
const { createHttpsAgent, obterToken } = require('./serpro-auth'); // reaproveita seu serpro-auth.js;
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');
const createAuthRoutes = require('./routes/auth.routes');
const createAdminRoutes = require('./routes/admin.routes');
const createSharedRoutes = require('./routes/shared.routes');
const createSnRoutes = require('./routes/tools/sn.routes');
const createEcdStatusRoutes = require('./routes/tools/ecd-status.routes');
const createExtratorZipRarRoutes = require('./routes/tools/extrator-zip-rar.routes');
const createFormatadorBernardinaRoutes = require('./routes/tools/formatador-bernardina.routes');
const createPdfaRoutes = require('./routes/tools/pdfa.routes');
const createBalanceteTransitorioRoutes = require('./routes/tools/balancete-transitorio.routes');
const createConciliadorHausenOceanRoutes = require('./routes/tools/conciliador-hausen-ocean.routes');
const createSeparadorPdfRelatorioFeriasRoutes = require('./routes/tools/separador-pdf-relatorio-de-ferias.routes');
const createSeparadorHoleritesPorEmpresaRoutes = require('./routes/tools/separador-holerites-por-empresa.routes');
const createSeparadorFeriasFuncionarioRoutes = require('./routes/tools/separador-ferias-funcionario.routes');
const createGeradorAtasRoutes = require('./routes/tools/gerador-atas.routes');
const createAcertosLotesInternetsRoutes = require('./routes/tools/acertos-lotes-internets.routes');
const createComprimirPdfRoutes = require('./routes/tools/comprimir-pdf.routes');
const createExcelAbasPdfRoutes = require('./routes/tools/excel-abas-pdf.routes');
const createImportadorRecebimentosMadreScpRoutes = require('./routes/tools/importador-recebimentos-madre-scp.routes');
const createMitRoutes = require('./routes/tools/mit.routes');
const createAjusteDiarioGfbrRoutes = require('./routes/tools/ajuste-diario-gfbr.routes');
const createSeparadorCsvBaixaAutomaticaRoutes = require('./routes/tools/separador-csv-baixa-automatica.routes');
const createAjusteDiarioGfbrCRoutes = require('./routes/tools/ajuste-diario-gfbr-c.routes');
const createDimobRoutes = require('./routes/tools/dimob.routes');
const createTareffaEmpresasLoteRoutes = require('./routes/tools/tareffa-empresas-lote.routes');
const createConciliadorCartaoWilsonRoutes = require('./routes/tools/conciliador-cartao-wilson.routes');
const createIrpfRoutes = require('./routes/tools/irpf.routes');
const createNfeLegacyRoutes = require('./routes/tools/nfe-legacy.routes');
const { createDimobService } = require('./services/dimob.service');
const { createEcdStatusService } = require('./services/ecd-status.service');
const { createToolStorage } = require('./services/tool-storage.service');
const { createNfeService } = require('./services/nfe.service');
const { createTareffaEmpresasLoteService } = require('./services/tareffa-empresas-lote.service');
const { extrairCnpjContribuinteDeNomeArquivo } = require('./services/mit.service');
const { processarLoteInternetsConteudo, getTextFromUploadedFile } = require('./services/acertos-lotes-internets.service');
const { criarZipComPdfs } = require('./services/excel-abas-pdf.service');
const {
  pdfaStoreFile,
  pdfaGetFile,
  pdfaGetGhostscriptPath,
  pdfaGetLibreOfficePath,
  pdfaGetIccProfilePath,
  pdfaRun,
} = require('./services/pdfa.service');
const {
  IRPF_RULES,
  toNumber,
  round2,
  calcFaixa,
  calcDeducao,
  applyRegra2026IfNeeded,
} = require('./services/irpf.service');
const { createSnService } = require('./services/sn.service');
let pool;
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
const PY_BASE_URL = process.env.PY_BASE_URL || 'http://127.0.0.1:8001';
const PY_API_URL = process.env.PY_API_URL || 'http://127.0.0.1:8001';
const dimobService = createDimobService({ dataDir: DATA_DIR, axios });
const {
  resolveWPath,
  dimobStoreNetworkFile,
  dimobGetNetworkFile,
  dimobOnlyDigits,
  dimobParseSpedFileOnce,
  dimobParsePreviousDimobLocatarios,
  dimobSetYearInHeader,
  dimobSetYearInLine,
  dimobSetSlice,
  dimobUpdateR01UsingCnpj,
  dimobSanitizeAscii,
  dimobLoadLayout,
  dimobApplyF525ToR02,
  dimobExtractLocatarioFromR02,
  dimobSanitizeField,
  dimobFormatMoneyFixed,
  dimobGetMunicipioCode,
  dimobNormalizeText,
  dimobSanitizeText,
} = dimobService;
const toolStorage = createToolStorage({ dataDir: DATA_DIR, dimobService });
const {
  uploadMemory,
  PDFA_TMP_DIR,
  PDFA_OUT_DIR,
  uploadPdfa,
  BALANCETE_DIR,
  BERNADINA_DIR,
  uploadBernadina,
  FERIAS_FUNC_DIR,
  uploadSeparadorFerias,
  uploadExtratorZipRar,
  uploadMadreScp,
  ajusteDiarioGfbrUploadsDir,
  uploadAjusteDiarioGfbr,
  SEPARADOR_CSV_OUTPUT_DIR,
  uploadSeparadorCsv,
  EXCEL_ABAS_PDF_DIR,
  uploadDimob,
} = toolStorage;

const ecdService = createEcdStatusService({
  fs,
  path,
  resolveWPath,
  dataDir: DATA_DIR,
});
const {
  loadEcdCompanies,
  loadEcdStatus,
  saveEcdStatus,
  ecdHasErrorPng,
} = ecdService;

const {
  JOB_STATUS,
  createJobsFromKeys,
  getAllJobs,
  getSummary,
  getNextJob,
  updateJob,
  findJobByKey,
  deleteJobsByStatus,
} = require('./queue');

const { parseFileToKeys } = require('./parsers');


const app = express();
const server = http.createServer(app);
const io = new Server(server);
pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const nfeService = createNfeService({
  parseFileToKeys,
  queue: {
    JOB_STATUS,
    createJobsFromKeys,
    getAllJobs,
    getSummary,
    getNextJob,
    updateJob,
    findJobByKey,
    deleteJobsByStatus,
  },
  io,
});

const tareffaService = createTareffaEmpresasLoteService({
  updateJob,
  JOB_STATUS,
});
const snService = createSnService({ pool, fs, dataDir: DATA_DIR });
const {
  dbGetSnCompanies,
  dbCreateSnCompany,
  dbGetReceiptById,
  dbGetReceiptsByIds,
  dbGetReceiptByCompanyAndPa,
  dbSaveReceipt,
  buildResumoResponse,
  registrarSnResultado,
} = snService;

const upload = uploadMemory;
// ---------- MIDDLEWARES GERAIS ----------

// CORS liberado para a extensão (Chrome/Firefox)
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsOriginOption = corsOrigins.length
  ? function corsOrigin(origin, cb) {
    if (!origin) return cb(null, true);
    if (corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'), false);
  }
  : '*';
app.use(
  cors({
    origin: corsOriginOption,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'x-csrf-token'],
  })
);

const publicDir = path.join(__dirname, '..', 'public');

async function auditLog(arg1, action, status = 'ok', meta = null, user = null) {
  try {
    // Descobrir se foi chamado como:
    // A) auditLog(req, action, status, meta, user)
    // B) auditLog({ userId, email, action, status, meta, req })

    let req = null;
    let act = action;
    let st = status;
    let mt = meta;

    let userId = null;
    let email = null;

    // B) legacy object-call
    if (arg1 && typeof arg1 === 'object' && arg1.req && typeof arg1.action === 'string') {
      req = arg1.req;
      act = arg1.action;
      st = arg1.status ?? 'ok';
      mt = arg1.meta ?? null;

      userId = arg1.userId ?? arg1.user_id ?? null;
      email = arg1.email ?? arg1.username ?? null;
    } else {
      // A) req-call
      req = arg1;
    }

    const headers = (req && req.headers && typeof req.headers === 'object') ? req.headers : {};

    // Pega user com tolerância (req.user, req.auth.user, ou param user)
    const u = user || req?.user || req?.auth?.user || null;
    userId = userId ?? u?.id ?? null;
    email = email ?? u?.email ?? null;

    const ipRaw =
      (headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      null;

    const ip = (ipRaw || '').toString().replace(/^::ffff:/, '').slice(0, 120);
    const ua = (headers['user-agent'] || '').toString().slice(0, 400);

    await pool.query(
      `INSERT INTO audit_logs (user_id, email, action, status, meta, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, email, act, st, mt ? JSON.stringify(mt) : null, ip || null, ua || null]
    );
  } catch (e) {
    // nunca derrubar request por falha de log
    console.error('auditLog error:', e.message || e);
  }
}

const uploadAdminUsers = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

function normalizeRole(s) {
  const r = String(s || '').trim().toUpperCase();
  return r === 'ADMIN' ? 'ADMIN' : 'USER';
}

function isValidEmail(s) {
  const e = String(s || '').trim().toLowerCase();
  return e.includes('@') && e.includes('.') && e.length <= 320;
}

// Rate limit para login
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE || 10),
  standardHeaders: true,
  legacyHeaders: false,
});

// =========================
// AUTH v2.1 (Portal) + CSRF
// =========================

// trust proxy: EVITAR true; use false no dev e 1 atrás de nginx (1 proxy)
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const parts = raw.split(';').map(s => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + '=')) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function newTokenHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sanitizeUserRow(row) {
  if (!row) return null;
  const permissions = Array.isArray(row.permissions)
    ? row.permissions
    : (Array.isArray(row._permissions) ? row._permissions : []);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    permissions,
  };
}

async function loadSession(req) {
  const token = getCookie(req, 'wl_session');
  if (!token) return null;

  const tokenHash = sha256Hex(token);
  const { rows } = await pool.query(
    `SELECT
       s.id AS session_id,
       s.csrf_token,
       s.expires_at,
       u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.last_login_at,
       COALESCE(ARRAY_AGG(p.perm) FILTER (WHERE p.perm IS NOT NULL), '{}') AS permissions
     FROM auth_sessions s
     JOIN auth_users u ON u.id = s.user_id
     LEFT JOIN auth_user_permissions p ON p.user_id = u.id
     WHERE s.token_hash = $1
     GROUP BY s.id, s.csrf_token, s.expires_at, u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.last_login_at
     LIMIT 1`,
    [tokenHash]
  );

  const row = rows[0];
  if (!row) return null;

  // expirado?
  const exp = new Date(row.expires_at);
  if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
    await pool.query(`DELETE FROM auth_sessions WHERE token_hash=$1`, [tokenHash]).catch(() => { });
    return null;
  }

  if (!row.is_active) return null;

  return {
    tokenHash,
    sessionId: row.session_id,
    csrfToken: row.csrf_token,
    user: sanitizeUserRow(row),
  };
}

async function requireAuth(req, res, next) {
  try {
    const sess = await loadSession(req);
    if (!sess) return res.status(401).json({ error: 'Não autenticado' });

    req.user = sess.user;
    req.csrfToken = sess.csrfToken;
    req.sessionTokenHash = sess.tokenHash;

    // compat com páginas antigas que usam req.auth.user
    req.auth = {
      sessionId: sess.sessionId,
      csrfToken: sess.csrfToken,
      user: {
        id: sess.user?.id,
        name: sess.user?.name,
        email: sess.user?.email,
        role: sess.user?.role,
        username: sess.user?.email,
      },
    };

    return next();
  } catch (e) {
    console.error('requireAuth error:', e.message || e);
    return res.status(500).json({ error: 'Erro interno de autenticação' });
  }
}

async function requireAuthPage(req, res, next) {
  try {
    const sess = await loadSession(req);
    if (!sess) return res.redirect('/login');

    req.user = sess.user;
    req.csrfToken = sess.csrfToken;
    req.sessionTokenHash = sess.tokenHash;

    req.auth = {
      sessionId: sess.sessionId,
      csrfToken: sess.csrfToken,
      user: {
        id: sess.user?.id,
        name: sess.user?.name,
        email: sess.user?.email,
        role: sess.user?.role,
        username: sess.user?.email,
      },
    };

    return next();
  } catch (e) {
    console.error('requireAuthPage error:', e.message || e);
    return res.redirect('/login');
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const userRole = req.user?.role || req.auth?.user?.role;
    if (userRole !== role) return res.status(403).json({ error: 'Sem permissão' });
    next();
  };
}

function sendForbiddenPage(req, res, message) {
  const wantsJson = req.accepts(['html', 'json']) === 'json';
  if (wantsJson) {
    return res.status(403).json({ error: message || 'Sem permissão' });
  }
  return res.status(403).sendFile(path.join(publicDir, 'acesso-negado.html'));
}

function sendForbiddenPageHtml(res) {
  return res.status(403).sendFile(path.join(publicDir, 'acesso-negado.html'));
}

function requireAdminPage(req, res, next) {
  const userRole = req.user?.role || req.auth?.user?.role;
  if (userRole !== 'ADMIN') return sendForbiddenPageHtml(res);
  next();
}

const RBAC_STRICT = ['1', 'true', 'yes', 'on'].includes(String(process.env.RBAC_STRICT || 'false').toLowerCase());

function normalizeToolSlug(toolSlug) {
  return String(toolSlug || '').trim().toLowerCase();
}

const LEGACY_PAGE_VIEW_SLUG_MAP = {
  'pdf-a': 'pdfa',
};

function pageViewActionForSlug(toolSlug) {
  const slug = normalizeToolSlug(toolSlug);
  if (!slug) return 'page_view_unknown';
  const legacy = LEGACY_PAGE_VIEW_SLUG_MAP[slug] || slug;
  const safe = legacy.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `page_view_${safe || slug}`;
}

function hasToolPermission(user, toolSlug) {
  if (!user) return false;
  if (String(user.role || '').toUpperCase() === 'ADMIN') return true;

  const slug = normalizeToolSlug(toolSlug);
  if (!slug) return false;

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (permissions.includes(`tool:${slug}`) || permissions.includes('tool:*')) return true;
  if (permissions.length === 0 && RBAC_STRICT === false) return true;
  return false;
}

function requireToolApi(toolSlug) {
  return (req, res, next) => {
    if (!hasToolPermission(req.user || req.auth?.user, toolSlug)) {
      return res.status(403).json({ error: 'Sem permissão para esta ferramenta' });
    }
    return next();
  };
}

function requireToolPage(toolSlug) {
  return (req, res, next) => {
    const user = req.user || req.auth?.user;
    if (!hasToolPermission(user, toolSlug)) {
      return sendForbiddenPageHtml(res);
    }
    return next();
  };
}

function requireAnyToolAccess(req, res, next) {
  const user = req.user || req.auth?.user;
  if (!user) return res.status(403).json({ error: 'Sem permissão para esta ferramenta' });
  if (String(user.role || '').toUpperCase() === 'ADMIN') return next();

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (permissions.includes('tool:*') || permissions.some((p) => String(p || '').startsWith('tool:'))) {
    return next();
  }
  if (permissions.length === 0 && RBAC_STRICT === false) return next();
  return res.status(403).json({ error: 'Sem permissão para esta ferramenta' });
}

function requireCsrf(req, res, next) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const sent = (req.headers['x-csrf-token'] || '').toString();
  const expected = (req.csrfToken || req.auth?.csrfToken || '').toString();

  if (!sent) return res.status(403).json({ error: 'CSRF ausente', code: 'csrf_missing' });
  if (!expected || sent !== expected) {
    return res.status(403).json({ error: 'CSRF inválido', code: 'csrf_invalid' });
  }
  next();
}

function logPageView(action) {
  return async (req, res, next) => {
    try {
      await auditLog(req, action, 'ok', { path: req.path, method: req.method });
    } catch (e) {
      console.error('logPageView auditLog falhou:', e.message || e);
    }
    next();
  };
}

// Bloqueia acesso direto a *.html com redirect para rota limpa
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.toLowerCase().endsWith('.html')) {
    const url = new URL(req.originalUrl, 'http://localhost');
    const cleanPath = req.path.slice(0, -5) || '/';
    const normalized = cleanPath === '/home' ? '/' : (cleanPath === '/login' ? '/login' : cleanPath);
    const target = `${normalized}${url.search || ''}`;
    return res.redirect(301, target);
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public'), {
  index: false,
  redirect: false,
}));

app.get('/', requireAuthPage, logPageView('page_view_home'), (req, res) => {
  res.sendFile(path.join(publicDir, 'home.html'));
});






// para conseguir ler JSON do body (usado em /api/mark-done e SN)
app.use(express.json());


const authRoutes = createAuthRoutes({
  pool,
  bcrypt,
  loginLimiter,
  auditLog,
  requireAuth,
  requireCsrf,
  newTokenHex,
  sha256Hex,
  sanitizeUserRow,
});
app.use('/api/auth', authRoutes);

const adminRoutes = createAdminRoutes({
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
});
app.use('/api/admin', adminRoutes);

const sharedRoutes = createSharedRoutes({ axios });
app.use('/api', requireAuth, requireAnyToolAccess, sharedRoutes);

const nfeLegacyRoutes = createNfeLegacyRoutes({
  requireAuth,
  requireToolApi,
  requireCsrf,
  uploadMemory: upload,
  queue: {
    JOB_STATUS,
    createJobsFromKeys,
    getAllJobs,
    getSummary,
    getNextJob,
    updateJob,
    findJobByKey,
    deleteJobsByStatus,
  },
  nfeService,
  io,
});
app.use('/', nfeLegacyRoutes);

// auth no handshake (NFE)
io.use(async (socket, next) => {
  try {
    const req = { headers: socket.request.headers || {}, ip: socket.handshake.address };
    const sess = await loadSession(req);
    if (!sess || !hasToolPermission(sess.user, 'nfe')) {
      return next(new Error('unauthorized'));
    }
    socket.user = sess.user;
    socket.join('tool:nfe');
    return next();
  } catch (e) {
    return next(new Error('unauthorized'));
  }
});

// ----------------------------------------------------------------------
// SIMPLES NACIONAL – CADASTRO, RESUMO E DECLARAÇÃO EM LOTE
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// SIMPLES NACIONAL – DB (Postgres), resumo e envio/consulta em lote
// ----------------------------------------------------------------------

// Pool do Postgres
async function initSecuritySchemaAndBootstrap() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_user_permissions (
      user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      perm TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, perm)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NULL,
      email TEXT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ok',
      meta JSONB NULL,
      ip TEXT NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // bootstrap admin via .env (cria apenas se não existir)
  const adminEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const adminName = (process.env.ADMIN_BOOTSTRAP_NAME || 'Administrador').trim();
  const adminPass = (process.env.ADMIN_BOOTSTRAP_PASS || '').trim();

  if (adminEmail && adminPass) {
    const r = await pool.query('SELECT id FROM auth_users WHERE email=$1 LIMIT 1', [adminEmail]);
    if (!r.rows.length) {
      const hash = await bcrypt.hash(adminPass, 12);
      await pool.query(
        `INSERT INTO auth_users (name, email, password_hash, role, is_active)
         VALUES ($1,$2,$3,'ADMIN',true)`,
        [adminName, adminEmail, hash]
      );
      console.log(`[SECURITY] Admin bootstrap criado: ${adminEmail}`);
    }
  }
}

initSecuritySchemaAndBootstrap().catch((e) => {
  console.error('[SECURITY] Falha ao inicializar schema/boot:', e.message || e);
});

const mitUpload = uploadMemory;

// ---------- ROTAS DE PÁGINA ----------

// Página de login (pública)
app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

// --- Páginas protegidas (exemplos) ---
// Ajuste suas rotas existentes para incluir checagem:

// ECD Status

// PDF/A Converter


app.get('/formatador-bernadina', requireAuthPage, (req, res) => {
  res.redirect('/formatador-bernardina');
});


// ---------- ROTAS API: PDF/A ----------
// Páginas Admin (protegidas)
// admin (exigem ADMIN)
app.get('/admin-usuarios', requireAuthPage, requireAdminPage, logPageView('page_view_admin_users'), (req, res) => {
  res.sendFile(path.join(publicDir, 'admin-usuarios.html'));
});

app.get('/logs', requireAuthPage, requireAdminPage, logPageView('page_view_audit_logs'), (req, res) => {
  res.sendFile(path.join(publicDir, 'logs.html'));
});


app.use(
  '/api/sn',
  requireAuth,
  requireToolApi('sn'),
  createSnRoutes({
    requireCsrf,
    pool,
    auditLog,
    autenticarSerpro,
    axios,
    dbGetSnCompanies,
    dbCreateSnCompany,
    dbGetReceiptById,
    dbGetReceiptsByIds,
    dbGetReceiptByCompanyAndPa,
    dbSaveReceipt,
    buildResumoResponse,
    registrarSnResultado,
  })
);
app.use(
  '/api/ecd',
  requireAuth,
  requireToolApi('ecd-status'),
  createEcdStatusRoutes({
    requireCsrf,
    loadEcdCompanies,
    loadEcdStatus,
    saveEcdStatus,
    ecdHasErrorPng,
    auditLog,
  })
);
app.use(
  '/api/pdfa',
  requireAuth,
  requireToolApi('pdf-a'),
  createPdfaRoutes({
    requireCsrf,
    uploadPdfa,
    PDFA_TMP_DIR,
    PDFA_OUT_DIR,
    pdfaGetLibreOfficePath,
    pdfaRun,
    pdfaGetGhostscriptPath,
    pdfaGetIccProfilePath,
    pdfaStoreFile,
    pdfaGetFile,
    auditLog,
    fs,
    path,
  })
);
app.use(
  '/api/formatador-bernardina',
  requireAuth,
  requireToolApi('formatador-bernardina'),
  createFormatadorBernardinaRoutes({
    requireCsrf,
    uploadBernadina,
    BERNADINA_DIR,
    auditLog,
    fs,
    path,
    spawn,
  })
);
app.use(
  '/api/balancete-transitorio',
  requireAuth,
  requireToolApi('balancete-transitorio'),
  createBalanceteTransitorioRoutes({
    BALANCETE_DIR,
    fs,
    path,
  })
);
app.use(
  '/api/conciliador-hausen-ocean',
  requireAuth,
  requireToolApi('conciliador-hausen-ocean'),
  createConciliadorHausenOceanRoutes()
);
app.use(
  '/api/separador-pdf-relatorio-de-ferias',
  requireAuth,
  requireToolApi('separador-pdf-relatorio-de-ferias'),
  createSeparadorPdfRelatorioFeriasRoutes({
    requireCsrf,
    uploadSeparadorFerias,
    axios,
    fs,
    path,
  })
);
app.use(
  '/api/separador-holerites-por-empresa',
  requireAuth,
  requireToolApi('separador-holerites-por-empresa'),
  createSeparadorHoleritesPorEmpresaRoutes({
    requireCsrf,
    upload,
    axios,
  })
);
app.use(
  '/api/separador-ferias-funcionario',
  requireAuth,
  requireToolApi('separador-ferias-funcionario'),
  createSeparadorFeriasFuncionarioRoutes({
    requireCsrf,
    uploadSeparadorFerias,
    FERIAS_FUNC_DIR,
    PY_BASE_URL,
    axios,
    fs,
    path,
  })
);
app.use(
  '/api/atas',
  requireAuth,
  requireToolApi('gerador-atas'),
  createGeradorAtasRoutes({
    requireCsrf,
    axios,
    PY_BASE_URL,
    DATA_DIR,
    path,
  })
);
app.use(
  '/api/acertos-lotes-internets',
  requireAuth,
  requireToolApi('acertos-lotes-internets'),
  createAcertosLotesInternetsRoutes({
    requireCsrf,
    upload,
    getTextFromUploadedFile,
    processarLoteInternetsConteudo,
  })
);
app.use(
  '/api/comprimir-pdf',
  requireAuth,
  requireToolApi('comprimir-pdf'),
  createComprimirPdfRoutes({
    requireCsrf,
    upload,
    axios,
    PY_BASE_URL,
    fs,
  })
);
app.use(
  '/api/extrator-zip-rar',
  requireAuth,
  requireToolApi('extrator-zip-rar'),
  createExtratorZipRarRoutes({
    uploadExtratorZipRar,
    PY_BASE_URL,
    DATA_DIR,
    fs,
    path,
    axios,
    archiver,
  })
);
app.use(
  '/api/excel-abas-pdf',
  requireAuth,
  requireToolApi('excel-abas-pdf'),
  createExcelAbasPdfRoutes({
    requireCsrf,
    upload,
    PY_BASE_URL,
    EXCEL_ABAS_PDF_DIR,
    criarZipComPdfs,
    axios,
    fs,
    path,
  })
);
app.use(
  '/api/importador-recebimentos-madre-scp',
  requireAuth,
  requireToolApi('importador-recebimentos-madre-scp'),
  createImportadorRecebimentosMadreScpRoutes({
    requireCsrf,
    uploadMadreScp,
    axios,
    DATA_DIR,
    path,
  })
);
app.use(
  '/api/mit',
  requireAuth,
  requireToolApi('mit'),
  createMitRoutes({
    requireCsrf,
    mitUpload,
    extrairCnpjContribuinteDeNomeArquivo,
    obterToken,
    createHttpsAgent,
    axios,
  })
);
app.use(
  '/api/ajuste-diario-gfbr',
  requireAuth,
  requireToolApi('ajuste-diario-gfbr'),
  createAjusteDiarioGfbrRoutes({
    requireCsrf,
    uploadAjusteDiarioGfbr,
    axios,
    ajusteDiarioGfbrUploadsDir,
    fs,
    path,
  })
);
app.use(
  '/api/separador-csv-baixa-automatica',
  requireAuth,
  requireToolApi('separador-csv-baixa-automatica'),
  createSeparadorCsvBaixaAutomaticaRoutes({
    requireCsrf,
    uploadSeparadorCsv,
    SEPARADOR_CSV_OUTPUT_DIR,
    axios,
    fs,
    path,
    archiver,
  })
);
app.use(
  '/api/ajuste-diario-gfbr-c',
  requireAuth,
  requireToolApi('ajuste-diario-gfbr-c'),
  createAjusteDiarioGfbrCRoutes({
    requireCsrf,
    upload,
    axios,
    fs,
    path,
  })
);
app.use(
  '/api/dimob',
  requireAuth,
  requireToolApi('dimob'),
  createDimobRoutes({
    requireCsrf,
    uploadDimob,
    resolveWPath,
    dimobStoreNetworkFile,
    dimobOnlyDigits,
    dimobParseSpedFileOnce,
    dimobParsePreviousDimobLocatarios,
    dimobGetNetworkFile,
    auditLog,
    dimobSetYearInHeader,
    dimobSetYearInLine,
    dimobSetSlice,
    dimobUpdateR01UsingCnpj,
    dimobSanitizeAscii,
    dimobLoadLayout,
    dimobApplyF525ToR02,
    dimobExtractLocatarioFromR02,
    dimobSanitizeField,
    dimobFormatMoneyFixed,
    dimobGetMunicipioCode,
    dimobNormalizeText,
    dimobSanitizeText,
    fs,
    path,
  })
);
app.use(
  '/api/tareffa-empresas-lote',
  requireAuth,
  requireToolApi('tareffa-empresas-lote'),
  createTareffaEmpresasLoteRoutes({
    requireCsrf,
    createJobsFromKeys,
    findJobByKey,
    updateJob,
    JOB_STATUS,
    startPythonJob: tareffaService.startPythonJob,
    fs,
    path,
  })
);
app.use(
  '/api/conciliador-cartao-wilson',
  requireAuth,
  requireToolApi('conciliador-cartao-wilson'),
  createConciliadorCartaoWilsonRoutes({
    requireCsrf,
    upload,
    axios,
    PY_API_URL,
  })
);
app.use(
  '/api/irpf',
  requireAuth,
  requireToolApi('irpf-carne-leao'),
  createIrpfRoutes({
    IRPF_RULES,
    toNumber,
    round2,
    calcDeducao,
    calcFaixa,
    applyRegra2026IfNeeded,
  })
);


// Página interna (protegida)

const RESERVED_DYNAMIC_SLUGS = new Set([
  'api',
  'socket.io',
  'login',
  'admin-usuarios',
  'logs',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'status',
  'health',
]);

app.get('/:toolSlug', requireAuthPage, async (req, res, next) => {
  try {
    const rawSlug = String(req.params.toolSlug || '').trim();
    if (!rawSlug) return next();
    if (RESERVED_DYNAMIC_SLUGS.has(rawSlug)) return next();
    if (!/^[A-Za-z0-9._-]+$/.test(rawSlug)) return next();

    const candidates = [
      rawSlug,
      decodeURIComponent(rawSlug),
      rawSlug.toLowerCase(),
    ];
    let filePath = null;
    for (const candidate of candidates) {
      if (!candidate || candidate.includes('..') || candidate.includes('/') || candidate.includes('\\')) continue;
      const p = path.join(publicDir, `${candidate}.html`);
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }
    if (!filePath) return next();

    const slug = normalizeToolSlug(rawSlug);
    if ((slug === 'admin-usuarios' || slug === 'logs') && String(req.user?.role || '').toUpperCase() !== 'ADMIN') {
      return sendForbiddenPageHtml(res);
    }
    return requireToolPage(slug)(req, res, async () => {
      await auditLog(req, pageViewActionForSlug(slug), 'ok', { path: req.path, method: req.method });
      return res.sendFile(filePath);
    });
  } catch (e) {
    console.error('dynamic tool route error:', e.message || e);
    return next();
  }
});

module.exports = {
  server,
  io,
};
