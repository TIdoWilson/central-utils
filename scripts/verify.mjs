#!/usr/bin/env node
/**
 * Verificações mínimas (v3.1).
 * - node --check em arquivos críticos
 * - alerta de duplicação de funções (heurística)
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();

function runNodeCheck(filePath) {
  const rel = path.relative(ROOT, filePath);
  const r = spawnSync(process.execPath, ["--check", filePath], { stdio: "pipe" });
  if (r.status !== 0) {
    console.error(`\n[verify] node --check falhou: ${rel}\n${r.stderr.toString("utf-8")}`);
    return false;
  }
  console.log(`[verify] OK: ${rel}`);
  return true;
}

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (st.isFile() && p.endsWith(".js")) out.push(p);
    }
  }
  return out;
}

function findDuplicatesInFile(filePath) {
  const src = fs.readFileSync(filePath, "utf-8");
  const names = [];

  // function foo(
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z0-9_]+)\s*\(/g)) names.push(m[1]);

  // const foo = ( / async (
  for (const m of src.matchAll(/\bconst\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/g)) names.push(m[1]);

  // function foo = ... (ignored)
  const seen = new Map();
  const dups = new Set();
  for (const n of names) {
    seen.set(n, (seen.get(n) || 0) + 1);
    if (seen.get(n) >= 2) dups.add(n);
  }
  return [...dups];
}

function main() {
  let ok = true;

  const serverPath = path.join(ROOT, "src", "server.js");
  if (fs.existsSync(serverPath)) ok = runNodeCheck(serverPath) && ok;

  const routesDir = path.join(ROOT, "src", "routes");
  for (const f of listJsFiles(routesDir)) ok = runNodeCheck(f) && ok;

  // Duplicate warnings in server.js (most critical)
  if (fs.existsSync(serverPath)) {
    const dups = findDuplicatesInFile(serverPath);
    if (dups.length) {
      console.warn(`\n[verify] AVISO: possíveis duplicações em src/server.js: ${dups.join(", ")}`);
      console.warn("[verify] Recomendado mover helpers para src/services e manter 1 fonte de verdade.\n");
    }
  }

  if (!ok) process.exit(1);
  console.log("\n[verify] concluído.");
}

main();
