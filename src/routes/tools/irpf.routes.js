const express = require('express');
const {
  IRPF_RULES,
  toNumber,
  round2,
  calcDeducao,
  calcFaixa,
  applyRegra2026IfNeeded,
} = require('../../services/irpf.service');

module.exports = function createIrpfRoutes(deps) {
  const {
    IRPF_RULES: rules = IRPF_RULES,
    toNumber: toNum = toNumber,
    round2: round = round2,
    calcDeducao: calcDed = calcDeducao,
    calcFaixa: calcFx = calcFaixa,
    applyRegra2026IfNeeded: apply2026 = applyRegra2026IfNeeded,
  } = deps;

  const router = express.Router();

  router.get('/simular', (req, res) => {
    const rendimentos = toNum(req.query.rendimentos);
    const despesas = toNum(req.query.despesas);
    const dependentes = Math.max(0, Math.floor(toNum(req.query.dependentes)));
    const impostoPago = toNum(req.query.impostoPago);
    const saldoAnterior = toNum(req.query.saldoAnterior);

    if (!Number.isFinite(rendimentos) || rendimentos <= 0) {
      return res.status(400).json({ error: 'rendimentos inválido' });
    }

    const items = rules.map((regra) => {
      const deducao = calcDed(rendimentos, despesas, dependentes, regra);
      const baseCalculo = Math.max(0, rendimentos - deducao.valor);

      const faixa = calcFx(baseCalculo, regra);
      const impostoAntes2026 = faixa.imposto;

      const applied = apply2026(rendimentos, impostoAntes2026, regra);
      const impostoDevido = applied.impostoFinal;

      const saldoPagarCompensar = round(impostoDevido - impostoPago - saldoAnterior);

      return {
        regraId: regra.id,
        periodoLabel: regra.periodoLabel,
        deducao,
        baseCalculo: round(baseCalculo),
        faixa: {
          aliquota: faixa.aliquota,
          parcelaADeduzir: round(faixa.parcelaADeduzir)
        },
        impostoDevido: round(impostoDevido),
        impostoPago: round(impostoPago),
        saldoAnterior: round(saldoAnterior),
        saldoPagarCompensar,
        meta2026: applied.meta2026
      };
    });

    res.json({ items });
  });

  return router;
};
