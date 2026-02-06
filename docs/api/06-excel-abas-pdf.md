# Excel para PDF em Abas

> **Tipo:** API / Job  
> **Status:** Ativa  
> **Owner:** Squad Operacional  
> **Local no repo:** `/api/excel_abas_pdf_core.py`  
> **Ambientes:** dev/stg/prod  

## Objetivo

Exporta **cada aba de arquivos Excel** como um arquivo PDF individual, com formatação de impressão otimizada (ajuste a 1 página, área de impressão A1:I32). Facilita distribuição de relatórios, conformidade e visualização sem necessidade de Excel.

Reduz conversão manual de ~5 minutos por arquivo para ~2 segundos (automático).

Principais beneficiários: gestores, analistas financeiros, auditores, departamentos administrativos.

## Quando usar

- Exportação de abas de planilha para compartilhamento seguro
- Preparação de relatórios para impressão com formatação profissional
- Conversão de múltiplos arquivos em lote
- Quando necessário distribuir dados sem expor fórmulas (só leitura)
- Arquivamento de relatórios mensais/anuais
- Preparação para assinatura eletrônica

## Como acessar

- **API REST:** `POST http://localhost:8001/api/excel-abas-pdf/exportar`
- **Swagger:** http://localhost:8001/docs (endpoint `excel-abas-pdf`)
- **Arquivo Python Core:** `api/excel_abas_pdf_core.py`
- **Frontend:** Menu → "Excel para PDF em Abas"
- **Job automático:** Configurável via scheduler

## Fluxo principal

1. **Upload/seleção de arquivos Excel:**
   - Aceita: XLSX, XLSM (Excel 2007+)
   - Tamanho máximo por arquivo: 20 MB
   - Quantidade: até 50 arquivos em lote

2. **Instanciação do Excel COM:**
   - Inicializa aplicação Excel via `win32com.client` (Windows only)
   - Desativa alertas e modo visível (background)
   - Abre cada arquivo em modo Read-Only

3. **Iteração por abas (Worksheets):**
   - Processa TODAS as abas do arquivo
   - Ignora gráficos, objetos OLE
   - Pula abas ocultas (se configurado)

4. **Configuração de impressão:**
   - Define área de impressão: `$A$1:$I$32` (padrão contábil)
   - Ajusta zoom: FitToPagesWide=1, FitToPagesTall=1
   - Garante caber em 1 página A4
   - DPI padrão: 150 (qualidade standard)

5. **Exportação para PDF:**
   - Usa `ExportAsFixedFormat` (nativo Excel)
   - Qualidade: Standard (xlQualityStandard)
   - Inclui propriedades do documento
   - Ignora áreas de impressão vazias

6. **Sanitização de nomes:**
   - Remove caracteres inválidos: `< > : " / \ | ? *`
   - Limita nome a 150 caracteres
   - Formato: `[arquivo] - [aba].pdf`

7. **Resultado:**
   - Lista de PDFs gerados (um por aba)
   - Metadados: arquivo origem, aba, caminho, status
   - Erros detalhados por aba

## Entradas e saídas

### Entradas

- **Arquivos:**
  - Arquivos Excel XLSX/XLSM
  - Tamanho máximo por arquivo: 20 MB
  - Total máximo em lote: 50 arquivos

- **Payload (JSON):**
```json
{
  "caminhos_arquivos": [
    "/data/uploads/relatorio_janeiro.xlsx",
    "/data/uploads/relatorio_fevereiro.xlsx",
    "/data/uploads/orcamento_2025.xlsm"
  ],
  "pasta_destino": "/data/outputs/pdfs-exportados",
  "area_impressao": "$A$1:$I$32",
  "fit_to_page": true,
  "dpi": 150,
  "incluir_propriedades": true,
  "remover_abas_ocultas": false
}
```

- **Parâmetros:**
  - `caminhos_arquivos` (obrigatório): array de paths Excel
  - `pasta_destino` (obrigatório): diretório saída (criado se não existir)
  - `area_impressao` (opcional, default: "$A$1:$I$32"): range de impressão
  - `fit_to_page` (opcional, default: true): ajustar a 1 página
  - `dpi` (opcional, default: 150): qualidade resolução {96, 150, 300}
  - `incluir_propriedades` (opcional, default: true): metadata no PDF
  - `remover_abas_ocultas` (opcional, default: false): pular abas hidden

### Saídas

- **Arquivos gerados:**
```
/data/outputs/pdfs-exportados/
├── relatorio_janeiro - RESUMO.pdf
├── relatorio_janeiro - DETALHES.pdf
├── relatorio_janeiro - GRÁFICOS.pdf
├── relatorio_fevereiro - RESUMO.pdf
├── relatorio_fevereiro - DETALHES.pdf
├── orcamento_2025 - RECEITAS.pdf
├── orcamento_2025 - DESPESAS.pdf
└── orcamento_2025 - CONSOLIDADO.pdf
```

- **Resposta HTTP (200):**
```json
{
  "success": true,
  "total_arquivos_processados": 3,
  "total_abas_exportadas": 8,
  "resultados": [
    {
      "arquivo_excel": "/data/uploads/relatorio_janeiro.xlsx",
      "aba": "RESUMO",
      "nome_pdf": "relatorio_janeiro - RESUMO.pdf",
      "pdf": "/data/outputs/pdfs-exportados/relatorio_janeiro - RESUMO.pdf",
      "sucesso": true,
      "erro": null,
      "tamanho_bytes": 125000,
      "tempo_processamento_ms": 450
    },
    {
      "arquivo_excel": "/data/uploads/relatorio_janeiro.xlsx",
      "aba": "DETALHES",
      "nome_pdf": "relatorio_janeiro - DETALHES.pdf",
      "pdf": "/data/outputs/pdfs-exportados/relatorio_janeiro - DETALHES.pdf",
      "sucesso": true,
      "erro": null,
      "tamanho_bytes": 285000,
      "tempo_processamento_ms": 520
    },
    {
      "arquivo_excel": "/data/uploads/relatorio_janeiro.xlsx",
      "aba": "GRÁFICOS",
      "nome_pdf": "relatorio_janeiro - GRÁFICOS.pdf",
      "pdf": "/data/outputs/pdfs-exportados/relatorio_janeiro - GRÁFICOS.pdf",
      "sucesso": true,
      "erro": null,
      "tamanho_bytes": 450000,
      "tempo_processamento_ms": 1200
    }
  ],
  "total_tamanho_bytes": 860000,
  "timestamp": "2025-02-06T15:20:45Z"
}
```

- **Resposta parcial com erros (207):**
```json
{
  "success": false,
  "total_arquivos_processados": 3,
  "abas_exportadas_com_sucesso": 7,
  "abas_com_erro": 1,
  "resultados": [
    {
      "arquivo_excel": "/data/uploads/relatorio_janeiro.xlsx",
      "aba": "RESUMO",
      "sucesso": true,
      "nome_pdf": "relatorio_janeiro - RESUMO.pdf"
    },
    {
      "arquivo_excel": "/data/uploads/arquivo_corrompido.xlsx",
      "aba": null,
      "nome_pdf": null,
      "pdf": null,
      "sucesso": false,
      "erro": "Não foi possível abrir o arquivo: arquivo corrompido ou não encontrado"
    }
  ]
}
```

## Dependências e conexões

- **Serviços chamados:** Nenhum (standalone)
- **Banco/tabelas:** Nenhum
- **Fila/eventos:** Nenhum
- **Integrações internas:**
  - Microsoft Excel Application (COM) - **Windows required**
  - win32com.client (pywin32)

- **Bibliotecas Python:**
  - `pywin32>=300` - acesso COM ao Excel
  - `openpyxl>=3.6.0` - leitura Excel (fallback)

- **Requisitos do sistema:**
  - Sistema operacional: **Windows apenas** (dependência em Excel COM)
  - Excel instalado: Office 2010+ ou Office 365
  - Permissão: usuário deve ter acesso a iniciar processos Excel

## Permissões e segurança

- **Quem pode usar (RBAC):**
  - Role `analista_financeiro` (acesso total)
  - Role `gestor_departamento` (acesso total)
  - Role `operacional` (acesso limitado - apenas próprios arquivos)

- **Dados sensíveis (LGPD):**
  - Dados financeiros em planilhas
  - Informações de custo/margem
  - Dados de staff/salários
  - **Ação:** Criptografar PDFs em repouso
  - **Retenção:** Manter por 1 ano em `/data/outputs/`
  - **Acesso:** Restrito conforme RBAC

- **Auditoria/logs:**
  - Log: `/var/log/central-utils/excel_pdf.log`
  - Registra: usuário, arquivos processados, abas, status, timestamp
  - Exemplo: `2025-02-06 15:20:45 | user=gerente.fin | arquivos=3 | abas=8 | status=success`

## Configurações

- **Variáveis de ambiente:**
  - `EXCEL_AREA_IMPRESSAO_PADRAO` - default: "$A$1:$I$32"
  - `EXCEL_DPI_PADRAO` - default: "150"
  - `EXCEL_MAX_ARQUIVO_MB` - default: 20
  - `EXCEL_TIMEOUT_SEGUNDOS` - default: 60
  - `EXCEL_PATH_CUSTOM` - caminho customizado Excel (se não for padrão)

- **Feature flags:**
  - `MANTER_EXCEL_ABERTO` - não fechar Excel após processar (default: false)
  - `PULAR_ABAS_OCULTAS` - ignorar worksheets hidden (default: true)
  - `NOTIFICAR_COMPLETAMENTO` - enviar email após concluir (default: false)
  - `GERAR_RELATÓRIO_PROCESSAMENTO` - criar HTML com resumo (default: true)

## Observabilidade

- **Logs:**
  - Local: `/var/log/central-utils/excel_pdf.log`
  - Filtrar erros: `grep "ERROR" /var/log/central-utils/excel_pdf.log`
  - Detalhes de aba: `grep "ABA_FALHA" /var/log/central-utils/excel_pdf.log`

- **Métricas:**
  - `excel_pdf_processamentos_total` - total de execuções
  - `excel_pdf_abas_exportadas_total` - abas processadas com sucesso
  - `excel_pdf_tempo_processamento_segundos` - duração por arquivo
  - `excel_pdf_tamanho_saida_bytes` - tamanho dos PDFs gerados
  - `excel_pdf_erros_arquivo_nao_encontrado` - contagem de erros
  - `excel_pdf_erros_aba_exportacao` - falhas por aba

- **Tracing:**
  - ID único por sessão Excel: `excel_session_id` em logs
  - Rastreie: `grep "excel_session_id=xyz" /var/log/central-utils/excel_pdf.log`

## Runbook (operação)

### Reprocessar/repetir execução

```bash
# 1. Remover PDFs gerados anteriormente
rm -f data/outputs/pdfs-exportados/*.pdf

# 2. Verificar Excel original
ls -la data/uploads/relatorio_*.xlsx

# 3. Chamar API novamente
curl -X POST http://localhost:8001/api/excel-abas-pdf/exportar \
  -H "Content-Type: application/json" \
  -d '{
    "caminhos_arquivos": [
      "/data/uploads/relatorio_janeiro.xlsx"
    ],
    "pasta_destino": "/data/outputs/pdfs-exportados"
  }'
```

### Rollback/desfazer

```bash
# 1. Se arquivos já foram distribuídos, restaurar from backup
cp data/outputs/.backup/relatorio_janeiro-*.pdf data/outputs/pdfs-exportados/

# 2. Ou simplesmente remover e reprocessar
rm -rf data/outputs/pdfs-exportados/*
# (Reprocessar conforme acima)
```

### Limites conhecidos

| Limite | Valor | Impacto |
|--------|-------|--------|
| Tamanho arquivo | 20 MB | Falha se exceder |
| Arquivos em lote | 50 | Timeout se muitos |
| Abas por arquivo | 255 (máx Excel) | Processa todas |
| Tempo máximo por arquivo | 60 segundos | Timeout |
| Tamanho área impressão | A1:Z1000 (máx) | Pode não caber em 1 página |
| DPI máximo | 300 | Qualidade vs tamanho |
| Caracteres em nome de aba | UTF-8 | Especiais removidos |
| Sistema operacional | Windows only | Não funciona em Linux/Mac |

➡️ **Runbook completo:** [Exportação Excel-PDF](../runbooks/excel-pdf.md)

## Troubleshooting

| Sintoma | Causa provável | Como resolver |
|---------|----------------|---------------|
| "Excel não instalado" | Máquina não tem Excel | Instalar Office 2010+ ou usar LibreOffice com pillow-heic |
| "Erro COM não disponível" | pywin32 não instalado corretamente | `pip install pywin32` e executar post-install |
| "Arquivo não encontrado" | Path inválido ou arquivo deletado | Verificar `ls -la` no path informado |
| "Aba não encontrada" | Nome de aba diferente do esperado | Verificar nomes exatos em Excel |
| "PDF vazio ou sem conteúdo" | Área de impressão fora do range | Ajustar `area_impressao` ou dados na aba |
| "Timeout ao processar" | Arquivo muito grande ou fórmulas complexas | Dividir em múltiplos arquivos menores |
| "PDF com qualidade ruim" | DPI insuficiente | Usar `dpi=300` em vez de 150 |
| "Windows - permissão de acesso negada" | Permissões insuficientes no diretório | Verificar `icacls C:\path\to\output` |

## Referências

- **Arquitetura:** [Conversão de Formatos](../01-ARQUITETURA.md#excel-pdf)
- **Código:**
  - Core: [api/excel_abas_pdf_core.py](../../api/excel_abas_pdf_core.py)
  - Sanitização: função `sanitizar_nome` (linhas 10-20)
  - Exportação: função `exportar_abas_para_pdf` (linhas 25-100)
  - COM handling: linhas 30-50
- **Relacionado:**
  - PDF compressor: [07-compressor-pdf.md](07-compressor-pdf.md)
  - Compressor geral: [api/comprimir_pdf_core.py](../../api/comprimir_pdf_core.py)
- **Exemplos:**
  - [scripts/exemplo_excel_pdf.py](../../scripts/exemplo_excel_pdf.py)

---

**Última atualização:** Fevereiro 2026  
**Mantido por:** Squad Operacional  
**Próxima revisão:** Junho 2026  
**Nota:** Sistema Windows-only devido a dependência em Excel COM
