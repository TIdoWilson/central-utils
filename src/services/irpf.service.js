function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

const IRPF_RULES = [
  {
    id: '2024_mai23_jan24',
    periodoLabel: '2024 (tabela mai/2023–jan/2024)',
    deducaoDependente: 189.59,
    descontoSimplificadoLimite: 528.00,
    faixas: [
      { ate: 2112.00, aliquota: 0.0, parcela: 0.0 },
      { ate: 2826.65, aliquota: 0.075, parcela: 158.40 },
      { ate: 3751.05, aliquota: 0.15, parcela: 370.40 },
      { ate: 4664.68, aliquota: 0.225, parcela: 651.73 },
      { ate: Infinity, aliquota: 0.275, parcela: 884.96 },
    ],
  },
  {
    id: '2024_fev24_abr25',
    periodoLabel: '2024/2025 (tabela fev/2024–abr/2025)',
    deducaoDependente: 189.59,
    descontoSimplificadoLimite: 564.80,
    faixas: [
      { ate: 2259.20, aliquota: 0.0, parcela: 0.0 },
      { ate: 2826.65, aliquota: 0.075, parcela: 169.44 },
      { ate: 3751.05, aliquota: 0.15, parcela: 381.44 },
      { ate: 4664.68, aliquota: 0.225, parcela: 662.77 },
      { ate: Infinity, aliquota: 0.275, parcela: 896.00 },
    ],
  },
  {
    id: '2025_mai25_dez25',
    periodoLabel: '2025 (tabela a partir de 05/2025)',
    deducaoDependente: 189.59,
    descontoSimplificadoLimite: 607.20,
    faixas: [
      { ate: 2428.80, aliquota: 0.0, parcela: 0.0 },
      { ate: 2826.65, aliquota: 0.075, parcela: 182.16 },
      { ate: 3751.05, aliquota: 0.15, parcela: 394.16 },
      { ate: 4664.68, aliquota: 0.225, parcela: 675.49 },
      { ate: Infinity, aliquota: 0.275, parcela: 908.73 },
    ],
  },
  {
    id: '2026_jan_dez',
    periodoLabel: '2026 (isenção até 5k + redutor 5k–7.350)',
    deducaoDependente: 189.59,
    descontoSimplificadoLimite: 607.20,
    faixas: [
      { ate: 2428.80, aliquota: 0.0, parcela: 0.0 },
      { ate: 2826.65, aliquota: 0.075, parcela: 182.16 },
      { ate: 3751.05, aliquota: 0.15, parcela: 394.16 },
      { ate: 4664.68, aliquota: 0.225, parcela: 675.49 },
      { ate: Infinity, aliquota: 0.275, parcela: 908.73 },
    ],
    regra2026: {
      isentoAte: 5000.0,
      faixaRedutorAte: 7350.0,
      redutorConst: 978.62,
      redutorCoef: 0.133145,
    },
  },
];

function calcFaixa(base, regra) {
  const faixa = regra.faixas.find((f) => base <= f.ate) || regra.faixas[regra.faixas.length - 1];
  const imposto = Math.max(0, base * faixa.aliquota - faixa.parcela);
  return {
    aliquota: faixa.aliquota,
    parcelaADeduzir: faixa.parcela,
    imposto: round2(imposto),
  };
}

function calcDeducao(rendimentos, despesas, dependentes, regra) {
  const descontoSimplificado = Math.min(rendimentos * 0.2, regra.descontoSimplificadoLimite);
  const deducaoDependentes = dependentes * regra.deducaoDependente;
  const deducaoLegal = despesas + deducaoDependentes;

  const usarSimplificado = descontoSimplificado >= deducaoLegal;
  const deducaoUsada = usarSimplificado ? descontoSimplificado : deducaoLegal;

  return {
    tipo: usarSimplificado ? 'Desconto simplificado' : 'Deduções legais',
    valor: round2(deducaoUsada),
    descontoSimplificado: round2(descontoSimplificado),
    deducaoLegal: round2(deducaoLegal),
    deducaoDependentes: round2(deducaoDependentes),
  };
}

function applyRegra2026IfNeeded(rendimentosReferencia, impostoCalculado, regra) {
  if (!regra.regra2026) {
    return { impostoFinal: impostoCalculado, meta2026: null };
  }

  const r = regra.regra2026;
  if (rendimentosReferencia <= r.isentoAte) {
    return {
      impostoFinal: 0,
      meta2026: { redutorAplicado: round2(impostoCalculado), rendimentosReferencia: round2(rendimentosReferencia) },
    };
  }

  if (rendimentosReferencia <= r.faixaRedutorAte) {
    const redutor = Math.max(0, r.redutorConst - (r.redutorCoef * rendimentosReferencia));
    const impostoFinal = Math.max(0, impostoCalculado - redutor);
    return {
      impostoFinal: round2(impostoFinal),
      meta2026: {
        redutorAplicado: round2(impostoCalculado - impostoFinal),
        rendimentosReferencia: round2(rendimentosReferencia),
      },
    };
  }

  return {
    impostoFinal: impostoCalculado,
    meta2026: { redutorAplicado: 0, rendimentosReferencia: round2(rendimentosReferencia) },
  };
}

module.exports = {
  IRPF_RULES,
  toNumber,
  round2,
  calcFaixa,
  calcDeducao,
  applyRegra2026IfNeeded,
};
