# 02 - Variáveis de Ambiente

## 📝 Arquivo `.env`

O arquivo `.env` na raiz do projeto contém configurações sensíveis e específicas do ambiente.

> ⚠️ **IMPORTANTE:** Nunca fazer commit do `.env`! Adicione à `.gitignore`

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

### CCT e Parcelamentos

```env
# CCT SMTP e notificacoes
CCT_SMTP_HOST=smtp.example.invalid
CCT_SMTP_PORT=465
CCT_SMTP_USER=smtp-user@example.invalid
CCT_SMTP_PASS=sua_senha_smtp_ou_reaproveite_EMAIL_PASS
CCT_EMAIL_FROM=smtp-user@example.invalid
CCT_SITE_URL=https://seu-dominio/cct
CCT_EMAIL_TO=recipient@example.invalid
CCT_EMAIL_CC=cc@example.invalid
CCT_ERROR_RECIPIENT=recipient@example.invalid

# Importador de planilha de parcelamentos
PARCELAMENTOS_WORKBOOK_PATH=./data/parcelamentos/LISTA PARCELAMENTOS.xlsx
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

# =========================
# CCT / PARCELAMENTOS
# =========================
CCT_SMTP_HOST=smtp.example.invalid
CCT_SMTP_PORT=465
CCT_SMTP_USER=smtp-user@example.invalid
CCT_SMTP_PASS=sua_senha_smtp_ou_reaproveite_EMAIL_PASS
CCT_EMAIL_FROM=smtp-user@example.invalid
CCT_SITE_URL=https://seu-dominio/cct
CCT_EMAIL_TO=recipient@example.invalid
CCT_EMAIL_CC=cc@example.invalid
CCT_ERROR_RECIPIENT=recipient@example.invalid
PARCELAMENTOS_WORKBOOK_PATH=./data/parcelamentos/LISTA PARCELAMENTOS.xlsx
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
