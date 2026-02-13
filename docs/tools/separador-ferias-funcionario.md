# Separador de Férias por Funcionário

- **Slug:** `separador-ferias-funcionario`
- **Página:** `/separador-ferias-funcionario`
- **Permissão:** `tool:separador-ferias-funcionario` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/separador-ferias-funcionario`
- **Runbook:** [runbook separador-ferias](../runbooks/runbook-separador-ferias.md)

## Documentação Consolidada

> **Tipo:** API / Job  
> **Status:** Ativa  
> **Owner:** Squad RH  
> **Local no repo:** `/api/separador_ferias_funcionario_core.py`  
> **Ambientes:** dev/stg/prod  

## Objetivo

Processa **PDFs consolidados de férias** (um bloco de 2 páginas por funcionário) e genera arquivos individuais organizados por **empresa e funcionário**. Automatiza distribuição de documentos, reconciliação de férias em auditoria e preparação para assinatura.

Reduz tempo de separação manual de ~2 horas (100 paginas) para ~5 segundos (automático).

Principais beneficiários: RH, controladoria, gestores de departamento, auditores.

## Quando usar

- Processamento de PDF consolidado com todos os funcionários
- Distribuição de recibos de férias para assinatura
- Preparação de arquivos para digitalização/arquivamento
- Reconciliação de férias em auditoria externa
- Quando precisa-se de um arquivo por funcionário organizado por empresa

## Como acessar

- **API REST:** `POST http://localhost:8001/api/separador-ferias-funcionario/processar`
- **Swagger:** http://localhost:8001/docs (endpoint `separador-ferias-funcionario`)
- **Arquivo Python Core:** `api/separador_ferias_funcionario_core.py`
- **Frontend:** Menu → "Separador de Férias por Funcionário"
- **Job automático:** Configurável em `tareffa_empresas_lote_job.py`

## Fluxo principal

1. **Upload do PDF consolidado:**
   - Arquivo contém blocos de 2 páginas (frente/verso)
   - Cada par de páginas = 1 funcionário
   - Organização esperada: empresas intercaladas ou contínuas

2. **Detecção de empresa:**
   - Extrai texto das primeiras 6 páginas
   - Busca padrão: "EMPRESA : <nome>" ou "Empresa : <nome>"
   - Fallback: "sem_empresa" se não encontrado

3. **Detecção de funcionário (por bloco):**
   - Busca "NOME COMPLETO : <nome>" no bloco
   - Fallback: padrão "Ilmo Sr(a). <nome> Código:"
   - Se nenhum encontrado: "funcionario_XXX"

4. **Separação física:**
   - Cria estrutura: `FERIAS - [EMPRESA]/[LOTE]/FERIAS - [FUNCIONARIO].pdf`
   - 2 páginas (bloco) por arquivo
   - Remove caracteres inválidos de nomeação

5. **Agregação em ZIP:**
   - Compacta todos os PDFs individuais
   - Estrutura mantida no ZIP
   - Compressão DEFLATE (reduce ~30-40%)

6. **Limpeza automática:**
   - Remove PDFs individuais após ZIP criado
   - Apaga pastas vazias
   - Deleta PDF original de entrada (liberando espaço)

7. **Resultado:**
   - Um ZIP contendo árvore de pastas/PDFs
   - Metadados: empresa, total de funcionários, lista de arquivos
   - Logs detalhados

## Entradas e saídas

### Entradas

- **Arquivos:**
  - PDF consolidado com blocos de 2 páginas
  - Tamanho máximo: 100 MB
  - Mínimo 2 páginas (1 funcionário)

- **Payload (JSON):**
```json
{
  "pdf_path": "/data/uploads/ferias_janeiro_2025.pdf",
  "output_dir": "/data/outputs/ferias-funcionario"
}
```

- **Parâmetros:**
  - `pdf_path` (obrigatório): caminho do PDF consolidado
  - `output_dir` (obrigatório): pasta para saída (será criada se não existir)

### Saídas

- **Estrutura de diretórios:**
```
/data/outputs/ferias-funcionario/
├── FERIAS - EMPRESA ALPHA/
│   └── arquivo_entrada_123456789/
│       ├── FERIAS - JOÃO SILVA.pdf
│       ├── FERIAS - MARIA SANTOS.pdf
│       └── FERIAS - CARLOS OLIVEIRA.pdf
├── FERIAS - EMPRESA BETA/
│   └── arquivo_entrada_987654321/
│       ├── FERIAS - PEDRO SOUSA.pdf
│       └── FERIAS - ANA COSTA.pdf
└── ferias_consolidadas_123456789_FERIAS_POR_FUNCIONARIO.zip
```

- **Resposta HTTP (200):**
```json
{
  "success": true,
  "empresa": "EMPRESA ALPHA",
  "total_paginas": 14,
  "total_funcionarios": 7,
  "pasta_saida": "/data/outputs/ferias-funcionario/FERIAS - EMPRESA ALPHA/arquivo_123456789",
  "zip_path": "/data/outputs/ferias-funcionario/ferias_consolidadas_123456789_FERIAS_POR_FUNCIONARIO.zip",
  "arquivos": [
    "FERIAS - JOÃO SILVA.pdf",
    "FERIAS - MARIA SANTOS.pdf",
    "FERIAS - CARLOS OLIVEIRA.pdf",
    "FERIAS - PEDRO SOUSA.pdf",
    "FERIAS - ANA COSTA.pdf",
    "FERIAS - LUIS FERREIRA.pdf",
    "FERIAS - JULIANA MENDES.pdf"
  ],
  "size_zip_bytes": 2458000,
  "timestamp": "2025-02-06T10:45:30Z"
}
```

- **Resposta de erro (400/500):**
```json
{
  "success": false,
  "error": "PDF com página ímpar (13 páginas encontradas)",
  "detail": "Esperado número par de páginas (blocos de 2 páginas)",
  "paginas_encontradas": 13
}
```

## Dependências e conexões

- **Serviços chamados:** Nenhum (standalone)
- **Banco/tabelas:** Nenhum
- **Fila/eventos:** Nenhum (mas pode ser integrado com fila)
- **Integrações externas:** Nenhuma

- **Bibliotecas Python:**
  - `PyPDF2>=3.0.0` - manipulação de PDFs
  - `pdfplumber>=0.8.0` - extração de texto (alternativa)
  - `python-dateutil>=2.8.0` (opcional)

## Permissões e segurança

- **Quem pode usar (RBAC):**
  - Role `gestor_rh` (acesso total)
  - Role `analista_rh` (acesso total)
  - Role `gestor_empresa` (acesso apenas própria empresa)
  - Role `auditor` (acesso leitura apenas)

- **Dados sensíveis (LGPD):**
  - Nomes completos de funcionários
  - Dados de férias (período, saldo, etc.)
  - Possíveis dados bancários em recibos
  - **Ação:** Criptografar ZIPs em repouso
  - **Retenção:** Manter por 5 anos (conforme CLT)
  - **Acesso:** Restrito a usuários RH/Auditoria

- **Auditoria/logs:**
  - Log: `/var/log/central-utils/separador_ferias.log`
  - Registra: usuário, empresa, arquivo processado, funcionários, timestamp
  - Exemplo: `2025-02-06 10:45:30 | user=rh.admin | empresa=ALPHA | funcionarios=7 | status=success`

## Configurações

- **Variáveis de ambiente:**
  - `FERIAS_PAGINAS_POR_BLOCO` - default: 2 (não alterar sem motivo)
  - `FERIAS_LIMPEZA_AUTOMATICA` - default: true (deletar individuais)
  - `FERIAS_MAX_TAMANHO_PDF_MB` - default: 100
  - `FERIAS_KEEP_PDF_ORIGINAL` - default: false (deletar PDF entrada)

- **Feature flags:**
  - `EXTRAIR_TEXTO_FIECEL` - tentar extrair dados estruturados (default: false)
  - `VALIDAR_NOME_FUNCIONARIO` - validar presença de nome (default: true)
  - `MANTER_ESTRUTURA_PASTA` - criar pasta empresa/lote (default: true)
  - `COMPRIMIR_ZIP` - usar compressão DEFLATE (default: true)

## Observabilidade

- **Logs:**
  - Local: `/var/log/central-utils/separador_ferias.log`
  - Filtrar erros: `grep "ERROR" /var/log/central-utils/separador_ferias.log`
  - Rastrear por enterprise: `grep "empresa=ALPHA" /var/log/central-utils/separador_ferias.log`

- **Métricas:**
  - `ferias_separador_processamentos_total` - total de execuções
  - `ferias_separador_funcionarios_total` - total funcionários processados
  - `ferias_separador_tempo_segundos` - tempo de processamento
  - `ferias_separador_tamanho_zip_bytes` - tamanho dos ZIPs gerados
  - `ferias_separador_erros_paginas_impares` - PDFs com páginas ímpares

- **Tracing:**
  - ID único por execução: `request_id` em logs
  - Rastreie: `grep "request_id=abc123" /var/log/central-utils/separador_ferias.log`

## Runbook (operação)

### Reprocessar/repetir execução

```bash
# 1. Restaurar PDF original se foi deletado
cp data/backups/ferias_janeiro_2025.pdf data/uploads/

# 2. Remover ZIP anterior
rm -f data/outputs/ferias-funcionario/*FERIAS_POR_FUNCIONARIO.zip

# 3. Remover pastas individuais
rm -rf data/outputs/ferias-funcionario/FERIAS\ -\ *

# 4. Chamar API novamente
curl -X POST http://localhost:8001/api/separador-ferias-funcionario/processar \
  -H "Content-Type: application/json" \
  -d '{
    "pdf_path": "/data/uploads/ferias_janeiro_2025.pdf"
  }'
```

### Rollback/desfazer

```bash
# 1. Se ZIP já foi enviado para impressão, recuperar from backup
ls -la data/outputs/.backup/ferias_*

# 2. Recuperar versão anterior
cp data/outputs/.backup/ferias_janeiro_2025_backup.zip \
   data/outputs/ferias-funcionario/ferias_janeiro_2025.zip

# 3. Extrair e distribuir
unzip data/outputs/ferias-funcionario/ferias_janeiro_2025.zip -d data/distribuicao/
```

### Limites conhecidos

| Limite | Valor | Impacto |
|--------|-------|--------|
| Tamanho arquivo PDF | 100 MB | Falha se exceder |
| Páginas máximas | 2000 (1000 func.) | Timeout no servidor |
| Number de blocos | Ilimitado | 2 páginas/bloco |
| Tempo máximo | 120 segundos | Timeout 504 |
| Caracteres em nomes | UTF-8 apenas | Especiais são removidos |
| Tamanho máximo ZIP saída | 500 MB | Falha ao compactar |

➡️ **Runbook completo:** [Processamento de Férias](../runbooks/ferias.md)

## Troubleshooting

| Sintoma | Causa provável | Como resolver |
|---------|----------------|---------------|
| "PDF com página ímpar" | PDF original tem número ímpar de páginas | Adicionar página em branco ou verificar PDF origem |
| "Empresa não encontrada" | Padrão de text diferente do esperado | Editar PDF manualmente para incluir "EMPRESA: <nome>" |
| "Funcionário com nome genérico" | Texto não foi extraído corretamente | Verificar qualidade do PDF (OCR pode ser necessário) |
| "Erro de permissão ao salvar" | Sem acesso a write em `/data/outputs/` | Verificar permissões: `chmod 755 /data/outputs/` |
| "ZIP não foi gerado" | Falha na compressão ou disco cheio | Verificar espaço: `df -h /data/` |
| "Arquivo não deletado" | Processo ainda aberto ou permissão negada | Aguardar alguns segundos ou manualizar `rm` |

## Referências

- **Arquitetura:** [Processamento de RH](../01-ARQUITETURA.md#separador-ferias)
- **Código:**
  - Core: [api/separador_ferias_funcionario_core.py](../../api/separador_ferias_funcionario_core.py)
  - Extração de texto: linhas 10-50
  - Sanitização: funções `sanitizar_para_arquivo` e `caminho_unico`
  - Processamento: função `processar_ferias_por_funcionario` (linhas 100-219)
- **Relacionado:**
  - Job original: [api/tareffa_empresas_lote_job.py](../../api/tareffa_empresas_lote_job.py)
  - PDF separador geral: [03-separador-holerites.md](03-separador-holerites.md)

---

**Última atualização:** Fevereiro 2026  
**Mantido por:** Squad RH  
**Próxima revisão:** Junho 2026
