# 01 - Gerador de Atas

## 🎯 Objetivo

Gerar automaticamente **atas de reunião** em Word (DOCX) e PDF a partir de modelos predefinidos. Economiza tempo e garante padronização nos documentos.

---

## 📥 Entrada (Input)

### Arquivo:
- **Tipo:** Nenhum arquivo (dados via formulário)
- **Formato:** Dados estruturados em JSON

### Parâmetros:

```json
{
  "modelo": "Template Bernadina.xlsm",
  "data_reuniao": "2025-02-06",
  "hora_inicio": "14:30",
  "hora_fim": "16:00",
  "local": "Sala de Conferências",
  "responsavel": "João Silva",
  "departamento": "Administração",
  "titulo": "Reunião de Planejamento 2025",
  "presentes": ["João Silva", "Maria Santos", "Carlos Costa"],
  "ausentes": [],
  "assuntos": [
    {
      "numero": 1,
      "titulo": "Revisão de Orçamento",
      "discussao": "Discussão dos itens de maior impacto..."
    },
    {
      "numero": 2,
      "titulo": "Cronograma de Projetos",
      "discussao": "Definição de datas e milestones..."
    }
  ],
  "decisoes": [
    "Aprovar orçamento 2025",
    "Criar task force para projeto X"
  ],
  "proxima_reuniao": "2025-03-06"
}
```

---

## 📤 Saída (Output)

### Estrutura de Arquivos:

```
resultado_[timestamp].zip
├── ata.docx          ← Documento Word editável
├── ata.pdf           ← Documento PDF para impressão
└── ata.html          ← Versão HTML para visualização
```

### Exemplo de Arquivo Gerado:

```
ATA DE REUNIÃO

Data: 06/02/2025
Horário: 14:30 - 16:00
Local: Sala de Conferências
Responsável: João Silva
Departamento: Administração

PRESENTES:
• João Silva
• Maria Santos
• Carlos Costa

ASSUNTOS DISCUTIDOS:

1. Revisão de Orçamento
   Discussão dos itens de maior impacto...
   Decisão: Aprovado

2. Cronograma de Projetos
   Definição de datas e milestones...
   Decisão: Criar task force

DECISÕES TOMADAS:
✓ Aprovar orçamento 2025
✓ Criar task force para projeto X

PRÓXIMA REUNIÃO: 06/03/2025

Assinado digitalmente em 06/02/2025 às 16:30
```

---

## 🔧 Arquivo Core

**Caminho:** `api/gerador_atas_core.py`

**Funções principais:**
- `listar_modelos()` - Lista templates disponíveis
- `obter_campos_modelo(modelo)` - Retorna campos necessários para modelo
- `gerar_ata(dados, modelo, output_dir)` - Gera ata com base em dados

**Exemplos de modelos disponíveis:**
- `Template Bernadina.xlsm` - Modelo padrão da empresa
- (Adicione mais em `data/atas_modelos/`)

---

## 🌐 Endpoint REST

### URL
```
POST /api/gerador-atas/gerar
```

### Parâmetros (JSON Body)
```json
{
  "modelo": "Template Bernadina.xlsm",
  "data_reuniao": "2025-02-06",
  "hora_inicio": "14:30",
  "hora_fim": "16:00",
  "local": "Sala de Conferências",
  "responsavel": "João Silva",
  "departamento": "Administração",
  "titulo": "Título da Reunião",
  "presentes": ["pessoa1", "pessoa2"],
  "ausentes": [],
  "assuntos": [
    {
      "numero": 1,
      "titulo": "Assunto 1",
      "discussao": "Detalhes da discussão"
    }
  ],
  "decisoes": ["Decisão 1", "Decisão 2"],
  "proxima_reuniao": "2025-03-06",
  "output_dir": "/data/atas_geradas"
}
```

### Resposta de Sucesso (200)
```json
{
  "success": true,
  "output_path": "/data/atas_geradas/ata_20250206_123456.zip",
  "output_filename": "ata_20250206_123456.zip",
  "message": "Ata gerada com sucesso",
  "files_generated": [
    "ata.docx",
    "ata.pdf",
    "ata.html"
  ],
  "size_bytes": 245000
}
```

### Resposta de Erro (500)
```json
{
  "success": false,
  "error": "Modelo não encontrado: Template Invalido.xlsm",
  "detail": "Modelos disponíveis: ['Template Bernadina.xlsm']"
}
```

---

## 💻 Exemplos de Uso

### 1️⃣ Via Swagger UI

1. Abra http://localhost:8001/docs
2. Encontre endpoint `/api/gerador-atas/gerar`
3. Clique em "Try it out"
4. Preencha formulário JSON
5. Execute e baixe resultado

### 2️⃣ Via cURL

```bash
curl -X POST http://localhost:8001/api/gerador-atas/gerar \
  -H "Content-Type: application/json" \
  -d '{
    "modelo": "Template Bernadina.xlsm",
    "data_reuniao": "2025-02-06",
    "hora_inicio": "14:30",
    "hora_fim": "16:00",
    "local": "Sala de Conferências",
    "responsavel": "João Silva",
    "departamento": "Administração",
    "titulo": "Reunião de Planejamento",
    "presentes": ["João", "Maria"],
    "ausentes": [],
    "assuntos": [
      {
        "numero": 1,
        "titulo": "Orçamento",
        "discussao": "Discussão dos valores"
      }
    ],
    "decisoes": ["Aprovado"],
    "proxima_reuniao": "2025-03-06"
  }' \
  -v
```

### 3️⃣ Via Python Requests

```python
import requests
import json

url = "http://localhost:8001/api/gerador-atas/gerar"

payload = {
    "modelo": "Template Bernadina.xlsm",
    "data_reuniao": "2025-02-06",
    "hora_inicio": "14:30",
    "hora_fim": "16:00",
    "local": "Sala de Conferências",
    "responsavel": "João Silva",
    "departamento": "Administração",
    "titulo": "Reunião de Planejamento",
    "presentes": ["João Silva", "Maria Santos"],
    "ausentes": [],
    "assuntos": [
        {
            "numero": 1,
            "titulo": "Revisão de Orçamento",
            "discussao": "Discussão de valores"
        }
    ],
    "decisoes": ["Orçamento aprovado"],
    "proxima_reuniao": "2025-03-06"
}

response = requests.post(url, json=payload)
result = response.json()

if result.get('success'):
    print(f"✅ Ata gerada: {result['output_path']}")
    # Baixar arquivo
    import urllib.request
    urllib.request.urlretrieve(
        f"http://localhost:3000/download/{result['output_path']}",
        "ata.zip"
    )
else:
    print(f"❌ Erro: {result.get('error')}")
```

### 4️⃣ Via Frontend

1. Clique em **"Gerador de Atas"** no menu
2. Selecione modelo (dropdown)
3. Preencha formulário:
   - Data da reunião
   - Horário
   - Participantes
   - Assuntos (adicionar conforme necessário)
   - Decisões
4. Clique em **"Gerar Ata"**
5. Monitore progresso (Socket.io)
6. Baixe arquivo `.zip`

---

## ⚙️ Modelos Disponíveis

Os modelos ficam em `data/atas_modelos/`:

```
▓ data/atas_modelos/
  ├── Template Bernadina.xlsm
  └── CHAVES PARA MODELOS.txt  ← Guia de customização
```

### Como Customizar Modelo

Edite `data/atas_modelos/CHAVES PARA MODELOS.txt` para adicionar seus campos personalizados.

Exemplo:
```
Campo: {{responsavel}}
Campo: {{departamento}}
Campo: {{assinatura}}
```

---

## 🔍 Validações

A API valida:

- ✅ Modelo existe na pasta
- ✅ Data em formato válido (YYYY-MM-DD)
- ✅ Presentes é lista não-vazia
- ✅ Assuntos e decisões formatadas corretamente

---

## ⚠️ Limitações e Notas

| Aspecto | Detalhe |
|---------|---------|
| Tamanho máximo ZIP | 50 MB |
| Tempo médio | 2-5 segundos |
| Modelos suportados | XLSM, DOCX |
| Saída | ZIP contendo DOCX, PDF, HTML |
| Assinatura | Sem assinatura digital (apenas data/hora) |
| Idioma | Português (BR) |

---

## 🔐 Segurança

- ✅ Validação de todos os inputs
- ✅ Sanitização de caminho de arquivo
- ✅ Limite de tamanho de output
- ✅ Limpeza de arquivos temporários
- ✅ Logging de operações

---

## 🐛 Troubleshooting

### "Modelo não encontrado"

```bash
# Verificar modelos disponíveis
ls -la data/atas_modelos/

# Adicionar modelo:
# Copie arquivo para data/atas_modelos/
cp seu_modelo.xlsm data/atas_modelos/
```

### "Erro ao gerar DOCX"

**Causa:** Modelo corrompido  
**Solução:** Abra modelo no Word, salve novamente como XLSM

### "PDF com formatação estranha"

**Causa:** Modelo não suporta certos estilos  
**Solução:** Ajuste modelo ou use outro template

---

## 📚 Arquivos Relacionados

- **Frontend:** `public/gerador-atas.html`
- **JS:** `public/js/gerador-atas.js`
- **Core:** `api/gerador_atas_core.py`
- **Modelos:** `data/atas_modelos/`
- **Saída:** `data/atas_geradas/`

---

## 🔄 Fluxo de Processamento

```
1. Usuário submete formulário
   ↓
2. Frontend valida dados
   ↓
3. POST para /api/gerador-atas/gerar
   ↓
4. API valida modelo existe
   ↓
5. Core Python carrega modelo XLSM
   ↓
6. Substitui placeholders {{campo}}
   ↓
7. Gera DOCX com dados
   ↓
8. Converte DOCX → PDF
   ↓
9. Cria versão HTML
   ↓
10. Compacta em ZIP
   ↓
11. Retorna path e metadados
   ↓
12. Frontend permite download
```

---

## 📊 Exemplo Completo de Uso

**Cenário:** Gerar ata de reunião de planejamento

```python
# request.py
import requests

# Dados da reunião
ata_data = {
    "modelo": "Template Bernadina.xlsm",
    "data_reuniao": "2025-02-06",
    "hora_inicio": "14:00",
    "hora_fim": "16:30",
    "local": "Sala Executive",
    "responsavel": "Diretor Geral",
    "departamento": "Diretoria",
    "titulo": "Planejamento Anual 2025",
    "presentes": [
        "Diretor Geral",
        "Gerente Financeiro",
        "Gerente RH",
        "Gerente Operacional"
    ],
    "ausentes": ["Consultor Externo"],
    "assuntos": [
        {
            "numero": 1,
            "titulo": "Revisão de Metas 2024",
            "discussao": "Análise dos resultados alcançados e não alcançados. Desempenho acima do esperado em 3 das 5 áreas estratégicas."
        },
        {
            "numero": 2,
            "titulo": "Orçamento 2025",
            "discussao": "Apresentação de proposta orçamentária com aumento de 15% para tecnologia e 10% para inovação."
        },
        {
            "numero": 3,
            "titulo": "Estrutura Organizacional",
            "discussao": "Proposta de novas posições e realocações. Aprovação para contratação de 5 novos profissionais."
        },
        {
            "numero": 4,
            "titulo": "Iniciativas Estratégicas",
            "discussao": "Lançamento de 3 novos produtos e expansão para 2 novos mercados."
        }
    ],
    "decisoes": [
        "Aprovar orçamento 2025 com ajustes aqui solicitados",
        "Autorizar contratação de 5 novos profissionais",
        "Criar comitê de inovação mensal",
        "Iniciar projetos de transformação digital"
    ],
    "proxima_reuniao": "2025-03-06"
}

# Fazer requisição
response = requests.post(
    "http://localhost:8001/api/gerador-atas/gerar",
    json=ata_data
)

# Processar resposta
if response.status_code == 200:
    result = response.json()
    if result.get('success'):
        print(f"✅ Ata gerada com sucesso!")
        print(f"📁 Local: {result['output_path']}")
        print(f"📦 Tamanho: {result['size_bytes']} bytes")
        print(f"📄 Arquivos: {', '.join(result['files_generated'])}")
    else:
        print(f"❌ Erro: {result.get('error')}")
else:
    print(f"❌ Erro HTTP: {response.status_code}")
    print(response.text)
```

---

**Última atualização:** Fevereiro 2026
