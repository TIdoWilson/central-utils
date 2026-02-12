const express = require('express');

module.exports = function createImportadorRecebimentosMadreScpRoutes(deps) {
  const { requireCsrf, uploadMadreScp, axios, DATA_DIR, path } = deps;

  const router = express.Router();

  router.post(
    '/upload',
    requireCsrf,
    uploadMadreScp.single('pdfFile'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Nenhum PDF enviado.' });
        }

        const pythonBase =
          process.env.PYTHON_API_URL || 'http://127.0.0.1:8001';
        const pythonUrl =
          pythonBase + '/api/importador-recebimentos-madre-scp/processar';

        const outputDir = path.join(DATA_DIR, 'outputs', 'madre-scp');

        const payload = {
          pdf_path: req.file.path,
          output_dir: outputDir,
        };

        const resposta = await axios.post(pythonUrl, payload);
        const data = resposta.data || {};

        if (!data.ok) {
          return res
            .status(500)
            .json({ error: 'Falha ao processar PDF no backend Python.' });
        }

        const resultado = data.resultado || {};

        return res.json({
          ok: true,
          resumo: {
            total_registros: resultado.total_registros,
            total_clientes: resultado.total_clientes,
            totais: resultado.totais,
            resumo_clientes: resultado.resumo_clientes,
          },
          downloadToken: resultado.output_excel_name,
        });
      } catch (err) {
        console.error(
          'Erro em /api/importador-recebimentos-madre-scp/upload:',
          err.message || err
        );
        return res
          .status(500)
          .json({ error: 'Erro ao processar requisição no servidor.' });
      }
    }
  );

  router.get('/download/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const filePath = path.join(
      DATA_DIR,
      'outputs',
      'madre-scp',
      fileName
    );

    return res.download(filePath, fileName, (err) => {
      if (err) {
        console.error(
          'Erro ao enviar Excel MADRE SCP para download:',
          err.message || err
        );
        if (!res.headersSent) {
          return res
            .status(404)
            .json({ error: 'Arquivo gerado não encontrado.' });
        }
      }
    });
  });

  return router;
};
