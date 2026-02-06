# 🚀 Guia Rápido - Template de Documentação

**Última atualização:** Fevereiro 2026  
**Para:** Documentadores, Desenvolvedores, Ops

---

## ⚡ TL;DR (Resumo Executivo)

### O que mudou?

✅ Antiga documentação: **superficial** (80-100 linhas)  
✅ Nova documentação: **operacional** (400-600 linhas)  
✅ Benefício: documenta TUDO (fluxo, config, ops, security, troubleshooting)

### Exemplos

Veja estes documentos já feitos:
- [01-gerador-atas.md](01-gerador-atas.md) ← Exemplo bom, bem estruturado
- [05-separador-csv-baixa.md](05-separador-csv-baixa.md) ← Com muitos detalhes operacionais
- [04-separador-ferias-funcionario.md](04-separador-ferias-funcionario.md) ← Com diagrama de fluxo
- [06-excel-abas-pdf.md](06-excel-abas-pdf.md) ← Com windows-specific notes

### Template Completo

👉 [TEMPLATE-GUIA-REFERENCIA.md](TEMPLATE-GUIA-REFERENCIA.md) — Guia COMPLETO com todas as seções

---

## 📋 Checklist Rápido (Para Documentar Nova Ferramenta)

```
PASSO 1: Copie template
- [ ] Copie [TEMPLATE-GUIA-REFERENCIA.md](TEMPLATE-GUIA-REFERENCIA.md)
- [ ] Renomeie para XX-seu-nome.md
- [ ] Abra em seu editor

PASSO 2: Preencha dados básicos (~5 min)
- [ ] Nome da ferramenta
- [ ] Tipo (UI/API/Job/Script)
- [ ] Status
- [ ] Owner (seu squad)
- [ ] Path no repo
- [ ] Ambientes

PASSO 3: Objetivo e scope (~10 min)
- [ ] 1-2 parágrafos: QUÊ faz + PARA QUEM
- [ ] Benefício (tempo, erro, conformidade)
- [ ] 2-6 casos de uso (quando usar)

PASSO 4: Como acessar (~10 min)
- [ ] UI web (se houver)
- [ ] API endpoint
- [ ] CLI/comando
- [ ] Arquivo core

PASSO 5: Fluxo técnico (~15 min)
- [ ] Leia código-fontedata
- [ ] Descreva 5-8 passos
- [ ] Inclua validações
- [ ] Descreva resultado

PASSO 6: Entradas/Saídas (~15 min)
- [ ] Exemplo JSON válido para entrada
- [ ] Parâmetros obrigatórios vs opcionais
- [ ] Exemplo resposta HTTP 200
- [ ] Exemplo resposta erro 4xx/5xx

PASSO 7: Dependências (~5 min)
- [ ] Serviços chamados (nomes + links)
- [ ] DBs/tabelas
- [ ] Filas/eventos
- [ ] Bibliotecas Python (versões)

PASSO 8: Segurança (~10 min)
- [ ] RBAC: quem pode usar (roles)
- [ ] LGPD: dados sensíveis + proteção
- [ ] Auditoria: logs + campos registrados

PASSO 9: Operação (~15 min)
- [ ] Env vars (nome, default, descrição)
- [ ] Feature flags
- [ ] Logs: path + como filtrar
- [ ] Métricas: nomes úteis
- [ ] Reprocess: passos copy-paste
- [ ] Rollback: como desfazer

PASSO 10: Troubleshooting (~10 min)
- [ ] 3-5 erros comuns
- [ ] Causa provável de cada um
- [ ] Como resolver (concreto, não genérico)

PASSO 11: Referências (~5 min)
- [ ] Links para código-fonte
- [ ] Issues/PRs relacionadas
- [ ] Schemas ou documentos relacionados

PASSO 12: Review (~5 min)
- [ ] Verifique todos os links
- [ ] Valide JSON/SQL (copy-paste)
- [ ] Português gramaticalmente correto
- [ ] Imagens/diagramas (se aplicável)

TOTAL: ~110 minutos para documentar 1 ferramenta
```

---

## 🎯 Seções Principais (Ordem Recomendada)

### Implementação Rápida

Se você **não tem muito tempo**, preencha **no mínimo**:

1. **Cabeçalho** (metadados) ⭐⭐⭐ ESSENCIAL
2. **Objetivo** ⭐⭐⭐ ESSENCIAL
3. **Como acessar** ⭐⭐ RECOMENDADO
4. **Fluxo principal** ⭐⭐ RECOMENDADO
5. **Entradas/Saídas** ⭐⭐ RECOMENDADO
6. **Troubleshooting** ⭐ LEGAL TER

**Se tiver mais tempo:**
7. Dependências
8. Permissões/Segurança
9. Configurações
10. Observabilidade
11. Runbook
12. Referências

---

## 🔧 Dicas Práticas

### Como coletar informações?

```bash
# 1. CÓDIGO-FONTE
# Abra o arquivo principal:
cat api/sua_ferramenta_core.py

# Ver imports (dependências):
grep "^import\|^from" api/sua_ferramenta_core.py

# Ver função principal:
grep "^def " api/sua_ferramenta_core.py

# 2. APIs
# Testar endpoint:
curl -X POST http://localhost:8001/api/sua-ferramenta/processar \
  -H "Content-Type: application/json" \
  -d '{}'

# 3. LOGS
# Ver log recentesRecibos:
tail -50 /var/log/central-utils/sua_ferramenta.log

# 4. PERMISSÕES
# Consultar RBAC em:
grep -r "sua_ferramenta" config/rbac.yaml

# 5. ENV VARS
# Ver arquivo .env ou função:
grep "sua_ferramenta\|SUA_FERRAMENTA" .env* api/*.py
```

### Como escrever bom Objetivo?

❌ **Ruim:**
"Processa arquivos de entrada e gera saída."

✅ **Bem:**
"Processa PDFs de férias consolidadas (todos funcionários) e gera arquivo individual por funcionário organizado por empresa. Reduz tempo de separação manual de ~2 horas para ~5 segundos. Beneficia: RH, controladoria, auditores."

### Como descrever Fluxo?

❌ **Ruim:**
"A função recebe um arquivo e processá-lo"

✅ **Bem:**
"1. Upload do PDF consolidado (até 100MB)
2. Extrai texto das primeiras 6 páginas
3. Detecta empresa via padrão 'EMPRESA : <nome>'
4. Processa blocos de 2 páginas (1 funcionário cada)
5. Extrai nome via 'NOME COMPLETO' ou padrão alternativo
6. Salva individualmente em pasta: FERIAS-[EMPRESA]/[LOTE]/FERIAS-[FUNC].pdf
7. Compacta em ZIP (compress DEFLATE)
8. Deleta PDFs individuais, libera espaço
9. Retorna ZIP + metadata

**Resultado esperado:** ZIP com árvore de ~7 PDFs, 2-5 MB, pronto para distribuição."

### Como estruturar JSON?

```json
{
  "campo_obrigatorio": "descrição",
  "campo_opcional_string": "valor padrão ou descrição",
  "campo_opcional_numero": 50,
  "objetos_aninhados": {
    "subfield": "valor"
  },
  "arrays": ["item1", "item2"],
  "valores_descritos_em_comentário": "Incluir range/enum nos comentários"
}
```

### Como criar bom Troubleshooting?

```markdown
| Sintoma | Causa provável | Como resolver |
|---------|----------------|---------------|
| "Erro X" | Usuário não tem permissão | Verificar role em RBAC: `SELECT role FROM users WHERE id=X` |
| "Timeout" | Arquivo muito grande (>100MB) | Dividir em partes menores (máximo 50MB) |
| "PDF vazio" | Formato não suportado | Converter primeiro para PDF padrão com aplicativo externo |
```

---

## 📚 Referências Rápidas

### Localizações Importantes

```markdown
📁 Documentação
/docs/api/               ← Aqui (ferramentas)
/docs/                   ← Config, deployment, etc

🔧 Código
/api/                    ← Python core modules
/public/                 ← Frontend (HTML/JS)
/src/                    ← Node.js server

📋 Config
.env                     ← Variáveis de ambiente
config/                  ← Arquivos de configuração
mkdocs.yml               ← Build da documentação
```

### Comandos Úteis

```bash
# Build da documentação
cd .../central-utils
mkdocs serve              # Acessa em http://localhost:8000

# Validação rápida
markdown-lint docs/api/*.md

# Ver arquivo atualizado
wc -l docs/api/seu-arq.md    # Contar linhas
```

### Links Frecuentes

- 📖 [Guia Completo do Template](TEMPLATE-GUIA-REFERENCIA.md)
- 📝 [Exemplo: Gerador de Atas](01-gerador-atas.md)
- 📝 [Exemplo: Separador CSV](05-separador-csv-baixa.md)
- 🗂️ [Índice de Ferramentas](00-INDICE.md)
- 🔝 [Início da documentação](../index.md)

---

## 🎓 Exemplos de Preenchimento

### Exemplo 1: Seção "Tipo"

```markdown
❌ Não:
> **Tipo:** Ferramenta

✅ Sim:
> **Tipo:** API / Job
```

### Exemplo 2: Seção "Objetivo"

```markdown
❌ Não:
## Objetivo
Processa dados.

✅ Sim:
## Objetivo
Processa arquivos Excel de baixa (cheques, transferências) e 
organiza em múltiplos CSVs por ano, com formatação contábil 
(dd/mm/yyyy, vírgula decimal). Reduz tempo manual deformatação 
de ~15 min para ~2 seg per arquivo. Beneficia: controladoria, 
auditoria externa, gestores financeiros.
```

### Exemplo 3: Seção "Quando usar"

```markdown
❌ Não:
## Quando usar
- Quando precisa processar arquivo

✅ Sim:
## Quando usar
- **Reconciliação diária:** preparar dados para conciliação bancária
- **Auditoria:** organizar movimentos por período/empresa
- **Integração ERP:** dados estruturados + formatados corretamente
- **Processamento em lote:** múltiplos arquivos com scheduler
- **Quando integrações falham:** fallback manual com baixa automática CSV
```

### Exemplo 4: Seção "Fluxo"

```markdown
❌ Não:
1. Receber arquivo
2. Processar
3. Retornar

✅ Sim:
1. **Upload do arquivo:**
   - Aceita: Excel (.xlsx, .xlsm) ou CSV
   - Aba padrão: "BAIXAS" (configurável)
   - Tamanho máximo: 25 MB

2. **Detecção de ano:**
   - Busca coluna "DATA EMISSÃO"
   - Extrai ano (AAAA) a partir de datas
   - Fallback: tenta coluna numérica 1900-2100

3. **Formatação contábil:**
   - Coluna C: converte para dd/mm/yyyy
   - Coluna G: ID para dd/mm/yyyy
   - Colunas F,H-N: formata como decimal com vírgula (1.234,56)

4. **Divisão em arquivos:**
   - Se > max_linhas (default: 50), cria partes
   - Nomeação: arquivo__AAAA__parte-01.csv

5. **Resultado:**
   - Lista de CSVs organizados
   - Resumo consolidado
   - Logs de processamento
```

---

## ❓ FAQ Rápido

### P: Quanto tempo leva documentar?
R: 1-2 horas para ferramenta média. Menos se tiver código bem estruturado/testado.

### P: Preciso documentar TUDO?
R: Não. Mínimo: seções 1, 2, 3, 4, 5. Máximo: tudo. Depende da complexidade.

### P: Cliente quer documentação mais curta?
R: Faça versão executiva (2-3 parágrafos) nas seções, versão longa em detalhes colapsáveis se for markdown interativo.

### P: E se a ferramenta não tiver API?
R: Adapte: "CLI command", "Job command", "Manual script", "Git hook", etc.

### P: Como manter versão antiga?
R: Deixe como `XX-nome-antigo.md` por 1-2 meses, depois archive em `/archive/`.

### P: Preciso fazer diagrama?
R: Não obrigaório, mas help! Use: flowchart, sequence diagram, UML. Markdown suporta via mermaid.

### P: Se tiver erro no doc?
R: Abra PR simples com correção. Não reescreva tudo.

### P: Quando atualizar documento?
R: Sempre que ferramenta mudar comportamento, ou quarterly review (Jan/Abr/Jul/Out).

---

## 📞 Ainda com dúvidas?

1. ✅ Veja seção correspondente em [TEMPLATE-GUIA-REFERENCIA.md](TEMPLATE-GUIA-REFERENCIA.md)
2. ✅ Compare com exemplo real em [01-gerador-atas.md](01-gerador-atas.md)
3. ✅ Contacte seu Squad Owner
4. ✅ Abra discussão em `#documentacao` no Slack

---

**Versão:** 1.0  
**Última revisão:** Fevereiro 2026  
**Mantido por:** Squad Arquitetura
