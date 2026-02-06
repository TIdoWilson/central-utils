# 07 - Compressor de PDF

## 🎯 Objetivo

Reduzir tamanho de arquivo PDF mantendo qualidade aceitável.

---

## 📥 Entrada
- PDF (.pdf)
- Nível de compressão: baixa, media, alta

---

## 📤 Saída
- PDF comprimido (3-10% do tamanho original)

---

## 🌐 Endpoint

```
POST /api/compressor-pdf/processar
```

### Body
```json
{
  "input_pdf_path": "/data/uploads/grande.pdf",
  "compression_level": "media"
}
```

**Níveis:**
- `low` - Melhor qualidade, menos compressão
- `medium` - Balanço (padrão)
- `high` - Menor arquivo, qualidade reduzida

---

**Arquivo Core:** `api/comprimir_pdf_core.py`

**Última atualização:** Fevereiro 2026
