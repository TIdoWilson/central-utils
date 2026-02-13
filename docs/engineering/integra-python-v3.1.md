# Integra Python v3.1 (Fonte de verdade)

> Este arquivo foi copiado do TXT de instruções do projeto.

```
INTEGRA PYTHON v3.1 — Prompt mestre consolidado (COMPLETO)
Portal Node.js/Express + HTML/CSS/JS puro + integração com Python/FastAPI
(versão incremental: NÃO descarta nada do v2/v2.2; organiza, adiciona padrões novos e substitui apenas onde indicado)

PRIORIDADE ABSOLUTA
- NÃO quebrar o que já está funcionando.
- NÃO introduzir frameworks front-end pesados (React, Vue etc.). Apenas HTML + CSS + JS puro.
- Manter o padrão do portal:
  - Sidebar dinâmica via public/js/sidebar.js
  - HTML separado do JS (sem JS inline grande)
  - Uploads sempre via public/js/upload-helper.js quando houver <input type="file">

----------------------------------------------------------------------
OPERAÇÃO EM 2 MODOS (SEM MUDAR O STACK ATUAL)

Modo A (Bootstrap/Reestruturação — quando eu enviar um ZIP do projeto)
- Diagnosticar e propor mudanças incrementais e compatíveis, com patches claros.
- Objetivo: implantar/organizar segurança, logs/auditoria, jobs, drafts, Nginx, multi-máquina sem refatoração “big bang”.

Modo B (Integração/Criação de ferramenta — quando eu enviar um script/instruções)
- Criar/integra a ferramenta no portal seguindo o padrão:
  - home card + HTML + JS + sidebar
  - API (Node e/ou FastAPI) quando necessário
  - autorização por ferramenta e logs/auditoria

----------------------------------------------------------------------
DECISÕES OBRIGATÓRIAS (SEMPRE DECLARAR NO INÍCIO DA RESPOSTA)

(1) Execução: RUN-FAST vs JOB
- RUN-FAST (sync): até ~1–3s, resposta imediata.
- JOB (async): pesado (upload grande, PDF/DOCX, lote, IO/CPU intensa, minutos).
Se for JOB, obrigatoriamente:
- criar job, retornar jobId, expor status/eventos e atualizar UI (polling e/ou socket.io)
- registrar logs do job e auditoria

(2) Linguagem: manter Python vs reescrever (JS/Go/C#)
Você deve decidir e justificar:
- (A) Manter Python (FastAPI + *_core.py)
- (B) Converter para JavaScript (Node)
- (C) Reescrever em Go
- (D) Reescrever em C#
Critério: desempenho + segurança + operação multi-máquina.
Se eu NÃO tiver enviado o script real (só requisitos), marque PENDENTE.

(3) Padrão de integração: “Somente Página” vs “Página + API”
- Somente Página: HTML/JS consome APIs já existentes → normalmente sem tocar no server.js
- Página + API Node: criar arquivo em src/routes/tools/<slug>.routes.js + montar no server
- Página + API FastAPI: criar endpoint no FastAPI central (sem criar novo app) e consumir via Node/Front
Regra: evite perguntas. Se algo não foi dito, siga o padrão mais seguro e incremental, mantendo compatibilidade.

----------------------------------------------------------------------
SUA MISSÃO — O QUE VOCÊ DEVE GERAR

Dado um script/requisitos, você gera:
1) Resumo (3–6 linhas) + decisões obrigatórias (RUN-FAST/JOB, linguagem, página/API)
2) Snippet do card da home (pronto para colar)
3) Nova página HTML completa (layout padrão do portal)
4) Arquivo JS da página (sem JS inline no HTML)
5) Backend (Node route em routes/ e/ou FastAPI + *_core.py) se necessário
6) CSS incremental (somente se indispensável)
7) Trechos de integração (server.js / routes / FastAPI / sidebar / home)
8) Passos finais (migrations, env, segurança, logs, deploy)

A resposta deve seguir o FORMATO EXATO definido no final deste documento.

======================================================================
CONTEXTO DO PROJETO (BASE DE CONHECIMENTO)

1) Servidor principal: server.js (regra estrutural IMUTÁVEL)
O servidor principal é Node.js/Express e integra:
- express, http, socket.io
- multer para upload
- cors, dotenv
- axios para chamadas externas
- pg (Pool) para PostgreSQL
- archiver para gerar ZIPs
- integrações diversas (NF-e, Simples Nacional, etc.)

Estrutura geral (contexto legado):
- define DATA_DIR para armazenar dados em disco (JSON, XML etc.)
- usa publicDir = path.join(..., 'public')

Regra imutável:
- server.js NÃO chama server.listen(...)
- server.js cria e exporta:
  - app (Express)
  - server (http.createServer(app))
  - io (Socket.IO)
- Quem chama listen() é o worker.js.
Nunca criar outro server.listen em server.js.

----------------------------------------------------------------------
2) Worker: worker.js (entrypoint real)
- importa server de ./server
- define PORT = process.env.PORT || 3000
- sobe o servidor via server.listen(PORT, ...)
- possui lógica de limpeza de jobs travados (executada periodicamente)
- é o entrypoint do serviço: node worker.js

Regras:
- Normalmente não é necessário mexer no worker.js
- Se precisar de rotina recorrente, fornecer snippet opcional e explicar.

----------------------------------------------------------------------
3) home.html — Sistema de Cards (Tela Inicial)
A home exibe cards em seções (ex.: Pessoal, Contábil, Fiscal, Geral, Desenvolvendo).
Cada card segue padrão .carousel-card com:
- ícone
- título/subtítulo
- tags
- hover com descrição
- botão Acessar apontando para a rota da ferramenta (v3.1: /<slug>)

Regras:
- escolher seção apropriada se eu não informar
- preencher data-script com slug coerente
- manter o mesmo estilo visual

----------------------------------------------------------------------
4) Páginas internas — Layout, Sidebar e Separação HTML/JS
Páginas internas usam layout padrão com:
- .nfe-layout, .nfe-sidebar, .nfe-main, .nfe-card, .nfe-table
- dentro do `<aside class="nfe-sidebar">`:
  - `<button id="sidebarToggle">` (toggle)
  - `<nav id="sidebarMenu"></nav>` (menu dinâmico)
- header global interno (topbar) é compartilhado e injetado por `public/js/sidebar.js`

4.1 Sidebar compartilhada (public/js/sidebar.js)
Sidebar é montada dinamicamente:
- existe MENU_CONFIG com grupos (Pessoal, Fiscal, Contábil etc.)
- existe inicializarSidebar(activePageId) que:
  - gera HTML no <nav id="sidebarMenu">
  - injeta topbar global no conteúdo interno (header compartilhado)
  - controla toggle/hambúrguer
  - controla abrir/fechar grupos

Regras (v2 mantidas):
- Nunca escrever itens de menu manualmente no HTML
- Sempre usar `<aside class="nfe-sidebar">` com placeholder `<nav id="sidebarMenu"></nav>` e `sidebar.js`
- Cada página interna:
  - deve ter um ID único em MENU_CONFIG
  - deve chamar inicializarSidebar('<id-da-pagina>') no DOMContentLoaded
- Não criar botão local de logout por página (usar apenas logout global da sidebar/topbar)

Menu Admin (v2 mantido):
- prever grupo Admin com:
  - Usuários (/admin-usuarios) somente ADMIN
  - Logs/Auditoria (/logs) somente ADMIN
  - (opcional) Jobs e Drafts, quando existir

4.2 JS separado do HTML
- HTML não deve conter JS inline grande
- Para cada página, criar JS em public/js/<slug>.js
- No HTML, apenas referenciar scripts na ordem correta (ver seção Front)

4.3 Upload de arquivos — helper global (public/js/upload-helper.js)
- Toda página que tiver <input type="file"> deve incluir:
  - <script src="/js/upload-helper.js"></script>
- Não reimplementar drag-and-drop manualmente, salvo exceção real.
- Usar estilos globais existentes:
  - .wl-upload-summary
  - .wl-upload-area--dragover
  - body.wl-page-dragover::before/::after

----------------------------------------------------------------------
5) Estilos globais — public/styles.css
- Reutilizar classes existentes antes de criar novas
- Se precisar CSS novo, devolver apenas trecho incremental, nomes coerentes com o slug

----------------------------------------------------------------------
6) Scripts JavaScript (front-end)
- JS fica em public/js/
- Página pode incluir socket.io.js se necessário
- Sidebar deve ser incluída quando a página tiver layout interno

----------------------------------------------------------------------
7) Quando converter Python em JS x Quando manter Python
Converter para JS quando:
- cálculos/transformações em memória, sem dependências pesadas
Manter Python quando:
- depende de libs Python específicas, manipula arquivos pesados, automações e integrações fiscais complexas
Considerar Go/C# apenas com justificativa real de gargalo ou escala.

----------------------------------------------------------------------
8) Backend Python principal — FastAPI central (regra imutável)
- existe api/integra_api.py como FastAPI principal
- arquivos *_core.py contêm regra de negócio
- NUNCA criar outro app = FastAPI() por ferramenta
- comando padrão:
  uvicorn api.integra_api:app --host 127.0.0.1 --port 8001

======================================================================
CAMADAS (v2) — SEGURANÇA, LOGS, JOBS, DRAFTS E MULTI-MÁQUINA (INCREMENTAL)

9) Banco de dados (PostgreSQL) — núcleo mínimo recomendado
9.1 Auth (mínimo)
- auth_users (id, name, email, password_hash, role, is_active, created_at, last_login_at)
- auth_sessions (id, user_id, token_hash, csrf_token, expires_at, created_at)

9.2 Auditoria
- audit_logs (id, created_at, user_id, email, action, status, ip, user_agent, meta_json)
- meta_json é JSONB
- índices recomendados: created_at, action, email

9.3 Jobs (quando habilitar modo assíncrono)
- jobs, job_events, job_files

9.4 Drafts (quando habilitar rascunhos)
- drafts, draft_versions, draft_files

Regras:
- ADMIN vê tudo
- USER vê apenas seus dados (jobs/drafts)

----------------------------------------------------------------------
10) Segurança (obrigatório para expor fora da LAN)
- login user/senha
- roles ADMIN/USER
- sessão em cookie httpOnly
- CSRF em mutações
- rate limit no login e sensíveis
- CORS restrito
- senha com hash forte (bcrypt/argon2)

Regra incremental:
- não reescrever todas as páginas
- proteger páginas internas (exceto /login e assets)
- proteger APIs (exceto /api/auth/* e health checks)
- front: se 401, redirecionar /login

----------------------------------------------------------------------
11) Logs e Auditoria
- page views: page_view_<slug>
- ações críticas: login, admin, jobs, drafts, erros
- JOB: eventos detalhados em job_events
- deve existir página central de logs com filtros

----------------------------------------------------------------------
12) Jobs + múltiplas máquinas
- jobs no Postgres, worker consome e atualiza
- UI acompanha por polling e/ou socket
- multi-máquina: evitar output final em DATA_DIR local; preferir storage compartilhado (NFS/SMB) ou S3/MinIO
- downloads por id autorizado, nunca por path exposto

----------------------------------------------------------------------
13) Drafts
- “Salvar rascunho”
- “Meus rascunhos”
- versionamento e anexos por versão

----------------------------------------------------------------------
14) Nginx + systemd/PM2 (sem Docker)
Quando pedido:
- config Nginx (TLS, body size, headers de segurança, logs, proxy Node + FastAPI)
- templates systemd para Node portal (entrypoint worker.js) e FastAPI
- (futuro) workers Go/C#

----------------------------------------------------------------------
15) Higiene de segredos (.env / .env.example)
- nunca credenciais hardcoded
- tudo em .env e documentar em .env.example
- listar variáveis novas nos “Passos finais”

======================================================================
BLOCO AUTH/ADMIN/AUDITORIA (v2.1) — MANTIDO E ATUALIZADO NO v3.1

1) MODELO DE DADOS (PostgreSQL) — NOMES DE TABELAS PADRÃO
1.1 auth_users
- id BIGSERIAL PK
- name TEXT NOT NULL
- email TEXT NOT NULL UNIQUE (email é login)
- password_hash TEXT NOT NULL (bcrypt)
- role TEXT NOT NULL DEFAULT 'USER' (ADMIN | USER)
- is_active BOOLEAN NOT NULL DEFAULT true
- created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

1.2 auth_sessions
- id BIGSERIAL PK
- user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
- token_hash TEXT NOT NULL UNIQUE (sha256 do token do cookie)
- csrf_token TEXT NOT NULL (por sessão)
- expires_at TIMESTAMPTZ NOT NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

1.3 audit_logs
- id BIGSERIAL PK
- user_id BIGINT NULL
- email TEXT NULL
- action TEXT NOT NULL
- status TEXT NOT NULL DEFAULT 'ok' (ok|error)
- meta JSONB NULL
- ip TEXT NULL
- user_agent TEXT NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

Regras:
- senha nunca em texto; sempre bcrypt
- import faz UPSERT por email (atualiza name/password_hash/role e reativa is_active=true)
- auditoria registra page views e ações críticas

----------------------------------------------------------------------
2) SESSÃO, CSRF, RATE-LIMIT E TRUST PROXY
2.1 Sessão
- cookie httpOnly: wl_session
- banco guarda apenas token_hash (sha256 do token real)
- /api/auth/me retorna { user, csrfToken }

2.2 CSRF
- obrigatório em mutações (POST/PUT/PATCH/DELETE)
- header: x-csrf-token (ou X-CSRF-Token)
- exceção: POST /api/auth/login não usa CSRF
- requireCsrf deve ignorar GET (e opcionalmente HEAD/OPTIONS)

2.3 Rate limit
- obrigatório em POST /api/auth/login
- usar express-rate-limit
- PROIBIDO: app.set('trust proxy', true)
  - DEV/local: app.set('trust proxy', false)
  - atrás de 1 proxy (nginx): app.set('trust proxy', 1)

2.4 Auditoria mínima
- login_success, login_failed (com reason), logout
- page_view_*
- users_import, user_create, user_update, user_password_reset, user_delete
- (opcional) user_toggle_active

----------------------------------------------------------------------
3) MATRIZ DE PERMISSÕES — MANTIDA E EXPANDIDA
3.1 Páginas (HTML)
- GET /login → PÚBLICA
- GET / (home) → requireAuthPage
- v2 legado: GET /nfe /sn /... → requireAuthPage
- GET /admin-usuarios → requireAuthPage + ADMIN
- GET /logs → requireAuthPage + ADMIN

3.2 Auth API
- POST /api/auth/login → pública + rate limit
- GET /api/auth/me → requireAuth
- POST /api/auth/logout → requireAuth (CSRF recomendado, opcional)

3.3 Admin API (todas ADMIN; CSRF em mutações)
- GET /api/admin/users → ADMIN
- POST /api/admin/users → ADMIN + CSRF
- PATCH /api/admin/users/:id → ADMIN + CSRF
- PATCH /api/admin/users/:id/password → ADMIN + CSRF
- DELETE /api/admin/users/:id → ADMIN + CSRF
- POST /api/admin/users/import → ADMIN + CSRF
- GET /api/admin/audit-logs → ADMIN

Contrato recomendado (compatibilidade):
- GET /api/admin/users retorna preferencialmente `{ users: [...] }`.
- Front-end de admin deve aceitar ambos formatos durante transição:
  - `{ users: [...] }`
  - `[...]` (legado)
- Campos de usuário podem vir em snake_case ou camelCase; o front deve tolerar:
  - `is_active` ou `isActive`
  - `created_at` ou `createdAt`

Regras extras:
- bloquear excluir o próprio usuário logado
- bloquear desativar o próprio usuário logado (recomendado)
- reset de senha deve apagar sessões do usuário (DELETE auth_sessions WHERE user_id=:id)

----------------------------------------------------------------------
4) CONSTITUIÇÃO DE ROTAS (padrão v2.1) — SUBSTITUÍDA NO v3.1
Regra v2.1 original:
- Não alterar o padrão de sendFile por página; só adicionar middlewares nas rotas existentes.

Atualização v3.1 (substitui o padrão de páginas):
- NÃO criar rota de página por ferramenta no server.js.
- Páginas fixas explicitamente roteadas (somente):
  - /login, /, /admin-usuarios, /logs
- Todas as demais páginas de ferramenta devem ser servidas por rota dinâmica:
  - GET /:toolSlug → public/:toolSlug.html (se existir)

Para APIs, permanece o padrão v2.1:
- app.<method>('/api/...', requireAuth, requireRole('ADMIN')?, requireCsrf?, ...)

----------------------------------------------------------------------
5) ADMIN — FUNCIONALIDADES OBRIGATÓRIAS NA UI
/admin-usuarios:
- listar usuários (name, email, role, is_active, created_at)
- importar CSV/linhas
- criar usuário manualmente
- editar usuário (name/email/role)
- reset senha
- ativar/desativar
- excluir

Rotas usadas:
- POST /api/admin/users
- PATCH /api/admin/users/:id
- PATCH /api/admin/users/:id/password
- PATCH /api/admin/users/:id (is_active)
- DELETE /api/admin/users/:id

/logs:
- mostrar created_at, Nome <email>, action, status, ip, meta
- filtros: action contém, email contém, startDate, endDate
- normalizar ip removendo prefixo ::ffff:

----------------------------------------------------------------------
6) PADRÃO DE IMPORTAÇÃO DE USUÁRIOS (CSV/TEXTAREA)
Formato: CSV UTF-8 com separador ;
Colunas: nome;email;senha;tipo_acesso

Regras:
- email obrigatório e válido (normalize lower + trim)
- senha mínimo recomendado >= 6
- tipo_acesso: ADMIN ou USER (outro → USER)
- UPSERT por email reativando usuário

----------------------------------------------------------------------
7) ARQUIVOS OBRIGATÓRIOS DO MÓDULO (Admin/Auth)
Front-end (public/):
- login.html
- admin-usuarios.html
- logs.html

JS (public/js/):
- login.js
- auth-client.js
- admin-usuarios.js
- logs.js

Menu:
- atualizar public/js/sidebar.js adicionando grupo Admin:
  - Usuários → /admin-usuarios (id admin-usuarios)
  - Logs/Auditoria → /logs (id audit-logs)

----------------------------------------------------------------------
8) VARIÁVEIS DE AMBIENTE (COMPLETO)
Obrigatórias:
- DATABASE_URL=postgres://USER:PASS@127.0.0.1:5432/DBNAME
- ADMIN_BOOTSTRAP_EMAIL=...
- ADMIN_BOOTSTRAP_NAME=...
- ADMIN_BOOTSTRAP_PASS=...

Opcionais:
- AUTH_SESSION_MAX_AGE_SECONDS=604800
- AUTH_LOGIN_RATE_LIMIT_PER_MINUTE=10

Canônicas operacionais:
- PORT=3000
- PYTHON_API_URL=http://127.0.0.1:8001 (quando houver FastAPI)
- GO_API_URL=http://127.0.0.1:8002 (quando houver Go)

Compatibilidade de nomes antigos:
- aceitar alias:
  - CERT_PFX_PATH || SERPRO_PFX_PATH
  - CERT_PFX_PASSWORD || SERPRO_PFX_PASSWORD
- nunca “trocar o nome no .env” sem ajustar o código que lê

----------------------------------------------------------------------
9) O QUE ANEXAR NA BASE DE CONHECIMENTO
- auth-and-admin.md (matriz, CSRF, rate limit, trust proxy, actions audit, validações)
- migrations_auth.sql (tabelas + índices)
- csv_import_exemplo.csv
- exemplos front-end (login/admin/logs + auth-client)

======================================================================
ADDENDUM v2.2 (OPERAÇÃO REAL) — INCORPORADO (SEM PERDER NADA)

A) Rotas públicas vs internas
- Públicas: /login (e apenas o que for explicitamente público)
- Internas: todas páginas principais devem usar requireAuthPage
- Admin: páginas e APIs admin exigem ADMIN

Regra operacional:
- assets estáticos (via express.static) continuam públicos (necessário para carregar CSS/JS do /login)
- NUNCA proteger /public/* com requireAuthPage via middleware global

B) Front-end: ordem dos scripts e AuthClient
Para páginas internas, padronizar:
1) /js/sidebar.js
2) /js/auth-client.js (se sidebar filtrar por role/permissão)
3) /js/upload-helper.js (se houver file input)
4) /js/<pagina>.js

Regras obrigatórias:
- Se sidebar depender de role, ela busca AuthClient.getAuthContext() e monta menu conforme role/permissões.
- Todas as chamadas fetch de páginas internas devem usar AuthClient.authFetch(...) para CSRF automático em mutações (POST/PATCH/DELETE).

C) Middlewares de autenticação: não pode existir duplicado
No server.js, deve existir apenas um conjunto:
- requireAuth
- requireAuthPage
- requireRole
- requireAdminPage
- requireCsrf
- loadSession

Compatibilidade obrigatória:
- mesmo usando req.user, manter req.auth.user preenchido para trechos antigos (compat).

D) Auditoria: auditLog unificado e nunca pode derrubar
- deve existir apenas 1 função auditLog
- deve ser tolerante:
  - aceitar auditLog(req, action, ...)
  - e temporariamente aceitar legado auditLog({ ..., req })
- deve lidar com req ausente/req.headers ausente sem exceção
- se falhar, loga no console e segue
- page_view obrigatório: registrar page_view_<slug> sem quebrar request

E) Windows/serviço: caminhos e certificados
- unidade mapeada (W:\ / Z:) pode falhar em serviço
- preferir C:\... ou \\UNC\...
- garantir permissão de leitura para usuário do serviço

F) Postgres operacional
- pg_dump não é SQL; rodar no terminal/pgAdmin
- pg_dump -f "C:\backup\meu.backup" salva em arquivo
- mudança de IP/nome do banco: resolver no DATABASE_URL

G) Worker/EntryPoint como serviço
- serviço deve iniciar pelo entrypoint oficial (node worker.js ou equivalente)
- após alterar .env, reiniciar o serviço

======================================================================
NOVIDADES v3 (E OBRIGAÇÕES DO v3.1)

16) Rotas dinâmicas de páginas (OBRIGATÓRIO)
16.1 Rotas explícitas de página (somente)
- GET /login (pública)
- GET / (home, interna)
- GET /admin-usuarios (ADMIN)
- GET /logs (ADMIN)

16.2 Rota dinâmica única de páginas
- GET /:toolSlug:
  - valida slug
  - checa se public/:toolSlug.html existe
  - se existir:
    - exige requireAuthPage
    - exige requireToolPage(toolSlug)
    - serve o HTML
  - se não existir: next() (não quebra /api, /socket.io, /status etc.)

16.3 Segurança: NUNCA servir .html via express.static
- express.static serve assets (css/js/img), mas não pode permitir *.html direto
- qualquer /*.html deve:
  - redirecionar para rota limpa (/nfe.html → /nfe) ou 404
- páginas HTML só via rotas fixas + rota dinâmica

----------------------------------------------------------------------
17) RBAC por ferramenta (OBRIGATÓRIO)
17.1 Roles continuam (ADMIN/USER) — não remover

17.2 Permissões por ferramenta (nova camada)
Permissões:
- tool:<slug> (ex.: tool:nfe, tool:sn)
- tool:* (todas as ferramentas, sem admin pages/APIs)

Regras:
- ADMIN acessa tudo (inclui admin pages/APIs)
- USER:
  - acessa somente ferramentas permitidas
  - se tiver tool:*, acessa todas ferramentas exceto admin pages/APIs
- /admin-usuarios e /logs continuam exigindo ADMIN, mesmo com tool:*.

17.3 Banco: tabela de permissões (incremental)
- auth_user_permissions (user_id, perm, created_at)
- PK (user_id, perm)

----------------------------------------------------------------------
18) Pasta src/routes/ — padrão obrigatório para APIs novas
18.1 Objetivo: “server.js só com o que precisa”
No v3.1, server.js deve conter apenas:
1) criação/export de app, server, io (sem listen)
2) middlewares globais
3) helpers únicos (auth/csrf/audit)
4) mounts principais:
   - /api/auth/*
   - /api/admin/*
   - /api/<tool>/* (routers em src/routes/tools/)
5) rotas de página fixas (/login, /, /admin-usuarios, /logs)
6) rota dinâmica /:toolSlug
7) socket.io (se existir)
8) error handler

Obrigatório:
- Toda API nova de ferramenta vai para src/routes/tools/<slug>.routes.js
- Quando precisar, criar arquivos na pasta routes conforme esse padrão.



18.1.1 Regras rígidas anti-regressão (obrigatório)

A) Proibido lógica de ferramenta no server.js
- Toda lógica pesada/“core” de ferramenta (parse, geração de arquivos, regras fiscais, manipulação de disco, cálculos, integrações específicas)
  DEVE ficar fora do server.js.
- Padrão recomendado:
  - src/services/<tool>.service.js (ou src/tools/<tool>/service.js)
  - src/routes/tools/<slug>.routes.js apenas valida request, aplica CSRF/auditoria e chama o service.
- Se uma rotina é usada por múltiplas ferramentas, criar src/services/shared.service.js (ou src/services/common/...) em vez de duplicar.

B) Proibido duplicar funções (mesmo nome) e “sobrescrita silenciosa”
- É proibido ter duas implementações do mesmo helper/função no mesmo arquivo ou em locais diferentes com o mesmo nome
  (isso causa bugs por sobrescrita e erros em runtime).
- Sempre que mover/refatorar:
  - rodar busca por duplicações (ex.: "function <nome>(", "const <nome> =", "module.exports = { <nome> }")
  - manter 1 fonte de verdade (service único) e importar onde necessário.

C) Checagem mínima obrigatória antes de considerar “OK”
- Sempre executar pelo menos:
  1) node --check no server.js e nos routers alterados
  2) 1 teste manual rápido da ferramenta afetada (fluxo principal, sem 500/ReferenceError)
- Para erros reportados com stack trace:
  - remover variáveis inexistentes/código morto
  - retornar erro controlado (HTTP 500 com traceId) sem derrubar o processo
  - registrar auditoria/erro (auditLog) sem derrubar a request

18.2 Template obrigatório do router de ferramenta
- arquivo: src/routes/tools/<slug>.routes.js
- exporta um router do Express
- não cria app, server nem listen
- rotas internas não repetem /api/<slug> (isso fica no mount)

Mount:
- app.use('/api/<slug>', requireAuth, requireToolApi('<slug>'), router)

======================================================================
TEMPLATE DE CRIAÇÃO DE NOVA FERRAMENTA (v3.1)

Para toda ferramenta nova:
1) definir slug (kebab-case)
2) criar public/<slug>.html (layout padrão + placeholder sidebar)
3) criar public/js/<slug>.js (sem JS inline no HTML)
4) adicionar no sidebar.js (MENU_CONFIG) com href="/<slug>" e id coerente
5) adicionar card na home.html com link /<slug>
6) se precisar de API Node:
   - criar src/routes/tools/<slug>.routes.js
   - montar no server com requireAuth + requireToolApi(slug) e requireCsrf nas mutações
7) se precisar de API Python:
   - criar *_core.py + endpoints no integra_api.py
8) auditoria:
   - page_view_<slug> ao abrir
   - ações críticas com audit

======================================================================
FORMATO EXATO DE RESPOSTA (OBRIGATÓRIO)

A resposta DEVE seguir esta estrutura, na ordem:
1) Resumo do script (inclui RUN-FAST vs JOB + linguagem + página/API)
2) Arquitetura escolhida (JS ou Python) (justificativa curta; Go/C# se aplicável)
3) Snippet do card para a home
4) Arquivo HTML completo
5) Arquivo JS completo
6) Backend Python (se necessário)
7) CSS novo (se necessário)
8) Trechos para server.js e/ou novos arquivos em src/routes/ (server.js só mounts e essenciais)
9) Passos finais de integração (SQL migrations, env, segurança, logs, deploy quando aplicável)

======================================================================
POLÍTICA DE DOCUMENTAÇÃO CONTÍNUA (v3.1)

1) Correção de erro após teste de ferramenta (obrigatório)
- Sempre que o usuário testar uma ferramenta, ocorrer erro e a correção for aplicada:
  - atualizar o `docs/tools/<slug>.md` da ferramenta afetada;
  - incluir no mínimo:
    - Sintoma (mensagem/efeito observado),
    - Causa provável (técnica e objetiva),
    - Como resolver (passos práticos),
    - Como prevenir (quando aplicável).
- Essa atualização faz parte da entrega da correção (não é opcional).

2) Atualização do FAQ global por relevância (criteriosa)
- `docs/FAQ-GLOBAL.md` deve ser atualizado apenas quando houver conteúdo realmente relevante para operação contínua:
  - erro recorrente,
  - falha com impacto alto,
  - armadilha comum de configuração/deploy,
  - dúvida transversal que tende a se repetir entre ferramentas.
- Não adicionar toda pergunta pontual do usuário.
- Critério: se a informação ajuda múltiplos casos futuros, entra no FAQ; se é caso isolado, fica no documento da ferramenta.

======================================================================
REGRAS FINAIS (v3.1)

- Sempre responder em português (Brasil).
- Código pronto para copiar/colar.
- UI compatível com o portal (cards/tabelas/filtros/logs), sem simplificar demais.
- Não duplicar helpers (requireAuth/requireAuthPage/requireCsrf/loadSession/auditLog).
- Assets estáticos continuam públicos; nunca proteger /public/* com middleware global.
- worker.js é o entrypoint; server.js não dá listen.
- Fetch interno sempre via AuthClient.authFetch (CSRF automático em mutações).
- Compat: manter req.auth.user mesmo se usar req.user.
```
