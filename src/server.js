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
let pool;
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
const PY_BASE_URL = process.env.PY_BASE_URL || 'http://127.0.0.1:8001';
const PY_API_URL = process.env.PY_API_URL || 'http://127.0.0.1:8001';
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
      return res.status(403).send('Sem permissão');
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

// ECD Status

// PDF/A Converter


app.get('/formatador-bernadina', requireAuthPage, (req, res) => {
  res.redirect('/formatador-bernardina');
});


// ---------- ROTAS API: PDF/A ----------
const uploadPdfa = multer({
  dest: PDFA_TMP_DIR,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});


// --- Nova página: calculadora-icms-st ---


// --- Nova página: Envio MIT Apuração DCTFWeb ---

// --- Nova página: separador-pdf-relatorio-de-ferias ---

// Página: Separador Holerites por Empresa




// Busca CEP na BrasilAPI
app.get('/api/cep/:cep', requireAuth, requireAnyToolAccess, async (req, res) => {
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
app.get('/api/cnpj/:cnpj', requireAuth, requireAnyToolAccess, async (req, res) => {
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

// Páginas Admin (protegidas)
// admin (exigem ADMIN)
app.get('/admin-usuarios', requireAuthPage, requireAdminPage, logPageView('page_view_admin_users'), (req, res) => {
  res.sendFile(path.join(publicDir, 'admin-usuarios.html'));
});

app.get('/logs', requireAuthPage, requireAdminPage, logPageView('page_view_audit_logs'), (req, res) => {
  res.sendFile(path.join(publicDir, 'logs.html'));
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
    startPythonJob,
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
      return res.status(403).send('Sem permissão');
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
  broadcastJobUpdate,
};
