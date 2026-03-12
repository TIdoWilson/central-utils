# LINEAR_PLAYBOOK.md - Governanca do projeto Central utilitarios

## Objetivo
Manter execucao tecnica e visao de produto sincronizadas entre:
1. documentacao oficial em `docs/`
2. projeto `Central utilitarios` no Linear

## Regra principal (obrigatoria)
Toda alteracao funcional, tecnica ou operacional deve atualizar no mesmo ciclo:
1. documentacao impactada (`docs/...`)
2. issue correspondente no Linear (status, descricao e evidencias)

Sem essa dupla atualizacao, a entrega nao e considerada concluida.

## Estrutura recomendada no Linear
1. Milestones por macroetapa (M1 a M4).
2. Uma issue-mae da fase ativa em `In Progress`.
3. Subissues executaveis em `Todo`.
4. Blocos historicos e erros mitigados em `Done`.

## Mapeamento de status
1. `Done`: item concluido com evidencia documental.
2. `In Progress`: frente ativa no ciclo atual.
3. `Todo`: pendencia pronta para execucao.
4. `Canceled`/`Duplicate`: somente com justificativa explicita.

## Classificacao minima por issue
Cada issue deve conter:
1. Titulo objetivo.
2. Contexto.
3. Evidencias (`docs/...` ou arquivos do projeto).
4. Escopo.
5. Milestone.
6. Labels.
7. Prioridade.
8. Assignee.
9. Due date (quando estiver aberta).

## Labels recomendadas
- `Docs Sync`
- `Roadmap`
- `Feature` ou `Improvement`
- `Bug`
- `Testing`
- `Operations`
- `Production Readiness`

## Fluxo por sessao de trabalho
1. Ler `AGENTS.md` e docs relevantes.
2. Identificar pendencia ativa.
3. Executar escopo minimo necessario.
4. Validar tecnicamente quando houver codigo.
5. Atualizar documentacao impactada.
6. Atualizar issue no Linear (status, evidencias, proximos passos).

## Criterio de encerramento
Uma frente so e encerrada quando houver coerencia entre:
1. estado real do codigo/operacao
2. registro nos docs
3. estado e descricao da issue no Linear
