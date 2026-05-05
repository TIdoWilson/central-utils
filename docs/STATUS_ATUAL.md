# STATUS_ATUAL.md

Data de referencia: 2026-04-06

## Concluido recentemente
1. A fila exclusiva da CCT passou a acumular CNPJs enviados em intervalo curto antes de restaurar a fila automatica, evitando que o pedido anterior fique de fora da rodada imediata.
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
11. A lista de pendencias da `lotes-renasul` passou a consolidar por rubrica, sem repetir a mesma conta por centro de custo.
12. O preview da `lotes-renasul` passou a reparar caracteres corrompidos como `PRODU�AO`, e o salvamento de cadastros agora revalida o arquivo atual para refletir as linhas novas sem recarregar a pagina.
13. O quadro principal da `lotes-renasul` foi travado para respeitar a largura da tela, com limite reduzido para `1700px` e deslocamento de 180px para a esquerda para reduzir a margem visual sem causar overflow horizontal.
14. A navegacao por setas da `lotes-renasul` foi corrigida para nao referenciar DOM inexistente, e o salvamento passou a validar o retorno da API antes de anunciar sucesso.
15. O salvamento de pendencias da `lotes-renasul` passou a aplicar edicoes parciais na tela, revalidar com snapshot local e evitar logs de alteracao por celula, reduzindo ruido no painel.
16. O preview da `lotes-renasul` passou a separar pendencias de de/para de centros de custo sem classificacao, para que rubricas ja completadas deixem de aparecer na tabela principal de pendencias.
17. O salvamento manual da `lotes-renasul` passou a esperar qualquer auto-save anterior terminar antes de gravar o snapshot final, corrigindo a perda aparente de cadastros apos recarregar a pagina.
18. O salvamento/validacao da `lotes-renasul` passou a enviar apenas o payload editavel e o backend agora mescla esse patch com o config atual, evitando estourar o limite de body do Express com a configuracao completa.
19. A `lotes-renasul` ganhou regras de `historicoRegras` para mapear eventos por texto do nome, reduzindo pendencias de rubricas conhecidas como `ferias`, `13`, `inss` e `faltas`.
20. O service da `lotes-renasul` passou a recarregar o `config.json` quando o arquivo muda no disco, evitando dependencia de restart para ver regras novas.
21. O backend da `lotes-renasul` passou a converter automaticamente uploads `.xls` para `.xlsx` antes do parser Python, mitigando erros recorrentes de `Expected BOF record` em arquivos legados.
22. A `lotes-renasul` ganhou validacao da conversao `.xls -> .xlsx`, retry automatico com arquivo original quando a conversao vier vazia e bloqueio de sucesso falso para parse com `0 registros`/`0 centros`.
23. O fallback de `.xls` da `lotes-renasul` foi ajustado para conversao via Excel/COM (PowerShell) somente quando houver BOF/parse vazio, removendo dependencia de conversao Node que podia gerar `.xlsx` sem dados.
24. A rota da `lotes-renasul` passou a priorizar o processamento pela API Python (`PY_API_URL`) e usar parser local apenas como fallback de indisponibilidade, reduzindo divergencia entre ambientes de runtime.
25. O cadastro `de/para` da `lotes-renasul` agora e saneado no backend para remover rubricas duplicadas/triplicadas no `config.json`, consolidando `dePara` e `deParaRows` em uma linha por rubrica.
26. O parser da `lotes-renasul` passou a aplicar corretamente `historicoRegras` na validacao e no mapeamento por centro, reduzindo pendencias de eventos como `13` e `ferias`.
27. A `lotes-renasul` ganhou fallback de classificacao por nome do centro (`VENDAS`, `ADMINISTRATIVO`, `PRODUCAO`, etc.), eliminando bloqueios de `centro_nao_classificado` quando o numero nao esta na lista configurada.
28. O front da `lotes-renasul` passou a exigir `downloadUrl` no retorno de `Gerar TXT` e iniciar download automatico, evitando falso sucesso sem arquivo baixado.
29. O parser do `acerto-lotes-toscan` foi corrigido para tratar cada linha como string antes da comparacao, removendo o erro de processamento que bloqueava TXT válidos.

30. A `calculadora-icms-st` passou a usar o bundle local de XLSX em `/vendor/xlsx.full.min.js`, removendo a dependencia de CDN externo na exportacao.
31. `lotes-txt` e `acerto-lotes-toscan` passaram a ler TXT com fallback de UTF-8, Windows-1252 e Latin1 para evitar acentos quebrados na entrada e na saida.
32. O `conciliador-cartao-wilson` passou a reconstruir corretamente o nome do cliente no Razao, removendo o codigo numerico sem perder o resto do nome e melhorando o score de casamento.
33. O `conciliador-cartao-wilson` passou a comparar valor absoluto na conciliacao, corrigindo divergencias falsas quando o mesmo lancamento vinha com sinal oposto entre Razao e Financeiro.`r`n34. O `conciliador-cartao-wilson` passou a ignorar saldos de fechamento colados apos o lancamento no Razao, evitando capturar `Saldo Mês`/`Saldo Atual` como se fossem o valor do titulo.

35. A documentação pública do portal passou a ter pipeline dedicada no GitHub Actions para buildar o MkDocs e publicar automaticamente no Cloudflare Pages a cada push em `main`.

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
