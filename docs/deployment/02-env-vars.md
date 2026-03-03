# 02 - Variáveis de Ambiente

## 📝 Arquivo `.env`

O arquivo `.env` na raiz do projeto contém configurações sensíveis e específicas do ambiente.

> ⚠️ **IMPORTANTE:** Nunca fazer commit do `.env`! Adicione à `.gitignore`

### Regra de caminhos

- Para arquivos que pertencem ao projeto, prefira caminhos relativos à raiz do repositório.
- Exemplos corretos:

```env
CERT_PFX_PATH=certs/WILSON.pfx
PDFA_ICC_PROFILE=profiles/srgb.icc
DIMOB_LAYOUT_PATH=public/js/layout dimob.json
```

- Esses caminhos relativos são resolvidos automaticamente no Windows e no Ubuntu.
- Caminhos absolutos de Windows, como `W:\...`, continuam permitidos apenas para integrações locais que não precisam rodar na VPS.
- Para publicar com um único comando local, configure também:
- Para publicar com um único comando local, configure também:

```env
DEPLOY_VPS_SSH_TARGET=usuario@servidor
DEPLOY_VPS_PORT=22
DEPLOY_VPS_APP_DIR=/opt/central-utils
DEPLOY_VPS_ENV_SOURCE=.env.vps
HAPI_API_TOKEN=seu_token_da_hostinger
HOSTINGER_VM_ID=
HOSTINGER_VM_HOSTNAME=
HOSTINGER_HAPI_BIN=hapi
HOSTINGER_REQUIRED_TCP_PORTS=22
HOSTINGER_HEALTH_CPU_MAX_PERCENT=95
HOSTINGER_HEALTH_RAM_MAX_PERCENT=95
HOSTINGER_HEALTH_DISK_MAX_PERCENT=95
HOSTINGER_HEALTH_MIN_DISK_FREE_BYTES=1073741824
```

- Fluxo recomendado:
  - `.env`: ambiente local de desenvolvimento;
  - `.env.vps`: cópia local não-versionada com os valores exatos que devem existir na VPS;
  - `npm run sync:env:vps`: envia `.env.vps` para a VPS e substitui o `.env` remoto com backup automático.
  - `npm run compare:env:vps`: compara o `.env` remoto com o arquivo local de publicação e aponta diferenças de chaves/valores.
  - `npm run hostinger:health`: verifica estado, CPU, RAM, disco e tráfego da VPS.
  - `npm run hostinger:firewall:check`: valida se o firewall da Hostinger está sincronizado e com as portas TCP exigidas.

### Notas sobre as variáveis Hostinger

- `HOSTINGER_HAPI_BIN` pode apontar para o binário oficial instalado fora do `PATH`, por exemplo `C:\Users\Usuario\go\bin\api-cli.exe`.
- `HOSTINGER_REQUIRED_TCP_PORTS` define as portas mínimas que o projeto considera obrigatórias no firewall da Hostinger antes do deploy.
  - exemplo enxuto: `22`
  - exemplo completo: `22,80,443`
- Os limites `HOSTINGER_HEALTH_*` são usados para reprovar deploy quando a VPS está com recurso crítico.

### Arquivos-modelo criados no repositório

- [`.env.example`](/w:/DOCUMENTOS%20ESCRITORIO/INSTALACAO%20SISTEMA/central-utils/.env.example)
- [`.env.vps.example`](/w:/DOCUMENTOS%20ESCRITORIO/INSTALACAO%20SISTEMA/central-utils/.env.vps.example)

Uso sugerido:

```bash
copy .env.example .env
copy .env.vps.example .env.vps
```

No Windows PowerShell, se preferir:

```powershell
Copy-Item .env.example .env
Copy-Item .env.vps.example .env.vps
```

---

## 🔧 Variáveis Disponíveis

### Node.js / Express

```env
# Ambiente
NODE_ENV=development              # development | production | test

# Servidor
PORT=3000                          # Porta Node.js
HOST=127.0.0.1                    # Host (0.0.0.0 para acesso remoto)
API_BASE_URL=http://localhost     # URL base da API
CORS_ORIGIN=http://localhost:3000 # CORS origin
```

### Python / FastAPI

```env
PYTHON_ENV=development            # Ambiente Python
PYTHON_PORT=8001                  # Porta FastAPI
PYTHON_HOST=127.0.0.1            # Host Python API
PYTHON_LOG_LEVEL=info            # DEBUG | INFO | WARNING | ERROR
```

### Go API (Opcional)

```env
GO_API_PORT=8002                  # Porta Go
GO_API_HOST=127.0.0.1            # Host Go
GO_API_ENABLED=false              # Ativar/desativar
```

### Banco de Dados

```env
# PostgreSQL
DB_HOST=localhost                 # Servidor PostgreSQL
DB_PORT=5432                      # Porta padrão
DB_NAME=central_utils             # Nome do banco
DB_USER=central_app               # Usuário
DB_PASS=sua_senha_segura         # Senha
DB_SSL=false                      # Usar SSL (true em produção)
DB_POOL_SIZE=10                   # Conexões no pool

# Redis (Opcional - para cache)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
```

### Autenticação SERPRO

```env
# Certificados
SERPRO_CERT_PATH=./src/certs/cert.pem
SERPRO_KEY_PATH=./src/certs/key.pem
SERPRO_CA_PATH=./src/certs/ca.pem

# API SERPRO
SERPRO_API_URL=https://api1.serpro.gov.br
SERPRO_API_TIMEOUT=30000          # ms
SERPRO_RETRY_COUNT=3              # Tentativas
SERPRO_RETRY_DELAY=1000           # ms entre tentativas

# JWT
SERPRO_JWT_SECRET=sua_chave_secreta_muito_longa_e_aleatoria
JWT_EXPIRATION=7d                 # 7 dias
JWT_ALGORITHM=HS256               # Algoritmo
```

### Archivos y Almacenamiento

```env
# Diretórios
DATA_DIR=./data                   # Raiz de dados
UPLOADS_DIR=./data/uploads        # Arquivos uploaded
OUTPUTS_DIR=./data/outputs        # Resultados processados
TEMP_DIR=./tmp                    # Temporários
LOGS_DIR=./data/logs              # Logs
ATAS_DIR=./data/atas_geradas     # Atas geradas

# Limites de arquivo
MAX_FILE_SIZE=104857600           # 100 MB em bytes
MAX_FILES_UPLOAD=5                # Arquivos por requisição
DISK_SPACE_MIN=1000000000         # 1 GB mínimo livre

# Limpeza automática
CLEANUP_INTERVAL=86400000         # 24h em ms
CLEANUP_OLD_FILES_DAYS=30         # Deletar arquivos > 30 dias
```

### Logging

```env
# Nivel de log
LOG_LEVEL=debug                   # debug | info | warn | error

# Arquivo
LOG_FILE=./data/logs/app.log
LOG_MAX_SIZE=10485760             # 10 MB
LOG_MAX_FILES=5                   # Rotação

# Formato
LOG_FORMAT=combined               # combined | simple | json
```

### Segurança

```env
# Bcrypt
BCRYPT_ROUNDS=10                  # 10-12 recomendado

# Session
SESSION_SECRET=sua_sessao_secret
SESSION_MAX_AGE=604800000         # 7 dias em ms

# Rate Limiting
RATE_LIMIT_WINDOW=900000          # 15 minutos em ms
RATE_LIMIT_MAX_REQUESTS=100       # Requisições/window
RATE_LIMIT_ENABLED=true
```

### Integrações Externas

```env
# MADRE SCP
MADRE_API_URL=https://api.madre.local
MADRE_API_KEY=sua_chave_api
MADRE_API_TIMEOUT=30000
MADRE_ENABLED=false

# Outro Sistema
OUTRO_SISTEMA_URL=https://outro.com
OUTRO_SISTEMA_KEY=chave
OUTRO_SISTEMA_ENABLED=false
```

### Email (Opcional)

```env
# SMTP
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-senha-app
EMAIL_FROM=Central Utils <noreply@central-utils.com>

# Notificações
EMAIL_ON_COMPLETE=true
EMAIL_ON_ERROR=true
EMAIL_ADMIN=admin@empresa.com
```

### Sentry (Error Tracking - Opcional)

```env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ENABLED=false
SENTRY_ENVIRONMENT=production
```

---

## 📋 Exemplo Completo `.env`

Create arquivo `.env` na raiz com este conteúdo (personalize conforme):

```env
# =========================
# AMBIENTE
# =========================
NODE_ENV=development
PYTHON_ENV=development

# =========================
# SERVIDORES
# =========================
PORT=3000
HOST=localhost
PYTHON_PORT=8001
PYTHON_HOST=127.0.0.1
GO_API_PORT=8002
GO_API_ENABLED=false

# =========================
# BANCO DE DADOS
# =========================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=central_utils
DB_USER=central_app
DB_PASS=senha_super_secreta_123456
DB_SSL=false
DB_POOL_SIZE=10

# =========================
# AUTENTICAÇÃO SERPRO
# =========================
SERPRO_CERT_PATH=./src/certs/cert.pem
SERPRO_KEY_PATH=./src/certs/key.pem
SERPRO_CA_PATH=./src/certs/ca.pem
SERPRO_API_URL=https://api1.serpro.gov.br
SERPRO_JWT_SECRET=chave_jwt_muito_longa_e_aleatoria_120caracteres
JWT_EXPIRATION=7d

# =========================
# CAMINHOS DE ARQUIVO
# =========================
DATA_DIR=./data
UPLOADS_DIR=./data/uploads
OUTPUTS_DIR=./data/outputs
TEMP_DIR=./tmp
LOGS_DIR=./data/logs
MAX_FILE_SIZE=104857600

# =========================
# LOGGING
# =========================
LOG_LEVEL=debug
LOG_FILE=./data/logs/app.log

# =========================
# SEGURANÇA
# =========================
BCRYPT_ROUNDS=10
SESSION_SECRET=chave_sessao_super_secreta_aleatoria
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100

# =========================
# MADRE (OPCIONAL)
# =========================
MADRE_ENABLED=false
MADRE_API_URL=https://api.madre.local
MADRE_API_KEY=sua_chave_madre

# =========================
# EMAIL (OPCIONAL)
# =========================
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-senha-app
EMAIL_ON_COMPLETE=true
EMAIL_ADMIN=admin@empresa.com
```

---

## 🔐 Checklist de Segurança

### Desenvolvimento

```env
NODE_ENV=development
SERPRO_API_URL=https://api1.serpro.gov.br  # Sandbox
JWT_SECRET=[gerar aleatório]
DB_PASS=[senha local forte]
```

### Staging/Teste

```env
NODE_ENV=production
SERPRO_API_URL=https://api1.serpro.gov.br  # Produção
JWT_SECRET=[gerar com crypto.randomBytes]
DB_PASS=[senha BD forte]
DB_SSL=true
RATE_LIMIT_ENABLED=true
```

### Produção

```env
NODE_ENV=production
PYTHON_ENV=production
SERPRO_API_URL=https://api1.serpro.gov.br  # Produção
HOST=0.0.0.0  # Aceita conexões de qualquer IP (Nginx faz proxy)
JWT_SECRET=[super randomizado e seguro]
DB_PASS=[senha muito forte e segura]
DB_SSL=true
CORS_ORIGIN=https://seu-dominio.com
RATE_LIMIT_ENABLED=true
BCRYPT_ROUNDS=12  # Mais lento = mais seguro
```

---

## 🔄 Como Usar

### Development

```bash
npm run dev  # Carrega .env automaticamente
```

### Production

```bash
# Definir variáveis no sistema
export NODE_ENV=production
export DB_HOST=db.production.com
export SERPRO_JWT_SECRET=xxx...

# Ou via arquivo .env (copiar para servidor)
npm start
```

### Docker

```bash
# Passar via --env-file
docker run --env-file .env central-utils:latest

# Ou via docker-compose
docker-compose up
```

---

## 🛡️ Gerar Senhas Seguras

```bash
# Linux/macOS
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Python
python3 -c "import os; print(os.urandom(32).hex())"
```

---

## 🐛 Troubleshooting

### "Variable not found"

```bash
# Verificar se .env existe
ls -la .env

# Recarregar .env
# Node.js carrega automaticamente ao iniciar
# Python: usar `python-dotenv` ou recarregar

# Verificar variable
echo $NODE_ENV
```

### "Connection refused"

```bash
# Verificar se serviços estão rodando
psql -U $DB_USER -h $DB_HOST -d $DB_NAME -c "SELECT 1"

# Verificar porta Python
curl http://localhost:8001/docs
```

---

**Última atualização:** Fevereiro 2026
