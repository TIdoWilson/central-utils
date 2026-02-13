const path = require("path");
const fs = require("fs");

/**
 * Service de ferramenta (v3.1)
 * - Não conhece req/res
 * - Recebe deps (DATA_DIR, axios, etc.) via construtor
 * - Funções puras quando possível
 */
module.exports = function createToolService(deps = {}) {
  const { DATA_DIR, axios } = deps;

  const TOOL_DIR = DATA_DIR ? path.join(DATA_DIR, "__SLUG__") : null;

  function ensureDir() {
    if (!TOOL_DIR) return;
    fs.mkdirSync(TOOL_DIR, { recursive: true });
  }

  async function run(payload = {}) {
    ensureDir();

    return {
      ok: true,
      tool: "__SLUG__",
      payloadKeys: Object.keys(payload || {}),
    };
  }

  return { run };
};
