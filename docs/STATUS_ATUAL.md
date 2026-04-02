# STATUS_ATUAL.md

Data de referencia: 2026-04-02

## Concluido recentemente
1. Projeto `Central utilitarios` estruturado no Linear com resumo, descricao, lead, prioridade, datas e milestones.
2. Backlog inicial criado no Linear com historico de entregas concluidas e erros mitigados.
3. Fase ativa registrada no Linear com issue-mae em `In Progress` e subtarefas em `Todo`.
4. Documento de governanca do Linear criado em `docs/LINEAR_PLAYBOOK.md`.
5. Regras de sincronizacao docs + Linear adicionadas ao fluxo do projeto.
6. `parcelamentos` restaurado para a versao com modal de cadastro, tabelas agrupadas, importacao por planilha e edicao manual sem alterar debito em conta.
7. GFBR alinhado novamente apos a perda de atualizacao, com upload de arquivos e contrato da API Python ajustado.
8. `lotes-renasul` restaurado com tela interna, validacao antes da geracao, preview de eventos e pendencias, e integracao com o resumo da folha Renasul.
9. Leitura do `.xls` da `lotes-renasul` reforcada com `python-calamine` para evitar falhas de `xlrd` em arquivos OLE2 validos.
10. `lotes-renasul` ganhou pendencias editaveis com botao `Salvar cadastros` e o quadro de cadastros voltou para dentro da area principal.

## Estado tecnico atual
- Arquitetura multicamadas consolidada (Node.js, Python/FastAPI, PostgreSQL e filesystem).
- Catalogo operacional de ferramentas ativo e documentado (`docs/UI_MAP.md`, `docs/tools/index.md`).
- Runbooks de diagnostico e operacao disponiveis para ferramentas criticas.
- Fluxo de deploy VPS documentado com checks de release e migrations.
- Correcoes relevantes registradas nos docs de ferramentas, incluindo `SPEDS` e `Lotes Renasul`.

## Pendencias ativas (Linear)
1. `WIL-52` - implementar endpoint real da API do Conciliador Hausen Ocean.
2. `WIL-53` - estruturar suite minima de testes automatizados.
3. `WIL-55` - implantar pipeline CI/CD com gates de seguranca.
4. `WIL-54` - revisar templates SPEDS com fallback e planejar cobertura completa.

## Proximo passo recomendado
1. Executar `WIL-52` para eliminar o 404 operacional do `conciliador-hausen-ocean`.
2. Definir baseline de testes para `WIL-53` e amarrar esse baseline no pipeline de `WIL-55`.
3. Fechar inventario de templates SPEDS com fallback para `WIL-54` e priorizar execucao real por risco operacional.
