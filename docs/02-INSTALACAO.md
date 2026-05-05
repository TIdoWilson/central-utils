# 02 - Guia de Instalação

## 📋 Pré-requisitos

Antes de iniciar, certifique-se de ter instalado:

### Sistema Operacional
- **Windows 10/11** ou **Linux/macOS**
- PowerShell 7+ (Windows) ou Bash (Linux/macOS)

### Software Obrigatório

| Componente | Versão Mínima | Download |
|-----------|--------------|----------|
| Node.js | 18.x LTS | https://nodejs.org |
| Python | 3.9+ | https://www.python.org |
| PostgreSQL | 12+ | https://www.postgresql.org |
| Git | 2.0+ | https://git-scm.com |

### Software Opcional
- **Go 1.19+** (se usar `go-api/`)
- **Docker** (para containerização)
- **Visual Studio Code** (editor recomendado)

### Certificados SERPRO (Produção)
- `cert.pem` - Certificado do cliente
- `key.pem` - Chave privada
- `ca.pem` - Certificado da CA

---

## ✅ Passo 1: Verificar Instalações

### Windows (PowerShell)

```powershell
# Node.js
node --version
npm --version

# Python
python --version

# PostgreSQL
psql --version

# Git
git --version
```

### Linux/macOS (Bash)

```bash
# Node.js
node --version
npm --version

# Python
python3 --version

# PostgreSQL
psql --version

# Git
git --version
```

---

## 📥 Passo 2: Clonar o Repositório

```bash
# Se houver repositório Git
git clone https://seu-repo/central-utils.git
cd central-utils

# Se for pasta local, apenas abra
cd "W:\DOCUMENTOS ESCRITORIO\INSTALACAO SISTEMA\central-utils"
```

---

## 🐍 Passo 3: Configurar Ambiente Python

### 3.1 Criar Virtual Environment

**Windows (PowerShell):**

```powershell
# Criar venv
python -m venv .venv

# Ativar
.\.venv\Scripts\Activate.ps1
```

**Linux/macOS (Bash):**

```bash
# Criar venv
python3 -m venv .venv

# Ativar
source .venv/bin/activate
```

### 3.2 Instalar Dependências Python

```bash
# Deve estar dentro do .venv
pip install --upgrade pip

# Instalar requirements
pip install -r api/requirements.txt
```

### 3.3 Verificar Instalação Python

```bash
python -c "import fastapi; import pdfplumber; import pandas; print('✓ Python OK')"
```

---

## 📦 Passo 4: Instalar Dependências Node.js

```bash
# Instalar do package.json
npm install

# Ou, se houver package-lock.json
npm ci
```

### Dependências Principal
```
✓ express - Servidor web
✓ socket.io - WebSocket
✓ multer - Upload de arquivos
✓ axios - Requisições HTTP
✓ bcryptjs - Criptografia
✓ pg - Driver PostgreSQL
✓ pdf-lib - Manipulação PDF
✓ xlsx - Processamento Excel
```

---

## 🔧 Passo 5: Configurar PostgreSQL

### 5.1 Criar Banco de Dados

**Windows cmd ou PowerShell:**

```bash
# Conectar ao PostgreSQL
psql -U postgres

# Dentro do psql shell:
CREATE DATABASE central_utils;
CREATE USER central_app WITH PASSWORD 'sua_senha_segura';
GRANT ALL PRIVILEGES ON DATABASE central_utils TO central_app;
\q
```

**Linux/macOS:**

```bash
# Criar banco
createdb central_utils

# Criar usuário
createuser central_app
psql -U postgres -d central_utils -c "ALTER USER central_app WITH PASSWORD 'sua_senha_segura';"
psql -U postgres -d central_utils -c "GRANT ALL PRIVILEGES ON DATABASE central_utils TO central_app;"
```

### 5.2 Criar Tabelas (Se aplicável)

Se houver arquivo `schema.sql` no repositório:

```bash
psql -U central_app -d central_utils -f schema.sql
```

---

## 🔐 Passo 6: Configurar Variáveis de Ambiente

### 6.1 Criar arquivo `.env`

Na raiz do projeto (mesmo nível de `package.json`):

```bash
cp .env.example .env
```

Ou criar manualmente:

```bash
# Criar arquivo vazio
touch .env  # Linux/macOS
# ou New-Item -Path .env -ItemType File  # PowerShell
```

### 6.2 Editar `.env`

Abra `w:\DOCUMENTOS ESCRITORIO\INSTALACAO SISTEMA\central-utils\.env` em um editor de texto e configure:

```bash
# ========================
# NODE.JS / EXPRESS
# ========================
NODE_ENV=development
PORT=3000
HOST=127.0.0.1

# ========================
# PYTHON / FASTAPI
# ========================
PYTHON_PORT=8001
PYTHON_HOST=127.0.0.1

# ========================
# BANCO DE DADOS (PostgreSQL)
# ========================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=central_utils
DB_USER=central_app
DB_PASS=sua_senha_segura

# ========================
# AUTENTICAÇÃO SERPRO
# ========================
SERPRO_CERT_PATH=./src/certs/cert.pem
SERPRO_KEY_PATH=./src/certs/key.pem
SERPRO_CA_PATH=./src/certs/ca.pem
SERPRO_API_URL=https://api.serpro.gov.br
SERPRO_JWT_SECRET=sua_chave_jwt_segura_muito_longa

# ========================
# CAMINHOS DE ARQUIVOS
# ========================
DATA_DIR=./data
UPLOADS_DIR=./data/uploads
OUTPUTS_DIR=./data/outputs
TEMP_DIR=./tmp

# ========================
# LOGGING
# ========================
LOG_LEVEL=debug
LOG_FILE=./data/logs/app.log

# ========================
# SEGURANÇA
# ========================
BCRYPT_ROUNDS=10
SESSION_SECRET=sua_sessao_secret_muito_longa
CORS_ORIGIN=http://localhost:3000

# ========================
# INTEGRAÇÃO MADRE (Opcional)
# ========================
MADRE_API_URL=https://api.madre.local
MADRE_API_KEY=sua_chave_madre

# ========================
# GO API (Opcional)
# ========================
GO_API_PORT=8002
GO_API_HOST=127.0.0.1
```

> ⚠️ **IMPORTANTE:** Nunca committar `.env` com valores reais! Adicionar ao `.gitignore`

---

## 🏢 Passo 7: Configurar Certificados SERPRO (Produção)

Se usar autenticação SERPRO:

```bash
# Criar diretório de certificados
mkdir src/certs

# Copiar certificados para a pasta
# cert.pem → src/certs/cert.pem
# key.pem → src/certs/key.pem
# ca.pem → src/certs/ca.pem

# Verificar permissões (Linux/macOS)
chmod 600 src/certs/*.pem
```

---

## 📂 Passo 8: Criar Diretórios Necessários

```bash
# Criar diretórios de dados se não existirem
mkdir -p data/uploads
mkdir -p data/outputs
mkdir -p data/logs
mkdir -p tmp
```

---

## ✅ Passo 9: Verificar Instalação

Execute este script para validar tudo:

**Windows (PowerShell):**

```powershell
Write-Host "=== VERIFICANDO INSTALAÇÃO ===" -ForegroundColor Green
Write-Host ""

Write-Host "Node.js:" -ForegroundColor Cyan
node --version

Write-Host "npm:" -ForegroundColor Cyan
npm --version

Write-Host "Python:" -ForegroundColor Cyan
python --version

Write-Host "PostgreSQL:" -ForegroundColor Cyan
psql --version

Write-Host ""
Write-Host "Verificando pacotes Node.js..." -ForegroundColor Cyan
npm list express fastapi multer axios

Write-Host ""
Write-Host "Verificando pacotes Python..." -ForegroundColor Cyan
python -c "import fastapi, pdfplumber, pandas; print('✓ Pacotes Python OK')"

Write-Host ""
Write-Host "Verificando bancos de dados..." -ForegroundColor Cyan
# psql -U central_app -d central_utils -c "SELECT version();"

Write-Host ""
Write-Host "✅ INSTALAÇÃO COMPLETA!" -ForegroundColor Green
```

**Linux/macOS (Bash):**

```bash
#!/bin/bash
echo "=== VERIFICANDO INSTALAÇÃO ==="
echo ""

echo "Node.js:"
node --version

echo "npm:"
npm --version

echo "Python:"
python3 --version

echo "PostgreSQL:"
psql --version

echo ""
echo "Verificando pacotes Node.js..."
npm list express multer axios

echo ""
echo "Verificando pacotes Python..."
python3 -c "import fastapi, pdfplumber, pandas; print('✓ Pacotes Python OK')"

echo ""
echo "✅ INSTALAÇÃO COMPLETA!"
```

---

## 🚀 Passo 10: Iniciar o Projeto

### Desenvolvimento (com Hot Reload)

```bash
# Ativar Python venv primeiro
# Windows
.\.venv\Scripts\Activate.ps1

# Linux/macOS
source .venv/bin/activate

# Depois rodar:
npm run dev
```

Isso inicia em paralelo:
- Node.js (porta 3000)
- FastAPI (porta 8001)
- Go API (porta 8002 - se ativado)

### Node.js apenas

```bash
npm run dev:node
```

### Python apenas

```bash
npm run dev:py
# ou
.venv\Scripts\python.exe -m uvicorn api.integra_api:app --host 127.0.0.1 --port 8001
```

### Go apenas

```bash
npm run dev:go
# ou
cd go-api && go run .
```

Se a porta 8002 ja estiver ocupada por outra instancia da API Go, `npm run dev:go` registra o aviso e mantem o restante do `npm run dev` em execucao.
Se o comando `go` nao estiver instalado ou nao estiver no PATH, o wrapper apenas avisa e segue com os demais servicos.

---

## 🔗 Verificar Conectividade

Abra um navegador e teste:

- **Frontend:** http://localhost:3000
- **API Python (Swagger):** http://localhost:8001/docs
- **API Python (ReDoc):** http://localhost:8001/redoc
- **API Go:** http://localhost:8002 (se ativado)

---

## ❌ Troubleshooting

### "Port 3000 already in use"

```bash
# Encontrar processo usando porta 3000
# Windows
netstat -ano | findstr :3000
# Matar processo
taskkill /PID <PID> /F

# Linux/macOS
lsof -i :3000
kill -9 <PID>
```

### "Port 8002 already in use"

```bash
# Verificar a instancia Go ativa
npm run dev:go

# Se quiser liberar a porta manualmente
netstat -ano | findstr :8002
taskkill /PID <PID> /F
```

### "ModuleNotFoundError: No module named 'fastapi'"

```bash
# Verificar se venv está ativado
which python  # Linux/macOS
where python  # Windows

# Se not in venv, activate:
.\.venv\Scripts\Activate.ps1  # Windows
source .venv/bin/activate      # Linux/macOS

# Reinstalar
pip install -r api/requirements.txt
```

### "PostgreSQL connection error"

```bash
# Verificar se PostgreSQL está rodando
psql -U central_app -d central_utils -c "SELECT 1;"

# Verificar .env
cat .env | grep DB_

# Reiniciar PostgreSQL
# Windows: Services.msc → PostgreSQL → Restart
# Linux: sudo systemctl restart postgresql
```

### "SERPRO certificate error"

```bash
# Verificar se certificados existem
ls -la src/certs/

# Verificar .env
cat .env | grep SERPRO_

# Validar certificado
openssl x509 -in src/certs/cert.pem -text -noout
```

---

## 📚 Próximos Passos

- [03 - Guia de Uso](./03-USO.md) - Como usar a plataforma
- [04 - Contribuindo](./04-CONTRIBUINDO.md) - Padrões de desenvolvimento
- [Deployment](./deployment/01-deploy.md) - Deploy em produção

---

**Última atualização:** Fevereiro 2026
