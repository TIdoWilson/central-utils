#!/usr/bin/env node
/**
 * Gera docs a partir do tool-catalog.
 * - docs/tools/index.md (lista)
 * - cria stubs docs/tools/<slug>.md se não existir
 * - cria mkdocs.yml se não existir (modo seguro: não sobrescreve)
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "src", "core", "tool-catalog.json");
const DOCS_DIR = path.join(ROOT, "docs");
const TOOLS_DIR = path.join(DOCS_DIR, "tools");
const ENGINEERING_DIR = path.join(DOCS_DIR, "engineering");
const MKDOCS_YML = path.join(ROOT, "mkdocs.yml");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) return { tools: [] };
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
}

function writeIfMissing(p, content) {
  ensureDir(path.dirname(p));
  if (fs.existsSync(p)) return false;
  fs.writeFileSync(p, content, "utf-8");
  return true;
}

function writeFile(p, content) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, "utf-8");
}

function main() {
  ensureDir(DOCS_DIR);
  ensureDir(TOOLS_DIR);
  ensureDir(ENGINEERING_DIR);

  const cat = loadCatalog();
  const tools = Array.isArray(cat.tools) ? cat.tools.slice() : [];
  tools.sort((a, b) => String(a.group || "").localeCompare(String(b.group || "")) || String(a.slug).localeCompare(String(b.slug)));

  // index.md
  const lines = [];
  lines.push("# Ferramentas");
  lines.push("");
  lines.push("Esta lista é gerada automaticamente a partir de `src/core/tool-catalog.json`.");
  lines.push("");

  let currentGroup = null;
  for (const t of tools) {
    const group = t.group || "Geral";
    if (group !== currentGroup) {
      currentGroup = group;
      lines.push(`## ${group}`);
      lines.push("");
    }
    const title = t.title || t.slug;
    lines.push(`- [${title}](./${t.slug}.md) — \`/${t.slug}\`${t.hasApi ? ` • API: \`${t.apiBase || "/api/"+t.slug}\`` : ""}`);
  }
  lines.push("");

  writeFile(path.join(TOOLS_DIR, "index.md"), lines.join("\n"));
  console.log("[gen-docs] docs/tools/index.md atualizado.");

  // Stubs
  for (const t of tools) {
    const p = path.join(TOOLS_DIR, `${t.slug}.md`);
    if (!fs.existsSync(p)) {
      const stub = `# ${t.title || t.slug}\n\n- **Slug:** \`${t.slug}\`\n- **Grupo:** ${t.group || "Geral"}\n- **API Base:** \`${t.apiBase || "/api/"+t.slug}\`\n\n## O que esta ferramenta faz\n\n## Como acessar\n- Página: \`/${t.slug}\`\n- Permissão: \`tool:${t.slug}\` ou \`tool:*\`\n\n## Endpoints\n- \`GET ${(t.apiBase || "/api/"+t.slug)}/health\`\n`;
      fs.writeFileSync(p, stub, "utf-8");
      console.log(`[gen-docs] stub criado: docs/tools/${t.slug}.md`);
    }
  }

  // mkdocs.yml (safe)
  if (!fs.existsSync(MKDOCS_YML)) {
    const yml = `site_name: Integra Python Portal\nnav:\n  - Home: index.md\n  - Ferramentas: tools/index.md\n  - Engenharia: engineering/integra-python-v3.1.md\n`;
    fs.writeFileSync(MKDOCS_YML, yml, "utf-8");
    console.log("[gen-docs] mkdocs.yml criado.");
  } else {
    console.log("[gen-docs] mkdocs.yml já existe (não alterado).");
  }

  // docs/index.md (safe)
  writeIfMissing(path.join(DOCS_DIR, "index.md"), "# Integra Python Portal\n\nDocumentação do portal.\n");

  console.log("[gen-docs] pronto.");
}

main();
