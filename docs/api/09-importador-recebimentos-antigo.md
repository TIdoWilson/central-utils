# 09 - Importador de Recebimentos MADRE SCP

## 🎯 Objetivo

Integração com sistema MADRE SCP para importar dados de recebimentos.

---

## 📥 Entrada
- Período: data início/fim
- Filtros: empresa, tipo, status

---

## 📤 Saída
- Dados importados no banco PostgreSQL
- Relatório de importação (JSON)

---

## 🌐 Endpoint

```
POST /api/importador-recebimentos-madre-scp/processar
```

### Body
```json
{
  "data_inicio": "2025-02-01",
  "data_fim": "2025-02-28",
  "empresa": "EMPRESA_A",
  "tipo_filtro": "recebimentos"
}
```

---

## ⚙️ Pré-requisitos

**Variáveis de Ambiente (.env):**
```
MADRE_API_URL=https://api.madre.local
MADRE_API_KEY=sua_chave_secreta
MADRE_USER=seu_usuario
MADRE_PASS=sua_senha
```

---

**Arquivo Core:** `api/importador_recebimentos_madre_scp_core.py`

**Última atualização:** Fevereiro 2026
