# 03 - Separador PDF - Holerites por Empresa

## 🎯 Objetivo

Dividir PDF consolidado de holerites em arquivos individuais, organizados por empresa.

---

## 📥 Entrada

- **Arquivo:** `.pdf` (holerites consolidados)
- **Parâmetro:** `competencia` (YYYY-MM)

---

## 📤 Saída

```
resultado.zip
├── EMPRESA_A/
│   ├── holerite_001.pdf
│   └── holerite_002.pdf
└── EMPRESA_B/
    └── holerite_003.pdf
```

---

## 🌐 Endpoint

```
POST /api/separador-holerites/processar
```

---

## 💻 Exemplo

```bash
curl -X POST http://localhost:8001/api/separador-holerites/processar \
  -H "Content-Type: application/json" \
  -d '{
    "input_pdf_path": "/data/uploads/holerites.pdf",
    "competencia": "2025-02"
  }'
```

---

**Arquivo Core:** `api/holerites_core.py`

**Última atualização:** Fevereiro 2026
