# Integra Workspace Bootstrap (v3.1)

Este pacote adiciona governança + automação ao repositório:

- `AGENTS.md` (regras operacionais)
- `src/core/tool-catalog.json` + `src/core/tool-catalog.js`
- `scripts/`:
  - `init-workspace.mjs` (gera catálogo a partir de public/*.html e src/routes/tools)
  - `scaffold-tool.mjs` (cria tool completa: HTML/JS/routes/service/docs e atualiza catálogo)
  - `gen-docs.mjs` (gera docs/tools/index.md e stubs; cria mkdocs.yml se não existir)
  - `verify.mjs` (node --check + aviso de duplicações)
- `scripts/templates/` (templates usados pelo scaffold)
- `docs/` + `mkdocs.yml` (estrutura mínima de documentação)

## Como instalar no seu repo
1) Copie as pastas/arquivos deste zip para a raiz do seu projeto (mesclando com o que já existe).
2) Adicione scripts ao seu `package.json`:

```json
{
  "scripts": {
    "verify": "node scripts/verify.mjs",
    "init:workspace": "node scripts/init-workspace.mjs",
    "scaffold:tool": "node scripts/scaffold-tool.mjs",
    "gen:docs": "node scripts/gen-docs.mjs"
  }
}
```

3) Rode:
- `npm run init:workspace`
- `npm run gen:docs`
- `npm run verify`

## Criar uma ferramenta nova
```bash
npm run scaffold:tool -- --slug minha-ferramenta --title "Minha Ferramenta" --group "Geral" --api
npm run gen:docs
npm run verify
```

## MkDocs
- Instale mkdocs (e opcionalmente mkdocs-material)
- Rode: `mkdocs serve`

## Criar ferramenta nova (1 comando)
```bash
npm run tool:new -- --slug minha-ferramenta --title "Minha Ferramenta" --group "Geral" --api
```
