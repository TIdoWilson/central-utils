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
    normalizeDeclarantPayload,
    normalizeDeclarationRows,
    mapDeclarantDbRow,
    todayYmd,
  };
};
