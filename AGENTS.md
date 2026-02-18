# AGENTS.md — Integra Python Portal (v3.1)

Este repositório segue o padrão **Integra Python v3.1**. Antes de alterar código, leia este arquivo e (quando necessário) o documento completo:
- `docs/engineering/integra-python-v3.1.md`

## Regras essenciais (não-negociáveis)
- **Não quebrar URLs/endpoints**. Se precisar, manter alias/redirect.
- `server.js` **não** chama `listen()` (isso é do `worker.js`).
- Assets em `/public` continuam públicos (login precisa carregar CSS/JS).
- Bloquear bypass de `*.html`: redirecionar para rota limpa antes do `express.static`.
- CSRF obrigatório em mutações (exceto `POST /api/auth/login`), header `x-csrf-token`.
- Rate-limit obrigatório no login.
- `trust proxy` nunca `true` (usar `false` local e `1` atrás de nginx).
- `auditLog` único, tolerante (nunca derruba request).
- Compatibilidade: manter `req.auth.user` mesmo usando `req.user`.
- Páginas fixas apenas: `/login`, `/`, `/admin-usuarios`, `/logs`. Ferramentas via `GET /:toolSlug`.
- RBAC: `tool:<slug>` e `tool:*`; ADMIN acessa tudo (exceto não precisa perm). `RBAC_STRICT` controla fallback.
- **Proibido duplicar helpers/funções** (sobrescrita silenciosa).
- Toda correção de erro após teste de ferramenta deve atualizar a documentação da própria ferramenta com: sintoma, causa provável e solução.
- `FAQ-GLOBAL.md` deve receber apenas ocorrências relevantes e recorrentes (erros reais, armadilhas operacionais, decisões de operação); não registrar toda pergunta pontual do usuário.

## Arquitetura alvo
- `src/server.js`: bootstrap + segurança + mounts + páginas + rota dinâmica + socket + error handler.
- `src/routes/`: routers (`auth`, `admin`, `shared`, `tools/<slug>`).
- `src/services/`: lógica pesada (parse/IO/cálculos/integrações).

## Padrão UI interno (obrigatório para novas páginas)
- Toda página interna deve usar layout padrão com:
  - `<div class="nfe-layout">`
  - `<aside class="nfe-sidebar">` contendo `<button id="sidebarToggle">` e `<nav id="sidebarMenu"></nav>`
  - `<main class="nfe-main">` para o conteúdo da ferramenta
- O header global interno é injetado por `public/js/sidebar.js` (topbar compartilhada).
- Não criar botão local de logout por página (usar apenas logout global da sidebar/topbar).
- Front da página deve chamar `inicializarSidebar('<slug-ou-id>')` no `DOMContentLoaded`.
- Em páginas com API interna, usar `AuthClient.authFetch` (CSRF automático em mutações).

## Comandos padrão
- Criar ferramenta + atualizar docs/UI + verificar: `npm run tool:new -- --slug <slug> --title \"...\" --group \"...\" --api`
- Deploy na VPS (pull + deps + restart serviços): `npm run deploy:vps -- [branch]`
- Verificar: `npm run verify`
- Gerar docs: `npm run gen:docs`
- Criar ferramenta: `npm run scaffold:tool -- --slug <slug> --title "..." --group "..." --api`

### Publicar ferramenta nova no site (fluxo único)
1. Criar a ferramenta: `npm run tool:new -- --slug <slug> --title "..." --group "..." --api`
2. Commit + push para `main`.
3. Na VPS: `npm run deploy:vps -- main`

### Integração manual de ferramenta (quando não usar `tool:new`)
Se a ferramenta for criada manualmente, é obrigatório atualizar todos os pontos abaixo:
1. `api/*_core.py` + endpoint em `api/integra_api.py`.
2. Rota Node em `src/routes/tools/<slug>.routes.js`.
3. Mount da rota em `src/server.js` com `requireToolApi('<slug>')`.
4. Página `public/<slug>.html` e front `public/js/<slug>.js` usando `AuthClient.authFetch`.
5. Entrada no menu em `public/js/sidebar.js` com `id` igual ao slug.
6. Catálogo RBAC em `src/core/tool-catalog.json`.
7. Documentação da ferramenta em `docs/tools/<slug>.md` e índice em `docs/tools/index.md`.
8. Validar execução das APIs com Python do ambiente ativo (não assumir `.venv` válido).

## Checklist rápido (A–J)
A) login/logout/me sem regressão  
B) assets carregam em /login sem auth  
C) `/x.html` redireciona para `/x` e exige auth/RBAC  
D) USER com `tool:<slug>` acessa só aquela tool  
E) USER com `tool:*` não acessa admin pages/APIs  
F) ADMIN acessa tudo  
G) APIs antigas continuam no mesmo path  
H) Socket não vaza dados sem permissão  
I) auditLog não derruba request  
J) CSRF e rate-limit ok
