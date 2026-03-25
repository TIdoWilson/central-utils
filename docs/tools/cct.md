# Consulta CCT

## 1. Visao Geral

- **Slug:** `cct`
- **Grupo:** Pessoal
- **Pagina (rota):** `/cct`
- **API base:** `/api/cct`
- **Permissao RBAC:** `tool:cct` ou `tool:*` (ADMIN acessa)
- **Classificacao operacional:** `local-only`

Consulta convencoes coletivas com base principal em banco (`cct_conventions`), mantendo fallback para leitura local dos JSON quando a tabela ainda nao existir.
O detalhe continua na mesma pagina, com download do documento correspondente e paginacao de 50 registros por vez.
Tambem permite incluir novos CNPJs de sindicatos em fila para o processo automatizado do MTE e abrir o historico completo em modal.

## 2. Objetivo Operacional

- Localizar rapidamente uma convencao por nome parcial, vigencia, data-base, abrangencia ou abrangencia territorial.
- Localizar rapidamente uma convencao por nome parcial, CNPJ do sindicato, vigencia, data-base, abrangencia ou abrangencia territorial.
- Carregar a lista em paginas de 50 JSON para reduzir o volume inicial renderizado na tela.
- Abrir o conteudo detalhado logo abaixo da lista, sem trocar de pagina.
- O clique no item abre o detalhe; um segundo clique no mesmo item fecha o painel.
- Exibir dados principais, sumario de clausulas e clausulas resumidas.
- Exibir o titulo dos cards baseado no `prefixo` do JSON, como `Acordo Coletivo (numero_registro)` e `Convencao Coletiva (numero_registro)`.
- Exibir o sumario com numeracao curta, como `1ª`, `2ª` e assim por diante.
- Baixar a convencao completa pelo documento armazenado em pasta separada.
- Exibir um atalho flutuante para voltar ao topo quando houver rolagem.
- Exibir controles de paginacao no topo e no rodape da lista de convencoes.
- Ao trocar de pagina, alinhar a rolagem com o quadro de convencoes.
- Manter `CNPJ.txt` como base automatica permanente da busca, incluindo os CNPJs anteriores e os incluidos manualmente.
- Usar `CNPJ_requisitantes.txt` como fila de execucao imediata dos pedidos feitos pelo site.
- Quando um CNPJ for incluido manualmente pelo site, ele entra nas duas listas: fica salvo na base automatica e tambem entra na fila imediata do site.
- O codigo bloqueia escritas no `CNPJ.txt` fora do fluxo de inclusao do site; edicoes manuais continuam permitidas diretamente pelo ADM no arquivo.
- Se a fila do site ja tiver pendencias, o servico dispara o `MTE.py` ao subir e tambem reagenda o processamento mesmo quando o CNPJ ja estava pendente.
- Avisar quando o CNPJ informado ja existir na lista.
- Registrar um historico simples com os status `nao retornou nenhuma convencao`, `erro na busca` e `download realizado`.
- Exibir no historico o usuario que requisitou cada CNPJ.
- Abrir o `Historico completo` em popup paginado com 10 linhas por pagina, ordenado do mais recente para o mais antigo.

## 3. Pastas Locais Utilizadas

Por padrao, a ferramenta busca os arquivos nestes caminhos locais:

- **Arquivos da consulta:** `data/cct/json`
- **DOCs:** `data/cct/docs`
- **Fila de CNPJs:** `data/cct/CNPJ.txt`
- **Fila de requisitantes:** `data/cct/CNPJ_requisitantes.txt`
- **Lista de destinatarios de email:** `data/cct/email.txt`
- **Historico simples:** `data/cct/historico_cct.log`
- **Scripts locais:** `data/cct/MTE.py` e `data/cct/LEITOR_CCT.py` quando as copias locais estiverem disponiveis
- **Tabela de consulta:** `cct_conventions` (PostgreSQL)
- O historico grava `timestamp`, `cnpj`, `status`, `usuario` e `detalhes`, nessa ordem.

Sobrescritas opcionais por ambiente:

- `CCT_JSON_DIR`
- `CCT_DOC_DIR`
- `MTE_CNPJ_TXT_PATH`
- `MTE_DOWNLOAD_ROOT`
- `LEITOR_CCT_INPUT_DIR`
- `LEITOR_CCT_OUTPUT_DIR`
- `CCT_MTE_HEADLESS` (`1` para headless; vazio/`0` para headed)
- `CCT_NODE_BIN` (binario node para sync automatico no final do LEITOR)
- `CCT_SYNC_DB_COMMAND` (comando customizado de sync; se definido, substitui o padrao)
- `LEITOR_CCT_SYNC_DB` (`1` ativo por padrao; `0` para desativar sync automatico)
- `LEITOR_CCT_FAIL_ON_SYNC_ERROR` (`1` para retornar erro se o sync falhar)
- `CCT_AUTO_FULL_QUEUE_ENABLED` (`1` ativo por padrao; `0` desativa o agendamento automatico completo)
- `CCT_AUTO_FULL_QUEUE_HOUR` (hora local do servidor para execucao automatica; padrao `6`)
- `CCT_AUTO_FULL_QUEUE_MINUTE` (minuto da execucao automatica; padrao `0`)
- `CCT_AUTO_FULL_QUEUE_WEEKDAYS` (dias da semana, `0-6`, separados por virgula; padrao `1,3`)
- `CCT_SMTP_HOST` (padrao `smtp.example.invalid`)
- `CCT_SMTP_PORT` (padrao `465`)
- `CCT_SMTP_USER` (padrao `smtp-user@example.invalid`)
- `CCT_SMTP_PASS` (senha do SMTP)
- `CCT_EMAIL_FROM` (padrao o login do SMTP)
- `CCT_SITE_URL` (padrao `http://localhost:3000/cct`)

## 4. Comportamento de Atualizacao

- A API consulta primeiro a tabela `cct_conventions` (mais rapido para listas grandes).
- Se a tabela ainda nao existir, a API faz fallback para leitura dos arquivos em `data/cct/json`.
- Novos JSON podem entrar no banco sem reiniciar o site.
- Sem filtros, a listagem principal pagina em lotes de 50 registros.
- O servico usa cache curto em memoria para indice de documentos e fallback por arquivos, reduzindo latencia nas consultas seguintes.
- No fallback por arquivos, a listagem sem filtros carrega apenas a pagina atual (50 itens) e aquece o cache completo em segundo plano.
- O download procura o documento de mesmo nome-base do arquivo de origem.
- A busca principal retorna 50 JSON por pagina e respeita os filtros antes de paginar o resultado.
- Quando o usuario inclui um CNPJ, ele e gravado em `CNPJ.txt` sem disparar a base completa e tambem entra em `CNPJ_requisitantes.txt`, que e consumida em seguida por uma execucao imediata. Ao concluir, o item processado e removido da fila do site.
- O `MTE.py` continua responsavel por acionar o `LEITOR_CCT.py` ao final do processamento.
- Ao terminar, o `LEITOR_CCT.py` tambem executa automaticamente o sync `JSON -> banco`.
- O backend agenda automaticamente a busca completa de `CNPJ.txt` toda segunda e quarta as 06:00 (hora local do servidor), sem depender de requisicao manual.
- Ao final dessa execucao agendada, o sistema envia e-mail com as convencoes novas localizadas, se o SMTP estiver configurado e houver destinatarios no `data/cct/email.txt`.
- O historico simples continua sendo gravado nos logs de operacao, mas o card exibe apenas o botao para abrir o `Historico completo`.

Comandos operacionais:

- `npm run migrate` (cria tabela `cct_conventions`)
- `npm run cct:sync-db` (sincroniza JSON manualmente)
- `npm run cct:test-email` (envia um teste SMTP, se configurado)
- `npm run cct:schedule-test-run -- --date YYYY-MM-DD --time HH:mm` (agenda uma execucao Node pontual, sem Windows Task Scheduler)

## 5. Arquivos Relacionados

- **Pagina HTML:** `public/cct.html`
- **Script JS:** `public/js/cct.js`
- **Router Node:** `src/routes/tools/cct.routes.js`
- **Service Node:** `src/services/cct.service.js`
- **Service de fila:** `src/services/cct-intake.service.js`

## 6. Endpoints

- **GET** `/api/cct/health`
- **GET** `/api/cct`
- **POST** `/api/cct/requisicoes`
- **GET** `/api/cct/historico`
- **GET** `/api/cct/:id`
- **GET** `/api/cct/:id/download`

Filtros aceitos em `GET /api/cct`:

- `nome`
- `vigencia` (`todos`, `vigente`, `nao-vigente`)
- `dataBaseMes` (`01` a `12`)
- `abrangencia`
- `abrangenciaTerritorial`
- `page`
- `limit` (fixado em 50 no front, mas aceito pela API)

Parametros de historico em `GET /api/cct/historico`:

- `scope` (`recent` ou `full`)
- `page` (somente em `scope=full`)
- `limit` (maximo 50 em `scope=full`)

## 7. Troubleshooting Rapido

- **Lista vazia:** verificar se a pasta local existe e se os arquivos estao no formato esperado.
- **Lista vazia com JSON existentes:** verificar se a migration foi aplicada (`npm run migrate`) e se o sync foi executado (`npm run cct:sync-db`).
- **Sync falha no fim do LEITOR com `DATABASE_URL nao configurado`:** definir `DATABASE_URL` no ambiente do servico Node/script antes de executar `cct-sync-db`.
- **Pagina lenta no `/cct`:** se a mensagem da tela indicar `arquivos da pasta`, o endpoint esta em fallback sem banco; aplicar `npm run migrate` e `npm run cct:sync-db` para voltar ao modo `banco de dados`.
- **Primeira busca com filtro demora apos reinicio:** no fallback por arquivos, o cache completo ainda pode estar em aquecimento; as consultas seguintes ficam mais rapidas.
- **Agendamento automatico nao dispara no horario esperado:** confirmar timezone do servidor e as variaveis `CCT_AUTO_FULL_QUEUE_ENABLED`, `CCT_AUTO_FULL_QUEUE_HOUR`, `CCT_AUTO_FULL_QUEUE_MINUTE`, `CCT_AUTO_FULL_QUEUE_WEEKDAYS` (padrao: `1,3` para segunda e quarta).
- **E-mail nao envia ao fim da busca agendada:** confirmar `CCT_SMTP_HOST`, `CCT_SMTP_PORT`, `CCT_SMTP_USER` e `CCT_SMTP_PASS`; sem essas variaveis o envio fica desabilitado. Conferir tambem se `data/cct/email.txt` tem destinatarios validos.
- **E-mail da busca agendada nao chegou mesmo com convenções novas:** a rodada completa podia fazer rerun e recalcular o e-mail apenas a partir da ultima tentativa, ignorando as convencoes baixadas no inicio. A correcao passou a usar a data de inicio da primeira tentativa da rodada completa; reiniciar o Node aplica a mudanca.
- **Download indisponivel:** confirmar se o documento esta na pasta de convencoes com o mesmo nome-base do arquivo de origem.
- **Filtro por nome sem campo dedicado no arquivo:** a busca usa nome/titulo quando existir e, no fallback, registro, solicitacao, sindicatos e arquivo de origem.
- **Busca por CNPJ nao encontra resultado:** a pesquisa aceita CNPJ com ou sem pontuacao, barra ou hifen. Use apenas os numeros se preferir.
- **Busca por CNPJ traz varios resultados:** quando houver mais de uma convencao com o mesmo CNPJ, a lista prioriza a correspondencia exata antes dos demais acertos.
- **Clique no sumario nao rola para a clausula:** conferir se o resumo da convencao foi carregado e se a clausula aparece no painel de detalhes logo abaixo.
- **Faixa de tags desalinhada ou territorial muito longa:** as tags do card usam largura natural; se a abrangencia territorial for extensa, ela é cortada em uma unica linha para preservar a leitura.
- **Descricao dos sindicatos quebrando em telas menores:** o texto do card fica limitado a duas linhas para evitar estourar a caixa.
- **CNPJ repetido nao entra na fila do site:** o sistema normaliza apenas os 14 digitos e evita regravar o mesmo CNPJ em `CNPJ_requisitantes.txt`; se ele ja existir em `CNPJ.txt`, isso gera aviso mas nao impede a requisicao imediata.
- **Historico vazio:** o quadro de historico mostra apenas eventos capturados do `MTE.py`; se nao houver execucao recente, ele pode aparecer vazio.
- **Historico sem usuario:** conferir se a linha correspondente no `CNPJ_requisitantes.txt` foi gravada pelo fluxo novo; registros antigos podem nao ter o campo de usuario.
- **Popup do `Historico completo` abrindo sozinho ou sem fechar:** o backdrop do modal recebia `display: grid` via CSS e podia sobrescrever o atributo `hidden`. A correção foi adicionar a regra `.cct-modal-backdrop[hidden] { display: none !important; }`, mantendo o modal realmente oculto ate o clique no botao ou no fundo.
- **MTE nao dispara:** verificar se existe uma copia local de `MTE.py` em `data/cct` ou se o caminho legado configurado no servidor esta acessivel.
- **MTE nao dispara e o site nao acha o Python:** o servico agora tenta `CCT_PYTHON_BIN`, `PYTHON_BIN`, as instalacoes locais mais comuns do Windows e, por ultimo, `python`; se o ambiente do servico nao enxergar nenhum deles, o disparo nao inicia.
- **MTE nao dispara mesmo com fallback configurado:** o bootstrap antigo do `server.js` podia forcar `pythonBin: 'python'`, anulando a resolucao de caminhos absolutos do servico; agora ele repassa apenas variaveis de ambiente e deixa o fallback acontecer no `cct-intake.service`.
- **MTE.py retorna `WinError 2` no `CreateProcess`:** o Python abriu, mas nao encontrou executavel de navegador. O script agora resolve navegador por `MTE_BROWSER_BIN` (prioridade), depois Chromium do Playwright e, por fim, caminhos padrao de Chrome/Edge; se nada existir, ele gera erro orientativo.
- **Erro `[WinError 3] ... caminho especificado: 'W:\\'`:** havia dependencia de caminho absoluto de unidade mapeada no `MTE.py`/`LEITOR_CCT.py`. O padrao agora usa caminhos locais ao proprio `data/cct` (`CNPJ.txt`, `docs`, `json`) e aceita override por variaveis de ambiente.
- **Janela do navegador nao aparece no teste:** o disparo da fila pelo site esta em modo `headed` por padrao; se a execucao estiver em servico sem sessao interativa, ainda pode nao renderizar a janela. Para voltar ao modo invisivel use `CCT_MTE_HEADLESS=1`.
- **Fila do site nao processa e o script para em `wait_port`:** o `MTE.py` agora le apenas a primeira coluna de `CNPJ_requisitantes.txt` e a espera da porta de depuracao foi ampliada; antes, o tab e o usuario na mesma linha podiam invalidar a leitura e o timeout de 20s podia encerrar cedo demais.
- **Execucoes sucessivas travavam no navegador:** o `MTE.py` passava a reutilizar um perfil fixo e deixava o Chromium aberto no headless; agora o perfil e temporario por execucao e o navegador e encerrado ao final no modo headless.
- **CNPJ.txt nao atualiza pelo codigo:** o servico de fila so permite escrita com a origem interna autorizada do site; qualquer outra tentativa em codigo e bloqueada por seguranca.
