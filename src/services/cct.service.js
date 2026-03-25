const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_JSON_DIR = path.join(PROJECT_ROOT, 'data', 'cct', 'json');
const DEFAULT_DOC_DIR = path.join(PROJECT_ROOT, 'data', 'cct', 'docs');

const MONTHS = {
  janeiro: { number: 1, label: 'Janeiro' },
  fevereiro: { number: 2, label: 'Fevereiro' },
  marco: { number: 3, label: 'Marco' },
  abril: { number: 4, label: 'Abril' },
  maio: { number: 5, label: 'Maio' },
  junho: { number: 6, label: 'Junho' },
  julho: { number: 7, label: 'Julho' },
  agosto: { number: 8, label: 'Agosto' },
  setembro: { number: 9, label: 'Setembro' },
  outubro: { number: 10, label: 'Outubro' },
  novembro: { number: 11, label: 'Novembro' },
  dezembro: { number: 12, label: 'Dezembro' },
};

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ÂºÂ°]/g, '')
    .replace(/\u00aa/g, '');
}

function normalizeText(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function safeString(value) {
  return String(value || '').trim();
}

function normalizeDigits(value) {
  return safeString(value).replace(/\D+/g, '');
}

function parseBrDate(value) {
  const raw = safeString(value);
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function parsePtDatesFromText(value) {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  const regex = /(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/g;
  const dates = [];
  let match = regex.exec(normalized);
  while (match) {
    const monthInfo = MONTHS[match[2]];
    if (monthInfo) {
      dates.push(new Date(Number(match[3]), monthInfo.number - 1, Number(match[1])));
    }
    match = regex.exec(normalized);
  }
  return dates;
}

function inferVigenciaStatus(vigencia, referenceDate) {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const dates = parsePtDatesFromText(vigencia);
  const start = dates[0] ? new Date(dates[0].getFullYear(), dates[0].getMonth(), dates[0].getDate()) : null;
  const end = dates[1] ? new Date(dates[1].getFullYear(), dates[1].getMonth(), dates[1].getDate()) : null;

  if (!start && !end) return 'desconhecida';
  if (start && today < start) return 'nao-vigente';
  if (end && today > end) return 'nao-vigente';
  return 'vigente';
}

function extractMonthInfo(dataBase, vigencia) {
  const candidates = [safeString(dataBase), safeString(vigencia)];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    for (const [key, month] of Object.entries(MONTHS)) {
      if (normalized.includes(key)) {
        return { monthNumber: month.number, monthLabel: month.label };
      }
    }
  }
  return { monthNumber: null, monthLabel: '' };
}

function formatMonthFilterValue(monthNumber) {
  return monthNumber ? String(monthNumber).padStart(2, '0') : '';
}

function createDisplayName(record, baseName) {
  const prefixo = normalizeText(record.prefixo);
  const numeroRegistro = safeString(record.numero_registro);
  const numeroSolicitacao = safeString(record.numero_solicitacao);
  const identificador = numeroRegistro || numeroSolicitacao || safeString(baseName);

  if (prefixo.includes('acordo coletivo')) return identificador ? `Acordo Coletivo (${identificador})` : 'Acordo Coletivo';
  if (prefixo.includes('convencao coletiva')) return identificador ? `Convencao Coletiva (${identificador})` : 'Convencao Coletiva';
  if (prefixo.includes('termo aditivo')) return identificador ? `Termo Aditivo (${identificador})` : 'Termo Aditivo';

  const explicitName = [
    record.nome,
    record.titulo,
    record.nome_convencao,
    record.nome_convecao,
    record.nome_categoria,
    record.categoria,
    record.descricao,
  ].map(safeString).find(Boolean);

  return explicitName || (identificador ? `Convencao ${identificador}` : 'Convencao sem identificacao');
}

function collectSindicatos(record) {
  const raw = Array.isArray(record.sindicatos_celebrantes)
    ? record.sindicatos_celebrantes
    : Array.isArray(record.sindicatosCelebrantes)
      ? record.sindicatosCelebrantes
      : [];
  return raw
    .map((item) => ({ nome: safeString(item?.nome), cnpj: safeString(item?.cnpj) }))
    .filter((item) => item.nome || item.cnpj);
}

function buildSearchIndex(record, displayName, sindicatos) {
  const textParts = [
    displayName,
    record.numero_registro,
    record.numero_solicitacao,
    record.arquivo_origem,
    record.nome,
    record.titulo,
    record.nome_convencao,
    record.nome_convecao,
    record.abrangencia,
    record.abrangencia_territorial,
    record.data_base,
    ...sindicatos.flatMap((item) => [item.nome, item.cnpj]),
  ];
  const digitParts = [
    record.numero_registro,
    record.numero_solicitacao,
    record.arquivo_origem,
    record.data_base,
    ...sindicatos.map((item) => item.cnpj),
  ];
  return {
    searchText: normalizeText(textParts.join(' ')),
    searchDigits: normalizeDigits(digitParts.join(' ')),
    searchCnpjDigits: sindicatos.map((item) => normalizeDigits(item.cnpj)).filter(Boolean),
  };
}

function buildSummary(record, fileName, referenceDate) {
  const baseName = path.parse(fileName).name;
  const nome = createDisplayName(record, baseName);
  const sindicatos = collectSindicatos(record);
  const search = buildSearchIndex(record, nome, sindicatos);
  const { monthNumber, monthLabel } = extractMonthInfo(record.data_base, record.vigencia);
  const registroDate = parseBrDate(record.data_registro_mte);

  return {
    id: baseName,
    fileName,
    arquivoOrigem: safeString(record.arquivo_origem),
    prefixo: safeString(record.prefixo),
    nome,
    numeroRegistro: safeString(record.numero_registro),
    numeroSolicitacao: safeString(record.numero_solicitacao),
    dataRegistroMte: safeString(record.data_registro_mte),
    dataBase: safeString(record.data_base),
    dataBaseMes: monthLabel,
    dataBaseMesNumero: monthNumber,
    dataBaseMesValor: formatMonthFilterValue(monthNumber),
    vigencia: safeString(record.vigencia),
    vigenciaStatus: inferVigenciaStatus(record.vigencia, referenceDate),
    abrangencia: safeString(record.abrangencia),
    abrangenciaTerritorial: safeString(record.abrangencia_territorial),
    prazoOposicao: {
      data: safeString(record?.prazo_oposicao?.data),
      clausula: safeString(record?.prazo_oposicao?.clausula),
    },
    quantidadeClausulas: Array.isArray(record.clausulas)
      ? record.clausulas.filter((clause) => safeString(clause?.titulo)).length
      : Number(record.quantidade_clausulas || 0),
    quantidadeSindicatos: Number(record.quantidade_sindicatos || sindicatos.length || 0),
    sindicatosCelebrantes: sindicatos,
    searchText: search.searchText,
    searchDigits: search.searchDigits,
    searchCnpjDigits: search.searchCnpjDigits,
    sortTimestamp: registroDate ? registroDate.getTime() : 0,
  };
}

function mapClause(clause) {
  const titulo = safeString(clause?.titulo);
  if (!titulo) return null;
  return {
    numero: safeString(clause?.numero),
    titulo,
    cabecalho: safeString(clause?.cabecalho),
    resumo: safeString(clause?.resumo_detalhado) || safeString(clause?.resumo_curto) || safeString(clause?.texto),
    resumoCurto: safeString(clause?.resumo_curto),
    resumoDetalhado: safeString(clause?.resumo_detalhado),
    texto: safeString(clause?.texto),
  };
}

function isDocFileName(name) {
  return /\.(doc|docx)$/i.test(safeString(name));
}

function createEmptyDocIndex(docDir, exists) {
  return {
    docDir,
    exists: !!exists,
    byLowerName: new Map(),
    byLowerBase: new Map(),
  };
}

function buildDocIndexFromEntries(entries, docDir) {
  const index = createEmptyDocIndex(docDir, true);
  for (const entry of entries) {
    if (!entry?.isFile?.() || !isDocFileName(entry.name)) continue;
    const fileName = safeString(entry.name);
    const lowerName = fileName.toLowerCase();
    const lowerBase = path.parse(fileName).name.toLowerCase();
    if (!lowerName) continue;
    if (!index.byLowerName.has(lowerName)) {
      index.byLowerName.set(lowerName, fileName);
    }
    if (lowerBase && !index.byLowerBase.has(lowerBase)) {
      index.byLowerBase.set(lowerBase, fileName);
    }
  }
  return index;
}

function resolveDocumentFromIndex(baseName, record, docIndex) {
  if (!docIndex) return null;
  const arquivoOrigem = safeString(record?.arquivo_origem || record?.arquivoOrigem);
  if (arquivoOrigem) {
    const byName = docIndex.byLowerName.get(arquivoOrigem.toLowerCase());
    if (byName) {
      return { path: path.join(docIndex.docDir, byName), fileName: byName };
    }
  }
  const byBase = docIndex.byLowerBase.get(safeString(baseName).toLowerCase());
  if (byBase) {
    return { path: path.join(docIndex.docDir, byBase), fileName: byBase };
  }
  return null;
}

function hasActiveFilters(filters = {}) {
  return Boolean(
    safeString(filters.nome || filters.q)
    || (safeString(filters.vigencia) && normalizeText(filters.vigencia) !== 'todos')
    || safeString(filters.dataBaseMes || filters.data_base_mes)
    || safeString(filters.abrangencia)
    || safeString(filters.abrangenciaTerritorial || filters.abrangencia_territorial)
  );
}

function normalizeVigenciaFilter(value) {
  const normalized = normalizeText(value || 'todos');
  if (!normalized || normalized === 'todos') return 'todos';
  if (normalized === 'nao vigente') return 'nao-vigente';
  return normalized.replace(/\s+/g, '-');
}

function createNotFoundError(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

async function directoryExists(targetPath) {
  try {
    const stat = await fs.promises.stat(targetPath);
    return stat.isDirectory();
  } catch (_) {
    return false;
  }
}

function buildDbPayloadFromRecord(record, fileName, sourceMtimeMs = 0, referenceDate = new Date()) {
  const summary = buildSummary(record, fileName, referenceDate);
  return {
    id: summary.id,
    fileName: summary.fileName,
    arquivoOrigem: summary.arquivoOrigem,
    nome: summary.nome,
    prefixo: summary.prefixo,
    numeroRegistro: summary.numeroRegistro,
    numeroSolicitacao: summary.numeroSolicitacao,
    dataRegistroMte: summary.dataRegistroMte,
    dataBase: summary.dataBase,
    dataBaseMes: summary.dataBaseMes,
    dataBaseMesNumero: summary.dataBaseMesNumero,
    dataBaseMesValor: summary.dataBaseMesValor,
    vigencia: summary.vigencia,
    vigenciaStatus: summary.vigenciaStatus,
    abrangencia: summary.abrangencia,
    abrangenciaNormalized: normalizeText(summary.abrangencia),
    abrangenciaTerritorial: summary.abrangenciaTerritorial,
    abrangenciaTerritorialNormalized: normalizeText(summary.abrangenciaTerritorial),
    prazoOposicaoData: summary.prazoOposicao.data,
    prazoOposicaoClausula: summary.prazoOposicao.clausula,
    quantidadeClausulas: Number(summary.quantidadeClausulas || 0),
    quantidadeSindicatos: Number(summary.quantidadeSindicatos || 0),
    sindicatosCelebrantes: summary.sindicatosCelebrantes,
    searchText: summary.searchText,
    searchDigits: summary.searchDigits,
    searchCnpjDigits: summary.searchCnpjDigits,
    sortTimestamp: Number(summary.sortTimestamp || 0),
    raw: record || {},
    sourceMtimeMs: Number(sourceMtimeMs || 0),
  };
}

function createCctService(deps = {}) {
  const jsonDir = safeString(deps.jsonDir || process.env.CCT_JSON_DIR || DEFAULT_JSON_DIR);
  const docDir = safeString(deps.docDir || process.env.CCT_DOC_DIR || DEFAULT_DOC_DIR);
  const now = typeof deps.now === 'function' ? deps.now : () => new Date();
  const pool = deps.pool || null;
  const docIndexCacheMs = Math.max(1_000, Number(deps.docIndexCacheMs || process.env.CCT_DOC_INDEX_CACHE_MS || 30_000) || 30_000);
  const fileIndexCacheMs = Math.max(1_000, Number(deps.fileIndexCacheMs || process.env.CCT_JSON_INDEX_CACHE_MS || 30_000) || 30_000);

  const docIndexCache = {
    expiresAt: 0,
    index: createEmptyDocIndex(docDir, false),
    loadingPromise: null,
  };

  const fileRecordsCache = {
    expiresAt: 0,
    records: [],
    loadingPromise: null,
  };
  const jsonFilesCache = {
    expiresAt: 0,
    files: [],
    loadingPromise: null,
  };

  async function getDocumentIndex(forceRefresh = false) {
    const nowMs = Date.now();
    if (!forceRefresh && docIndexCache.expiresAt > nowMs) {
      return docIndexCache.index;
    }
    if (docIndexCache.loadingPromise) {
      return docIndexCache.loadingPromise;
    }

    docIndexCache.loadingPromise = (async () => {
      try {
        const entries = await fs.promises.readdir(docDir, { withFileTypes: true });
        const index = buildDocIndexFromEntries(entries, docDir);
        docIndexCache.index = index;
      } catch (_) {
        docIndexCache.index = createEmptyDocIndex(docDir, false);
      } finally {
        docIndexCache.expiresAt = Date.now() + docIndexCacheMs;
      }
      return docIndexCache.index;
    })();

    try {
      return await docIndexCache.loadingPromise;
    } finally {
      docIndexCache.loadingPromise = null;
    }
  }

  async function findDocumentForConventionFast(baseName, record, forceRefresh = false) {
    const index = await getDocumentIndex(forceRefresh);
    const found = resolveDocumentFromIndex(baseName, record, index);
    if (found || forceRefresh) return found;
    const refreshed = await getDocumentIndex(true);
    return resolveDocumentFromIndex(baseName, record, refreshed);
  }

  async function getFileRecordsCached() {
    const nowMs = Date.now();
    if (fileRecordsCache.expiresAt > nowMs && Array.isArray(fileRecordsCache.records)) {
      return fileRecordsCache.records;
    }
    if (fileRecordsCache.loadingPromise) {
      return fileRecordsCache.loadingPromise;
    }

    fileRecordsCache.loadingPromise = (async () => {
      const jsonFiles = await getJsonFileNamesCached();

      const records = [];
      for (const fileName of jsonFiles) {
        try {
          const fullPath = path.join(jsonDir, fileName);
          const raw = JSON.parse(await fs.promises.readFile(fullPath, 'utf-8'));
          const summary = buildSummary(raw, fileName, now());
          summary.downloadDisponivel = false;
          summary.downloadFileName = '';
          records.push(summary);
        } catch (_) {}
      }
      fileRecordsCache.records = records;
      fileRecordsCache.expiresAt = Date.now() + fileIndexCacheMs;
      return records;
    })();

    try {
      return await fileRecordsCache.loadingPromise;
    } finally {
      fileRecordsCache.loadingPromise = null;
    }
  }

  async function getJsonFileNamesCached() {
    const nowMs = Date.now();
    if (jsonFilesCache.expiresAt > nowMs && Array.isArray(jsonFilesCache.files)) {
      return jsonFilesCache.files;
    }
    if (jsonFilesCache.loadingPromise) {
      return jsonFilesCache.loadingPromise;
    }

    jsonFilesCache.loadingPromise = (async () => {
      const entries = await fs.promises.readdir(jsonDir, { withFileTypes: true }).catch(() => []);
      const jsonFiles = entries
        .filter((entry) => entry.isFile() && /\.json$/i.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, 'pt-BR'));
      jsonFilesCache.files = jsonFiles;
      jsonFilesCache.expiresAt = Date.now() + fileIndexCacheMs;
      return jsonFiles;
    })();

    try {
      return await jsonFilesCache.loadingPromise;
    } finally {
      jsonFilesCache.loadingPromise = null;
    }
  }

  async function listConventions(filters = {}) {
    const requestedPage = Math.max(1, Number(filters.page || filters.pagina || 1) || 1);
    const perPage = Math.min(50, Math.max(1, Number(filters.perPage || filters.limit || 50) || 50));

    if (pool && typeof pool.query === 'function') {
      const clauses = [];
      const params = [];
      const nomeFilter = safeString(filters.nome || filters.q);
      const nomeText = normalizeText(nomeFilter);
      const nomeDigits = normalizeDigits(nomeFilter);
      const vigencia = normalizeVigenciaFilter(filters.vigencia);
      const dataBaseMes = safeString(filters.dataBaseMes || filters.data_base_mes);
      const abrangencia = normalizeText(filters.abrangencia);
      const territorial = normalizeText(filters.abrangenciaTerritorial || filters.abrangencia_territorial);

      if (nomeText || nomeDigits) {
        const parts = [];
        if (nomeText) {
          params.push(nomeText);
          parts.push(`search_text LIKE '%' || $${params.length} || '%'`);
        }
        if (nomeDigits) {
          params.push(nomeDigits);
          parts.push(`search_digits LIKE '%' || $${params.length} || '%'`);
        }
        clauses.push(`(${parts.join(' OR ')})`);
      }
      if (vigencia && vigencia !== 'todos') {
        params.push(vigencia);
        clauses.push(`vigencia_status = $${params.length}`);
      }
      if (dataBaseMes) {
        params.push(dataBaseMes);
        clauses.push(`data_base_mes_valor = $${params.length}`);
      }
      if (abrangencia) {
        params.push(abrangencia);
        clauses.push(`abrangencia_normalized LIKE '%' || $${params.length} || '%'`);
      }
      if (territorial) {
        params.push(territorial);
        clauses.push(`abrangencia_territorial_normalized LIKE '%' || $${params.length} || '%'`);
      }

      const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      try {
        const countFiltered = await pool.query(`SELECT COUNT(*)::int AS count FROM cct_conventions ${whereSql}`, params);
        const countTotal = await pool.query('SELECT COUNT(*)::int AS count FROM cct_conventions');
        const totalFiltrados = Number(countFiltered.rows?.[0]?.count || 0);
        const totalArquivos = Number(countTotal.rows?.[0]?.count || 0);
        const totalPages = totalFiltrados ? Math.ceil(totalFiltrados / perPage) : 0;
        const page = totalPages ? Math.min(requestedPage, totalPages) : 1;
        const offset = totalPages ? (page - 1) * perPage : 0;

        const rowParams = params.slice();
        let orderSql = 'ORDER BY sort_timestamp DESC, nome ASC';
        if (nomeDigits) {
          rowParams.push(nomeDigits);
          const pos = rowParams.length;
          orderSql = `ORDER BY CASE WHEN $${pos} = ANY(search_cnpj_digits) THEN 0 WHEN search_digits LIKE '%' || $${pos} || '%' THEN 1 ELSE 2 END ASC, sort_timestamp DESC, nome ASC`;
        }
        rowParams.push(perPage);
        const limitPos = rowParams.length;
        rowParams.push(offset);
        const offsetPos = rowParams.length;

        const rows = await pool.query(
          `
          SELECT
            id, file_name, arquivo_origem, nome, prefixo,
            numero_registro, numero_solicitacao,
            data_registro_mte, data_base, data_base_mes, data_base_mes_numero, data_base_mes_valor,
            vigencia, vigencia_status, abrangencia, abrangencia_territorial,
            prazo_oposicao_data, prazo_oposicao_clausula,
            quantidade_clausulas, quantidade_sindicatos, sindicatos_celebrantes,
            search_text, search_digits, search_cnpj_digits, sort_timestamp
          FROM cct_conventions
          ${whereSql}
          ${orderSql}
          LIMIT $${limitPos}
          OFFSET $${offsetPos}
          `,
          rowParams,
        );

        const items = (rows.rows || []).map((row) => {
          return {
            id: safeString(row.id),
            fileName: safeString(row.file_name),
            arquivoOrigem: safeString(row.arquivo_origem),
            nome: safeString(row.nome),
            prefixo: safeString(row.prefixo),
            numeroRegistro: safeString(row.numero_registro),
            numeroSolicitacao: safeString(row.numero_solicitacao),
            dataRegistroMte: safeString(row.data_registro_mte),
            dataBase: safeString(row.data_base),
            dataBaseMes: safeString(row.data_base_mes),
            dataBaseMesNumero: Number(row.data_base_mes_numero || 0) || null,
            dataBaseMesValor: safeString(row.data_base_mes_valor),
            vigencia: safeString(row.vigencia),
            vigenciaStatus: safeString(row.vigencia_status),
            abrangencia: safeString(row.abrangencia),
            abrangenciaTerritorial: safeString(row.abrangencia_territorial),
            prazoOposicao: { data: safeString(row.prazo_oposicao_data), clausula: safeString(row.prazo_oposicao_clausula) },
            quantidadeClausulas: Number(row.quantidade_clausulas || 0),
            quantidadeSindicatos: Number(row.quantidade_sindicatos || 0),
            sindicatosCelebrantes: Array.isArray(row.sindicatos_celebrantes) ? row.sindicatos_celebrantes : [],
            searchText: safeString(row.search_text),
            searchDigits: safeString(row.search_digits),
            searchCnpjDigits: Array.isArray(row.search_cnpj_digits) ? row.search_cnpj_digits : [],
            sortTimestamp: Number(row.sort_timestamp || 0),
            downloadDisponivel: false,
            downloadFileName: '',
          };
        });

        return {
          items,
          meta: {
            totalArquivos,
            totalFiltrados,
            page,
            perPage,
            totalPages,
            hasPreviousPage: totalPages > 0 && page > 1,
            hasNextPage: totalPages > 0 && page < totalPages,
            startIndex: totalFiltrados ? offset + 1 : 0,
            endIndex: totalFiltrados ? Math.min(offset + perPage, totalFiltrados) : 0,
            jsonDirExists: true,
            docDirExists: true,
            warnings: [],
            jsonDir,
            docDir,
            dataConsulta: now().toISOString(),
            source: 'database',
          },
        };
      } catch (error) {
        if (String(error?.code || '') !== '42P01') {
          throw error;
        }
      }
    }

    // Fallback arquivo (seguro enquanto tabela ainda estiver vazia/ausente)
    const [jsonDirExists, docDirExists] = await Promise.all([
      directoryExists(jsonDir),
      directoryExists(docDir),
    ]);
    const warnings = [];
    if (!jsonDirExists) warnings.push(`Pasta de JSON nao encontrada: ${jsonDir}`);
    if (!docDirExists) warnings.push(`Pasta de documentos nao encontrada: ${docDir}`);
    const activeFilters = hasActiveFilters(filters);
    if (!activeFilters) {
      const jsonFiles = jsonDirExists ? await getJsonFileNamesCached() : [];
      const totalFiltrados = jsonFiles.length;
      const totalPages = totalFiltrados ? Math.ceil(totalFiltrados / perPage) : 0;
      const page = totalPages ? Math.min(requestedPage, totalPages) : 1;
      const start = totalPages ? (page - 1) * perPage : 0;
      const pageFiles = totalFiltrados ? jsonFiles.slice(start, start + perPage) : [];

      const items = [];
      for (const fileName of pageFiles) {
        try {
          const fullPath = path.join(jsonDir, fileName);
          const raw = JSON.parse(await fs.promises.readFile(fullPath, 'utf-8'));
          const summary = buildSummary(raw, fileName, now());
          summary.downloadDisponivel = false;
          summary.downloadFileName = '';
          items.push(summary);
        } catch (_) {}
      }

      items.sort((a, b) => {
        const byTimestamp = (Number(b.sortTimestamp || 0) - Number(a.sortTimestamp || 0));
        if (byTimestamp !== 0) return byTimestamp;
        return safeString(a.nome).localeCompare(safeString(b.nome), 'pt-BR');
      });

      // Aquece o cache completo em background para acelerar buscas com filtro.
      Promise.resolve().then(() => getFileRecordsCached()).catch(() => {});

      return {
        items,
        meta: {
          totalArquivos: totalFiltrados,
          totalFiltrados,
          page,
          perPage,
          totalPages,
          hasPreviousPage: totalPages > 0 && page > 1,
          hasNextPage: totalPages > 0 && page < totalPages,
          startIndex: totalFiltrados ? start + 1 : 0,
          endIndex: totalFiltrados ? Math.min(start + perPage, totalFiltrados) : 0,
          jsonDirExists,
          docDirExists,
          warnings,
          jsonDir,
          docDir,
          dataConsulta: now().toISOString(),
          source: 'files',
        },
      };
    }

    const records = jsonDirExists ? (await getFileRecordsCached()) : [];

    const nomeFilter = safeString(filters.nome || filters.q);
    const nomeText = normalizeText(nomeFilter);
    const nomeDigits = normalizeDigits(nomeFilter);
    const vigencia = normalizeVigenciaFilter(filters.vigencia);
    const dataBaseMes = safeString(filters.dataBaseMes || filters.data_base_mes);
    const abrangencia = normalizeText(filters.abrangencia);
    const territorial = normalizeText(filters.abrangenciaTerritorial || filters.abrangencia_territorial);

    const filtered = records.filter((item) => {
      if (nomeText || nomeDigits) {
        const matchText = nomeText ? item.searchText.includes(nomeText) : false;
        const matchDigits = nomeDigits ? item.searchDigits.includes(nomeDigits) : false;
        if (!(matchText || matchDigits)) return false;
      }
      if (vigencia !== 'todos' && safeString(item.vigenciaStatus) !== vigencia) {
        return false;
      }
      if (dataBaseMes && safeString(item.dataBaseMesValor) !== dataBaseMes) {
        return false;
      }
      if (abrangencia && !normalizeText(item.abrangencia).includes(abrangencia)) {
        return false;
      }
      if (territorial && !normalizeText(item.abrangenciaTerritorial).includes(territorial)) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (nomeDigits) {
        const aPriority = Array.isArray(a.searchCnpjDigits) && a.searchCnpjDigits.includes(nomeDigits)
          ? 0
          : (a.searchDigits.includes(nomeDigits) ? 1 : 2);
        const bPriority = Array.isArray(b.searchCnpjDigits) && b.searchCnpjDigits.includes(nomeDigits)
          ? 0
          : (b.searchDigits.includes(nomeDigits) ? 1 : 2);
        if (aPriority !== bPriority) return aPriority - bPriority;
      }
      const byTimestamp = (Number(b.sortTimestamp || 0) - Number(a.sortTimestamp || 0));
      if (byTimestamp !== 0) return byTimestamp;
      return safeString(a.nome).localeCompare(safeString(b.nome), 'pt-BR');
    });
    const totalFiltrados = filtered.length;
    const totalPages = totalFiltrados ? Math.ceil(totalFiltrados / perPage) : 0;
    const page = totalPages ? Math.min(requestedPage, totalPages) : 1;
    const start = totalPages ? (page - 1) * perPage : 0;

    return {
      items: totalFiltrados ? filtered.slice(start, start + perPage) : [],
      meta: {
        totalArquivos: records.length,
        totalFiltrados,
        page,
        perPage,
        totalPages,
        hasPreviousPage: totalPages > 0 && page > 1,
        hasNextPage: totalPages > 0 && page < totalPages,
        startIndex: totalFiltrados ? start + 1 : 0,
        endIndex: totalFiltrados ? Math.min(start + perPage, totalFiltrados) : 0,
        jsonDirExists,
        docDirExists,
        warnings,
        jsonDir,
        docDir,
        dataConsulta: now().toISOString(),
        source: 'files',
      },
    };
  }

  async function getConventionById(id) {
    const normalizedId = safeString(id);
    if (!normalizedId) throw createNotFoundError('Convenio nao informado.');

    if (pool && typeof pool.query === 'function') {
      try {
        const result = await pool.query('SELECT * FROM cct_conventions WHERE id = $1 LIMIT 1', [normalizedId]);
        const row = result.rows?.[0];
        if (row) {
          const raw = typeof row.raw === 'object' && row.raw ? row.raw : {};
          const document = await findDocumentForConventionFast(row.id, { arquivo_origem: row.arquivo_origem });
          const clauses = Array.isArray(raw.clausulas) ? raw.clausulas.map(mapClause).filter(Boolean) : [];
          return {
            id: safeString(row.id),
            nome: safeString(row.nome),
            prefixo: safeString(row.prefixo),
            arquivoOrigem: safeString(row.arquivo_origem),
            numeroRegistro: safeString(row.numero_registro),
            numeroSolicitacao: safeString(row.numero_solicitacao),
            dataRegistroMte: safeString(row.data_registro_mte),
            dataBase: safeString(row.data_base),
            dataBaseMes: safeString(row.data_base_mes),
            vigencia: safeString(row.vigencia),
            vigenciaStatus: safeString(row.vigencia_status),
            abrangencia: safeString(row.abrangencia),
            abrangenciaTerritorial: safeString(row.abrangencia_territorial),
            prazoOposicao: { data: safeString(row.prazo_oposicao_data), clausula: safeString(row.prazo_oposicao_clausula) },
            sindicatosCelebrantes: Array.isArray(row.sindicatos_celebrantes) ? row.sindicatos_celebrantes : [],
            quantidadeSindicatos: Number(row.quantidade_sindicatos || 0),
            quantidadeClausulas: Number(row.quantidade_clausulas || 0),
            sumarioClausulas: clauses.map((clause) => ({ numero: clause.numero, titulo: clause.titulo })),
            clausulas: clauses,
            downloadDisponivel: !!document,
            downloadFileName: document?.fileName || '',
          };
        }
      } catch (error) {
        if (String(error?.code || '') !== '42P01') throw error;
      }
    }

    const filePath = path.join(jsonDir, `${normalizedId}.json`);
    const raw = JSON.parse(await fs.promises.readFile(filePath, 'utf-8').catch(() => {
      throw createNotFoundError('Convenio nao encontrado.');
    }));
    const summary = buildSummary(raw, `${normalizedId}.json`, now());
    const document = await findDocumentForConventionFast(summary.id, raw);
    const clauses = Array.isArray(raw.clausulas) ? raw.clausulas.map(mapClause).filter(Boolean) : [];
    return {
      id: normalizedId,
      nome: summary.nome,
      prefixo: summary.prefixo,
      arquivoOrigem: summary.arquivoOrigem,
      numeroRegistro: summary.numeroRegistro,
      numeroSolicitacao: summary.numeroSolicitacao,
      dataRegistroMte: summary.dataRegistroMte,
      dataBase: summary.dataBase,
      dataBaseMes: summary.dataBaseMes,
      vigencia: summary.vigencia,
      vigenciaStatus: summary.vigenciaStatus,
      abrangencia: summary.abrangencia,
      abrangenciaTerritorial: summary.abrangenciaTerritorial,
      prazoOposicao: summary.prazoOposicao,
      sindicatosCelebrantes: summary.sindicatosCelebrantes,
      quantidadeSindicatos: summary.quantidadeSindicatos,
      quantidadeClausulas: summary.quantidadeClausulas,
      sumarioClausulas: clauses.map((clause) => ({ numero: clause.numero, titulo: clause.titulo })),
      clausulas: clauses,
      downloadDisponivel: !!document,
      downloadFileName: document?.fileName || '',
    };
  }

  async function getConventionDocument(id) {
    const detail = await getConventionById(id);
    const document = await findDocumentForConventionFast(
      detail.id,
      { arquivo_origem: detail.arquivoOrigem },
      true,
    );
    if (!document) throw createNotFoundError('Arquivo da convencao nao encontrado.');
    return document;
  }

  function warmup() {
    const shouldWarmup = String(process.env.CCT_WARMUP || '').trim() === '1';
    if (!shouldWarmup) return;

    const jobs = [];
    if (!pool || typeof pool.query !== 'function') {
      jobs.push(getFileRecordsCached());
    }
    if (String(process.env.CCT_WARMUP_DOC_INDEX || '').trim() === '1') {
      jobs.push(getDocumentIndex());
    }
    if (!jobs.length) return;
    Promise.allSettled(jobs).catch(() => {});
  }

  return {
    listConventions,
    getConventionById,
    getConventionDocument,
    warmup,
  };
}

module.exports = {
  createCctService,
  __private: {
    safeString,
    normalizeText,
    normalizeDigits,
    buildSummary,
    buildDbPayloadFromRecord,
    mapClause,
  },
};
