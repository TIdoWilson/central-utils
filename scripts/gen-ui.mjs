#!/usr/bin/env node
/**
 * Gera mapa de UI em modo seguro (não altera sidebar.js).
 * Saídas:
 * - docs/UI_MAP.md
 * - docs/ui-map.json
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "src", "core", "tool-catalog.json");
const DOCS_DIR = path.join(ROOT, "docs");
const OUT_MD = path.join(DOCS_DIR, "UI_MAP.md");
const OUT_JSON = path.join(DOCS_DIR, "ui-map.json");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) return { tools: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
    if (!parsed || typeof parsed !== "object") return { tools: [] };
    if (!Array.isArray(parsed.tools)) parsed.tools = [];
    return parsed;
  } catch {
    return { tools: [] };
  }
}

function main() {
  ensureDir(DOCS_DIR);

  const cat = loadCatalog();
  const tools = (cat.tools || []).slice();

  // agrupar por group
  const byGroup = new Map();
  for (const t of tools) {
    const group = t.group || "Geral";
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(t);
  }

  const groups = [...byGroup.keys()].sort((a, b) => a.localeCompare(b));
  for (const g of groups) {
    byGroup.get(g).sort((a, b) => String(a.title || a.slug).localeCompare(String(b.title || b.slug)));
  }

  // JSON
  const jsonOut = {
    generatedAt: new Date().toISOString(),
    groups: groups.map((g) => ({
      group: g,
      tools: byGroup.get(g).map((t) => ({
        slug: t.slug,
        title: t.title || t.slug,
        path: `/${t.slug}`,
        hasApi: !!t.hasApi,
        apiBase: t.apiBase || (t.hasApi ? `/api/${t.slug}` : null),
        adminOnly: !!t.adminOnly,
        aliases: Array.isArray(t.aliases) ? t.aliases : [],
      })),
    })),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(jsonOut, null, 2), "utf-8");

  // Markdown
  const md = [];
  md.push("# UI Map (Portal)");
  md.push("");
  md.push("Este arquivo é gerado automaticamente a partir de `src/core/tool-catalog.json`.");
  md.push("");
  for (const g of groups) {
    md.push(`## ${g}`);
    md.push("");
    for (const t of byGroup.get(g)) {
      const title = t.title || t.slug;
      const api = t.hasApi ? ` • API: \`${t.apiBase || "/api/" + t.slug}\`` : "";
      const admin = t.adminOnly ? " • **ADMIN**" : "";
      md.push(`- **${title}** — \`/${t.slug}\`${api}${admin}`);
      const aliases = Array.isArray(t.aliases) ? t.aliases : [];
      if (aliases.length) md.push(`  - alias: ${aliases.map((a) => "`/" + a + "`").join(", ")}`);
    }
    md.push("");
  }
  fs.writeFileSync(OUT_MD, md.join("\n"), "utf-8");

  console.log("[gen-ui] docs/UI_MAP.md e docs/ui-map.json gerados.");
}

main();
