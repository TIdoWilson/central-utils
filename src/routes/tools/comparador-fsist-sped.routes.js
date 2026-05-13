const express = require('express');

const {
  processarComparadorFsistSped,
  normalizeOutputType,
} = require('../../services/comparador-fsist-sped.service');

module.exports = function createComparadorFsistSpedRoutes(deps) {
  const {
    requireCsrf,
    upload,
    auditLog,
  } = deps;

  const router = express.Router();

  router.get('/health', (req, res) => {
    return res.json({ ok: true, tool: 'comparador-fsist-sped', time: new Date().toISOString() });
  });

  router.post(
    '/processar',
    requireCsrf,
    upload.fields([
      { name: 'spedArquivo', maxCount: 1 },
      { name: 'fsistArquivos', maxCount: 100 },
    ]),
    async (req, res) => {
      try {
        const spedFile = req.files?.spedArquivo?.[0];
        const fsistFiles = Array.isArray(req.files?.fsistArquivos) ? req.files.fsistArquivos : [];
        const tipoSped = normalizeOutputType(req.body?.tipoSped || 'auto');

        if (!spedFile) {
          return res.status(400).json({ ok: false, error: 'Envie o TXT do SPED.' });
        }
        if (!fsistFiles.length) {
          return res.status(400).json({ ok: false, error: 'Envie ao menos um XML ou ZIP do FSIST.' });
        }

        const resultado = await processarComparadorFsistSped({
          spedBuffer: spedFile.buffer,
          spedFileName: spedFile.originalname || 'sped.txt',
          fsistFiles,
          tipoSped,
        });

        await auditLog?.(req, 'tool_comparador_fsist_sped', 'ok', {
          spedFile: spedFile.originalname || 'sped.txt',
          fsistFiles: fsistFiles.length,
          tipoSped: resultado.sped_type,
          totalNotasFaltantes: resultado.resumo.totalNotasFaltantes,
          totalComparacoesCst: resultado.resumo.totalComparacoesCst,
        });

        return res.json({
          ok: true,
          arquivoSaida: resultado.arquivo_saida,
          xlsxBase64: Buffer.from(resultado.xlsx_bytes).toString('base64'),
          resumo: resultado.resumo,
          previewFaltantes: resultado.notas_faltantes.slice(0, 25),
          previewCst: resultado.comparacoes_cst.slice(0, 25),
        });
      } catch (error) {
        await auditLog?.(req, 'tool_comparador_fsist_sped', 'error', {
          error: String(error?.message || error || 'erro'),
        });
        return res.status(400).json({
          ok: false,
          error: String(error?.message || 'Erro ao processar comparador FSIST x SPED.'),
        });
      }
    },
  );

  return router;
};
