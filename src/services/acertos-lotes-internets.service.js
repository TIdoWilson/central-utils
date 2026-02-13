const fs = require('fs');

const LOTE_INTERNETS_KEYWORDS = [
  'rendimento',
  'desconto obtido',
  'pagamento',
  'pagar',
  'adiantamento a fornecedor',
  'adiantamento ao fornecedor',
  'distribuicao',
  'transf. caixa',
  'cesta de relacionamento',
  'tarifa cobranca',
];

function loteInternetsHistoricoContemPalavra(linhaH) {
  if (!linhaH) return false;
  const texto = String(linhaH).toLowerCase();
  return LOTE_INTERNETS_KEYWORDS.some((palavra) => texto.includes(palavra));
}

function processarLoteInternetsConteudo(conteudo) {
  if (typeof conteudo !== 'string') {
    conteudo = conteudo ? String(conteudo) : '';
  }

  const usaCRLF = conteudo.includes('\r\n');
  const separador = usaCRLF ? '\r\n' : '\n';
  const linhas = conteudo.split(/\r?\n/);

  const linhasMantidas = [];
  const linhasRemovidas = [];

  let i = 0;
  while (i < linhas.length) {
    const linhaAtual = linhas[i];

    if (linhaAtual && linhaAtual.startsWith('L') && i + 1 < linhas.length) {
      const proximaLinha = linhas[i + 1];

      if (
        proximaLinha &&
        proximaLinha.startsWith('H') &&
        loteInternetsHistoricoContemPalavra(proximaLinha)
      ) {
        linhasRemovidas.push(linhaAtual, proximaLinha);
        i += 2;
        continue;
      }
    }

    linhasMantidas.push(linhaAtual);
    i += 1;
  }

  const processedContent = linhasMantidas.join(separador);
  const removedContent = linhasRemovidas.join(separador);

  return {
    totalLines: linhas.length,
    keptLines: linhasMantidas.length,
    removedLines: linhasRemovidas.length,
    removedPairs: Math.floor(linhasRemovidas.length / 2),
    processedContent,
    removedContent,
  };
}

function getTextFromUploadedFile(file) {
  if (!file) return '';
  if (file.buffer) return file.buffer.toString('utf-8');
  if (file.path && fs.existsSync(file.path)) {
    return fs.readFileSync(file.path, 'utf-8');
  }
  return '';
}

module.exports = {
  processarLoteInternetsConteudo,
  getTextFromUploadedFile,
};
