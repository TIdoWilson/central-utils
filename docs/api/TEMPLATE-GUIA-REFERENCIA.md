# Template de Documentação - Guia de Referência

## Como Usar Este Template

Este documento descreve o template padrão para documentação de ferramentas/APIs no projeto central-utils. Todos os novos documentos devem seguir esta estrutura.

### Objetivo do Template

- ✅ Padronizar documentação técnica
- ✅ Facilitar manutenção e discovery
- ✅ Atender necessidades de operação e auditoria
- ✅ Suportar onboarding de novos desenvolvedores/ops

---

## Estrutura Completa

### 1. Cabeçalho com Metadados

```markdown
# {{ Nome da Ferramenta }}

> **Tipo:** (UI interna / Job / API / Script)  
> **Status:** (Ativa / Deprecada / Experimental)  
> **Owner:** (Time / pessoa / canal)  
> **Local no repo:** `/<path>`  
> **Ambientes:** (dev/stg/prod)  
```

**Explicação:**
- **Tipo:** Como a ferramenta é acessada/executada
  - UI interna: formulário web
  - Job: batch automático
  - API: endpoint REST
  - Script: CLI ou rotina batch manual
- **Status:** Ativa = pronta para uso; Deprecada = em fase de saída; Experimental = prototipagem
- **Owner:** Quem é responsável por manutenção/suporte
- **Local no repo:** Caminho do arquivo principal
- **Ambientes:** Onde roda (dev/staging/produção)

---

### 2. Objetivo (3-6 linhas)

```markdown
## Objetivo

Descrição clara em português simples do QUÊ a ferramenta faz e PARA QUEM.

Incluir:
- O problema que resolve
- Benefício/economia (tempo, custo, erro, conformidade)
- Principais beneficiários

Exemplo: "Automatiza geração de PDFs a partir de planilhas, reduzindo tempo manual de ~30 min para ~2 seg. Reduz erro humano, garante conformidade. Beneficia: controllers, gestores, auditores."
```

---

### 3. Quando Usar

```markdown
## Quando usar

- Caso 1: descrição breve quando é apropriado usar
- Caso 2: outro cenário
- Caso 3: quando é MELHOR usar (vs alternativa)
- (mínimo 2, máximo 6 casos)
```

**Dicas:**
- Seja específico (não: "quando precisa fazer X"; SIM: "para reconciliação mensal vs diária")
- Mencione quando NÃO usar
- Contraste com ferramentas similares, se houver

---

### 4. Como Acessar

```markdown
## Como acessar

- **[Tipo de acesso 1]:** [Rota/URL/método]
- **[Tipo de acesso 2]:** [Rota/URL/método]
- **[Tipo de acesso 3]:** [Arquivo/comando]

Exemplo:
- **UI Web:** Menu → "Separador CSV" → Formulário
- **API REST:** `POST http://localhost:8001/api/separador-csv/processar`
- **Swagger:** http://localhost:8001/docs
- **Arquivo Core:** `api/separador_csv_core.py`
```

---

### 5. Fluxo Principal (passo a passo)

```markdown
## Fluxo principal

1. **Passo 1:** Descrição resumida com ênfase no que usuário faz
   - Sub-detalhe se necessário

2. **Passo 2:** Próximo passo a passo
   - Incluir validações que acontecem
   - Descrever transformações de dados

3. **Resultado esperado:** Descrever brevemente o que sai
```

**Dicas:**
- Numerado, sequencial
- 5-8 passos no máximo (se > 8, quebrar em seções)
- Descrever FLUXO, não code details
- Mencionar validações e tratamentos de erro em alto nível

---

### 6. Entradas e Saídas

```markdown
## Entradas e saídas

### Entradas

- **Arquivos:**
  - Tipo/formato esperado
  - Tamanho máximo (se houver)

- **Payload (JSON):**
  [Exemplo de JSON com todos os campos]

- **Parâmetros:**
  - Campo obrigatório: descrição
  - Campo opcional (default: ...): descrição

### Saídas

- **Arquivos gerados:**
  [Estrutura de diretórios / arquivo listing]

- **Resposta HTTP (200):**
  [JSON de sucesso]

- **Resposta de erro (4xx/5xx):**
  [JSON de erro]
```

**Dicas:**
- JSON deve ser válido e executável (copiar/colar direto)
- Incluir comentário `// explicativo` se necessário
- Listar status HTTP esperados
- Descrever cada campo de resposta

---

### 7. Dependências e Conexões

```markdown
## Dependências e conexões

- **Serviços chamados:** [Nome](link) - breve descrição
- **Banco/tabelas:** `schema.tabela` - o quê é persistido
- **Fila/eventos:** `topic.nome` - eventos publicados/consumidos
- **Integrações externas:** (se houver, ex: API de email, SMS, etc.)

- **Bibliotecas Python:**
  - `pacote>=versao` - descrição do uso
```

**Dicas:**
- Se "Nenhum", explicitamente escrever "Nenhum (standalone)"
- Links devem ser backticks com path relativo `[../services/email.md]`
- Versões mínimas obrigatórias

---

### 8. Permissões e Segurança

```markdown
## Permissões e segurança

- **Quem pode usar (RBAC):**
  - Role X: escopo de acesso
  - Role Y: escopo de acesso

- **Dados sensíveis (LGPD):**
  - Campo A: nível de sensibilidade
  - Campo B: nível de sensibilidade
  - **Ação:** Como proteger (criptografia, retenção, acesso)

- **Auditoria/logs:**
  - Local do log: `/path/to/log`
  - Campos registrados: lista
  - Exemplo de linha de log: `YYYY-MM-DD HH:MM:SS | user=X | action=Y | status=Z`
```

**Dicas:**
- RBAC: quem tem acesso por role/grupo
- LGPD: que dados sensíveis são coletados e como proteger
- Auditoria: facilitar rastreabilidade para compliance

---

### 9. Configurações

```markdown
## Configurações

- **Variáveis de ambiente relevantes:**
  - `VAR_NAME` - default: value | descrição
  - `VAR_NAME2` - default: value | descrição

- **Feature flags:**
  - `FLAG_NAME` - habilitar/desabilitar recurso (default: true/false)
  - `FLAG_NAME2` - descrição (default: ...)
```

**Dicas:**
- Incluir defaults
- Indicar impacto de cada flag
- Cross-reference com deployment docs se aplicável

---

### 10. Observabilidade

```markdown
## Observabilidade

- **Logs:** 
  - Local: `/path/to/log`
  - Como filtrar: `grep "pattern" /path`
  - Formato: descrever (JSON, timestamp, fields)

- **Métricas úteis:**
  - `metrica_1_total` - counter
  - `metrica_2_segundos` - histograma
  - `metrica_3_bytes` - gauge

- **Tracing:**
  - Como seguir uma requisição
  - IDs únicos para correlação
```

**Dicas:**
- Nomes de métrica devem ser reais (não fictícios)
- Incluir exemplos de queries de filtro (grep, jq, Prometheus)
- Descrever onde ver métricas (logs, Prometheus, DataDog, etc.)

---

### 11. Runbook (Operação)

```markdown
## Runbook (operação)

### Reprocessar/repetir execução

[Passos shell/curl/API para re-rodar]

### Rollback/desfazer

[Como reverter se algo deu errado]

### Limites conhecidos

| Limite | Valor | Impacto |
|--------|-------|--------|
| Limite A | valor | o que acontece |
| Limite B | valor | o que acontece |
```

**Dicas:**
- Scripts devem ser copy-paste ready
- Incluir caminho absoluto para arquivos
- Indicar timeouts/problemas esperados

---

### 12. Troubleshooting

```markdown
## Troubleshooting

| Sintoma | Causa provável | Como resolver |
|---------|----------------|---------------|
| Erro A | Causa 1 | Verificar X, fazer Y |
| Erro B | Causa 2 | Alternativa Z |
```

**Dicas:**
- 3-5 linhas de erros comuns
- Sintoma: o que o usuário vê
- Causa: por quê acontece (raiz)
- Resolução: ações concretas (não genéricas)

---

### 13. Referências

```markdown
## Referências

- **Arquitetura:** [C2 Containers](../01-ARQUITETURA.md#secao)
- **Código:**
  - Principal: [path/to/file.py](../../path/to/file.py)
  - Helper: descrição | linhas XX-YY
  - Testes: [path/test_file.py](../../path/test_file.py)
- **Schema/Formato:** [schemas/arquivo.json](../schemas/arquivo.json)
- **Issues/PRs importantes:**
  - [#123 - Descrição](https://github.com/repo/issues/123)
  - [#456 - Descrição](https://github.com/repo/pull/456)
- **Changelog:** [CHANGELOG.md](../CHANGELOG.md#ferramenta)
```

**Dicas:**
- Links devem ser clickable (markdown links)
- Referenciar design docs/ADRs se existirem
- Incluir issues abertas relacionadas

---

### 14. Footer

```markdown
---

**Última atualização:** Mês Ano  
**Mantido por:** Squad/Pessoa  
**Próxima revisão:** Mês Ano  
**Versão da ferramenta:** X.Y.Z
```

---

## Exemplos Reais

Veja estes arquivos como referência de aplicação do template:

- [01-gerador-atas.md](01-gerador-atas.md) - exemplo completo
- [05-separador-csv-baixa.md](05-separador-csv-baixa.md) - exemplo com tabulação
- [04-separador-ferias-funcionario.md](04-separador-ferias-funcionario.md) - exemplo com fluxo complexo
- [06-excel-abas-pdf.md](06-excel-abas-pdf.md) - exemplo com dependências Windows

---

## Checklist para Novo Documento

- [ ] Cabeçalho: Tipo, Status, Owner, Local, Ambientes
- [ ] Objetivo: 1-2 parágrafos claros
- [ ] Quando usar: 2-6 casos de uso específicos
- [ ] Como acessar: todos os métodos (UI, API, CLI)
- [ ] Fluxo: 5-8 passos sequenciais
- [ ] Entradas/Saídas: JSON válido + exemplos
- [ ] Dependências: serviços, DB, filas, libs
- [ ] Permissões: RBAC + LGPD + auditoria
- [ ] Configurações: env vars + feature flags
- [ ] Observabilidade: logs, métricas, tracing
- [ ] Runbook: reprocess, rollback, limites
- [ ] Troubleshooting: 3-5 erros comuns
- [ ] Referências: código, schema, issues
- [ ] Footer: data, mantido por, próxima revisão

---

## Convenções de Estilo

### Formatação de Código

```markdown
- Caminhos absolutos: `/data/uploads/arquivo.csv`
- Variáveis ambiente: `$VARIAVEL` ou backticks `VAR_NAME`
- SQL queries: triplo backtick com linguagem `sql`
- Comandos: triplo backtick com linguagem `bash`
- JSON inline: backticks simples `{"key": "value"}`
```

### Títulos

- H1: `#` - Título principal (nome da ferramenta)
- H2: `##` - Seções principais (Objetivo, Fluxo, etc.)
- H3: `###` - Subsessões (Entradas, Saídas)
- H4: `####` - Raramente usado

### Ênfase

- **Negrito** `**texto**` - para termos importantes
- `código` - backticks para código/paths
- Links: `[texto](path)` - sempre com path relativo

### Listas

- Bullet points: `-` para listas não-ordenadas
- Numeração: `1. 2. 3.` para sequências
- Tabelas: pipe `| col1 | col2 |` para dados estruturados

---

## Atualização e Manutenção

- **Frequência:** Revisar a cada 3 meses ou quando houver mudanças na ferramenta
- **Responsável:** Squad owner da ferramenta
- **Checklist pré-commit:**
  - [ ] Sintaxe Markdown válida
  - [ ] Todos os links funcionam
  - [ ] Exemplos de JSON/SQL são válidos
  - [ ] URLs estão atualizadas
  - [ ] Data de atualização preenchida

---

**Última atualização deste template:** Fevereiro 2026  
**Autor:** Squad Arquitetura e Documentação
