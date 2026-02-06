# Central Utils - Documentação Completa

## 📋 Índice da Documentação

Bem-vindo ao guia de documentação da **Central Utils**, uma plataforma integrada de ferramentas contábeis e administrativas que automatiza diversos processos de empresas.

### 📚 Documentos Principais

1. **[01 - Arquitetura do Projeto](./01-ARQUITETURA.md)**
   - Visão geral da arquitetura
   - Stack tecnológico (Node.js + Python + Go)
   - Fluxo de dados e comunicação entre módulos

2. **[02 - Guia de Instalação](./02-INSTALACAO.md)**
   - Pré-requisitos
   - Configuração do ambiente
   - Variáveis de ambiente (.env)
   - Instalação de dependências

3. **[03 - Guia de Uso](./03-USO.md)**
   - Como iniciar o projeto
   - Acesso da aplicação web
   - Uso básico das ferramentas
   - Resolução de problemas

4. **[04 - Contribuindo](./04-CONTRIBUINDO.md)**
   - Padrões de código
   - Como adicionar novas ferramentas
   - Processo de pull request
   - Testes e qualidade

### 🛠️ Ferramentas Disponíveis

#### API Python (Backend)

A API Python fornece os cores de processamento. Acesse `docs/api/` para documentação detalhada:

- **[Gerador de Atas](./api/01-gerador-atas.md)** - Geração automática de atas de reunião
- **[Separador PDF - Relatório de Férias](./api/02-separador-pdf-relatorio-ferias.md)** - Extração e separação de folhas de férias
- **[Separador PDF - Holerites](./api/03-separador-holerites.md)** - Separação de holerites por empresa
- **[Separador Férias por Funcionário](./api/04-separador-ferias-funcionario.md)** - Organização de dados de férias
- **[Separador CSV - Baixa Automática](./api/05-separador-csv-baixa.md)** - Processamento de planilhas de baixa
- **[Excel para PDF em Abas](./api/06-excel-abas-pdf.md)** - Conversão de Excel em PDF estruturado
- **[Compressor de PDF](./api/07-compressor-pdf.md)** - Redução de tamanho de PDFs
- **[Extrator ZIP/RAR](./api/08-extrator-zip-rar.md)** - Extração de arquivos compactados
- **[Importador de Recebimentos MADRE SCP](./api/09-importador-recebimentos.md)** - Integração com sistema MADRE
- **[Ajuste Diário GFBR](./api/10-ajuste-diario-gfbr.md)** - Ajustes contábeis automáticos

### 📖 Runbooks Operacionais

Para suporte operacional e troubleshooting, acesse `docs/runbooks/`:

- **[Runbook - Gerador de Atas](./runbooks/runbook-gerador-atas.md)** - Sintomas, DEBUG, reprocesso
- **[Runbook - Separador de Férias](./runbooks/runbook-separador-ferias.md)** - PDF parsing, memory management
- **[Runbook - Separador CSV Baixa](./runbooks/runbook-separador-csv-baixa.md)** - Formatação, locale issues
- **[Runbook - Excel para PDF](./runbooks/runbook-excel-abas-pdf.md)** - COM issues, Windows-only warnings
- **[Runbook - Relatório de Férias](./runbooks/runbook-relatorio-ferias.md)** - Company detection, ZIP creation
- **[Runbook - Holerites](./runbooks/runbook-holerites.md)** - pdfplumber extraction, normalization
- **[Runbook - Compressor PDF](./runbooks/runbook-compressor-pdf.md)** - PyMuPDF quality, DPI settings
- **[Runbook - Extrator ZIP/RAR](./runbooks/runbook-extrator-zip-rar.md)** - CRC errors, conflict resolution
- **[Runbook - Importador MADRE](./runbooks/runbook-importador-recebimentos.md)** - API auth, DB integrity
- **[Runbook - Ajuste GFBR](./runbooks/runbook-ajuste-diario-gfbr.md)** - Validation, audit, accounting rules

### ❓ FAQ Global

Para dúvidas transversais e troubleshooting consolidado:

- **[FAQ Global - Central Utils](./FAQ-GLOBAL.md)** (12 categorias)
  - Autenticação & Integrações
  - Problemas com Arquivos (PDF, Excel, CSV)
  - Formatação & Encoding
  - Performance & Memory
  - Permissões & Segurança
  - Validação & Dados
  - Problemas COM (Windows)
  - Arquivos Comprimidos
  - Banco de Dados
  - Conversão & Output
  - Troubleshooting Geral
  - Escalação & Contatos

#### Frontend (Aplicação Web)

Acesse `docs/frontend/` para documentação:

- **[Estrutura General](./frontend/01-estrutura.md)** - Organização de arquivos HTML/JS
- **[Autenticação](./frontend/02-autenticacao.md)** - Sistema de login e tokens
- **[Componentes Comuns](./frontend/03-componentes.md)** - Upload, logs, etc.
- **[Integração API](./frontend/04-integracao-api.md)** - Como integrar com backend

#### Servidor e Orquestração

- **[Server.js](./frontend/05-server.md)** - Express server principal
- **[Worker.js](./frontend/06-worker.md)** - Processador background de tarefas
- **[Autenticação SERPRO](./frontend/07-serpro-auth.md)** - Integração com API SERPRO

#### Deployment

Acesse `docs/deployment/` para documentação:

- **[Deploy em Produção](./deployment/01-deploy.md)** - Instruções de deployment
- **[Variáveis de Ambiente](./deployment/02-env-vars.md)** - Configuração completa
- **[Monitoramento](./deployment/03-monitoramento.md)** - Logs e health checks
- **[Backup e Recuperação](./deployment/04-backup.md)** - Estratégia de dados

### 📖 Exemplos e Testes

Acesse `docs/exemplos/` para:

- **Exemplos de API** - Requisições cURL e Postman
- **Casos de Uso** - Cenários reais de utilização
- **Testes Básicos** - Scripts de teste

---

## 🚀 Quick Start

### Instalação Rápida

```bash
# Clonar e entrar na pasta
cd central-utils

# Instalar dependências Node.js
npm install

# Instalar dependências Python
pip install -r api/requirements.txt

# Configurar .env
cp .env.example .env
# Edite o .env com suas configurações

# Iniciar desenvolvimento (Node.js + Python + Go)
npm run dev
```

### Acessar a Aplicação

- Frontend: `http://localhost:3000`
- API Python: `http://localhost:8001`
- API Go: `http://localhost:8002`

---

## 📁 Estrutura de Pastas

```
central-utils/
├── api/                    # Backend Python (FastAPI)
│   ├── *.py               # Cores de processamento
│   └── requirements.txt    # Dependências Python
├── src/                   # Backend Node.js
│   ├── server.js          # Express server
│   ├── worker.js          # Processador background
│   ├── serpro-auth.js     # Autenticação SERPRO
│   ├── queue.js           # Gerenciador de fila
│   └── parsers.js         # Utilitários de parse
├── public/                # Frontend
│   ├── *.html             # Páginas da aplicação
│   ├── js/                # Scripts JavaScript
│   ├── css/styles.css     # Estilos
│   └── img/               # Imagens e assets
├── go-api/                # Backend Go (opcional)
│   └── main.go
├── tools/                 # Ferramentas externas
│   ├── Calculadora Werbran/
│   └── formatador-bernardina/
├── data/                  # Dados e templates
│   ├── atas_modelos/
│   ├── atas_geradas/
│   └── ...
├── docs/                  # Documentação (este arquivo)
├── package.json           # Dependências Node.js
└── README.md             # Este arquivo

```

---

## 🔗 Tecnologias Utilizadas

### Backend
- **Node.js + Express** - Servidor web e API REST
- **Python + FastAPI** - microserviços de processamento
- **Go** (opcional) - Processamento de alta performance
- **Socket.io** - Comunicação em tempo real
- **PostgreSQL** - Banco de dados principal
- **Multer** - Upload de arquivos

### Frontend
- **HTML5 / CSS3 / JavaScript** - Aplicação web
- **FormData API** - Upload de arquivos
- **Fetch API** - Requisições HTTP

### Bibliotecas de Processamento
- **pdfplumber** - Leitura e extração de PDFs
- **pandas + openpyxl** - Processamento de Excel
- **PyPDF2** - Manipulação de PDFs
- **PyMuPDF** - Renderização de PDFs
- **Archiver** - Compressão de arquivos

---

## 📞 Suporte e Comunidade

Para dúvidas ou problemas:

1. Consulte os [exemplos](./exemplos/) e [troubleshooting](./03-USO.md#troubleshooting)
2. Verifique o log de erros em `data/logs/`
3. Abra uma issue no repositório

---

## 📄 Licença

ISC License - Veja package.json para detalhes

---

**Última atualização:** Fevereiro 2026  
**Versão da Documentação:** 1.0.0
