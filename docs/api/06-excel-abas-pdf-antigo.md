# 06 - Excel para PDF em Abas

## 🎯 Objetivo

Converter arquivo Excel (.xlsx) em PDF estruturado com abas/bookmarks para cada folha.

---

## 📥 Entrada
- Excel (.xlsx ou .xls)
- Múltiplas abas/sheets

---

## 📤 Saída
- PDF com bookmarks
- Índice navegável em abas

---

## 🌐 Endpoint

```
POST /api/excel-abas-pdf/processar
```

### Body
```json
{
  "input_excel_path": "/data/uploads/relatorio.xlsx",
  "include_toc": true
}
```

---

**Arquivo Core:** `api/excel_abas_pdf_core.py`

**Última atualização:** Fevereiro 2026
