const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_JSON_DIR = path.join(PROJECT_ROOT, 'data', 'cct', 'json');
const DEFAULT_DOC_DIR = path.join(PROJECT_ROOT, 'data', 'cct', 'docs');

const MONTH_ALIASES = new Map([
  ['janeiro', 1],
  ['fevereiro', 2],
  ['marco', 3],
  ['março', 3],
  ['abril', 4],
  ['maio', 5],
  ['junho', 6],
  ['julho', 7],
  ['agosto', 8],
  ['setembro', 9],
  ['outubro', 10],
  ['novembro', 11],
  ['dezembro', 12],
]);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function safeString(value) {
  return String(value || '').trim();
}

function truncateText(value, maxLength = 240) {
  const text = safeString(value);
  const limit = Math.max(40, Number(maxLength || 240));
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function parseDateFromPortugueseText(text) {
  const raw = normalizeText(text).replace(/(\d{1,2})\s*[ºo]/g, '$1');
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const match = raw.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTH_ALIASES.get(match[2]) || 0;
  const year = Number(match[3]);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseVigenciaRange(vigencia) {
  const raw = safeString(vigencia);
  if (!raw) return null;
  const normalized = normalizeText(raw).replace(/(\d{1,2})\s*[ºo]/g, '$1');
  const dateMatches = [];
  const pattern = /(\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4})|(\d{1,2}\s+de\s+[a-z]+\s+de\s+\d{4})/gi;
  let match = pattern.exec(normalized);
  while (match) {
    dateMatches.push(match[0].replace(/\s*\/\s*/g, '/').trim());
    match = pattern.exec(normalized);
  }

  if (dateMatches.length < 2) return null;
  const start = parseDateFromPortugueseText(dateMatches[0]);
  const end = parseDateFromPortugueseText(dateMatches[1]);
  if (!start || !end) return null;

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getVigenciaStatus(vigencia) {
  const range = parseVigenciaRange(vigencia);
  if (!range) return 'desconhecida';

  const now = new Date();
  if (now >= range.start && now <= range.end) return 'vigente';
  return 'nao-vigente';
}

function monthFromText(text) {
  const normalized = normalizeText(text);
  for (const [name, month] of MONTH_ALIASES.entries()) {
    if (normalized.includes(name)) return month;
  }
  return 0;
}

function cleanPrefix(prefixo) {
  const raw = safeString(prefixo);
  if (!raw) return 'Convencao';
  return raw.replace(/^Mediador\s*-\s*Extrato\s*/i, '').replace(/^Mediador\s*-\s*/i, '').trim() || raw;
}

function buildCardTitle(raw) {
  const prefix = cleanPrefix(raw?.prefixo);
  const numeroRegistro = safeString(raw?.numero_registro || raw?.numeroRegistro);
  if (!numeroRegistro) return prefix;
  return `${prefix} (${numeroRegistro})`;
}

function listifySindicatos(raw) {
  const sindicatos = Array.isArray(raw?.sindicatos_celebrantes)
    ? raw.sindicatos_celebrantes
    : Array.isArray(raw?.sindicatosCelebrantes)
      ? raw.sindicatosCelebrantes
      : [];
  return sindicatos
    .map((item) => ({
      nome: safeString(item?.nome),
      cnpj: safeString(item?.cnpj),
    }))
    .filter((item) => item.nome || item.cnpj);
}

function formatPrazoOposicao(raw) {
  const prazo = raw?.prazo_oposicao || raw?.prazoOposicao || {};
  const data = safeString(prazo?.data);
  const clausula = safeString(prazo?.clausula);
  if (data && clausula) return `${data} (${clausula})`;
  return data || clausula || '';
}

function parseDbRowRaw(rawValue) {
  if (!rawValue) return {};
  if (typeof rawValue === 'object') return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch (_) {
    return {};
  }
}

function buildDbPayloadFromRecord(raw, fileName, sourceMtimeMs = 0, sortDate = new Date()) {
  const normalizedRaw = raw && typeof raw === 'object' ? raw : {};
  const fileBase = path.basename(fileName || normalizedRaw.arquivo_origem || 'convention.json', path.extname(fileName || 'convention.json'));
  const sindicatos = listifySindicatos(normalizedRaw);
  const dataBase = safeString(normalizedRaw.data_base || normalizedRaw.dataBase);
  const dataBaseMesMatch = normalizeText(dataBase).match(/\b(\d{1,2})\b/);
  const dataBaseMesNumero = dataBaseMesMatch ? Number(dataBaseMesMatch[1]) : null;
  const dataBaseMesValor = dataBase ? normalizeText(dataBase) : '';
  const dataRegistro = safeString(normalizedRaw.data_registro_mte || normalizedRaw.dataRegistroMte);
  const vigencia = safeString(normalizedRaw.vigencia);
  const abrangencia = safeString(normalizedRaw.abrangencia);
  const abrangenciaTerritorial = safeString(normalizedRaw.abrangencia_territorial || normalizedRaw.abrangenciaTerritorial);
  const prazo = normalizedRaw.prazo_oposicao || normalizedRaw.prazoOposicao || {};
  const numeroRegistro = safeString(normalizedRaw.numero_registro || normalizedRaw.numeroRegistro);
  const numeroSolicitacao = safeString(normalizedRaw.numero_solicitacao || normalizedRaw.numeroSolicitacao);
  const prefixo = safeString(normalizedRaw.prefixo);
  const nome = buildCardTitle(normalizedRaw);
  const searchDigits = normalizeDigits([
    numeroRegistro,
    numeroSolicitacao,
    dataRegistro,
    dataBase,
    vigencia,
    abrangencia,
    abrangenciaTerritorial,
  ].join(' '));
  const searchCnpjDigits = sindicatos
    .map((s) => normalizeDigits(s.cnpj))
    .filter((digits) => digits.length === 14);
  const searchText = normalizeText([
    nome,
    prefixo,
    numeroRegistro,
    numeroSolicitacao,
    dataRegistro,
    dataBase,
    vigencia,
    abrangencia,
    abrangenciaTerritorial,
    sindicatos.map((s) => `${s.nome} ${s.cnpj}`).join(' '),
  ].join(' '));

  return {
    id: fileBase,
    fileName: fileName || `${fileBase}.json`,
    arquivoOrigem: safeString(normalizedRaw.arquivo_origem || normalizedRaw.arquivoOrigem || `${fileBase}.doc`),
    nome,
    prefixo,
    numeroRegistro,
    numeroSolicitacao,
    dataRegistroMte: dataRegistro,
    dataBase,
    dataBaseMes: dataBaseMesValor,
    dataBaseMesNumero,
    dataBaseMesValor,
    vigencia,
    vigenciaStatus: getVigenciaStatus(vigencia),
    abrangencia,
    abrangenciaNormalized: normalizeText(abrangencia),
    abrangenciaTerritorial,
    abrangenciaTerritorialNormalized: normalizeText(abrangenciaTerritorial),
    prazoOposicaoData: safeString(prazo.data),
    prazoOposicaoClausula: safeString(prazo.clausula),
    quantidadeClausulas: Array.isArray(normalizedRaw.clausulas) ? normalizedRaw.clausulas.length : 0,
    quantidadeSindicatos: sindicatos.length,
    sindicatosCelebrantes: sindicatos,
    searchText,
    searchDigits,
    searchCnpjDigits,
    sortTimestamp: Math.trunc(Number(sourceMtimeMs || (sortDate instanceof Date ? sortDate.getTime() : new Date(sortDate || Date.now()).getTime()) || 0)),
    raw: normalizedRaw,
    sourceMtimeMs: Math.trunc(Number(sourceMtimeMs || 0)),
  };
}

function buildSearchBlob(item) {
  return normalizeText([
    item.prefixo,
    item.title,
    item.numeroRegistro,
    item.numeroSolicitacao,
    item.dataBase,
    item.vigencia,
    item.abrangencia,
    item.abrangenciaTerritorial,
    ...(item.sindicatosCelebrantes || []).map((s) => `${s.nome} ${s.cnpj}`),
  ].join(' '));
}

function parseJsonFile(fullPath) {
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return raw;
}

function buildJsonManifest(jsonDir) {
  let files = [];
  try {
    files = fs.readdirSync(jsonDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.json$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    files = [];
  }

  const tokens = [];
  const fileTokens = {};
  for (const fileName of files) {
    try {
      const stat = fs.statSync(path.join(jsonDir, fileName));
      const token = `${fileName}:${Math.trunc(Number(stat.mtimeMs || 0))}:${Math.trunc(Number(stat.size || 0))}`;
      tokens.push(token);
      fileTokens[fileName] = token;
    } catch (_) {
      const token = `${fileName}:0:0`;
      tokens.push(token);
      fileTokens[fileName] = token;
    }
  }

  return {
    files,
    signature: tokens.join('|'),
    fileTokens,
  };
}

function stripRawFromRecord(record) {
  const { _raw, ...rest } = record || {};
  return rest;
}

function buildConventionRecord(fileName, raw, docDir) {
  const baseName = path.basename(fileName, path.extname(fileName));
  const docBaseName = safeString(raw?.arquivo_origem)
    ? path.basename(raw.arquivo_origem)
    : `${baseName}.doc`;
  const docPath = path.join(docDir, docBaseName);
  const downloadDisponivel = fs.existsSync(docPath);
  const title = buildCardTitle(raw);
  const numeroRegistro = safeString(raw?.numero_registro || raw?.numeroRegistro);
  const numeroSolicitacao = safeString(raw?.numero_solicitacao || raw?.numeroSolicitacao);
  const dataBase = safeString(raw?.data_base || raw?.dataBase);
  const vigencia = safeString(raw?.vigencia);
  const abrangencia = safeString(raw?.abrangencia);
  const abrangenciaTerritorial = safeString(raw?.abrangencia_territorial || raw?.abrangenciaTerritorial);
  const sindicatosCelebrantes = listifySindicatos(raw);
  const clausulas = Array.isArray(raw?.clausulas) ? raw.clausulas : [];
  const prazoOposicao = formatPrazoOposicao(raw);

  return {
    id: baseName,
    title,
    prefixo: safeString(raw?.prefixo),
    numeroRegistro,
    numeroSolicitacao,
    dataRegistroMte: safeString(raw?.data_registro_mte || raw?.dataRegistroMte),
    dataBase,
    vigencia,
    abrangencia,
    abrangenciaTerritorial,
    prazoOposicao,
    sindicatosCelebrantes,
    quantidadeClausulas: clausulas.length,
    vigenciaStatus: getVigenciaStatus(vigencia),
    downloadDisponivel,
    downloadFileName: docBaseName,
    arquivoOrigem: safeString(raw?.arquivo_origem || raw?.arquivoOrigem),
    _sourceFileName: fileName,
    _searchBlob: buildSearchBlob({
      prefixo: raw?.prefixo,
      title,
      numeroRegistro,
      numeroSolicitacao,
      dataBase,
      vigencia,
      abrangencia,
      abrangenciaTerritorial,
      sindicatosCelebrantes,
    }),
    _raw: raw,
  };
}

function buildDetailRecord(baseRecord) {
  const raw = baseRecord._raw || {};
  const clausulas = Array.isArray(raw.clausulas) ? raw.clausulas : [];
  return {
    id: baseRecord.id,
    title: baseRecord.title,
    prefixo: baseRecord.prefixo,
    numeroRegistro: baseRecord.numeroRegistro,
    numeroSolicitacao: baseRecord.numeroSolicitacao,
    dataRegistroMte: baseRecord.dataRegistroMte,
    dataBase: baseRecord.dataBase,
    vigencia: baseRecord.vigencia,
    abrangencia: baseRecord.abrangencia,
    abrangenciaTerritorial: baseRecord.abrangenciaTerritorial,
    prazoOposicao: baseRecord.prazoOposicao,
    sindicatosCelebrantes: baseRecord.sindicatosCelebrantes,
    quantidadeClausulas: clausulas.length,
    vigenciaStatus: baseRecord.vigenciaStatus,
    downloadDisponivel: baseRecord.downloadDisponivel,
    downloadFileName: baseRecord.downloadFileName,
    arquivoOrigem: baseRecord.arquivoOrigem,
    sumarioClausulas: clausulas.map((clause, index) => ({
      numero: safeString(clause?.numero || clause?.numero_clausula || clause?.ordem || `${index + 1}`),
      titulo: safeString(clause?.titulo || clause?.cabecalho || `Clausula ${index + 1}`),
      resumo: safeString(clause?.resumo_curto || clause?.resumo || clause?.texto || ''),
    })),
    clausulas: clausulas.map((clause, index) => ({
      numero: safeString(clause?.numero || clause?.numero_clausula || clause?.ordem || `${index + 1}`),
      titulo: safeString(clause?.titulo || clause?.cabecalho || `Clausula ${index + 1}`),
      texto: safeString(clause?.texto || clause?.resumo_detalhado || clause?.resumo_curto || ''),
      resumo: safeString(clause?.resumo_curto || clause?.resumo || clause?.texto || ''),
      tipo: safeString(clause?.tipo),
      id: `cct-clause-${baseRecord.id}-${index + 1}`,
    })),
  };
}

function createCctService(deps = {}) {
  const jsonDir = path.resolve(deps.jsonDir || DEFAULT_JSON_DIR);
  const docDir = path.resolve(deps.docDir || DEFAULT_DOC_DIR);
  const cacheTtlMs = Math.max(60000, Number(deps.cacheTtlMs || process.env.CCT_CACHE_TTL_MS || 43200000));
  const manifestCheckMs = Math.max(1000, Number(deps.manifestCheckMs || process.env.CCT_MANIFEST_CHECK_MS || 5000));

  let cache = {
    loadedAt: 0,
    records: [],
    warnings: [],
    source: 'files',
    manifestSignature: '',
  };
  let cacheLoadingPromise = null;
  let lastManifestCheckAt = 0;

  function buildRecordsFromFiles(manifest, previousRecords = []) {
    const warnings = [];
    const activeManifest = manifest || buildJsonManifest(jsonDir);
    const previousByFile = new Map(
      (Array.isArray(previousRecords) ? previousRecords : [])
        .filter((item) => safeString(item?._sourceFileName))
        .map((item) => [safeString(item._sourceFileName), item]),
    );

    const records = [];
    for (const fileName of activeManifest.files) {
      const fileToken = safeString(activeManifest.fileTokens?.[fileName]);
      const previous = previousByFile.get(fileName);
      if (previous && fileToken && safeString(previous._fileToken) === fileToken) {
        records.push(previous);
        continue;
      }

      const fullPath = path.join(jsonDir, fileName);
      try {
        const raw = parseJsonFile(fullPath);
        const nextRecord = stripRawFromRecord(buildConventionRecord(fileName, raw, docDir));
        nextRecord._fileToken = fileToken;
        records.push(nextRecord);
      } catch (error) {
        warnings.push(`Falha ao ler ${fileName}: ${error?.message || error}`);
      }
    }

    records.sort((a, b) => {
      const aDate = parseDateFromPortugueseText(a.dataRegistroMte) || new Date(0);
      const bDate = parseDateFromPortugueseText(b.dataRegistroMte) || new Date(0);
      return bDate.getTime() - aDate.getTime();
    });

    return { records, warnings, source: 'files', manifestSignature: activeManifest.signature };
  }

  function readDirectoryRecordsFast(previousRecords = []) {
    const manifest = buildJsonManifest(jsonDir);
    return buildRecordsFromFiles(manifest, previousRecords);
  }

  function refreshCacheIfJsonChanged() {
    const now = Date.now();
    if ((now - lastManifestCheckAt) < manifestCheckMs) {
      return;
    }
    lastManifestCheckAt = now;

    let manifest = null;
    try {
      manifest = buildJsonManifest(jsonDir);
    } catch (error) {
      console.warn('[CCT] Falha ao verificar manifest de JSON:', error?.message || error);
      return;
    }

    if (!manifest || manifest.signature === cache.manifestSignature) {
      return;
    }

    const rebuilt = buildRecordsFromFiles(manifest, cache.records);
    cache = {
      loadedAt: Date.now(),
      records: rebuilt.records,
      warnings: Array.isArray(rebuilt.warnings) ? rebuilt.warnings : [],
      source: rebuilt.source || 'files',
      manifestSignature: safeString(rebuilt.manifestSignature || manifest.signature),
    };
  }

  async function ensureCache() {
    const now = Date.now();
    if (cache.records.length && (now - cache.loadedAt) < cacheTtlMs) {
      refreshCacheIfJsonChanged();
      return cache;
    }

    if (cacheLoadingPromise) {
      return cacheLoadingPromise;
    }

    cacheLoadingPromise = Promise.resolve().then(() => {
      const loaded = readDirectoryRecordsFast(cache.records);
      cache = {
        loadedAt: Date.now(),
        records: loaded.records,
        warnings: Array.isArray(loaded.warnings) ? loaded.warnings : [],
        source: loaded.source || 'files',
        manifestSignature: safeString(loaded.manifestSignature),
      };
      refreshCacheIfJsonChanged();
      return cache;
    }).finally(() => {
      cacheLoadingPromise = null;
    });

    return cacheLoadingPromise;
  }

  function applyFilters(records, query = {}) {
    const nome = normalizeText(query.nome || query.q || '');
    const vigencia = normalizeText(query.vigencia || 'todos');
    const dataBaseMes = normalizeText(query.dataBaseMes || '');
    const abrangencia = normalizeText(query.abrangencia || '');
    const abrangenciaTerritorial = normalizeText(query.abrangenciaTerritorial || '');
    const cnpj = normalizeDigits(query.cnpj || '');

    return records.filter((item) => {
      const vigenciaStatus = getVigenciaStatus(item.vigencia);
      if (nome) {
        const searchable = item._searchBlob;
        if (!searchable.includes(nome)) {
          return false;
        }
      }

      if (cnpj) {
        const matchCnpj = item.sindicatosCelebrantes.some((s) => normalizeDigits(s.cnpj) === cnpj);
        const matchSolicitacao = normalizeDigits(item.numeroSolicitacao).includes(cnpj);
        if (!matchCnpj && !matchSolicitacao) {
          return false;
        }
      }

      if (vigencia === 'vigente' && vigenciaStatus !== 'vigente') return false;
      if (vigencia === 'nao-vigente' && vigenciaStatus === 'vigente') return false;

      if (dataBaseMes) {
        const month = monthFromText(item.dataBase);
        const queryMonth = Number(dataBaseMes);
        if (!queryMonth || month !== queryMonth) {
          return false;
        }
      }

      if (abrangencia && !normalizeText(item.abrangencia).includes(abrangencia)) {
        return false;
      }

      if (abrangenciaTerritorial && !normalizeText(item.abrangenciaTerritorial).includes(abrangenciaTerritorial)) {
        return false;
      }

      return true;
    });
  }

  function paginate(records, page, limit, source = 'files', warnings = []) {
    const totalFiltrados = records.length;
    const totalPages = totalFiltrados ? Math.ceil(totalFiltrados / limit) : 0;
    const safePage = totalPages ? Math.min(Math.max(1, page), totalPages) : 1;
    const start = totalPages ? (safePage - 1) * limit : 0;
    const end = start + limit;
    const items = records.slice(start, end);

    return {
      items,
      meta: {
        source,
        totalFiltrados,
        page: safePage,
        perPage: limit,
        totalPages,
        hasPreviousPage: safePage > 1 && totalPages > 0,
        hasNextPage: safePage < totalPages,
        startIndex: totalFiltrados ? start + 1 : 0,
        endIndex: totalFiltrados ? Math.min(end, totalFiltrados) : 0,
        warnings: warnings.slice(0, 10),
      },
    };
  }

  async function findRecordById(id) {
    const normalizedId = safeString(id);
    if (!normalizedId) return null;
    const catalog = (await ensureCache()).records;
    return catalog.find((item) =>
      item.id === normalizedId
      || normalizeText(item.numeroRegistro) === normalizeText(normalizedId)
      || normalizeText(item.numeroSolicitacao) === normalizeText(normalizedId),
    ) || null;
  }

  async function listConventions(query = {}) {
    const page = Number(query.page || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit || 50)));
    const cacheData = await ensureCache();
    const records = cacheData.records;
    const filtered = applyFilters(records, query);
    const response = paginate(filtered, page, limit, cacheData.source, cacheData.warnings);

    return {
      items: response.items.map((item) => {
        const vigenciaStatus = getVigenciaStatus(item.vigencia);
        return {
          id: item.id,
          nome: item.title,
          prefixo: item.prefixo,
          numeroRegistro: item.numeroRegistro,
          numeroSolicitacao: item.numeroSolicitacao,
          dataRegistroMte: item.dataRegistroMte,
          dataBase: item.dataBase,
          vigencia: item.vigencia,
          abrangencia: truncateText(item.abrangencia, 420),
          abrangenciaTerritorial: truncateText(item.abrangenciaTerritorial, 260),
          quantidadeClausulas: item.quantidadeClausulas,
          vigenciaStatus,
          sindicatosCelebrantes: Array.isArray(item.sindicatosCelebrantes)
            ? item.sindicatosCelebrantes.slice(0, 8)
            : [],
          downloadDisponivel: item.downloadDisponivel,
          downloadFileName: item.downloadFileName,
        };
      }),
      meta: response.meta,
    };
  }

  async function getConventionById(id) {
    const record = await findRecordById(id);
    if (!record) {
      const error = new Error('Convencao nao encontrada.');
      error.statusCode = 404;
      throw error;
    }

    const sourceFileName = safeString(record._sourceFileName || `${record.id}.json`);
    const fullPath = path.join(jsonDir, sourceFileName);
    if (!fs.existsSync(fullPath)) {
      const error = new Error('Arquivo JSON da convencao nao encontrado.');
      error.statusCode = 404;
      throw error;
    }

    let raw = {};
    try {
      raw = parseJsonFile(fullPath);
    } catch (parseError) {
      const error = new Error('Falha ao ler JSON da convencao.');
      error.statusCode = 500;
      throw error;
    }

    return {
      ok: true,
      item: buildDetailRecord({ ...record, _raw: raw }),
    };
  }

  async function getConventionDocument(id) {
    const record = await findRecordById(id);
    if (!record) {
      const error = new Error('Convencao nao encontrada.');
      error.statusCode = 404;
      throw error;
    }

    const candidates = [
      path.join(docDir, record.downloadFileName),
      path.join(docDir, `${record.id}.doc`),
      path.join(docDir, `${record.id}.docx`),
      path.join(docDir, path.basename(record.downloadFileName)),
    ];

    const filePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!filePath) {
      const error = new Error('Arquivo da convencao nao encontrado.');
      error.statusCode = 404;
      throw error;
    }

    return {
      path: filePath,
      fileName: path.basename(filePath),
    };
  }

  return {
    listConventions,
    getConventionById,
    getConventionDocument,
  };
}

module.exports = {
  createCctService,
  __private: {
    buildDbPayloadFromRecord,
    parseDbRowRaw,
  },
};
