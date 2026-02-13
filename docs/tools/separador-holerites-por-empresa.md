# Separador PDF - Holerites por Empresa

- **Slug:** `separador-holerites-por-empresa`
- **Página:** `/separador-holerites-por-empresa`
- **Permissão:** `tool:separador-holerites-por-empresa` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/separador-holerites-por-empresa`
- **Runbook:** [runbook holerites](../runbooks/runbook-holerites.md)

## Documentação Consolidada

> **Tipo:** API / Job  
> **Status:** Ativa  
> **Owner:** Squad RH  
> **Local no repo:** `/api/holerites_core.py`  
> **Ambientes:** dev/stg/prod  

## Objetivo

Processa **PDFs consolidados de holerites** (múltiplas empresas em um arquivo) e separa por empresa, gerando um PDF para cada. Reduz retrabalho manual, facilita distribuição. Beneficia: RH, controladoria, gestores, auditores.

## Quando usar

- Distribuição mensal de holerites organizados por empresa
- Preparação para digitalização/arquivamento
- Auditoria externa
- Integração com sistemas de RH

## Como acessar

- **API:** `POST http://localhost:8001/api/separador-holerites/processar`
- **Swagger:** http://localhost:8001/docs
- **Core:** `api/holerites_core.py`

## Fluxo principal

1. **Upload PDF consolidado:** Máx 100 MB, PDF padrão
2. **Extração de empresa:** Usa pdfplumber para primeira linha de cada página
3. **Normalização:** Remove acentos, caracteres especiais, maiúsculas
4. **Separação por empresa:** Agrupa páginas de mesma empresa
5. **Criação de PDFs:** 1 PDF por empresa
6. **Compressão em ZIP:** DEFLATE compression
7. **Resultado:** ZIP organizando por empresa

## Entradas e saídas

### Entrada
```json
{
  "input_pdf_path": "/data/uploads/holerites_fevereiro.pdf",
  "competencia": "2025-02",
  "output_dir": "/data/outputs/holerites"
}
```

### Saída
```json
{
  "success": true,
  "output_path": "/data/outputs/holerites_2025-02.zip",
  "empresas": 12,
  "paginas": 150,
  "timestamp": "2025-02-06T11:45:00Z"
}
```

## Dependências

- **Libs:** PyPDF2>=3.0.0, pdfplumber>=0.8.0
- **Serviços:** Nenhum

## Permissões e segurança

- **RBAC:** gestor_rh, analista_rh (total)
- **LGPD:** Holerites (sensível) - criptografar, manter 2 anos
- **Auditoria:** `/var/log/central-utils/holerites.log`

## Configurações

- **Env vars:** HOLERITES_MAX_MB (default: 100)
- **Flags:** NORMALIZAR_NOME_EMPRESA (default: true)

## Observabilidade

- **Logs:** `/var/log/central-utils/holerites.log`
- **Métricas:** holerites_processamentos_total, _empresas_total, _tempo_segundos

## Runbook

```bash
curl -X POST http://localhost:8001/api/separador-holerites/processar \
  -H "Content-Type: application/json" \
  -d '{
    "input_pdf_path": "/data/uploads/holerites.pdf",
    "competencia": "2025-02"
  }'
```

## Troubleshooting

| Sintoma | Causa | Solução |
|--------|-------|--------|
| "Empresa não detectada" | Padrão não encontrado na primeira linha | Verificar formato do PDF |
| "PDF corrompido" | Arquivo danificado | Regenerar do sistema |
| "Timeout" | Arquivo muito grande | Dividir PDF |

## Referências

- [api/holerites_core.py](../../api/holerites_core.py)
- Relacionado: [02-separador-pdf-relatorio-ferias.md](02-separador-pdf-relatorio-ferias.md)

---

**Atualização:** Fevereiro 2026 | **Squad:** RH
