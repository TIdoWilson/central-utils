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

## Arquitetura alvo
- `src/server.js`: bootstrap + segurança + mounts + páginas + rota dinâmica + socket + error handler.
- `src/routes/`: routers (`auth`, `admin`, `shared`, `tools/<slug>`).
- `src/services/`: lógica pesada (parse/IO/cálculos/integrações).

## Comandos padrão
- Criar ferramenta + atualizar docs/UI + verificar: `npm run tool:new -- --slug <slug> --title \"...\" --group \"...\" --api`
- Verificar: `npm run verify`
- Gerar docs: `npm run gen:docs`
- Criar ferramenta: `npm run scaffold:tool -- --slug <slug> --title "..." --group "..." --api`

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
