const express = require('express');

module.exports = function createMitRoutes(deps) {
  const {
    requireCsrf,
    mitUpload,
    extrairCnpjContribuinteDeNomeArquivo,
    obterToken,
    createHttpsAgent,
    axios,
  } = deps;

  const router = express.Router();

  router.post(
    '/enviar-declaracao',
    requireCsrf,
    mitUpload.single('arquivo'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            ok: false,
            error: 'Nenhum arquivo foi enviado. Use o campo "arquivo" no formulário.'
          });
        }

        const nomeArquivo = req.file.originalname || 'MIT.json';
        const cnpjContribuinte = extrairCnpjContribuinteDeNomeArquivo(nomeArquivo);

        const conteudo = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
        let dadosMit;
        try {
          dadosMit = JSON.parse(conteudo);
        } catch (e) {
          return res.status(400).json({
            ok: false,
            error: 'Conteúdo do arquivo não é um JSON válido.',
            detalhe: String(e)
          });
        }

        const semMovimento = !!(dadosMit && dadosMit.DadosIniciais && dadosMit.DadosIniciais.SemMovimento);

        if (semMovimento) {
          if (!Object.prototype.hasOwnProperty.call(dadosMit, 'TransmissaoImediata')) {
            dadosMit.TransmissaoImediata = true;
          }
          if (
            dadosMit.DadosIniciais &&
            !Object.prototype.hasOwnProperty.call(
              dadosMit.DadosIniciais,
              'TransmissaoImediata'
            )
          ) {
            dadosMit.DadosIniciais.TransmissaoImediata = true;
          }
        }

        const payloadMit = {
          // Valores sensíveis/contratante vêm do .env para evitar hardcode no código.
          contratante: {
            numero: process.env.CNPJ_CONTRATANTE,
            tipo: 2
          },
          autorPedidoDados: {
            numero: process.env.CNPJ_CONTRATANTE,
            tipo: 2
          },
          contribuinte: {
            numero: cnpjContribuinte,
            tipo: 2
          },
          pedidoDados: {
            idSistema: 'MIT',
            idServico: 'ENCAPURACAO314',
            versaoSistema: '1.0',
            dados: JSON.stringify(dadosMit)
          }
        };

        if (!process.env.CNPJ_CONTRATANTE) {
          return res.status(500).json({
            ok: false,
            error: 'CNPJ_CONTRATANTE não configurado no .env.'
          });
        }

        const { accessToken, jwtToken } = await obterToken();

        const urlDeclarar =
          process.env.SERPRO_MIT_DECLARAR_URL ||
          process.env.SERPRO_DECLARAR_URL ||
          'https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1/Declarar';

        const httpsAgent = createHttpsAgent();

        const resp = await axios.post(urlDeclarar, payloadMit, {
          httpsAgent,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            jwt_token: jwtToken,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });

        const data = resp.data || {};
        const mensagens = Array.isArray(data.mensagens) ? data.mensagens : [];

        const sucessoEncerramento = mensagens.some(
          (m) =>
            m &&
            typeof m.codigo === 'string' &&
            m.codigo.includes('Sucesso-MIT-MSG_0024')
        );

        let protocoloEncerramento = null;
        let idApuracao = null;

        if (typeof data.dados === 'string') {
          try {
            const dadosObj = JSON.parse(data.dados);
            protocoloEncerramento = dadosObj.protocoloEncerramento || null;
            idApuracao = dadosObj.idApuracao || null;
          } catch {
            // se não for JSON, ignoramos
          }
        }

        return res.json({
          ok: true,
          sucessoEncerramento,
          protocoloEncerramento,
          idApuracao,
          serproStatus: resp.status,
          serproResponseId: data.responseId || null,
          serproMensagens: mensagens,
          serproRaw: data,
          payloadResumo: {
            contratante: payloadMit.contratante,
            contribuinte: payloadMit.contribuinte,
            periodo: dadosMit && dadosMit.PeriodoApuracao ? dadosMit.PeriodoApuracao : null,
            semMovimento
          }
        });
      } catch (err) {
        console.error('Erro em /api/mit/enviar-declaracao:', err);

        const status = err.response && err.response.status ? err.response.status : 500;
        const body = err.response && err.response.data ? err.response.data : null;

        return res.status(status).json({
          ok: false,
          error: 'Erro ao enviar declaração MIT para o Integra Contador.',
          detalhe: err.message || String(err),
          serproStatus: status,
          serproErro: body
        });
      }
    }
  );

  return router;
};
