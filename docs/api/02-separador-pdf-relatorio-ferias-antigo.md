# 02 - Separador PDF - Relatório de Férias

## 🎯 Objetivo

Dividir um PDF contendo múltiplos relatórios de férias (consolidado) em PDFs individuais, um para cada página ou grupo de páginas representando um funcionário.

---

## 📥 Entrada (Input)

### Arquivo:
- **Tipo:** `.pdf` (relatório consolidado)
- **Formato:** PDF com múltiplas páginas/funcionários
- **Tamanho máximo:** 100 MB

### Parâmetros:

```json
{
  "input_pdf_path": "/data/uploads/relatorio_ferias_fevereiro.pdf",
  "competencia": "2025-02",
  "output_dir": "/data/outputs/relatorio-ferias"
}
```

**Campos:**
- `input_pdf_path`: Caminho do PDF consolidado
- `competencia`: Mês/ano no formato YYYY-MM
- `output_dir`: Diretório onde salvar PDFs individuais (opcional)

---

## 📤 Saída (Output)

### Estrutura:

```
resultado_[timestamp].zip
├── funcionario_001_João Silva.pdf
├── funcionario_002_Maria Santos.pdf
├── funcionario_003_Carlos Costa.pdf
├── INDEX.txt           ← Mapa de funcionários
└── relatorio_resumo.json
```

---

## 🔧 Arquivo Core

**Caminho:** `api/relatorio_ferias_core.py`

**Função principal:**
```python
def split_pdf_relatorio_ferias(
    input_pdf: Path,
    output_dir: Path,
    competencia: str
) -> Path:
    """Divide PDF de férias por funcionário"""
```

---

## 🌐 Endpoint REST

```
POST /api/separador-pdf-relatorio-de-ferias/processar
```

### Body
```json
{
  "input_pdf_path": "/path/to/relatorio.pdf",
  "competencia": "2025-02",
  "output_dir": "/data/outputs"
}
```

### Resposta
```json
{
  "success": true,
  "output_path": "/data/outputs/resultado_20250206_123456.zip",
  "output_filename": "resultado_20250206_123456.zip",
  "pages_processed": 45,
  "funcionarios_separados": 15,
  "message": "PDF separado com sucesso"
}
```

---

## 💻 Exemplos de Uso

### Via cURL
```bash
curl -X POST http://localhost:8001/api/separador-pdf-relatorio-de-ferias/processar \
  -H "Content-Type: application/json" \
  -d '{
    "input_pdf_path": "/data/uploads/relatorio_ferias.pdf",
    "competencia": "2025-02",
    "output_dir": "/data/outputs"
  }'
```

### Via Python
```python
import requests

response = requests.post(
    "http://localhost:8001/api/separador-pdf-relatorio-de-ferias/processar",
    json={
        "input_pdf_path": "/data/uploads/relatorio_ferias.pdf",
        "competencia": "2025-02"
    }
)

result = response.json()
if result.get('success'):
    print(f"✅ {result['funcionarios_separados']} funcionários separados")
```

### Via Frontend
1. Clique em **"Separador - Relatório de Férias"**
2. Faça upload do PDF consolidado
3. Digite a competência (ex: 2025-02)
4. Clique em **"Processar"**
5. Baixe ZIP com PDFs individuais

---

## ⚠️ Limitações

| Aspecto | Valor |
|---------|-------|
| Tamanho máximo PDF | 100 MB |
| Máximo de páginas | 5000 |
| Tempo médio | 10-30 segundos |
| Formato saída | ZIP com PDFs |

---

## 🔍 Validações

- ✅ Arquivo PDF valido
- ✅ Competência em formato YYYY-MM
- ✅ Caminho de saída acessível

---

**Última atualização:** Fevereiro 2026
