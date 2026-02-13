#!/usr/bin/env node
/**
 * Scaffold de ferramenta (v3.1).
 *
 * Uso:
 *   npm run scaffold:tool -- --slug dimob --title "DIMOB" --group "Fiscal" --api
 *   npm run scaffold:tool -- --slug minha-tool --title "Minha Tool" --group "Geral" --no-api
 *
 * Cria (se não existirem):
 * - public/<slug>.html
 * - public/js/<slug>.js
 * - src/routes/tools/<slug>.routes.js (se --api, default: true)
 * - src/services/<slug>.service.js   (se --api)
 * - docs/tools/<slug>.md
 * Atualiza:
 * - src/core/tool-catalog.json
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function parseArgs(argv) {
  const out = { api: null, slug: null, title: null, group: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") out.slug = argv[++i];
    else if (a === "--title") out.title = argv[++i];
    else if (a === "--group") out.group = argv[++i];
    else if (a === "--api") out.api = true;
    else if (a === "--no-api") out.api = false;
    else if (a === "--force") out.force = true;
  }
  return out;
}

function die(msg) {
  console.error("[scaffold] " + msg);
  process.exit(1);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readFileIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf-8");
}

function writeFileSafe(p, content, force = false) {
  ensureDir(path.dirname(p));
  if (fs.existsSync(p) && !force) {
    console.log(`[scaffold] skip (exists): ${path.relative(ROOT, p)}`);
    return false;
  }
  fs.writeFileSync(p, content, "utf-8");
  console.log(`[scaffold] write: ${path.relative(ROOT, p)}`);
  return true;
}

function validSlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return false;
  if (s.includes("..") || s.includes("/") || s.includes("\\") ) return false;
  return /^[a-z0-9._-]+$/i.test(s);
}

function loadTemplate(name) {
  const p = path.join(ROOT, "scripts", "templates", name);
  const raw = readFileIfExists(p);
  if (!raw) die(`Template não encontrado: ${path.relative(ROOT, p)}`);
  return raw;
}

function fill(tpl, vars) {
  return tpl
    .replaceAll("__SLUG__", vars.slug)
    .replaceAll("__TITLE__", vars.title)
    .replaceAll("__GROUP__", vars.group)
    .replaceAll("__API_BASE__", vars.apiBase);
}

function humanizeSlug(slug) {
  const words = String(slug || "").replace(/[-_.]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const out = words.map((w) => {
    if (w.toUpperCase() === "PDF") return "PDF";
    if (w.toUpperCase() === "IRPF") return "IRPF";
    if (w.length <= 3 && /^[a-z]+$/i.test(w)) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
  return out.join(" ");
}

function loadCatalog(catalogPath) {
  if (!fs.existsSync(catalogPath)) return { version: "1.0", generatedAt: null, tools: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
    if (!parsed || typeof parsed !== "object") return { version: "1.0", generatedAt: null, tools: [] };
    if (!Array.isArray(parsed.tools)) parsed.tools = [];
    return parsed;
  } catch {
    return { version: "1.0", generatedAt: null, tools: [] };
  }
}

function upsertTool(cat, tool) {
  const key = String(tool.slug).toLowerCase();
  const idx = (cat.tools || []).findIndex((t) => String(t.slug || "").toLowerCase() === key);
  if (idx >= 0) cat.tools[idx] = { ...cat.tools[idx], ...tool };
  else cat.tools.push(tool);
  cat.tools.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  cat.generatedAt = new Date().toISOString();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = String(args.slug || "").trim().toLowerCase();
  if (!validSlug(slug)) die("Slug inválido. Use apenas [a-z0-9._-] e sem .. / \\");

  const title = String(args.title || "").trim() || humanizeSlug(slug);
  const group = String(args.group || "").trim() || "Geral";
  const api = args.api === null ? true : !!args.api;

  const vars = { slug, title, group, apiBase: `/api/${slug}` };

  // Templates
  const htmlTpl = loadTemplate("tool.page.html.tpl");
  const jsTpl = loadTemplate("tool.page.js.tpl");
  const routesTpl = loadTemplate("tool.routes.js.tpl");
  const serviceTpl = loadTemplate("tool.service.js.tpl");
  const docTpl = loadTemplate("tool.doc.md.tpl");

  // Targets
  const htmlPath = path.join(ROOT, "public", `${slug}.html`);
  const jsPath = path.join(ROOT, "public", "js", `${slug}.js`);
  const routesPath = path.join(ROOT, "src", "routes", "tools", `${slug}.routes.js`);
  const servicePath = path.join(ROOT, "src", "services", `${slug}.service.js`);
  const docPath = path.join(ROOT, "docs", "tools", `${slug}.md`);

  writeFileSafe(htmlPath, fill(htmlTpl, vars), args.force);
  writeFileSafe(jsPath, fill(jsTpl, vars), args.force);

  if (api) {
    writeFileSafe(routesPath, fill(routesTpl, vars), args.force);
    writeFileSafe(servicePath, fill(serviceTpl, vars), args.force);
  }

  writeFileSafe(docPath, fill(docTpl, vars), args.force);

  // Update catalog
  const catalogPath = path.join(ROOT, "src", "core", "tool-catalog.json");
  const cat = loadCatalog(catalogPath);

  upsertTool(cat, {
    slug,
    title,
    group,
    hasPage: true,
    hasApi: api,
    apiBase: api ? vars.apiBase : null,
    adminOnly: false,
    aliases: [],
    sharedApisUsed: [],
  });

  ensureDir(path.dirname(catalogPath));
  fs.writeFileSync(catalogPath, JSON.stringify(cat, null, 2), "utf-8");
  console.log(`[scaffold] catalog atualizado: ${path.relative(ROOT, catalogPath)}`);

  console.log("[scaffold] pronto.");
}

main();
