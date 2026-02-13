# Separador PDF - Relatório de Férias

- **Slug:** `separador-pdf-relatorio-de-ferias`
- **Página:** `/separador-pdf-relatorio-de-ferias`
- **Permissão:** `tool:separador-pdf-relatorio-de-ferias` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/separador-pdf-relatorio-de-ferias`
- **Runbook:** [runbook relatorio-ferias](../runbooks/runbook-relatorio-ferias.md)

## Documentação Consolidada

> **Tipo:** API / Job  
> **Status:** Ativa  
> **Owner:** Squad RH  
> **Local no repo:** `/api/relatorio_ferias_core.py`  
> **Ambientes:** dev/stg/prod  

## Objetivo

Processa **PDFs consolidados de relatório de férias** (múltiplas empresas/páginas em um único arquivo) e **separa por empresa**, gerando um PDF para cada uma. Automatiza distribuição de relatórios, reduz retrabalho manual de ~20 minutos para ~3 segundos. Beneficia: RH, controladoria, gestores de departamento, auditores.

## Quando usar

- Processamento mensal de relatórios consolidados de férias
- Distribuição de relatórios por empresa para análise
- Preparação de documentos para auditoria externa
- Integração com workflow de gestão de PDFs

## Como acessar

- **API REST:** `POST http://localhost:8001/api/separador-pdf-relatorio-de-ferias/processar`
- **Swagger:** http://localhost:8001/docs
- **Arquivo Core:** `api/relatorio_ferias_core.py`

## Fluxo principal

1. **Upload do PDF consolidado:** Múltiplas páginas/empresas com limite 100 MB
2. **Extração de texto:** Percorre cada página para identificar empresa
3. **Detecção de empresa:** Padrão "EMPRESA Página: N", fallback para "Folha de Pagamento", primeira linha não-vazia
4. **Agrupamento de páginas:** Agrupa todas as de mesma empresa mantendo ordem
5. **Criação de PDFs:** 1 PDF por empresa com normalização: `[EMPRESA_NORMALIZADA] [COMPETENCIA].pdf`
6. **Agregação em ZIP:** Compacta com DEFLATE (~30-40% redução)
7. **Resultado:** ZIP com PDFs organizados + metadados + logs

## Entradas e saídas

### Entradas

- **Arquivo:** PDF consolidado de férias (máx. 100 MB, PDF padrão)
- **Payload:**
```json
{
  "input_pdf_path": "/data/uploads/relatorio_ferias_fevereiro.pdf",
  "competencia": "2025-02",
  "output_dir": "/data/outputs/relatorio-ferias"
}
```
- **Parâmetros:** input_pdf_path (obrigatório), competencia YYYY-MM (obrigatório), output_dir (opcional)

### Saídas

- **Estrutura:**
```
/data/outputs/relatorio-ferias/
├── EMPRESA_A_2025-02.pdf
├── EMPRESA_B_2025-02.pdf
└── relatorio_ferias_fevereiro_empresas_2025-02.zip
```

- **Resposta (200):**
```json
{
  "success": true,
  "output_path": "/data/outputs/relatorio-ferias/relatorio_ferias_fevereiro_empresas_2025-02.zip",
  "total_pages": 45,
  "total_empresas": 15,
  "empresas": ["EMPRESA_A", "EMPRESA_B"],
  "timestamp": "2025-02-06T11:30:00Z"
}
```

## Dependências e conexões

- **Bibliotecas:** PyPDF2>=3.0.0, pathlib, zipfile
- **Serviços:** Nenhum (standalone)

## Permissões e segurança

- **RBAC:** gestor_rh, analista_rh (total); gestor_empresa (própria apenas); auditor (leitura)  
- **LGPD:** Dados de férias, nomes empresas - criptografar em repouso, manter 3 anos
- **Auditoria:** `/var/log/central-utils/relatorio_ferias.log`

## Configurações

- **Env vars:** `RELATORIO_FERIAS_MAX_MB` (default: 100), `RELATORIO_FERIAS_OUTPUT_DIR`
- **Flags:** NORMALIZAR_NOMES_EMPRESA (default: true), COMPACTAR_ZIP (default: true)

## Observabilidade

- **Logs:** `/var/log/central-utils/relatorio_ferias.log` | Filtrar: `grep "relatorio_ferias"`
- **Métricas:** relatorio_ferias_processamentos_total, _empresas_total, _paginas_total, _tempo_segundos
- **Tracing:** request_id em logs

## Runbook

### Reprocessar
```bash
rm -f data/outputs/relatorio-ferias/*_empresas_*.zip
curl -X POST http://localhost:8001/api/separador-pdf-relatorio-de-ferias/processar \
  -H "Content-Type: application/json" \
  -d '{
    "input_pdf_path": "/data/uploads/relatorio_ferias_fevereiro.pdf",
    "competencia": "2025-02"
  }'
```

### Limites Conhecidos

| Limite | Valor | Impacto |
|--------|-------|--------|
| Tamanho |  100 MB | Falha |
| Empresas | 100 | ZIP grande |
| Timeout | 60s | Erro |

## Troubleshooting

| Sintoma | Causa | Solução |
|--------|-------|--------|
| "PDF corrompido" | Arquivo danificado | Regenerar do sistema de origem |
| "Empresa não detectada" | Padrão não encontrado | Adicionar "EMPRESA:" no PDF |
| "Timeout" | Arquivo muito grande | Dividir em múltiplos PDFs |

## Referências

- **Código:** [api/relatorio_ferias_core.py](../../api/relatorio_ferias_core.py)
- **Relacionado:** [03-separador-holerites.md](03-separador-holerites.md)

---

**Última atualização:** Fevereiro 2026 | **Mantido por:** Squad RH
