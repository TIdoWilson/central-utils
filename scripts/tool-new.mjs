#!/usr/bin/env node
/**
 * Wrapper para criar nova ferramenta + atualizar docs/UI + verificar.
 *
 * Uso:
 *   npm run tool:new -- --slug x --title "X" --group "Geral" --api
 *
 * Observação:
 * - Repassa argumentos SOMENTE para scaffold-tool.
 * - gen-docs / gen-ui / verify rodam sem args (evita vazamento de parâmetros).
 */
import { spawnSync } from "child_process";
import path from "path";
import process from "process";
import fs from "fs";

const ROOT = process.cwd();

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) process.exit(r.status || 1);
}

function main() {
  const node = process.execPath;
  const args = process.argv.slice(2);

  const scaffold = path.join(ROOT, "scripts", "scaffold-tool.mjs");
  const genDocs = path.join(ROOT, "scripts", "gen-docs.mjs");
  const genUi = path.join(ROOT, "scripts", "gen-ui.mjs");
  const verify = path.join(ROOT, "scripts", "verify.mjs");

  if (!fs.existsSync(scaffold)) {
    console.error("[tool:new] scripts/scaffold-tool.mjs não encontrado.");
    process.exit(1);
  }

  run(node, [scaffold, ...args]);

  if (fs.existsSync(genDocs)) run(node, [genDocs]);
  else console.warn("[tool:new] scripts/gen-docs.mjs não encontrado (pulando).");

  if (fs.existsSync(genUi)) run(node, [genUi]);
  else console.warn("[tool:new] scripts/gen-ui.mjs não encontrado (pulando).");

  if (fs.existsSync(verify)) run(node, [verify]);
  else console.warn("[tool:new] scripts/verify.mjs não encontrado (pulando).");

  console.log("[tool:new] concluído.");
}

main();
