const express = require('express');

module.exports = function createGfbrGeradorTxtRoutes(deps) {
  const {
    requireCsrf,
    uploadGfbrGeradorTxt,
    axios,
    gfbrGeradorTxtUploadsDir,
    fs,
    path,
    PY_API_URL,
  } = deps;

  const router = express.Router();

  function isSafeSegment(v) {
    return /^[A-Za-z0-9._-]+$/.test(String(v || ''));
  }

  router.post(
    '/processar',
    requireCsrf,
    uploadGfbrGeradorTxt.fields([
      { name: 'arquivoDiario', maxCount: 1 },
      { name: 'pdfItau1', maxCount: 1 },
      { name: 'pdfItau2', maxCount: 1 }
    ]),
    async (req, res) => {
      try {
        const files = req.files || {};
        const fDiario = files['arquivoDiario']?.[0];
        const fItau1 = files['pdfItau1']?.[0];
        const fItau2 = files['pdfItau2']?.[0];

        if (!fDiario && !fItau1 && !fItau2) {
          return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
        }

        const abaOrigem = (req.body.abaOrigem || '').trim();
        const contaAplicacao1 = (req.body.contaAplicacao1 || '').trim();
        const contaAplicacao2 = (req.body.contaAplicacao2 || '').trim();
        const contaCorrente1 = (req.body.contaCorrente1 || '').trim();
        const contaCorrente2 = (req.body.contaCorrente2 || '').trim();
        
        const mainFileBase = (fDiario || fItau1 || fItau2).filename;
        const fileBase = path.parse(mainFileBase).name;
        const outputFolder = `${fileBase}-out`;
        const outputDir = path.join(gfbrGeradorTxtUploadsDir, outputFolder);
        fs.mkdirSync(outputDir, { recursive: true });

        const pyResp = await axios.post(`${PY_API_URL}/api/gfbr-gerador-txt/processar`, {
          input_path: fDiario ? fDiario.path : null,
          aba_origem: abaOrigem || null,
          pdf_itau_1_path: fItau1 ? fItau1.path : null,
          conta_aplicacao_1: contaAplicacao1 || null,
          conta_corrente_1: contaCorrente1 || null,
          pdf_itau_2_path: fItau2 ? fItau2.path : null,
          conta_aplicacao_2: contaAplicacao2 || null,
          conta_corrente_2: contaCorrente2 || null,
          output_dir: outputDir,
        });

        const data = pyResp?.data || {};
        if (!data.ok || !data.resumo) {
          return res.status(500).json({
            ok: false,
            error: 'Resposta inesperada do backend Python.',
          });
        }

        const resumo = data.resumo;
        const txtName = path.basename(resumo.arquivo_txt || 'LOTD0000.txt');
        const pendName = path.basename(resumo.arquivo_pendencias || 'PENDENCIAS_GFBR.csv');
        const excName = path.basename(resumo.arquivo_exclusoes || 'EXCLUSOES_GFBR.csv');

        return res.json({
          ok: true,
          resumo,
          downloadTxtUrl: `/api/gfbr-gerador-txt/download/${encodeURIComponent(outputFolder)}/${encodeURIComponent(txtName)}`,
          downloadPendenciasUrl: `/api/gfbr-gerador-txt/download/${encodeURIComponent(outputFolder)}/${encodeURIComponent(pendName)}`,
          downloadExclusoesUrl: `/api/gfbr-gerador-txt/download/${encodeURIComponent(outputFolder)}/${encodeURIComponent(excName)}`,
          message: 'Arquivo gerado com sucesso.',
        });
      } catch (err) {
        console.error('[gfbr-gerador-txt] ERRO:', err?.response?.status, err?.response?.data, err?.message, err?.stack);
        const detail =
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          err?.message ||
          'Erro ao processar arquivo.';
        return res.status(500).json({
          ok: false,
          error: String(detail),
        });
      }
    }
  );

  router.get('/download/:folder/:fileName', (req, res) => {
    try {
      const folder = decodeURIComponent(req.params.folder || '');
      const fileName = decodeURIComponent(req.params.fileName || '');
      if (!isSafeSegment(folder) || !isSafeSegment(fileName)) {
        return res.status(400).json({ error: 'Parametro invalido.' });
      }

      const filePath = path.join(gfbrGeradorTxtUploadsDir, folder, fileName);
      const baseResolved = path.resolve(gfbrGeradorTxtUploadsDir);
      const fileResolved = path.resolve(filePath);
      if (!fileResolved.startsWith(baseResolved)) {
        return res.status(400).json({ error: 'Caminho invalido.' });
      }
      if (!fs.existsSync(fileResolved)) {
        return res.status(404).json({ error: 'Arquivo nao encontrado.' });
      }

      const downloadName = fileName.toLowerCase() === 'lotd0000.txt' ? 'LOTD0000.txt' : fileName;
      return res.download(fileResolved, downloadName);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao baixar arquivo.' });
    }
  });

  return router;
};
