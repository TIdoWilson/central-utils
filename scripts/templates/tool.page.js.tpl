/* global AuthClient, inicializarSidebar */

(function () {
  const SLUG = "__SLUG__";
  const API_BASE = "__API_BASE__"; // ex.: /api/__SLUG__

  function $(id) {
    return document.getElementById(id);
  }

  function write(msg) {
    const out = $("output");
    if (!out) return;
    const line = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
    out.textContent = (out.textContent ? out.textContent + "\n" : "") + line;
  }

  async function safeJson(resp) {
    try {
      return await resp.json();
    } catch (_) {
      return null;
    }
  }

  async function boot() {
    try {
      if (typeof inicializarSidebar === "function") {
        await inicializarSidebar(SLUG);
      }

      // Confere sessão (páginas internas devem estar autenticadas)
      const meResp = await AuthClient.authFetch("/api/auth/me", { method: "GET" });
      const me = await safeJson(meResp);
      if (!meResp.ok) throw new Error("Sessão inválida.");
      write({ user: me?.user || null });

      const btn = $("btnAction");
      if (btn) btn.addEventListener("click", onAction);
    } catch (e) {
      write({ error: "Falha no boot", detail: String(e && e.message ? e.message : e) });
    }
  }

  async function onAction() {
    write("Executando ação…");

    try {
      // EXEMPLO (GET /health)
      const r1 = await AuthClient.authFetch(`${API_BASE}/health`, { method: "GET" });
      const j1 = await safeJson(r1);
      write({ healthStatus: r1.status, health: j1 });

      // EXEMPLO (POST com CSRF automático via authFetch)
      // const r2 = await AuthClient.authFetch(`${API_BASE}/run`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ hello: "world" }),
      // });
      // const j2 = await safeJson(r2);
      // write({ runStatus: r2.status, run: j2 });

      write("Ação concluída. Ajuste este arquivo para ligar nos endpoints reais da ferramenta.");
    } catch (e) {
      write({ error: "Falha ao executar ação", detail: String(e && e.message ? e.message : e) });
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
