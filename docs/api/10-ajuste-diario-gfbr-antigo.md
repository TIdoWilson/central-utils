# 10 - Ajuste Diário GFBR

## 🎯 Objetivo

Gerar automaticamente lançamentos de ajuste contábil diário (GFBR) conforme normas de Geração de Fluxos de Pessoal.

---

## 📥 Entrada
- Data de ajuste (YYYY-MM-DD)
- Empresa/CNPJ
- Contas (opcional - se não especificado, processa todas)

---

## 📤 Saída
- Arquivo de lançamentos contábeis (TXT, JSON ou XML)
- Relatório de validação
- Arquivo para importação em sistema contábil

---

## 🌐 Endpoint

```
POST /api/ajuste-diario-gfbr/processar
```

### Body
```json
{
  "data_ajuste": "2025-02-06",
  "empresa_cnpj": "12.345.678/0001-90",
  "contas_filtro": ["1110", "1120"],
  "tipo_ajuste": "provisoes"
}
```

**Tipos de ajuste:**
- `provisoes` - Provisão de férias, 13º, etc
- `encargos` - Encargos sociais
- `todos` - Todos os ajustes

---

## 💻 Exemplo

```bash
curl -X POST http://localhost:8001/api/ajuste-diario-gfbr/processar \
  -H "Content-Type: application/json" \
  -d '{
    "data_ajuste": "2025-02-06",
    "empresa_cnpj": "12.345.678/0001-90",
    "tipo_ajuste": "provisoes"
  }'
```

---

## 📊 Estrutura de Saída

```json
{
  "success": true,
  "output_path": "/data/outputs/ajuste_20250206_123456.txt",
  "lancamentos_gerados": 15,
  "valor_total_debito": 15000.00,
  "valor_total_credito": 15000.00,
  "validacao": {
    "saldo_contabil": true,
    "contas_validas": true,
    "datas_validas": true
  }
}
```

---

## ⚠️ Considerações

- ✅ Segue normas GFBR atualizadas
- ✅ Valida débito = crédito
- ✅ Verifica contas existentes
- ⚠️ Requer configuração de mapeamento de contas

---

**Arquivo Core:** `api/ajuste_diario_gfbr_core.py`

**Última atualização:** Fevereiro 2026
