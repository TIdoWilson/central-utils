# Importador de Recebimentos MADRE SCP

> **Tipo:** API / Job  
> **Status:** Ativa  
> **Owner:** Squad Financeiro  
> **Local no repo:** `/api/importador_recebimentos_madre_scp_core.py`  
> **Ambientes:** prod (requer credenciais MADRE)  

## Objetivo

Integração automatizada com sistema MADRE SCP para importar dados de recebimentos, parsear PDFs, validar e persistir em BD PostgreSQL. Reduz entrada manual, garante precisão. Beneficia: controladoria, auditoria, integrações.

## Quando usar

- Importação diária de recebimentos MADRE
- Reconciliação de contas a receber
- Auditoria de recebimentos
- Quando sistema MADRE precisa convergir com central-utils

## Como acessar

- **API:** `POST http://localhost:8001/api/importador-recebimentos-madre-scp/processar`
- **Core:** `api/importador_recebimentos_madre_scp_core.py`

## Fluxo principal

1. **Autenticação MADRE:** Usa credenciais de env var
2. **Extração PDF:** Faz download de PDF da MADRE API
3. **Parsing de dados:** Regex extrair datas, valores, contas
4. **Validação:** Verifica valores, datas, contas válidas
5. **Limpeza:** Remove duplicatas, trata valores BR
6. **Persistência:** Insere em tabela `recebimentos_madre` PostgreSQL
7. **Resultado:** Relatório de importação + contagem

## Entradas e saídas

### Entrada
```json
{
  "data_inicio": "2025-02-01",
  "data_fim": "2025-02-28",
  "empresa": "EMPRESA_A",
  "tipo_filtro": "recebimentos"
}
```

### Saída
```json
{
  "success": true,
  "registros_importados": 250,
  "registros_duplicados": 5,
  "registros_erro": 2,
  "valor_total_importado": 125000.50,
  "timestamp": "2025-02-06T12:00:00Z"
}
```

## Dependências

- **Libs:** pdfplumber>=0.8.0, pandas>=1.3.0, psycopg2>=2.9.0
- **Serviços:** MADRE API (SCP), PostgreSQL BD
- **Env vars:** MADRE_API_URL, MADRE_API_KEY, MADRE_USER, MADRE_PASS

## Permissões e segurança

- **RBAC:** controller, auditor (total)
- **LGPD:** Dados financeiros (sensível) - criptografar, manter 7 anos
- **Auditoria:** `/var/log/central-utils/madre_importer.log` + trigger BD

## Configurações

- **Env vars:** MADRE_API_URL, MADRE_API_KEY, MADRE_USER, MADRE_PASS, MADRE_TIMEOUT (default: 30s)
- **Flags:** VALIDAR_VALORES (default: true), IMPORTAR_DUPLICATAS (default: false)

## Observabilidade

- **Logs:** `/var/log/central-utils/madre_importer.log`
- **Métricas:** madre_importacoes_total, _registros_importados_total, _tempo_segundos
- **Tracing:** request_id + transação BD

## Runbook

```bash
curl -X POST http://localhost:8001/api/importador-recebimentos-madre-scp/processar \
  -H "Content-Type: application/json" \
  -d '{
    "data_inicio": "2025-02-01",
    "data_fim": "2025-02-28",
    "empresa": "EMPRESA_A"
  }'
```

## Troubleshooting

| Sintoma | Causa | Solução |
|--------|-------|--------|
| "Autenticação MADRE falhou" | Credenciais inválidas/expiradas | Verificar env vars, renovar token |
| "BD integridade violada" | Duplicata ou FK inválida | Checar se registro já existe, validar empresa |
| "PDF parsing falhou" | Formato MADRE mudou | Atualizar regex patterns em código |

## Referências

- [api/importador_recebimentos_madre_scp_core.py](../../api/importador_recebimentos_madre_scp_core.py)
- MADRE API Docs: [interno]

---

**Atualização:** Fevereiro 2026 | **Squad:** Financeiro | **Crítico:** Prod only
