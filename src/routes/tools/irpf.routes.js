const express = require('express');

module.exports = function createIrpfRoutes(deps) {
  const {
    IRPF_RULES,
    toNumber,
    round2,
    calcDeducao,
    calcFaixa,
    applyRegra2026IfNeeded,
  } = deps;

  const router = express.Router();

  router.get('/simular', (req, res) => {
    const rendimentos = toNumber(req.query.rendimentos);
    const despesas = toNumber(req.query.despesas);
    const dependentes = Math.max(0, Math.floor(toNumber(req.query.dependentes)));
    const impostoPago = toNumber(req.query.impostoPago);
    const saldoAnterior = toNumber(req.query.saldoAnterior);

    if (!Number.isFinite(rendimentos) || rendimentos <= 0) {
      return res.status(400).json({ error: 'rendimentos inválido' });
    }

    const items = IRPF_RULES.map((regra) => {
      const deducao = calcDeducao(rendimentos, despesas, dependentes, regra);
      const baseCalculo = Math.max(0, rendimentos - deducao.valor);

      const faixa = calcFaixa(baseCalculo, regra);
      const impostoAntes2026 = faixa.imposto;

      const applied = applyRegra2026IfNeeded(rendimentos, impostoAntes2026, regra);
      const impostoDevido = applied.impostoFinal;

      const saldoPagarCompensar = round2(impostoDevido - impostoPago - saldoAnterior);

      return {
        regraId: regra.id,
        periodoLabel: regra.periodoLabel,
        deducao,
        baseCalculo: round2(baseCalculo),
        faixa: {
          aliquota: faixa.aliquota,
          parcelaADeduzir: round2(faixa.parcelaADeduzir)
        },
        impostoDevido: round2(impostoDevido),
        impostoPago: round2(impostoPago),
        saldoAnterior: round2(saldoAnterior),
        saldoPagarCompensar,
        meta2026: applied.meta2026
      };
    });

    res.json({ items });
  });

  return router;
};
