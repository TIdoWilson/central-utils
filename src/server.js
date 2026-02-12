const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const http = require('http');
const multer = require('multer');
const readline = require('readline');
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
let pool;
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// ===== PDF/A Converter =====
const PDFA_DIR = path.join(DATA_DIR, 'pdfa');
const PDFA_TMP_DIR = path.join(PDFA_DIR, '_tmp');
const PDFA_OUT_DIR = path.join(PDFA_DIR, 'outputs');
fs.mkdirSync(PDFA_DIR, { recursive: true });
fs.mkdirSync(PDFA_TMP_DIR, { recursive: true });
fs.mkdirSync(PDFA_OUT_DIR, { recursive: true });

//////////////// ENSINA PARA O SCRIPT QUE W:\ == \\192.0.0.251\ARQUIVOS
function resolveWPath(p) {
  const s = String(p || '');

  // Se vier UNC, não mexe
  if (s.startsWith('\\\\')) return s;

  // Se começar com W:\ e existir W_UNC_ROOT, traduz
  const root = process.env.W_UNC_ROOT;
  if (/^[Ww]:\\/.test(s) && root) {
    const cleanRoot = String(root).replace(/[\\\/]+$/, ''); // remove "\" no final
    // remove "W:\" (3 chars) e cola no UNC
    return cleanRoot + '\\' + s.slice(3);
  }

  return s;
}

function conciliadorGetCsprojPath() {
  const envPath = process.env.CONCILIADOR_HO_CSPROJ;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const candidate = 'W:\\DOCUMENTOS ESCRITORIO\\INSTALACAO SISTEMA\\C#\\RR - Ocean\\PdfToExcel\\RR.Ocean.PdfToExcel.csproj';
  if (fs.existsSync(candidate)) return candidate;
  return candidate;
}

function conciliadorGetAppPath() {
  const exePath = process.env.CONCILIADOR_HO_EXE;
  if (exePath && fs.existsSync(exePath)) return { kind: 'exe', path: exePath };

  const dllPath = process.env.CONCILIADOR_HO_DLL;
  if (dllPath && fs.existsSync(dllPath)) return { kind: 'dll', path: dllPath };

  const defaultDll = path.join(CONCILIADOR_DIR, 'app', 'RR.Ocean.PdfToExcel.dll');
  if (fs.existsSync(defaultDll)) return { kind: 'dll', path: defaultDll };

  return null;
}

function conciliadorGetTemplatePath(tipo) {
  const isDre = String(tipo || '').toLowerCase() === 'dre';
  const envKey = isDre ? 'CONCILIADOR_HO_TEMPLATE_DRE' : 'CONCILIADOR_HO_TEMPLATE_BALANCETE';
  const envPath = process.env[envKey];
  if (envPath && fs.existsSync(envPath)) return envPath;

  const direct = isDre
    ? 'W:\\DOCUMENTOS ESCRITORIO\\INSTALACAO SISTEMA\\C#\\RR - Ocean\\Template DRE.xlsx'
    : 'W:\\DOCUMENTOS ESCRITORIO\\INSTALACAO SISTEMA\\C#\\RR - Ocean\\Template Balancete.xlsx';
  if (fs.existsSync(direct)) return direct;

  const templatesDir = path.join(CONCILIADOR_DIR, 'templates');
  const templatesPath = path.join(templatesDir, isDre ? 'Template DRE.xlsx' : 'Template Balancete.xlsx');
  if (fs.existsSync(templatesPath)) return templatesPath;

  const dataRootName = isDre ? 'Template DRE.xlsx' : 'Template Balancete.xlsx';
  const dataRootPath = path.join(DATA_DIR, dataRootName);
  if (fs.existsSync(dataRootPath)) return dataRootPath;

  const localName = isDre ? 'Template DRE.xlsx' : 'Template Balancete.xlsx';
  const localPath = path.join(CONCILIADOR_DIR, localName);
  if (fs.existsSync(localPath)) return localPath;

  return direct;
}

// ===== PDF/A Converter (helpers) =====
const PDFA_DOWNLOAD_MAP = new Map(); // id -> { path, expiresAt }

function pdfaStoreFile(filePath) {
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  PDFA_DOWNLOAD_MAP.set(id, { path: filePath, expiresAt: Date.now() + 60 * 60 * 1000 });
  return id;
}

function pdfaGetFile(id) {
  const rec = PDFA_DOWNLOAD_MAP.get(id);
  if (!rec) return null;
  if (Date.now() > rec.expiresAt) {
    PDFA_DOWNLOAD_MAP.delete(id);
    return null;
  }
  return rec.path;
}

function pdfaGetGhostscriptPath() {
  const envPath = process.env.GS_EXE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const candidates = [
    'C:\\\\Program Files\\\\gs\\\\gs10.00.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.01.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.02.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.03.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.04.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.05.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.06.0\\\\bin\\\\gswin64c.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'gswin64c.exe'; // tenta via PATH
}

function pdfaGetLibreOfficePath() {
  const envPath = process.env.LIBREOFFICE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const candidates = [
    'C:\\\\Program Files\\\\LibreOffice\\\\program\\\\soffice.exe',
    'C:\\\\Program Files (x86)\\\\LibreOffice\\\\program\\\\soffice.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function pdfaGetIccProfilePath() {
  const envPath = process.env.PDFA_ICC_PROFILE;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const candidates = [
    'C:\\\\Windows\\\\System32\\\\spool\\\\drivers\\\\color\\\\sRGB Color Space Profile.icm',
    'C:\\\\Windows\\\\System32\\\\spool\\\\drivers\\\\color\\\\sRGB IEC61966-2.1.icm',
    // Ghostscript normalmente instala um sRGB.icc junto (bem útil para PDF/A).
    'C:\\\\Program Files\\\\gs\\\\gs10.00.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.01.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.02.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.03.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.04.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.05.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.06.0\\\\iccprofiles\\\\sRGB.icc',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function pdfaRun(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr?.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => reject({ err, stdout, stderr }));
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      return reject({ code, stdout, stderr });
    });
  });
}

// ===== ECD Status (helpers) =====
function ensureEcdCsvCopies() {
  try {
    if (fs.existsSync(ECD_SRC_ALL_CSV)) {
      fs.copyFileSync(ECD_SRC_ALL_CSV, ECD_ALL_CSV);
    }
    if (fs.existsSync(ECD_SRC_SN_CSV)) {
      fs.copyFileSync(ECD_SRC_SN_CSV, ECD_SN_CSV);
    }
  } catch (e) {
    console.error('[ECD] Falha ao copiar CSVs:', e.message || e);
  }
}

function parseEcdCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l && l.trim());
  const out = [];
  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length < 3) continue;
    const code = String(parts[0] || '').trim();
    const name = String(parts[1] || '').trim();
    const cnpj = String(parts[2] || '').replace(/\D/g, '');
    if (!code || !name || !cnpj) continue;
    out.push({ code, name, cnpj });
  }
  return out;
}

function loadEcdStatus() {
  if (!fs.existsSync(ECD_STATUS_FILE)) return { companies: {} };
  try {
    const raw = fs.readFileSync(ECD_STATUS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { companies: {} };
    if (!parsed.companies || typeof parsed.companies !== 'object') parsed.companies = {};
    if (!Array.isArray(parsed.order)) parsed.order = [];
    return parsed;
  } catch (e) {
    console.error('[ECD] Erro ao ler ecd_status.json:', e.message || e);
    return { companies: {} };
  }
}

function saveEcdStatus(data) {
  try {
    fs.writeFileSync(ECD_STATUS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[ECD] Erro ao salvar ecd_status.json:', e.message || e);
  }
}

function loadEcdCompanies() {
  ensureEcdCsvCopies();
  const simples = parseEcdCsv(ECD_SN_CSV).map((c) => ({ ...c, defaultTipo: 'Simples' }));
  const normal = parseEcdCsv(ECD_ALL_CSV).map((c) => ({ ...c, defaultTipo: 'Normal' }));
  return [...simples, ...normal];
}

function ecdHasErrorPng(companyName) {
  const name = String(companyName || '').trim();
  if (!name) return false;
  const base = resolveWPath(ECD_BASE_DIR);
  const p = path.join(base, name, 'erros registrados.png');
  return fs.existsSync(p);
}

// ===== Balancete — Conta Transitória (C#) =====
const BALANCETE_DIR = path.join(DATA_DIR, 'balancete-transitorio');
const BALANCETE_TMP_DIR = path.join(BALANCETE_DIR, '_tmp');

fs.mkdirSync(BALANCETE_DIR, { recursive: true });
fs.mkdirSync(BALANCETE_TMP_DIR, { recursive: true });

// multer em disco (XLSX pode ser grande)
const uploadBalancete = multer({
  dest: BALANCETE_TMP_DIR,
  limits: { fileSize: 50 * 1024 * 1024, files: 120 },
});

// ===== Conciliador Hausen e Ocean (C#) =====
const CONCILIADOR_DIR = path.join(DATA_DIR, 'conciliador-hausen-ocean');
const CONCILIADOR_TMP_DIR = path.join(CONCILIADOR_DIR, '_tmp');
const CONCILIADOR_OUT_DIR = path.join(CONCILIADOR_DIR, 'outputs');

fs.mkdirSync(CONCILIADOR_DIR, { recursive: true });
fs.mkdirSync(CONCILIADOR_TMP_DIR, { recursive: true });
fs.mkdirSync(CONCILIADOR_OUT_DIR, { recursive: true });

const uploadConciliador = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CONCILIADOR_TMP_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.xlsx';
      const safe = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
      cb(null, safe);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 2 },
});

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

// ===== ECD Status =====
const ECD_DIR = path.join(DATA_DIR, 'ecd-status');
const ECD_STATUS_FILE = path.join(ECD_DIR, 'ecd_status.json');
const ECD_CSV_DIR = path.join(ECD_DIR, 'csv');

// origem (fora do site) -> copia local no data/
const ECD_SRC_ALL_CSV = 'W:\\DOCUMENTOS ESCRITORIO\\INSTALACAO SISTEMA\\Lista Todas Empresas\\formatados\\Todas Empresas - formatado.csv';
const ECD_SRC_SN_CSV = 'W:\\DOCUMENTOS ESCRITORIO\\INSTALACAO SISTEMA\\Lista Todas Empresas\\formatados\\todas empresas simples nacional - formatado.csv';

const ECD_ALL_CSV = path.join(ECD_CSV_DIR, 'Todas Empresas - formatado.csv');
const ECD_SN_CSV = path.join(ECD_CSV_DIR, 'todas empresas simples nacional - formatado.csv');
const ECD_BASE_DIR = 'W:\\SPEDs\\ECD\\2025';

fs.mkdirSync(ECD_DIR, { recursive: true });
fs.mkdirSync(ECD_CSV_DIR, { recursive: true });

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


// ===== DIMOB (Automação) =====
const DIMOB_DIR = path.join(DATA_DIR, 'dimob');
const DIMOB_UPLOAD_DIR = path.join(DIMOB_DIR, '_tmp');
const DIMOB_OUTPUT_DIR = path.join(DIMOB_DIR, 'outputs');

fs.mkdirSync(DIMOB_DIR, { recursive: true });
fs.mkdirSync(DIMOB_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DIMOB_OUTPUT_DIR, { recursive: true });

// Pasta da rede para DIMOB do ano anterior (padrão: W:\DECLARAÇÕES\DIMOB)
const DIMOB_NETWORK_BASE_DIR = process.env.DIMOB_NETWORK_BASE_DIR || 'W:\\DECLARAÇÕES\\DIMOB';

// fileId -> path (cache em memória, 1h)
const dimobPreviousFileMap = new Map();
function dimobStoreNetworkFile(filePath) {
  const fileId = crypto.randomUUID();
  dimobPreviousFileMap.set(fileId, { filePath, expiresAt: Date.now() + 60 * 60 * 1000 });
  return fileId;
}
function dimobGetNetworkFile(fileId) {
  const rec = dimobPreviousFileMap.get(fileId);
  if (!rec) return null;
  if (Date.now() > rec.expiresAt) {
    dimobPreviousFileMap.delete(fileId);
    return null;
  }
  return rec.filePath;
}

// Se já existir no seu server.js, mantenha o seu e só garanta que esta função exista:
function dimobOnlyDigits(v = '') {
  return String(v || '').replace(/\D/g, '');
}

function dimobParseBrNumber(v) {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  // remove separador de milhar "." e troca "," por "."
  s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function dimobParseDDMMYYYY(s) {
  const raw = dimobOnlyDigits(s);
  if (raw.length !== 8) return null;
  const dd = raw.slice(0, 2);
  const mm = raw.slice(2, 4);
  const yyyy = raw.slice(4, 8);
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return { dd, mm, yyyy, date: d };
}

/**
 * Lê 1 arquivo SPED 1x e retorna:
 * - período via 0000 (parts[6]=DT_INI, parts[7]=DT_FIN)
 * - F525: doc=parts[4], valor=parts[7]
 * - F200: tipo=parts[2], nome=parts[4], doc=parts[7], data=parts[8], valorOper=parts[9], obs=parts[22]
 * Se não existir F525/F200: retorna estruturas vazias (mês zerado).
 */
async function dimobParseSpedFileOnce(filePath) {
  let text = '';
  let encoding = 'utf8';
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    encoding = 'latin1';
    text = fs.readFileSync(filePath, 'latin1');
  }

  const lines = text.split(/\r?\n/);

  let dtIni = '';
  let dtFim = '';
  let month = null;
  let year = null;

  // F525 agregado por doc
  const aggF525 = new Map();
  let f525Parsed = 0;
  let f525Skipped = 0;
  const sampleF525 = [];

  // F200: lista de operações
  const opsF200 = [];
  let f200Parsed = 0;
  let f200Skipped = 0;
  const sampleF200 = [];

  for (const lineRaw of lines) {
    const line = (lineRaw || '').trim();
    if (!line || line[0] !== '|') continue;

    if (line.startsWith('|0000|')) {
      const parts = line.split('|');
      // parts[6]=DT_INI, parts[7]=DT_FIN (conforme seu exemplo real)
      dtIni = parts[6] || '';
      dtFim = parts[7] || '';

      const p = dimobParseDDMMYYYY(dtIni) || dimobParseDDMMYYYY(dtFim);
      if (p) {
        month = Number(p.mm);
        year = Number(p.yyyy);
      }
      continue;
    }

    if (line.startsWith('|F525|')) {
      const parts = line.split('|');
      // doc campo 04 -> parts[4], valor campo 07 -> parts[7]
      const doc = dimobOnlyDigits(parts[4] || '');
      const valor = dimobParseBrNumber(parts[7]);

      if ((doc.length === 11 || doc.length === 14) && valor > 0) {
        aggF525.set(doc, (aggF525.get(doc) || 0) + valor);
        f525Parsed++;
        if (sampleF525.length < 5) sampleF525.push(line);
      } else {
        f525Skipped++;
      }
      continue;
    }

    if (line.startsWith('|F200|')) {
      const parts = line.split('|');

      // conforme seus campos:
      // campo 2 = tipo pagamento => parts[2]
      // campo 7 = CPF/CNPJ => parts[7]
      // campo 8 = data venda => parts[8]
      // campo 9 = valor venda => parts[9]
      // campo 22 = observações => parts[22]
      const tipoPagto = String(parts[2] || '').trim();
      const nomeSped = String(parts[4] || '').trim(); // ajuda a preencher (se vier)
      const doc = dimobOnlyDigits(parts[7] || '');
      const dtVenda = String(parts[8] || '').trim();
      const valorOper = dimobParseBrNumber(parts[9]);
      const obs = String(parts[22] || '').trim();

      if ((doc.length === 11 || doc.length === 14) && valorOper > 0) {
        const pagoAuto = (tipoPagto === '01' || tipoPagto === '03');
        opsF200.push({
          participantDoc: doc,
          nomeSped,
          tipoPagamento: tipoPagto,
          valorOperacao: valorOper,
          // se 01/03 preenche igual; senão null para usuário preencher
          valorPagoNoAno: pagoAuto ? valorOper : null,
          precisaPreencherPago: !pagoAuto,
          dataContrato: dtVenda,
          observacoes: obs
        });
        f200Parsed++;
        if (sampleF200.length < 5) sampleF200.push(line);
      } else {
        f200Skipped++;
      }
      continue;
    }
  }

  return {
    encoding,
    dtIni,
    dtFim,
    month,
    year,

    aggF525,       // Map()
    f525Parsed,
    f525Skipped,
    sampleF525,

    opsF200,       // Array
    f200Parsed,
    f200Skipped,
    sampleF200
  };
}

// ===== MULTER DIMOB (TMP local para evitar EPERM) =====
// Se você já tem uploadDimob, SUBSTITUA por este (principalmente o destino).
const DIMOB_TMP_DIR =
  process.env.DIMOB_TMP_DIR || path.join(os.tmpdir(), 'central-utils-dimob', '_tmp');

fs.mkdirSync(DIMOB_TMP_DIR, { recursive: true });

const uploadDimob = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DIMOB_TMP_DIR),
    filename: (req, file, cb) => {
      // mantém extensão se existir
      const ext = path.extname(file.originalname || '');
      const safe = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
      cb(null, safe);
    }
  }),
  limits: {
    files: 50,
    fileSize: 50 * 1024 * 1024 // 50MB (ajuste se quiser)
  }
});

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

function requireAdminPage(req, res, next) {
  const userRole = req.user?.role || req.auth?.user?.role;
  if (userRole !== 'ADMIN') return res.status(403).send('Sem permissão');
  next();
}

const RBAC_STRICT = ['1', 'true', 'yes', 'on'].includes(String(process.env.RBAC_STRICT || 'false').toLowerCase());

function normalizeToolSlug(toolSlug) {
  return String(toolSlug || '').trim().toLowerCase();
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
      return res.status(403).send('Sem permissão');
    }
    return next();
  };
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

app.get('/balancete-transitorio', requireAuthPage, logPageView('page_view_balancete_transitorio'), (req, res) => {
  res.sendFile(path.join(publicDir, 'balancete-transitorio.html'));
});

app.get('/conciliador-hausen-ocean', requireAuthPage, logPageView('page_view_conciliador_hausen_ocean'), (req, res) => {
  res.sendFile(path.join(publicDir, 'conciliador-hausen-ocean.html'));
});

app.get('/nfe', requireAuthPage, logPageView('page_view_nfe'), (req, res) => {
  res.sendFile(path.join(publicDir, 'nfe.html'));
});

app.get('/dimob', requireAuthPage, logPageView('page_view_dimob'), (req, res) => {
  res.sendFile(path.join(publicDir, 'dimob.html'));
});


// para conseguir ler JSON do body (usado em /api/mark-done e SN)
app.use(express.json());

app.use('/api/sn', requireAuth, requireToolApi('sn'));
app.use('/api/ecd', requireAuth, requireToolApi('ecd-status'));
app.use('/api/pdfa', requireAuth, requireToolApi('pdf-a'));
app.use('/api/balancete-transitorio', requireAuth, requireToolApi('balancete-transitorio'));
app.use('/api/conciliador-hausen-ocean', requireAuth, requireToolApi('conciliador-hausen-ocean'));
app.use('/api/separador-pdf-relatorio-de-ferias', requireAuth, requireToolApi('separador-pdf-relatorio-de-ferias'));
app.use('/api/separador-holerites-por-empresa', requireAuth, requireToolApi('separador-holerites-por-empresa'));
app.use('/api/separador-ferias-funcionario', requireAuth, requireToolApi('separador-ferias-funcionario'));
app.use('/api/atas', requireAuth, requireToolApi('gerador-atas'));
app.use('/api/acertos-lotes-internets', requireAuth, requireToolApi('acertos-lotes-internets'));
app.use('/api/comprimir-pdf', requireAuth, requireToolApi('comprimir-pdf'));
app.use('/api/extrator-zip-rar', requireAuth, requireToolApi('extrator-zip-rar'));
app.use('/api/excel-abas-pdf', requireAuth, requireToolApi('excel-abas-pdf'));
app.use('/api/importador-recebimentos-madre-scp', requireAuth, requireToolApi('importador-recebimentos-madre-scp'));
app.use('/api/mit', requireAuth, requireToolApi('mit'));
app.use('/api/ajuste-diario-gfbr', requireAuth, requireToolApi('ajuste-diario-gfbr'));
app.use('/api/separador-csv-baixa-automatica', requireAuth, requireToolApi('separador-csv-baixa-automatica'));
app.use('/api/ajuste-diario-gfbr-c', requireAuth, requireToolApi('ajuste-diario-gfbr-c'));
app.use('/api/dimob', requireAuth, requireToolApi('dimob'));
app.use('/api/tareffa-empresas-lote', requireAuth, requireToolApi('tareffa-empresas-lote'));
app.use('/api/conciliador-cartao-wilson', requireAuth, requireToolApi('conciliador-cartao-wilson'));
app.use('/api/irpf', requireAuth, requireToolApi('irpf-carne-leao'));

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

// <<< ROTAS DA EXTENSÃO / API >>>

// teste simples (usado no popup da extensão)
app.get('/api/ping', (req, res) => {
  res.send('ok');
});

// devolve a próxima chave pendente para a extensão
app.get('/api/next-key', requireAuth, requireToolApi('nfe'), (req, res) => {
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
app.post('/api/mark-done', requireAuth, requireToolApi('nfe'), requireCsrf, (req, res) => {
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

app.post('/api/clear-pending', requireAuth, requireToolApi('nfe'), requireCsrf, (req, res) => {
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

app.post('/api/clear-done', requireAuth, requireToolApi('nfe'), requireCsrf, (req, res) => {
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

app.post('/api/clear-errors', requireAuth, requireToolApi('nfe'), requireCsrf, (req, res) => {
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
app.post('/upload', requireAuth, requireToolApi('nfe'), requireCsrf, upload.single('file'), async (req, res) => {
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
app.get('/status', requireAuth, requireToolApi('nfe'), (req, res) => {
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

// ---------- FUNÇÕES AUXILIARES: BALANCETES WERBRAN ----------

function zipDirectory(srcDir, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

function safeName(name) {
  return path.basename(name || 'arquivo.xlsx').replace(/[^\w.\- ]+/g, '_');
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

// ECD Status
app.get('/ecd-status', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_ecd_status', 'ok', { path: req.path, method: req.method });
  res.sendFile(path.join(publicDir, 'ecd-status.html'));
});

// PDF/A Converter
app.get('/pdf-a', requireAuthPage, async (req, res) => {
  await auditLog(req, 'page_view_pdfa', 'ok', { path: req.path, method: req.method });
  res.sendFile(path.join(publicDir, 'pdf-a.html'));
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

// ---------- ROTAS API: ECD STATUS ----------
app.get('/api/ecd/companies', requireAuth, async (req, res) => {
  try {
    const list = loadEcdCompanies();
    const status = loadEcdStatus();
    const out = list.map((c) => {
      const st = status.companies[c.code] || {};
      const hasErrorPng = ecdHasErrorPng(c.name);
      if (hasErrorPng) {
        st.erro = 'Y';
        st.erroMsg = st.erroMsg || 'Arquivo de erro encontrado na pasta.';
      }
      return {
        code: c.code,
        name: c.name,
        cnpj: c.cnpj,
        defaultTipo: c.defaultTipo,
        status: st,
      };
    });
    res.json({ companies: out });
  } catch (e) {
    console.error('[ECD] Erro ao listar empresas:', e.message || e);
    res.status(500).json({ error: 'Erro ao listar empresas.' });
  }
});

app.post('/api/ecd/save', requireAuth, requireCsrf, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim();
    const simples = String(req.body?.simples || '').trim();
    const dfc = req.body?.dfc;

    if (!code) return res.status(400).json({ error: 'Código obrigatório.' });
    if (simples !== 'Simples' && simples !== 'Normal') {
      return res.status(400).json({ error: 'Tipo inválido (Simples/Normal).' });
    }
    if (typeof dfc !== 'boolean') {
      return res.status(400).json({ error: 'DFC inválido (true/false).' });
    }

    const status = loadEcdStatus();
    const cur = status.companies[code] || null;

    const nameFromReq = String(req.body?.name || '').trim();
    let name = nameFromReq;
    if (!name) {
      const all = loadEcdCompanies();
      const found = all.find((c) => String(c.code) === code);
      if (found?.name) name = found.name;
    }
    if (!name && cur?.name) name = cur.name;

    const isAdmin = (req.user?.role || '').toUpperCase() === 'ADMIN';
    if (cur?.completed && !isAdmin) {
      return res.status(409).json({ error: 'Empresa já está gerada e bloqueada para edição.' });
    }

    const nowIso = new Date().toISOString();
    const next = {
      code,
      name: name || '',
      simples,
      dfc,
      completed: true,
      arquivosNaPasta: cur?.arquivosNaPasta || 'N',
      lockedAt: nowIso,
      lockedBy: {
        id: req.user?.id || null,
        email: req.user?.email || null,
        name: req.user?.name || null,
      },
    };

    if (cur?.completed && isAdmin) {
      next.overrideAt = nowIso;
      next.overrideBy = {
        id: req.user?.id || null,
        email: req.user?.email || null,
        name: req.user?.name || null,
      };
    }

    status.companies[code] = next;
    if (!status.order.includes(code)) status.order.push(code);
    saveEcdStatus(status);

    await auditLog(req, 'ecd_status_save', 'ok', { code, simples, dfc });
    res.json({ ok: true, status: next });
  } catch (e) {
    console.error('[ECD] Erro ao salvar status:', e.message || e);
    res.status(500).json({ error: 'Erro ao salvar status.' });
  }
});

// ---------- ROTAS API: PDF/A ----------
const uploadPdfa = multer({
  dest: PDFA_TMP_DIR,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

app.post('/api/pdfa/convert', requireAuth, requireCsrf, uploadPdfa.single('file'), async (req, res) => {
  let tempDir = null;
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    const originalName = req.file.originalname || 'arquivo';
    const ext = path.extname(originalName).toLowerCase();
    const inputPath = req.file.path;

    const workDir = fs.mkdtempSync(path.join(PDFA_TMP_DIR, 'job-'));
    tempDir = workDir;

    let pdfPath = inputPath;

    if (ext !== '.pdf') {
      const soffice = pdfaGetLibreOfficePath();
      if (!soffice) {
        return res.status(500).json({ error: 'LibreOffice não encontrado. Configure LIBREOFFICE_PATH.' });
      }

      const loArgs = [
        '--headless',
        '--nologo',
        '--nolockcheck',
        '--norestore',
        '--convert-to',
        'pdf',
        '--outdir',
        workDir,
        inputPath,
      ];

      await pdfaRun(soffice, loArgs, { cwd: workDir });

      const pdfCandidates = fs.readdirSync(workDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
      if (!pdfCandidates.length) {
        return res.status(500).json({ error: 'Falha ao converter para PDF.' });
      }
      pdfPath = path.join(workDir, pdfCandidates[0]);
    }

    const gs = pdfaGetGhostscriptPath();
    const icc = pdfaGetIccProfilePath();
    if (!icc) {
      return res.status(500).json({ error: 'Perfil ICC não encontrado. Configure PDFA_ICC_PROFILE.' });
    }

    const outName = `${path.parse(originalName).name}-PDFA.pdf`;
    const outPath = path.join(PDFA_OUT_DIR, `${Date.now()}-${outName}`);

    const gsArgs = [
      // Ghostscript 10+ roda em SAFER e pode bloquear leitura/escrita. Permitimos explicitamente só o necessário.
      `--permit-file-read=${pdfPath}`,
      `--permit-file-read=${icc}`,
      `--permit-file-write=${outPath}`,
      '-dPDFA=2',
      '-dPDFACompatibilityPolicy=1',
      '-dBATCH',
      '-dNOPAUSE',
      '-dNOOUTERSAVE',
      '-sProcessColorModel=DeviceRGB',
      '-sDEVICE=pdfwrite',
      `-sOutputICCProfile=${icc}`,
      `-sOutputFile=${outPath}`,
      pdfPath,
    ];

    await pdfaRun(gs, gsArgs, { cwd: workDir });

    const fileId = pdfaStoreFile(outPath);
    await auditLog(req, 'pdfa_convert', 'ok', { fileId, originalName });

    return res.json({
      ok: true,
      fileId,
      fileName: path.basename(outPath),
      downloadUrl: `/api/pdfa/download/${fileId}`,
    });
  } catch (e) {
    console.error('[PDF/A] erro:', e);
    return res.status(500).json({ error: 'Erro ao converter para PDF/A.' });
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }
});

app.get('/api/pdfa/download/:id', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  const p = pdfaGetFile(id);
  if (!p || !fs.existsSync(p)) return res.status(404).send('Arquivo não encontrado.');
  return res.download(p, path.basename(p));
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

// ---------- ROTA: WERBRAN BALANCETE ----------

app.post(
  '/api/balancete-transitorio/jobs',
  requireAuth,
  requireCsrf, // CSRF obrigatório em mutações:contentReference[oaicite:4]{index=4}
  uploadBalancete.array('files'),
  async (req, res) => {
    const exePath = process.env.BALANCETE_EXE_PATH;
    if (!exePath) return res.status(500).json({ message: 'BALANCETE_EXE_PATH não configurado no .env' });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'Envie pelo menos 1 .xlsx no campo "files".' });

    const jobId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const jobBase = path.join(BALANCETE_DIR, jobId);

    // Mantém a lógica do C# intacta:
    // - entrada: ./balancetes
    // - saída:   ./PDFs Prontos
    // ambos relativos ao cwd:contentReference[oaicite:5]{index=5}
    const inputDir = path.join(jobBase, 'balancetes');
    const pdfDir = path.join(jobBase, 'PDFs Prontos');

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(pdfDir, { recursive: true });

    // move tmp -> input
    for (const f of files) {
      const n = safeName(f.originalname);
      if (!n.toLowerCase().endsWith('.xlsx')) {
        try { fs.unlinkSync(f.path); } catch (_) { }
        continue;
      }
      fs.renameSync(f.path, path.join(inputDir, n));
    }

    const statusPath = path.join(jobBase, 'job.json');

    const jobState = {
      jobId,
      status: 'processing',
      progress: 10,
      message: 'Arquivos recebidos. Iniciando...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      downloadUrl: null,
      logs: [{ ts: new Date().toISOString(), msg: `Arquivos recebidos: ${files.length}` }],
    };

    fs.writeFileSync(statusPath, JSON.stringify(jobState, null, 2), 'utf-8');

    await auditLog(req, 'job_create_balancete_transitorio', 'ok', { jobId, files: files.length });

    // responde imediato (JOB)
    res.json({ jobId });

    const patch = (partial) => {
      let cur = jobState;
      try {
        cur = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      } catch (_) { }

      const next = {
        ...cur,
        ...partial,
        updatedAt: new Date().toISOString(),
      };

      // limita logs (evita arquivo gigante)
      if (Array.isArray(next.logs) && next.logs.length > 1500) {
        next.logs = next.logs.slice(-1500);
      }

      fs.writeFileSync(statusPath, JSON.stringify(next, null, 2), 'utf-8');
    };

    const appendLog = (msg) => {
      const clean = (msg || '').toString().replace(/\r/g, '').trimEnd();
      if (!clean) return;

      let cur;
      try { cur = JSON.parse(fs.readFileSync(statusPath, 'utf-8')); } catch (_) { cur = jobState; }

      cur.logs = Array.isArray(cur.logs) ? cur.logs : [];
      cur.logs.push({ ts: new Date().toISOString(), msg: clean });
      cur.updatedAt = new Date().toISOString();

      if (cur.logs.length > 1500) cur.logs = cur.logs.slice(-1500);
      fs.writeFileSync(statusPath, JSON.stringify(cur, null, 2), 'utf-8');
    };

    try {
      patch({ progress: 25, message: 'Executando processamento (C#)...' });

      const child = spawn(exePath, [], {
        windowsHide: true,
        cwd: jobBase,
      });

      child.stdout.on('data', (d) => appendLog(d.toString('utf8')));
      child.stderr.on('data', (d) => appendLog('[stderr] ' + d.toString('utf8')));

      child.on('close', async (code) => {
        try {
          patch({ progress: 80, message: 'Finalizando e compactando PDFs...' });

          const pdfs = fs.existsSync(pdfDir)
            ? fs.readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith('.pdf'))
            : [];

          if (code === 0 && pdfs.length > 0) {
            const zipPath = path.join(jobBase, `PDFs-Prontos-${jobId}.zip`);
            await zipDirectory(pdfDir, zipPath);

            patch({
              status: 'done',
              progress: 100,
              message: 'Concluído.',
              downloadUrl: `/api/balancete-transitorio/jobs/${encodeURIComponent(jobId)}/download`,
            });

            appendLog(`Concluído. PDFs: ${pdfs.length}`);
          } else {
            patch({
              status: 'error',
              progress: 100,
              message: `Falha no processamento (exitCode=${code}). PDFs encontrados: ${pdfs.length}`,
            });
          }
        } catch (err) {
          appendLog('Erro ao finalizar: ' + String(err));
          patch({ status: 'error', progress: 100, message: 'Erro ao finalizar/compactar PDFs.' });
        }
      });
    } catch (err) {
      appendLog('Erro ao iniciar o processo: ' + String(err));
      patch({ status: 'error', progress: 100, message: 'Erro interno ao executar o C#.' });
    }
  }
);

// ---------- ROTA: Conciliador Hausen e Ocean ----------
app.post(
  '/api/conciliador-hausen-ocean/processar',
  requireAuth,
  requireCsrf,
  uploadConciliador.array('files', 2),
  async (req, res) => {
    try {
      const tipo = String(req.body?.tipo || '').toLowerCase();
      if (!['dre', 'balancete'].includes(tipo)) {
        return res.status(400).json({ message: 'Tipo inválido. Use DRE ou Balancete.' });
      }

      const files = req.files || [];
      if (files.length !== 2) {
        return res.status(400).json({ message: 'Envie exatamente 2 arquivos.' });
      }

      const jobId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      const jobDir = path.join(CONCILIADOR_OUT_DIR, jobId);
      fs.mkdirSync(jobDir, { recursive: true });

      const moved = files.map((f, idx) => {
        const safeName = `${idx + 1}_${(f.originalname || 'arquivo.xlsx').replace(/[^\w\-. ]+/g, '')}`;
        const dest = path.join(jobDir, safeName);
        fs.renameSync(f.path, dest);
        return dest;
      });

      const appPath = conciliadorGetAppPath();
      const templatePath = conciliadorGetTemplatePath(tipo);
      if (!fs.existsSync(templatePath)) {
        return res.status(500).json({ message: `Template não encontrado: ${templatePath}` });
      }

      const outName = `Consolidado_${tipo.toUpperCase()}_${Date.now()}.xlsx`;
      const outPath = path.join(jobDir, outName);

      let cmd = 'dotnet';
      let args = [];

      if (appPath?.kind === 'exe') {
        cmd = appPath.path;
        args = [
          '--pdf1', moved[0],
          '--pdf2', moved[1],
          '--template', templatePath,
          '--out', outPath,
          '--tipo', tipo.toUpperCase(),
        ];
      } else if (appPath?.kind === 'dll') {
        cmd = 'dotnet';
        args = [
          appPath.path,
          '--pdf1', moved[0],
          '--pdf2', moved[1],
          '--template', templatePath,
          '--out', outPath,
          '--tipo', tipo.toUpperCase(),
        ];
      } else {
        const csproj = conciliadorGetCsprojPath();
        args = [
          'run',
          '--project', csproj,
          '--',
          '--pdf1', moved[0],
          '--pdf2', moved[1],
          '--template', templatePath,
          '--out', outPath,
          '--tipo', tipo.toUpperCase(),
        ];
      }

      await new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { windowsHide: true });
        let stderr = '';
        child.stderr?.on('data', (d) => { stderr += d.toString('utf8'); });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) return resolve();
          return reject(new Error(stderr || `dotnet saiu com código ${code}`));
        });
      });

      if (!fs.existsSync(outPath)) {
        return res.status(500).json({ message: 'Arquivo de saída não foi gerado.' });
      }

      await auditLog(req, 'conciliador_hausen_ocean', 'ok', { tipo, jobId });
      return res.download(outPath, outName);
    } catch (err) {
      console.error('conciliador_hausen_ocean error:', err);
      await auditLog(req, 'conciliador_hausen_ocean', 'error', { error: err?.message || String(err) });
      return res.status(500).json({ message: err?.message || 'Erro ao processar.' });
    }
  }
);

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

// Download de balancete WERBRAN
app.get('/api/balancete-transitorio/jobs/:jobId', requireAuth, (req, res) => {
  const statusPath = path.join(BALANCETE_DIR, req.params.jobId, 'job.json');
  if (!fs.existsSync(statusPath)) return res.status(404).json({ message: 'Job não encontrado.' });
  res.json(JSON.parse(fs.readFileSync(statusPath, 'utf-8')));
});

app.get('/api/balancete-transitorio/jobs/:jobId/download', requireAuth, (req, res) => {
  const jobBase = path.join(BALANCETE_DIR, req.params.jobId);
  const zipPath = path.join(jobBase, `PDFs-Prontos-${req.params.jobId}.zip`);
  if (!fs.existsSync(zipPath)) return res.status(404).send('Arquivo não encontrado.');
  res.download(zipPath, path.basename(zipPath));
});

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

app.get('/irpf-carne-leao', requireAuthPage, (req, res) => {
  res.sendFile(path.join(publicDir, 'irpf-carne-leao.html'));
});

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Regras (valores extraídos das suas tabelas/PDFs):
 * 2024 (mai/23–jan/24) e 2024 (fev/24–abr/25): tabela 1.pdf
 * 2025 (mai/25–dez/25): tabela 2.pdf
 * 2026: tabela 3.pdf + explicacao calculo 2026.pdf (redutor adicional 5k–7.350)
 */
const IRPF_RULES = [
  {
    id: '2024_mai23_jan24',
    periodoLabel: '2024 (tabela mai/2023–jan/2024)',
    deducaoDependente: 189.59,
    descontoSimplificadoLimite: 528.00,
    faixas: [
      { ate: 2112.00, aliquota: 0.0, parcela: 0.0 },
      { ate: 2826.65, aliquota: 0.075, parcela: 158.40 },
      { ate: 3751.05, aliquota: 0.15, parcela: 370.40 },
      { ate: 4664.68, aliquota: 0.225, parcela: 651.73 },
      { ate: Infinity, aliquota: 0.275, parcela: 884.96 }
    ]
  },
  {
    id: '2024_fev24_abr25',
    periodoLabel: '2024/2025 (tabela fev/2024–abr/2025)',
    deducaoDependente: 189.59,
    descontoSimplificadoLimite: 564.80,
    faixas: [
      { ate: 2259.20, aliquota: 0.0, parcela: 0.0 },
      { ate: 2826.65, aliquota: 0.075, parcela: 169.44 },
      { ate: 3751.05, aliquota: 0.15, parcela: 381.44 },
      { ate: 4664.68, aliquota: 0.225, parcela: 662.77 },
      { ate: Infinity, aliquota: 0.275, parcela: 896.00 }
    ]
  },
  {
    id: '2025_mai25_dez25',
    periodoLabel: '2025 (tabela a partir de 05/2025)',
    deducaoDependente: 189.59,
    descontoSimplificadoLimite: 607.20,
    faixas: [
      { ate: 2428.80, aliquota: 0.0, parcela: 0.0 },
      { ate: 2826.65, aliquota: 0.075, parcela: 182.16 },
      { ate: 3751.05, aliquota: 0.15, parcela: 394.16 },
      { ate: 4664.68, aliquota: 0.225, parcela: 675.49 },
      { ate: Infinity, aliquota: 0.275, parcela: 908.73 }
    ]
  },
  {
    id: '2026_jan_dez',
    periodoLabel: '2026 (isenção até 5k + redutor 5k–7.350)',
    deducaoDependente: 189.59,
    descontoSimplificadoLimite: 607.20, // ajuste se seu PDF 2026 indicar outro limite
    faixas: [
      { ate: 2428.80, aliquota: 0.0, parcela: 0.0 },
      { ate: 2826.65, aliquota: 0.075, parcela: 182.16 },
      { ate: 3751.05, aliquota: 0.15, parcela: 394.16 },
      { ate: 4664.68, aliquota: 0.225, parcela: 675.49 },
      { ate: Infinity, aliquota: 0.275, parcela: 908.73 }
    ],
    regra2026: {
      isentoAte: 5000.0,
      faixaRedutorAte: 7350.0,
      // redutor = 978,62 - (0,133145 * rendimentos)
      redutorConst: 978.62,
      redutorCoef: 0.133145
    }
  }
];

function calcFaixa(base, regra) {
  const faixa = regra.faixas.find((f) => base <= f.ate) || regra.faixas[regra.faixas.length - 1];
  const imposto = Math.max(0, base * faixa.aliquota - faixa.parcela);
  return {
    aliquota: faixa.aliquota,
    parcelaADeduzir: faixa.parcela,
    imposto: round2(imposto)
  };
}

function calcDeducao(rendimentos, despesas, dependentes, regra) {
  const descontoSimplificado = Math.min(rendimentos * 0.2, regra.descontoSimplificadoLimite);
  const deducaoDependentes = dependentes * regra.deducaoDependente;
  const deducaoLegal = despesas + deducaoDependentes;

  const usarSimplificado = descontoSimplificado >= deducaoLegal;
  const deducaoUsada = usarSimplificado ? descontoSimplificado : deducaoLegal;

  return {
    tipo: usarSimplificado ? 'Desconto simplificado' : 'Deduções legais',
    valor: round2(deducaoUsada),
    descontoSimplificado: round2(descontoSimplificado),
    deducaoLegal: round2(deducaoLegal),
    deducaoDependentes: round2(deducaoDependentes)
  };
}

function applyRegra2026IfNeeded(rendimentosReferencia, impostoCalculado, regra) {
  if (!regra.regra2026) {
    return { impostoFinal: impostoCalculado, meta2026: null };
  }

  const r = regra.regra2026;
  if (rendimentosReferencia <= r.isentoAte) {
    return {
      impostoFinal: 0,
      meta2026: { redutorAplicado: round2(impostoCalculado), rendimentosReferencia: round2(rendimentosReferencia) }
    };
  }

  if (rendimentosReferencia <= r.faixaRedutorAte) {
    const redutor = Math.max(0, r.redutorConst - (r.redutorCoef * rendimentosReferencia));
    const impostoFinal = Math.max(0, impostoCalculado - redutor);
    return {
      impostoFinal: round2(impostoFinal),
      meta2026: {
        redutorAplicado: round2(impostoCalculado - impostoFinal),
        rendimentosReferencia: round2(rendimentosReferencia)
      }
    };
  }

  return { impostoFinal: impostoCalculado, meta2026: { redutorAplicado: 0, rendimentosReferencia: round2(rendimentosReferencia) } };
}

app.get('/api/irpf/simular', requireAuth, (req, res) => {
  const rendimentos = toNumber(req.query.rendimentos);
  const despesas = toNumber(req.query.despesas);
  const dependentes = Math.max(0, Math.floor(toNumber(req.query.dependentes)));
  const impostoPago = toNumber(req.query.impostoPago);
  const saldoAnterior = toNumber(req.query.saldoAnterior);

  if (!Number.isFinite(rendimentos) || rendimentos <= 0) {
    return res.status(400).json({ error: 'rendimentos inválido' });
  }

  const items = IRPF_RULES.map((regra) => {
    const deducao = calcDeducao(rendimentos, despesas, dependentes, regra);
    const baseCalculo = Math.max(0, rendimentos - deducao.valor);

    const faixa = calcFaixa(baseCalculo, regra);
    const impostoAntes2026 = faixa.imposto;

    const applied = applyRegra2026IfNeeded(rendimentos, impostoAntes2026, regra);
    const impostoDevido = applied.impostoFinal;

    const saldoPagarCompensar = round2(impostoDevido - impostoPago - saldoAnterior);

    return {
      regraId: regra.id,
      periodoLabel: regra.periodoLabel,
      deducao,
      baseCalculo: round2(baseCalculo),
      faixa: {
        aliquota: faixa.aliquota,
        parcelaADeduzir: round2(faixa.parcelaADeduzir)
      },
      impostoDevido: round2(impostoDevido),
      impostoPago: round2(impostoPago),
      saldoAnterior: round2(saldoAnterior),
      saldoPagarCompensar,
      meta2026: applied.meta2026
    };
  });

  res.json({ items });
});

// ----------------------------------------------------------------------
// DIMOB – Automação (SPED F525 -> tabela de faturamento mensal)
// ----------------------------------------------------------------------

function dimobParsePreviousDimobLocatarios(decText, declaranteCnpj14 = '') {
  const set = new Set();
  const cnpjDeclarante = String(declaranteCnpj14 || '').replace(/\D+/g, '').padStart(14, '0');

  // Heurística robusta:
  // - captura tokens de 11 ou 14 dígitos (CPF/CNPJ) separados por não-dígitos
  // - evita capturar datas (8 dígitos), valores etc.
  const re = /(^|\D)(\d{11}|\d{14})(?=\D|$)/g;

  const text = String(decText || '');
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[2];
    const only = raw.replace(/\D+/g, '');
    if (!(only.length === 11 || only.length === 14)) continue;

    const doc14 = only.padStart(14, '0');

    // remove o CNPJ do declarante (normalmente aparece no cabeçalho do DEC)
    if (cnpjDeclarante && doc14 === cnpjDeclarante) continue;

    set.add(doc14);
  }

  return set;
}

// Busca DIMOB do ano anterior na pasta da rede:
// W:\DECLARAÇÕES\DIMOB\{ano_anterior}\1-GRAVADAS
app.get('/api/dimob/previous-file', requireAuth, async (req, res) => {
  try {
    const cnpj = String(req.query?.cnpj || '').replace(/\D+/g, '');
    const year = Number(req.query?.year);
    const debug = String(req.query?.debug || '') === '1';

    if (!/^\d{14}$/.test(cnpj)) return res.status(400).json({ found: false, error: 'CNPJ inválido (14 dígitos).' });
    if (!Number.isFinite(year) || year < 2015) return res.status(400).json({ found: false, error: 'Ano inválido.' });

    const prevYear = year - 1;

    const baseDirRaw = process.env.DIMOB_NETWORK_BASE_DIR || 'W:\\DECLARAÇÕES\\DIMOB';
    const baseDir = resolveWPath(baseDirRaw); // ✅ aqui traduz W:\ para UNC quando necessário
    const dir = path.join(baseDir, String(prevYear), '1-GRAVADAS');


    const dbg = {
      yearReceived: year,
      prevYear,
      baseDir,
      dir,
      existsDir: fs.existsSync(dir),
    };

    if (!dbg.existsDir) {
      return res.json({
        found: false,
        error: `Diretório não encontrado: ${dir}`,
        ...(debug ? { debug: dbg } : {})
      });
    }

    const all = fs.readdirSync(dir).filter(f => /\.dec$/i.test(f));
    dbg.filesFound = all.length;

    // padrão exato: CNPJ-DIMOB-ANO-ORIGI.DEC ou ...-RETIF.DEC
    const re = new RegExp(`^${cnpj}-DIMOB-${prevYear}-(ORIGI|RETIF)\\.DEC$`, 'i');

    const candidates = all
      .filter(f => re.test(f))
      .map(f => {
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        const up = f.toUpperCase();
        const kind = up.endsWith('-RETIF.DEC') ? 'RETIF' : (up.endsWith('-ORIGI.DEC') ? 'ORIGI' : 'OUTRO');
        return { f, full, kind, mtimeMs: st.mtimeMs, size: st.size };
      });

    dbg.candidates = candidates.map(x => ({ f: x.f, kind: x.kind, mtimeMs: x.mtimeMs }));

    if (!candidates.length) {
      return res.json({
        found: false,
        error: `Nenhum arquivo encontrado com padrão ${cnpj}-DIMOB-${prevYear}-ORIGI.DEC/RETIF.DEC em ${dir}`,
        ...(debug ? { debug: dbg } : {})
      });
    }

    // Preferir RETIF, senão ORIGI, sempre o mais recente
    const retifs = candidates.filter(x => x.kind === 'RETIF').sort((a, b) => b.mtimeMs - a.mtimeMs);
    const origis = candidates.filter(x => x.kind === 'ORIGI').sort((a, b) => b.mtimeMs - a.mtimeMs);
    const chosen = retifs[0] || origis[0] || candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

    dbg.chosen = { f: chosen.f, kind: chosen.kind, mtimeMs: chosen.mtimeMs, size: chosen.size };

    const fileId = dimobStoreNetworkFile(chosen.full);

    return res.json({
      found: true,
      fileId,
      fileName: chosen.f,
      mtime: new Date(chosen.mtimeMs).toISOString(),
      size: chosen.size,
      ...(debug ? { debug: dbg } : {})
    });
  } catch (e) {
    return res.status(500).json({ found: false, error: 'Erro ao buscar arquivo na rede.', details: e.message });
  }
});

app.post(
  '/api/dimob/parse-sped',
  requireAuth,
  requireCsrf,
  uploadDimob.fields([
    { name: 'spedFiles', maxCount: 40 },
    { name: 'previousDimob', maxCount: 1 },
  ]),
  async (req, res) => {
    const cleanupPaths = [];
    try {
      const cnpj = dimobOnlyDigits(req.body?.cnpj);
      const yearSelected = Number(req.body?.year);
      const debugEnabled = String(req.query?.debug || '') === '1';

      if (!/^\d{14}$/.test(cnpj)) return res.status(400).json({ error: 'CNPJ inválido (14 dígitos).' });
      if (!Number.isFinite(yearSelected) || yearSelected < 2015) return res.status(400).json({ error: 'Ano inválido.' });

      const spedFiles = (req.files?.spedFiles || []);
      if (!spedFiles.length) return res.status(400).json({ error: 'Anexe pelo menos um SPED.' });

      const warnings = [];
      const debug = debugEnabled ? { filesParsed: [], monthChosen: [] } : null;

      // stats + cleanup
      const spedStats = spedFiles.map(f => {
        cleanupPaths.push(f.path);
        const st = fs.statSync(f.path);
        return { ...f, mtimeMs: st.mtimeMs, size: st.size };
      });

      // 1) Parse 1x cada arquivo, sempre aceitando se houver 0000 válido do ano
      const parsedPerFile = [];
      for (const f of spedStats) {
        const r = await dimobParseSpedFileOnce(f.path);

        if (debugEnabled) {
          debug.filesParsed.push({
            originalname: f.originalname,
            size: f.size,
            mtimeMs: f.mtimeMs,
            encoding: r.encoding,
            dtIni: r.dtIni,
            dtFim: r.dtFim,
            detectedMonth: r.month,
            detectedYear: r.year,
            f525Parsed: r.f525Parsed,
            f525Skipped: r.f525Skipped,
            f200Parsed: r.f200Parsed,
            f200Skipped: r.f200Skipped,
            sampleF525: r.sampleF525,
            sampleF200: r.sampleF200
          });
        }

        // 0000 é obrigatório para classificar mês/ano
        if (!r.year || !r.month) {
          warnings.push(`Arquivo ${f.originalname}: não identifiquei DT_INI/DT_FIN no 0000 (campos 06/07). Ignorado.`);
          continue;
        }

        if (r.year !== yearSelected) {
          warnings.push(`Arquivo ${f.originalname}: ano do 0000 = ${r.year} (esperado ${yearSelected}). Ignorado.`);
          continue;
        }

        // Se não tiver F525 nem F200, não ignora: apenas mês zerado
        if (r.f525Parsed === 0 && r.f200Parsed === 0) {
          warnings.push(`Arquivo ${f.originalname}: não possui F525 nem F200. Mês ${String(r.month).padStart(2, '0')} ficará zerado.`);
        }

        parsedPerFile.push({
          file: f,
          month: r.month,
          year: r.year,
          dtIni: r.dtIni,
          dtFim: r.dtFim,
          aggF525: r.aggF525,
          opsF200: r.opsF200,
          f525Parsed: r.f525Parsed,
          f525Skipped: r.f525Skipped,
          f200Parsed: r.f200Parsed,
          f200Skipped: r.f200Skipped
        });
      }

      // Se nenhum arquivo tiver 0000 válido no ano, aí sim erro
      if (!parsedPerFile.length) {
        return res.status(400).json({
          error: 'Nenhum SPED válido foi processado (verifique o registro 0000 e o ano selecionado).',
          warnings,
          ...(debugEnabled ? { debug } : {})
        });
      }

      // 2) Selecionar 1 arquivo por mês: mais novo (mtimeMs)
      const byMonth = new Map();
      for (const item of parsedPerFile) {
        const m = Number(item.month);
        if (!Number.isFinite(m) || m < 1 || m > 12) continue;
        const key = String(m);
        const cur = byMonth.get(key);
        if (!cur || item.file.mtimeMs > cur.file.mtimeMs) byMonth.set(key, item);
      }

      const monthsSorted = Array.from(byMonth.keys()).map(Number).sort((a, b) => a - b);

      if (debugEnabled) {
        debug.monthChosen = monthsSorted.map(m => {
          const it = byMonth.get(String(m));
          return {
            month: m,
            originalname: it?.file?.originalname,
            mtimeMs: it?.file?.mtimeMs,
            dtIni: it?.dtIni,
            dtFim: it?.dtFim,
            f525Parsed: it?.f525Parsed || 0,
            f200Parsed: it?.f200Parsed || 0,
            docsF525: it?.aggF525?.size || 0,
            opsF200: it?.opsF200?.length || 0
          };
        });
      }

      // 3) Montar faturamento (F525): doc -> month -> sum
      const finalF525 = new Map(); // doc -> Map(month -> value)
      const firstMonthByDoc = new Map(); // doc -> firstMonthDetected (1..12)

      let parsedF525Lines = 0;
      let skippedF525Lines = 0;

      // 4) Montar atividade imobiliária (F200): lista consolidada (apenas dos arquivos escolhidos por mês)
      const atividadeImobiliaria = [];
      let parsedF200Lines = 0;
      let skippedF200Lines = 0;

      for (const m of monthsSorted) {
        const it = byMonth.get(String(m));
        if (!it) continue;

        parsedF525Lines += Number(it?.f525Parsed || 0);
        skippedF525Lines += Number(it?.f525Skipped || 0);

        parsedF200Lines += Number(it?.f200Parsed || 0);
        skippedF200Lines += Number(it?.f200Skipped || 0);


        // F525
        for (const [doc, sum] of it.aggF525.entries()) {
          if (!finalF525.has(doc)) finalF525.set(doc, new Map());
          finalF525.get(doc).set(String(m), sum);

          if (sum > 0 && !firstMonthByDoc.has(doc)) firstMonthByDoc.set(doc, m);
        }

        // F200
        for (const op of (it.opsF200 || [])) {
          // também marcamos o mês detectado (útil para debug/UI)
          atividadeImobiliaria.push({ ...op, mesDetectado: m });
        }
      }

      // DIMOB anterior: upload (.DEC) OU fileId da rede (mantém como você já tem)
      let previousSet = null;

      const previousFileId = String(req.body?.previousFileId || '').trim();
      const prevUpload = (req.files?.previousDimob || [])[0];

      if (prevUpload?.path) {
        cleanupPaths.push(prevUpload.path);
        let txt = '';
        try { txt = fs.readFileSync(prevUpload.path, 'utf-8'); }
        catch { txt = fs.readFileSync(prevUpload.path, 'latin1'); }
        previousSet = dimobParsePreviousDimobLocatarios(txt);
      } else if (previousFileId) {
        const p = dimobGetNetworkFile(previousFileId);
        if (p && fs.existsSync(p)) {
          let txt = '';
          try { txt = fs.readFileSync(p, 'utf-8'); }
          catch { txt = fs.readFileSync(p, 'latin1'); }
          previousSet = dimobParsePreviousDimobLocatarios(txt);
        }
      }

      // Payload faturamento (UI)
      const byParticipant = [];
      const totalsByMonth = {};
      let grandTotal = 0;

      const docs = Array.from(finalF525.keys()).sort();
      for (const doc of docs) {
        const monthMap = finalF525.get(doc);
        const monthsObj = {};
        let total = 0;

        for (let mm = 1; mm <= 12; mm++) {
          const key = String(mm);
          const v = Number(monthMap?.get(key) || 0);
          monthsObj[key] = v;
          totalsByMonth[key] = Number(totalsByMonth[key] || 0) + v;
          total += v;
        }

        grandTotal += total;
        byParticipant.push({ participantDoc: doc, months: monthsObj, total });
      }

      // Novos locatários: doc que está no SPED (F525) e não está na DIMOB anterior
      const newParticipants = [];
      if (previousSet) {
        for (const doc of docs) {
          if (previousSet.has(doc)) continue;

          const monthMap = finalF525.get(doc);

          // acha o primeiro mês em que esse doc tem valor > 0
          let firstMonth = null;
          for (let mm = 1; mm <= 12; mm++) {
            const v = Number(monthMap?.get(String(mm)) || 0);
            if (v > 0) { firstMonth = mm; break; }
          }

          const obs = firstMonth
            ? `Primeira ocorrência no SPED: ${String(firstMonth).padStart(2, '0')}/${yearSelected}`
            : '';

          newParticipants.push({
            participantDoc: doc,
            firstMonthDetected: firstMonth,
            observacao: obs
          });
        }
      }


      await auditLog(req, 'dimob_parse_sped', 'ok', {
        cnpj,
        year: yearSelected,
        spedFiles: spedFiles.length,
        monthsUsed: monthsSorted,
        parsedF525Lines,
        skippedF525Lines,
        parsedF200Lines,
        skippedF200Lines,
        warningsCount: warnings.length,
        usedPrevious: Boolean(previousSet)
      });

      return res.json({
        cnpj,
        year: yearSelected,
        warnings,

        // F525 / Faturamento
        parsedLines: parsedF525Lines,
        skippedLines: skippedF525Lines,
        byParticipant,
        totalsByMonth,
        grandTotal,
        newParticipants,

        // F200 / Atividade Imobiliária
        atividadeImobiliaria,
        parsedF200Lines,
        skippedF200Lines,

        ...(debugEnabled ? { debug } : {})
      });
    } catch (e) {
      console.error('dimob parse-sped error:', e);
      await auditLog(req, 'dimob_parse_sped', 'error', { error: e?.message || String(e) });
      return res.status(500).json({ error: 'Erro ao processar SPED.' });
    } finally {
      for (const p of cleanupPaths) {
        try { fs.unlinkSync(p); } catch { }
      }
    }
  }
);

// ============================
// DIMOB - GERAR ARQUIVO NOVO
// ============================

const DIMOB_PUBLIC_JS_DIR = path.join(__dirname, '..', 'public', 'js');
const DIMOB_LAYOUT_PATH = process.env.DIMOB_LAYOUT_PATH || path.join(DIMOB_PUBLIC_JS_DIR, 'layout dimob.json');
const DIMOB_MUNICIPIOS_PATH = process.env.DIMOB_MUNICIPIOS_PATH || path.join(DIMOB_PUBLIC_JS_DIR, 'municipios DIMOB.json');

let __dimobLayoutCache = null;
let __dimobMunicipiosCache = null;
let __dimobMunicipioMap = null;

function dimobLoadLayout() {
  if (__dimobLayoutCache) return __dimobLayoutCache;
  const raw = fs.readFileSync(DIMOB_LAYOUT_PATH, 'utf-8');
  __dimobLayoutCache = JSON.parse(raw);
  return __dimobLayoutCache;
}

function dimobNormalizeText(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function dimobSanitizeAscii(s) {
  // 1) remove acentos, uppercase (já faz no normalize)
  let out = dimobNormalizeText(s);

  // 2) remove qualquer coisa fora de um conjunto seguro (DIMOB costuma aceitar A-Z/0-9/espaco e pontuações simples)
  out = out.replace(/[^A-Z0-9 \-\/\.\,\(\)&]/g, ' ');

  // 3) compacta espaços
  out = out.replace(/\s+/g, ' ').trim();

  return out;
}


function dimobLoadMunicipios() {
  if (__dimobMunicipioMap) return __dimobMunicipioMap;
  const raw = fs.readFileSync(DIMOB_MUNICIPIOS_PATH, 'utf-8');
  __dimobMunicipiosCache = JSON.parse(raw);

  const map = new Map();
  for (const it of __dimobMunicipiosCache) {
    const uf = dimobNormalizeText(it.MUNI_UF_SG);
    const nm = dimobNormalizeText(it.MUNI_NM);
    const key = `${uf}|${nm}`;
    map.set(key, String(it.MUNI_CD));
  }
  __dimobMunicipioMap = map;
  return map;
}

function dimobGetMunicipioCode(uf, municipio) {
  const map = dimobLoadMunicipios();
  const key = `${dimobNormalizeText(uf)}|${dimobNormalizeText(municipio)}`;
  return map.get(key) || null;
}

// start/end são 1-based inclusive
function dimobSetSlice(line, start, end, value, padChar = ' ', align = 'left') {
  const len = (end - start + 1);
  let v = String(value ?? '');

  if (v.length > len) v = v.slice(0, len);

  if (align === 'right') v = v.padStart(len, padChar);
  else v = v.padEnd(len, padChar);

  const a = line.slice(0, start - 1);
  const b = line.slice(end);
  return a + v + b;
}

function dimobFormatMoneyFixed(value, len) {
  const n = Number(value || 0);
  const cents = Math.round(n * 100);
  return String(cents).padStart(len, '0');
}

// Extrai doc do locatário do R02 via heurística segura:
// pega o ÚLTIMO bloco de 14 dígitos antes do padrão contrato+datas.
function dimobExtractLocatarioFromR02(line) {
  const m = /(\d{6})(\d{8})(\d{8})/.exec(line);
  const idxContrato = m ? m.index : -1;
  const head = idxContrato >= 0 ? line.slice(0, idxContrato) : line;

  const nome60 = dimobSanitizeField(n.nome || '', 60);
  const endereco = dimobSanitizeField(n.endereco || '', 60);
  const municipio = dimobSanitizeField(n.municipio || '', 20);
  const uf = dimobSanitizeField(n.uf || '', 2);

  const all14 = [...head.matchAll(/\d{14}/g)];
  if (!all14.length) return { doc14: null, nameStart: null, nameEnd: null, contratoIndex: idxContrato };

  const last = all14[all14.length - 1];
  const doc14 = last[0];
  const nameStart = last.index + 14;
  const nameEnd = idxContrato >= 0 ? idxContrato : null;

  return { doc14, nameStart, nameEnd, contratoIndex: idxContrato };
}

function dimobApplyLocadorToR02(line, { locadorDoc14, locadorNome60 }) {
  // Layout R02:
  // 149 tipo_do_locador (1)
  // 150-163 cpf_cnpj_do_locador (14)
  // 164-223 nome_do_locador (60)
  let ln = line;

  const doc14 = String(locadorDoc14 || '').replace(/\D/g, '').padStart(14, '0').slice(-14);
  const nome60 = dimobSanitizeAscii(locadorNome60 || '').slice(0, 60);

  return ln;
}


// Atualiza aluguel/comissão no R02 usando layout JSON (parte dos valores bate com o DEC real)
function dimobApplyF525ToR02(line, monthsObj) {
  const layout = dimobLoadLayout();
  const fields = layout?.records?.R02?.fields || [];

  // helper: pega pos de um campo
  const pos = (key) => fields.find(f => f.key === key);

  let total = 0;
  for (let mm = 1; mm <= 12; mm++) {
    const k = String(mm).padStart(2, '0');
    const keyField = `valor_do_aluguel_${k}`;
    const f = pos(keyField);
    if (!f) continue;

    const v = Number(monthsObj?.[String(mm)] || 0);
    total += v;
    const formatted = dimobFormatMoneyFixed(v, f.len);
    line = dimobSetSlice(line, f.start, f.end, formatted, '0', 'right');
  }

  // total do aluguel
  const ft = pos('valor_total_do_aluguel');
  if (ft) {
    const formattedTotal = dimobFormatMoneyFixed(total, ft.len);
    line = dimobSetSlice(line, ft.start, ft.end, formattedTotal, '0', 'right');
  }

  // zera comissão (mensal + total)
  for (let mm = 1; mm <= 12; mm++) {
    const k = String(mm).padStart(2, '0');
    const keyField = `valor_da_comissao_${k}`;
    const f = pos(keyField);
    if (!f) continue;
    line = dimobSetSlice(line, f.start, f.end, ''.padStart(f.len, '0'), '0', 'right');
  }
  const fc = pos('valor_total_da_comissao');
  if (fc) line = dimobSetSlice(line, fc.start, fc.end, ''.padStart(fc.len, '0'), '0', 'right');

  return line;
}

// Atualiza "ano" nos registros (posição padrão 18-21 no DEC real)
function dimobSetYearInLine(line, year) {
  const y = String(year).padStart(4, '0');
  // 18-21
  return dimobSetSlice(line, 18, 21, y, '0', 'right');
}

// Atualiza cabeçalho: chars 13-16
function dimobSetYearInHeader(headerLine, year) {
  const y = String(year).padStart(4, '0');
  return headerLine.slice(0, 12) + y + headerLine.slice(16);
}

function dimobSanitizeText(s) {
  s = String(s ?? '');

  // remove acentos/diacríticos
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // remove caracteres de controle
  s = s.replace(/[\u0000-\u001F\u007F]/g, ' ');

  // permite só letras/números/espaços e alguns sinais comuns
  s = s.replace(/[^A-Za-z0-9 \/\.\,\-\(\)]/g, ' ');

  // normaliza espaços
  s = s.replace(/\s+/g, ' ').trim();

  return s.toUpperCase();
}

function dimobSanitizeField(s, maxLen) {
  const out = dimobSanitizeText(s);
  return maxLen ? out.slice(0, maxLen) : out;
}

async function dimobUpdateR01UsingCnpj(line, cnpj) {
  let data = null;
  try {
    const r = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    data = r.data;
  } catch {
    return line;
  }

  const dados = data || {};

  const nome = dimobSanitizeAscii(dados.nome || dados.razao_social || '');
  const logradouro = dimobSanitizeAscii(dados.logradouro || '');
  const numero = dimobSanitizeAscii(dados.numero || '');
  const complemento = dimobSanitizeAscii(dados.complemento || '');
  const bairro = dimobSanitizeAscii(dados.bairro || '');
  const municipio = dimobSanitizeAscii(dados.municipio || dados.cidade || '');
  const uf = dimobSanitizeAscii(dados.uf || '').slice(0, 2);

  let endereco = [logradouro, numero ? `N ${numero}` : '', complemento ? ` ${complemento}` : '', bairro ? ` - ${bairro}` : '']
    .filter(Boolean).join(' ').trim();

  // limites típicos do seu R01 (nome 60 / endereço 120 / municipio 20 / uf 2)
  const nome60 = nome.slice(0, 60);
  const end120 = endereco.slice(0, 120);
  const mun20 = municipio.slice(0, 20);
  const uf2 = uf.slice(0, 2);

  const cod = dimobGetMunicipioCode(uf2, mun20); // sua função já existe

  // ajuste conforme seu layout R01 (você já está usando essas posições no seu código atual)
  if (nome60) line = dimobSetSlice(line, 44, 103, nome60, ' ', 'left');
  if (end120) line = dimobSetSlice(line, 115, 234, end120, ' ', 'left');
  if (uf2) line = dimobSetSlice(line, 235, 236, uf2, ' ', 'left');
  if (cod) line = dimobSetSlice(line, 237, 240, String(cod).padStart(4, '0'), '0', 'right');
  if (mun20) line = dimobSetSlice(line, 241, 260, mun20, ' ', 'left');

  return line;
}

// ============ ENDPOINT (NOVA VERSÃO) ============
function dimobSanitizeText(s) {
  s = String(s ?? '');

  // remove caracteres de controle
  s = s.replace(/[\u0000-\u001F\u007F]/g, ' ');

  // remove acentos (NFD) e diacríticos
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // troca caracteres “problemáticos” por espaço
  // (mantém letras, números e pontuação básica que costuma passar na DIMOB)
  s = s.replace(/[^A-Za-z0-9 \/\.\,\-\(\)]/g, ' ');

  // colapsa espaços
  s = s.replace(/\s+/g, ' ').trim();

  return s.toUpperCase();
}

function dimobSanitizeField(s, maxLen) {
  const out = dimobSanitizeText(s);
  if (!maxLen) return out;
  return out.slice(0, maxLen);
}


app.post('/api/dimob/generate-file', requireAuth, requireCsrf, async (req, res) => {
  let cnpj = '';
  let year = NaN;
  let previousFileId = '';
  let byParticipant = [];
  let newLocatarios = [];
  let prevPath = '';

  const traceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function send500(e) {
    const msg = e?.message || String(e);
    const stack = String(e?.stack || '');
    console.error(`[DIMOB][${traceId}] generate-file ERROR:`, e);
    return res.status(500).json({
      error: 'Erro ao gerar arquivo DIMOB.',
      traceId,
      detail: msg,
      stack: stack.split('\n').slice(0, 12).join('\n')
    });
  }

  // normaliza doc para chave do Map: remove zeros à esquerda de CPF que vem preenchido
  function normalizeDocKey(d) {
    d = String(d || '').replace(/\D/g, '');
    // se veio com padding (ex.: CPF dentro de campo 14), remove zeros iniciais
    d = d.replace(/^0+(?=\d{11,14}$)/, '');
    return d;
  }

  try {
    // ------------------ payload ------------------
    cnpj = String(req.body?.cnpj || '').replace(/\D/g, '');
    year = Number(req.body?.year);
    previousFileId = String(req.body?.previousFileId || '').trim();
    byParticipant = Array.isArray(req.body?.byParticipant) ? req.body.byParticipant : [];
    newLocatarios = Array.isArray(req.body?.newLocatarios) ? req.body.newLocatarios : [];

    if (!/^\d{14}$/.test(cnpj)) return res.status(400).json({ error: 'CNPJ inválido.' });
    if (!Number.isFinite(year) || year < 2015) return res.status(400).json({ error: 'Ano inválido.' });
    if (!previousFileId) return res.status(400).json({ error: 'previousFileId não informado.' });

    // ------------------ arquivo anterior ------------------
    prevPath = dimobGetNetworkFile(previousFileId);
    if (!prevPath || !fs.existsSync(prevPath)) {
      return res.status(400).json({ error: 'Arquivo DIMOB anterior não encontrado no servidor.' });
    }

    let raw = '';
    try { raw = fs.readFileSync(prevPath, 'utf-8'); }
    catch { raw = fs.readFileSync(prevPath, 'latin1'); }

    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return res.status(400).json({ error: 'Arquivo DIMOB anterior está vazio ou inválido.' });

    // ------------------ SPED map ------------------
    const spedMap = new Map();
    for (const it of byParticipant) {
      const docKey = normalizeDocKey(it.participantDoc);
      if (!docKey) continue;
      spedMap.set(docKey, it.months || {});
    }

    // ------------------ header + R01 ------------------
    const header = lines[0] || '';
    const newHeader = dimobSetYearInHeader(header, year);

    const r01Old = lines.find(l => l.startsWith('R01'));
    if (!r01Old) return res.status(400).json({ error: 'Arquivo anterior não possui registro R01.' });

    let r01New = r01Old;
    r01New = dimobSetYearInLine(r01New, year);
    r01New = dimobSetSlice(r01New, 22, 22, '0', '0', 'right');
    r01New = dimobSetSlice(r01New, 23, 34, '000000000000', '0', 'right');
    r01New = await dimobUpdateR01UsingCnpj(r01New, cnpj);

    const locadorDoc14 = cnpj; // sempre CNPJ do declarante
    const locadorNome60 = dimobSanitizeAscii(r01New.slice(44 - 1, 103).trim()).slice(0, 60);

    // ------------------ layout R02 ------------------
    const layout = dimobLoadLayout();
    const r02Fields = layout?.records?.R02?.fields || [];

    const pos = (key) => {
      const f = r02Fields.find(x => x.key === key);
      return f ? { start: f.start, end: f.end, len: (f.end - f.start + 1) } : null;
    };

    const P_SEQ = pos('sequencial_da_locacao');
    const P_LOCADOR_DOC = pos('cpf_cnpj_do_locador');
    const P_LOCADOR_NOME = pos('nome_do_locador');
    const P_LOCADOR_TIPO = pos('tipo_do_locador');

    const P_LOCAT_DOC = pos('cpf_cnpj_do_locatario');
    const P_LOCAT_NOME = pos('nome_do_locatario');

    // contrato / datas (dependem do seu JSON correto)
    const P_NUM_CONTR = pos('numero_do_contrato') || pos('numero_do_contrato_de_locacao');
    const P_DT_CONTR = pos('data_do_contrato') || pos('data_do_contrato_de_locacao');
    const P_DTINI = pos('data_de_inicio_do_contrato');
    const P_DTFIM = pos('data_de_termino_do_contrato');

    // imóvel (dependem do seu JSON correto)
    const P_TIPO_IMOVEL = pos('tipo_do_imovel');
    const P_END_IMOVEL = pos('endereco_do_imovel');
    const P_CEP_IMOVEL = pos('cep_do_imovel') || pos('cep');
    const P_COD_MUN = pos('codigo_do_municipio_do_imovel') || pos('codigo_do_municipio');
    const P_UF_IMOVEL = pos('uf_do_imovel') || pos('uf');

    if (!P_LOCAT_DOC || !P_LOCAT_NOME || !P_SEQ) {
      return res.status(500).json({ error: 'Layout DIMOB (R02) não possui campos essenciais (sequencial/locatário).' });
    }

    function r02GetLocatarioDocKey(line) {
      const rawDoc = line.slice(P_LOCAT_DOC.start - 1, P_LOCAT_DOC.end);
      return normalizeDocKey(rawDoc);
    }

    function r02GetSeq(line) {
      const rawSeq = line.slice(P_SEQ.start - 1, P_SEQ.end);
      const n = parseInt(String(rawSeq || '').replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? n : 0;
    }

    function applyLocadorByLayout(ln) {
      // escreve locador só nos campos do JSON atual (não hardcode)
      if (P_LOCADOR_TIPO) ln = dimobSetSlice(ln, P_LOCADOR_TIPO.start, P_LOCADOR_TIPO.end, '2', '0', 'right');
      if (P_LOCADOR_DOC) ln = dimobSetSlice(ln, P_LOCADOR_DOC.start, P_LOCADOR_DOC.end, locadorDoc14, '0', 'right');
      if (P_LOCADOR_NOME) ln = dimobSetSlice(ln, P_LOCADOR_NOME.start, P_LOCADOR_NOME.end, locadorNome60, ' ', 'left');
      return ln;
    }

    // ------------------ R02 existentes ------------------
    const r02Templates = lines.filter(l => l.startsWith('R02'));
    const r02Template = r02Templates[0] || null;

    let maxSeq = 0;
    for (const l of r02Templates) maxSeq = Math.max(maxSeq, r02GetSeq(l));

    const r02Out = [];
    for (const line of r02Templates) {
      const docKey = r02GetLocatarioDocKey(line);
      if (!docKey) continue;
      if (!spedMap.has(docKey)) continue;

      let ln = line;
      ln = dimobSetYearInLine(ln, year);

      // ✅ locador sempre = TOSCAN, mas escrito no lugar certo do JSON atual
      ln = applyLocadorByLayout(ln);

      // valores mensais
      ln = dimobApplyF525ToR02(ln, spedMap.get(docKey));
      r02Out.push(ln);
    }

    // ------------------ novos locatários ------------------
    if (newLocatarios.length && !r02Template) {
      return res.status(400).json({ error: 'Arquivo anterior não possui nenhum R02 para servir de template.' });
    }

    function formatCpfCnpjField(docDigits, fieldLen) {
      const d = String(docDigits || '').replace(/\D/g, '');

      // CPF (11) => "04092799942   " (espaços à direita)
      if (d.length <= 11) {
        const cpf11 = d.padStart(11, '0').slice(-11);         // mantém zero válido no começo
        return cpf11.padEnd(fieldLen, ' ');                   // completa com espaço à direita
      }

      // CNPJ (14) => "12345678000199" (14)
      const cnpj14 = d.padStart(14, '0').slice(-14);
      // se fieldLen for 14, isso já fica exato; se for maior, completa com espaço
      return cnpj14.padEnd(fieldLen, ' ');
    }


    for (const n of newLocatarios) {
      const docKey = normalizeDocKey(n.doc || n.participantDoc);
      const docField = formatCpfCnpjField(docKey, P_LOCAT_DOC.len);

      const nomeField = dimobSanitizeAscii(n.nome || '').slice(0, P_LOCAT_NOME.len || 60);

      const contrato6 = String(n.contrato || '').replace(/\D/g, '').padStart(6, '0').slice(0, 6);
      const dtIni8 = String(n.dataInicio || '').replace(/\D/g, '').padStart(8, '0').slice(0, 8);

      const cep8 = String(n.cep || '').replace(/\D/g, '').padStart(8, '0').slice(0, 8);
      const enderecoTxt = dimobSanitizeAscii(n.endereco || '');
      const municipioTxt = dimobSanitizeAscii(n.municipio || '');
      const ufTxt = dimobSanitizeAscii(n.uf || '').slice(0, 2);

      if (!docKey || !nomeField || !contrato6 || !dtIni8 || !cep8 || !enderecoTxt || !municipioTxt || !ufTxt) {
        return res.status(400).json({ error: `Novo locatário incompleto (${docKey || '(sem doc)'}).` });
      }

      const codMun = dimobGetMunicipioCode(ufTxt, municipioTxt);
      if (!codMun) return res.status(400).json({ error: `Código de município não encontrado para ${ufTxt}/${municipioTxt}.` });

      let ln = r02Template;
      ln = dimobSetYearInLine(ln, year);

      // ✅ sequencial novo (evita clonar BAUER)
      maxSeq += 1;
      ln = dimobSetSlice(ln, P_SEQ.start, P_SEQ.end, String(maxSeq).padStart(P_SEQ.len, '0'), '0', 'right');

      // ✅ locador fixo (TOSCAN) no local certo do JSON atual
      ln = applyLocadorByLayout(ln);

      // ✅ sobrescreve locatário no local certo do JSON atual (isso remove BAUER do template)
      // ✅ escreve já “pronto”, com espaços à direita quando CPF
      ln = dimobSetSlice(ln, P_LOCAT_DOC.start, P_LOCAT_DOC.end, docField, ' ', 'left');
      ln = dimobSetSlice(ln, P_LOCAT_NOME.start, P_LOCAT_NOME.end, nomeField, ' ', 'left');

      // contrato/datas (usa o que existir no JSON)
      if (P_NUM_CONTR) ln = dimobSetSlice(ln, P_NUM_CONTR.start, P_NUM_CONTR.end, contrato6, '0', 'right');
      if (P_DT_CONTR) ln = dimobSetSlice(ln, P_DT_CONTR.start, P_DT_CONTR.end, dtIni8, '0', 'right');
      if (P_DTINI) ln = dimobSetSlice(ln, P_DTINI.start, P_DTINI.end, dtIni8, '0', 'right');
      if (P_DTFIM) ln = dimobSetSlice(ln, P_DTFIM.start, P_DTFIM.end, '00000000', '0', 'right');

      // imóvel (sem tailStart / sem checksum)
      if (P_TIPO_IMOVEL) {
        // se você não tem campo no UI, mantém o do template (não altera)
        // ln = dimobSetSlice(ln, P_TIPO_IMOVEL.start, P_TIPO_IMOVEL.end, 'U', ' ', 'left');
      }
      if (P_END_IMOVEL) ln = dimobSetSlice(ln, P_END_IMOVEL.start, P_END_IMOVEL.end, enderecoTxt.slice(0, P_END_IMOVEL.len), ' ', 'left');
      if (P_CEP_IMOVEL) ln = dimobSetSlice(ln, P_CEP_IMOVEL.start, P_CEP_IMOVEL.end, cep8, '0', 'right');
      if (P_COD_MUN) ln = dimobSetSlice(ln, P_COD_MUN.start, P_COD_MUN.end, String(codMun).padStart(P_COD_MUN.len, '0'), '0', 'right');
      if (P_UF_IMOVEL) ln = dimobSetSlice(ln, P_UF_IMOVEL.start, P_UF_IMOVEL.end, ufTxt.padEnd(P_UF_IMOVEL.len, ' '), ' ', 'left');

      // valores mensais (usa docKey normalizado)
      ln = dimobApplyF525ToR02(ln, spedMap.get(docKey) || {});
      r02Out.push(ln);
    }

    // ------------------ tail (T9/R10/R90) ------------------
    const tailLines = lines.filter(l => l.startsWith('T9') || l.startsWith('R10') || l.startsWith('R90'));
    const tailOut = [];

    for (const tl of tailLines) {
      let ln = tl;
      if (ln.startsWith('T9')) {
        ln = dimobSetSlice(ln, 17, 20, String(year).padStart(4, '0'), '0', 'right');
        ln = dimobSetSlice(ln, 21, 28, String(r02Out.length + 3).padStart(8, '0'), '0', 'right');
      }
      tailOut.push(ln);
    }

    const outLines = [newHeader, r01New, ...r02Out, ...tailOut];
    const outText = outLines.join(eol) + eol;

    const fileName = `${cnpj}-DIMOB-${year}-ORIGI.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=latin1');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(Buffer.from(outText, 'latin1'));

  } catch (e) {
    return send500(e);
  }
});

// ...
app.get('/tareffa-empresas-lote', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/tareffa-empresas-lote.html'));
});

function startPythonJob({ jobId, inputPath, outDir, headless }) {
  const pythonBin = process.env.PYTHON_BIN || 'python';

  const scriptPath = path.join(process.cwd(), 'api', 'tareffa_empresas_lote_job.py');

  const args = [
    scriptPath,
    '--input', inputPath,
    '--outdir', outDir,
  ];
  if (headless) args.push('--headless');

  const child = spawn(pythonBin, args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  const pushLog = (line) => {
    const s = String(line || '').trim();
    if (!s) return;
    logs.push(s);
    updateJob(jobId, { logs: logs.slice(-800), updatedAt: new Date().toISOString() });
  };

  updateJob(jobId, { status: JOB_STATUS.PROCESSING, logs, updatedAt: new Date().toISOString() });

  child.stdout.on('data', (buf) => {
    const text = buf.toString('utf-8');
    text.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;

      if (line.startsWith('__EVENT__')) {
        try {
          const ev = JSON.parse(line.replace(/^__EVENT__/, ''));
          if (ev.type === 'log') {
            pushLog(ev.message);
          } else if (ev.type === 'progress') {
            const pct = ev.total ? Math.round((ev.current / ev.total) * 100) : null;
            updateJob(jobId, { progress: pct ?? 0, current: ev.current, total: ev.total });
          } else if (ev.type === 'done') {
            pushLog('✅ Job finalizado.');
            updateJob(jobId, { status: JOB_STATUS.DONE, progress: 100, result: ev.result });
          } else if (ev.type === 'error') {
            pushLog(`❌ ERRO: ${ev.message}`);
            updateJob(jobId, { status: JOB_STATUS.ERROR, errorMessage: ev.message });
          } else {
            pushLog(JSON.stringify(ev));
          }
          return;
        } catch (e) {
          // cai no log padrão
        }
      }

      pushLog(line);
    });
  });

  child.stderr.on('data', (buf) => {
    const text = buf.toString('utf-8');
    text.split(/\r?\n/).forEach((line) => {
      if (line.trim()) pushLog('[stderr] ' + line.trim());
    });
  });

  child.on('close', (code) => {
    if (code === 0) return;
    updateJob(jobId, { status: JOB_STATUS.ERROR, errorMessage: `Python saiu com código ${code}` });
  });
}

app.post('/api/tareffa-empresas-lote/jobs', requireAuth, requireCsrf, async (req, res) => {
  try {
    const companies = Array.isArray(req.body?.companies) ? req.body.companies : [];
    const options = req.body?.options || {};
    if (!companies.length) return res.status(400).json({ error: 'Sem empresas no payload' });

    const jobKey = `tareffa_empresas_lote_${Date.now()}`;

    // cria no queue usando o seu método padrão
    const created = createJobsFromKeys([jobKey]);
    const job = (Array.isArray(created) && created[0]) || findJobByKey(jobKey);
    if (!job) return res.status(500).json({ error: 'Falha ao criar job na fila' });

    // grava input em disco (igual você já fez)
    const tmpBase = path.join(process.cwd(), 'tmp', 'tareffa-empresas-lote', String(job.id));
    fs.mkdirSync(tmpBase, { recursive: true });

    const inputPath = path.join(tmpBase, 'input.json');
    fs.writeFileSync(inputPath, JSON.stringify({ companies, options }, null, 2), 'utf-8');

    // marca como pendente/inicial
    updateJob(job.id, {
      status: JOB_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
      logs: [],
      updatedAt: new Date().toISOString(),
      // opcional: salvar o key pra facilitar debug
      key: jobKey,
      type: 'tareffa_empresas_lote',
    });

    // dispara o python
    setTimeout(() => {
      startPythonJob({
        jobId: job.id,
        jobKey,
        inputPath,
        outDir: tmpBase,
        headless: Boolean(options.headless),
      });
    }, 50);

    return res.json({ jobKey, jobId: job.id });
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao criar job' });
  }
});

app.get('/api/tareffa-empresas-lote/jobs/:jobKey', requireAuth, (req, res) => {
  const job = findJobByKey(req.params.jobKey);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  return res.json(job);
});

// Página interna (protegida)
app.get('/conciliador-cartao-wilson', requireAuthPage, (req, res) => {
  res.sendFile(path.join(publicDir, 'conciliador-cartao-wilson.html'));
});

const PY_API_URL = process.env.PY_API_URL || 'http://127.0.0.1:8001';

// API interna (protegida)
app.post(
  '/api/conciliador-cartao-wilson/process',
  requireAuth,
  upload.fields([
    { name: 'razaoPdf', maxCount: 1 },
    { name: 'financeiroPdf', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const razao = req.files?.razaoPdf?.[0];
      const fin = req.files?.financeiroPdf?.[0];

      if (!razao || !fin) {
        return res.status(400).send('Envie os 2 PDFs: razaoPdf e financeiroPdf.');
      }

      const form = new (require('form-data'))();
      form.append('razaoPdf', razao.buffer, { filename: razao.originalname || 'razao.pdf', contentType: razao.mimetype });
      form.append('financeiroPdf', fin.buffer, { filename: fin.originalname || 'financeiro.pdf', contentType: fin.mimetype });

      form.append('valorTol', String(req.body.valorTol ?? '0.05'));
      form.append('diasJanela', String(req.body.diasJanela ?? '31'));
      form.append('limiarNome', String(req.body.limiarNome ?? '0.72'));

      const pyResp = await axios.post(`${PY_API_URL}/api/conciliador/cartao-wilson`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000 // 120s
      });

      // Aqui você pode também registrar auditoria se já tiver auditLog no projeto
      // auditLog(req, 'conciliador_cartao_wilson_process', 'ok', { ... });

      return res.json(pyResp.data);
    } catch (err) {
      const status = err.response?.status || 500;
      const detail = err.response?.data?.detail || err.response?.data || err.message || 'Erro';
      return res.status(status).send(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  }
);

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
      return res.status(403).send('Sem permissão');
    }
    if (!hasToolPermission(req.user, slug)) return res.status(403).send('Sem permissão');

    await auditLog(req, `page_view_${slug}`, 'ok', { path: req.path, method: req.method });
    return res.sendFile(filePath);
  } catch (e) {
    console.error('dynamic tool route error:', e.message || e);
    return next();
  }
});

module.exports = {
  server,
  io,
  broadcastJobUpdate,
};

