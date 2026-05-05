# 01 - Deploy em Produção

## 🚀 Checklist Pré-Deployment

Antes de fazer deploy:

- [ ] Todos os testes passando
- [ ] Documentação atualizada
- [ ] Variáveis `.env` configuradas
- [ ] Banco de dados migrado
- [ ] Certificados SERPRO testados
- [ ] Backups configurados
- [ ] Monitoramento ativo
- [ ] SSL/HTTPS preparado

## Fluxo Operacional Recomendado

### 1. Desenvolvimento local

- Use caminhos relativos no `.env` para arquivos do próprio projeto, por exemplo `certs/WILSON.pfx` ou `public/js/layout dimob.json`.
- Reserve caminhos absolutos de Windows, como `W:\...`, apenas para integrações deliberadamente locais que não precisam funcionar na VPS.
- Toda alteração de banco deve virar uma migration SQL em `db/migrations/`.

### 2. Publicação em produção

- O comando local recomendado passou a ser:
  - antes, alinhe o arquivo local `.env.vps` com o ambiente que deve existir na VPS;
  - esse arquivo não vai para o GitHub e será enviado por `scp` durante o release.
  - com a chave SSH configurada localmente, prefira usar um alias como `hostinger-vps` em `DEPLOY_VPS_SSH_TARGET`.

```bash
npm run release:vps -- main
```

- Esse fluxo faz:
  - se `HAPI_API_TOKEN` estiver configurado, executa checagem prévia da VPS via Hostinger CLI/API;
  - valida o firewall da Hostinger com as portas TCP obrigatórias configuradas;
  - valida que o `git` local está limpo;
  - executa `git push origin <branch>`;
  - sincroniza o `.env` da VPS a partir do arquivo local `.env.vps` (ou `.env`, se `.env.vps` não existir);
  - conecta por `ssh` na VPS usando o target configurado em `DEPLOY_VPS_SSH_TARGET`;
  - roda `scripts/deploy-vps.sh`;
  - aplica `npm run migrate` na VPS antes de reiniciar os serviços;
  - reinicia automaticamente `central-node`, `central-python`, `central-go` e `nginx` (ou `caddy`, se existir);
  - se `HAPI_API_TOKEN` estiver configurado, roda uma checagem pós-deploy de saúde da VPS.

### 2.1 Documentação pública no Cloudflare Pages

- A documentação pública em `https://central-utils.pages.dev/` deve publicar automaticamente a cada push em `main`.
- O workflow versionado em `.github/workflows/deploy-docs-pages.yml` executa este fluxo:
  - instala as dependências pinadas de documentação a partir de `requirements.txt`;
  - regenera `docs/UI_MAP.md`, `docs/ui-map.json` e `docs/tools/index.md`;
  - executa `mkdocs build --strict`;
  - publica a pasta `site/` no projeto Cloudflare Pages `central-utils`.
- Secrets obrigatórias no GitHub:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- Sem essas secrets, o workflow falha explicitamente e a documentação não sobe.
- Esse caminho usa deploy direto no Cloudflare Pages via GitHub Actions, então não depende do build manual configurado no painel.
- Se o nome do projeto no Cloudflare mudar, atualize também `--project-name=central-utils` no workflow.

### 2.2 Primeiro setup do Cloudflare Pages

1. Gerar um API Token no Cloudflare com permissão `Account / Cloudflare Pages / Edit`.
2. Copiar o `Account ID` da conta que hospeda o projeto `central-utils`.
3. No GitHub do repositório, cadastrar as secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Fazer um novo push em `main` ou disparar manualmente o workflow `Deploy Docs to Cloudflare Pages`.
5. Validar a publicação em `https://central-utils.pages.dev/`.

### 2.3 Diagnóstico rápido da documentação

- Se o push chegar ao GitHub e a página não atualizar:
  - abrir `Actions` e verificar o workflow `Deploy Docs to Cloudflare Pages`;
  - confirmar que as secrets do Cloudflare continuam válidas;
  - revisar falhas de build do MkDocs (`mkdocs build --strict`);
  - conferir se o projeto Cloudflare Pages ainda se chama `central-utils`.

### 3. Deploy dentro da VPS

- Se precisar executar direto no servidor, continue usando:

```bash
npm run deploy:vps -- main
```

- Esse script agora instala dependências, roda verify, aplica migrations SQL e só então reinicia os serviços.

### Checagem Hostinger

Se a máquina local tiver a CLI oficial `hapi` instalada e `HAPI_API_TOKEN` configurado, ficam disponíveis:

```bash
npm run hostinger:vps:status
npm run hostinger:health
npm run hostinger:firewall:check
npm run hostinger:predeploy
npm run hostinger:postdeploy
```

Esses comandos usam a API/CLI oficial da Hostinger para consultar a VPS antes do deploy.

### Banco de dados e migrations

- Toda alteração de banco feita no desenvolvimento precisa virar arquivo SQL em `db/migrations/`.
- O deploy da VPS só aplica o que estiver versionado nessa pasta.
- Se alguma alteração foi feita diretamente no banco local e ainda não existe migration correspondente, ela **não** irá para a VPS automaticamente.
- Antes de publicar, confirme:
  - a migration `.sql` existe em `db/migrations/`;
  - a migration foi testada no banco local;
  - `npm run migrate` está limpo localmente.

### Bloco único para terminal web da VPS

Se o SSH externo continuar indisponível, use este bloco no terminal web da Hostinger.

Antes de colar:
- confirme que o repositório já existe em `/opt/central-utils`;
- atualize manualmente `/opt/central-utils/.env` se houver mudança de variáveis;
- confirme que as alterações de banco já estão versionadas em `db/migrations/`.

```bash
cd /opt/central-utils && \
git fetch --all --prune && \
git checkout main && \
git pull --ff-only origin main && \
if [ -f package-lock.json ]; then npm ci; else npm install; fi && \
if [ ! -d .venv ]; then python3 -m venv .venv; fi && \
.venv/bin/python -m pip install --upgrade pip && \
if [ -f api/requirements.txt ]; then .venv/bin/python -m pip install -r api/requirements.txt; fi && \
if [ -f requirements.txt ]; then .venv/bin/python -m pip install -r requirements.txt; fi && \
npm run migrate && \
systemctl daemon-reload && \
systemctl restart central-python central-go central-node nginx && \
systemctl --no-pager --full status central-python central-go central-node nginx
```

Se preferir usar o script versionado do projeto, o equivalente é:

```bash
cd /opt/central-utils && APP_DIR=/opt/central-utils bash scripts/deploy-vps.sh main
```

### Bootstrap inicial da VPS

O repositório agora inclui um script versionado para post-install/bootstrap da VPS:

- [`scripts/templates/hostinger-post-install-central-utils.sh`](/w:/DOCUMENTOS%20ESCRITORIO/INSTALACAO%20SISTEMA/central-utils/scripts/templates/hostinger-post-install-central-utils.sh)

Ele pode ser usado como base tanto para o recurso `post-install-scripts` da Hostinger quanto para uma configuração manual inicial da VPS.

---

## 🖥️ Opções de Deployment

### Opção 1: Servidor Linux (Recomendado)

Usar servidor Debian/Ubuntu com Systemd, Docker, ou PM2.

#### Via Docker (Mais fácil)

**Dockerfile:**

```dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM python:3.11-slim
RUN apt-get update && apt-get install -y nodejs npm postgresql-client

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN pip install -r api/requirements.txt

EXPOSE 3000 8001 8002

CMD ["npm", "run", "dev"]
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: central_utils
      POSTGRES_USER: central_app
      POSTGRES_PASSWORD: ${DB_PASS}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  app:
    build: .
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASS: ${DB_PASS}
      PORT: 3000
    ports:
      - "3000:3000"
      - "8001:8001"
      - "8002:8002"
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
```

**Como usar:**

```bash
# Copiar .env.example para .env e configurar
cp .env.example .env

# Iniciar
docker-compose up -d

# Parar
docker-compose down

# Logs
docker-compose logs -f app
```

#### Via PM2 (Sem Docker)

**Instalar PM2:**

```bash
npm install -g pm2
```

**Criar ecosystem.config.js:**

```javascript
module.exports = {
  apps: [
    {
      name: 'central-utils-node',
      script: 'src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log'
    },
    {
      name: 'central-utils-python',
      script: 'api/integra_api.py',
      instances: 1,
      interpreter: '.venv/bin/python',
      args: '-m uvicorn',
      env: {
        PYTHON_PORT: 8001,
        PYTHON_ENV: 'production'
      }
    }
  ]
};
```

**Usar PM2:**

```bash
# Iniciar
pm2 start ecosystem.config.js

# Parar
pm2 stop all

# Reiniciar
pm2 restart all

# Logs
pm2 logs

# Monitorar
pm2 monit

# Status
pm2 status

# Auto-restart no boot
pm2 startup
pm2 save
```

---

### Opção 2: Windows Server

**Via Task Scheduler + Node/Python:**

1. **Criar arquivo batch `start.bat`:**

```batch
@echo off
cd W:\DOCUMENTOS ESCRITORIO\INSTALACAO SISTEMA\central-utils

REM Ativar Python venv
call .venv\Scripts\activate.bat

REM Iniciar em foreground (será capturado por Task Scheduler)
npm run dev
```

2. **Criar Task Scheduler:**
   - Open Task Scheduler
   - Create Basic Task
   - Name: "Central Utils"
   - Trigger: "At startup"
   - Action: Run `start.bat`
   - Check "Run with highest privileges"

3. **Monitorar com NSSM (Non-Sucking Service Manager):**

```bash
# Download: https://nssm.cc/download

nssm install CentralUtils "W:\DOCUMENTOS ESCRITORIO\INSTALACAO SISTEMA\central-utils\start.bat"
nssm start CentralUtils
nssm status CentralUtils
```

---

## 🔐 Configuração SSL/HTTPS

### Com Let's Encrypt (Linux)

```bash
# Instalar Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obter certificado
sudo certbot certonly --standalone -d seu-dominio.com

# Auto-renew
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### Usar com Express

```javascript
const https = require('https');
const fs = require('fs');

const options = {
  cert: fs.readFileSync('/etc/letsencrypt/live/seu-dominio/fullchain.pem'),
  key: fs.readFileSync('/etc/letsencrypt/live/seu-dominio/privkey.pem')
};

https.createServer(options, app).listen(443);
```

---

## 📊 Monitoramento

### Nginx (Reverse Proxy Recomendado)

**Instalar:**

```bash
sudo apt-get install nginx
```

**Configurar `/etc/nginx/sites-available/central-utils`:**

```nginx
upstream node_app {
    server 127.0.0.1:3000;
}

upstream python_api {
    server 127.0.0.1:8001;
}

server {
    listen 80;
    server_name seu-dominio.com;
    
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://node_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    location /api/python {
        rewrite ^/api/python/(.*)$ /api/$1 break;
        proxy_pass http://python_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_timeout 300s;
    }
}
```

**Ativar:**

```bash
sudo ln -s /etc/nginx/sites-available/central-utils /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

---

## 📈 Auto-scaling (Kubernetes - Avançado)

Para alta disponibilidade, considere Kubernetes com Helm.

```bash
# Deploy com Helm
helm install central-utils ./helm-chart

# Escalar
kubectl scale deployment central-utils --replicas=5
```

---

## 🔄 Processo de Update

**Com 0 downtime:**

```bash
# 1. Clonar repositório para tmp
git clone repo nova-versao

# 2. Testes na nova versão
cd nova-versao
npm test
pytest api/

# 3. Parar versão antiga (gracefully)
pm2 gracefulReload all

# 4. Trocar versão
mv . /app-nova
mv /app /app-old
mv /app-nova /app

# 5. Reiniciar
pm2 start ecosystem.config.js

# 6. Se erro, rollback
rm -rf /app
mv /app-old /app
pm2 start ecosystem.config.js
```

---

## 📋 Checklist Final de Deploy

- [ ] DNS apontando para servidor
- [ ] SSL/HTTPS ativo
- [ ] Variáveis de ambiente corretas
- [ ] Banco de dados em backup
- [ ] Logs sendo coletados
- [ ] Monitoramento ativo
- [ ] Alertas configurados
- [ ] Plano de rollback
- [ ] Documentação atualizada
- [ ] Teste de acesso funcional

---

**Última atualização:** Fevereiro 2026
