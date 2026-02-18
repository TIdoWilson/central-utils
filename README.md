# Central Utils - Plataforma de Ferramentas Contábeis e Administrativas

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-ISC-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![Python](https://img.shields.io/badge/python-%3E%3D3.9-brightgreen.svg)

## 📋 Descrição

**Central Utils** é uma plataforma integrada que automatiza processos administrativos e contábeis de empresas. Combina:

- ✅ **Backend Node.js** - Orquestração, autenticação, gerenciamento de arquivos
- ✅ **Backend Python** - Processamento de PDFs, Excel, dados estruturados  
- ✅ **Frontend Web** - Interface responsiva e intuitiva
- ✅ **Integração SERPRO** - Autenticação com certificados digitais
- ✅ **PostgreSQL** - Armazenamento de dados estruturado

### 🎯 Ferramentas Disponíveis

1. **Gerador de Atas** - Criar atas automáticas em DOCX/PDF
2. **Separador PDF** - Dividir PDFs consolidados em documentos individuais
3. **Separador Holerites** - Organizar holerites por empresa
4. **Separador CSV** - Processar planilhas de baixa automática
5. **Excel → PDF** - Converter Excel em PDF estruturado
6. **Compressor PDF** - Reduzir tamanho de PDFs
7. **Extrator ZIP/RAR** - Extrair arquivos compactados
8. **Importador MADRE** - Integração com sistema MADRE SCP
9. **Ajuste Diário GFBR** - Lançamentos contábeis automáticos
10. **E mais...**

---

## 🚀 Quick Start

### Pré-requisitos

- Node.js 18+
- Python 3.9+
- PostgreSQL 12+
- Git

### Instalação (5 minutos)

```bash
# 1. Clonar/abrir projeto
cd central-utils

# 2. Instalar dependências
npm install
pip install -r api/requirements.txt

# 3. Configurar ambiente
cp .env.example .env
# Edite .env com seus valores (DB, SERPRO, etc)

# 4. Criar banco de dados
createdb central_utils
# (ou use psql para criar tabelas)

# 5. Iniciar
npm run dev
```

**Acesso:**
- Frontend: http://localhost:3000
- API Python: http://localhost:8001/docs
- API Go (opcional): http://localhost:8002

---

## 📚 Documentação Completa

Acesse a documentação em detalhes:

### 🏗️ Primeiros Passos
- **[📖 README de Documentação](./docs/README.md)** - Índice principal
- **[🎯 Arquitetura](./docs/01-ARQUITETURA.md)** - Como funciona o projeto
- **[📦 Instalação](./docs/02-INSTALACAO.md)** - Guia passo a passo
- **[💻 Como Usar](./docs/03-USO.md)** - Usar cada ferramenta
- **[🤝 Contribuindo](./docs/04-CONTRIBUINDO.md)** - Padrões e contribuição

### 🔧 Backend
- **[API Python](./docs/api/00-INDICE.md)** - Todas as 10+ ferramentas
  - [Gerador de Atas](./docs/api/01-gerador-atas.md)
  - [Separador PDF - Férias](./docs/api/02-separador-pdf-relatorio-ferias.md)
  - [Separador Holerites](./docs/api/03-separador-holerites.md)
  - E mais...

### 🎨 Frontend
- **[Estrutura HTML/JS](./docs/frontend/01-estrutura.md)** - Como construir páginas
- [Autenticação](./docs/frontend/02-autenticacao.md)
- [Componentes](./docs/frontend/03-componentes.md)

### 🚀 Deployment
- **[Deploy em Produção](./docs/deployment/01-deploy.md)** - Docker, PM2, etc
- **[Variáveis de Ambiente](./docs/deployment/02-env-vars.md)** - .env completo
- [Monitoramento](./docs/deployment/03-monitoramento.md)

### 📖 Exemplos
- **[Exemplos de API](./docs/exemplos/01-uso-api.md)** - cURL, Python, JavaScript

---

## 📁 Estrutura do Projeto

```
central-utils/
├── api/                              # Backend Python (FastAPI)
│   ├── *.py                          # Cores de processamento
│   ├── integra_api.py               # API principal
│   └── requirements.txt              # Dependências
│
├── src/                              # Backend Node.js (Express)
│   ├── server.js                    # Servidor principal
│   ├── worker.js                    # Processador background
│   ├── serpro-auth.js               # Autenticação SERPRO
│   ├── queue.js                     # Gerenciador de fila
│   └── parsers.js                   # Utilitários
│
├── public/                           # Frontend (HTML + JS)
│   ├── *.html                       # Páginas de ferramentas
│   ├── js/                          # Scripts JavaScript
│   ├── css/styles.css               # Estilos
│   └── img/                         # Imagens
│
├── data/                            # Dados e bda
│   ├── uploads/                     # Arquivos upload
│   ├── outputs/                     # Resultados
│   ├── atas_modelos/               # Templates
│   └── logs/                        # Logs
│
├── docs/                            # Documentação (READ THIS!)
│   ├── README.md                   # Início aqui
│   ├── 01-ARQUITETURA.md           # Visão geral
│   ├── 02-INSTALACAO.md            # Step by step
│   ├── 03-USO.md                   # Como usar
│   ├── 04-CONTRIBUINDO.md          # Para desenvolvedores
│   ├── api/                        # Docs de cada ferramenta
│   ├── frontend/                   # Docs do frontend
│   ├── deployment/                 # Deploy
│   └── exemplos/                   # Exemplos práticos
│
├── tools/                          # Ferramentas externas
├── go-api/                         # Backend Go (opcional)
├── package.json                    # Dependências Node.js
├── .env.example                    # Template de environment
└── README.md                       # Este arquivo
```

---

## 🔧 Tecnologias

### Backend
- **Node.js + Express** - HTTP server, REST API, WebSocket
- **Python + FastAPI** - Microsserviços, Uvicorn
- **PostgreSQL** - Banco de dados principal
- **Socket.io** - Comunicação real-time

### PDF & Office
- **pdfplumber** - Leitura de PDFs
- **PyPDF2** - Manipulação de PDFs
- **openpyxl** - Processamento Excel
- **pdf-lib** - Manipulação PDF em Node.js

### Autenticação & Segurança
- **SERPRO mTLS** - Certificados digitais
- **JWT** - Tokens seguros
- **bcryptjs** - Hash de senhas
- **CORS** - Cross-origin security

### DevOps
- **Docker** - Containerização
- **PM2** - Process management
- **Nginx** - Reverse proxy
- **SystemD** - Serviços Linux

---

## 🚀 Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev              # Node + Python + Go em paralelo
npm run dev:node        # Apenas Node.js
npm run dev:py         # Apenas Python API
npm run dev:go         # Apenas Go API

# Produção
npm start              # Iniciar em produção

# Testes
npm test              # Rodar testes (quando configurado)

# Build
npm run build         # Build para produção
```

### Deploy VPS (1 comando)

No servidor VPS (Linux), dentro de `/opt/central-utils`:

```bash
npm run deploy:vps -- main
```

O script faz:
- `git pull` da branch
- instala dependências Node e Python
- roda `verify` (quando disponível)
- reinicia `central-node`, `central-python`, `central-go` e `caddy`

Se o repositório estiver em outro caminho, use:

```bash
APP_DIR=/caminho/do/projeto bash scripts/deploy-vps.sh main
```

### Fluxo para publicar nova ferramenta no site

1. Criar ferramenta local:
```bash
npm run tool:new -- --slug <slug> --title "..." --group "..." --api
```
2. Commit e push para o GitHub.
3. Na VPS:
```bash
npm run deploy:vps -- main
```

---

## 📊 Exemplo Rápido

### 1. Fazer Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"seu_usuario@empresa.com","password":"SUA_SENHA_AQUI"}'
```

### 2. Gerar Ata

```bash
curl -X POST http://localhost:8001/api/gerador-atas/gerar \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "modelo": "Template Bernadina.xlsm",
    "data_reuniao": "2025-02-06",
    "titulo": "Reunião de Teste",
    "presentes": ["João","Maria"],
    "assuntos": [{"numero":1,"titulo":"Teste","discussao":"Teste"}],
    "decisoes": ["Aprovado"],
    "proxima_reuniao": "2025-03-06"
  }'
```

### 3. Baixar Resultado

```javascript
// No browser após processar
const resultPath = "/data/outputs/ata_20250206_123456.zip";
window.location.href = `/download/${resultPath}`;
```

---

## 🐛 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| Port 3000 in use | `lsof -i :3000` / `kill -9 PID` |
| Module not found | `npm install` / `pip install -r api/requirements.txt` |
| DB connection error | Verificar PostgreSQL, confirmar .env |
| SERPRO auth fails | Confirmar certificados em `src/certs/` |
| Arquivo não processa | Verificar tamanho (máx 100MB), formato, logs |

Mais em [docs/03-USO.md#troubleshooting](./docs/03-USO.md#troubleshooting)

---

## 📞 Suporte

1. **Documentação:** Veja [docs/README.md](./docs/README.md)
2. **Exemplos:** Veja [docs/exemplos/](./docs/exemplos/)
3. **Issues:** Abra issue no repositório com detalhe
4. **Logs:** Verifique `data/logs/app.log`

---

## 🤝 Contribuindo

Quer adicionar uma ferramenta ou melhorar algo? Veja [docs/04-CONTRIBUINDO.md](./docs/04-CONTRIBUINDO.md)

**Checklist rápido:**
- [ ] Código segue padrões (PEP8, ESLint)
- [ ] Testou localmente (`npm run dev`)
- [ ] Documentação atualizada
- [ ] Sem bibliotecas não utilizadas
- [ ] Commit com mensagem descritiva

---

## 📄 Licença

ISC License - Veja [package.json](./package.json)

---

## 📈 Status do Projeto

- ✅ Núcleo: Estável
- ✅ API Python: 10+ ferramentas
- ✅ Frontend: Funcional
- ⚠️ Testes: Em desenvolvimento
- 🔄 CI/CD: Planejado

---

## 🙏 Agradecimentos

Desenvolvido para automação de processos contábeis com ❤️

---

## 📅 Última Atualização

**Fevereiro 2026** - Documentação v1.0.0

---

## 🔗 Links Rápidos

| Link | Descrição |
|------|-----------|
| [Documentação Completa](./docs/) | Guias detalhados |
| [Arquitetura](./docs/01-ARQUITETURA.md) | Como funciona |
| [Instalação](./docs/02-INSTALACAO.md) | Setup passo a passo |
| [API Reference](./docs/api/00-INDICE.md) | 10+ ferramentas |
| [Exemplos](./docs/exemplos/) | cURL, Python, JS |
| [Deploy](./docs/deployment/) | Produção |

---

**Comece pelo [README da Documentação](./docs/README.md)** 👈
