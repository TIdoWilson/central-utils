# Separador CSV - Baixa Automática

- **Slug:** `separador-csv-baixa-automatica`
- **Página:** `/separador-csv-baixa-automatica`
- **Permissão:** `tool:separador-csv-baixa-automatica` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/separador-csv-baixa-automatica`
- **Runbook:** [runbook separador-csv-baixa](../runbooks/runbook-separador-csv-baixa.md)

## Documentação Consolidada

> **Tipo:** API / Job  
> **Status:** Ativa  
> **Owner:** Squad Financeiro  
> **Local no repo:** `/api/separador_csv_baixa_automatica_core.py`  
> **Ambientes:** dev/stg/prod  

## Objetivo

Processa planilhas de **baixa automática** (cheques, transferências, compensações) e organiza os dados em múltiplos CSVs separados por **ano/período**, aplicando formatações contábeis padronizadas. Facilita reconciliação bancária, auditoria e integração com sistemas contábeis.

Principais beneficiários: controladoria, contabilidade, tesouraria, gestores financeiros.

## Quando usar

- Importação diária de arquivos de movimento bancário
- Reconciliação mensal de cheques e transferências
- Preparação de dados para auditoria externa
- Alimentação de sistema de contabilidade (ERP)
- Processamento em lote de múltiplos períodos
- Quando dados precisam estar formatados segundo padrões contábeis (dd/mm/aaaa, vírgula como decimal)

## Como acessar

- **API REST:** `POST http://localhost:8001/api/separador-csv-baixa-automatica/processar`
- **Swagger:** http://localhost:8001/docs (endpoint `separador-csv-baixa-automatica`)
- **Arquivo Python Core:** `api/separador_csv_baixa_automatica_core.py`
- **Frontend:** Menu → "Separador CSV - Baixa Automática"

## Fluxo principal

1. **Upload do arquivo:**
   - Aceita: Excel (.xlsx, .xlsm) ou CSV
   - Aba padrão procurada: "BAIXAS" (configurável)
   - Tamanho máximo: 25 MB

2. **Detecção de ano (data de emissão):**
   - Busca coluna "DATA EMISSÃO" (ou configurada)
   - Extrai ano (AAAA) a partir de datas em formato dd/mm/aaaa ou aaaa-mm-dd
   - Fallback: tenta coluna numérica com valor entre 1900-2100

3. **Agrupamento por ano:**
   - Organiza linhas por ano extraído
   - Remove linhas sem ano válido
   - Agrupa e compacta dados

4. **Formatação contábil:**
   - Coluna C (3ª): converte para dd/mm/yyyy
   - Coluna G (7ª): converte para dd/mm/yyyy
   - Colunas F, H, I, J, K, L, M, N: formata como decimal com vírgula (1.234,56)
   - Limpa valores nulos e vazios

5. **Divisão em arquivos:**
   - Se arquivo > `max_linhas_por_arquivo` (default: 50), cria partes
   - Nomeação: `arquivo__AAAA__parte-01.csv`
   - Formato CSV UTF-8 com separador configurável (;)

6. **Resultado:**
   - Lista de CSVs organizados por ano e página
   - Resumo consolidado por ano
   - Logs detalhados de processamento

## Entradas e saídas

### Entradas

- **Arquivos:**
  - Excel XLSX/XLSM com aba "BAIXAS" (ou outra especificada)
  - CSV delimitado (vírgula ou ponto-vírgula)
  - Tamanho máximo: 25 MB

- **Payload (JSON):**
```json
{
  "input_csv_path": "/data/uploads/baixa_fevereiro.xlsx",
  "output_dir": "/data/outputs/separados",
  "sheet_name": "BAIXAS",
  "year_source_column": "DATA EMISSÃO",
  "max_linhas_por_arquivo": 50,
  "csv_sep": ";",
  "delimiter": ";"
}
```

- **Parâmetros:**
  - `input_csv_path` (obrigatório): caminho do arquivo Excel/CSV
  - `output_dir` (obrigatório): pasta onde gerar CSVs
  - `sheet_name` (opcional, default: "BAIXAS"): nome da aba
  - `year_source_column` (opcional, default: "DATA EMISSÃO"): coluna para extrair ano
  - `max_linhas_por_arquivo` (opcional, default: 50): linhas por arquivo gerado
  - `csv_sep` (opcional, default: ";"): separador do CSV de saída

### Saídas

- **Arquivos gerados:**
```
/data/outputs/separados/
├── arquivo__2024__parte-01.csv    (50 linhas)
├── arquivo__2024__parte-02.csv    (50 linhas)
├── arquivo__2025__parte-01.csv    (30 linhas)
└── arquivo__2025__parte-02.csv    (25 linhas)
```

- **Resposta HTTP (200):**
```json
{
  "ok": true,
  "arquivos_gerados": [
    {"arquivo": "arquivo__2024__parte-01.csv", "ano": 2024, "linhas": 50},
    {"arquivo": "arquivo__2024__parte-02.csv", "ano": 2024, "linhas": 50},
    {"arquivo": "arquivo__2025__parte-01.csv", "ano": 2025, "linhas": 30}
  ],
  "resumo_por_ano": {
    "2024": 100,
    "2025": 30
  },
  "logs": [
    "Lendo arquivo: baixa_fevereiro.xlsx",
    "Coluna usada para ano: DATA EMISSÃO",
    "Gerado arquivo__2024__parte-01.csv (50 linhas)",
    "Gerado arquivo__2024__parte-02.csv (50 linhas)",
    "Gerado arquivo__2025__parte-01.csv (30 linhas)"
  ],
  "output_dir": "/data/outputs/separados",
  "timestamp": "2025-02-06T14:30:15Z"
}
```

- **Resposta de erro (400):**
```json
{
  "ok": false,
  "erro": "Coluna 'DATA EMISSÃO' não encontrada no arquivo",
  "colunas_disponiveis": ["Nº DOCUMENTO", "VALOR", "DATA CRÉDITO"],
  "logs": ["Erro ao processar arquivo"]
}
```

## Dependências e conexões

- **Serviços chamados:** Nenhum (standalone)
- **Banco/tabelas:** Nenhum
- **Fila/eventos:** Nenhum
- **Integrações externas:**
  - Openpyxl (ler Excel)
  - Pandas (processamento de dados)

- **Bibliotecas Python:**
  - `pandas>=1.3.0`
  - `openpyxl>=3.6.0`
  - `python-dateutil>=2.8.0`

## Permissões e segurança

- **Quem pode usar (RBAC):**
  - Role `contabilista` (acesso total)
  - Role `analista_financeiro` (acesso total)
  - Role `gestor_tesouraria` (acesso apenas leitura)

- **Dados sensíveis (LGPD):**
  - Números de documento (cheque, transferência)
  - Valores financeiros
  - Dados bancários
  - **Ação:** Criptografar arquivos em repouso em `/data/outputs/separados/`
  - **Retenção:** Manter por 2 anos conforme legislação fiscal

- **Auditoria/logs:**
  - Log: `/var/log/central-utils/separador_csv.log`
  - Registra: usuário, arquivo processado, ano, linhas processadas, timestamp
  - Exemplo: `2025-02-06 14:30:15 | user=maria.santos | arquivo=baixa.xlsx | anos=2024,2025 | linhas=130`

## Configurações

- **Variáveis de ambiente:**
  - `CSV_MAX_LINHAS_POR_ARQUIVO` - default: 50 linhas
  - `CSV_SEPARADOR_SAIDA` - default: ";" (ponto-vírgula)
  - `CSV_ENCODING` - default: "utf-8-sig"
  - `UPLOAD_MAX_FILE_MB` - default: 25 MB

- **Feature flags:**
  - `VALIDAR_VALORES_MONETARIOS` - validar se coluna decimal é numérica (default: true)
  - `REMOVER_LINHAS_VAZIAS` - limpar linhas sem dados (default: true)
  - `FORMATAR_DATAS_AUTOMATICO` - aplicar formatação dd/mm/yyyy (default: true)

## Observabilidade

- **Logs:**
  - Local: `/var/log/central-utils/separador_csv.log`
  - Filtrar: `grep "separador_csv" /var/log/central-utils/*.log`
  - Problemas: `grep "ERROR\|WARN" /var/log/central-utils/separador_csv.log`

- **Métricas:**
  - `separador_csv_processamentos_total` - total de processamentos
  - `separador_csv_linhas_total` - linhas processadas
  - `separador_csv_arquivos_gerados` - CSVs criados
  - `separador_csv_tempo_processamento_segundos` - duração
  - `separador_csv_erros_coluna_nao_encontrada` - inconsistências

- **Tracing:**
  - Cada requisição recebe ID único armazenado em logs
  - Rastreie: `grep "request_id=xyz789" /var/log/central-utils/separador_csv.log`

## Runbook (operação)

### Reprocessar/repetir execução

```bash
# 1. Verificar arquivo original
ls -la data/uploads/baixa_fevereiro.xlsx

# 2. Remover CSVs gerados anteriormente
rm -rf data/outputs/separados/arquivo__*

# 3. Chamar API novamente
curl -X POST http://localhost:8001/api/separador-csv-baixa-automatica/processar \
  -H "Content-Type: application/json" \
  -d '{
    "input_csv_path": "/data/uploads/baixa_fevereiro.xlsx",
    "output_dir": "/data/outputs/separados",
    "max_linhas_por_arquivo": 50
  }'
```

### Rollback/desfazer

```bash
# 1. Restaurar from backup
cp data/outputs/.backup/arquivo__2024__parte-01.csv data/outputs/separados/

# 2. Ou remover tudo e reprocessar
rm -rf data/outputs/separados/*
```

### Limites conhecidos

| Limite | Valor | Impacto |
|--------|-------|--------|
| Tamanho arquivo | 25 MB | Falha se exceder |
| Linhas por arquivo | 50 | Cria múltiplos CSVs |
| Tempo máximo | 60 segundos | Timeout |
| Colunas esperadas | >5 | Se menos, pode falhar detecção |
| Anos processáveis | 1900-2100 | Fora disso, linha é descartada |
| Caracteres especiais | UTF-8 apenas | Outros encodings: erro |

➡️ **Runbook completo:** [Processamento CSV](../runbooks/separador-csv.md)

## Troubleshooting

| Sintoma | Causa provável | Como resolver |
|---------|----------------|---------------|
| "Coluna DATA EMISSÃO não encontrada" | Aba tem nome diferente ou colunas faltando | Verificar nomes em Excel, usar parâmetro `sheet_name` correto |
| "Sem linhas válidas após extrair ano" | Coluna de data está vazia ou em formato inválido | Verificar dados em Excel, garantir formato dd/mm/yyyy |
| "Arquivo vazio gerado" | Falha interna de formatação | Verificar logs, tentar com parâmetros padrão |
| "CSV com valores errados" | Encoding incorreto (caracteres especiais corrompidos) | Usar BOM UTF-8, validar em editor |
| "Múltiplas partes geradas quando não esperado" | Limite de linhas atingido | Aumentar `max_linhas_por_arquivo` |
| "Erro de acesso ao arquivo" | Permissões insuficientes | Verificar `chmod` em `/data/outputs/separados/` |

## Referências

- **Arquitetura:** [Processamento de Dados Financeiros](../01-ARQUITETURA.md#separador-csv)
- **Código:**
  - Core: [api/separador_csv_baixa_automatica_core.py](../../api/separador_csv_baixa_automatica_core.py)
  - Parsing de datas: linhas 30-50
  - Formatação: linhas 60-100
  - Chunking: funções `_chunk_dataframe` e `_format_columns`
- **Exemplo de uso:** [scripts/exemplo_separador_csv.py](../../scripts/exemplo_separador_csv.py)
- **Schema CSV esperado:** [docs/schemas/baixa-automatica.json](../schemas/baixa-automatica.json)

---

**Última atualização:** Fevereiro 2026  
**Mantido por:** Squad Financeiro  
**Próxima revisão:** Abril 2026
