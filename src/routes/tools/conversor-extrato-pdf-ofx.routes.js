const express = require("express");
const FormData = require("form-data");

module.exports = function createConversorExtratoPdfOfxRoutes(deps) {
  const { requireCsrf, upload, axios, PY_API_URL } = deps;

  const router = express.Router();

  router.post("/processar", requireCsrf, upload.array("arquivos", 30), async (req, res) => {
    try {
      const arquivos = req.files || [];
      if (!arquivos.length) {
        return res.status(400).json({ ok: false, error: "Envie pelo menos um arquivo PDF." });
      }

      const form = new FormData();
      for (const arquivo of arquivos) {
        form.append("arquivos", arquivo.buffer, {
          filename: arquivo.originalname || "extrato.pdf",
          contentType: arquivo.mimetype || "application/pdf",
        });
      }

      const bankid = String(req.body?.bankid || "0000").trim() || "0000";
      const acctid = String(req.body?.acctid || "").trim();
      form.append("bankid", bankid);
      if (acctid) {
        form.append("acctid", acctid);
      }

      const pyResp = await axios.post(`${PY_API_URL}/api/conversor-extrato-pdf-ofx/processar`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 300000,
      });

      return res.json(pyResp.data);
    } catch (err) {
      const status = err.response?.status || 500;
      const detail = err.response?.data?.detail || err.response?.data || err.message || "Erro";
      return res.status(status).json({
        ok: false,
        error: typeof detail === "string" ? detail : JSON.stringify(detail),
      });
    }
  });

  return router;
};
