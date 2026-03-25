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

function isExportHeaderRow(row) {
  const cells = (row || []).map((cell) => normalizeText(cell));
  return cells[0] === 'cnpj'
    && cells[1].includes('empresa')
    && cells[2] === 'tipo'
    && cells[3] === 'numero';
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

  const numberMarker = '(?:N(?:[\\u00b0\\u00bao])?\\s*)?';
  const numericSuffix = '(\\d[\\d./-]*)$';

  const explicitMatch = raw.match(new RegExp(`^(.*?)${numberMarker}${numericSuffix}`, 'i'));
  if (explicitMatch) {
    const type = explicitMatch[1].replace(/[-:]+$/, '').trim();
    const number = explicitMatch[2].trim();
    if (type) return { type, number: number || 'S/N' };
  }

  const nMarkerMatch = raw.match(new RegExp(`^(.*?)${numberMarker}(\\d[\\d./-]*)$`, 'i'));
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

function mergeObservations(existing, incoming) {
  const values = [];
  const add = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    if (!values.includes(text)) values.push(text);
  };

  add(existing);
  add(incoming);

  return truncateText(values.join(' | '), 4000);
}

function getWorksheetOffset(header) {
  const first = normalizeText(header?.[0]);
  if (!first) return 0;
  if (first.startsWith('cod')) return 1;
  if (first.includes('codigo')) return 1;
  return 0;
}

function getDefaultStartDateIso() {
  return formatIsoDate(new Date());
}

function buildImportPlanFromWorkbook(workbook) {
  const latestByKey = new Map();
  const sheetNames = workbook?.SheetNames || [];

  for (const sheetName of sheetNames) {
    const ws = workbook?.Sheets?.[sheetName];
    if (!ws) continue;

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) continue;

    const header = rows[0] || [];
    const exportFormat = isExportHeaderRow(header);
    const monthDate = exportFormat ? null : parseSheetDate(safeSheetName(sheetName));
    const offset = exportFormat ? 0 : getWorksheetOffset(header);

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      if (!row.some((cell) => String(cell || '').trim() !== '')) continue;
      if (exportFormat) {
        if (i === 0) continue;
        const cnpj = normalizeDigits(row[0]);
        const companyName = String(row[1] || '').trim();
        const parcelamentoType = String(row[2] || '').trim();
        const parcelamentoNumber = String(row[3] || '').trim() || 'S/N';
        const payment = row[4];
        const observationRaw = String(row[5] || '').trim();
        if (!companyName && !cnpj && !parcelamentoType && !parcelamentoNumber) continue;

        const key = [
          normalizeText(companyName),
          cnpj,
          normalizeText(parcelamentoType),
          normalizeText(parcelamentoNumber),
        ].join('|');

        const candidate = {
          companyName,
          cnpj,
          parcelamentoType: parcelamentoType || 'Parcelamento',
          parcelamentoNumber,
          startDate: getDefaultStartDateIso(),
          debitAccount: isDebitAccount(payment, parcelamentoType, observationRaw),
          observations: truncateText(observationRaw, 4000),
          sourceSheet: safeSheetName(sheetName),
          sourceRow: i + 1,
          rawParcelamento: parcelamentoType,
          monthValue: Date.now(),
        };

        const existing = latestByKey.get(key);
        if (!existing || candidate.sourceRow >= existing.sourceRow) {
          latestByKey.set(key, candidate);
        }
        continue;
      }

      if (!monthDate || isHeaderRow(row)) continue;

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
        observations: mergeObservations('', observationRaw),
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
        candidate.observations = mergeObservations(existing.observations, observationRaw);
        candidate.debitAccount = existing.debitAccount || candidate.debitAccount;
        latestByKey.set(key, candidate);
        continue;
      }

      existing.debitAccount = existing.debitAccount || candidate.debitAccount;
      existing.observations = mergeObservations(existing.observations, observationRaw);
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
