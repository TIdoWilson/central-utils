# 05 - Separador CSV - Baixa Automática

## 🎯 Objetivo

Processar planilhas de baixa automática (cheques, transferências) e organizar por lote/empresa.

---

## 📥 Entrada
- CSV com dados de cheques/pagamentos
- Delimitador: vírgula, ponto-vírgula ou outro

---

## 📤 Saída
- CSV separado por lote
- Relatório de consolidação

---

## 🌐 Endpoint

```
POST /api/separador-csv-baixa-automatica/processar
```

### Body
```json
{
  "input_csv_path": "/data/uploads/baixa.csv",
  "delimiter": ",",
  "group_by": "empresa"
}
```

---

**Arquivo Core:** `api/separador_csv_baixa_automatica_core.py`

**Última atualização:** Fevereiro 2026
