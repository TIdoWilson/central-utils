#!/usr/bin/env node
/**
 * Inicializa governança do repo:
 * - gera src/core/tool-catalog.json a partir de public/*.html e routes/tools/*.routes.js (quando existir)
 * - garante docs/ e mkdocs.yml (se não existir)
 *
 * Uso:
 *   node scripts/init-workspace.mjs
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const PUBLIC_DIR = path.join(ROOT, "public");
const ROUTES_TOOLS_DIR = path.join(ROOT, "src", "routes", "tools");
const CATALOG_PATH = path.join(ROOT, "src", "core", "tool-catalog.json");

const FIXED_PAGES = new Set(["login", "home", "admin-usuarios", "logs"]);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function humanizeSlug(slug) {
  // simples: "pdf-a" -> "PDF A", "separador-ferias-funcionario" -> "Separador Ferias Funcionario"
  const words = String(slug || "")
    .replace(/[-_.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const out = words.map((w) => {
    if (w.toUpperCase() === "PDF") return "PDF";
    if (w.toUpperCase() === "IRPF") return "IRPF";
    if (w.length <= 3 && /^[a-z]+$/i.test(w)) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  });

  return out.join(" ");
}

function detectToolsFromPublic() {
  if (!fs.existsSync(PUBLIC_DIR)) return [];
  const files = fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith(".html"));
  const slugs = files.map((f) => f.replace(/\.html$/i, ""));
  return slugs.filter((s) => s && !FIXED_PAGES.has(s));
}

function detectToolsWithApi() {
  if (!fs.existsSync(ROUTES_TOOLS_DIR)) return new Set();
  const files = fs.readdirSync(ROUTES_TOOLS_DIR).filter((f) => f.endsWith(".routes.js"));
  const slugs = files.map((f) => f.replace(/\.routes\.js$/i, ""));
  return new Set(slugs);
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) return { version: "1.0", generatedAt: null, tools: [] };
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  } catch {
    return { version: "1.0", generatedAt: null, tools: [] };
  }
}

function saveCatalog(cat) {
  cat.generatedAt = new Date().toISOString();
  ensureDir(path.dirname(CATALOG_PATH));
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(cat, null, 2), "utf-8");
}

function main() {
  const pageTools = detectToolsFromPublic();
  const apiTools = detectToolsWithApi();

  const cat = loadCatalog();
  const bySlug = new Map((cat.tools || []).map((t) => [String(t.slug || "").toLowerCase(), t]));

  for (const slug of pageTools) {
    const key = String(slug).toLowerCase();
    const existing = bySlug.get(key);

    const tool = existing || {
      slug,
      title: humanizeSlug(slug),
      group: "Geral",
      hasPage: true,
      hasApi: false,
      apiBase: `/api/${slug}`,
      adminOnly: false,
      aliases: [],
      sharedApisUsed: [],
    };

    tool.hasPage = true;
    tool.hasApi = apiTools.has(slug);
    tool.apiBase = tool.hasApi ? `/api/${slug}` : tool.apiBase || `/api/${slug}`;

    bySlug.set(key, tool);
  }

  // Também incluir tools que tenham API mas não tenham página ainda
  for (const slug of apiTools) {
    const key = String(slug).toLowerCase();
    const existing = bySlug.get(key);
    const tool = existing || {
      slug,
      title: humanizeSlug(slug),
      group: "Geral",
      hasPage: false,
      hasApi: true,
      apiBase: `/api/${slug}`,
      adminOnly: false,
      aliases: [],
      sharedApisUsed: [],
    };
    tool.hasApi = true;
    tool.apiBase = `/api/${slug}`;
    bySlug.set(key, tool);
  }

  cat.tools = [...bySlug.values()].sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  saveCatalog(cat);

  console.log(`[init-workspace] tool-catalog gerado com ${cat.tools.length} tools em ${path.relative(ROOT, CATALOG_PATH)}`);
}

main();
