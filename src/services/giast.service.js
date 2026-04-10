const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function sanitizeText(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

function normalizeCnpj(value) {
  const digits = onlyDigits(value);
  return digits.length === 14 ? digits : null;
}

function normalizeCpf(value) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  return digits.slice(0, 11).padStart(11, '0');
}

function normalizeUf(value) {
  const uf = String(value || '').trim().toUpperCase();
  return UFS.includes(uf) ? uf : null;
}

function normalizeYmdDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let year = '';
  let month = '';
  let day = '';

  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    year = m[1];
    month = m[2];
    day = m[3];
  } else {
    m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      day = m[1];
      month = m[2];
      year = m[3];
    } else {
      m = raw.match(/^(\d{8})$/);
      if (m) {
        year = m[1].slice(0, 4);
        month = m[1].slice(4, 6);
        day = m[1].slice(6, 8);
      } else {
        return null;
      }
    }
  }

  const iso = `${year}-${month}-${day}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function normalizePeriodRef(value) {
  const digits = onlyDigits(value || '');
  if (digits.length !== 6) return null;
  const month = Number(digits.slice(0, 2));
  const year = Number(digits.slice(2));
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(year) || year < 2000 || year > 2199) return null;
  return digits;
}

function parseMoney(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Number(value.toFixed(2));
  }

  const raw = String(value).trim();
  if (!raw) return null;

  let normalized = raw.replace(/\s+/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }

  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return null;
  return Number(num.toFixed(2));
}

function decodeSpedContent(input) {
  if (Buffer.isBuffer(input)) {
    const utf8 = input.toString('utf8').replace(/^\uFEFF/, '');
    if (!utf8.includes('\uFFFD')) return utf8;
    return input.toString('latin1').replace(/^\uFEFF/, '');
  }
  return String(input || '').replace(/^\uFEFF/, '');
}

function splitSpedLine(line) {
  const raw = String(line || '').trim();
  if (!raw || !raw.startsWith('|')) return null;

  const parts = raw.split('|');
  if (parts[0] === '') parts.shift();
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  if (!parts.length) return null;

  return parts;
}

function parseSpedDate(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 8) return null;

  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  const iso = `${year}-${month}-${day}`;
  const dt = new Date(`${iso}T00:00:00Z`);

  if (Number.isNaN(dt.getTime())) return null;
  if (dt.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function periodRefFromIsoDate(isoDate) {
  const iso = String(isoDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return `${iso.slice(5, 7)}${iso.slice(0, 4)}`;
}

function parseSpedMoney(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const parsed = parseMoney(raw);
  return parsed === null ? 0 : parsed;
}

function normalizeStateRegistration(value) {
  const cleaned = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 20);
  return cleaned;
}

function normalizeStateRegistrations(input) {
  const source = (input && typeof input === 'object') ? input : {};
  const result = {};

  for (const uf of UFS) {
    const raw = source[uf] ?? source[uf.toLowerCase()] ?? '';
    const ie = normalizeStateRegistration(raw);
    if (ie) {
      result[uf] = ie;
    }
  }

  return result;
}

function mergeStateRegistrations(existingInput, fromSpedInput) {
  const existing = normalizeStateRegistrations(existingInput || {});
  const fromSped = normalizeStateRegistrations(fromSpedInput || {});
  const merged = { ...existing };

  for (const uf of UFS) {
    if (merged[uf]) continue;
    if (fromSped[uf]) merged[uf] = fromSped[uf];
  }

  return merged;
}

function parseSpedImport(input) {
  const text = decodeSpedContent(input);
  if (!String(text || '').trim()) {
    throw new Error('Arquivo SPED vazio ou invalido.');
  }

  const stateRegistrationsFrom0015 = {};
  const rowsByUf = new Map();
  const warnings = [];
  const lines = text.split(/\r?\n/);

  let periodRef = null;
  let defaultDueDate = null;
  let pendingE300 = null;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const parts = splitSpedLine(lines[idx]);
    if (!parts) continue;

    const reg = String(parts[0] || '').toUpperCase();

    if (reg === '0000') {
      const dtIni = parseSpedDate(parts[3]);
      const dtFin = parseSpedDate(parts[4]);
      periodRef = periodRef || periodRefFromIsoDate(dtIni) || periodRefFromIsoDate(dtFin);
      defaultDueDate = defaultDueDate || dtFin || dtIni || null;
      continue;
    }

    if (reg === '0015') {
      const uf = normalizeUf(parts[1]);
      const ie = normalizeStateRegistration(parts[2]);
      if (uf && ie) stateRegistrationsFrom0015[uf] = ie;
      continue;
    }

    if (reg === 'E300') {
      pendingE300 = {
        uf: normalizeUf(parts[1]),
        dtIni: parseSpedDate(parts[2]),
        dtFin: parseSpedDate(parts[3]),
      };
      defaultDueDate = defaultDueDate || pendingE300.dtFin || pendingE300.dtIni || null;
      continue;
    }

    if (reg === 'E310') {
      if (!pendingE300?.uf) {
        warnings.push(`Linha ${idx + 1}: E310 sem E300 valido anterior. Registro ignorado.`);
        continue;
      }

      const valueIcms = parseSpedMoney(parts[9]); // VL_RECOL_DIFAL
      const valueFcp = parseSpedMoney(parts[19]); // VL_RECOL_FCP
      const valueDevolutions = parseSpedMoney(parts[8]); // VL_DEDUCOES_DIFAL
      const valuePrepayments = parseSpedMoney(parts[11]); // DEB_ESP_DIFAL
      const uf = pendingE300.uf;
      const prev = rowsByUf.get(uf) || {
        uf,
        dueDate: pendingE300.dtFin || pendingE300.dtIni || defaultDueDate || todayYmd(),
        valueIcms: 0,
        valueFcp: 0,
        valueDevolutions: 0,
        valuePrepayments: 0,
      };

      prev.dueDate = pendingE300.dtFin || pendingE300.dtIni || prev.dueDate;
      prev.valueIcms = Number((prev.valueIcms + valueIcms).toFixed(2));
      prev.valueFcp = Number((prev.valueFcp + valueFcp).toFixed(2));
      prev.valueDevolutions = Number((prev.valueDevolutions + valueDevolutions).toFixed(2));
      prev.valuePrepayments = Number((prev.valuePrepayments + valuePrepayments).toFixed(2));

      rowsByUf.set(uf, prev);
      pendingE300 = null;
    }
  }

  const rows = Array.from(rowsByUf.values()).sort((a, b) => a.uf.localeCompare(b.uf));
  if (!periodRef) {
    warnings.push('Nao foi possivel identificar o periodo no registro 0000.');
  }

  return {
    periodRef: periodRef || null,
    defaultDueDate: defaultDueDate || null,
    stateRegistrationsFrom0015,
    rows,
    warnings,
  };
}

function mapDeclarantDbRow(row) {
  const stateRegs = {};
  const fromDb = row?.state_regs;
  if (fromDb && typeof fromDb === 'object') {
    for (const [ufKey, ieValue] of Object.entries(fromDb)) {
      const uf = normalizeUf(ufKey);
      const ie = normalizeStateRegistration(ieValue);
      if (!uf || !ie) continue;
      stateRegs[uf] = ie;
    }
  }

  const parsedSigningDate = row?.signing_date ? new Date(row.signing_date) : null;
  const signingDate = (
    parsedSigningDate
    && !Number.isNaN(parsedSigningDate.getTime())
  )
    ? parsedSigningDate.toISOString().slice(0, 10)
    : null;

  return {
    id: Number(row?.id || 0),
    name: String(row?.name || ''),
    cnpj: String(row?.cnpj || ''),
    cpf: String(row?.cpf || ''),
    roleTitle: String(row?.role_title || ''),
    phoneDdd: String(row?.phone_ddd || ''),
    phoneNumber: String(row?.phone_number || ''),
    faxDdd: String(row?.fax_ddd || ''),
    faxNumber: String(row?.fax_number || ''),
    email: String(row?.email || ''),
    signingCity: String(row?.signing_city || ''),
    signingDate,
    stateRegistrations: stateRegs,
  };
}

function normalizeDeclarantPayload(payload) {
  const normalized = {
    name: sanitizeText(payload?.name || payload?.nomeDeclarante || payload?.declarante, 140),
    cnpj: normalizeCnpj(payload?.cnpj),
    cpf: normalizeCpf(payload?.cpf),
    roleTitle: sanitizeText(payload?.roleTitle || payload?.cargo, 60),
    phoneDdd: onlyDigits(payload?.phoneDdd || payload?.telefoneDdd).slice(0, 4),
    phoneNumber: onlyDigits(payload?.phoneNumber || payload?.telefoneNumero).slice(0, 9),
    faxDdd: onlyDigits(payload?.faxDdd).slice(0, 4),
    faxNumber: onlyDigits(payload?.faxNumber).slice(0, 9),
    email: sanitizeText(payload?.email, 120),
    signingCity: sanitizeText(payload?.signingCity || payload?.local || payload?.localAssinatura, 60),
    signingDate: normalizeYmdDate(payload?.signingDate || payload?.dataAssinatura || payload?.data),
    stateRegistrations: normalizeStateRegistrations(payload?.stateRegistrations || payload?.inscricoesEstaduais || {}),
  };

  if (!normalized.name) {
    throw new Error('Informe o nome do declarante.');
  }
  if (!normalized.cnpj) {
    throw new Error('Informe um CNPJ valido com 14 digitos.');
  }

  return normalized;
}

function normalizeDeclarationRows(rowsInput) {
  if (!Array.isArray(rowsInput) || rowsInput.length === 0) {
    throw new Error('Inclua ao menos uma UF para gerar o arquivo.');
  }

  const rows = [];
  const seenUf = new Set();

  for (let idx = 0; idx < rowsInput.length; idx += 1) {
    const raw = rowsInput[idx] || {};
    const line = idx + 1;

    const uf = normalizeUf(raw.uf);
    if (!uf) {
      throw new Error(`Linha ${line}: UF invalida.`);
    }
    if (seenUf.has(uf)) {
      throw new Error(`Linha ${line}: UF ${uf} repetida.`);
    }
    seenUf.add(uf);

    const dueDate = normalizeYmdDate(raw.dueDate || raw.dataVencimento || raw.data);
    if (!dueDate) {
      throw new Error(`Linha ${line}: data de vencimento invalida.`);
    }

    const valueIcms = parseMoney(raw.valueIcms ?? raw.valorDifal ?? raw.valorIcms);
    if (valueIcms === null) {
      throw new Error(`Linha ${line}: valor DIFAL invalido.`);
    }

    const rawFcp = raw.valueFcp ?? raw.valorFcp;
    const rawFcpText = String(rawFcp ?? '').trim();
    const valueFcp = rawFcpText ? parseMoney(rawFcpText) : 0;
    if (valueFcp === null) {
      throw new Error(`Linha ${line}: valor FCP invalido.`);
    }

    const rawDevolutions = raw.valueDevolutions ?? raw.valorDevolucoes ?? raw.devolucoesAnulacoes;
    const rawDevolutionsText = String(rawDevolutions ?? '').trim();
    const valueDevolutions = rawDevolutionsText ? parseMoney(rawDevolutionsText) : 0;
    if (valueDevolutions === null) {
      throw new Error(`Linha ${line}: devolucoes/anulacoes invalido.`);
    }

    const rawPrepayments = raw.valuePrepayments ?? raw.valorPagamentosAntecipados ?? raw.pagamentosAntecipados;
    const rawPrepaymentsText = String(rawPrepayments ?? '').trim();
    const valuePrepayments = rawPrepaymentsText ? parseMoney(rawPrepaymentsText) : 0;
    if (valuePrepayments === null) {
      throw new Error(`Linha ${line}: pagamentos antecipados invalido.`);
    }

    rows.push({
      uf,
      dueDate,
      valueIcms,
      valueFcp,
      valueDevolutions,
      valuePrepayments,
    });
  }

  return rows;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = function createGiastService() {
  return {
    UFS,
    onlyDigits,
    normalizeCnpj,
    normalizeCpf,
    normalizeUf,
    normalizeYmdDate,
    normalizePeriodRef,
    parseMoney,
    normalizeStateRegistrations,
    mergeStateRegistrations,
    normalizeDeclarantPayload,
    normalizeDeclarationRows,
    parseSpedImport,
    mapDeclarantDbRow,
    todayYmd,
  };
};
