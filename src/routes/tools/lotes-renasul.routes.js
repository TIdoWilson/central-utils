const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

function safeFileName(value) {
  return String(value || 'arquivo.xls')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'arquivo.xls';
}

function normalizeErrorMessage(value, fallback = 'Erro interno.') {
  const text = String(value || '').trim();
  return text || fallback;
}

function parseConfigOverride(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue !== 'string') return null;
  const text = rawValue.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    const detail = String(error?.message || error || 'config_json invalido.');
    const err = new Error(`config_json invalido: ${detail}`);
    err.statusCode = 400;
    throw err;
  }
}

function mergeConfigPatch(current, patch) {
  const base = current && typeof current === 'object' ? current : {};
  const incoming = patch && typeof patch === 'object' ? patch : {};
  const baseDePara = Array.isArray(base.dePara) ? base.dePara : [];
  const incomingDePara = Array.isArray(incoming.dePara) && incoming.dePara.length ? incoming.dePara : null;
  const mergedDePara = incomingDePara || baseDePara;

  return {
    ...base,
    ...incoming,
    centrosCusto: {
      ...(base.centrosCusto || {}),
      ...(incoming.centrosCusto || {}),
    },
    planoContas: Array.isArray(incoming.planoContas) && incoming.planoContas.length
      ? incoming.planoContas
      : (Array.isArray(base.planoContas) ? base.planoContas : []),
    dePara: mergedDePara,
    deParaRows: Array.isArray(incoming.deParaRows) && incoming.deParaRows.length
      ? incoming.deParaRows
      : mergedDePara,
  };
}

module.exports = function createLotesRenasulRoutes(deps = {}) {
  const { requireCsrf, auditLog, service, axios, PY_API_URL } = deps;
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage() });

  async function runParserPreferPyApi({ filePaths, config, jobId }) {
    const hasPyApi = axios && typeof axios.post === 'function' && String(PY_API_URL || '').trim();
    if (hasPyApi) {
      const pyBase = String(PY_API_URL).trim().replace(/\/+$/, '');
      const payload = {
        jobId,
        config,
        files: (Array.isArray(filePaths) ? filePaths : []).map((item) => ({
          path: String(item?.path || ''),
          name: String(item?.name || path.basename(String(item?.path || 'arquivo.xls'))),
        })),
      };

      try {
        const pyResp = await axios.post(`${pyBase}/api/lotes-renasul/processar`, payload, {
          timeout: 240000,
        });
        return pyResp?.data || {};
      } catch (error) {
        const hasResponse = !!error?.response;
        if (hasResponse) {
          const detail = normalizeErrorMessage(
            error?.response?.data?.detail || error?.response?.data?.error,
            'Erro ao processar lotes Renasul no Python API.'
          );
          const wrapped = new Error(detail);
          wrapped.statusCode = Number(error?.response?.status) || 500;
          throw wrapped;
        }
        console.warn('[lotes-renasul] Python API indisponivel; usando fallback local do parser.', String(error?.message || error));
      }
    }

    return service.runParser({ filePaths, config, jobId });
  }

  async function runJob(file, config, mode) {
    if (!service?.getJobDirs || !service?.runParser || !service?.buildTxtFromPreview) {
      throw new Error('Servico do lotes-renasul nao inicializado.');
    }

    const jobId = service.createJobId();
    const job = service.getJobDirs(jobId);
    const inputName = safeFileName(file?.originalname || 'arquivo.xls');
    const inputPath = path.join(job.uploadDir, inputName);
    fs.writeFileSync(inputPath, file.buffer);

    const parsed = await runParserPreferPyApi({
      filePaths: [{ path: inputPath, name: inputName }],
      config,
      jobId,
    });

    if (!parsed || parsed.ok === false || !parsed.resumo) {
      const error = new Error(parsed?.error || 'Falha ao analisar a planilha.');
      error.statusCode = 500;
      throw error;
    }

    const resumo = parsed.resumo || {};
    const totalRegistros = Number(resumo?.total_registros || 0);
    const totalCentros = Number(resumo?.total_centros || 0);
    if (totalRegistros === 0 && totalCentros === 0) {
      const error = new Error('Nenhum lancamento foi localizado no arquivo. Verifique se o layout da folha esta correto.');
      error.statusCode = 400;
      error.resumo = resumo;
      throw error;
    }

    const txt = service.buildTxtFromPreview(resumo);
    const txtLines = String(txt || '')
      .split(/\r?\n/)
      .filter(Boolean);
    const previewLines = txtLines.slice(0, 20);

    resumo.preview_linhas = previewLines;
    resumo.gerou_txt = false;
    resumo.downloadUrl = '';

    if (mode === 'process') {
      if (!resumo.pode_gerar_txt) {
        const error = new Error(resumo.message || 'Existem pendencias no arquivo.');
        error.statusCode = 400;
        error.resumo = resumo;
        throw error;
      }

      const outputName = 'LOTD0000.txt';
      const outputPath = path.join(job.outputDir, outputName);
      fs.writeFileSync(outputPath, txt, 'latin1');
      resumo.gerou_txt = true;
      resumo.downloadUrl = `/api/lotes-renasul/download/${encodeURIComponent(jobId)}/${encodeURIComponent(outputName)}`;
      return {
        jobId,
        inputName,
        outputName,
        outputPath,
        resumo,
      };
    }

    return {
      jobId,
      inputName,
      resumo,
    };
  }

  router.get('/health', async (req, res) => {
    try {
      await auditLog?.(req, 'tool_lotes_renasul_health', 'ok', { tool: 'lotes-renasul' });
      return res.json({ ok: true, tool: 'lotes-renasul', time: new Date().toISOString() });
    } catch (error) {
      await auditLog?.(req, 'tool_lotes_renasul_health', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro interno ao verificar a ferramenta.' });
    }
  });

  router.get('/config', async (req, res) => {
    try {
      const config = service.loadConfig();
      await auditLog?.(req, 'tool_lotes_renasul_config_get', 'ok', {
        dePara: Array.isArray(config?.dePara) ? config.dePara.length : 0,
      });
      return res.json({ ok: true, config });
    } catch (error) {
      await auditLog?.(req, 'tool_lotes_renasul_config_get', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro ao carregar a configuracao.' });
    }
  });

  router.put('/config', requireCsrf, async (req, res) => {
    try {
      const currentConfig = service.loadConfig();
      const config = service.saveConfig(mergeConfigPatch(currentConfig, req.body || {}));
      await auditLog?.(req, 'tool_lotes_renasul_config_save', 'ok', {
        dePara: Array.isArray(config?.dePara) ? config.dePara.length : 0,
      });
      return res.json({ ok: true, config });
    } catch (error) {
      await auditLog?.(req, 'tool_lotes_renasul_config_save', 'error', { error: String(error?.message || error) });
      return res.status(500).json({ ok: false, error: 'Erro ao salvar a configuracao.' });
    }
  });

  router.post('/validate', requireCsrf, upload.single('file'), async (req, res) => {
    const file = req.file || null;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
    }

    try {
      const overrideConfig = parseConfigOverride(req.body?.config_json);
      const config = overrideConfig || service.loadConfig();
      const result = await runJob(file, config, 'validate');
      await auditLog?.(req, 'tool_lotes_renasul_validate', 'ok', {
        fileName: file.originalname,
        registros: Number(result?.resumo?.total_registros || 0),
        pendencias: Number(result?.resumo?.total_pendencias || 0),
      });

      return res.json({
        ok: true,
        resumo: result.resumo,
        previewLinhas: result.resumo.preview_linhas || [],
      });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      const resumo = error?.resumo || null;
      await auditLog?.(req, 'tool_lotes_renasul_validate', 'error', {
        fileName: file.originalname,
        error: String(error?.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: normalizeErrorMessage(error?.message, 'Erro ao validar o arquivo.'),
        resumo,
      });
    }
  });

  router.post('/process', requireCsrf, upload.single('file'), async (req, res) => {
    const file = req.file || null;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
    }

    try {
      const overrideConfig = parseConfigOverride(req.body?.config_json);
      const config = overrideConfig || service.loadConfig();
      const result = await runJob(file, config, 'process');
      await auditLog?.(req, 'tool_lotes_renasul_process', 'ok', {
        fileName: file.originalname,
        registros: Number(result?.resumo?.total_registros || 0),
        pendencias: Number(result?.resumo?.total_pendencias || 0),
        outputName: result.outputName,
      });

      return res.json({
        ok: true,
        resumo: result.resumo,
        downloadUrl: result.resumo.downloadUrl,
        previewLinhas: result.resumo.preview_linhas || [],
        message: result.resumo.message || 'TXT gerado com sucesso.',
      });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      const resumo = error?.resumo || null;
      await auditLog?.(req, 'tool_lotes_renasul_process', 'error', {
        fileName: file.originalname,
        error: String(error?.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: normalizeErrorMessage(error?.message, 'Erro ao processar o arquivo.'),
        resumo,
      });
    }
  });

  router.get('/download/:jobId/:fileName', async (req, res) => {
    try {
      const jobId = String(req.params.jobId || '').trim();
      const fileName = safeFileName(decodeURIComponent(req.params.fileName || 'LOTD0000.txt'));
      const jobDir = path.join(service.jobsDir, jobId);
      const outputPath = path.join(jobDir, 'outputs', fileName);
      const resolvedBase = path.resolve(service.jobsDir);
      const resolvedPath = path.resolve(outputPath);

      if (!resolvedPath.startsWith(resolvedBase)) {
        return res.status(400).json({ ok: false, error: 'Caminho invalido.' });
      }
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ ok: false, error: 'Arquivo nao encontrado.' });
      }

      return res.download(resolvedPath, fileName);
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Erro ao baixar o TXT.' });
    }
  });

  return router;
};
