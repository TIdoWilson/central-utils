const express = require('express');
const { createSnService } = require('../../services/sn.service');

module.exports = function createSnRoutes(deps) {
  const snService = deps.snService || (deps.snConfig ? createSnService(deps.snConfig) : null);
  const {
    requireCsrf,
    pool,
    auditLog,
    autenticarSerpro,
    axios,
    dbGetSnCompanies = snService?.dbGetSnCompanies,
    dbCreateSnCompany = snService?.dbCreateSnCompany,
    dbDeleteSnCompany = snService?.dbDeleteSnCompany,
    dbGetReceiptById = snService?.dbGetReceiptById,
    dbGetReceiptsByIds = snService?.dbGetReceiptsByIds,
    dbGetReceiptsHistory = snService?.dbGetReceiptsHistory,
    dbGetReceiptByCompanyAndPa = snService?.dbGetReceiptByCompanyAndPa,
    dbSaveReceipt = snService?.dbSaveReceipt,
    buildResumoResponse = snService?.buildResumoResponse,
    registrarSnResultado = snService?.registrarSnResultado,
  } = deps;

  const router = express.Router();
  const snDebug = ['1', 'true', 'yes', 'on'].includes(String(process.env.SN_DEBUG || '').toLowerCase());
  const serproDeclararUrl =
    process.env.SERPRO_DECLARAR_URL ||
    'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Declarar';
  const serproConsultarUrl =
    process.env.SERPRO_CONSULTAR_URL ||
    'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Consultar';

  router.get('/companies', async (req, res) => {
    try {
      const companies = await dbGetSnCompanies();
      res.json(companies);
    } catch (err) {
      console.error('Erro ao listar empresas SN:', err);
      res.status(500).json({ error: 'Erro ao listar empresas.' });
    }
  });

  router.post('/companies', requireCsrf, async (req, res) => {
    try {
      const cnpj = String(req.body?.cnpj || '').replace(/\D/g, '');
      const razaoSocial = String(req.body?.razaoSocial || '').trim();

      if (!cnpj || !razaoSocial) {
        return res
          .status(400)
          .json({ error: 'Campos obrigatórios: cnpj e razaoSocial.' });
      }
      if (cnpj.length !== 14) {
        return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos.' });
      }

      const existing = await pool.query(
        'SELECT 1 FROM sn_companies WHERE cnpj = $1',
        [cnpj]
      );
      if (existing.rowCount > 0) {
        return res
          .status(400)
          .json({ error: 'Já existe empresa cadastrada com este CNPJ.' });
      }

      const newCompany = await dbCreateSnCompany(cnpj, razaoSocial);
      res.status(201).json(newCompany);
    } catch (err) {
      console.error('Erro ao cadastrar empresa SN:', err);
      res.status(500).json({ error: 'Erro ao cadastrar empresa.' });
    }
  });

  router.put('/companies/:id', requireCsrf, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const cnpj = String(req.body?.cnpj || '').replace(/\D/g, '');
      const razaoSocial = String(req.body?.razaoSocial || '').trim();

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID da empresa inválido.' });
      }
      if (!cnpj || !razaoSocial) {
        return res
          .status(400)
          .json({ error: 'Campos obrigatórios: cnpj e razaoSocial.' });
      }
      if (cnpj.length !== 14) {
        return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos.' });
      }

      const existing = await pool.query(
        'SELECT id FROM sn_companies WHERE cnpj = $1 AND id <> $2',
        [cnpj, id]
      );
      if (existing.rowCount > 0) {
        return res
          .status(400)
          .json({ error: 'Já existe empresa cadastrada com este CNPJ.' });
      }

      const result = await pool.query(
        `
          UPDATE sn_companies
          SET cnpj = $1, razao_social = $2
          WHERE id = $3
          RETURNING id, cnpj, razao_social
        `,
        [cnpj, razaoSocial, id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Empresa não encontrada.' });
      }

      const company = result.rows[0];

      await auditLog?.(
        req,
        'sn_company_update',
        'ok',
        { companyId: company.id, cnpj: company.cnpj },
        req.user || req.auth?.user || null
      );

      return res.json({
        id: company.id,
        cnpj: company.cnpj,
        razaoSocial: company.razao_social,
      });
    } catch (err) {
      console.error('Erro ao atualizar empresa SN:', err);
      res.status(500).json({ error: 'Erro ao atualizar empresa.' });
    }
  });

  router.delete('/companies/:id', requireCsrf, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID da empresa inválido.' });
      }

      const deleted = dbDeleteSnCompany
        ? await dbDeleteSnCompany(id)
        : null;

      if (!deleted) {
        return res.status(404).json({ error: 'Empresa não encontrada.' });
      }

      await auditLog?.(
        req,
        'sn_company_delete',
        'ok',
        { companyId: deleted.id, cnpj: deleted.cnpj },
        req.user || req.auth?.user || null
      );

      return res.json({ ok: true, deleted });
    } catch (err) {
      console.error('Erro ao excluir empresa SN:', err);
      return res.status(500).json({ error: 'Erro ao excluir empresa.' });
    }
  });

  router.get('/summary', async (req, res) => {
    try {
      res.json(buildResumoResponse());
    } catch (err) {
      console.error('Erro ao carregar resumo:', err);
      res.status(500).json({ error: 'Erro ao carregar resumo.' });
    }
  });

  router.get('/receipt/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).send('ID inválido');

      const receipt = await dbGetReceiptById(id);
      if (!receipt) return res.status(404).send('Recibo não encontrado');

      res.setHeader('Content-Type', 'application/pdf');
      return res.send(receipt.pdf);
    } catch (err) {
      console.error('Erro ao buscar recibo:', err);
      return res.status(500).send('Erro ao buscar recibo');
    }
  });

  router.get('/receipts/history', async (req, res) => {
    try {
      const daysParam = req.query?.days;
      const parsedDays = Number.parseInt(String(daysParam || '90'), 10);
      const history = dbGetReceiptsHistory
        ? await dbGetReceiptsHistory(Number.isFinite(parsedDays) ? parsedDays : 90)
        : { days: 90, items: [] };

      return res.json(history);
    } catch (err) {
      console.error('Erro ao listar historico de recibos SN:', err);
      return res.status(500).json({ error: 'Erro ao listar historico de recibos.' });
    }
  });

  router.post('/receipts/batch-download', requireCsrf, async (req, res) => {
    try {
      const idsEntrada = Array.isArray(req.body?.ids)
        ? req.body.ids
        : (Array.isArray(req.body?.receiptIds) ? req.body.receiptIds : []);
      const ids = idsEntrada.map(Number).filter((id) => Number.isFinite(id));
      if (!ids.length) return res.status(400).json({ error: 'IDs obrigatórios.' });

      const receipts = await dbGetReceiptsByIds(ids);
      if (!receipts.length) return res.status(404).json({ error: 'Recibos não encontrados.' });

      const zip = require('archiver')('zip', { zlib: { level: 9 } });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="recibos.zip"');

      zip.pipe(res);

      receipts.forEach((r) => {
        const name = `${r.cnpj}_${r.pa}.pdf`;
        zip.append(r.pdf, { name });
      });

      zip.finalize().catch(() => {
        res.status(500).end();
      });
    } catch (err) {
      console.error('Erro ao gerar ZIP de recibos:', err);
      res.status(500).json({ error: 'Erro ao gerar ZIP de recibos.' });
    }
  });

  router.post('/declaration', requireCsrf, async (req, res) => {
    try {
      const {
        pa,
        indicadorTransmissao,
        indicadorComparacao,
        tipoDeclaracao,
        receitaInterna,
        receitaExterna,
        complemento,
        empresas,
        companyIds = null,
        all = false,
        estabelecimentosEntrada,
        valoresParaComparacao,
      } = req.body || {};

      const contratante = process.env.CNPJ_CONTRATANTE;

      if (!contratante) {
        return res.status(500).json({ error: 'CNPJ_CONTRATANTE nao configurado no .env.' });
      }
      if (!pa) {
        return res.status(400).json({ error: 'Período de apuração (pa) obrigatório.' });
      }
      if (typeof indicadorTransmissao !== 'boolean') {
        return res.status(400).json({ error: 'Indicador de transmissao obrigatorio.' });
      }
      if (typeof indicadorComparacao !== 'boolean') {
        return res.status(400).json({ error: 'Indicador de comparacao obrigatorio.' });
      }

      const receitaInternaNormalizada =
        receitaInterna === undefined || receitaInterna === null ? 0 : receitaInterna;
      const receitaExternaNormalizada =
        receitaExterna === undefined || receitaExterna === null ? 0 : receitaExterna;
      const tipoDeclaracaoNormalizado =
        tipoDeclaracao === undefined || tipoDeclaracao === null || tipoDeclaracao === ''
          ? 1
          : Number(tipoDeclaracao);

      const empresasCadastradas = await dbGetSnCompanies();
      let empresasParaDeclarar = [];

      if (Array.isArray(empresas) && empresas.length > 0) {
        empresasParaDeclarar = empresas;
      } else if (all) {
        empresasParaDeclarar = empresasCadastradas;
      } else if (Array.isArray(companyIds) && companyIds.length > 0) {
        const idsNum = companyIds.map(Number).filter((id) => Number.isFinite(id));
        empresasParaDeclarar = empresasCadastradas.filter((empresa) =>
          idsNum.includes(empresa.id)
        );
      }

      if (!Array.isArray(empresasParaDeclarar) || empresasParaDeclarar.length === 0) {
        return res.status(400).json({ error: 'Selecione empresas.' });
      }

      const { access_token, jwt_token } = await autenticarSerpro();
      if (!access_token || !jwt_token) {
        return res.status(500).json({
          error:
            'access_token ou jwt_token não retornado pelo SERPRO. Verifique o endpoint /authenticate e as credenciais.',
        });
      }

      const headers = {
        Authorization: 'Bearer ' + access_token,
        jwt_token: jwt_token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const url = serproDeclararUrl;

      const resultados = [];

      for (const empresa of empresasParaDeclarar) {
        try {
          let estabelecimentos;

          if (Array.isArray(estabelecimentosEntrada) && estabelecimentosEntrada.length > 0) {
            estabelecimentos = estabelecimentosEntrada;
          } else {
            estabelecimentos = [
              {
                cnpjCompleto: empresa.cnpj,
              },
            ];
          }

          const declaracaoObj = {
            TipoDeclaracao: tipoDeclaracaoNormalizado,
            receitaPaCompetenciaInterno: receitaInternaNormalizada,
            receitaPaCompetenciaExterno: receitaExternaNormalizada,
            ...(complemento || {}),
            estabelecimentos,
          };

          const dadosPGDAS = {
            cnpjCompleto: empresa.cnpj,
            pa: Number(pa),
            indicadorTransmissao,
            indicadorComparacao,
            declaracao: declaracaoObj,
          };

          if (valoresParaComparacao && indicadorComparacao) {
            dadosPGDAS.valoresParaComparacao = valoresParaComparacao;
          }

          const payload = {
            contratante: { numero: contratante, tipo: 2 },
            autorPedidoDados: { numero: contratante, tipo: 2 },
            contribuinte: { numero: empresa.cnpj, tipo: 2 },
            pedidoDados: {
              idSistema: 'PGDASD',
              idServico: 'TRANSDECLARACAO11',
              versaoSistema: '1.0',
              dados: JSON.stringify(dadosPGDAS),
            },
          };

          const apiResp = await axios.post(url, payload, { headers });

          registrarSnResultado(true, 'declaracao');

          resultados.push({
            tipo: 'declaracao',
            cnpj: empresa.cnpj,
            razaoSocial: empresa.razaoSocial || '',
            sucesso: true,
            status: apiResp.status,
            mensagens:
              apiResp.data && apiResp.data.mensagens ? apiResp.data.mensagens : [],
            receiptId: null,
            fromCache: false,
          });
        } catch (errEnvio) {
          console.error(
            'Erro ao declarar CNPJ',
            empresa.cnpj,
            errEnvio.response ? errEnvio.response.data : errEnvio.message
          );

          registrarSnResultado(false, 'declaracao');

          const status = errEnvio.response ? errEnvio.response.status : 500;
          const mensagens =
            errEnvio.response &&
              errEnvio.response.data &&
              errEnvio.response.data.mensagens
              ? errEnvio.response.data.mensagens
              : null;

          resultados.push({
            tipo: 'declaracao',
            cnpj: empresa.cnpj,
            razaoSocial: empresa.razaoSocial || '',
            sucesso: false,
            status,
            error: errEnvio.message,
            mensagens,
            receiptId: null,
            fromCache: false,
          });
        }
      }

      res.json({
        resultados,
        resumoConsumo: buildResumoResponse(),
      });
    } catch (err) {
      console.error('Erro geral ao enviar declarações SN:', err);
      res.status(500).json({ error: err.message || 'Erro ao enviar declarações.' });
    }
  });

  router.post('/consult-last', requireCsrf, async (req, res) => {
    try {
      const {
        pa,
        companyIds = null,
        all = false,
      } = req.body;

      const contratante = process.env.CNPJ_CONTRATANTE;

      if (!contratante) {
        return res.status(500).json({ error: 'CNPJ_CONTRATANTE nao configurado no .env.' });
      }

      if (!pa) {
        return res
          .status(400)
          .json({ error: 'Período de apuração (pa) é obrigatório.' });
      }

      const empresasCadastradas = await dbGetSnCompanies();
      let empresasParaProcessar = [];

      if (all) {
        empresasParaProcessar = empresasCadastradas;
      } else if (Array.isArray(companyIds) && companyIds.length > 0) {
        const idsNum = companyIds.map(Number);
        empresasParaProcessar = empresasCadastradas.filter((c) =>
          idsNum.includes(c.id)
        );
      } else {
        return res
          .status(400)
          .json({ error: 'Selecione pelo menos uma empresa.' });
      }

      if (empresasParaProcessar.length === 0) {
        return res
          .status(400)
          .json({ error: 'Nenhuma empresa encontrada para processar.' });
      }

      const { access_token, jwt_token } = await autenticarSerpro();

      if (!access_token) {
        return res.status(500).json({
          error:
            'access_token não retornado pelo SERPRO. Verifique o endpoint /authenticate e as credenciais.',
        });
      }

      const url = serproConsultarUrl;

      const headers = {
        Authorization: 'Bearer ' + access_token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (jwt_token) {
        headers.jwt_token = jwt_token;
      }

      const resultados = [];
      const paStr = String(pa);

      function decodePdfFromDados(dadosStr) {
        if (!dadosStr) return null;

        try {
          const bufBase64 = Buffer.from(dadosStr, 'base64');
          const sig1 = bufBase64.slice(0, 5).toString();
          if (sig1 === '%PDF-') {
            return bufBase64;
          }
        } catch (_) {}

        try {
          const jsonDados = JSON.parse(dadosStr);

          if (jsonDados.recibo && typeof jsonDados.recibo.pdf === 'string') {
            try {
              const buf = Buffer.from(jsonDados.recibo.pdf, 'base64');
              const sig = buf.slice(0, 5).toString();
              if (sig === '%PDF-') {
                return buf;
              }
            } catch (_) {}
          }

          function buscaPdfEmObjeto(obj) {
            if (!obj || typeof obj !== 'object') return null;

            for (const [chave, val] of Object.entries(obj)) {
              if (typeof val === 'string') {
                try {
                  const buf = Buffer.from(val, 'base64');
                  const sig = buf.slice(0, 5).toString();
                  if (sig === '%PDF-') {
                    return buf;
                  }
                } catch (_) {}
              } else if (val && typeof val === 'object') {
                const achou = buscaPdfEmObjeto(val);
                if (achou) return achou;
              }
            }
            return null;
          }

          const bufEncontrado = buscaPdfEmObjeto(jsonDados);
          if (bufEncontrado) return bufEncontrado;

        } catch (_) {}

        try {
          const bufUtf8 = Buffer.from(String(dadosStr), 'utf8');
          const sig3 = bufUtf8.slice(0, 5).toString();
          if (sig3 === '%PDF-') {
            return bufUtf8;
          }
        } catch (_) {}

        return null;
      }

      for (const empresa of empresasParaProcessar) {
        try {
          let receiptRow = await dbGetReceiptByCompanyAndPa(empresa.id, pa);
          let fromCache = false;
          let receiptId = null;

          if (receiptRow) {
            fromCache = true;
            receiptId = receiptRow.id;
          } else {
            const payload = {
              contratante: { numero: contratante, tipo: 2 },
              autorPedidoDados: { numero: contratante, tipo: 2 },
              contribuinte: { numero: empresa.cnpj, tipo: 2 },
              pedidoDados: {
                idSistema: 'PGDASD',
                idServico: 'CONSULTIMADECREC14',
                versaoSistema: '1.0',
                dados: JSON.stringify({ periodoApuracao: paStr }),
              },
            };

            const apiResp = await axios.post(url, payload, { headers });
            const data = apiResp.data;

            if (snDebug) {
              console.log('--- RESPOSTA SERPRO CONSULTIMADECREC14 ---');
              console.log('status:', data.status);
              console.log('mensagens:', data.mensagens);
              console.log('dados (primeiros 200 chars):', String(data.dados).slice(0, 200));
            }

            if (data.status && data.status !== 200) {
              registrarSnResultado(false, 'consulta');
              resultados.push({
                tipo: 'consulta',
                cnpj: empresa.cnpj,
                razaoSocial: empresa.razaoSocial || '',
                sucesso: false,
                status: data.status,
                error: 'Erro de negócio retornado pela API.',
                mensagens: data.mensagens || null,
                receiptId: null,
                fromCache: false,
              });
              continue;
            }

            const pdfBuffer = decodePdfFromDados(data.dados);

            if (!pdfBuffer) {
              const statusApi = data.status || apiResp.status;
              const mensagensApi = data.mensagens || null;
              const temMensagemSucesso =
                Array.isArray(mensagensApi) &&
                mensagensApi.some(
                  (m) =>
                    m &&
                    typeof m.texto === 'string' &&
                    m.texto.toLowerCase().includes('sucesso')
                );

              if (temMensagemSucesso || statusApi === 200) {
                registrarSnResultado(true, 'consulta');

                resultados.push({
                  tipo: 'consulta',
                  cnpj: empresa.cnpj,
                  razaoSocial: empresa.razaoSocial || '',
                  sucesso: true,
                  status: statusApi,
                  error: null,
                  mensagens: mensagensApi,
                  receiptId: null,
                  fromCache: false,
                });
              } else {
                registrarSnResultado(false, 'consulta');

                resultados.push({
                  tipo: 'consulta',
                  cnpj: empresa.cnpj,
                  razaoSocial: empresa.razaoSocial || '',
                  sucesso: false,
                  status: statusApi,
                  error: 'Resposta não contém PDF válido em "dados".',
                  mensagens: mensagensApi,
                  receiptId: null,
                  fromCache: false,
                });
              }

              continue;
            }

            const saved = await dbSaveReceipt(empresa.id, pa, pdfBuffer);
            receiptId = saved.id;

            registrarSnResultado(true, 'consulta');
          }

          resultados.push({
            tipo: 'consulta',
            cnpj: empresa.cnpj,
            razaoSocial: empresa.razaoSocial || '',
            sucesso: true,
            status: 200,
            mensagens: null,
            receiptId,
            fromCache,
          });
        } catch (errConsulta) {
          let status = 500;
          let mensagens = null;
          let errorMsg = errConsulta.message;
          let logText = null;

          if (errConsulta.response) {
            status = errConsulta.response.status || 500;

            const raw = errConsulta.response.data;
            if (Buffer.isBuffer(raw)) {
              logText = raw.toString('utf8');
            } else if (typeof raw === 'string') {
              logText = raw;
            } else if (typeof raw === 'object' && raw !== null) {
              logText = JSON.stringify(raw);
            }

            if (logText) {
              try {
                const json = JSON.parse(logText);
                if (Array.isArray(json.mensagens)) {
                  mensagens = json.mensagens;
                }
              } catch (_) {}
            }
          }

          console.error(
            'Erro ao consultar recibo SN para CNPJ',
            empresa.cnpj,
            logText || errorMsg
          );

          registrarSnResultado(false, 'consulta');

          resultados.push({
            tipo: 'consulta',
            cnpj: empresa.cnpj,
            razaoSocial: empresa.razaoSocial || '',
            sucesso: false,
            status,
            error: errorMsg,
            mensagens,
            receiptId: null,
            fromCache: false,
          });
        }
      }

      res.json({
        resultados,
        resumoConsumo: buildResumoResponse(),
      });
    } catch (err) {
      console.error('Erro geral ao consultar últimos recibos SN:', err);
      res
        .status(500)
        .json({ error: err.message || 'Erro ao consultar recibos.' });
    }
  });

  return router;
};
