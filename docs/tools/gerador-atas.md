# Gerador de Atas

- **Slug:** `gerador-atas`
- **Página:** `/gerador-atas`
- **Permissão:** `tool:gerador-atas` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/gerador-atas`
- **Runbook:** [runbook gerador-atas](../runbooks/runbook-gerador-atas.md)

## Documentação Consolidada

> **Tipo:** UI interna / API  
> **Status:** Ativa  
> **Owner:** Squad Administrativo  
> **Local no repo:** `/api/gerador_atas_core.py`  
> **Ambientes:** dev/stg/prod  

## Objetivo

Automatiza a geração de **atas de reunião** em múltiplos formatos (DOCX, PDF, HTML) a partir de templates customizáveis. Elimina retrabalho, garante padronização visual e conformidade com padrões da empresa. Reduz tempo de geração de ~30 minutos (manual) para ~2-5 segundos (automático).

Principais beneficiários: assistentes administrativas, coordenadores de reuniões, departamentos de compliance.

## Quando usar

- Reuniões de diretoria que requerem documentação formal
- Atas de assembly de acionistas com assinatura digital
- Documentos internos que precisam de histórico auditável
- Geração em lote (múltiplas atas com templates padronizadas)
- Quando conformidade com padrões ISO 9001 é necessária

## Como acessar

- **UI Web:** Menu principal → "Gerador de Atas" → Formulário interativo
- **API REST:** `POST http://localhost:8001/api/gerador-atas/gerar`
- **Swagger:** http://localhost:8001/docs (endpoint `/api/gerador-atas/gerar`)
- **Arquivo Python Core:** `api/gerador_atas_core.py`

## Fluxo principal

1. **Submissão de dados:** Usuário preenche formulário ou envia JSON com:
   - Identificação da reunião (data, local, participantes)
   - Conteúdo (assuntos, discussões, decisões)
   - Seleção do template (ex: "Template Bernadina.xlsm")

2. **Validação:** API valida:
   - Formato de datas (YYYY-MM-DD)
   - Existência do template
   - Preenchimento de campos obrigatórios
   - Integridade de estrutura de dados

3. **Processamento:**
   - Carrega modelo XLSM/DOCX
   - Substitui placeholders `{{campo}}` com valores reais
   - Aplica formatações automáticas (negrito, maiúsculas, tamanhos específicos)
   - Remove linhas vazias de tabelas (ex: lucros sem valor)

4. **Geração de saídas:**
   - **DOCX:** Documento editável no Word (mantém formatação)
   - **PDF:** Versão impressível com resolução 150 DPI
   - **HTML:** Visualização em navegador

5. **Resultado esperado:** Arquivo ZIP contendo DOCX + PDF + HTML com metadados

## Entradas e saídas

### Entradas

- **Arquivos:**
  - Template XLSM/DOCX em `data/atas_modelos/`
  
- **Payload (JSON):**
```json
{
  "modelo": "Template Bernadina.xlsm",
  "data_reuniao": "2025-02-06",
  "hora_inicio": "14:30",
  "hora_fim": "16:00",
  "local": "Sala de Conferências",
  "responsavel": "João Silva",
  "departamento": "Administração",
  "titulo": "Reunião de Planejamento 2025",
  "presentes": ["João Silva", "Maria Santos", "Carlos Costa"],
  "ausentes": ["Pedro Oliveira"],
  "assuntos": [
    {
      "numero": 1,
      "titulo": "Revisão de Orçamento",
      "discussao": "Discussão dos itens de maior impacto. Apresentação da proposta de redução de 5% em custos operacionais."
    },
    {
      "numero": 2,
      "titulo": "Cronograma de Projetos",
      "discussao": "Definição de datas e milestones. Aprovação para início da fase 2 em março."
    }
  ],
  "decisoes": [
    "Aprovar orçamento 2025 com ajustes solicitados",
    "Criar task force para projeto X",
    "Alocar recursos adicionais para TI"
  ],
  "proxima_reuniao": "2025-03-06"
}
```

- **Parâmetros obrigatórios:**
  - `modelo`: nome do template (deve existir em `data/atas_modelos/`)
  - `data_reuniao`: formato YYYY-MM-DD
  - `titulo`: assunto principal da reunião
  - `presentes`: array com nomes de participantes
  - `assuntos`: array de objetos com `numero`, `titulo`, `discussao`
  - `decisoes`: array de strings com decisões tomadas

### Saídas

- **Arquivos gerados:**
```
resultado_[timestamp].zip
├── ata.docx          ← Documento Word editável (Calibri 11pt)
├── ata.pdf           ← PDF para impressão (150 DPI, A4)
└── ata.html          ← HTML responsivo para navegador
```

- **Resposta HTTP (200):**
```json
{
  "success": true,
  "output_path": "/data/atas_geradas/ata_20250206_143015.zip",
  "output_filename": "ata_20250206_143015.zip",
  "message": "Ata gerada com sucesso",
  "files_generated": ["ata.docx", "ata.pdf", "ata.html"],
  "size_bytes": 245000,
  "timestamp": "2025-02-06T14:30:15Z"
}
```

- **Resposta de erro (400/500):**
```json
{
  "success": false,
  "error": "Modelo não encontrado",
  "detail": "Modelos disponíveis: ['Template Bernadina.xlsm']",
  "timestamp": "2025-02-06T14:30:15Z"
}
```

## Dependências e conexões

- **Serviços chamados:** Nenhum (standalone)
- **Banco/tabelas:** Nenhum (não persiste em BD)
- **Fila/eventos:** Nenhum (síncrono)
- **Integrações externas:**
  - LibreOffice (via pyuno) - conversão DOCX→PDF
  - python-docx - manipulação de documentos Word
  - Pillow - processamento de imagens

- **Bibliotecas Python necessárias:**
  - `python-docx>=0.8.11`
  - `Pillow>=9.0.0`
  - `lxml>=4.9.0` (dependência de python-docx)

## Permissões e segurança

- **Quem pode usar (RBAC):**
  - Usuários autenticados com role `admin` ou `gestor_administrativo`
  - Acesso pode ser restrito por departamento via middleware

- **Dados sensíveis (LGPD):**
  - Nomes completos de participantes
  - Dados de reunião (local, conteúdo)
  - Decisões estratégicas
  - **Ação:** Aplicar criptografia em repouso para `data/atas_geradas/`
  - **Retenção:** Manter por 3 anos, deletar automaticamente

- **Auditoria/logs:**
  - Arquivo de log: `/var/log/central-utils/gerador_atas.log`
  - Campos registrados: usuário, template usado, timestamp, tamanho do ZIP
  - Exemplo: `2025-02-06 14:30:15 | user=joao.silva | template=Bernadina | status=success | size=245KB`

## Configurações

- **Variáveis de ambiente relevantes:**
  - `MODELOS_DIR` - path onde os templates estão (`data/atas_modelos`)
  - `SAIDA_DIR` - path de saída (`data/atas_geradas`)
  - `MAX_FILE_SIZE_MB` - limite de tamanho do ZIP (default: 50)
  - `TEMP_DIR` - diretório temporário para processamento
  - `LIBREOFFICE_PATH` - caminho para LibreOffice (Windows: `C:\Program Files\LibreOffice`)

- **Feature flags:**
  - `GERAR_PDF` - habilitar/desabilitar conversão para PDF (default: true)
  - `GERAR_HTML` - habilitar/desabilitar geração HTML (default: true)
  - `MANTER_DOCX` - manter DOCX no ZIP ou apenas PDF (default: true)
  - `ASSINATURA_DIGITAL` - integrar assinatura digital (default: false)

## Observabilidade

- **Logs:** 
  - Local: `/var/log/central-utils/gerador_atas.log`
  - Filtrar por: `grep "gerador_atas" /var/log/central-utils/*.log`
  - Formato: JSON estruturado com status, duração, erros

- **Métricas úteis:**
  - `atas_gerada_total` - contador de atas geradas
  - `atas_tempo_processamento_segundos` - histograma de tempo
  - `atas_tamanho_zip_bytes` - distribuição de tamanho
  - `atas_erros_template_nao_encontrado` - contador de erros

- **Tracing:**
  - Cada requisição recebe `request_id` único
  - Rastreie com: `grep "request_id=abc123" /var/log/central-utils/gerador_atas.log`
  - Visualize em Jaeger: http://localhost:6831 (se habilitado)

## Runbook (operação)

### Reprocessar/repetir execução

```bash
# 1. Verificar arquivo original de entrada
ls -la data/atas_geradas/ata_20250206_143015.zip

# 2. Baixar ZIP, extrair DOCX
unzip ata_20250206_143015.zip

# 3. Se precisar ajustar, editar ata.docx manualmente

# 4. Se precisar regenerar totalmente, chamar API novamente
curl -X POST http://localhost:8001/api/gerador-atas/gerar \
  -H "Content-Type: application/json" \
  -d @payload.json
```

### Rollback/desfazer

```bash
# 1. Identificar arquivo gerado
ls -lt data/atas_geradas/ | head -1

# 2. Mover para pasta de backup
mv data/atas_geradas/ata_20250206_143015.zip data/atas_geradas/.backup/

# 3. Se necessário resgatar versão anterior editada
cp data/atas_geradas/.backup/ata_20250206_100000.zip data/atas_geradas/
```

### Limites conhecidos

| Limite | Valor | Impacto |
|--------|-------|--------|
| Tamanho máximo ZIP | 50 MB | Falha se exceder |
| Tempo máximo processamento | 30 segundos | Timeout, erro 504 |
| Número máximo de assuntos | 50 | Além disso, tabela será paginada |
| Número máximo participantes | 100 | Pode quebrar formatação |
| Tamanho máximo template | 10 MB | Falha ao carregar |
| Caracteres CNPJ/CPF inválidos | Sanitizados automaticamente | Verificar documentação |

➡️ **Runbook completo:** [Operação de Atas](../runbooks/atas.md)

## Troubleshooting

| Sintoma | Causa provável | Como resolver |
|---------|----------------|---------------|
| "Modelo não encontrado" | Template não está em `data/atas_modelos/` | Verificar `ls data/atas_modelos/` e copiar arquivo |
| "Erro ao gerar DOCX" | Template corrompido ou formato inválido | Abrir em Word, salvar novamente como XLSM |
| "Timeout na geração" | Arquivo muito grande ou servidor sobrecarregado | Aumentar `MAX_FILE_SIZE_MB` ou usar servidor dedicado |
| "PDF com formatação estranha" | Template não suporta certos estilos | Usar template simplificado ou ajustar LibreOffice settings |
| "ZIP vazio" | Erro durante compressão | Verificar permissões em `/data/atas_geradas/` |
| "Placeholder não foi substituído {{campo}}" | Campo não existe no template | Verificar se placeholder está correto no DOCX |

## Referências

- **Arquitetura:** [Fluxo de Processamento de Documentos](../01-ARQUITETURA.md#gerador-atas)
- **Código:** 
  - Core: [api/gerador_atas_core.py](../../api/gerador_atas_core.py)
  - Funcionalidades principais: linhas 200-350 (processamento de placeholders)
  - Funções de formatação: linhas 50-150 (formatação de CNPJ, CEP, datas)
- **Templates:** [data/atas_modelos/](../../data/atas_modelos)
- **Issues/PRs importantes:** 
  - [#42 - Adicionar suporte a assinatura digital](https://github.com/repo/issues/42)
  - [#38 - Otimizar conversão PDF](https://github.com/repo/pull/38)
- **Changelog:** [CHANGELOG.md](../CHANGELOG.md#gerador-atas)

---

**Última atualização:** Fevereiro 2026  
**Mantido por:** Squad Administrativo  
**Próxima revisão:** Maio 2026
