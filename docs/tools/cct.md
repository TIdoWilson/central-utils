# Consulta CCT

## Visao Geral

- **Slug:** `cct`
- **Grupo:** Pessoal
- **Pagina:** `/cct`
- **API base:** `/api/cct`
- **Permissao RBAC:** `tool:cct` ou `tool:*` (ADMIN acessa)
- **Classificacao operacional:** `local-only`

Consulta convencoes coletivas por nome, vigencia, data-base, abrangencia e abrangencia territorial. A tela traz o card de pesquisa, o card de inclusao de CNPJ, a listagem paginada das convencoes, o detalhe expandido e o modal de historico completo. O historico recente nao e exibido no card; o acesso visivel e apenas pelo botao de historico completo. A listagem usa apenas os JSONs locais em `data/cct/json`.

## Objetivo Operacional

- Localizar rapidamente uma convencao por nome parcial, registro, vigencia, data-base, abrangencia ou abrangencia territorial.
- Exibir cards baseados no `prefixo` do JSON, com o numero do registro ao lado.
- Carregar 50 convencoes por pagina.
- Abrir o detalhe completo abaixo da lista ao clicar no card.
- Baixar a convencao completa pelo documento correspondente.
- Permitir incluir novos CNPJs na fila automatica e na fila imediata do site.
- Abrir o historico completo em popup paginado com 10 linhas por pagina.
- Registrar usuario, status e detalhes no historico simples.
- Enviar e-mail automatico quando a rodada agendada localizar novas convencoes.

## Pastas Locais Utilizadas

- **JSONs das convencoes:** `data/cct/json`
- **DOCs das convencoes:** `data/cct/docs`
- **Fila automatica:** `data/cct/CNPJ.txt`
- **Fila imediata do site:** `data/cct/CNPJ_requisitantes.txt`
- **Lista de destinatarios:** `data/cct/email.txt`
- **Historico simples:** `data/cct/historico_cct.log`
- **Script MTE:** `data/cct/MTE.py`
- **Script LEITOR:** `data/cct/LEITOR_CCT.py`

## Variaveis de Ambiente

- `CCT_SMTP_HOST`, `CCT_SMTP_PORT`, `CCT_SMTP_USER` e `CCT_SMTP_PASS` controlam o SMTP do alerta automatico.
- `CCT_EMAIL_FROM` define o remetente exibido no envio.
- `CCT_SITE_URL` define o link incluido nos e-mails gerados.
- `CCT_EMAIL_TO` e `CCT_EMAIL_CC` sao usados no script de teste de envio.
- `CCT_ERROR_RECIPIENT` recebe os erros do processo.
- Se `CCT_SMTP_PASS` nao estiver definido, o backend tenta reaproveitar `EMAIL_PASS` para nao quebrar o fluxo atual.

## Comportamento de Atualizacao

- A listagem principal usa paginacao de 50 itens.
- O filtro por vigencia separa convencoes vigentes e nao vigentes.
- O botao `Historico completo` abre um modal com paginacao de 10 linhas.
- Ao incluir um CNPJ no site, ele entra nas duas filas.
- O `MTE.py` continua sendo o motor de busca e o `LEITOR_CCT.py` faz o processamento final.
- O envio de e-mail usa os destinatarios do `data/cct/email.txt`.
- Os cards de pesquisa e requisicao usam blocos mais quadrados, com a pesquisa distribuida em 3 faixas de campos.
- Os cards superiores foram compactados para reduzir a altura da area inicial.
- Os cards superiores tambem foram estreitados e centralizados para ocupar menos largura na pagina.
- A tela `/cct` nao depende de `cct_conventions` nem de bootstrap em banco para carregar os cards.
- A listagem e carregada diretamente dos JSONs da pasta `data/cct/json`.
- O cache de listagem e mantido em memoria e e revalidado por manifest de arquivos.
- A checagem de mudanca usa `CCT_MANIFEST_CHECK_MS` (padrao: `5000` ms).
- O Node agenda uma rodada completa da CCT toda segunda-feira e quarta-feira as `06:00`.
- A rodada completa usa a lista integral de `data/cct/CNPJ.txt`.
- O `MTE.py` baixa apenas DOCs de convencoes novas, fecha o Chrome headless ao terminar as buscas e aguarda o `LEITOR_CCT.py` concluir a geracao dos JSONs.
- Quando a rodada localiza uma ou mais novas convencoes, o e-mail vai para a lista cadastrada em `data/cct/email.txt`.
- Quando a rodada nao localiza novas convencoes ou encontra erro, o alerta vai sempre para `contabil20@wilsonlopes.com.br`.

## Endpoints

- `GET /api/cct/health`
- `GET /api/cct/status`
- `GET /api/cct`
- `POST /api/cct/requisicoes`
- `GET /api/cct/historico`
- `GET /api/cct/:id`
- `GET /api/cct/:id/download`

## Troubleshooting Rapido

- **Tela voltou ao scaffold generico:** conferir se [public/cct.html](/W:/DOCUMENTOS%20ESCRITORIO%20INSTALACAO%20SISTEMA/central-utils/public/cct.html), [public/js/cct.js](/W:/DOCUMENTOS%20ESCRITORIO%20INSTALACAO%20SISTEMA/central-utils/public/js/cct.js), [src/routes/tools/cct.routes.js](/W:/DOCUMENTOS%20ESCRITORIO%20INSTALACAO%20SISTEMA/central-utils/src/routes/tools/cct.routes.js) e [src/services/cct.service.js](/W:/DOCUMENTOS%20ESCRITORIO%20INSTALACAO%20SISTEMA/central-utils/src/services/cct.service.js) estao carregando a versao restaurada.
- **Pagina CCT abre zerada:** sintoma: cards vazios mesmo com JSONs presentes em `data/cct/json`. Causa provavel: processo Node antigo/errado atendendo a porta 3000 com outro `public/js/cct.js`. Solucao: encerrar o PID da 3000, subir `npm run start` dentro deste workspace e validar que `http://127.0.0.1:3000/js/cct.js` bate com `public/js/cct.js`.
- **Filtro retorna `NetworkError when attempting to fetch resource`:** sintoma: filtro da tela falha de forma intermitente e a listagem demora para responder. Causa provavel: recarga completa dos JSONs em cache curto, estourando tempo de resposta em algumas requisicoes. Solucao: manter cache em memoria por periodo maior (padrao 12h via `CCT_CACHE_TTL_MS`) e evitar recargas concorrentes.
- **Primeiro carregamento ainda lento apos alterar muitos JSONs:** sintoma: primeira busca apos atualizacao de arquivos demora bem mais que as demais. Causa provavel: reconstrucao da cache em memoria a partir dos JSONs. Solucao: aguardar a primeira reconstrucao; as proximas consultas usam cache e ficam mais rapidas.
- **Novo JSON nao aparece na hora:** sintoma: arquivo novo foi salvo em `data/cct/json`, mas ainda nao entrou no total filtrado. Causa provavel: janela de checagem do manifest local. Solucao: reduzir `CCT_MANIFEST_CHECK_MS` (ex.: `1000`) ou aguardar o proximo ciclo; a atualizacao da cache e automatica.
- **Quadro de convencoes nao renderiza mesmo com API respondendo 200:** sintoma: pagina `/cct` abre, mas a grade nao aparece ou falha intermitente ao filtrar. Causa provavel: payload da listagem muito pesado (campos longos de abrangencia/territorio em lote de 50 itens). Solucao: reduzir payload da listagem com truncamento desses campos e limitar sindicatos no card; detalhes completos continuam no endpoint `GET /api/cct/:id`.
- **Quadro nao carrega apos erro de rede da sidebar:** sintoma: tela `/cct` abre, aparece `NetworkError` no console e a listagem nao inicia. Causa provavel: falha transitória no `inicializarSidebar()` interrompendo o `boot()` da CCT antes de chamar `loadResults()`. Solucao: tratar erro da sidebar isoladamente e continuar o carregamento da lista.
- **Necessario diagnosticar carregamento em tempo real:** sintoma: dificuldade para saber em qual etapa o quadro trava (boot, sidebar, API, render). Causa provavel: ausencia de telemetria visual na propria tela. Solucao: usar o painel `Log da Tela CCT` com eventos de boot, consulta `/api/cct`, status HTTP, tempo de resposta e erros globais.
- **Clique no card nao mostra detalhe imediatamente:** sintoma: ao selecionar convencao, o usuario nao percebe abertura do detalhe ate o retorno completo do endpoint. Causa provavel: painel de detalhe so era renderizado apos resposta final de `GET /api/cct/:id`. Solucao: renderizar estado imediato de carregamento no `cctDetailMount` e manter o detalhe fixo logo abaixo do grid.
- **Clausulas escapando para a direita:** sintoma: textos longos extrapolam a area visivel em layouts menores. Causa provavel: card vertical sem limite responsivo e sem quebra/truncamento controlado. Solucao: usar cards horizontais (`head` + `body`), `overflow-wrap:anywhere` e botao `Ver mais` quando o texto excede 5 linhas.
- **Muitos cards com status indisponivel:** sintoma: etiquetas de vigencia exibiam `Status indisponivel` mesmo com periodo preenchido. Causa provavel: parser de vigencia nao cobria formatos como `01º de ...` e `dd/mm/aaaa`. Solucao: ampliar parser para datas com ordinal e barras, recalcular status por periodo em tempo real e filtrar por base no dia atual.
- **Historico completo vazio:** verificar se houve execucao do MTE e se `data/cct/historico_cct.log` foi atualizado.
- **Download indisponivel:** confirmar se o DOC existe em `data/cct/docs` com o mesmo nome-base do JSON.
- **CNPJ entra na fila, mas o JSON demora para aparecer:** sintoma: o CNPJ foi aceito pelo site e o download ocorreu, mas os JSONs ainda nao foram integrados na tela. Causa provavel: o `MTE.py` finalizava antes do `LEITOR_CCT.py` concluir quando o leitor era disparado em segundo plano. Solucao: executar o `LEITOR_CCT.py` de forma sincronizada no fluxo headless, consultando `GET /api/cct/status` para acompanhar o processamento ate o fim.
- **Rotina semanal nao disparou no horario esperado:** sintoma: segunda ou quarta-feira as `06:00` a fila completa nao iniciou. Causa provavel: servico Node reiniciado sem remontar o timer semanal ou `CCT_AUTO_FULL_QUEUE_ENABLED=0`. Solucao: consultar `GET /api/cct/status` para validar `nextFullQueueRunAt` e revisar a variavel de ambiente do servico.
- **E-mail nao envia:** confirmar `CCT_SMTP_HOST`, `CCT_SMTP_PORT`, `CCT_SMTP_USER`, `CCT_SMTP_PASS` ou `EMAIL_PASS`, `CCT_SITE_URL` e se `data/cct/email.txt` tem destinatarios.
