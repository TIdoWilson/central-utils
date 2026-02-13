const express = require("express");

/**
 * Router de ferramenta (v3.1)
 * - server.js monta: app.use("__API_BASE__", requireAuth, requireToolApi("__SLUG__"), router)
 * - Aqui dentro: aplicar requireCsrf SOMENTE em mutações.
 */
module.exports = function createToolRoutes(deps = {}) {
  const { requireCsrf, auditLog, service } = deps;

  const router = express.Router();

  // Health / ping (GET não precisa CSRF)
  router.get("/health", async (req, res) => {
    try {
      auditLog?.(req, `tool___SLUG___health`, "ok", { tool: "__SLUG__" });
      return res.json({ ok: true, tool: "__SLUG__", time: new Date().toISOString() });
    } catch (e) {
      auditLog?.(req, `tool___SLUG___health`, "error", { tool: "__SLUG__", error: String(e) });
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  // Exemplo de mutação (POST => CSRF obrigatório)
  router.post("/run", requireCsrf, async (req, res) => {
    const traceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const payload = req.body || {};
      auditLog?.(req, `tool___SLUG___run`, "ok", { traceId, payloadKeys: Object.keys(payload) });

      // Se houver service, use aqui:
      // const result = await service.run(payload);
      // return res.json({ ok: true, traceId, result });

      return res.json({ ok: true, traceId, message: "Stub: implemente a lógica no service e chame aqui." });
    } catch (e) {
      auditLog?.(req, `tool___SLUG___run`, "error", { traceId, error: String(e && e.message ? e.message : e) });
      return res.status(500).json({
        ok: false,
        error: "Erro interno ao executar.",
        traceId,
      });
    }
  });

  return router;
};
