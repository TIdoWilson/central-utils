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
- Permitir incluir novos CNPJs na fila automatica e disparar o processamento imediato do pedido feito no site.
- Abrir o historico completo em popup paginado com 10 linhas por pagina.
- Registrar usuario, status e detalhes no historico simples.
- Enviar e-mail automatico quando a rodada agendada localizar novas convencoes.

## Pastas Locais Utilizadas

- **JSONs das convencoes:** `data/cct/json`
- **DOCs das convencoes:** `data/cct/docs`
- **Fila automatica:** `data/cct/CNPJ.txt`
- **Fila pendente de execucao:** `data/cct/CNPJ_pendentes.txt`
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
- `CCT_AUTO_PENDING_QUEUE_ENABLED` controla o bootstrap da fila pendente no restart do Node (`1` por padrao).
- `CCT_MTE_HEADLESS` define modo de execucao do MTE (`1=headless`, `0=visivel`).
- `MTE_EVENT_TIMEOUT_MS`, `MTE_PROCESSING_TIMEOUT_MS`, `MTE_RESULTS_TIMEOUT_MS` e `MTE_SHORT_EVENT_TIMEOUT_MS` ajustam o tempo de espera do `MTE.py` (padrao maior que 30s para evitar timeout em ambiente lento).
- Se `CCT_SMTP_PASS` nao estiver definido, o backend tenta reaproveitar `EMAIL_PASS` para nao quebrar o fluxo atual.

## Comportamento de Atualizacao

- A listagem principal usa paginacao de 50 itens.
- O filtro por vigencia separa convencoes vigentes e nao vigentes.
- O botao `Historico completo` abre um modal com paginacao de 10 linhas.
- Ao incluir um CNPJ no site, ele entra em `CNPJ.txt`, registra o solicitante em `CNPJ_requisitantes.txt` e tambem entra em `CNPJ_pendentes.txt`.
- A execucao manual usa apenas um Chrome por vez e processa um CNPJ pendente por rodada.
- Se um novo CNPJ for incluido enquanto outro estiver em busca, ele fica na fila pendente e so inicia quando o Chrome anterior encerrar.
- Se `CNPJ_pendentes.txt` estiver vazio ou ausente no restart, o bootstrap pode rearmar a fila automaticamente a partir do conteudo atual de `CNPJ.txt`.
- Se o mesmo usuario incluir mais de um CNPJ em intervalo curto, a fila imediata acumula todos os pedidos antes do processamento e depois restaura a fila automatica original.
- O `MTE.py` continua sendo o motor de busca e o `LEITOR_CCT.py` faz o processamento final.
- O `LEITOR_CCT.py` agora roda logo apos cada CNPJ que gerar novos DOCs, sem esperar o fim da fila completa.
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
- O `MTE.py` baixa apenas DOCs de convencoes novas, encerra o Chrome ao terminar (sucesso ou erro, em modo headless ou visivel) e aguarda o `LEITOR_CCT.py` concluir a geracao dos JSONs.
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
- **Botao `Historico completo` ou `Incluir` sem acao no `/cct`:** sintoma: clique nao abre modal ou nao envia requisicao de CNPJ. Causa provavel: cache do navegador com JS antigo ou divergencia de endpoint (`/historico` vs `/history`, `/requisicoes` vs `/request`). Solucao: usar o front atualizado com fallback em ambos os endpoints e forcar recarga da pagina (`Ctrl+F5`).
- **Download indisponivel:** confirmar se o DOC existe em `data/cct/docs` com o mesmo nome-base do JSON.
- **Busca por CNPJ so funciona com pontuacao:** sintoma: digitar apenas os 14 digitos nao retorna a convencao, mas `00.000.000/0000-00` retorna. Causa provavel: o indice de busca estava guardando apenas a versao formatada do CNPJ em alguns registros. Solucao: o backend agora indexa a versao com e sem pontuacao e a busca textual aceita ambos os formatos.
- **CNPJ entra na fila, mas o JSON demora para aparecer:** sintoma: o CNPJ foi aceito pelo site e o download ocorreu, mas os JSONs ainda nao foram integrados na tela. Causa provavel: o `MTE.py` finalizava antes do `LEITOR_CCT.py` concluir quando o leitor era disparado em segundo plano. Solucao: executar o `LEITOR_CCT.py` de forma sincronizada no fluxo headless, consultando `GET /api/cct/status` para acompanhar o processamento ate o fim.
- **Rotina semanal nao disparou no horario esperado:** sintoma: segunda ou quarta-feira as `06:00` a fila completa nao iniciou. Causa provavel: servico Node reiniciado sem remontar o timer semanal ou `CCT_AUTO_FULL_QUEUE_ENABLED=0`. Solucao: consultar `GET /api/cct/status` para validar `nextFullQueueRunAt` e revisar a variavel de ambiente do servico.
- **Pedidos de CNPJ ficaram pendentes apos restart do Node:** sintoma: varios CNPJs foram incluidos no `/cct`, mas nao houve processamento depois de reiniciar servicos. Causa provavel: fila manual em `data/cct/CNPJ.txt` sem novo gatilho de execucao apos o restart. Solucao: manter `CCT_AUTO_PENDING_QUEUE_ENABLED=1` para bootstrap automatico da fila no boot e, para recuperar pendencias antigas, executar `npm run cct:recover:pending -- --date=YYYY-MM-DD` no servidor.
- **CNPJ valido retorna como problema de inclusao no `/cct`:** sintoma: um CNPJ conhecido, como `79147450000161`, nao entra como novo pedido e gera interpretacao de erro. Causa provavel: o CNPJ ja esta monitorado na fila/base local da CCT, entao nao deve ser tratado como novo. Solucao: o backend agora responde explicitamente quando o CNPJ ja esta cadastrado na base local e informa a quantidade de convencoes/alguns registros encontrados, em vez de deixar a leitura ambigua como se fosse invalidacao do numero.
- **Inclusao de CNPJ nao grava em `CNPJ.txt` e `CNPJ_requisitantes.txt`:** sintoma: o usuario informa um CNPJ no card da CCT, mas nada e persistido nas filas locais. Causa provavel: dependencia do boot completo da pagina para anexar o listener do formulario, deixando a inclusao inoperante quando o bootstrap falha ou atrasa. Solucao: manter `window.__cctSubmitRequest` disponivel no script e acionar a inclusao diretamente do HTML (`onsubmit`/`onclick`) como fallback imediato, preservando o bloqueio de dupla execucao via `requestInFlight`.
- **Mais de um Chrome abre ao mesmo tempo na CCT:** sintoma: uma nova requisicao dispara outro navegador antes do fim da consulta atual. Causa provavel: concorrencia entre pedidos novos e a rodada em andamento. Solucao: a CCT agora mantem somente um `MTE.py` ativo por vez e usa `data/cct/CNPJ_pendentes.txt` para enfileirar os proximos CNPJs, abrindo o Chrome seguinte apenas depois que o anterior fecha.
- **Novo CNPJ entra durante uma busca em andamento:** sintoma: o usuario inclui outro sindicato enquanto ainda ha download em execucao. Causa provavel: necessidade de preservar a ordem sem interromper o navegador atual. Solucao: o backend grava o novo CNPJ na base (`CNPJ.txt`), registra o solicitante (`CNPJ_requisitantes.txt`) e adiciona o numero em `CNPJ_pendentes.txt`; assim que a rodada atual termina, a proxima inicia automaticamente com um novo Chrome.
- **Chromes antigos foram fechados e a fila nao retomou com os CNPJs ja existentes no TXT:** sintoma: `CNPJ.txt` segue preenchido, mas `CNPJ_pendentes.txt` sumiu ou ficou vazio e nenhum novo Chrome abre. Causa provavel: a fila sequencial perdeu o arquivo pendente apos mudanca de logica ou encerramento manual do navegador. Solucao: rearmar `CNPJ_pendentes.txt` a partir do conteudo atual de `CNPJ.txt`; o bootstrap da CCT agora faz essa recuperacao automaticamente quando a fila pendente estiver vazia.
- **O CNPJ baixa DOC, mas o JSON so aparece muito depois ou so no fim da fila:** sintoma: o historico mostra `download realizado`, porem o `LEITOR_CCT.py` ainda nao transformou o DOC em JSON quando o usuario verifica a pasta. Causa provavel: o `MTE.py` acumulava todos os DOCs da rodada e so chamava o leitor quando terminava a fila inteira. Solucao: o `MTE.py` agora executa o `LEITOR_CCT.py` imediatamente apos cada CNPJ que baixar novos DOCs, acelerando a geracao dos JSONs sem esperar o restante da fila.
- **Dois CNPJs em sequencia curta deixam um pedido para tras:** sintoma: um usuario inclui dois CNPJs quase ao mesmo tempo e apenas o ultimo entra na consulta imediata. Causa provavel: a fila exclusiva era regravada com um unico item por pedido, sobrescrevendo a entrada anterior antes do start do processo. Solucao: a fila imediata agora acumula os CNPJs pendentes em memoria e regrava o TXT com todos eles ate a rodada exclusiva concluir.
- **CNPJ foi solicitado, mas nao trouxe convencoes e o historico mostra timeout de 30000ms:** sintoma: entradas com `erro na busca` e mensagem de timeout para `getConsultaAvancada` ou download, principalmente em carga alta. Causa provavel: tempo de espera fixo do Playwright insuficiente para o retorno do MTE. Solucao: usar o `MTE.py` com timeouts por ambiente (`MTE_EVENT_TIMEOUT_MS`, `MTE_PROCESSING_TIMEOUT_MS`, `MTE_RESULTS_TIMEOUT_MS`, `MTE_SHORT_EVENT_TIMEOUT_MS`) e aumentar esses valores no servidor quando necessario.
- **Chrome do MTE fica aberto no servidor apos o fim do ciclo:** sintoma: processo do navegador continua ativo apos terminar a busca ou apos erro. Causa provavel: encerrar apenas a conexao CDP ou o PID pai do launcher pode nao derrubar toda a arvore do Chrome for Testing no servidor. Solucao: usar o `MTE.py` atualizado, que no `finally` encerra a conexao CDP e mata a arvore completa do processo do navegador (`taskkill /T /F` no Windows ou `killpg` no Linux), removendo tambem o perfil temporario.
- **E-mail nao envia:** confirmar `CCT_SMTP_HOST`, `CCT_SMTP_PORT`, `CCT_SMTP_USER`, `CCT_SMTP_PASS` ou `EMAIL_PASS`, `CCT_SITE_URL` e se `data/cct/email.txt` tem destinatarios.
- **LEITOR_CCT termina com `UnicodeEncodeError` apos gerar os JSONs:** sintoma: o log `data/cct/logs/LEITOR_CCT_*.log` mostra os JSONs gerados, mas o processo fecha ao imprimir a saida da sincronizacao de banco. Causa provavel: `stdout`/`stderr` do Python herdaram codificacao Windows (`cp1252`) e nao conseguiam escrever caracteres fora desse mapa. Solucao: manter o `LEITOR_CCT.py` com `sys.stdout` e `sys.stderr` reconfigurados para `utf-8` com `errors='replace'` antes do processamento e repetir a rodada.
- **Rodada agendada gerou JSONs, mas nao houve confirmacao de email:** sintoma: a busca completa executa, os JSONs aparecem em `data/cct/json`, porem nenhum destinatario recebe a notificacao esperada. Causa provavel: a tentativa principal de envio retornou `sent:false` de forma silenciosa (ex.: SMTP desconfigurado ou lista vazia). Solucao: usar o fluxo agendado do Node (`startFullQueueRun`) e verificar os avisos `[CCT] E-mail ... nao enviado` no log; o backend agora tenta alertar `CCT_ERROR_RECIPIENT` quando a entrega principal falha.
