const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { resolveConfiguredPath } = require('../core/path-resolver');

function createDimobService(options = {}) {
  const axios = options.axios || require('axios');

  const dataDir = options.dataDir || path.join(process.cwd(), 'data');
  const dimobLayoutPath =
    resolveConfiguredPath(options.dimobLayoutPath || process.env.DIMOB_LAYOUT_PATH) ||
    path.join(process.cwd(), 'public', 'js', 'layout dimob.json');
  const dimobMunicipiosPath =
    resolveConfiguredPath(options.dimobMunicipiosPath || process.env.DIMOB_MUNICIPIOS_PATH) ||
    path.join(process.cwd(), 'public', 'js', 'municipios DIMOB.json');
  const dimobNetworkBaseDir =
    resolveConfiguredPath(options.dimobNetworkBaseDir || process.env.DIMOB_NETWORK_BASE_DIR) ||
    'W:\\DECLARAÇÕES\\DIMOB';
  const dimobTmpDir =
    resolveConfiguredPath(options.dimobTmpDir || process.env.DIMOB_TMP_DIR) ||
    path.join(os.tmpdir(), 'central-utils-dimob', '_tmp');

  // =====================
  // Utilidades gerais
  // =====================
  function resolveWPath(p) {
    const s = String(p || '');
    if (s.startsWith('\\\\')) return s;
    const root = process.env.W_UNC_ROOT;
    if (/^[Ww]:\\/.test(s) && root) {
      const cleanRoot = String(root).replace(/[\\\/]+$/, '');
      return cleanRoot + '\\' + s.slice(3);
    }
    return s;
  }

  // =====================
  // Cache de arquivos anteriores
  // =====================
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

  // =====================
  // Parsers
  // =====================
  function dimobOnlyDigits(v = '') {
    return String(v || '').replace(/\D/g, '');
  }

  function dimobParseBrNumber(v) {
    if (v === null || v === undefined) return 0;
    let s = String(v).trim();
    if (!s) return 0;
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

    const aggF525 = new Map();
    let f525Parsed = 0;
    let f525Skipped = 0;
    const sampleF525 = [];

    const opsF200 = [];
    let f200Parsed = 0;
    let f200Skipped = 0;
    const sampleF200 = [];

    for (const lineRaw of lines) {
      const line = (lineRaw || '').trim();
      if (!line || line[0] !== '|') continue;

      if (line.startsWith('|0000|')) {
        const parts = line.split('|');
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
        const tipoPagto = String(parts[2] || '').trim();
        const nomeSped = String(parts[4] || '').trim();
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
            valorPagoNoAno: pagoAuto ? valorOper : null,
            precisaPreencherPago: !pagoAuto,
            dataContrato: dtVenda,
            observacoes: obs,
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
      aggF525,
      f525Parsed,
      f525Skipped,
      sampleF525,
      opsF200,
      f200Parsed,
      f200Skipped,
      sampleF200,
    };
  }

  function dimobParsePreviousDimobLocatarios(decText, declaranteCnpj14 = '') {
    const set = new Set();
    const cnpjDeclarante = String(declaranteCnpj14 || '').replace(/\D+/g, '').padStart(14, '0');
    const re = /(^|\D)(\d{11}|\d{14})(?=\D|$)/g;

    const text = String(decText || '');
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = m[2];
      const only = raw.replace(/\D+/g, '');
      if (!(only.length === 11 || only.length === 14)) continue;
      const doc14 = only.padStart(14, '0');
      if (cnpjDeclarante && doc14 === cnpjDeclarante) continue;
      set.add(doc14);
    }
    return set;
  }

  // =====================
  // Layout / municipios
  // =====================
  let __dimobLayoutCache = null;
  let __dimobMunicipiosCache = null;
  let __dimobMunicipioMap = null;

  function dimobLoadLayout() {
    if (__dimobLayoutCache) return __dimobLayoutCache;
    const raw = fs.readFileSync(dimobLayoutPath, 'utf-8');
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
    let out = dimobNormalizeText(s);
    out = out.replace(/[^A-Z0-9 \-\/\.\,\(\)&]/g, ' ');
    out = out.replace(/\s+/g, ' ').trim();
    return out;
  }

  function dimobLoadMunicipios() {
    if (__dimobMunicipioMap) return __dimobMunicipioMap;
    const raw = fs.readFileSync(dimobMunicipiosPath, 'utf-8');
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

  // =====================
  // Sanitização e helpers
  // =====================
  function dimobSanitizeText(s) {
    s = String(s ?? '');
    s = s.replace(/[\u0000-\u001F\u007F]/g, ' ');
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[^A-Za-z0-9 \/\.\,\-\(\)]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s.toUpperCase();
  }

  function dimobSanitizeField(s, maxLen) {
    const out = dimobSanitizeText(s);
    if (!maxLen) return out;
    return out.slice(0, maxLen);
  }

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

  function dimobSetYearInLine(line, year) {
    const y = String(year).padStart(4, '0');
    return dimobSetSlice(line, 18, 21, y, '0', 'right');
  }

  function dimobSetYearInHeader(headerLine, year) {
    const y = String(year).padStart(4, '0');
    return headerLine.slice(0, 12) + y + headerLine.slice(16);
  }

  function dimobApplyF525ToR02(line, monthsObj) {
    const layout = dimobLoadLayout();
    const fields = layout?.records?.R02?.fields || [];
    const pos = (key) => fields.find((f) => f.key === key);

    let total = 0;
    for (let mm = 1; mm <= 12; mm++) {
      const keyField = `valor_do_aluguel_${String(mm).padStart(2, '0')}`;
      const f = pos(keyField);
      if (!f) continue;
      const v = Number(monthsObj?.[String(mm)] || 0);
      total += v;
      const formatted = dimobFormatMoneyFixed(v, f.len);
      line = dimobSetSlice(line, f.start, f.end, formatted, '0', 'right');
    }

    const ft = pos('valor_total_do_aluguel');
    if (ft) {
      const formattedTotal = dimobFormatMoneyFixed(total, ft.len);
      line = dimobSetSlice(line, ft.start, ft.end, formattedTotal, '0', 'right');
    }

    for (let mm = 1; mm <= 12; mm++) {
      const keyField = `valor_da_comissao_${String(mm).padStart(2, '0')}`;
      const f = pos(keyField);
      if (!f) continue;
      line = dimobSetSlice(line, f.start, f.end, ''.padStart(f.len, '0'), '0', 'right');
    }
    const fc = pos('valor_total_da_comissao');
    if (fc) line = dimobSetSlice(line, fc.start, fc.end, ''.padStart(fc.len, '0'), '0', 'right');

    return line;
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

    let endereco = [
      logradouro,
      numero ? `N ${numero}` : '',
      complemento ? ` ${complemento}` : '',
      bairro ? ` - ${bairro}` : '',
    ].filter(Boolean).join(' ').trim();

    const nome60 = nome.slice(0, 60);
    const end120 = endereco.slice(0, 120);
    const mun20 = municipio.slice(0, 20);
    const uf2 = uf.slice(0, 2);
    const cod = dimobGetMunicipioCode(uf2, mun20);

    if (nome60) line = dimobSetSlice(line, 44, 103, nome60, ' ', 'left');
    if (end120) line = dimobSetSlice(line, 115, 234, end120, ' ', 'left');
    if (uf2) line = dimobSetSlice(line, 235, 236, uf2, ' ', 'left');
    if (cod) line = dimobSetSlice(line, 237, 240, String(cod).padStart(4, '0'), '0', 'right');
    if (mun20) line = dimobSetSlice(line, 241, 260, mun20, ' ', 'left');

    return line;
  }

  // Extrai doc do locatário do R02 via heurística segura:
  // pega o ÚLTIMO bloco de 14 dígitos antes do padrão contrato+datas.
  function dimobExtractLocatarioFromR02(line) {
    const raw = String(line || '');
    const m = /(\d{6})(\d{8})(\d{8})/.exec(raw);
    const idxContrato = m ? m.index : -1;
    const head = idxContrato >= 0 ? raw.slice(0, idxContrato) : raw;

    const all14 = [...head.matchAll(/\d{14}/g)];
    if (!all14.length) {
      return { doc14: null, nameStart: null, nameEnd: null, contratoIndex: idxContrato };
    }

    const last = all14[all14.length - 1];
    const doc14 = last[0];
    const nameStart = (last.index ?? 0) + 14;
    const nameEnd = idxContrato >= 0 ? idxContrato : null;

    return { doc14, nameStart, nameEnd, contratoIndex: idxContrato };
  }

  return {
    dataDir,
    dimobLayoutPath,
    dimobMunicipiosPath,
    dimobNetworkBaseDir,
    dimobTmpDir,

    resolveWPath,
    dimobStoreNetworkFile,
    dimobGetNetworkFile,

    dimobOnlyDigits,
    dimobParseBrNumber,
    dimobParseDDMMYYYY,
    dimobParseSpedFileOnce,
    dimobParsePreviousDimobLocatarios,

    dimobNormalizeText,
    dimobSanitizeAscii,
    dimobSanitizeText,
    dimobSanitizeField,
    dimobSetSlice,
    dimobSetYearInLine,
    dimobSetYearInHeader,
    dimobFormatMoneyFixed,
    dimobGetMunicipioCode,
    dimobLoadLayout,
    dimobLoadMunicipios,
    dimobUpdateR01UsingCnpj,
    dimobApplyF525ToR02,
    dimobExtractLocatarioFromR02,
  };
}

module.exports = { createDimobService };
