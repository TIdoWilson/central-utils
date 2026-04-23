document.addEventListener('DOMContentLoaded', () => {
  try {
    if (typeof inicializarSidebar === 'function') {
      inicializarSidebar('acerto-lotes-toscan');
    }
  } catch (err) {
    console.warn('Falha ao inicializar sidebar:', err);
  }

  inicializarAcertoLotesToscan();
});

function inicializarAcertoLotesToscan() {
  const form = document.getElementById('toscanForm');
  const fileInput = document.getElementById('toscanFile');
  const statusEl = document.getElementById('toscanStatus');

  const btnDownloadLimpo = document.getElementById('btnDownloadLimpo');
  const btnDownloadRemovidas = document.getElementById('btnDownloadRemovidas');

  const metricTotal = document.getElementById('metricTotalLinhas');
  const metricRemovidas = document.getElementById('metricLinhasRemovidas');
  const metricMantidas = document.getElementById('metricLinhasMantidas');

  const previewRemovidas = document.getElementById('previewRemovidas');

  if (!form || !fileInput) {
    console.warn('Formulario de Acerto Lotes Toscan nao encontrado na pagina.');
    return;
  }

  let blobLimpoUrl = null;
  let blobRemovidasUrl = null;
  let nomeBaseArquivo = 'lancamentos-toscan';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!fileInput.files || !fileInput.files[0]) {
      atualizarStatus('Selecione um arquivo TXT para processar.', statusEl);
      return;
    }

    const file = fileInput.files[0];
    nomeBaseArquivo = removerExtensao(file.name) || 'lancamentos-toscan';

    if (blobLimpoUrl) {
      URL.revokeObjectURL(blobLimpoUrl);
      blobLimpoUrl = null;
    }
    if (blobRemovidasUrl) {
      URL.revokeObjectURL(blobRemovidasUrl);
      blobRemovidasUrl = null;
    }

    btnDownloadLimpo.disabled = true;
    btnDownloadRemovidas.disabled = true;
    atualizarStatus('Lendo e processando arquivo, aguarde...', statusEl);

    try {
      const conteudo = window.WLTextFileReader?.readText
        ? await window.WLTextFileReader.readText(file)
        : await file.text();
      const resultado = processarArquivoToscan(conteudo);

      atualizarMetricas(resultado, metricTotal, metricRemovidas, metricMantidas);
      atualizarPreview(resultado, previewRemovidas);

      const blobLimpo = new Blob([resultado.conteudoMantido], {
        type: 'text/plain;charset=utf-8',
      });
      blobLimpoUrl = URL.createObjectURL(blobLimpo);

      btnDownloadLimpo.disabled = false;
      btnDownloadLimpo.onclick = () => {
        dispararDownload(blobLimpoUrl, `${nomeBaseArquivo}-ajustado-toscan.txt`);
      };

      if (resultado.linhasRemovidas > 0) {
        const blobRemovidas = new Blob([resultado.conteudoRemovido], {
          type: 'text/plain;charset=utf-8',
        });
        blobRemovidasUrl = URL.createObjectURL(blobRemovidas);

        btnDownloadRemovidas.disabled = false;
        btnDownloadRemovidas.onclick = () => {
          dispararDownload(
            blobRemovidasUrl,
            `${nomeBaseArquivo}-linhas-removidas-toscan.txt`
          );
        };

        atualizarStatus(
          `Processamento concluido: ${resultado.linhasRemovidas} linhas removidas.`,
          statusEl
        );
      } else {
        btnDownloadRemovidas.disabled = true;
        btnDownloadRemovidas.onclick = null;

        atualizarStatus(
          'Processamento concluido: nenhuma linha com historico em branco encontrada.',
          statusEl
        );
      }
    } catch (err) {
      console.error(err);
      atualizarStatus(
        'Erro ao processar o arquivo. Verifique se o TXT esta no formato esperado.',
        statusEl
      );
    }
  });
}

function processarArquivoToscan(conteudoBruto) {
  if (typeof conteudoBruto !== 'string') {
    conteudoBruto = conteudoBruto ? String(conteudoBruto) : '';
  }

  const normalizado = conteudoBruto
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const linhas = normalizado.split('\n');
  const PADRAO_HISTORICO_VAZIO = /^H\s+\d+\s*$/;

  const mantidas = [];
  const removidas = [];

  let i = 0;
  while (i < linhas.length) {
    const linhaAtual = String(linhas[i] ?? '');

    if (linhaAtual.startsWith('L') && i + 1 < linhas.length) {
      const proximaLinha = String(linhas[i + 1] ?? '');

      if (PADRAO_HISTORICO_VAZIO.test(proximaLinha)) {
        removidas.push(linhaAtual, proximaLinha);
        i += 2;
        continue;
      }
    }

    mantidas.push(linhaAtual);
    i += 1;
  }

  const conteudoMantido = mantidas.join('\n');
  const conteudoRemovido = removidas.join('\n');

  return {
    conteudoMantido,
    conteudoRemovido,
    totalLinhas: linhas.length,
    linhasRemovidas: removidas.length,
    linhasMantidas: mantidas.length,
  };
}

function atualizarMetricas(resultado, metricTotal, metricRemovidas, metricMantidas) {
  if (metricTotal) metricTotal.textContent = String(resultado.totalLinhas);
  if (metricRemovidas) metricRemovidas.textContent = String(resultado.linhasRemovidas);
  if (metricMantidas) metricMantidas.textContent = String(resultado.linhasMantidas);
}

function atualizarPreview(resultado, previewEl) {
  if (!previewEl) return;

  if (!resultado.conteudoRemovido || resultado.linhasRemovidas === 0) {
    previewEl.textContent = 'Nenhuma linha removida (nenhum historico em branco encontrado).';
    return;
  }

  const linhasPreview = resultado.conteudoRemovido.split('\n').slice(0, 100);
  previewEl.textContent = linhasPreview.join('\n');
}

function atualizarStatus(mensagem, el) {
  if (!el) return;
  el.textContent = mensagem;
}

function dispararDownload(url, nomeArquivo) {
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function removerExtensao(nomeArquivo) {
  if (!nomeArquivo) return '';
  const lastDot = nomeArquivo.lastIndexOf('.');
  if (lastDot <= 0) return nomeArquivo;
  return nomeArquivo.substring(0, lastDot);
}
