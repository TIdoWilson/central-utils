const path = require('path');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const { DOMParser } = require('xmldom');

const ICMS_C100_LAYOUT = require('../../api/layouts/speds/icms/C100.json');
const ICMS_C170_LAYOUT = require('../../api/layouts/speds/icms/C170.json');
const CONTRIB_C100_LAYOUT = require('../../api/layouts/speds/contribuicoes/C100.json');
const CONTRIB_C170_LAYOUT = require('../../api/layouts/speds/contribuicoes/C170.json');
const CONTRIB_A100_LAYOUT = require('../../api/layouts/speds/contribuicoes/A100.json');
const CONTRIB_A170_LAYOUT = require('../../api/layouts/speds/contribuicoes/A170.json');

const TYPE_LABELS = {
  auto: 'Auto',
  icms: 'ICMS/IPI',
  contribuicoes: 'Contribuicoes',
};

const SPED_CONFIGS = {
  icms: {
    label: 'ICMS/IPI',
    noteRecords: [
      {
        record: 'C100',
        layout: ICMS_C100_LAYOUT,
        noteType: 'NFe',
      },
    ],
    itemRecords: [
      {
        record: 'C170',
        layout: ICMS_C170_LAYOUT,
      },
    ],
  },
  contribuicoes: {
    label: 'Contribuicoes',
    noteRecords: [
      {
        record: 'A100',
        layout: CONTRIB_A100_LAYOUT,
        noteType: 'NFS-e',
      },
      {
        record: 'C100',
        layout: CONTRIB_C100_LAYOUT,
        noteType: 'NFe',
      },
    ],
    itemRecords: [
      {
        record: 'A170',
        layout: CONTRIB_A170_LAYOUT,
      },
      {
        record: 'C170',
        layout: CONTRIB_C170_LAYOUT,
      },
    ],
  },
};

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeUpper(value) {
  return normalizeWhitespace(value).toUpperCase();
}

function normalizeUpperNoAccent(value) {
  return normalizeUpper(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeMoney(value) {
  const text = normalizeWhitespace(value);
  if (!text) return 0;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(/,/g, '.') : text;
  const number = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function normalizeCst(value) {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.length === 1) return `0${digits}`;
  return digits;
}

function getLocalName(node) {
  return normalizeUpper(node?.localName || node?.nodeName || '').replace(/^.*:/, '');
}

function getChildByLocalName(node, name) {
  const target = normalizeUpper(name);
  if (!node || !node.childNodes) return null;
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes[i];
    if (!child || child.nodeType !== 1) continue;
    if (getLocalName(child) === target) return child;
  }
  return null;
}

function findChildrenByLocalName(node, name) {
  const out = [];
  const target = normalizeUpper(name);
  if (!node || !node.childNodes) return out;
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes[i];
    if (!child || child.nodeType !== 1) continue;
    if (getLocalName(child) === target) out.push(child);
  }
  return out;
}

function findFirstDescendantByLocalName(node, name) {
  const target = normalizeUpper(name);
  const walk = (current) => {
    if (!current || !current.childNodes) return null;
    for (let i = 0; i < current.childNodes.length; i += 1) {
      const child = current.childNodes[i];
      if (!child || child.nodeType !== 1) continue;
      if (getLocalName(child) === target) return child;
      const nested = walk(child);
      if (nested) return nested;
    }
    return null;
  };
  return walk(node);
}

function getNodeText(node) {
  return normalizeWhitespace(node?.textContent || '');
}

function getTextPath(node, pathParts) {
  let current = node;
  for (const part of pathParts) {
    current = getChildByLocalName(current, part);
    if (!current) return '';
  }
  return getNodeText(current);
}

function getAttribute(node, attrName) {
  if (!node || typeof node.getAttribute !== 'function') return '';
  return normalizeWhitespace(node.getAttribute(attrName) || '');
}

function decodeBufferWithFallback(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const encodings = ['utf-8', 'windows-1252', 'latin1'];

  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, encoding === 'utf-8' ? { fatal: true } : undefined);
      return decoder.decode(bytes).replace(/^\uFEFF/, '');
    } catch (_) {
      // tenta o proximo
    }
  }

  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
}

function buildFieldIndex(layout) {
  const out = {};
  const campos = Array.isArray(layout?.campos) ? layout.campos : [];
  campos.forEach((campo, index) => {
    const key = normalizeUpper(campo?.campo || '');
    if (!key || key in out) return;
    out[key] = index + 1;
  });
  return out;
}

const FIELD_INDEX = {
  icms: {
    C100: buildFieldIndex(ICMS_C100_LAYOUT),
    C170: buildFieldIndex(ICMS_C170_LAYOUT),
  },
  contribuicoes: {
    A100: buildFieldIndex(CONTRIB_A100_LAYOUT),
    A170: buildFieldIndex(CONTRIB_A170_LAYOUT),
    C100: buildFieldIndex(CONTRIB_C100_LAYOUT),
    C170: buildFieldIndex(CONTRIB_C170_LAYOUT),
  },
};

function getSpedField(parts, fieldIndex, fieldName) {
  const idx = fieldIndex?.[normalizeUpper(fieldName)];
  if (!idx) return '';
  return normalizeWhitespace(parts[idx] ?? '');
}

function makeNoteFallbackKey(note) {
  const record = normalizeUpper(note?.registro || '');
  const serie = normalizeDigits(note?.serie || normalizeWhitespace(note?.serie || ''));
  const numero = normalizeDigits(note?.numero || '');
  const chave = normalizeDigits(note?.chave || '');

  const candidates = [
    chave ? `CHAVE|${chave}` : '',
    record && numero ? `NF|${serie || '-'}|${numero}` : '',
    record && numero ? `NFE|${serie || '-'}|${numero}` : '',
    record && numero ? `${record}|${serie || '-'}|${numero}` : '',
    record && numero ? `${numero}|${serie || '-'}|${record}` : '',
  ].filter(Boolean);

  return candidates;
}

function makeItemLookupKeys(item) {
  const keys = [];
  const numItem = normalizeDigits(item?.numItem || '');
  const codItem = normalizeUpper(item?.codItem || '');

  if (numItem) keys.push(`item-num:${numItem}`);
  if (codItem) keys.push(`item-cod:${codItem}`);
  return keys;
}

function registerByKeys(map, keys, value) {
  for (const key of keys) {
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }
}

function findByKeys(map, keys) {
  for (const key of keys) {
    const values = map.get(key);
    if (Array.isArray(values) && values.length > 0) return values[0];
  }
  return null;
}

function normalizeOutputType(value) {
  const raw = normalizeUpperNoAccent(value);
  if (raw === 'ICMS' || raw === 'ICMS/IPI') return 'icms';
  if (raw === 'CONTRIBUICOES') return 'contribuicoes';
  return 'auto';
}

function detectSpedTypeFromText(text) {
  const upper = normalizeUpperNoAccent(text);
  const hasContribMarkers = [
    '|A100|',
    '|A170|',
    '|M210|',
    '|M500|',
    '|M600|',
    '|M800|',
    '|F100|',
    '|F500|',
    '|F600|',
  ].some((marker) => upper.includes(marker));

  if (hasContribMarkers) return 'contribuicoes';
  const headerLine = String(text || '')
    .split(/\r?\n/)
    .find((line) => normalizeWhitespace(line).startsWith('|0000|'));
  if (headerLine) {
    const parts = splitSpedLine(headerLine);
    const codVer = normalizeDigits(parts[2] || '');
    if (codVer === '006') return 'contribuicoes';
  }
  return 'icms';
}

function splitSpedLine(line) {
  const raw = String(line || '').replace(/\r$/, '');
  if (!raw.startsWith('|')) return [];
  const parts = raw.split('|');
  return parts.length > 2 ? parts : [];
}

function parseNoteRecord(parts, config, recordName, spedType) {
  const fieldIndex = FIELD_INDEX[spedType]?.[recordName];
  if (!fieldIndex) return null;

  const indOper = normalizeDigits(getSpedField(parts, fieldIndex, 'IND_OPER'));
  const indEmit = getSpedField(parts, fieldIndex, 'IND_EMIT');
  const chaveField = recordName === 'A100' ? 'CHV_NFSE' : 'CHV_NFE';
  const nota = {
    tipoSped: config.label,
    tipoInterno: spedType,
    registro: recordName,
    chave: normalizeDigits(getSpedField(parts, fieldIndex, chaveField)),
    serie: normalizeWhitespace(getSpedField(parts, fieldIndex, 'SER')),
    numero: normalizeDigits(getSpedField(parts, fieldIndex, 'NUM_DOC')),
    data: normalizeWhitespace(getSpedField(parts, fieldIndex, 'DT_DOC')),
    valor: normalizeMoney(getSpedField(parts, fieldIndex, 'VL_DOC')),
    indOper,
    indEmit: normalizeWhitespace(indEmit),
    codPart: normalizeWhitespace(getSpedField(parts, fieldIndex, 'COD_PART')),
    codMod: normalizeWhitespace(getSpedField(parts, fieldIndex, 'COD_MOD')),
    items: [],
  };

  nota.isEntrada = indOper === '0';
  nota.lookupKeys = makeNoteFallbackKey(nota);
  return nota;
}

function parseItemRecord(parts, config, recordName, spedType) {
  const fieldIndex = FIELD_INDEX[spedType]?.[recordName];
  if (!fieldIndex) return null;

  const item = {
    tipoSped: config.label,
    tipoInterno: spedType,
    registro: recordName,
    numItem: normalizeDigits(getSpedField(parts, fieldIndex, 'NUM_ITEM')),
    codItem: normalizeWhitespace(getSpedField(parts, fieldIndex, 'COD_ITEM')),
    descrCompl: normalizeWhitespace(getSpedField(parts, fieldIndex, 'DESCR_COMPL')),
    vlItem: normalizeMoney(getSpedField(parts, fieldIndex, 'VL_ITEM')),
    vlDesc: normalizeMoney(getSpedField(parts, fieldIndex, 'VL_DESC')),
    cstPis: normalizeCst(getSpedField(parts, fieldIndex, 'CST_PIS')),
    cstCofins: normalizeCst(getSpedField(parts, fieldIndex, 'CST_COFINS')),
    cfop: normalizeWhitespace(getSpedField(parts, fieldIndex, 'CFOP')),
  };

  item.lookupKeys = makeItemLookupKeys(item);
  return item;
}

function parseSpedTxtByType(text, spedType) {
  const config = SPED_CONFIGS[spedType];
  if (!config) {
    throw new Error('Tipo de SPED invalido.');
  }

  const lines = String(text || '').split(/\r?\n/);
  const notes = [];
  const notesIndex = new Map();
  const stats = {
    totalNotesRecords: 0,
    totalEntryNotes: 0,
    totalExitNotes: 0,
    byRecord: {},
  };
  let currentNote = null;

  for (const line of lines) {
    const parts = splitSpedLine(line);
    if (!parts.length) continue;

    const reg = normalizeUpper(parts[1] || '');
    const noteSpec = config.noteRecords.find((item) => item.record === reg);
    if (noteSpec) {
      stats.totalNotesRecords += 1;
      const note = parseNoteRecord(parts, config, noteSpec.record, spedType);
      currentNote = note && note.isEntrada ? note : null;
      if (currentNote) {
        notes.push(currentNote);
        registerByKeys(notesIndex, currentNote.lookupKeys, currentNote);
        stats.totalEntryNotes += 1;
      } else {
        stats.totalExitNotes += 1;
      }
      if (!stats.byRecord[reg]) {
        stats.byRecord[reg] = { total: 0, entradas: 0, saidas: 0 };
      }
      stats.byRecord[reg].total += 1;
      if (currentNote) stats.byRecord[reg].entradas += 1;
      else stats.byRecord[reg].saidas += 1;
      continue;
    }

    const itemSpec = config.itemRecords.find((item) => item.record === reg);
    if (itemSpec && currentNote) {
      const item = parseItemRecord(parts, config, itemSpec.record, spedType);
      if (item) {
        item.uid = `sped:${currentNote.registro}:${currentNote.numero || currentNote.chave || 'sem_chave'}:${currentNote.items.length + 1}:${item.numItem || item.codItem || 'item'}`;
        currentNote.items.push(item);
      }
      continue;
    }
  }

  return {
    spedType,
    label: config.label,
    notes,
    index: notesIndex,
    totalLines: lines.length,
    stats,
  };
}

function parseSpedTxt(buffer, tipoSelecionado = 'auto') {
  const text = decodeBufferWithFallback(buffer);
  const selectedType = normalizeOutputType(tipoSelecionado);
  if (selectedType !== 'auto') {
    return parseSpedTxtByType(text, selectedType);
  }

  const detectedType = detectSpedTypeFromText(text);
  const fallbackTypes = detectedType === 'contribuicoes'
    ? ['contribuicoes', 'icms']
    : ['icms', 'contribuicoes'];

  let bestResult = null;
  for (const spedType of fallbackTypes) {
    try {
      const parsed = parseSpedTxtByType(text, spedType);
      if (!bestResult || parsed.notes.length > bestResult.notes.length) {
        bestResult = parsed;
      }
      if (parsed.notes.length > 0) {
        return parsed;
      }
    } catch (_) {
      // tenta o proximo tipo
    }
  }

  if (bestResult) return bestResult;
  throw new Error('Nao foi possivel identificar o tipo de SPED enviado.');
}

function buildNoEntryNotesError(spedResult) {
  const details = [];
  if (spedResult?.stats?.totalNotesRecords > 0) {
    const parts = [];
    for (const [record, stat] of Object.entries(spedResult.stats.byRecord || {})) {
      parts.push(`${record}: ${stat.entradas || 0} entradas / ${stat.saidas || 0} saidas`);
    }
    if (parts.length) {
      details.push(`Registros encontrados no SPED: ${parts.join(', ')}.`);
    }
  }

  if (!details.length) {
    details.push('Nenhum registro de entrada foi identificado nos blocos esperados do SPED.');
  }

  return `Nao foram encontrados registros de entrada no SPED enviado. ${details.join(' ')}`;
}

function parseXmlDocument(buffer) {
  const text = decodeBufferWithFallback(buffer);
  const parser = new DOMParser({
    errorHandler: {
      warning() {},
      error() {},
      fatalError() {},
    },
  });
  const doc = parser.parseFromString(text, 'text/xml');
  const parserError = doc?.getElementsByTagName?.('parsererror');
  if (parserError && parserError.length > 0) {
    throw new Error('XML invalido ou malformado.');
  }
  return doc;
}

function parseXmlNote(xmlBuffer, fileName) {
  const doc = parseXmlDocument(xmlBuffer);
  const infNFe = findFirstDescendantByLocalName(doc, 'infNFe');
  if (!infNFe) {
    return null;
  }

  const ide = getChildByLocalName(infNFe, 'ide');
  const emit = getChildByLocalName(infNFe, 'emit');
  const dest = getChildByLocalName(infNFe, 'dest');
  const total = getChildByLocalName(infNFe, 'total');
  const icmsTot = total ? getChildByLocalName(total, 'ICMSTot') : null;
  const chave = normalizeDigits(getAttribute(infNFe, 'Id').replace(/^NFe/i, ''));
  const tpNF = normalizeDigits(getTextPath(ide, ['tpNF']));
  const serie = normalizeDigits(getTextPath(ide, ['serie']));
  const numero = normalizeDigits(getTextPath(ide, ['nNF']));
  const data = normalizeWhitespace(getTextPath(ide, ['dhEmi']) || getTextPath(ide, ['dEmi']));
  const emitDoc = normalizeDigits(
    getTextPath(emit, ['CNPJ']) || getTextPath(emit, ['CPF']) || '',
  );
  const destDoc = normalizeDigits(
    getTextPath(dest, ['CNPJ']) || getTextPath(dest, ['CPF']) || '',
  );
  const vNF = normalizeMoney(getTextPath(icmsTot, ['vNF']) || getTextPath(total, ['vNF']));

  const note = {
    sourceFile: fileName,
    chave,
    serie,
    numero,
    data,
    emitDoc,
    destDoc,
    valor: vNF,
    tpNF,
    isEntrada: tpNF === '0',
    items: [],
  };

  const detNodes = findChildrenByLocalName(infNFe, 'det');
  for (const det of detNodes) {
    const prod = getChildByLocalName(det, 'prod');
    const imposto = getChildByLocalName(det, 'imposto');
    const item = {
      numItem: normalizeDigits(getAttribute(det, 'nItem')),
      codItem: normalizeWhitespace(getTextPath(prod, ['cProd'])),
      descrCompl: normalizeWhitespace(getTextPath(prod, ['xProd'])),
      cfop: normalizeDigits(getTextPath(prod, ['CFOP'])),
      vlItem: normalizeMoney(getTextPath(prod, ['vProd'])),
      cstPis: extractXmlTaxCst(imposto, 'PIS'),
      cstCofins: extractXmlTaxCst(imposto, 'COFINS'),
    };
    item.lookupKeys = makeItemLookupKeys(item);
    item.uid = `xml:${fileName || 'xml'}:${note.chave || note.numero || 'sem_chave'}:${note.items.length + 1}:${item.numItem || item.codItem || 'item'}`;
    note.items.push(item);
  }

  note.lookupKeys = makeXmlNoteKeys(note);
  return note;
}

function makeXmlNoteKeys(note) {
  const keys = [];
  if (note?.chave) {
    keys.push(`CHAVE|${note.chave}`);
  }
  const numero = normalizeDigits(note?.numero || '');
  const serie = normalizeDigits(note?.serie || '');
  if (numero) {
    keys.push(`NF|${serie || '-'}|${numero}`);
    keys.push(`NFE|${serie || '-'}|${numero}`);
  }
  return keys;
}

function extractXmlTaxCst(impostoNode, taxName) {
  if (!impostoNode) return '';
  const taxNode = getChildByLocalName(impostoNode, taxName);
  if (!taxNode) return '';
  const cstNode = findFirstDescendantByLocalName(taxNode, 'CST');
  return normalizeCst(getNodeText(cstNode));
}

async function expandFsistUploads(files) {
  const out = [];
  for (const file of files || []) {
    const name = String(file?.originalname || file?.filename || 'arquivo').trim();
    const ext = path.extname(name).toLowerCase();
    if (ext === '.xml') {
      out.push({
        name,
        buffer: Buffer.from(file.buffer || []),
      });
      continue;
    }

    if (ext === '.zip') {
      const zip = await JSZip.loadAsync(file.buffer || Buffer.from([]));
      const entries = Object.values(zip.files || {});
      for (const entry of entries) {
        if (!entry || entry.dir) continue;
        const entryExt = path.extname(entry.name || '').toLowerCase();
        if (entryExt !== '.xml') continue;
        const content = await entry.async('nodebuffer');
        out.push({
          name: entry.name || `${name}.xml`,
          buffer: Buffer.from(content),
        });
      }
      continue;
    }

    throw new Error(`Formato nao suportado em FSIST: ${name}. Envie XML ou ZIP.`);
  }
  return out;
}

function compareCst(xmlValue, spedValue) {
  const xml = normalizeCst(xmlValue);
  const sped = normalizeCst(spedValue);
  if (!xml && !sped) {
    return {
      status: 'SEM CST',
      includeRow: false,
    };
  }
  if (xml && sped) {
    return {
      status: xml === sped ? 'OK' : 'DIVERGENTE',
      includeRow: true,
    };
  }
  if (xml && !sped) {
    return {
      status: 'XML SEM CST NO SPED',
      includeRow: true,
    };
  }
  return {
    status: 'SPED SEM CST NO XML',
    includeRow: true,
  };
}

function buildMissingRows({ spedTypeLabel, xmlNotes, spedIndex }) {
  const rows = [];
  for (const xmlNote of xmlNotes) {
    const match = findByKeys(spedIndex, xmlNote.lookupKeys || []);
    if (match) continue;

    rows.push({
      tipoSped: spedTypeLabel,
      registro: xmlNote.isEntrada ? 'Entrada' : 'Saida',
      chave: xmlNote.chave || '',
      serie: xmlNote.serie || '',
      numero: xmlNote.numero || '',
      data: xmlNote.data || '',
      emitDoc: xmlNote.emitDoc || '',
      valor: xmlNote.valor || 0,
      arquivoFsist: xmlNote.sourceFile || '',
      observacao: 'Nota presente no FSIST e ausente no SPED.',
    });
  }
  return rows;
}

function buildComparisonRows({ spedTypeLabel, xmlNotes, spedIndex }) {
  const rows = [];
  const processedPairs = new Set();
  for (const xmlNote of xmlNotes) {
    const spedNote = findByKeys(spedIndex, xmlNote.lookupKeys || []);
    if (!spedNote) continue;

    const xmlItemIndex = new Map();
    const spedItemIndex = new Map();

    for (const item of xmlNote.items || []) {
      registerByKeys(xmlItemIndex, item.lookupKeys || [], item);
    }
    for (const item of spedNote.items || []) {
      registerByKeys(spedItemIndex, item.lookupKeys || [], item);
    }

    const unionKeys = new Set([
      ...Array.from(xmlItemIndex.keys()),
      ...Array.from(spedItemIndex.keys()),
    ]);

    for (const key of unionKeys) {
      const xmlItem = findByKeys(xmlItemIndex, [key]);
      const spedItem = findByKeys(spedItemIndex, [key]);
      const pairKey = `${xmlItem?.uid || `xml:${key}:missing`}|${spedItem?.uid || `sped:${key}:missing`}`;
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);
      const pis = compareCst(xmlItem?.cstPis || '', spedItem?.cstPis || '');
      const cofins = compareCst(xmlItem?.cstCofins || '', spedItem?.cstCofins || '');

      if (!xmlItem && !spedItem) continue;
      if (!pis.includeRow && !cofins.includeRow && xmlItem && spedItem) continue;

      const noteLookup = xmlNote.numero || xmlNote.chave || '-';
      rows.push({
        tipoSped: spedTypeLabel,
        registro: xmlNote.isEntrada ? 'Entrada' : 'Saida',
        chave: xmlNote.chave || '',
        serie: xmlNote.serie || '',
        numero: xmlNote.numero || '',
        itemXml: xmlItem?.numItem || '',
        itemSped: spedItem?.numItem || '',
        codItemXml: xmlItem?.codItem || '',
        codItemSped: spedItem?.codItem || '',
        cstPisXml: normalizeCst(xmlItem?.cstPis || ''),
        cstPisSped: normalizeCst(spedItem?.cstPis || ''),
        statusPis: pis.status,
        cstCofinsXml: normalizeCst(xmlItem?.cstCofins || ''),
        cstCofinsSped: normalizeCst(spedItem?.cstCofins || ''),
        statusCofins: cofins.status,
        valorXml: xmlItem?.vlItem ?? xmlNote.valor ?? 0,
        valorSped: spedItem?.vlItem ?? 0,
        observacao: buildComparisonObservation({
          xmlItem,
          spedItem,
          pisStatus: pis.status,
          cofinsStatus: cofins.status,
          noteLookup,
        }),
      });
    }
  }

  return rows;
}

function buildComparisonObservation({ xmlItem, spedItem, pisStatus, cofinsStatus, noteLookup }) {
  const parts = [];
  if (!xmlItem) parts.push('Item ausente no XML.');
  if (!spedItem) parts.push('Item ausente no SPED.');
  if (pisStatus !== 'OK' && pisStatus !== 'SEM CST') parts.push(`PIS: ${pisStatus}.`);
  if (cofinsStatus !== 'OK' && cofinsStatus !== 'SEM CST') parts.push(`COFINS: ${cofinsStatus}.`);
  if (parts.length === 0) parts.push(`Nota ${noteLookup} conferida com sucesso.`);
  return parts.join(' ');
}

function toSheetFromRows(rows, headers) {
  const data = [headers];
  for (const row of rows) {
    data.push(row);
  }
  return XLSX.utils.aoa_to_sheet(data);
}

function styleMoneyColumn(sheet, colIndex, totalRows) {
  if (!sheet) return;
  for (let row = 2; row <= totalRows; row += 1) {
    const ref = XLSX.utils.encode_cell({ c: colIndex, r: row - 1 });
    const cell = sheet[ref];
    if (!cell || typeof cell.v !== 'number') continue;
    cell.z = 'R$ #,##0.00';
  }
}

function buildWorkbook({ missingRows, comparisonRows }) {
  const missingHeaders = [
    'Tipo SPED',
    'Registro',
    'Chave',
    'Serie',
    'Numero',
    'Data',
    'CNPJ/CPF Emitente',
    'Valor XML',
    'Arquivo FSIST',
    'Observacao',
  ];

  const comparisonHeaders = [
    'Tipo SPED',
    'Registro',
    'Chave',
    'Serie',
    'Numero',
    'Item XML',
    'Item SPED',
    'Codigo Item XML',
    'Codigo Item SPED',
    'CST PIS XML',
    'CST PIS SPED',
    'Status PIS',
    'CST COFINS XML',
    'CST COFINS SPED',
    'Status COFINS',
    'Valor XML',
    'Valor SPED',
    'Observacao',
  ];

  const missingAoA = missingRows.map((row) => [
    row.tipoSped,
    row.registro,
    row.chave,
    row.serie,
    row.numero,
    row.data,
    row.emitDoc,
    row.valor,
    row.arquivoFsist,
    row.observacao,
  ]);

  const comparisonAoA = comparisonRows.map((row) => [
    row.tipoSped,
    row.registro,
    row.chave,
    row.serie,
    row.numero,
    row.itemXml,
    row.itemSped,
    row.codItemXml,
    row.codItemSped,
    row.cstPisXml,
    row.cstPisSped,
    row.statusPis,
    row.cstCofinsXml,
    row.cstCofinsSped,
    row.statusCofins,
    row.valorXml,
    row.valorSped,
    row.observacao,
  ]);

  const wsMissing = toSheetFromRows(missingAoA, missingHeaders);
  const wsComparison = toSheetFromRows(comparisonAoA, comparisonHeaders);
  wsMissing['!cols'] = [
    { wch: 16 },
    { wch: 12 },
    { wch: 44 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
    { wch: 28 },
    { wch: 36 },
  ];
  wsComparison['!cols'] = [
    { wch: 16 },
    { wch: 12 },
    { wch: 44 },
    { wch: 8 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 20 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 36 },
  ];

  styleMoneyColumn(wsMissing, 7, missingRows.length + 1);
  styleMoneyColumn(wsComparison, 15, comparisonRows.length + 1);
  styleMoneyColumn(wsComparison, 16, comparisonRows.length + 1);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMissing, 'Notas faltantes');
  XLSX.utils.book_append_sheet(wb, wsComparison, 'CST comparacoes');
  return wb;
}

function buildSummary({ xmlNotes, spedResult, missingRows, comparisonRows, ignoredXmlFiles, ignoredXmlEntries }) {
  const pisMismatchCount = comparisonRows.filter((row) => row.statusPis !== 'OK' && row.statusPis !== 'SEM CST').length;
  const cofinsMismatchCount = comparisonRows.filter((row) => row.statusCofins !== 'OK' && row.statusCofins !== 'SEM CST').length;

  return {
    tipoSpedDetectado: spedResult.label,
    totalXmlArquivos: ignoredXmlFiles.totalFiles,
    totalXmlEntradasLidas: xmlNotes.length,
    totalXmlSaidasIgnoradas: ignoredXmlEntries,
    totalNotasSPEDEntradas: spedResult.notes.length,
    totalNotasFaltantes: missingRows.length,
    totalComparacoesCst: comparisonRows.length,
    totalDivergenciasPis: pisMismatchCount,
    totalDivergenciasCofins: cofinsMismatchCount,
  };
}

async function processarComparadorFsistSped({
  spedBuffer,
  spedFileName,
  fsistFiles,
  tipoSped = 'auto',
}) {
  if (!spedBuffer || !Buffer.from(spedBuffer).length) {
    throw new Error('Selecione o arquivo TXT do SPED.');
  }
  if (!Array.isArray(fsistFiles) || fsistFiles.length === 0) {
    throw new Error('Selecione ao menos um XML ou ZIP do FSIST.');
  }

  const spedResult = parseSpedTxt(spedBuffer, tipoSped);
  if (!spedResult.notes.length) {
    throw new Error(buildNoEntryNotesError(spedResult));
  }

  const expandedXmlFiles = await expandFsistUploads(fsistFiles);
  if (!expandedXmlFiles.length) {
    throw new Error('Nenhum XML valido foi encontrado no lote FSIST.');
  }

  const parsedXmlNotes = [];
  let ignoredXmlEntries = 0;
  for (const file of expandedXmlFiles) {
    const note = parseXmlNote(file.buffer, file.name);
    if (!note) continue;
    if (!note.isEntrada) {
      ignoredXmlEntries += 1;
      continue;
    }
    parsedXmlNotes.push(note);
  }

  if (!parsedXmlNotes.length) {
    throw new Error('Nenhum XML de entrada foi identificado no lote FSIST.');
  }

  const missingRows = buildMissingRows({
    spedTypeLabel: spedResult.label,
    xmlNotes: parsedXmlNotes,
    spedIndex: spedResult.index,
  });

  const comparisonRows = buildComparisonRows({
    spedTypeLabel: spedResult.label,
    xmlNotes: parsedXmlNotes,
    spedIndex: spedResult.index,
  });

  const summary = buildSummary({
    xmlNotes: parsedXmlNotes,
    spedResult,
    missingRows,
    comparisonRows,
    ignoredXmlFiles: { totalFiles: expandedXmlFiles.length },
    ignoredXmlEntries,
  });

  const workbook = buildWorkbook({
    missingRows,
    comparisonRows,
  });

  const xlsxBytes = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer',
    cellDates: true,
    compression: true,
  });

  const baseName = sanitizeFileName(
    `${String(spedFileName || 'comparador_fsist_sped').replace(/\.txt$/i, '')}_FSIST_x_SPED`,
  );

  return {
    resumo: summary,
    arquivo_saida: `${baseName}.xlsx`,
    xlsx_bytes: xlsxBytes,
    notas_faltantes: missingRows,
    comparacoes_cst: comparisonRows,
    xml_ignorados_saida: ignoredXmlEntries,
    sped_type: spedResult.spedType,
  };
}

function sanitizeFileName(value) {
  return String(value || 'comparador_fsist_sped')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

module.exports = {
  processarComparadorFsistSped,
  detectSpedTypeFromText,
  normalizeOutputType,
  SPED_CONFIGS,
};
