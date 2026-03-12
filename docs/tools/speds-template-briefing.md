# SPEDS - Briefing padrao para novo template

Use este formulario antes de iniciar qualquer script novo.

## 1) Identificacao
- `templateId`:
- `spedType` (`icms` | `contribuicoes` | `ecd` | `ecf`):
- Objetivo em 1 frase:
- Operacao principal (`insert` | `update` | `delete` | `mixed`):

## 2) Entradas e saida
- Arquivos obrigatorios (nome logico + extensoes):
- Arquivos opcionais:
- Pode receber multiplos arquivos no mesmo campo? (sim/nao):
- Formato final esperado (`txt` | `xlsx`):
- Nome esperado do arquivo final:

## 3) Regras de negocio
- Registros alvo:
- Campos que serao alterados:
- Criterio de selecao dos registros:
- Regras de prioridade/desempate:

## 4) Relacionamentos e integridade
- Pais e filhos obrigatorios:
- Referencias cruzadas obrigatorias:
- O que deve ser removido em cascata:
- O que deve bloquear e abortar:
- Totalizadores que precisam recalculo:

## 5) Dry-run e auditoria
- Quais mudancas devem aparecer no preview:
- Confirmacao obrigatoria antes de gravar? (sim/nao):
- Quais contadores devem sair no relatorio final:
- Validacao global de relacionamentos no artefato final (`globalRelationshipValidation`): (sim/nao)
- Arquivo de regras da validacao (`rulesFile`):
- Limite de inconsistencias detalhadas (`maxIssues`, default 200):

## 6) Testes de aceite
- Arquivo real de referencia (caminho):
- Arquivo de borda (caminho):
- Resultado esperado (criterios objetivos):
- Cenarios que devem falhar com erro explicito:
