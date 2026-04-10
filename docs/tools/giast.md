# GIAST

- **Slug:** `giast`
- **Grupo:** Declaracoes
- **API Base:** `/api/giast`
- **Classificacao operacional:** `vps-compatible`

## O que esta ferramenta faz
Ferramenta para gerar o TXT da declaracao GIA-ST no layout informado (`api/layouts/giast-layout.json`).

Fluxo principal:
- cadastro e manutencao de declarantes;
- cadastro de inscricoes estaduais por UF;
- importacao de SPED ICMS/IPI para autopreenchimento de inscricoes (0015), periodo (0000) e valores por UF (E300/E310);
- preenchimento de UF + vencimento + valor DIFAL + valor FCP + devolucoes/anulacoes + pagamentos antecipados;
- geracao do TXT apenas com registros A0 e A4 (EC 87/15), sem gerar A1/A2/A3.

## Como acessar
- Pagina: `/giast`
- Permissao: `tool:giast` ou `tool:*`

## Endpoints Node
- `GET /api/giast/health`
- `GET /api/giast/declarantes`
- `GET /api/giast/declarantes/:id`
- `POST /api/giast/declarantes` (CSRF)
- `PUT /api/giast/declarantes/:id` (CSRF)
- `DELETE /api/giast/declarantes/:id` (CSRF)
- `POST /api/giast/import-sped` (CSRF + upload de arquivo SPED)
- `POST /api/giast/generate-txt` (CSRF)

## Endpoint Python
- `POST /api/giast/gerar`

Arquivo principal do core:
- `api/giast_core.py`

## Banco de dados
Tabelas criadas automaticamente ao usar a ferramenta:
- `giast_declarants`
- `giast_declarant_state_regs`

## Observacoes de seguranca
- Mutacoes exigem `x-csrf-token`.
- Pagina segue rota limpa (`/giast`) sem acesso direto via `.html`.
- Auditoria registra criacao, edicao, exclusao e geracao de arquivo.

## Correcoes registradas
### Leitura do layout JSON falhando no Python
- **Sintoma:** erro `Unexpected UTF-8 BOM` ao gerar TXT.
- **Causa provavel:** arquivo `api/layouts/giast-layout.json` salvo com BOM UTF-8.
- **Solucao aplicada:** leitura do layout ajustada para `encoding=\"utf-8-sig\"` em `api/giast_core.py`.

### Dropdown de declarante e campos desalinhados na tela
- **Sintoma:** menu suspenso do declarante ficava encoberto e labels/campos apareciam centralizados.
- **Causa provavel:** estilos globais de `.nfe-input-file-label` (centralizados) aplicados sem override especifico da pagina.
- **Solucao aplicada:** overrides locais em `public/styles.css` para alinhamento a esquerda, `z-index` no seletor e `overflow` visivel no card.

### Fluxo visual da tela fora do esperado
- **Sintoma:** formulario de cadastro aparecia sempre, tabela de geracao aparecia sem declarante ativo e datas padrao divergiam do desejado.
- **Causa provavel:** comportamento inicial sem controle de estado por modo (`novo` x `selecionado`) e sem defaults de periodo/vencimento ajustados.
- **Solucao aplicada:** em `public/js/giast.js`, formulario de cadastro passa a abrir apenas no botao **Novo declarante**, secao de geracao fica oculta ate haver declarante selecionado, periodo padrao usa mes anterior e vencimento padrao usa dia 09 do mes atual.

### Navegacao por setas no teclado
- **Sintoma:** nao era possivel navegar entre campos usando setas.
- **Causa provavel:** ausenca de handler de navegacao por teclado no formulario/tabelas.
- **Solucao aplicada:** adicionado controlador de navegação por setas em `public/js/giast.js`, com deslocamento por linha/coluna nas tabelas e por sequencia de campos na tela.

### Dropdown de declarante cortado e acoes fora do layout esperado
- **Sintoma:** menu suspenso do declarante ficava limitado ao quadro, botao **Novo declarante** quebrava para baixo e acoes do topo nao seguiam o fluxo esperado.
- **Causa provavel:** combinacao de altura/espacamento do container do select com alinhamento antigo dos botoes e referencias de JS para botoes removidos.
- **Solucao aplicada:** ajuste do topo em `public/styles.css` (select com altura de botao, `overflow`/`z-index` corretos e acoes alinhadas a direita) e revisao de fluxo em `public/js/giast.js` (remocao do atualizar lista, inclusao de **Editar declarante** e exclusao movida para o painel de edicao).

### Dropdown do declarante ainda limitado por containers da pagina
- **Sintoma:** menu de selecao de declarante continuava sendo recortado por limites de cards/secoes.
- **Causa provavel:** comportamento do dropdown nativo do `select` dependente da pilha/containers da pagina.
- **Solucao aplicada:** substituido por dropdown em modo portal no front (`public/js/giast.js` + `public/styles.css`), com renderizacao em `document.body`, `position: fixed` e `z-index` elevado para sobrepor qualquer camada da tela.

### Botao salvar declarante parecia nao funcionar
- **Sintoma:** ao clicar em **Salvar declarante**, usuario nao via retorno e interpretava como falha de salvamento.
- **Causa provavel:** mensagens de status eram exibidas apenas na secao de geracao do TXT, que fica oculta durante o cadastro/edicao do declarante.
- **Solucao aplicada:** adicionada area de status no card de declarante (`public/giast.html`) e unificacao da exibicao de mensagens em `public/js/giast.js`, com estado visual de **Salvando declarante...** e bloqueio temporario do botao durante a requisicao.

### Salvamento bloqueado por inconsistencias nas inscricoes estaduais
- **Sintoma:** em alguns cenarios o salvamento do declarante retornava erro durante a gravacao das inscricoes por UF.
- **Causa provavel:** falha na etapa de persistencia das inscricoes estaduais interrompendo a transacao inteira de cadastro/edicao.
- **Solucao aplicada:** ajuste no backend (`src/routes/tools/giast.routes.js`) para persistencia `best-effort` das inscricoes estaduais com `SAVEPOINT`; o declarante passa a ser salvo mesmo se houver falha nas UFs, retornando apenas aviso para o front.

### Editor de declarante com largura excessiva
- **Sintoma:** campos do bloco **Editar declarante** e a area de inscricoes estaduais ocupavam largura ampla demais.
- **Causa provavel:** grids do editor configurados para ocupar 100% da largura do card em duas colunas amplas e tabela linear de UFs.
- **Solucao aplicada:** ajustes de layout em `public/styles.css` para limitar largura do editor e transformar inscricoes estaduais em grade compacta com 3 UFs por linha; front atualizado em `public/js/giast.js` + `public/giast.html`.

### Espacamento horizontal entre containers no editor
- **Sintoma:** distancia horizontal entre colunas/containers no editor de declarante estava desalinhada com o esperado visual.
- **Causa provavel:** `column-gap` reduzido nos grids de campos e inscricoes estaduais.
- **Solucao aplicada:** ajuste de `column-gap` em `public/styles.css` para `16px` nos grids `giast-declarant-grid` e `giast-ie-grid`.

### Valor FCP em branco bloqueando geracao
- **Sintoma:** ao deixar o campo de FCP vazio na grade de geracao, o sistema retornava `valor FCP invalido`.
- **Causa provavel:** validacao do front tratava campo vazio como invalido, em vez de assumir zero.
- **Solucao aplicada:** ajuste em `public/js/giast.js` e `src/services/giast.service.js` para considerar FCP vazio como `0,00` no payload e na validacao da API.

### Registro A0 com tamanho rejeitado no importador
- **Sintoma:** importador retornava `Linha X: A0 deveria conter 865 ou 1031 caracteres, mas contém 844`.
- **Causa provavel:** divergencia entre JSON e manual v3.1 no trecho final do A0 (campos 827-865: codigo entrega reservado, quantidades dos anexos e repasse por outros contribuintes).
- **Solucao aplicada:** alinhamento do `api/layouts/giast-layout.json` com o manual e ajuste do `api/giast_core.py` para montar explicitamente esses campos, gerando A0 base com 865 caracteres no layout aceito pelo GIA-ST 3.

### Totais EC 87/15 no A0 divergindo do somatorio do A4
- **Sintoma:** importador acusava divergencia entre `Total do ICMS Devido a UF de Destino`/`Total ICMS FCP` do A0 e a soma dos valores dos registros A4.
- **Causa provavel:** bloco opcional EC 87/15 do A0 nao estava sendo preenchido com os totais quando havia A4 com valores.
- **Solucao aplicada:** ajuste em `api/giast_core.py` para gerar A0 com 1031 posicoes quando houver definicao do bloco EC 87/15 no layout e preencher os campos de totalizacao (posicoes finais) com os valores do proprio A4.

### A0 cortado no caractere 865 e campos EC 87/15 incompletos
- **Sintoma:** importador sinalizava que a parte final do A0 (866-1031) nao estava sendo considerada corretamente e os totais do ICMS destino apareciam como `0,00`.
- **Causa provavel:** mapeamento incompleto entre front/Node/Python para os campos finais do EC 87/15 e regra de totalizacao do campo `total_icms_destino` divergente da validacao do GIA-ST 3.
- **Solucao aplicada:** adicao dos campos `valueDevolutions` e `valuePrepayments` na grade e no payload ponta a ponta (`public/giast.html`, `public/js/giast.js`, `src/services/giast.service.js`, `src/routes/tools/giast.routes.js`, `api/integra_api.py`) e ajuste no `api/giast_core.py` para manter `total_icms_destino` igual ao `valueIcms` (soma do A4), mantendo o A0 com 1031 posicoes quando o bloco EC 87/15 estiver definido.

### Geracao sem anexos A1/A2/A3
- **Sintoma:** necessidade operacional de enviar arquivo contendo apenas registro principal e anexo EC 87/15.
- **Causa provavel:** fluxo anterior ainda montava A1, A2 e A3 zerados.
- **Solucao aplicada:** ajuste no `api/giast_core.py` para gerar somente A0 e A4, com contadores de anexos I/II/III no A0 preenchidos com zero.

### Importacao de SPED para autopreenchimento da grade
- **Sintoma:** preenchimento manual recorrente de inscricoes estaduais, periodo de referencia e valores por UF no GIAST.
- **Causa provavel:** ausencia de leitura direta do SPED ICMS/IPI para aproveitar os registros ja apurados.
- **Solucao aplicada:** adicionado endpoint `POST /api/giast/import-sped` e fluxo no front (`public/giast.html` + `public/js/giast.js`) para:
  - ler `0015` (inscricoes por UF),
  - ler `0000` (mes/ano da apuracao),
  - ler `E300`/`E310` (valores de DIFAL/FCP/deducoes/deb_esp),
  - atualizar automaticamente inscricoes faltantes do declarante apenas quando existirem no `0015`,
  - manter as UFs importadas na grade e sinalizar quando estiverem sem inscricao pre-cadastrada e sem `0015` (sem criar inscricoes novas).

### Importacao exibindo UFs nao cadastradas e omitindo UFs cadastradas sem movimento
- **Sintoma:** apos importar SPED, a grade trazia UFs sem inscricao cadastrada e nao listava UFs cadastradas que estavam sem movimento.
- **Causa provavel:** a importacao retornava diretamente os resultados do `E300/E310` sem filtrar por inscricoes validas e sem completar a grade com UFs cadastradas zeradas.
- **Solucao aplicada:** ajuste no backend (`src/services/giast.service.js` + `src/routes/tools/giast.routes.js`) para:
  - ignorar UFs do SPED que nao possuem inscricao cadastrada e tambem nao existem no `0015`,
  - incluir automaticamente na grade todas as UFs cadastradas que nao vieram com movimento, com valores zerados, para permitir geracao completa do TXT.

### Data de assinatura permanecendo fixa em data antiga
- **Sintoma:** a data de assinatura da GIA permanecia em valor antigo (ex.: `09/03/2026`) em vez de atualizar diariamente.
- **Causa provavel:** a geracao do TXT priorizava a data persistida no cadastro do declarante (`signing_date`) quando existente.
- **Solucao aplicada:** ajuste no backend (`src/routes/tools/giast.routes.js`) para enviar sempre a data atual na assinatura (`signatureDate`), independente da data previamente salva no declarante.
