# 01 - Arquitetura do Projeto

## 🏗️ Visão Geral

A **Central Utils** é uma plataforma multi-camadas que combina Node.js, Python e Go para processar e automatizar tarefas administrativas e contábeis de empresas. A arquitetura é baseada em **microsserviços** com uma interface web unificada.

## 🔄 Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Web Browser)                      │
│  HTML + JavaScript | Autenticação | Upload de Arquivos         │
└─────────────┬──────────────────────────────────────────────────┘
              │
              ├─────── HTTP/REST ────────────┐
              │                              │
              ▼                              ▼
    ┌─────────────────────┐      ┌─────────────────────┐
    │  Node.js Server     │      │  Python FastAPI     │
    │  (Express)          │      │  (Microsserviços)   │
    │                     │      │                     │
    │ • Socket.io         │      │ • PDF Processing    │
    │ • Auth (Serpro)     │◄────►│ • Excel Handling    │
    │ • File Upload       │      │ • Data Transform    │
    │ • Queue Manager     │      │ • Report Generation │
    │ • Proxy/Gateway     │      │                     │
    └────────┬────────────┘      └────────┬────────────┘
             │                            │
             │          ┌──────────────────┘
             │          │
             ▼          ▼
    ┌──────────────────────────┐
    │  PostgreSQL Database     │
    │  (Tabelas principais)    │
    └──────────────────────────┘

    ┌──────────────────────────┐
    │  Filesystem Storage      │
    │  (data/uploads/, etc)    │
    └──────────────────────────┘
```

## 📊 Componentes Principais

### 1️⃣ Frontend (Aplicação Web)

**Localização:** `public/` + `src/`

**Responsabilidades:**
- Interface de usuário responsiva
- Upload de arquivos
- Exibição de resultados
- Gerenciamento de sessão do usuário
- Comunicação em tempo real (Socket.io)

**Tecnologias:**
- HTML5, CSS3, JavaScript vanilla
- Sem frameworks (mantém simplicidade)
- FormData API para uploads
- Fetch API para requisições

**Arquivos Principais:**
- `public/*.html` - Páginas individuais
- `public/js/*.js` - Lógica de cada ferramenta
- `public/js/sidebar.js` - Menu lateral
- `public/js/auth-client.js` - Gerenciamento de autenticação
- `public/js/upload-helper.js` - Utilitários de upload

### 2️⃣ Backend Node.js (Orquestrador)

**Localização:** `src/`

**Responsabilidades:**
- Servidor web principal (Express)
- Autenticação de usuários (SERPRO)
- Roteamento de requisições
- Gerenciamento de uploads
- Processamento de filas (background jobs)
- WebSocket (Socket.io) para comunicação real-time

**Tecnologias:**
- Express.js
- Socket.io
- Multer (upload)
- axios (requisições HTTP)
- pg (PostgreSQL driver)
- node-forge (criptografia)
- bcryptjs (hash de senhas)

**Arquivos Principais:**

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/server.js` | Servidor Express principal, rotas CRUD, endpoints da API |
| `src/worker.js` | Processador de filas (jobs background) |
| `src/serpro-auth.js` | Autenticação com SERPRO (tokens, MTLS) |
| `src/queue.js` | Gerenciador de fila de processamento |
| `src/parsers.js` | Utilitários de parse (CSV, XML, JSON) |

### 3️⃣ Backend Python (Microsserviços)

**Localização:** `api/`

**Responsabilidades:**
- Processamento de PDFs
- Processamento de Excel
- Manipulação de dados
- Geração de relatórios
- Extração de informações

**Tecnologias:**
- FastAPI (web framework)
- Uvicorn (ASGI server)
- pdfplumber (leitura PDF)
- pandas (análise de dados)
- openpyxl (manipulação Excel)
- PyPDF2 (operações PDF)
- PyMuPDF (renderização PDF)

**Cores de Processamento (API Modules):**

| Módulo | Função |
|--------|--------|
| `gerador_atas_core.py` | Gera atas de reunião em Word/PDF |
| `relatorio_ferias_core.py` | Extrai e separa relatórios de férias |
| `holerites_core.py` | Separa holerites por empresa |
| `separador_ferias_funcionario_core.py` | Organiza dados de férias |
| `separador_csv_baixa_automatica_core.py` | Processa planilhas de baixa |
| `excel_abas_pdf_core.py` | Converte Excel em PDF |
| `comprimir_pdf_core.py` | Reduz tamanho de PDFs |
| `extrator_zip_rar_core.py` | Extrai arquivos compactados |
| `importador_recebimentos_madre_scp_core.py` | Integração MADRE |
| `ajuste_diario_gfbr_core.py` | Ajustes contábeis |
| `integra_api.py` | API principal que expõe os cores |

### 4️⃣ Backend Go (Opcional)

**Localização:** `go-api/`

**Responsabilidades:**
- Processamento de alta performance
- Cálculos pesados (quando necessário)
- Pode estar desativado

**Comando para iniciar:**
```bash
cd go-api && go run .
```

## 🔐 Segurança e Autenticação

### Fluxo de Autenticação

```
1. Usuário faz login na web
   ↓
2. Requisição POST /login com credenciais
   ↓
3. server.js autentica com SERPRO (mTLS)
   ↓
4. SERPRO retorna token JWT
   ↓
5. Token armazenado no navegador (localStorage/cookie)
   ↓
6. Requisições subsequentes incluem token no header
   ↓
7. server.js valida token em cada requisição
```

**Arquivo: `src/serpro-auth.js`**
- Gerencia certificados MTLS
- Cria e valida tokens JWT
- Renova tokens expirados

## 📤 Fluxo de Upload e Processamento

```
1. Usuário faz upload no frontend
   ↓
2. Frontend envia arquivo para server.js (Multer)
   ↓
3. server.js valida arquivo e move para data/uploads/
   ↓
4. Cria job na fila de processamento
   ↓
5. worker.js processa o job:
   - Chama microsserviço Python adequado
   - Monitora progresso
   - Envia eventos via Socket.io
   ↓
6. Python API processa e retorna resultado
   ↓
7. Resultado salvo em data/outputs/
   ↓
8. Frontend notificado via Socket.io
   ↓
9. Usuário baixa resultado
```

## 🗂️ Estrutura de Dados

### Diretórios Principais em `data/`

```
data/
├── uploads/                      # Arquivos subidos
├── outputs/                      # Resultados processados
├── atas_geradas/                # Atas geradas
├── atas_modelos/                # Templates de atas
├── excel-abas-pdf/              # Resultados Excel→PDF
├── separador-csv-baixa-automatica/
├── extrator-zip-rar/            # Arquivos extraídos
├── balancete-transitorio/       # Balancetes
├── conciliador-hausen-ocean/    # Dados de conciliação
├── dimob/                       # Dados DIMOB
├── ecd-status/                  # Status de ECDs
├── pdfa/                        # Conversão PDF/A
├── ferias-funcionario/          # Dados de férias
└── formatador-bernardina/       # Dados do formatador
```

### Banco de Dados (PostgreSQL)

Conexão definida em `src/server.js`:

```javascript
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS
});
```

**Tabelas esperadas:**
- `usuarios` - Dados de login
- `jobs` - Fila de processamento
- `logs` - Auditoria
- (outras conforme necessário)

## 🔌 APIs Externas Integradas

### SERPRO (Governo)
- Autenticação com mTLS
- Certificados em `src/` (privado)
- API para validação e consultas

### MADRE SCP
- Importação de recebimentos
- Documentado em `api/importador_recebimentos_madre_scp_core.py`

## 🚀 Sequência de Inicialização

### Desenvolvimento (npm run dev)

```bash
$ npm run dev

# Inicia em paralelo:
1. npm run dev:node  → Node.js server (porta 3000)
2. npm run dev:py    → FastAPI (porta 8001)
3. npm run dev:go    → Go API (porta 8002)
```

**Ordem recomendada de inicialização:**
1. PostgreSQL (rodar manualmente ou Docker)
2. Python (`uvicorn api.integra_api:app --host 127.0.0.1 --port 8001`)
3. Node.js (`node src/server.js`)
4. Frontend abre em `http://localhost:3000`

### Produção

Veja [docs/deployment/01-deploy.md](../deployment/01-deploy.md)

## 📊 Padrões de Comunicação

### REST API

**Node.js Server Endpoints:**
- `POST /api/login` - Autenticação
- `POST /api/upload` - Upload de arquivo
- `POST /api/job/:toolName` - Iniciar processamento
- `GET /api/job/:jobId/status` - Status do job
- `GET /api/logs` - Logs da aplicação

### WebSocket (Socket.io)

**Eventos emitidos:**
- `user:authenticated` - Usuário autenticado
- `job:started` - Job iniciado
- `job:progress` - Progresso do job
- `job:completed` - Job completado
- `job:error` - Erro no processamento
- `file:ready` - Arquivo pronto para download

## 🔍 Monitoramento e Logs

- **Logs Node.js:** `console.log` → terminal ou arquivo
- **Logs Python:** `logging` module → `data/logs/`
- **Logs Frontend:** `console` do navegador
- **Auditoria:** Tabela `logs` no PostgreSQL

## 🎯 Próximas Seções

- [02 - Guia de Instalação](./02-INSTALACAO.md)
- [03 - Guia de Uso](./03-USO.md)
- [API Python - Detalhes](./api/)
- [Frontend - Detalhes](./frontend/)

---

**Última atualização:** Fevereiro 2026
