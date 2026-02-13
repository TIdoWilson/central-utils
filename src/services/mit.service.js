function calcularDvsCnpj12(primeiros12) {
  if (!primeiros12 || primeiros12.length !== 12 || !/^\d+$/.test(primeiros12)) {
    throw new Error('Base de CNPJ inválida (esperado 12 dígitos numéricos).');
  }

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma1 = 0;
  for (let i = 0; i < 12; i++) {
    soma1 += parseInt(primeiros12[i], 10) * pesos1[i];
  }
  const resto1 = soma1 % 11;
  const dv1 = resto1 < 2 ? 0 : 11 - resto1;

  const pesos2 = [6].concat(pesos1);
  const base13 = primeiros12 + String(dv1);
  let soma2 = 0;
  for (let i = 0; i < 13; i++) {
    soma2 += parseInt(base13[i], 10) * pesos2[i];
  }
  const resto2 = soma2 % 11;
  const dv2 = resto2 < 2 ? 0 : 11 - resto2;

  return `${dv1}${dv2}`;
}

function extrairCnpjContribuinteDeNomeArquivo(nomeArquivo) {
  const match = (nomeArquivo || '').match(/(\d{8})/);
  if (!match) {
    throw new Error(
      'Não foi possível localizar 8 dígitos de CNPJ no nome do arquivo JSON do MIT.'
    );
  }
  const raiz8 = match[1];
  const base12 = `${raiz8}0001`;
  const dvs = calcularDvsCnpj12(base12);
  return base12 + dvs;
}

module.exports = { calcularDvsCnpj12, extrairCnpjContribuinteDeNomeArquivo };
