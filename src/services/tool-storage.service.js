const fs = require('fs');
const path = require('path');
const multer = require('multer');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function createToolStorage({ dataDir, dimobService }) {
  const uploadMemory = multer({ storage: multer.memoryStorage() });

  // PDF/A
  const PDFA_DIR = path.join(dataDir, 'pdfa');
  const PDFA_TMP_DIR = path.join(PDFA_DIR, '_tmp');
  const PDFA_OUT_DIR = path.join(PDFA_DIR, 'outputs');
  ensureDir(PDFA_DIR);
  ensureDir(PDFA_TMP_DIR);
  ensureDir(PDFA_OUT_DIR);
  const uploadPdfa = multer({
    dest: PDFA_TMP_DIR,
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  // Balancete
  const BALANCETE_DIR = path.join(dataDir, 'balancete-transitorio');
  const BALANCETE_TMP_DIR = path.join(BALANCETE_DIR, '_tmp');
  ensureDir(BALANCETE_DIR);
  ensureDir(BALANCETE_TMP_DIR);

  // Bernadina
  const BERNADINA_DIR = path.join(dataDir, 'formatador-bernardina');
  const BERNADINA_TMP_DIR = path.join(BERNADINA_DIR, '_tmp');
  ensureDir(BERNADINA_DIR);
  ensureDir(BERNADINA_TMP_DIR);
  const uploadBernadina = multer({
    dest: BERNADINA_TMP_DIR,
    limits: { fileSize: 50 * 1024 * 1024, files: 120 },
  });

  // Separador férias / ferias funcionario
  const FERIAS_FUNC_DIR = path.join(dataDir, 'ferias-funcionario');
  ensureDir(FERIAS_FUNC_DIR);

  const separadorFeriasUploadsDir = path.join(dataDir, 'uploads', 'separador-ferias');
  ensureDir(separadorFeriasUploadsDir);
  const uploadSeparadorFerias = multer({ dest: separadorFeriasUploadsDir });

  // Extrator ZIP/RAR
  const extratorZipRarUploadsDir = path.join(dataDir, 'uploads', 'extrator-zip-rar');
  ensureDir(extratorZipRarUploadsDir);
  const uploadExtratorZipRar = multer({ dest: extratorZipRarUploadsDir });

  // Madre SCP
  const madreScpUploadsDir = path.join(dataDir, 'uploads', 'madre-scp');
  ensureDir(madreScpUploadsDir);
  const uploadMadreScp = multer({ dest: madreScpUploadsDir });

  // Ajuste Diario GFBR
  const ajusteDiarioGfbrUploadsDir = path.join(dataDir, 'uploads', 'ajuste-diario-gfbr');
  ensureDir(ajusteDiarioGfbrUploadsDir);
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
  const uploadAjusteDiarioGfbr = multer({ storage: storageAjusteDiarioGfbr });

  // Separador CSV baixa automatica
  const SEPARADOR_CSV_BASE_DIR = path.join(dataDir, 'separador-csv-baixa-automatica');
  const SEPARADOR_CSV_UPLOAD_DIR = path.join(SEPARADOR_CSV_BASE_DIR, 'uploads');
  const SEPARADOR_CSV_OUTPUT_DIR = path.join(SEPARADOR_CSV_BASE_DIR, 'outputs');
  ensureDir(SEPARADOR_CSV_UPLOAD_DIR);
  ensureDir(SEPARADOR_CSV_OUTPUT_DIR);
  const uploadSeparadorCsv = multer({ dest: SEPARADOR_CSV_UPLOAD_DIR });

  // Excel abas PDF
  const EXCEL_ABAS_PDF_DIR = path.join(dataDir, 'excel-abas-pdf');
  ensureDir(EXCEL_ABAS_PDF_DIR);

  // DIMOB
  const DIMOB_DIR = path.join(dataDir, 'dimob');
  const DIMOB_UPLOAD_DIR = path.join(DIMOB_DIR, '_tmp');
  const DIMOB_OUTPUT_DIR = path.join(DIMOB_DIR, 'outputs');
  ensureDir(DIMOB_DIR);
  ensureDir(DIMOB_UPLOAD_DIR);
  ensureDir(DIMOB_OUTPUT_DIR);

  const DIMOB_TMP_DIR = dimobService?.dimobTmpDir || path.join(DIMOB_DIR, '_tmp');
  ensureDir(DIMOB_TMP_DIR);
  const uploadDimob = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, DIMOB_TMP_DIR),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '');
        const safe = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
        cb(null, safe);
      },
    }),
    limits: { files: 50, fileSize: 50 * 1024 * 1024 },
  });

  return {
    uploadMemory,
    PDFA_DIR,
    PDFA_TMP_DIR,
    PDFA_OUT_DIR,
    uploadPdfa,
    BALANCETE_DIR,
    BERNADINA_DIR,
    BERNADINA_TMP_DIR,
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
    DIMOB_DIR,
    DIMOB_UPLOAD_DIR,
    DIMOB_OUTPUT_DIR,
    uploadDimob,
  };
}

module.exports = { createToolStorage };
