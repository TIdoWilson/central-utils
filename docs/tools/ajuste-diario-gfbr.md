# Ajuste Diário GFBR

- **Slug:** `ajuste-diario-gfbr`
- **Página:** `/ajuste-diario-gfbr`
- **Permissão:** `tool:ajuste-diario-gfbr` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/ajuste-diario-gfbr`
- **Runbook:** [runbook ajuste-diario-gfbr](../runbooks/runbook-ajuste-diario-gfbr.md)

## Documentação Consolidada

> **Tipo:** API / Processamento contábil  
> **Status:** Ativa  
> **Owner:** Squad Controladoria  
> **Local no repo:** `/api/ajuste_diario_gfbr_core.py`  
> **Ambientes:** prod  

## Objetivo

Gera automaticamente ajustes contábeis diários no padrão GFBR (plano de contas), com validação debit=credit, mapeamento de contas contábeis, detecção de grupos. Coordena com: auditoria, BI, ERPs.

## Quando usar

- Ajustes contábeis fim de dia
- Reconhecimento de receita/competência
- Correção de lançamentos
- Reconciliação com ERP

## Como acessar

- **API:** `POST http://localhost:8001/api/ajuste-diario-gfbr/gerar`
- **Core:** `api/ajuste_diario_gfbr_core.py`

## Fluxo principal

1. **Leitura Excel:** Carrega planilha com regras de ajuste
2. **Parsing de grupos:** Identifica blocos de ajustes (início=texto, fim=vazio)
3. **Validação GFBR:** Verifica plano de contas, mapeamento de centros
4. **Balanço:** Garante débito = crédito por grupo
5. **Geração:** Cria linhas contábeis estruturadas
6. **Output:** Arquivo TXT formato GFBR ou JSON
7. **Auditoria:** Registra histório + hash

## Entradas e saídas

### Entrada
```json
{
  "arquivo_excel": "ajustes_fevereiro.xlsx",
  "data_ajuste": "2025-02-28",
  "empresa": "CPNJ_00123456",
  "validar_completo": true
}
```

### Saída
```json
{
  "success": true,
  "ajustes_gerados": 45,
  "valor_total_debitos": 250000.00,
  "valor_total_creditos": 250000.00,
  "arquivo_saida": "AJUSTES_20250228_GFBR.txt",
  "hash_validacao": "abc123def456"
}
```

## Dependências

- **Libs:** openpyxl>=3.6.0, pandas>=1.3.0, hashlib (built-in)
- **Serviços:** Plano GFBR, BD PostgreSQL (auditoria)
- **Dados:** Mapeamento contas X centros em BD

## Permissões e segurança

- **RBAC:** controller, auditor, contador
- **LGPD:** Dados contábeis (confidencial) - criptografar, retenção conforme Lei
- **Auditoria:** Todos lançamentos + hash imutável

## Configurações

- **Env vars:** GFBR_PLANO_CONTAS_PATH, GFBR_VALIDAR_SALDO (default: true)
- **Flags:** MODO_DRY_RUN (default: false), PERMITIR_AJUSTES_NEGATIVOS (default: false)
- **Constants:** ABA_ESTORNOS="Estornos", ABA_AJUSTES="Ajustes", MAX_DEBITO=9999999.99

## Observabilidade

- **Logs:** `/var/log/central-utils/ajuste_gfbr.log`
- **Métricas:** gfbr_ajustes_total, _erros_validacao, _tempo_segundos
- **Audit log:** Tabela `auditoria_gfbr` (usuário, timestamp, hash, valores)

## Runbook

```bash
curl -X POST http://localhost:8001/api/ajuste-diario-gfbr/gerar \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo_excel": "ajustes_fevereiro.xlsx",
    "data_ajuste": "2025-02-28",
    "empresa": "00123456",
    "validar_completo": true
  }'
```

## Troubleshooting

| Sintoma | Causa | Solução |
|--------|-------|--------|
| "Débito ≠ Crédito no grupo" | Lançamento desbalanceado | Revisar linhas, adicionar contrapartida |
| "Conta inválida GFBR" | Código fora do plano de contas | Usar código de mapear, consultar cardápio |
| "Grupo não detectado" | Formatação Excel inconsistente | Seguir padrão: linha 1=título, últimaColuna=valor, próx=vazio |

## Referências

- [api/ajuste_diario_gfbr_core.py](../../api/ajuste_diario_gfbr_core.py)
- Plano GFBR: [Manual Interno]
- RFC de auditoria: [RFCs/auditoria-contabil.md]

---

**Atualização:** Fevereiro 2026 | **Squad:** Controladoria | **Crítico:** SIM
