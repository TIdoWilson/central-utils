(function (global) {
  'use strict';

  const formulaCache = new Map();

  function columnNumberToName(columnNumber) {
    let value = columnNumber + 1;
    let name = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function columnNameToNumber(columnName) {
    let result = 0;
    for (let index = 0; index < columnName.length; index += 1) {
      result = (result * 26) + (columnName.charCodeAt(index) - 64);
    }
    return result - 1;
  }

  function encodeAddress(rowIndex, colIndex) {
    return `${columnNumberToName(colIndex)}${rowIndex + 1}`;
  }

  function decodeAddress(address) {
    const match = /^([A-Z]+)(\d+)$/.exec(String(address || '').toUpperCase());
    if (!match) {
      throw new Error(`Endereco invalido: ${address}`);
    }
    return {
      row: Number(match[2]) - 1,
      col: columnNameToNumber(match[1]),
    };
  }

  function expandRange(rangeRef) {
    const [startRef, endRef] = String(rangeRef || '').toUpperCase().split(':');
    const start = decodeAddress(startRef);
    const end = decodeAddress(endRef);
    const refs = [];
    for (let row = start.row; row <= end.row; row += 1) {
      for (let col = start.col; col <= end.col; col += 1) {
        refs.push(encodeAddress(row, col));
      }
    }
    return refs;
  }

  function isDateLikeDisplay(displayValue) {
    return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(displayValue || '').trim());
  }

  function toNumber(value) {
    if (value === null || typeof value === 'undefined' || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    const normalized = String(value).trim().replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function cloneCell(cellDefinition) {
    return {
      value: cellDefinition.v,
      display: cellDefinition.w,
      type: cellDefinition.t,
      formula: cellDefinition.f,
      editable: Boolean(cellDefinition.editable),
      fill: cellDefinition.fill || 'default',
      format: cellDefinition.format || { type: 'text' },
      computedValue: cellDefinition.v,
      hasError: false,
    };
  }

  function createWorkbookState(data) {
    const workbook = {
      meta: {
        sourceFile: data.sourceFile,
        generatedAt: data.generatedAt,
      },
      sheetOrder: Array.isArray(data.sheetOrder) ? data.sheetOrder.slice() : [],
      sheets: {},
    };

    Object.entries(data.sheets || {}).forEach(([sheetName, sheetDefinition]) => {
      const cells = {};
      Object.entries(sheetDefinition.cells || {}).forEach(([address, cellDefinition]) => {
        cells[address] = cloneCell(cellDefinition);
      });

      workbook.sheets[sheetName] = {
        definition: sheetDefinition,
        cells,
      };
    });

    return workbook;
  }

  function compileFormula(formula) {
    if (formulaCache.has(formula)) {
      return formulaCache.get(formula);
    }

    if (!formula || /#REF!/.test(formula)) {
      const unsupported = {
        error: 'Formula invalida na planilha',
      };
      formulaCache.set(formula, unsupported);
      return unsupported;
    }

    let expression = String(formula).replace(/\$/g, '');
    expression = expression.replace(/<>/g, '!=');
    expression = expression.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');

    const ranges = [];
    expression = expression.replace(/\b([A-Z]{1,3}\d+:[A-Z]{1,3}\d+)\b/g, (_, rangeRef) => {
      const placeholder = `__RANGE_${ranges.length}__`;
      ranges.push(rangeRef);
      return placeholder;
    });

    expression = expression.replace(/\bIF\s*\(/g, 'fn.IF(');
    expression = expression.replace(/\bSUM\s*\(/g, 'fn.SUM(');
    expression = expression.replace(/\bMIN\s*\(/g, 'fn.MIN(');
    expression = expression.replace(/\bMAX\s*\(/g, 'fn.MAX(');

    expression = expression.replace(/\b([A-Z]{1,3}\d+)\b/g, (_, ref) => `get("${ref}")`);

    expression = expression.replace(/__RANGE_(\d+)__/g, (_, index) => `range("${ranges[Number(index)]}")`);

    const compiled = {
      run: new Function('get', 'range', 'fn', `return ${expression};`),
    };
    formulaCache.set(formula, compiled);
    return compiled;
  }

  function getSheetState(workbookState, sheetName) {
    const sheetState = workbookState.sheets[sheetName];
    if (!sheetState) {
      throw new Error(`Aba nao encontrada: ${sheetName}`);
    }
    return sheetState;
  }

  function getCellState(workbookState, sheetName, address) {
    const sheetState = getSheetState(workbookState, sheetName);
    if (!sheetState.cells[address]) {
      sheetState.cells[address] = {
        value: null,
        display: '',
        type: 'z',
        formula: null,
        editable: false,
        fill: 'default',
        format: { type: 'text' },
        computedValue: null,
        hasError: false,
      };
    }
    return sheetState.cells[address];
  }

  function evaluateCell(workbookState, sheetName, address, stack) {
    const cellState = getCellState(workbookState, sheetName, address);

    if (!cellState.formula) {
      cellState.computedValue = cellState.value;
      cellState.hasError = false;
      return cellState.computedValue;
    }

    if (stack.includes(address)) {
      cellState.computedValue = '#CIRC!';
      cellState.hasError = true;
      return cellState.computedValue;
    }

    const compiled = compileFormula(cellState.formula);
    if (compiled.error) {
      cellState.computedValue = cellState.display || '#REF!';
      cellState.hasError = true;
      return cellState.computedValue;
    }

    const nextStack = stack.concat(address);
    const get = (ref) => evaluateCell(workbookState, sheetName, ref, nextStack);
    const range = (rangeRef) => expandRange(rangeRef).map((ref) => evaluateCell(workbookState, sheetName, ref, nextStack));
    const fn = {
      IF: (condition, whenTrue, whenFalse) => (condition ? whenTrue : whenFalse),
      SUM: (...args) => flatten(args).reduce((total, value) => total + toNumber(value), 0),
      MIN: (...args) => Math.min(...flatten(args).map((value) => toNumber(value))),
      MAX: (...args) => Math.max(...flatten(args).map((value) => toNumber(value))),
    };

    try {
      const value = compiled.run(get, range, fn);
      cellState.computedValue = value;
      cellState.hasError = false;
      return value;
    } catch (error) {
      cellState.computedValue = `#ERR: ${error.message}`;
      cellState.hasError = true;
      return cellState.computedValue;
    }
  }

  function flatten(items) {
    const flattened = [];
    items.forEach((item) => {
      if (Array.isArray(item)) {
        flattened.push(...flatten(item));
      } else {
        flattened.push(item);
      }
    });
    return flattened;
  }

  function recalculateSheet(workbookState, sheetName) {
    const sheetState = getSheetState(workbookState, sheetName);
    Object.keys(sheetState.cells).forEach((address) => {
      const cell = sheetState.cells[address];
      if (!cell.formula) {
        cell.computedValue = cell.value;
        cell.hasError = false;
      }
    });
    Object.keys(sheetState.cells).forEach((address) => {
      evaluateCell(workbookState, sheetName, address, []);
    });
    return sheetState;
  }

  function excelSerialToDate(serial) {
    const wholeDays = Math.floor(serial);
    const utcDays = wholeDays - 25569;
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fraction = serial - wholeDays;
    const totalSeconds = Math.round(fraction * 86400);
    dateInfo.setUTCSeconds(dateInfo.getUTCSeconds() + totalSeconds);
    return dateInfo;
  }

  function formatDate(serial) {
    if (!Number.isFinite(serial)) return '';
    const dateValue = excelSerialToDate(serial);
    if (Number.isNaN(dateValue.getTime())) return '';
    return dateValue.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  function formatPercent(value, decimals) {
    return `${(toNumber(value) * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}%`;
  }

  function formatNumber(value, decimals, zeroAsDash) {
    const numericValue = toNumber(value);
    if (zeroAsDash && numericValue === 0) return '-';
    return numericValue.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function getDisplayValue(workbookState, sheetName, address) {
    const cellState = getCellState(workbookState, sheetName, address);
    const rawValue = cellState.formula ? cellState.computedValue : cellState.value;

    if (rawValue === null || typeof rawValue === 'undefined') {
      return '';
    }

    if (typeof rawValue === 'string') {
      return rawValue;
    }

    if (typeof rawValue === 'boolean') {
      return rawValue ? 'VERDADEIRO' : 'FALSO';
    }

    if (typeof rawValue === 'number') {
      const originalDisplay = String(cellState.display || '').trim();
      const zeroAsDash = /^-+$/.test(originalDisplay);
      const formatInfo = cellState.format || { type: 'number', decimals: 0 };

      if (formatInfo.type === 'date' || isDateLikeDisplay(originalDisplay)) {
        return formatDate(rawValue);
      }
      if (formatInfo.type === 'percent') {
        return formatPercent(rawValue, formatInfo.decimals || 0);
      }
      return formatNumber(rawValue, formatInfo.decimals || 0, zeroAsDash);
    }

    return String(rawValue);
  }

  function getInputValue(workbookState, sheetName, address) {
    const cellState = getCellState(workbookState, sheetName, address);
    if (cellState.value === null || typeof cellState.value === 'undefined') {
      return '';
    }
    if (typeof cellState.value === 'number') {
      if (cellState.format && cellState.format.type === 'date') {
        return formatDate(cellState.value);
      }
      return String(cellState.value).replace('.', ',');
    }
    return String(cellState.value);
  }

  function parseDateInput(value) {
    const trimmed = String(value || '').trim();
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const dateValue = new Date(Date.UTC(year, month, day));
    if (Number.isNaN(dateValue.getTime())) return null;
    return Math.round((dateValue.getTime() / 86400000) + 25569);
  }

  function setEditableValue(workbookState, sheetName, address, newValue) {
    const cellState = getCellState(workbookState, sheetName, address);
    if (!cellState.editable) return;

    const trimmed = String(newValue || '').trim();
    if (!trimmed) {
      cellState.value = null;
      return;
    }

    const formatInfo = cellState.format || { type: 'text' };
    if (formatInfo.type === 'date') {
      const serial = parseDateInput(trimmed);
      cellState.value = serial === null ? trimmed : serial;
      return;
    }

    if (cellState.type === 'n' || formatInfo.type === 'number' || formatInfo.type === 'percent') {
      const parsed = Number(trimmed.replace(/\./g, '').replace(',', '.'));
      cellState.value = Number.isFinite(parsed) ? parsed : trimmed;
      return;
    }

    cellState.value = trimmed;
  }

  function resetSheet(workbookState, sheetName) {
    const sheetState = getSheetState(workbookState, sheetName);
    Object.entries(sheetState.definition.cells || {}).forEach(([address, cellDefinition]) => {
      sheetState.cells[address] = cloneCell(cellDefinition);
    });
    return recalculateSheet(workbookState, sheetName);
  }

  const api = {
    createWorkbookState,
    recalculateSheet,
    getCellState,
    getDisplayValue,
    getInputValue,
    setEditableValue,
    resetSheet,
    encodeAddress,
    decodeAddress,
    expandRange,
    toNumber,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.CalculoSalarioCodexCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
