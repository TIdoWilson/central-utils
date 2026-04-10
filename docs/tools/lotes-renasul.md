# Lotes Renasul

- **Slug:** `lotes-renasul`
- **Grupo:** Contabil
- **API Base:** `/api/lotes-renasul`

## O que esta ferramenta faz
Cadastro local de de/para e centros de custo para processar o resumo mensal da folha Renasul e gerar o TXT no layout IOB.

## Como acessar
- Pagina: `/lotes-renasul`
- Permissao: `tool:lotes-renasul` ou `tool:*`
- Interface: layout interno padrao com sidebar e topbar global

## Fluxo operacional
1. Ajuste os cadastros de `De/para` e `Centros de custo`.
2. Selecione o arquivo `.xls` da folha.
3. Clique em `Validar` para conferir se faltam contas.
4. Se nao houver pendencias, clique em `Gerar TXT`.
5. Se houver pendencias, preencha os campos diretamente na tabela de pendencias e clique em `Salvar cadastros`.

## Regras de processamento
- Usa apenas os quadros de resumo da folha.
- Ignora linhas informativas.
- Ignora linhas com `*` na coluna de valor.
- Mantem um preview separado de eventos localizados, pendencias e TXT.
- Os quadros de `Eventos localizados` e `Pendencias de de/para` ficam empilhados um sobre o outro.
- A lista de pendencias e consolidada por `rubrica`, ignorando repeticao por centro de custo.
- A tabela de `Pendencias de de/para` mostra apenas rubricas com conta faltando; centros de custo sem classificacao continuam visiveis no quadro de eventos localizados como bloqueio separado.
- O quadro principal respeita a largura da tela, fica limitado a `1700px`, foi deslocado 180px para a esquerda para reduzir a margem visual e os blocos internos usam `min-width: 0` para evitar overflow horizontal.
- O salvamento de pendencias passou a trabalhar com snapshot local: campos parciais podem ser aplicados na tela e a revalidacao usa imediatamente os dados editados, mesmo se a persistencia no servidor falhar.
- Os logs de cada tecla digitada nas pendencias foram removidos para reduzir ruido no painel de diagnostico.
- O botao `Salvar cadastros` agora espera qualquer auto-save em andamento terminar antes de gravar o estado final, evitando corrida entre edicao automatica e salvamento manual.
- O front envia apenas os campos editaveis no salvamento e na validacao, enquanto o backend mescla esses dados com o cadastro atual para evitar limite de payload e preservar os blocos grandes da configuracao.
- Regras de historico procurado podem ser cadastradas em `historicoRegras` para mapear eventos por texto do nome quando a rubrica ainda nao resolve sozinha.
- O service local recarrega automaticamente a configuracao quando o arquivo em disco muda, entao novas regras entram sem depender de restart manual.
- Uploads `.xls` agora tentam parse direto primeiro; quando houver erro de BOF/parse vazio, o backend faz fallback de conversao via Excel/COM (PowerShell) e reprocessa automaticamente o arquivo convertido.
- A rota Node da ferramenta agora prioriza a API Python (`PY_API_URL`) para processar o arquivo; o parser local por `spawn` ficou como fallback apenas quando a API estiver indisponivel.
- O `de/para` agora e saneado no backend em `load/save`: rubricas duplicadas sao consolidadas em uma linha (completando apenas campos faltantes), e `dePara`/`deParaRows` sao persistidos sem duplicidade.
- Regras em `historicoRegras` agora entram na validacao de pendencias e no mapeamento final mesmo quando a rubrica existir sem conta completa.
- Classificacao de centro de custo agora aceita fallback por nome do centro quando o numero nao estiver nos grupos configurados (`ADM`, `PRODUCAO`, `VENDAS`, `MARKETING`, etc.).
- Apos `Gerar TXT`, a tela agora dispara download automatico e trata ausencia de `downloadUrl` como erro explicito em vez de mostrar sucesso silencioso.

## Diagnostico recente
- Sintoma: `500` com erro de leitura do `.xls`, incluindo `Unsupported format, or corrupt file: Expected BOF record`.
- Causa provavel: o upload caia no leitor `xlrd`, que falhava nesse workbook especifico.
- Solucao aplicada: leitura do `.xls` passou a tentar `python-calamine` antes do `xlrd`, mantendo `COM`/`openpyxl` como fallback.
- Sintoma: o preview mostrava texto com caractere substituto, como `PRODU�AO`, e o salvamento de pendencias nao refletia as linhas novas logo depois do clique.
- Causa provavel: o front estava exibindo o texto bruto em alguns trechos e a acao de salvar nao revalidava o arquivo em seguida.
- Solucao aplicada: a tela passou a reparar os textos exibidos no preview e o botao `Salvar cadastros` agora grava o config e revalida o arquivo atual para atualizar a lista de pendencias.
- Sintoma: a navegacao por setas em algumas celulas disparava erro de runtime, e o fluxo de salvar podia anunciar sucesso mesmo quando o backend recusava a gravacao.
- Causa provavel: o helper de foco usava uma referencia indefinida no DOM e o fluxo de persistencia nao conferia o retorno da API antes de seguir.
- Solucao aplicada: a navegacao por teclado foi blindada contra referencia invalida e o salvamento agora confirma o resultado antes de marcar a operacao como concluida.
- Sintoma: o salvamento de pendencias travava o fluxo mesmo com preenchimento parcial e o log ficava poluido por mensagens de edicao por celula.
- Causa provavel: a revalidacao dependia da persistencia do servidor e os eventos de input registravam cada alteracao individualmente.
- Solucao aplicada: o botao `Salvar cadastros` passou a aplicar as edicoes na tela primeiro, revalidar com snapshot local e manter apenas um aviso resumido se a persistencia nao confirmar.
- Sintoma: a tabela de `Pendencias de de/para` continuava exibindo rubricas ja completadas quando o bloqueio vinha apenas de centro de custo sem classificacao.
- Causa provavel: a validacao consolidava pendencias de de/para e bloqueios de centro no mesmo conjunto de saida.
- Solucao aplicada: o preview de pendencias passou a separar os dois casos, deixando a tabela de de/para focada apenas em contas faltantes e os centros sem classificacao no preview de eventos.
- Sintoma: os cadastros podiam sumir apos recarregar a pagina mesmo depois do aviso de sucesso.
- Causa provavel: o salvamento manual podia disparar enquanto um auto-save anterior ainda estava em andamento, e o segundo envio acabava nao persistindo o estado final.
- Solucao aplicada: o fluxo manual agora espera o auto-save encerrar antes de salvar o snapshot final do `de/para`.
- Sintoma: o `PUT /config` podia nao gravar o cadastro completo quando a configuracao inteira passava do limite de body do Express.
- Causa provavel: o front estava enviando o config completo, incluindo blocos pesados, mesmo quando apenas `de/para` e centros de custo eram editados.
- Solucao aplicada: o envio foi reduzido para um payload enxuto e o backend passou a mesclar esse patch com o config atual antes de salvar.
- Sintoma: alguns eventos por texto, como `ferias`, `13`, `inss` e `faltas`, ainda podiam ficar como pendencia mesmo com as contas conhecidas.
- Causa provavel: a busca de conta usava apenas a rubrica exata e nao consultava regras por historico.
- Solucao aplicada: foram adicionadas regras em `historicoRegras` e o parser agora usa o nome do evento como fallback de mapeamento.
- Sintoma: regras novas gravadas no `config.json` podiam nao aparecer na pagina ate reiniciar o servidor.
- Causa provavel: a configuracao ficava cacheada em memoria sem verificar mudanca do arquivo no disco.
- Solucao aplicada: o service passou a comparar a data de modificacao do arquivo e recarregar a configuracao quando houver alteracao.
- Sintoma: alguns `.xls` continuavam falhando com `Expected BOF record` mesmo apos reinicio dos servicos.
- Causa provavel: o runtime Python ativo no servidor podia cair no `xlrd` para certos workbooks legados.
- Solucao aplicada: o backend Node passou a converter automaticamente `.xls` para `.xlsx` antes de acionar o parser, eliminando dependencia do caminho sensivel do `xlrd` nesse fluxo.
- Sintoma: apos o fallback inicial, alguns arquivos podiam retornar erro de BOF no `.xls` e alguns `.xlsx` podiam cair em parse vazio (`0 registros`/`0 centros`).
- Causa provavel: o parser Python no runtime ativo podia nao abrir corretamente determinados `.xls`, enquanto a conversao via engine Node nao era confiavel para alguns workbooks legados.
- Solucao aplicada: o fallback de `.xls` foi movido para conversao via Excel/COM (PowerShell) apenas quando necessario; mantido bloqueio de sucesso falso quando o parse retorna `0 registros` e `0 centros`.
- Sintoma: mesmo com reinicio, a tela podia manter BOF no `.xls` enquanto o parser local em `spawn` usava runtime Python diferente do `dev:py`, e em alguns cenarios o `.xlsx` voltava como sem lancamentos.
- Causa provavel: divergencia de ambiente Python entre o processo Node (spawn local) e a API FastAPI em execucao no servidor.
- Solucao aplicada: a rota `lotes-renasul` passou a chamar primeiro `POST /api/lotes-renasul/processar` no `PY_API_URL`; o fallback local so entra quando houver indisponibilidade de rede da API Python.
- Sintoma: varios `de/para` passaram a aparecer duplicados/triplicados (ex.: rubrica `1` com contas conflitantes), impactando a consistencia das validacoes.
- Causa provavel: configuracoes legadas com rubrica repetida ficaram persistidas no `config.json`, e o fluxo antigo nao consolidava duplicatas ao carregar/salvar.
- Solucao aplicada: o service passou a normalizar e consolidar `dePara` por rubrica durante `loadConfig` e `saveConfig`, preservando a linha com mais informacao e usando as demais apenas para completar campos vazios.
- Sintoma: regras de historico (`ferias`, `13`, `inss`, `faltas`) apareciam cadastradas no `config.json`, mas varias rubricas continuavam como pendencia.
- Causa provavel: a validacao marcava pendencia antes de aplicar fallback por historico, e o lookup por rubrica nao tentava historico quando a rubrica existia com conta incompleta.
- Solucao aplicada: o parser passou a avaliar mapeamento completo com fallback de historico e o `lookup_mapping` agora tenta historico quando a conta da rubrica nao atende o centro atual.
- Sintoma: validacao podia retornar `pendencias=0` e ainda bloquear geracao com `centro_nao_classificado` (ex.: `3 - VENDAS`).
- Causa provavel: classificacao de centro dependia apenas da lista numerica configurada e ignorava o nome do centro quando faltava numero no grupo.
- Solucao aplicada: `center_type_for` ganhou fallback por nome de centro, reduzindo bloqueio operacional quando o centro esta claro no texto mas ausente na lista numerica.
- Sintoma: ao clicar em `Gerar TXT`, a mensagem final indicava sucesso, mas o arquivo nao era baixado e parecia que nao tinha sido gerado.
- Causa provavel: fluxo de UI aceitava resposta sem `downloadUrl` e nao iniciava download automaticamente.
- Solucao aplicada: o front passou a exigir `downloadUrl` valido no sucesso de processamento e iniciar o download imediatamente, mantendo log claro quando o link nao vier na resposta.

## Observacoes
- Ferramenta `local-only`.
- O arquivo de configuracao fica em `data/lotes-renasul/config.json`.
- A geracao do TXT exige que o arquivo passe primeiro pela validacao.
- O salvamento de cadastros pode ser feito diretamente pela tabela de pendencias sem sair da tela principal.
