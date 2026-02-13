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

  async function boot() {
    try {
      if (typeof inicializarSidebar === "function") {
        await inicializarSidebar(SLUG);
      }

      // Confere sessão (páginas internas devem estar autenticadas)
      const me = await AuthClient.authFetch("/api/auth/me", { method: "GET" });
      write({ me });

      const btn = $("btnAction");
      if (btn) btn.addEventListener("click", onAction);
    } catch (e) {
      write({ error: "Falha no boot", detail: String(e && e.message ? e.message : e) });
    }
  }

  async function onAction() {
    write("Executando ação…");

    try {
      // EXEMPLO (GET)
      // const r1 = await AuthClient.authFetch(`${API_BASE}/health`, { method: "GET" });
      // write({ health: r1 });

      // EXEMPLO (POST com CSRF automático via authFetch)
      // const r2 = await AuthClient.authFetch(`${API_BASE}/run`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ hello: "world" }),
      // });
      // write({ run: r2 });

      write("Ação (stub) concluída. Edite este arquivo para ligar nos endpoints reais.");
    } catch (e) {
      write({ error: "Falha ao executar ação", detail: String(e && e.message ? e.message : e) });
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
