function createEcdStatusService(options) {
  const {
    fs,
    path,
    resolveWPath,
    dataDir,
    ECD_SRC_ALL_CSV: srcAll,
    ECD_SRC_SN_CSV: srcSn,
    ECD_ALL_CSV: allCsv,
    ECD_SN_CSV: snCsv,
    ECD_STATUS_FILE: statusFile,
    ECD_BASE_DIR: baseDir,
  } = options;

  const ECD_DIR = dataDir ? path.join(dataDir, 'ecd-status') : null;
  const ECD_STATUS_FILE = statusFile || (ECD_DIR ? path.join(ECD_DIR, 'ecd_status.json') : null);
  const ECD_CSV_DIR = ECD_DIR ? path.join(ECD_DIR, 'csv') : null;

  const ECD_SRC_ALL_CSV = srcAll || 'W:\\DOCUMENTOS ESCRITORIO\\INSTALACAO SISTEMA\\Lista Todas Empresas\\formatados\\Todas Empresas - formatado.csv';
  const ECD_SRC_SN_CSV = srcSn || 'W:\\DOCUMENTOS ESCRITORIO\\INSTALACAO SISTEMA\\Lista Todas Empresas\\formatados\\todas empresas simples nacional - formatado.csv';
  const ECD_ALL_CSV = allCsv || (ECD_CSV_DIR ? path.join(ECD_CSV_DIR, 'Todas Empresas - formatado.csv') : null);
  const ECD_SN_CSV = snCsv || (ECD_CSV_DIR ? path.join(ECD_CSV_DIR, 'todas empresas simples nacional - formatado.csv') : null);
  const ECD_BASE_DIR = baseDir || 'W:\\SPEDs\\ECD\\2025';

  if (ECD_DIR) {
    try { fs.mkdirSync(ECD_DIR, { recursive: true }); } catch {}
  }
  if (ECD_CSV_DIR) {
    try { fs.mkdirSync(ECD_CSV_DIR, { recursive: true }); } catch {}
  }

  function ensureEcdCsvCopies() {
    try {
      if (ECD_SRC_ALL_CSV && ECD_ALL_CSV && fs.existsSync(ECD_SRC_ALL_CSV)) {
        fs.copyFileSync(ECD_SRC_ALL_CSV, ECD_ALL_CSV);
      }
      if (ECD_SRC_SN_CSV && ECD_SN_CSV && fs.existsSync(ECD_SRC_SN_CSV)) {
        fs.copyFileSync(ECD_SRC_SN_CSV, ECD_SN_CSV);
      }
    } catch (e) {
      console.error('[ECD] Falha ao copiar CSVs:', e.message || e);
    }
  }

  function parseEcdCsv(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return [];
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
    if (!ECD_STATUS_FILE || !fs.existsSync(ECD_STATUS_FILE)) return { companies: {} };
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
    if (!ECD_STATUS_FILE) return;
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

  return {
    ensureEcdCsvCopies,
    parseEcdCsv,
    loadEcdStatus,
    saveEcdStatus,
    loadEcdCompanies,
    ecdHasErrorPng,
  };
}

module.exports = { createEcdStatusService };
