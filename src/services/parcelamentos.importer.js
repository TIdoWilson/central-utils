const XLSX = require('xlsx');

const CNPJ_LENGTH = 14;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function truncateText(value, maxLength = 4000) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function parseSheetDate(sheetName) {
  const raw = String(sheetName || '').trim();
  const match = raw.match(/^(\d{2})\.(\d{2}|\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const year = match[2].length === 2 ? Number(`20${match[2]}`) : Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(year) || year < 1900) return null;

  return new Date(Date.UTC(year, month - 1, 1));
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function safeSheetName(sheetName) {
  return String(sheetName || '').trim();
}

function isHeaderRow(row) {
  const first = normalizeText(row?.[0]);
  const second = normalizeText(row?.[1]);
  return first.includes('empresa / pessoa fisica') || second === 'cpf/cnpj';
}

function isDebitAccount(envio, parcelamento, obs) {
  const envioText = normalizeText(envio);
  const parcelamentoText = normalizeText(parcelamento);
  const obsText = normalizeText(obs);
  return /debito em conta|debito no banco/.test(envioText)
    || /debito em conta|debito no banco/.test(parcelamentoText)
    || /debito em conta|debito no banco/.test(obsText);
}

function parseParcelamento(rawValue) {
  const raw = String(rawValue || '').replace(/\s+/g, ' ').trim();
  if (!raw) {
    return { type: '', number: 'S/N' };
  }

  const explicitMatch = raw.match(/^(.*?)(?:\bN[°ºo]?\s*)?(\d[\d./-]*)$/i);
  if (explicitMatch) {
    const type = explicitMatch[1].replace(/[-:]+$/, '').trim();
    const number = explicitMatch[2].trim();
    if (type) return { type, number: number || 'S/N' };
  }

  const nMarkerMatch = raw.match(/^(.*?)(?:\bN[°ºo]?\s*)(\d[\d./-]*)$/i);
  if (nMarkerMatch) {
    const type = nMarkerMatch[1].replace(/[-:]+$/, '').trim();
    const number = nMarkerMatch[2].trim();
    if (type) return { type, number: number || 'S/N' };
  }

  return {
    type: raw,
    number: 'S/N',
  };
}

function mergeObservations(existing, incoming, rawParcelamento, sheetName) {
  const values = [];
  const add = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    if (!values.includes(text)) values.push(text);
  };

  add(existing);
  add(incoming);

  const raw = String(rawParcelamento || '').trim();
  const sheet = safeSheetName(sheetName);
  if (raw) {
    add(`Parcelamento original: ${raw}`);
  }
  if (sheet) {
    add(`Fonte planilha: ${sheet}`);
  }

  return truncateText(values.join(' | '), 4000);
}

function getWorksheetOffset(header) {
  const first = normalizeText(header?.[0]);
  if (!first) return 0;
  if (first.startsWith('cod')) return 1;
  if (first.includes('codigo')) return 1;
  return 0;
}

function buildImportPlanFromWorkbook(workbook) {
  const latestByKey = new Map();
  const sheetNames = workbook?.SheetNames || [];

  for (const sheetName of sheetNames) {
    const monthDate = parseSheetDate(safeSheetName(sheetName));
    const ws = workbook?.Sheets?.[sheetName];
    if (!ws || !monthDate) continue;

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) continue;

    const offset = getWorksheetOffset(rows[0] || []);

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      if (!row.some((cell) => String(cell || '').trim() !== '')) continue;
      if (isHeaderRow(row)) continue;

      const companyName = String(row[offset] || '').trim();
      const cnpj = normalizeDigits(row[offset + 1]);
      const envio = row[offset + 2];
      const parcelamentoRaw = String(row[offset + 3] || '').trim();
      const observationRaw = String(row[offset + 4] || '').trim();
      if (!companyName && !cnpj && !parcelamentoRaw) continue;

      const parsed = parseParcelamento(parcelamentoRaw);
      const key = [
        normalizeText(companyName),
        cnpj,
        normalizeText(parsed.type || parcelamentoRaw),
        normalizeText(parsed.number),
      ].join('|');

      const candidate = {
        companyName,
        cnpj,
        parcelamentoType: parsed.type || parcelamentoRaw || 'Parcelamento',
        parcelamentoNumber: parsed.number || 'S/N',
        startDate: formatIsoDate(monthDate),
        debitAccount: isDebitAccount(envio, parcelamentoRaw, observationRaw),
        observations: mergeObservations('', observationRaw, parcelamentoRaw, safeSheetName(sheetName)),
        sourceSheet: safeSheetName(sheetName),
        sourceRow: i + 1,
        rawParcelamento: parcelamentoRaw,
        monthValue: monthDate.getTime(),
      };

      const existing = latestByKey.get(key);
      if (!existing) {
        latestByKey.set(key, candidate);
        continue;
      }

      if (
        candidate.monthValue > existing.monthValue
        || (candidate.monthValue === existing.monthValue && candidate.sourceRow > existing.sourceRow)
      ) {
        candidate.observations = mergeObservations(existing.observations, observationRaw, parcelamentoRaw, safeSheetName(sheetName));
        candidate.debitAccount = existing.debitAccount || candidate.debitAccount;
        latestByKey.set(key, candidate);
        continue;
      }

      existing.debitAccount = existing.debitAccount || candidate.debitAccount;
      existing.observations = mergeObservations(existing.observations, observationRaw, parcelamentoRaw, safeSheetName(sheetName));
      latestByKey.set(key, existing);
    }
  }

  const items = [...latestByKey.values()]
    .map((item) => ({
      companyName: item.companyName,
      cnpj: item.cnpj,
      parcelamentoType: item.parcelamentoType,
      parcelamentoNumber: item.parcelamentoNumber,
      startDate: item.startDate,
      debitAccount: !!item.debitAccount,
      observations: truncateText(item.observations || '', 4000),
      sourceSheet: item.sourceSheet,
      sourceRow: item.sourceRow,
      rawParcelamento: item.rawParcelamento,
    }))
    .sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1;
      return a.companyName.localeCompare(b.companyName, 'pt-BR');
    });

  return {
    items,
    summary: {
      sheets: sheetNames.length,
      records: items.length,
    },
  };
}

function buildImportPlanFromBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return buildImportPlanFromWorkbook(workbook);
}

function buildImportPlanFromFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  return buildImportPlanFromWorkbook(workbook);
}

module.exports = {
  CNPJ_LENGTH,
  normalizeText,
  normalizeDigits,
  truncateText,
  parseSheetDate,
  formatIsoDate,
  safeSheetName,
  isHeaderRow,
  isDebitAccount,
  parseParcelamento,
  mergeObservations,
  getWorksheetOffset,
  buildImportPlanFromWorkbook,
  buildImportPlanFromBuffer,
  buildImportPlanFromFile,
};
