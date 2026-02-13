const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "tool-catalog.json");

function loadCatalog() {
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") return { version: "1.0", tools: [] };
  if (!Array.isArray(parsed.tools)) parsed.tools = [];
  return parsed;
}

function normalizeSlug(slug) {
  return String(slug || "").trim().toLowerCase();
}

function resolveAlias(slug) {
  const s = normalizeSlug(slug);
  const cat = loadCatalog();
  for (const t of cat.tools) {
    if (!t) continue;
    if (normalizeSlug(t.slug) === s) return s;
    const aliases = Array.isArray(t.aliases) ? t.aliases : [];
    if (aliases.map(normalizeSlug).includes(s)) return normalizeSlug(t.slug);
  }
  return s;
}

function getTools() {
  const cat = loadCatalog();
  return cat.tools.slice();
}

function getToolBySlug(slug) {
  const s = resolveAlias(slug);
  return getTools().find((t) => normalizeSlug(t.slug) === s) || null;
}

function isAdminOnly(slug) {
  const t = getToolBySlug(slug);
  return !!t?.adminOnly;
}

module.exports = {
  loadCatalog,
  getTools,
  getToolBySlug,
  isAdminOnly,
  resolveAlias,
};
