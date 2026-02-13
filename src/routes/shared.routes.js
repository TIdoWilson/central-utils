const express = require('express');

module.exports = function createSharedRoutes({ axios }) {
  const router = express.Router();

  // Busca CEP na BrasilAPI
  router.get('/cep/:cep', async (req, res) => {
    try {
      const cepRaw = req.params.cep || '';
      const cep = cepRaw.replace(/\D/g, '');

      if (!cep || cep.length !== 8) {
        return res.status(400).json({ ok: false, error: 'CEP deve ter 8 dígitos.' });
      }

      const { data } = await axios.get(`https://brasilapi.com.br/api/cep/v2/${cep}`);
      res.json({ ok: true, data });
    } catch (err) {
      if (err.response) {
        const status = err.response.status || 500;
        let msg = 'Erro ao consultar CEP.';
        if (status === 400) msg = 'CEP inválido ou mal formatado.';
        if (status === 404) msg = 'CEP não encontrado.';
        if (status === 500) msg = 'Erro interno no serviço de CEP.';
        return res.status(status).json({
          ok: false,
          error: msg,
          detail: err.response.data || null,
        });
      }
      console.error('Erro ao chamar BrasilAPI CEP:', err.message);
      res.status(500).json({ ok: false, error: 'Erro interno ao consultar CEP.' });
    }
  });

  // Busca CNPJ na BrasilAPI
  router.get('/cnpj/:cnpj', async (req, res) => {
    try {
      const cnpjRaw = req.params.cnpj || '';
      const cnpj = cnpjRaw.replace(/\D/g, '');

      if (!cnpj || cnpj.length !== 14) {
        return res.status(400).json({ ok: false, error: 'CNPJ deve ter 14 dígitos.' });
      }

      const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      res.json({ ok: true, data });
    } catch (err) {
      if (err.response) {
        const status = err.response.status || 500;
        let msg = 'Erro ao consultar CNPJ.';
        if (status === 400) msg = 'CNPJ inválido ou mal formatado.';
        if (status === 404) msg = 'CNPJ não encontrado.';
        if (status === 500) msg = 'Erro interno no serviço de CNPJ.';
        return res.status(status).json({
          ok: false,
          error: msg,
          detail: err.response.data || null,
        });
      }
      console.error('Erro ao chamar BrasilAPI CNPJ:', err.message);
      res.status(500).json({ ok: false, error: 'Erro interno ao consultar CNPJ.' });
    }
  });

  return router;
};
