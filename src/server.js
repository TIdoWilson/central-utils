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
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const BERNADINA_DIR = path.join(DATA_DIR, 'formatador-bernardina');
const BERNADINA_TMP_DIR = path.join(BERNADINA_DIR, '_tmp');

fs.mkdirSync(BERNADINA_DIR, { recursive: true });
fs.mkdirSync(BERNADINA_TMP_DIR, { recursive: true });

// multer em disco só para essa ferramenta (não usa memoryStorage)
const uploadBernadina = multer({
  dest: BERNADINA_TMP_DIR,
  limits: { fileSize: 50 * 1024 * 1024, files: 120 },
});

const FERIAS_FUNC_DIR = path.join(DATA_DIR, 'ferias-funcionario');
if (!fs.existsSync(FERIAS_FUNC_DIR)) {
  fs.mkdirSync(FERIAS_FUNC_DIR, { recursive: true });
}

// Arquivo de resumo do SN (apenas um)
const SN_SUMMARY_FILE = path.join(DATA_DIR, 'sn_summary.json');

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

const MAIN_UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(MAIN_UPLOAD_DIR)) {
  fs.mkdirSync(MAIN_UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  dest: MAIN_UPLOAD_DIR,
  storage: multer.memoryStorage(),
});

const EXCEL_ABAS_PDF_DIR = path.join(DATA_DIR, 'excel-abas-pdf');
if (!fs.existsSync(EXCEL_ABAS_PDF_DIR)) {
  fs.mkdirSync(EXCEL_ABAS_PDF_DIR, { recursive: true });
}

// Próximo de outras configurações, usando o mesmo DATA_DIR se já existir
const uploadsDir = path.join(DATA_DIR, 'uploads', 'separador-ferias');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const extratorZipRarUploadsDir = path.join(DATA_DIR, 'uploads', 'extrator-zip-rar');
if (!fs.existsSync(extratorZipRarUploadsDir)) {
  fs.mkdirSync(extratorZipRarUploadsDir, { recursive: true });
}

if (!fs.existsSync(BERNADINA_TMP_DIR)) {
  fs.mkdirSync(BERNADINA_TMP_DIR, { recursive: true });
}

const uploadExtratorZipRar = multer({
  dest: extratorZipRarUploadsDir,
});

const uploadSeparadorFerias = multer({
  dest: uploadsDir,
});

const uploadMadreScp = multer({
  dest: path.join(DATA_DIR, 'uploads', 'madre-scp'),
});

// Diretório para uploads do Ajuste Diário GFBR
const ajusteDiarioGfbrUploadsDir = path.join(DATA_DIR, 'uploads', 'ajuste-diario-gfbr');
if (!fs.existsSync(ajusteDiarioGfbrUploadsDir)) {
  fs.mkdirSync(ajusteDiarioGfbrUploadsDir, { recursive: true });
}

const storageAjusteDiarioGfbr = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, ajusteDiarioGfbrUploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.xlsx';
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + ext);
  },
});

const uploadAjusteDiarioGfbr = multer({
  storage: storageAjusteDiarioGfbr,
});

const SEPARADOR_CSV_BASE_DIR = path.join(DATA_DIR, 'separador-csv-baixa-automatica');
const SEPARADOR_CSV_UPLOAD_DIR = path.join(SEPARADOR_CSV_BASE_DIR, 'uploads');
const SEPARADOR_CSV_OUTPUT_DIR = path.join(SEPARADOR_CSV_BASE_DIR, 'outputs');

app.set('trust proxy', false);

// Middleware de upload exclusivo para esta ferramenta
const uploadSeparadorCsv = multer({
  dest: SEPARADOR_CSV_UPLOAD_DIR,
});
// ---------- MIDDLEWARES GERAIS ----------

// CORS liberado para a extensão (Chrome/Firefox)
app.use(
  cors({
    origin: '*', // se quiser, depois restringe pra 'http://localhost:3000' ou similar
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'x-csrf-token'],
  })
);

// servir arquivos estáticos (index.html, styles.css, etc.)
app.use(express.static(path.join(__dirname, '..', 'public')));

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
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
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
       u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.last_login_at
     FROM auth_sessions s
     JOIN auth_users u ON u.id = s.user_id
     WHERE s.token_hash = $1
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

function requireAdminPage(req, res, next) {
  const userRole = req.user?.role || req.auth?.user?.role;
  if (userRole !== 'ADMIN') return res.status(403).send('Sem permissão');
  next();
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

// Bloqueia acesso direto a *.html (senão “fura” o requireAuthPage via express.static)
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.endsWith('.html') && req.path !== '/login.html') {
    return requireAuthPage(req, res, next);
  }
  next();
});

app.get('/', requireAuthPage, logPageView('page_view_home'), (req, res) => {
  res.sendFile(path.join(publicDir, 'home.html'));
});

app.get('/nfe', requireAuthPage, logPageView('page_view_nfe'), (req, res) => {
  res.sendFile(path.join(publicDir, 'nfe.html'));
});

// para conseguir ler JSON do body (usado em /api/mark-done e SN)
app.use(express.json());

// <<< ROTAS DA EXTENSÃO / API >>>

// teste simples (usado no popup da extensão)
app.get('/api/ping', (req, res) => {
  res.send('ok');
});

// devolve a próxima chave pendente para a extensão
app.get('/api/next-key', (req, res) => {
  const job = getNextJob();

  if (!job) {
    return res.json({ key: null });
  }

  // marcamos como PROCESSING para não ser pego de novo
  updateJob(job.id, { status: JOB_STATUS.PROCESSING });
  broadcastJobUpdate(job);

  res.json({ key: job.key });
});

// marca uma chave como concluída (quando o XML já foi baixado)
app.post('/api/mark-done', (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Chave não informada' });
  }

  const job = findJobByKey(key);
  if (!job) {
    return res.status(404).json({ error: 'Job não encontrado para essa chave' });
  }

  updateJob(job.id, {
    status: JOB_STATUS.DONE,
    errorMessage: null,
  });

  broadcastJobUpdate(job);

  res.json({ ok: true });
});

// <<< ROTAS JÁ EXISTENTES >>>

app.post('/api/clear-pending', (req, res) => {
  try {
    // removemos jobs PENDING e PROCESSING de vez
    const removedCount = deleteJobsByStatus([
      JOB_STATUS.PENDING,
      JOB_STATUS.PROCESSING,
    ]);

    io.emit('queue_update', {
      summary: getSummary(),
      jobs: getAllJobs(),
    });

    res.json({ ok: true, removed: removedCount });
  } catch (err) {
    console.error("Erro ao limpar pendentes:", err);
    res.status(500).json({ error: "Erro ao limpar chaves pendentes." });
  }
});

app.post('/api/clear-done', (req, res) => {
  try {
    const removedCount = deleteJobsByStatus([JOB_STATUS.DONE]);

    io.emit('queue_update', {
      summary: getSummary(),
      jobs: getAllJobs(),
    });

    res.json({ ok: true, removed: removedCount });
  } catch (err) {
    console.error("Erro ao limpar concluídos:", err);
    res.status(500).json({ error: "Erro ao limpar chaves concluídas." });
  }
});

app.post(
  '/api/formatador-bernardina/jobs',
  requireAuth,
  requireCsrf,
  uploadBernadina.array('files'),
  async (req, res) => {
    const exePath = process.env.BERNADINA_EXE_PATH;
    const baseTemplatePath = process.env.BERNADINA_TEMPLATE_PATH;

    if (!exePath) return res.status(500).json({ message: 'BERNADINA_EXE_PATH não configurado no .env' });
    if (!baseTemplatePath) return res.status(500).json({ message: 'BERNADINA_TEMPLATE_PATH não configurado no .env' });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'Envie pelo menos 1 .xlsx no campo "files".' });

    const jobId = `jb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const jobBase = path.join(BERNADINA_DIR, jobId);
    const inputDir = path.join(jobBase, 'input');
    const outputDir = path.join(jobBase, 'output');
    const statusPath = path.join(jobBase, 'job.json');

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // mover tmp -> input
    for (const f of files) {
      const safeName = path.basename(f.originalname || 'arquivo.xlsx').replace(/[^\w.\- ]+/g, '_');
      fs.renameSync(f.path, path.join(inputDir, safeName));
    }

    // IMPORTANTE: você PASSA outputPath (não deixa o C# jogar em "XLSX prontos")
    const outputPath = path.join(outputDir, `Agrupado-Bernadina-${jobId}.xlsm`);

    // status inicial do job
    const jobState = {
      jobId,
      status: 'processing',
      progress: 10,
      message: 'Iniciando...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      downloadUrl: null,
      logs: [{ ts: new Date().toISOString(), msg: `Arquivos recebidos: ${files.length}` }],
    };
    fs.writeFileSync(statusPath, JSON.stringify(jobState, null, 2), 'utf-8');

    await auditLog(req, 'job_create_formatador_bernardina', 'ok', { jobId, files: files.length });

    // responde IMEDIATO (JOB)
    res.json({ jobId });

    const appendLog = (msg) => {
      const cur = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      cur.logs = cur.logs || [];
      cur.logs.push({ ts: new Date().toISOString(), msg: String(msg).slice(0, 5000) });
      cur.updatedAt = new Date().toISOString();
      fs.writeFileSync(statusPath, JSON.stringify(cur, null, 2), 'utf-8');
    };

    const patch = (p) => {
      const cur = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      const next = { ...cur, ...p, updatedAt: new Date().toISOString() };
      fs.writeFileSync(statusPath, JSON.stringify(next, null, 2), 'utf-8');
    };

    try {
      patch({ progress: 30, message: 'Executando formatador (C#)...' });

      // A ORDEM DOS ARGS TEM QUE SER ESSA (igual Program.cs):
      // args[0]=inputDir, args[1]=outputPath, args[2]=baseTemplatePath
      const child = spawn(
        exePath,
        [inputDir, outputPath, baseTemplatePath],
        {
          windowsHide: true,
          cwd: jobBase, // <<< CRUCIAL pro Program.cs (template em branco vai parar aqui)
        }
      );

      child.stdout.on('data', (d) => appendLog(d.toString('utf8')));
      child.stderr.on('data', (d) => appendLog('[stderr] ' + d.toString('utf8')));

      child.on('close', async (code) => {
        // O C# retorna 0 no sucesso. Pode retornar 2 em validações (filiais faltando etc.)
        const outFiles = fs.existsSync(outputDir)
          ? fs.readdirSync(outputDir).filter((f) => f.toLowerCase().endsWith('.xlsm'))
          : [];

        if (code === 0 && outFiles.length > 0) {
          patch({
            status: 'done',
            progress: 100,
            message: 'Concluído.',
            downloadUrl: `/api/formatador-bernardina/jobs/${encodeURIComponent(jobId)}/download`,
          });
          appendLog('Concluído. Arquivo pronto.');
        } else {
          patch({
            status: 'error',
            progress: 100,
            message: `Falha no processamento (exitCode=${code}). Veja os logs.`,
          });

          await auditLog(req, 'job_error_formatador_bernardina', 'error', { jobId, exitCode: code });
        }
      });
    } catch (err) {
      appendLog('Erro interno: ' + (err?.message || String(err)));
      patch({ status: 'error', progress: 100, message: 'Erro interno ao executar o formatador.' });
    }
  }
);
app.get('/api/formatador-bernardina/jobs/:jobId', requireAuth, (req, res) => {
  const statusPath = path.join(BERNADINA_DIR, req.params.jobId, 'job.json');
  if (!fs.existsSync(statusPath)) return res.status(404).json({ message: 'Job não encontrado.' });
  res.json(JSON.parse(fs.readFileSync(statusPath, 'utf-8')));
});
app.get('/api/formatador-bernardina/jobs/:jobId/download', requireAuth, async (req, res) => {
  const outputDir = path.join(BERNADINA_DIR, req.params.jobId, 'output');
  if (!fs.existsSync(outputDir)) return res.status(404).send('Arquivo não encontrado.');

  const files = fs.readdirSync(outputDir).filter((f) => f.toLowerCase().endsWith('.xlsm'));
  if (!files.length) return res.status(404).send('Arquivo não encontrado.');

  await auditLog(req, 'job_download_formatador_bernardina', 'ok', { jobId: req.params.jobId });

  res.download(path.join(outputDir, files[0]), files[0]);
});

app.post('/api/clear-errors', (req, res) => {
  try {
    const removedCount = deleteJobsByStatus([JOB_STATUS.ERROR]);

    io.emit('queue_update', {
      summary: getSummary(),
      jobs: getAllJobs(),
    });

    res.json({ ok: true, removed: removedCount });
  } catch (err) {
    console.error("Erro ao limpar erros:", err);
    res.status(500).json({ error: "Erro ao limpar chaves com erro." });
  }
});

// endpoint de upload do arquivo com chaves
// endpoint de upload do arquivo com chaves
app.post('/upload', upload.single('file'), async (req, res) => {
  let tempFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não enviado' });
    }

    // garante que a pasta de uploads exista (já foi criada lá em cima, mas por segurança)
    if (!fs.existsSync(MAIN_UPLOAD_DIR)) {
      fs.mkdirSync(MAIN_UPLOAD_DIR, { recursive: true });
    }

    // cria um arquivo temporário a partir do buffer em memória (memoryStorage)
    tempFilePath = path.join(
      MAIN_UPLOAD_DIR,
      `${Date.now()}-${req.file.originalname}`
    );

    fs.writeFileSync(tempFilePath, req.file.buffer);

    // agora o parser continua igual, baseado em caminho de arquivo
    const keys = parseFileToKeys(tempFilePath, req.file.originalname);
    const createdJobs = createJobsFromKeys(keys);

    // emitir atualização da fila para todos conectados
    io.emit('queue_update', {
      summary: getSummary(),
      jobs: getAllJobs(),
    });

    return res.json({
      message: `Arquivo processado. ${createdJobs.length} chaves adicionadas à fila.`,
      count: createdJobs.length,
    });
  } catch (err) {
    console.error('Erro ao processar upload:', err);
    return res.status(500).json({ error: 'Erro ao processar arquivo' });
  } finally {
    // tenta apagar o arquivo temporário, se foi criado
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlink(tempFilePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error(
            'Não foi possível apagar arquivo temporário de upload:',
            unlinkErr
          );
        }
      });
    }
  }
});

// endpoint para pegar estado atual (útil quando entrar na página)
app.get('/status', (req, res) => {
  res.json({
    summary: getSummary(),
    jobs: getAllJobs(),
  });
});

// quando um cliente conecta via WebSocket
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  // manda estado atual
  socket.emit('queue_update', {
    summary: getSummary(),
    jobs: getAllJobs(),
  });
});

// função utilitária para o worker/qualquer um emitir atualizações
function broadcastJobUpdate(job) {
  io.emit('job_update', job);
  io.emit('queue_update', {
    summary: getSummary(),
    jobs: getAllJobs(),
  });
}

module.exports = {
  server,
  broadcastJobUpdate,
};

// ----------------------------------------------------------------------
// SIMPLES NACIONAL – CADASTRO, RESUMO E DECLARAÇÃO EM LOTE
// ----------------------------------------------------------------------

// pasta de dados (para empresas SN e resumo de consumo)

const SN_COMPANIES_FILE = path.join(DATA_DIR, 'sn_companies.json');

// ---------- FUNÇÕES AUXILIARES (RESUMO DE CONSUMO SN) ----------

function loadSnSummary() {
  if (!fs.existsSync(SN_SUMMARY_FILE)) {
    return {
      totalRequisicoes: 0,
      totalSucesso: 0,
      totalErro: 0,
      ultimaAtualizacao: null,
    };
  }
  try {
    return JSON.parse(fs.readFileSync(SN_SUMMARY_FILE, 'utf-8'));
  } catch (e) {
    console.error('Erro ao ler sn_summary.json:', e);
    return {
      totalRequisicoes: 0,
      totalSucesso: 0,
      totalErro: 0,
      ultimaAtualizacao: null,
    };
  }
}

function saveSnSummary(summary) {
  summary.ultimaAtualizacao = new Date().toISOString();
  fs.writeFileSync(SN_SUMMARY_FILE, JSON.stringify(summary, null, 2));
}

function registrarSnResultado(sucesso) {
  const summary = loadSnSummary();
  summary.totalRequisicoes += 1;
  if (sucesso) summary.totalSucesso += 1;
  else summary.totalErro += 1;
  saveSnSummary(summary);
  return summary;
}

// ----------------------------------------------------------------------
// SIMPLES NACIONAL – DB (Postgres), resumo e envio/consulta em lote
// ----------------------------------------------------------------------

// Pool do Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

// ---------- FUNÇÕES AUXILIARES (Entregador MIT) ----------
// Upload em memória para o arquivo JSON do MIT
const mitUpload = multer({ storage: multer.memoryStorage() });

// Helpers para CNPJ (12 dígitos -> 14 dígitos) reutilizando a lógica do Python
function calcularDvsCnpj12(primeiros12) {
  if (!primeiros12 || primeiros12.length !== 12 || !/^\d+$/.test(primeiros12)) {
    throw new Error('Base de CNPJ inválida (esperado 12 dígitos numéricos).');
  }

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma1 = 0;
  for (let i = 0; i < 12; i++) {
    soma1 += parseInt(primeiros12[i], 10) * pesos1[i];
  }
  const resto1 = soma1 % 11;
  const dv1 = resto1 < 2 ? 0 : 11 - resto1;

  const pesos2 = [6].concat(pesos1);
  const base13 = primeiros12 + String(dv1);
  let soma2 = 0;
  for (let i = 0; i < 13; i++) {
    soma2 += parseInt(base13[i], 10) * pesos2[i];
  }
  const resto2 = soma2 % 11;
  const dv2 = resto2 < 2 ? 0 : 11 - resto2;

  return `${dv1}${dv2}`;
}

function extrairCnpjContribuinteDeNomeArquivo(nomeArquivo) {
  const match = (nomeArquivo || '').match(/(\d{8})/);
  if (!match) {
    throw new Error(
      'Não foi possível localizar 8 dígitos de CNPJ no nome do arquivo JSON do MIT.'
    );
  }
  const raiz8 = match[1]; // primeiros 8 dígitos
  const base12 = `${raiz8}0001`; // assume sempre matriz "0001"
  const dvs = calcularDvsCnpj12(base12);
  return base12 + dvs; // 14 dígitos
}

// ---------- FUNÇÕES AUXILIARES: EMPRESAS (Postgres) ----------

async function dbGetSnCompanies() {
  const result = await pool.query(
    'SELECT id, cnpj, razao_social FROM sn_companies ORDER BY razao_social'
  );
  return result.rows.map((r) => ({
    id: r.id,
    cnpj: r.cnpj,
    razaoSocial: r.razao_social,
  }));
}

async function dbCreateSnCompany(cnpj, razaoSocial) {
  const result = await pool.query(
    'INSERT INTO sn_companies (cnpj, razao_social) VALUES ($1, $2) RETURNING id, cnpj, razao_social',
    [cnpj, razaoSocial]
  );
  const r = result.rows[0];
  return {
    id: r.id,
    cnpj: r.cnpj,
    razaoSocial: r.razao_social,
  };
}

// ---------- FUNÇÕES AUXILIARES: RECIBOS (Postgres) ----------

async function dbGetReceiptByCompanyAndPa(companyId, pa) {
  const result = await pool.query(
    'SELECT id FROM sn_receipts WHERE company_id = $1 AND pa = $2',
    [companyId, pa]
  );
  return result.rows[0] || null;
}

async function dbSaveReceipt(companyId, pa, pdfBuffer) {
  const result = await pool.query(
    'INSERT INTO sn_receipts (company_id, pa, pdf) VALUES ($1, $2, $3) RETURNING id',
    [companyId, pa, pdfBuffer]
  );
  return result.rows[0];
}

async function dbGetReceiptById(id) {
  const result = await pool.query(
    'SELECT pdf FROM sn_receipts WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function dbGetReceiptsByIds(ids) {
  if (!ids || ids.length === 0) return [];

  const result = await pool.query(
    `
      SELECT
        r.id,
        r.company_id,
        r.pa,
        r.pdf,
        c.cnpj,
        c.razao_social
      FROM sn_receipts r
      JOIN sn_companies c ON c.id = r.company_id
      WHERE r.id = ANY($1::int[])
    `,
    [ids]
  );

  return result.rows;
}

// ---------- FUNÇÕES AUXILIARES: RESUMO (JSON) ----------

function loadSnSummary() {
  if (!fs.existsSync(SN_SUMMARY_FILE)) {
    return {
      totalOperacoes: 0,      // declarações + consultas
      totalDeclaracoes: 0,
      totalConsultas: 0,
      totalSucesso: 0,
      totalErro: 0,
      valorTotal: 0,          // em R$
      ultimaAtualizacao: null,
    };
  }
  try {
    return JSON.parse(fs.readFileSync(SN_SUMMARY_FILE, 'utf-8'));
  } catch (e) {
    console.error('Erro ao ler sn_summary.json:', e);
    return {
      totalOperacoes: 0,
      totalDeclaracoes: 0,
      totalConsultas: 0,
      totalSucesso: 0,
      totalErro: 0,
      valorTotal: 0,
      ultimaAtualizacao: null,
    };
  }
}

function saveSnSummary(summary) {
  summary.ultimaAtualizacao = new Date().toISOString();
  fs.writeFileSync(SN_SUMMARY_FILE, JSON.stringify(summary, null, 2));
}

// mesma tabela de preço que você já tinha
function calculateDeclarationCost(consumption) {
  if (consumption <= 100) return 0.40;
  if (consumption <= 500) return 0.36;
  if (consumption <= 1_000) return 0.32;
  if (consumption <= 3_000) return 0.28;
  if (consumption <= 5_000) return 0.24;
  if (consumption <= 8_000) return 0.20;
  if (consumption <= 10_000) return 0.16;
  return 0.12;
}

/**
 * tipoOperacao: 'declaracao' | 'consulta'
 */
function registrarSnResultado(sucesso, tipoOperacao) {
  const summary = loadSnSummary();

  summary.totalOperacoes += 1;
  if (tipoOperacao === 'declaracao') summary.totalDeclaracoes += 1;
  if (tipoOperacao === 'consulta') summary.totalConsultas += 1;
  if (sucesso) summary.totalSucesso += 1;
  else summary.totalErro += 1;

  const unitPrice = calculateDeclarationCost(summary.totalOperacoes);
  summary.valorTotal += unitPrice;

  saveSnSummary(summary);
  return summary;
}

function buildResumoResponse() {
  const summary = loadSnSummary();
  const consumoAtual = summary.totalOperacoes;
  const precoUnitario = calculateDeclarationCost(consumoAtual);
  return {
    consumoAtual,
    totalDeclaracoes: summary.totalDeclaracoes,
    totalConsultas: summary.totalConsultas,
    totalSucesso: summary.totalSucesso,
    totalErro: summary.totalErro,
    precoUnitario,
    valorTotal: summary.valorTotal,
    ultimaAtualizacao: summary.ultimaAtualizacao,
  };
}

// ----------------------------------------------------------------------
// ACERTOS LOTES INTERNETS – CONTÁBIL
// ----------------------------------------------------------------------

// Palavras-chave iguais ao script Python original
const LOTE_INTERNETS_KEYWORDS = [
  'rendimento',
  'desconto obtido',
  'pagamento',
  'pagar',
  'adiantamento a fornecedor',
  'adiantamento ao fornecedor',
  'distribuicao',
  'transf. caixa',
  'cesta de relacionamento',
  'tarifa cobranca',
];

function loteInternetsHistoricoContemPalavra(linhaH) {
  if (!linhaH) return false;
  const texto = String(linhaH).toLowerCase();
  return LOTE_INTERNETS_KEYWORDS.some((palavra) => texto.includes(palavra));
}

function processarLoteInternetsConteudo(conteudo) {
  if (typeof conteudo !== 'string') {
    conteudo = conteudo ? String(conteudo) : '';
  }

  // Descobre se o arquivo original usava CRLF (\r\n) ou LF (\n)
  const usaCRLF = conteudo.includes('\r\n');
  const separador = usaCRLF ? '\r\n' : '\n';

  // Quebra em linhas (mantendo linhas vazias no array)
  const linhas = conteudo.split(/\r?\n/);

  const linhasMantidas = [];
  const linhasRemovidas = [];

  let i = 0;
  while (i < linhas.length) {
    const linhaAtual = linhas[i];

    if (linhaAtual && linhaAtual.startsWith('L') && i + 1 < linhas.length) {
      const proximaLinha = linhas[i + 1];

      if (
        proximaLinha &&
        proximaLinha.startsWith('H') &&
        loteInternetsHistoricoContemPalavra(proximaLinha)
      ) {
        // Remove L e H (adiciona ambas à lista de removidas)
        linhasRemovidas.push(linhaAtual, proximaLinha);
        i += 2;
        continue;
      }
    }

    // Caso não tenha sido removida, mantemos a linha atual
    linhasMantidas.push(linhaAtual);
    i += 1;
  }

  const processedContent = linhasMantidas.join(separador);
  const removedContent = linhasRemovidas.join(separador);

  return {
    totalLines: linhas.length,
    keptLines: linhasMantidas.length,
    removedLines: linhasRemovidas.length,
    removedPairs: Math.floor(linhasRemovidas.length / 2),
    processedContent,
    removedContent,
  };
}

function getTextFromUploadedFile(file) {
  if (!file) return '';
  // Preferencialmente memória (multer.memoryStorage)
  if (file.buffer) {
    return file.buffer.toString('utf-8');
  }
  // Fallback: se estiver gravado em disco
  if (file.path && fs.existsSync(file.path)) {
    return fs.readFileSync(file.path, 'utf-8');
  }
  return '';
}
// ---------- ROTAS DE PÁGINA ----------

async function criarZipComPdfs(pastaPdfs, destinoZip) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destinoZip);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(pastaPdfs, false);
    archive.finalize();
  });
}

// Página de login (pública)
app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

// --- Páginas protegidas (exemplos) ---
// Ajuste suas rotas existentes para incluir checagem:
// app.get('/', ...), app.get('/nfe', ...), etc.
// Exemplo:
// app.get('/', async (req, res) => { ... })  ==>  app.get('/', requireAuthPage, async (req,res)=>{...})

app.get('/sn', requireAuthPage, logPageView('page_view_sn'), (req, res) => {
  res.sendFile(path.join(publicDir, 'sn.html'));
});

app.get('/formatador-bernardina', requireAuthPage, (req, res) => {
  res.sendFile(path.join(publicDir, 'formatador-bernardina.html'));
});

app.get('/formatador-bernadina', (req, res) => {
  res.redirect('/formatador-bernardina');
});

// ---------- ROTAS API SN: EMPRESAS + RESUMO + RECIBO ----------

// lista empresas cadastradas (Postgres)
app.get('/api/sn/companies', requireAuth, async (req, res) => {
  try {
    const companies = await dbGetSnCompanies();
    res.json(companies);
  } catch (err) {
    console.error('Erro ao listar empresas SN:', err);
    res.status(500).json({ error: 'Erro ao listar empresas.' });
  }
});

// cadastra nova empresa SN
app.post('/api/sn/companies', requireAuth, requireCsrf, async (req, res) => {
  try {
    const { cnpj, razaoSocial } = req.body;

    if (!cnpj || !razaoSocial) {
      return res
        .status(400)
        .json({ error: 'Campos obrigatórios: cnpj e razaoSocial.' });
    }

    const existing = await pool.query(
      'SELECT 1 FROM sn_companies WHERE cnpj = $1',
      [cnpj]
    );
    if (existing.rowCount > 0) {
      return res
        .status(400)
        .json({ error: 'Já existe empresa cadastrada com este CNPJ.' });
    }

    const newCompany = await dbCreateSnCompany(cnpj, razaoSocial);
    res.status(201).json(newCompany);
  } catch (err) {
    console.error('Erro ao cadastrar empresa SN:', err);
    res.status(500).json({ error: 'Erro ao cadastrar empresa.' });
  }
});

// resumo de consumo (inclui valor total em R$)
app.get('/api/sn/summary', requireAuth, async (req, res) => {
  try {
    res.json(buildResumoResponse());
  } catch (err) {
    console.error('Erro ao carregar resumo SN:', err);
    res.status(500).json({ error: 'Erro ao carregar resumo.' });
  }
});

// download de recibo em PDF
app.get('/api/sn/receipt/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).send('ID inválido');

  try {
    const receipt = await dbGetReceiptById(id);
    if (!receipt) return res.status(404).send('Recibo não encontrado');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="recibo-sn-${receipt.cnpj || 'cnpj'}-${receipt.pa}.pdf"`
    );
    res.send(receipt.pdf); // Buffer do BYTEA
  } catch (err) {
    console.error('Erro ao buscar recibo:', err);
    res.status(500).send('Erro ao buscar recibo');
  }
});

// --- Nova página: calculadora-icms-st ---

app.get('/calculadora-icms-st', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'calculadora-icms-st.html'));
});

// --- Nova página: Envio MIT Apuração DCTFWeb ---
app.get('/mit', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'mit.html'));
});

// ---------- ROTA: DOWNLOAD ZIP COM VÁRIOS RECIBOS ----------
// ---------- ROTA: DOWNLOAD ZIP COM VÁRIOS RECIBOS ----------
app.post('/api/sn/receipts/batch-download', requireAuth, requireCsrf, async (req, res) => {
  try {
    const { receiptIds } = req.body;

    if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res
        .status(400)
        .json({ error: 'Nenhum recibo selecionado para download.' });
    }

    const idsNum = receiptIds.map(Number).filter((n) => !isNaN(n));

    const receipts = await dbGetReceiptsByIds(idsNum);

    if (!receipts || receipts.length === 0) {
      return res.status(404).json({ error: 'Recibos não encontrados.' });
    }

    const nomeZip = `recibos-sn-${Date.now()}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nomeZip}"`
    );

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error('Erro ao gerar ZIP:', err);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    archive.pipe(res);

    for (const r of receipts) {
      const cnpj = (r.cnpj || '').replace(/\D/g, '') || `company${r.company_id}`;
      const paStr = String(r.pa);
      const filename = `RECIBO-${cnpj}-${paStr}.pdf`;

      archive.append(r.pdf, { name: filename });
    }

    archive.finalize();
  } catch (err) {
    console.error('Erro geral no batch-download de recibos SN:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao gerar ZIP de recibos.' });
    }
  }
});

// ---------- ROTA: DECLARAÇÃO SN EM LOTE ----------

app.post('/api/sn/declaration', requireAuth, requireCsrf, async (req, res) => {
  try {
    const {
      pa,                         // já no formato AAAAMM (montado no front a partir de mês/ano)
      tipoDeclaracao = 1,
      receitaInterna = 0,
      receitaExterna = 0,
      indicadorTransmissao = true,
      indicadorComparacao = false,
      valoresParaComparacao = null,
      complemento = null,
      estabelecimentos: estabelecimentosEntrada = null,
      companyIds = null,
      all = false,
    } = req.body;

    const contratante = process.env.CNPJ_CONTRATANTE;

    if (!pa) {
      return res
        .status(400)
        .json({ error: 'Período de apuração (pa) é obrigatório.' });
    }

    // empresas que serão processadas
    const empresasCadastradas = await dbGetSnCompanies();
    let empresasParaProcessar = [];

    if (all || (Array.isArray(companyIds) && companyIds.length > 0)) {
      if (all) {
        empresasParaProcessar = empresasCadastradas;
      } else {
        const idsNum = companyIds.map(Number);
        empresasParaProcessar = empresasCadastradas.filter((c) =>
          idsNum.includes(c.id)
        );
      }
    } else {
      return res
        .status(400)
        .json({ error: 'Selecione pelo menos uma empresa.' });
    }

    if (empresasParaProcessar.length === 0) {
      return res
        .status(400)
        .json({ error: 'Nenhuma empresa encontrada para processar.' });
    }

    // autenticação Serpro
    const { access_token, jwt_token } = await autenticarSerpro();

    if (!access_token || !jwt_token) {
      return res.status(500).json({
        error:
          'access_token ou jwt_token não retornado pelo SERPRO. Verifique o endpoint /authenticate e as credenciais.',
      });
    }

    const headers = {
      Authorization: 'Bearer ' + access_token,
      jwt_token: jwt_token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const url =
      'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Declarar';

    const resultados = [];

    for (const empresa of empresasParaProcessar) {
      try {
        let estabelecimentos;

        if (Array.isArray(estabelecimentosEntrada) && estabelecimentosEntrada.length > 0) {
          estabelecimentos = estabelecimentosEntrada;
        } else {
          estabelecimentos = [
            {
              cnpjCompleto: empresa.cnpj,
            },
          ];
        }

        const declaracaoObj = {
          tipoDeclaracao,
          receitaPaCompetenciaInterno: receitaInterna,
          receitaPaCompetenciaExterno: receitaExterna,
          ...(complemento || {}),
          estabelecimentos,
        };

        const dadosPGDAS = {
          cnpjCompleto: empresa.cnpj,
          pa: Number(pa),
          indicadorTransmissao,
          indicadorComparacao,
          declaracao: declaracaoObj,
        };

        if (valoresParaComparacao && indicadorComparacao) {
          dadosPGDAS.valoresParaComparacao = valoresParaComparacao;
        }

        const payload = {
          contratante: { numero: contratante, tipo: 2 },
          autorPedidoDados: { numero: contratante, tipo: 2 },
          contribuinte: { numero: empresa.cnpj, tipo: 2 },
          pedidoDados: {
            idSistema: 'PGDASD',
            idServico: 'TRANSDECLARACAO11',
            versaoSistema: '1.0',
            dados: JSON.stringify(dadosPGDAS),
          },
        };

        const apiResp = await axios.post(url, payload, { headers });

        registrarSnResultado(true, 'declaracao');

        resultados.push({
          tipo: 'declaracao',
          cnpj: empresa.cnpj,
          razaoSocial: empresa.razaoSocial || '',
          sucesso: true,
          status: apiResp.status,
          mensagens:
            apiResp.data && apiResp.data.mensagens ? apiResp.data.mensagens : [],
          receiptId: null,
          fromCache: false,
        });
      } catch (errEnvio) {
        console.error(
          'Erro ao declarar CNPJ',
          empresa.cnpj,
          errEnvio.response ? errEnvio.response.data : errEnvio.message
        );

        registrarSnResultado(false, 'declaracao');

        const status = errEnvio.response ? errEnvio.response.status : 500;
        const mensagens =
          errEnvio.response &&
            errEnvio.response.data &&
            errEnvio.response.data.mensagens
            ? errEnvio.response.data.mensagens
            : null;

        resultados.push({
          tipo: 'declaracao',
          cnpj: empresa.cnpj,
          razaoSocial: empresa.razaoSocial || '',
          sucesso: false,
          status,
          error: errEnvio.message,
          mensagens,
          receiptId: null,
          fromCache: false,
        });
      }
    }

    res.json({
      resultados,
      resumoConsumo: buildResumoResponse(),
    });
  } catch (err) {
    console.error('Erro geral ao enviar declarações SN:', err);
    res.status(500).json({ error: err.message || 'Erro ao enviar declarações.' });
  }
});

// ---------- ROTA: CONSULTA ÚLTIMO RECIBO POR PERÍODO ----------

// ---------- ROTA: CONSULTA ÚLTIMA DECLARAÇÃO / RECIBO POR PA ----------
app.post('/api/sn/consult-last', requireAuth, requireCsrf, async (req, res) => {
  try {
    const {
      pa,                // AAAAMM, ex: 202511
      companyIds = null,
      all = false,
    } = req.body;

    const contratante = process.env.CNPJ_CONTRATANTE;

    if (!pa) {
      return res
        .status(400)
        .json({ error: 'Período de apuração (pa) é obrigatório.' });
    }

    // 1) Carrega empresas cadastradas
    const empresasCadastradas = await dbGetSnCompanies();
    let empresasParaProcessar = [];

    if (all) {
      empresasParaProcessar = empresasCadastradas;
    } else if (Array.isArray(companyIds) && companyIds.length > 0) {
      const idsNum = companyIds.map(Number);
      empresasParaProcessar = empresasCadastradas.filter((c) =>
        idsNum.includes(c.id)
      );
    } else {
      return res
        .status(400)
        .json({ error: 'Selecione pelo menos uma empresa.' });
    }

    if (empresasParaProcessar.length === 0) {
      return res
        .status(400)
        .json({ error: 'Nenhuma empresa encontrada para processar.' });
    }

    // 2) Autentica no SERPRO
    const { access_token, jwt_token } = await autenticarSerpro();

    if (!access_token) {
      return res.status(500).json({
        error:
          'access_token não retornado pelo SERPRO. Verifique o endpoint /authenticate e as credenciais.',
      });
    }

    // PRODUÇÃO:
    const url =
      'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Consultar';
    // Se quiser testar no ambiente trial, troque pela linha abaixo:
    // const url = 'https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1/Consultar';

    const headers = {
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (jwt_token) {
      headers.jwt_token = jwt_token;   // obrigatório em produção
    }

    const resultados = [];
    const paStr = String(pa); // "202511"

    // helper para tentar transformar data.dados em Buffer de PDF
    // helper para tentar transformar data.dados em Buffer de PDF
    // helper para tentar transformar data.dados em Buffer de PDF
    function decodePdfFromDados(dadosStr) {
      if (!dadosStr) return null;

      // 1) Tenta direto: dadosStr é base64 de PDF
      try {
        const bufBase64 = Buffer.from(dadosStr, 'base64');
        const sig1 = bufBase64.slice(0, 5).toString();
        if (sig1 === '%PDF-') {
          return bufBase64;
        }
      } catch (_) {
        // ignora, vamos tentar outras formas
      }

      // 2) Tenta interpretar dadosStr como JSON
      try {
        const jsonDados = JSON.parse(dadosStr);

        // 2.1 caminho mais provável: json.recibo.pdf
        if (
          jsonDados.recibo &&
          typeof jsonDados.recibo.pdf === 'string'
        ) {
          try {
            const buf = Buffer.from(jsonDados.recibo.pdf, 'base64');
            const sig = buf.slice(0, 5).toString();
            if (sig === '%PDF-') {
              return buf;
            }
          } catch (_) {
            // se der erro, cai pro restante da busca
          }
        }

        // 2.2 busca recursiva em qualquer campo string que seja base64 de PDF
        function buscaPdfEmObjeto(obj) {
          if (!obj || typeof obj !== 'object') return null;

          for (const [chave, val] of Object.entries(obj)) {
            if (typeof val === 'string') {
              try {
                const buf = Buffer.from(val, 'base64');
                const sig = buf.slice(0, 5).toString();
                if (sig === '%PDF-') {
                  return buf;
                }
              } catch (_) {
                // não era base64 válido, segue
              }
            } else if (val && typeof val === 'object') {
              const achou = buscaPdfEmObjeto(val);
              if (achou) return achou;
            }
          }
          return null;
        }

        const bufEncontrado = buscaPdfEmObjeto(jsonDados);
        if (bufEncontrado) return bufEncontrado;

      } catch (_) {
        // dadosStr não é JSON, segue
      }

      // 3) Por último, assume que dadosStr já é o texto do PDF
      try {
        const bufUtf8 = Buffer.from(String(dadosStr), 'utf8');
        const sig3 = bufUtf8.slice(0, 5).toString();
        if (sig3 === '%PDF-') {
          return bufUtf8;
        }
      } catch (_) {
        // nada a fazer
      }

      // Nenhuma das tentativas funcionou
      return null;
    }

    for (const empresa of empresasParaProcessar) {
      try {
        // 3) Checa se já existe recibo no banco
        let receiptRow = await dbGetReceiptByCompanyAndPa(empresa.id, pa);
        let fromCache = false;
        let receiptId = null;

        if (receiptRow) {
          fromCache = true;
          receiptId = receiptRow.id;
        } else {
          // 4) Monta payload conforme doc (CONSULTIMADECREC14)
          const payload = {
            contratante: { numero: contratante, tipo: 2 },
            autorPedidoDados: { numero: contratante, tipo: 2 },
            contribuinte: { numero: empresa.cnpj, tipo: 2 },
            pedidoDados: {
              idSistema: 'PGDASD',
              idServico: 'CONSULTIMADECREC14',
              versaoSistema: '1.0',
              dados: JSON.stringify({ periodoApuracao: paStr }),
            },
          };

          const apiResp = await axios.post(url, payload, { headers });
          const data = apiResp.data;

          console.log('--- RESPOSTA SERPRO CONSULTIMADECREC14 ---');
          console.log('status:', data.status);
          console.log('mensagens:', data.mensagens);
          console.log('dados (primeiros 200 chars):', String(data.dados).slice(0, 200));


          // Exemplo de retorno:
          // { status: 200, dados: "<string>", mensagens: [...] }

          if (data.status && data.status !== 200) {
            // a própria API está dizendo que deu erro de negócio
            registrarSnResultado(false, 'consulta');
            resultados.push({
              tipo: 'consulta',
              cnpj: empresa.cnpj,
              razaoSocial: empresa.razaoSocial || '',
              sucesso: false,
              status: data.status,
              error: 'Erro de negócio retornado pela API.',
              mensagens: data.mensagens || null,
              receiptId: null,
              fromCache: false,
            });
            continue;
          }

          // tenta extrair PDF de data.dados
          // tenta extrair PDF de data.dados
          const pdfBuffer = decodePdfFromDados(data.dados);

          if (!pdfBuffer) {
            // A API respondeu, mas não veio um PDF válido no campo "dados".
            // Podemos ter 2 cenários:
            //  - Mensagem de sucesso de negócio (ex: [[Sucesso-PGDASD]])
            //  - Algum outro erro lógico

            const statusApi = data.status || apiResp.status;
            const mensagensApi = data.mensagens || null;
            const temMensagemSucesso =
              Array.isArray(mensagensApi) &&
              mensagensApi.some(
                (m) =>
                  m &&
                  typeof m.texto === 'string' &&
                  m.texto.toLowerCase().includes('sucesso')
              );

            if (temMensagemSucesso || statusApi === 200) {
              // Consulta foi bem-sucedida do ponto de vista do SERPRO,
              // mas não há recibo em PDF para salvar.
              registrarSnResultado(true, 'consulta');

              resultados.push({
                tipo: 'consulta',
                cnpj: empresa.cnpj,
                razaoSocial: empresa.razaoSocial || '',
                sucesso: true,                 // <<< agora aparece "Sucesso" na tabela
                status: statusApi,
                error: null,
                mensagens: mensagensApi,
                receiptId: null,               // sem PDF, então sem link
                fromCache: false,
              });
            } else {
              // Aqui sim tratamos como erro de fato
              registrarSnResultado(false, 'consulta');

              resultados.push({
                tipo: 'consulta',
                cnpj: empresa.cnpj,
                razaoSocial: empresa.razaoSocial || '',
                sucesso: false,
                status: statusApi,
                error: 'Resposta não contém PDF válido em "dados".',
                mensagens: mensagensApi,
                receiptId: null,
                fromCache: false,
              });
            }

            continue;
          }


          // 5) Salva no banco
          const saved = await dbSaveReceipt(empresa.id, pa, pdfBuffer);
          receiptId = saved.id;

          registrarSnResultado(true, 'consulta');
        }

        resultados.push({
          tipo: 'consulta',
          cnpj: empresa.cnpj,
          razaoSocial: empresa.razaoSocial || '',
          sucesso: true,
          status: 200,
          mensagens: null,
          receiptId,
          fromCache,
        });
      } catch (errConsulta) {
        // 6) Tratamento de erro HTTP (403, 500, etc.)
        let status = 500;
        let mensagens = null;
        let errorMsg = errConsulta.message;
        let logText = null;

        if (errConsulta.response) {
          status = errConsulta.response.status || 500;

          const raw = errConsulta.response.data;
          if (Buffer.isBuffer(raw)) {
            logText = raw.toString('utf8');
          } else if (typeof raw === 'string') {
            logText = raw;
          } else if (typeof raw === 'object' && raw !== null) {
            logText = JSON.stringify(raw);
          }

          if (logText) {
            try {
              const json = JSON.parse(logText);
              if (Array.isArray(json.mensagens)) {
                mensagens = json.mensagens;
              }
            } catch (_) { }
          }
        }

        console.error(
          'Erro ao consultar recibo SN para CNPJ',
          empresa.cnpj,
          logText || errorMsg
        );

        registrarSnResultado(false, 'consulta');

        resultados.push({
          tipo: 'consulta',
          cnpj: empresa.cnpj,
          razaoSocial: empresa.razaoSocial || '',
          sucesso: false,
          status,
          error: errorMsg,
          mensagens,
          receiptId: null,
          fromCache: false,
        });
      }
    }

    res.json({
      resultados,
      resumoConsumo: buildResumoResponse(),
    });
  } catch (err) {
    console.error('Erro geral ao consultar últimos recibos SN:', err);
    res
      .status(500)
      .json({ error: err.message || 'Erro ao consultar recibos.' });
  }
});

// --- Nova página: separador-pdf-relatorio-de-ferias ---

app.get('/separador-pdf-relatorio-de-ferias', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'separador-pdf-relatorio-de-ferias.html'));
});
// --- API da ferramenta separador-pdf-relatorio-de-ferias ---
app.post(
  '/api/separador-pdf-relatorio-de-ferias/processar',
  uploadSeparadorFerias.single('arquivoPdf'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo PDF enviado.' });
      }

      const competencia = (req.body.competencia || '').trim();
      if (!competencia) {
        return res.status(400).json({ error: 'Competência não informada.' });
      }

      const inputPdfPath = req.file.path;

      // Chamada ao backend Python (FastAPI)
      const pyUrl =
        process.env.SEPARADOR_FERIAS_API_URL ||
        'http://localhost:8001/api/separador-pdf-relatorio-de-ferias/processar';

      const pyResp = await axios.post(pyUrl, {
        input_pdf_path: inputPdfPath,
        competencia,
      });

      if (!pyResp.data || !pyResp.data.ok || !pyResp.data.zip_path) {
        console.error('Resposta inesperada do backend Python:', pyResp.data);
        return res.status(500).json({ error: 'Erro ao gerar ZIP no backend Python.' });
      }

      const zipPath = pyResp.data.zip_path;

      // Stream do ZIP para o navegador
      if (!fs.existsSync(zipPath)) {
        return res.status(500).json({ error: 'Arquivo ZIP não encontrado após processamento.' });
      }

      const zipFilename = path.basename(zipPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

      const stream = fs.createReadStream(zipPath);
      stream.on('error', (err) => {
        console.error('Erro ao ler ZIP gerado:', err);
        res.status(500).end('Erro ao enviar ZIP.');
      });

      stream.pipe(res);
    } catch (err) {
      console.error('Erro em /api/separador-pdf-relatorio-de-ferias/processar:', err);
      return res.status(500).json({ error: 'Erro ao processar requisição.' });
    }
  }
);

// Página: Separador Holerites por Empresa

app.get('/separador-holerites-por-empresa', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'separador-holerites-por-empresa.html'));
});

// API: Separador de Holerites por Empresa (chama serviço FastAPI em Python)
app.post(
  '/api/separador-holerites-por-empresa',
  upload.single('pdf'),
  async (req, res) => {
    try {
      const file = req.file;
      const { competencia } = req.body;

      if (!file) {
        return res.status(400).json({ error: 'Arquivo PDF não enviado.' });
      }

      if (!competencia) {
        return res.status(400).json({ error: 'Competência é obrigatória.' });
      }

      // Monta form-data para enviar ao serviço Python
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('pdf', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype || 'application/pdf',
      });
      formData.append('competencia', competencia);

      // URL do serviço Python (ajuste se usar outra porta/host)
      const pythonUrl = process.env.HOLERITES_SERVICE_URL ||
        `${PY_BASE_URL}/processar-holerites-por-empresa`;

      const response = await axios.post(pythonUrl, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        responseType: 'stream',
      });

      // Repassa o ZIP (stream) para o cliente
      res.setHeader(
        'Content-Disposition',
        response.headers['content-disposition'] ||
        'attachment; filename="holerites_empresas.zip"'
      );
      res.setHeader(
        'Content-Type',
        response.headers['content-type'] || 'application/zip'
      );

      response.data.pipe(res);
    } catch (err) {
      console.error('Erro na API /api/separador-holerites-por-empresa:', err);

      // Se veio um erro HTTP do Python, tenta repassar mensagem
      if (err.response && err.response.data) {
        let errorMsg = 'Erro ao processar o PDF.';
        try {
          // caso a resposta do Python seja JSON {detail: "..."} ou {error: "..."}
          if (typeof err.response.data === 'string') {
            errorMsg = err.response.data;
          } else if (err.response.data.detail) {
            errorMsg = err.response.data.detail;
          } else if (err.response.data.error) {
            errorMsg = err.response.data.error;
          }
        } catch (_) { }

        return res.status(err.response.status || 500).json({ error: errorMsg });
      }

      return res
        .status(500)
        .json({ error: 'Erro interno ao chamar o serviço de holerites.' });
    }
  }
);

app.get('/separador-ferias-funcionario', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'separador-ferias-funcionario.html'));
});

// Processamento de PDF de férias por funcionário
app.post(
  '/api/separador-ferias-funcionario/process',
  uploadSeparadorFerias.single('file'), // usa disk storage (com .path)
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: 'Nenhum arquivo enviado.',
        });
      }

      // Se você criou o FERIAS_FUNC_DIR, mantém esse bloco:
      if (!fs.existsSync(FERIAS_FUNC_DIR)) {
        fs.mkdirSync(FERIAS_FUNC_DIR, { recursive: true });
      }

      const originalPath = req.file.path; // agora vem preenchido
      const finalPath = path.join(
        FERIAS_FUNC_DIR,
        `${Date.now()}-${req.file.originalname}`
      );

      fs.renameSync(originalPath, finalPath);

      const pyResp = await axios.post(
        `${PY_BASE_URL}/api/ferias-funcionario/processar`,
        {
          pdf_path: finalPath,
        }
      );

      const data = pyResp.data || {};
      if (!data.ok) {
        return res.status(500).json({
          ok: false,
          error:
            data.error || 'Falha ao processar o PDF de férias no backend Python.',
        });
      }

      const zipPath = data.zip_path;
      const zipName = path.basename(zipPath);
      const downloadUrl = `/api/separador-ferias-funcionario/download/${encodeURIComponent(
        zipName
      )}`;

      return res.json({
        ok: true,
        message: 'PDF de férias processado com sucesso.',
        empresa: data.empresa,
        total_paginas: data.total_paginas,
        total_funcionarios: data.total_funcionarios,
        arquivos: data.arquivos || [],
        download_url: downloadUrl,
      });
    } catch (err) {
      console.error('Erro em /api/separador-ferias-funcionario/process:', err);
      return res.status(500).json({
        ok: false,
        error: 'Erro interno ao processar o PDF de férias.',
      });
    }
  }
);

// Download do ZIP de férias por funcionário
// Download do ZIP de férias por funcionário
app.get(
  '/api/separador-ferias-funcionario/download/:zipName',
  (req, res) => {
    try {
      const zipName = req.params.zipName;
      const zipPath = path.join(FERIAS_FUNC_DIR, zipName);

      if (!fs.existsSync(zipPath)) {
        return res.status(404).json({
          ok: false,
          error: 'Arquivo ZIP não encontrado.',
        });
      }

      // AQUI é a mudança: usamos o callback do download para apagar o arquivo depois
      res.download(zipPath, zipName, (err) => {
        if (err) {
          console.error(
            'Erro ao enviar ZIP em /api/separador-ferias-funcionario/download:',
            err
          );
          return;
        }

        // Após envio bem-sucedido, apaga o arquivo ZIP do servidor
        fs.unlink(zipPath, (unlinkErr) => {
          if (unlinkErr) {
            console.error(
              'Erro ao apagar ZIP em /api/separador-ferias-funcionario/download:',
              unlinkErr
            );
          }
        });
      });
    } catch (err) {
      console.error(
        'Erro em /api/separador-ferias-funcionario/download:',
        err
      );
      return res.status(500).json({
        ok: false,
        error: 'Erro ao preparar download do ZIP.',
      });
    }
  }
);

app.get('/gerador-atas', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'gerador-atas.html'));
});

// Config para backend Python FastAPI
const PY_BASE_URL = process.env.PY_BASE_URL || 'http://127.0.0.1:8001';

// Lista modelos
app.get('/api/atas/modelos', async (req, res) => {
  try {
    const { data } = await axios.get(`${PY_BASE_URL}/api/gerador-atas/modelos`);
    res.json(data);
  } catch (err) {
    console.error('Erro ao listar modelos de ata:', err.message);
    res.status(500).json({ ok: false, error: 'Erro ao listar modelos de ata' });
  }
});

// Campos de um modelo
app.get('/api/atas/modelos/:modeloId/campos', async (req, res) => {
  const { modeloId } = req.params;
  try {
    const { data } = await axios.get(
      `${PY_BASE_URL}/api/gerador-atas/modelos/${encodeURIComponent(modeloId)}`
    );
    res.json(data);
  } catch (err) {
    console.error('Erro ao obter campos do modelo de ata:', err.message);
    res.status(500).json({ ok: false, error: 'Erro ao obter campos do modelo' });
  }
});

// Geração da ata
app.post('/api/atas/gerar', async (req, res) => {
  try {
    const { data } = await axios.post(
      `${PY_BASE_URL}/api/gerador-atas/gerar`,
      req.body
    );
    res.json(data);
  } catch (err) {
    console.error('Erro ao gerar ata:', err.message);
    res.status(500).json({ ok: false, error: 'Erro ao gerar ata' });
  }
});

// Download do arquivo gerado
app.get('/api/atas/download/:fileName', (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(DATA_DIR, 'atas_geradas', fileName);
  res.download(filePath, fileName, (err) => {
    if (err) {
      console.error('Erro ao fazer download da ata:', err.message);
      if (!res.headersSent) {
        res.status(404).json({ ok: false, error: 'Arquivo não encontrado' });
      }
    }
  });
});

// Busca CEP na BrasilAPI
app.get('/api/cep/:cep', async (req, res) => {
  try {
    const cepRaw = req.params.cep || '';
    const cep = cepRaw.replace(/\D/g, '');

    if (!cep || cep.length !== 8) {
      return res.status(400).json({ ok: false, error: 'CEP deve ter 8 dígitos.' });
    }

    const { data } = await axios.get(`https://brasilapi.com.br/api/cep/v2/${cep}`);

    res.json({ ok: true, data });
  } catch (err) {
    if (err.response) {
      const status = err.response.status || 500;
      let msg = 'Erro ao consultar CEP.';

      if (status === 400) msg = 'CEP inválido ou mal formatado.';
      if (status === 404) msg = 'CEP não encontrado.';
      if (status === 500) msg = 'Erro interno no serviço de CEP.';

      return res.status(status).json({
        ok: false,
        error: msg,
        detail: err.response.data || null
      });
    }
    console.error('Erro ao chamar BrasilAPI CEP:', err.message);
    res.status(500).json({ ok: false, error: 'Erro interno ao consultar CEP.' });
  }
});

// Busca CNPJ na BrasilAPI
app.get('/api/cnpj/:cnpj', async (req, res) => {
  try {
    const cnpjRaw = req.params.cnpj || '';
    const cnpj = cnpjRaw.replace(/\D/g, '');

    if (!cnpj || cnpj.length !== 14) {
      return res.status(400).json({ ok: false, error: 'CNPJ deve ter 14 dígitos.' });
    }

    const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);

    res.json({ ok: true, data });
  } catch (err) {
    if (err.response) {
      const status = err.response.status || 500;
      let msg = 'Erro ao consultar CNPJ.';

      if (status === 400) msg = 'CNPJ inválido ou mal formatado.';
      if (status === 404) msg = 'CNPJ não encontrado.';
      if (status === 500) msg = 'Erro interno no serviço de CNPJ.';

      return res.status(status).json({
        ok: false,
        error: msg,
        detail: err.response.data || null
      });
    }
    console.error('Erro ao chamar BrasilAPI CNPJ:', err.message);
    res.status(500).json({ ok: false, error: 'Erro interno ao consultar CNPJ.' });
  }
});

// Página: Acertos Lotes Internets

app.get('/acertos-lotes-internets', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'acertos-lotes-internets.html'));
});

// API: processamento do arquivo TXT de lotes
app.post('/api/acertos-lotes-internets/process',
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: 'Nenhum arquivo enviado.',
        });
      }

      const conteudo = getTextFromUploadedFile(req.file);
      if (!conteudo) {
        return res.status(400).json({
          ok: false,
          error: 'Não foi possível ler o conteúdo do arquivo enviado.',
        });
      }

      const resultado = processarLoteInternetsConteudo(conteudo);

      const originalName = req.file.originalname || 'lancamentos.txt';
      const baseName =
        originalName.replace(/\.[^/.]+$/, '') || 'lancamentos';
      const processedFileName = `${baseName}-ajustado.txt`;
      const removedFileName = `${baseName}-linhas-removidas.txt`;

      return res.json({
        ok: true,
        ...resultado,
        processedFileName,
        removedFileName,
      });
    } catch (err) {
      console.error('Erro ao processar lote de internets:', err);
      return res.status(500).json({
        ok: false,
        error: 'Erro interno ao processar o arquivo de lote.',
      });
    }
  }
);

// Página: Acerto Lotes Toscan (separada do Acertos Lotes Internets)

app.get('/acerto-lotes-toscan', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'acerto-lotes-toscan.html'));
});

app.get('/comprimir-pdf', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'comprimir-pdf.html'));
});

app.post(
  '/api/comprimir-pdf/processar',
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: 'Nenhum arquivo foi enviado.',
        });
      }

      // 1) Lê o conteúdo do arquivo
      let fileBuffer;

      // Com a configuração atual (memoryStorage), o arquivo vem aqui:
      if (req.file.buffer) {
        fileBuffer = req.file.buffer;
      }
      // Se no futuro você trocar para diskStorage, esse bloco passa a funcionar:
      else if (req.file.path) {
        fileBuffer = await fs.promises.readFile(req.file.path);
      } else {
        return res.status(400).json({
          ok: false,
          error: 'Não foi possível ler o arquivo enviado.',
        });
      }

      // 2) Converte para base64 para enviar para o backend Python
      const fileBase64 = fileBuffer.toString('base64');

      const jpegQuality = Number(req.body.jpegQuality) || 50;
      const dpiScale = Number(req.body.dpiScale) || 1.0;

      const payload = {
        file_name: req.file.originalname,
        file_base64: fileBase64,
        jpeg_quality: jpegQuality,
        dpi_scale: dpiScale,
      };

      // 3) Chama a API Python
      const apiResponse = await axios.post(
        `${PY_BASE_URL}/api/comprimir-pdf/processar`,
        payload,
        { timeout: 600000 } // até 10 minutos
      );

      // 4) Se um dia você usar diskStorage, pode apagar o arquivo físico aqui,
      // MAS só se req.file.path existir:
      if (req.file.path) {
        fs.promises.unlink(req.file.path).catch(() => { });
      }

      return res.json(apiResponse.data);
    } catch (err) {
      console.error('Erro na compressão de PDF:', err);
      return res.status(500).json({
        ok: false,
        error: 'Erro no servidor ao comprimir o PDF.',
      });
    }
  }
);

app.get('/extrator-zip-rar', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'extrator-zip-rar.html'));
});

// server.js (após configurar multer, DATA_DIR, axios, archiver etc.)

const extratorZipRarRouter = express.Router();

// POST /api/extrator-zip-rar/process
extratorZipRarRouter.post('/process', uploadExtratorZipRar.array('archives'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
    }

    // cria pasta de trabalho para este job
    const jobId = Date.now().toString();
    const jobDir = path.join(DATA_DIR, 'extrator-zip-rar', jobId);

    await fs.promises.mkdir(jobDir, { recursive: true });

    // move arquivos enviados para a pasta de trabalho com o nome original
    for (const file of req.files) {
      const destPath = path.join(jobDir, file.originalname);
      await fs.promises.rename(file.path, destPath); // agora file.path existe
    }

    // chama o backend Python (FastAPI)
    const pyResponse = await axios.post(
      `${PY_BASE_URL}/api/extrator-zip-rar/process`,
      {
        base_dir: jobDir,
        max_depth: 5,
      },
    );

    const resultado = pyResponse.data?.resultado || {};
    const destDir = resultado.dest_dir || path.join(jobDir, 'ARQUIVOS');

    // gera um ZIP consolidado dos arquivos extraídos
    const zipOutputPath = path.join(jobDir, 'resultado.zip');

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipOutputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', resolve);
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(destDir, false);
      archive.finalize();
    });

    return res.json({
      ok: true,
      downloadUrl: `/api/extrator-zip-rar/download/${jobId}`,
      stats: resultado,
    });
  } catch (error) {
    console.error('Erro em /api/extrator-zip-rar/process:', error);
    return res.status(500).json({
      ok: false,
      error: 'Erro ao processar arquivos ZIP/RAR.',
    });
  }
});

// GET /api/extrator-zip-rar/download/:jobId
extratorZipRarRouter.get('/download/:jobId', (req, res) => {
  const { jobId } = req.params;
  const zipPath = path.join(DATA_DIR, 'extrator-zip-rar', jobId, 'resultado.zip');

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({
      ok: false,
      error: 'Arquivo de resultado não encontrado.',
    });
  }

  return res.download(zipPath, `resultado-extrator-zip-rar-${jobId}.zip`);
});

// registra o router
app.use('/api/extrator-zip-rar', extratorZipRarRouter);

// Página Excel → Abas em PDF

app.get('/excel-abas-pdf', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'excel-abas-pdf.html'));
});


// Upload de Excel + chamada ao backend Python para exportar abas em PDF
// Rota: upload + chamada ao backend Python
app.post(
  '/api/excel-abas-pdf/processar',
  upload.array('files'), // usa o mesmo "upload" com memoryStorage
  async (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) {
        return res
          .status(400)
          .json({ ok: false, error: 'Nenhum arquivo Excel enviado.' });
      }

      const jobId = Date.now().toString();
      const jobDir = path.join(EXCEL_ABAS_PDF_DIR, jobId);
      const inputDir = path.join(jobDir, 'input'); // onde vou salvar os .xlsx
      const outputDir = path.join(jobDir, 'pdfs'); // onde o Python vai gravar os PDFs

      fs.mkdirSync(inputDir, { recursive: true });
      fs.mkdirSync(outputDir, { recursive: true });

      const arquivos = [];

      for (const f of files) {
        // nome original ou fallback
        const originalName = f.originalname || `arquivo-${Date.now()}.xlsx`;
        // simplifica/limpa nome para evitar problemas em path
        const safeName = originalName.replace(/[^\w\-.]/g, '_');
        const destPath = path.join(inputDir, safeName);

        if (f.buffer) {
          // memoryStorage → grava o conteúdo em disco
          fs.writeFileSync(destPath, f.buffer);
        } else if (f.path) {
          // se em algum momento usar diskStorage, garante cópia
          fs.copyFileSync(f.path, destPath);
        } else {
          // sem buffer e sem path → ignora esse arquivo
          continue;
        }

        arquivos.push(destPath);
      }

      if (!arquivos.length) {
        return res.status(400).json({
          ok: false,
          error: 'Não foi possível salvar os arquivos Excel no servidor.',
        });
      }

      // Chama o FastAPI passando caminhos válidos
      const response = await axios.post(
        `${PY_BASE_URL}/api/excel-abas-pdf/processar`,
        {
          arquivos,
          pasta_destino: outputDir,
        }
      );

      const data = response.data || {};
      if (!data.ok) {
        return res.status(500).json({
          ok: false,
          error: data.error || 'Falha ao gerar PDFs no backend Python.',
        });
      }

      // Cria o ZIP com todos os PDFs gerados
      const zipPath = path.join(EXCEL_ABAS_PDF_DIR, `${jobId}.zip`);
      await criarZipComPdfs(outputDir, zipPath);

      const zipUrl = `/api/excel-abas-pdf/download/${jobId}`;

      return res.json({
        ok: true,
        jobId,
        zipUrl,
        resultados: data.resultados || [],
      });
    } catch (err) {
      console.error('Erro em /api/excel-abas-pdf/processar', err);
      return res.status(500).json({
        ok: false,
        error: 'Erro interno ao processar os arquivos Excel.',
      });
    }
  }
);

// Download do ZIP gerado
app.get('/api/excel-abas-pdf/download/:jobId', (req, res) => {
  const { jobId } = req.params;
  const zipPath = path.join(EXCEL_ABAS_PDF_DIR, `${jobId}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res
      .status(404)
      .json({ ok: false, error: 'Arquivo ZIP não encontrado.' });
  }

  res.download(zipPath, `excel-abas-pdf-${jobId}.zip`);
});

// --- Nova página: importador-recebimentos-madre-scp ---
app.get('/importador-recebimentos-madre-scp', requireAuthPage, async (req, res) => {
  await auditLog({
    userId: req.auth.user.id,
    username: req.auth.user.username,
    action: 'page_view_home',
    status: 'ok',
    meta: { path: '/' },
    req,
  });
  res.sendFile(path.join(publicDir, 'importador-recebimentos-madre-scp.html'));
});

// --- API da ferramenta importador-recebimentos-madre-scp ---
app.post(
  '/api/importador-recebimentos-madre-scp/upload',
  uploadMadreScp.single('pdfFile'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum PDF enviado.' });
      }

      const axios = require('axios');
      const pythonBase =
        process.env.PYTHON_API_URL || 'http://127.0.0.1:8001';
      const pythonUrl =
        pythonBase + '/api/importador-recebimentos-madre-scp/processar';

      const outputDir = path.join(DATA_DIR, 'outputs', 'madre-scp');

      const payload = {
        pdf_path: req.file.path,
        output_dir: outputDir,
      };

      const resposta = await axios.post(pythonUrl, payload);
      const data = resposta.data || {};

      if (!data.ok) {
        return res
          .status(500)
          .json({ error: 'Falha ao processar PDF no backend Python.' });
      }

      const resultado = data.resultado || {};

      // devolve apenas o necessário para o front-end
      return res.json({
        ok: true,
        resumo: {
          total_registros: resultado.total_registros,
          total_clientes: resultado.total_clientes,
          totais: resultado.totais,
          resumo_clientes: resultado.resumo_clientes,
        },
        // token simples baseado no nome do arquivo; o download usará a pasta outputDir
        downloadToken: resultado.output_excel_name,
      });
    } catch (err) {
      console.error(
        'Erro em /api/importador-recebimentos-madre-scp/upload:',
        err.message || err
      );
      return res
        .status(500)
        .json({ error: 'Erro ao processar requisição no servidor.' });
    }
  }
);

// --- API: Enviar declaração MIT (ENCAPURACAO314) ---
app.post(
  '/api/mit/enviar-declaracao',
  mitUpload.single('arquivo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: 'Nenhum arquivo foi enviado. Use o campo "arquivo" no formulário.'
        });
      }

      const nomeArquivo = req.file.originalname || 'MIT.json';
      const cnpjContribuinte = extrairCnpjContribuinteDeNomeArquivo(nomeArquivo);

      // Lê JSON a partir do buffer (upload em memória)
      const conteudo = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
      let dadosMit;
      try {
        dadosMit = JSON.parse(conteudo);
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: 'Conteúdo do arquivo não é um JSON válido.',
          detalhe: String(e)
        });
      }

      // Sem movimento -> forçar TransmissaoImediata = true em nível raiz e, se desejado, em DadosIniciais
      const semMovimento = !!(dadosMit && dadosMit.DadosIniciais && dadosMit.DadosIniciais.SemMovimento);

      if (semMovimento) {
        if (!Object.prototype.hasOwnProperty.call(dadosMit, 'TransmissaoImediata')) {
          dadosMit.TransmissaoImediata = true;
        }
        if (
          dadosMit.DadosIniciais &&
          !Object.prototype.hasOwnProperty.call(
            dadosMit.DadosIniciais,
            'TransmissaoImediata'
          )
        ) {
          dadosMit.DadosIniciais.TransmissaoImediata = true;
        }
      }

      // Monta payload para Integra Contador / MIT
      const payloadMit = {
        contratante: {
          numero: process.env.CNPJ_CONTRATANTE,
          tipo: 2
        },
        autorPedidoDados: {
          numero: process.env.CNPJ_CONTRATANTE,
          tipo: 2
        },
        contribuinte: {
          numero: cnpjContribuinte,
          tipo: 2
        },
        pedidoDados: {
          idSistema: 'MIT',
          idServico: 'ENCAPURACAO314',
          versaoSistema: '1.0',
          dados: JSON.stringify(dadosMit)
        }
      };

      // Autenticação no SERPRO: usa seu serpro-auth.js
      const { accessToken, jwtToken } = await obterToken();

      const urlDeclarar =
        process.env.SERPRO_DECLARAR_URL ||
        'https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1/Declarar';

      const httpsAgent = createHttpsAgent(); // certificado PFX + senha lidos do .env

      const resp = await axios.post(urlDeclarar, payloadMit, {
        httpsAgent,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          jwt_token: jwtToken,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const data = resp.data || {};
      const mensagens = Array.isArray(data.mensagens) ? data.mensagens : [];

      const sucessoEncerramento = mensagens.some(
        (m) =>
          m &&
          typeof m.codigo === 'string' &&
          m.codigo.includes('Sucesso-MIT-MSG_0024')
      );

      let protocoloEncerramento = null;
      let idApuracao = null;

      if (typeof data.dados === 'string') {
        try {
          const dadosObj = JSON.parse(data.dados);
          protocoloEncerramento = dadosObj.protocoloEncerramento || null;
          idApuracao = dadosObj.idApuracao || null;
        } catch {
          // se não for JSON, ignoramos
        }
      }

      return res.json({
        ok: true,
        sucessoEncerramento,
        protocoloEncerramento,
        idApuracao,
        serproStatus: resp.status,
        serproResponseId: data.responseId || null,
        serproMensagens: mensagens,
        serproRaw: data,
        payloadResumo: {
          contratante: payloadMit.contratante,
          contribuinte: payloadMit.contribuinte,
          periodo: dadosMit && dadosMit.PeriodoApuracao ? dadosMit.PeriodoApuracao : null,
          semMovimento
        }
      });
    } catch (err) {
      console.error('Erro em /api/mit/enviar-declaracao:', err);

      const status = err.response && err.response.status ? err.response.status : 500;
      const body = err.response && err.response.data ? err.response.data : null;

      return res.status(status).json({
        ok: false,
        error: 'Erro ao enviar declaração MIT para o Integra Contador.',
        detalhe: err.message || String(err),
        serproStatus: status,
        serproErro: body
      });
    }
  }
);


// Rota para download do Excel gerado
app.get(
  '/api/importador-recebimentos-madre-scp/download/:fileName',
  (req, res) => {
    const fileName = req.params.fileName;
    const filePath = path.join(
      DATA_DIR,
      'outputs',
      'madre-scp',
      fileName
    );

    return res.download(filePath, fileName, (err) => {
      if (err) {
        console.error(
          'Erro ao enviar Excel MADRE SCP para download:',
          err.message || err
        );
        if (!res.headersSent) {
          return res
            .status(404)
            .json({ error: 'Arquivo gerado não encontrado.' });
        }
      }
    });
  }
);

// --- Nova página: ajuste-diario-gfbr ---
app.get('/ajuste-diario-gfbr', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'ajuste-diario-gfbr.html'));
});

// --- API da ferramenta ajuste-diario-gfbr ---
app.post(
  '/api/ajuste-diario-gfbr/processar',
  uploadAjusteDiarioGfbr.single('arquivoDiario'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo Excel enviado.' });
      }

      const abaOrigem = (req.body.abaOrigem || '').trim();
      const criarBackupRaw = (req.body.criarBackup || '').toString().toLowerCase();
      // Considera backup = true quando checkbox marcado (on/true) ou não enviado
      const criarBackup =
        criarBackupRaw === '' ||
        criarBackupRaw === 'true' ||
        criarBackupRaw === 'on';

      const inputXlsxPath = req.file.path;

      const pyUrl =
        process.env.AJUSTE_DIARIO_GFBR_API_URL ||
        'http://localhost:8001/api/ajuste-diario-gfbr/processar';

      const pyResp = await axios.post(pyUrl, {
        input_xlsx_path: inputXlsxPath,
        aba_origem: abaOrigem || null,
        criar_backup: criarBackup,
      });

      const data = pyResp.data; // 👈 agora "data" existe

      if (!data || !data.ok || !data.resumo) {
        console.error(
          'Resposta inesperada do backend Python (ajuste-diario-gfbr):',
          pyResp.data
        );
        return res
          .status(500)
          .json({ error: 'Erro ao ajustar diário no backend Python.' });
      }

      const resumo = data.resumo;
      const backupFileName = resumo.backup_path
        ? path.basename(resumo.backup_path)
        : null;

      return res.json({
        ok: true,
        resumo,
        fileId: req.file.filename,
        downloadUrl: `/api/ajuste-diario-gfbr/download/${req.file.filename}`,
        backupDownloadUrl: backupFileName
          ? `/api/ajuste-diario-gfbr/download-backup/${backupFileName}`
          : null,
        message: resumo.mensagem || 'Diário ajustado com sucesso.',
      });

    } catch (err) {
      console.error('Erro em /api/ajuste-diario-gfbr/processar:', err);
      return res.status(500).json({ error: 'Erro ao processar diário.' });
    }
  }
);

// --- Download do diário ajustado (ajuste-diario-gfbr) ---
app.get('/api/ajuste-diario-gfbr/download/:fileId', (req, res) => {
  try {
    const fileId = req.params.fileId;
    const filePath = path.join(ajusteDiarioGfbrUploadsDir, fileId);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo ajustado não encontrado.' });
    }

    const downloadName = 'diario-ajustado.xlsx';
    res.download(filePath, downloadName);
  } catch (err) {
    console.error('Erro em /api/ajuste-diario-gfbr/download:', err);
    return res.status(500).json({ error: 'Erro ao baixar arquivo ajustado.' });
  }
});

// download do backup (arquivo original .backup.xlsx)
app.get('/api/ajuste-diario-gfbr/download-backup/:fileName', (req, res) => {
  try {
    const fileName = req.params.fileName;
    const filePath = path.join(ajusteDiarioGfbrUploadsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ error: 'Arquivo de backup não encontrado.' });
    }

    const downloadName = 'diario-original.backup.xlsx';
    res.download(filePath, downloadName);
  } catch (err) {
    console.error('Erro em /api/ajuste-diario-gfbr/download-backup:', err);
    return res
      .status(500)
      .json({ error: 'Erro ao baixar arquivo de backup.' });
  }
});

// --- Nova página: separador-csv-baixa-automatica ---
app.get('/separador-csv-baixa-automatica', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'separador-csv-baixa-automatica.html'));
});

// --- API da ferramenta separador-csv-baixa-automatica ---
app.post(
  '/api/separador-csv-baixa-automatica/processar',
  uploadSeparadorCsv.single('arquivo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: 'Nenhum arquivo recebido.',
        });
      }

      const pythonBaseUrl =
        process.env.PYTHON_API_URL || 'http://127.0.0.1:8001';

      const jobId = Date.now().toString();
      const outputDir = path.join(SEPARADOR_CSV_OUTPUT_DIR, jobId);

      const payload = {
        input_path: req.file.path,
        output_dir: outputDir,
        sheet_name: 'BAIXAS',
        year_source_column: 'DATA EMISSÃO',
        max_linhas_por_arquivo: 50,
        csv_sep: ';',
      };

      const pyResponse = await axios.post(
        `${pythonBaseUrl}/api/separador-csv-baixa-automatica/processar`,
        payload
      );

      const data = pyResponse.data || {};

      if (!data.ok || !data.resultado) {
        return res.status(500).json({
          ok: false,
          error: data.error || 'Falha ao processar no backend Python.',
        });
      }

      const resultado = data.resultado;
      const arquivosGerados = resultado.arquivos_gerados || [];
      const resumoPorAno = resultado.resumo_por_ano || {};

      // Gera o ZIP com os CSVs
      fs.mkdirSync(outputDir, { recursive: true });

      const zipPath = path.join(outputDir, 'resultado.zip');

      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('error', reject);

        archive.pipe(output);

        for (const arq of arquivosGerados) {
          const fullPath = path.join(outputDir, arq.arquivo);
          // espera-se que o Python tenha gravado os arquivos em output_dir
          archive.file(fullPath, { name: arq.arquivo });
        }

        archive.finalize();
      });

      return res.json({
        ok: true,
        resumoPorAno,
        arquivosGerados,
        downloadId: jobId,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        ok: false,
        error: 'Erro inesperado ao processar o arquivo.',
      });
    }
  }
);

// Endpoint para download do ZIP gerado
app.get('/api/separador-csv-baixa-automatica/download/:jobId', (req, res) => {
  const { jobId } = req.params;

  const zipPath = path.join(
    SEPARADOR_CSV_OUTPUT_DIR,
    jobId,
    'resultado.zip'
  );

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({
      ok: false,
      error: 'Arquivo ZIP não encontrado.',
    });
  }

  return res.download(zipPath, `separador-csv-baixa-automatica-${jobId}.zip`);
});

// --- Nova página: ajuste-diario-gfbr-c ---
app.get('/ajuste-diario-gfbr-c', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_home', 'ok', { path: '/', method: req.method });

  res.sendFile(path.join(publicDir, 'ajuste-diario-gfbr-c.html'));
});

app.post('/api/ajuste-diario-gfbr-c/processar', upload.single('arquivoDiario'), async (req, res) => {
  let tempDir = null;
  let tempFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Arquivo é obrigatório.' });
    }

    const goBase = process.env.GO_API_URL || 'http://127.0.0.1:8002';

    const FormData = require('form-data');
    const fd = new FormData();

    // --------- GARANTIR UM CAMINHO DE ARQUIVO (multer diskStorage OU memoryStorage) ----------
    if (req.file.path) {
      // diskStorage
      tempFilePath = req.file.path;
    } else if (req.file.buffer) {
      // memoryStorage -> grava em temp para poder fazer createReadStream
      const os = require('os');
      const crypto = require('crypto');

      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajuste-diario-gfbr-c-'));
      const safeName = (req.file.originalname || 'diario.xlsx').replace(/[^\w.\- ]+/g, '_');
      tempFilePath = path.join(tempDir, `${crypto.randomBytes(6).toString('hex')}-${safeName}`);

      fs.writeFileSync(tempFilePath, req.file.buffer);
    } else {
      return res.status(400).json({
        ok: false,
        error: 'Upload inválido. Não foi possível acessar o arquivo (sem path e sem buffer).'
      });
    }

    // Go espera o campo "arquivo"
    fd.append('arquivo', fs.createReadStream(tempFilePath), req.file.originalname);

    // --------- MAPEAR CAMPOS DO FRONT (padrão do HTML/JS original) ----------
    const abaOrigem = (req.body?.abaOrigem || '').trim();
    if (abaOrigem) fd.append('aba', abaOrigem);

    // no front vem "true"/"false"
    const criarBackupRaw = String(req.body?.criarBackup ?? '').trim().toLowerCase();
    // o Go aceita "true"/"false"/"1"/"0" etc
    if (criarBackupRaw) fd.append('criar_backup', criarBackupRaw);

    // --------- CHAMAR GO E REPASSAR STATUS/JSON ----------
    const resp = await axios.post(`${goBase}/api/ajuste-diario-gfbr-c/processar`, fd, {
      headers: fd.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true // não explode em 4xx/5xx, a gente repassa
    });

    return res.status(resp.status || 200).json(resp.data);

  } catch (err) {
    console.error('Erro em /api/ajuste-diario-gfbr-c/processar:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Erro ao processar requisição.' });
  } finally {
    // limpeza do arquivo temporário (se foi criado por memoryStorage)
    try {
      if (tempFilePath && tempDir && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (_) { }

    try {
      if (tempDir && fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch (_) { }

    // limpeza do upload local do Node (se multer usou diskStorage)
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch (_) { }
  }
});

app.get('/api/ajuste-diario-gfbr-c/download/ajustado/:id', async (req, res) => {
  try {
    const goBase = process.env.GO_API_URL || 'http://127.0.0.1:8002';
    const id = encodeURIComponent(req.params.id);

    const resp = await axios.get(`${goBase}/api/ajuste-diario-gfbr-c/download/ajustado/${id}`, {
      responseType: 'stream',
      validateStatus: () => true
    });

    if (resp.status >= 400) return res.status(resp.status).send('Arquivo não encontrado ou expirado.');

    if (resp.headers['content-type']) res.setHeader('Content-Type', resp.headers['content-type']);
    if (resp.headers['content-disposition']) res.setHeader('Content-Disposition', resp.headers['content-disposition']);

    resp.data.pipe(res);
  } catch (err) {
    console.error('Erro em download ajustado:', err?.message || err);
    return res.status(404).send('Arquivo não encontrado ou expirado.');
  }
});

app.get('/api/ajuste-diario-gfbr-c/download/backup/:id', async (req, res) => {
  try {
    const goBase = process.env.GO_API_URL || 'http://127.0.0.1:8002';
    const id = encodeURIComponent(req.params.id);

    const resp = await axios.get(`${goBase}/api/ajuste-diario-gfbr-c/download/backup/${id}`, {
      responseType: 'stream',
      validateStatus: () => true
    });

    if (resp.status >= 400) return res.status(resp.status).send('Backup não encontrado ou expirado.');

    if (resp.headers['content-type']) res.setHeader('Content-Type', resp.headers['content-type']);
    if (resp.headers['content-disposition']) res.setHeader('Content-Disposition', resp.headers['content-disposition']);

    resp.data.pipe(res);
  } catch (err) {
    console.error('Erro em download backup:', err?.message || err);
    return res.status(404).send('Backup não encontrado ou expirado.');
  }
});

// Páginas Admin (protegidas)
// admin (exigem ADMIN)
app.get('/admin-usuarios', requireAuthPage, requireAdminPage, logPageView('page_view_admin_users'), (req, res) => {
  res.sendFile(path.join(publicDir, 'admin-usuarios.html'));
});

app.get('/logs', requireAuthPage, requireAdminPage, logPageView('page_view_audit_logs'), (req, res) => {
  res.sendFile(path.join(publicDir, 'logs.html'));
});

// API AUTH
app.post('/api/auth/login', loginLimiter, async (req, res) => {
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

    // cria sessão
    const sessionToken = newTokenHex(32);
    const tokenHash = sha256Hex(sessionToken);
    const csrfToken = newTokenHex(16);

    const maxAgeSeconds = Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS || 604800); // 7 dias
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

    await pool.query(
      `INSERT INTO auth_sessions (user_id, token_hash, csrf_token, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [user.id, tokenHash, csrfToken, expiresAt]
    );

    await pool.query(`UPDATE auth_users SET last_login_at=NOW() WHERE id=$1`, [user.id]).catch(() => { });

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

app.get('/api/auth/me', requireAuth, async (req, res) => {
  return res.json({ user: req.user, csrfToken: req.csrfToken });
});

app.post('/api/auth/logout', requireAuth, requireCsrf, async (req, res) => {
  try {
    await pool.query(`DELETE FROM auth_sessions WHERE token_hash=$1`, [req.sessionTokenHash]);
  } catch (e) {
    console.error('logout error:', e.message);
  }

  res.setHeader('Set-Cookie', 'wl_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  await auditLog(req, 'logout', 'ok', {});
  return res.json({ ok: true });
});

// API ADMIN: usuários
app.get('/api/admin/users', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, is_active, created_at, last_login_at
     FROM auth_users
     ORDER BY id DESC`
  );
  res.json(rows.map(sanitizeUserRow));
}); app.post('/api/admin/users', requireAuth, requireRole('ADMIN'), requireCsrf, async (req, res) => {
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

app.patch('/api/admin/users/:id', requireAuth, requireRole('ADMIN'), requireCsrf, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

  // bloqueia desativar a si mesmo (recomendado)
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

app.patch('/api/admin/users/:id/password', requireAuth, requireRole('ADMIN'), requireCsrf, async (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body?.password || '');
  if (!Number.isFinite(id) || password.length < 6) return res.status(400).json({ error: 'Dados inválidos' });

  const hash = await bcrypt.hash(password, 10);

  await pool.query(`UPDATE auth_users SET password_hash=$1 WHERE id=$2`, [hash, id]);
  // apaga sessões do usuário
  await pool.query(`DELETE FROM auth_sessions WHERE user_id=$1`, [id]).catch(() => { });
  await auditLog(req, 'user_password_reset', 'ok', { target_user_id: id });

  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAuth, requireRole('ADMIN'), requireCsrf, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

  // bloquear excluir o próprio usuário logado
  if (req.user?.id === id) return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário' });

  await pool.query(`DELETE FROM auth_users WHERE id=$1`, [id]);
  await auditLog(req, 'user_delete', 'ok', { target_user_id: id });
  res.json({ ok: true });
});

app.post('/api/admin/users/import', requireAuth, requireRole('ADMIN'), requireCsrf, uploadAdminUsers.single('file'), async (req, res) => {
  const usersText = String(req.body?.usersText || '').trim();
  const fileBuf = req.file?.buffer;

  let text = usersText;
  if (!text && fileBuf) text = fileBuf.toString('utf-8');

  if (!text) return res.status(400).json({ error: 'Envie um arquivo ou cole o texto para importação.' });

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return res.status(400).json({ error: 'Arquivo/vazio.' });

  // aceita header opcional
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

app.get('/api/admin/audit-logs', requireAuth, requireRole('ADMIN'), async (req, res) => {
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
