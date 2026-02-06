# 📚 Documentação das Ferramentas - API Python

## 🎯 Índice de Ferramentas

Esta pasta contém documentação detalhada de cada ferramenta da API Python (FastAPI). Cada ferramenta é um microsserviço especializado em rprocessar um tipo específico de dado.

### Lista de Ferramentas

| # | Ferramenta | Arquivo | Tipo | Status |
|---|-----------|---------|------|--------|
| 1 | Gerador de Atas | `01-gerador-atas.md` | PDF/DOCX | ✅ Ativo |
| 2 | Separador PDF - Relatório Férias | `02-separador-pdf-relatorio-ferias.md` | PDF | ✅ Ativo |
| 3 | Separador PDF - Holerites | `03-separador-holerites.md` | PDF | ✅ Ativo |
| 4 | Separador - Férias por Funcionário | `04-separador-ferias-funcionario.md` | Dados | ✅ Ativo |
| 5 | Separador CSV - Baixa Automática | `05-separador-csv-baixa.md` | CSV | ✅ Ativo |
| 6 | Excel para PDF em Abas | `06-excel-abas-pdf.md` | Excel/PDF | ✅ Ativo |
| 7 | Compressor de PDF | `07-compressor-pdf.md` | PDF | ✅ Ativo |
| 8 | Extrator ZIP/RAR | `08-extrator-zip-rar.md` | Compactado | ✅ Ativo |
| 9 | Importador Recebimentos MADRE SCP | `09-importador-recebimentos.md` | Integração | ✅ Ativo |
| 10 | Ajuste Diário GFBR | `10-ajuste-diario-gfbr.md` | Contábil | ✅ Ativo |

---

## 🗂️ Novo Template de Documentação

**IMPORTANTE:** A partir de Fevereiro 2026, toda documentação segue um novo template **aprofundado e padronizado**.

### ✨ Estrutura do Novo Template

Cada ferramenta agora inclui:

```markdown
# {{ Nome da Ferramenta }}

> **Tipo:** (UI interna / Job / API / Script)  
> **Status:** (Ativa / Deprecada)  
> **Owner:** (Squad/Team)  
> **Local no repo:** `/<path>`  
> **Ambientes:** (dev/stg/prod)  

## Objetivo              # O quê e para quem
## Quando usar           # Casos de uso específicos
## Como acessar          # UI, API, CLI, etc
## Fluxo principal       # Passo a passo
## Entradas e saídas     # JSON + estrutura dados
## Dependências          # Serviços e bibliotecas
## Permissões/segurança  # RBAC + LGPD + auditoria
## Configurações         # Env vars + feature flags
## Observabilidade       # Logs, métricas, tracing
## Runbook               # Reprocess, rollback, limites
## Troubleshooting       # Erros comuns + soluções
## Referências           # Código, issues, schemas
```

**Vantagens:**
- ✅ Documentação operacional completa
- ✅ Facilita onboarding
- ✅ Suporta auditoria/compliance
- ✅ Referências técnicas incluídas
- ✅ Troubleshooting integrado

### 📖 Guia de Referência

Consulte o **[TEMPLATE-GUIA-REFERENCIA.md](./TEMPLATE-GUIA-REFERENCIA.md)** para:
- Estrutura detalhada de cada seção
- Exemplos de preenchimento
- Convenções de estilo
- Checklist para novo documento

### 📋 Documentos Já Atualizados

Liste ferramentas já no novo template:

| # | Ferramenta | Template Novo | Link |
|---|-----------|---|---|
| 1 | Gerador de Atas | ✅ Sim | [01-gerador-atas.md](./01-gerador-atas.md) |
| 4 | Separador Férias por Funcionário | ✅ Sim | [04-separador-ferias-funcionario.md](./04-separador-ferias-funcionario.md) |
| 5 | Separador CSV - Baixa Automática | ✅ Sim | [05-separador-csv-baixa.md](./05-separador-csv-baixa.md) |
| 6 | Excel para PDF em Abas | ✅ Sim | [06-excel-abas-pdf.md](./06-excel-abas-pdf.md) |
| 2 | Separador PDF - Relatório Férias | ⏳ Planejado | [02-separador-pdf-relatorio-ferias.md](./02-separador-pdf-relatorio-ferias.md) |
| 3 | Separador PDF - Holerites | ⏳ Planejado | [03-separador-holerites.md](./03-separador-holerites.md) |
| 7 | Compressor de PDF | ⏳ Planejado | [07-compressor-pdf.md](./07-compressor-pdf.md) |
| 8 | Extrator ZIP/RAR | ⏳ Planejado | [08-extrator-zip-rar.md](./08-extrator-zip-rar.md) |
| 9 | Importador Recebimentos MADRE SCP | ⏳ Planejado | [09-importador-recebimentos.md](./09-importador-recebimentos.md) |
| 10 | Ajuste Diário GFBR | ⏳ Planejado | [10-ajuste-diario-gfbr.md](./10-ajuste-diario-gfbr.md) |

---

## 🗂️ Estrutura de Documento (Legado)

Documentos antigos (anteriores a Fevereiro 2026) seguem padrão básico:

```
# [Nome da Ferramenta]

## 🎯 Objetivo
Descrição breve

## 📥 Entrada & 📤 Saída
Formato dos dados

## 🌐 Endpoint
URL e parâmetros

## 💻 Exemplos
Curl, Python, etc.
```

**Nota:** Documentos legados estão em `*-antigo.md`. Não modifique diretamente; se precisar atualizar, migre para novo template.

---

## 📦 Dependências Compartilhadas

Todas as ferramentas compartilham estas bibliotecas:

```python
# Leitura/processamento de PDF
import pdfplumber
from pypdf import PdfReader, PdfWriter
import PyPDF2
from pdf2image import convert_from_path

# Excel/CSV
import pandas as pd
from openpyxl import load_workbook
import csv

# Utilitários
from pathlib import Path
from typing import Dict, List, Optional
import logging
import json
import tempfile
import shutil
```

---

## 🔄 Fluxo Padrão de Processamento

```
1. Receber requisição HTTP (FastAPI)
   ↓
2. Validar parâmetros (Pydantic)
   ↓
3. Validar arquivo (caminho, tipo, tamanho)
   ↓
4. Processar (lógica específica)
   ↓
5. Gerar saída (arquivo ou dados)
   ↓
6. Retornar resultado (JSON)
   ├─ success: true/false
   ├─ output_path: "/data/outputs/..."
   ├─ message: "Descrição"
   └─ error: "erro se houve"
```

---

## 🏗️ Estrutura Padrão de Core Python

```python
# api/exemplo_core.py
"""
Módulo responsável por [operação específica].

Função Principal: processar_[nome]()
Entrada: arquivo + parâmetros
Saída: arquivo processado ou estrutura de dados
"""

from pathlib import Path
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

def processar_[nome](
    input_path: str,
    parametro1: str,
    output_dir: Optional[str] = None
) -> Dict[str, Any]:
    """
    Processa [descrição].
    
    Args:
        input_path: Caminho do arquivo de entrada
        parametro1: Descrição do parâmetro
        output_dir: Diretório de saída (default: temp)
    
    Returns:
        dict: {
            'success': bool,
            'output_path': str (caminho do arquivo),
            'message': str (descrição),
            'error': str (se houver erro)
        }
    """
    
    # Validações
    input_file = Path(input_path)
    if not input_file.exists():
        return {
            'success': False,
            'error': 'Arquivo não encontrado'
        }
    
    # Processamento
    try:
        # ... lógica aqui ...
        
        output_file = Path(output_dir) / 'resultado.pdf'
        # ... gerar arquivo ...
        
        logger.info(f'Processamento concluído: {output_file}')
        
        return {
            'success': True,
            'output_path': str(output_file),
            'output_filename': output_file.name,
            'message': 'Processamento realizado com sucesso'
        }
        
    except Exception as e:
        logger.error(f'Erro no processamento: {e}', exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }
```

---

## 🔌 Integração em integra_api.py

Cada ferramenta é exportada em `api/integra_api.py`:

```python
# api/integra_api.py

# 1. Importar
from api.exemplo_core import processar_exemplo

# 2. Definir Modelo Pydantic
from pydantic import BaseModel

class ExemploRequest(BaseModel):
    input_path: str
    parametro1: str
    output_dir: Optional[str] = None

# 3. Criar Endpoint
@app.post("/api/exemplo/processar")
async def processar_exemplo_endpoint(params: ExemploRequest):
    """Endpoint da ferramenta Exemplo"""
    result = processar_exemplo(
        input_path=params.input_path,
        parametro1=params.parametro1,
        output_dir=params.output_dir
    )
    
    if not result.get('success'):
        raise HTTPException(
            status_code=500,
            detail=result.get('error', 'Erro desconhecido')
        )
    
    return {**result, 'endpoint': '/api/exemplo/processar'}
```

---

## 🧪 Como Testar Ferramentas

### 1. Via Swagger UI

Abra no navegador:
```
http://localhost:8001/docs
```

Encontre o endpoint, clique em "Try it out", preencha os parâmetros e execute.

### 2. Via cURL (Command Line)

```bash
curl -X POST http://localhost:8001/api/[nome]/processar \
  -H "Content-Type: application/json" \
  -d '{
    "input_path": "/path/to/file",
    "parametro1": "valor"
  }' \
  -v
```

### 3. Via Python Requests

```python
import requests

url = "http://localhost:8001/api/exemplo/processar"
payload = {
    "input_path": "/path/to/file.pdf",
    "parametro1": "valor"
}

response = requests.post(url, json=payload)
result = response.json()

if result.get('success'):
    print(f"Resultado: {result['output_path']}")
else:
    print(f"Erro: {result.get('error')}")
```

---

## 📊 Padrão de Resposta

Todas as ferramentas retornam este padrão JSON:

### Sucesso

```json
{
  "success": true,
  "output_path": "/data/outputs/resultado_12345.pdf",
  "output_filename": "resultado_12345.pdf",
  "message": "Processamento realizado com sucesso",
  "pages": 5,
  "size_bytes": 125000
}
```

### Erro

```json
{
  "success": false,
  "error": "Arquivo PDF corrompido ou inválido",
  "detail": "Detalhes técnicos do erro (se disponível)"
}
```

---

## ⚡ Performance e Limites

| Aspecto | Valor |
|---------|-------|
| Tamanho máximo de arquivo | 100 MB |
| Timeout de processamento | 300 segundos (5 min) |
| PDFs simultâneos | 3-5 (dependendo de servidor) |
| Tempo médio processamento | 2-30 segundos |
| Espaço disco necessário | ~5x tamanho do arquivo |

---

## 🔐 Segurança

- ✅ Validação de tipos de arquivo
- ✅ Limite de tamanho de arquivo
- ✅ Path traversal protection
- ✅ Limpeza de arquivos temporários
- ✅ Logging de operações
- ✅ Tratamento de exceções seguro

---

## 🚀 Desenvolvimento de Nova Ferramenta

Siga este checklist para adicionar nova ferramenta:

- [ ] Criar `api/nova_ferramenta_core.py`
- [ ] Adicionar em `api/integra_api.py`
- [ ] Criar HTML em `public/`
- [ ] Criar JS em `public/js/`
- [ ] Adicionar menu em `public/home.html`
- [ ] Documentar em `docs/api/XX-nova-ferramenta.md`
- [ ] Testar via Swagger
- [ ] Testar via Frontend
- [ ] Commit com mensagem clara

Veja [./04-CONTRIBUINDO.md](../../04-CONTRIBUINDO.md) para detalhes.

---

## 📚 Próximas Seções

Acesse cada ferramenta:

- [01 - Gerador de Atas](./01-gerador-atas.md)
- [02 - Separador PDF Férias](./02-separador-pdf-relatorio-ferias.md)
- [03 - Separador Holerites](./03-separador-holerites.md)
- ... e mais (veja tabela acima)

---

**Última atualização:** Fevereiro 2026  
**Total de Ferramentas:** 10  
**Última Ferramenta Adicionada:** Ajuste Diário GFBR
