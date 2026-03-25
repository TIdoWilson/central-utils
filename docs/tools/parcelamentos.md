# Parcelamentos de Impostos

- **Slug:** `parcelamentos`
- **Grupo:** Parcelamentos
- **API Base:** `/api/parcelamentos`

## O que esta ferramenta faz
Centraliza o cadastro e a visualizacao dos parcelamentos de impostos por empresa.
Cada registro guarda nome da empresa, CNPJ, tipo do parcelamento, numero, data de inicio,
indicacao de debito em conta e observacoes.
A tela principal exibe os registros em lista/tabela, agrupados por tipo de parcelamento.
A data de inicio continua existindo no cadastro/DB, mas nao aparece na tabela principal.
Os grupos exibidos na tela sao: `PERT 1124`, `PGFN`, `ICMS`, `SIMPLIFICADO`, `ICMS SC`, `1124`, `ITCMD`, `NÃO PREVIDENCIARIO`, `4308`, `PERTSN` e `RELPSN`.

## Regras principais
- O front-end so oferece visualizacao e inclusao de novos parcelamentos.
- A inclusao acontece por um botao `+ Novo parcelamento` posicionado no quadro `Parcelamentos cadastrados`, ao lado de `Atualizar lista`, e abre um modal de cadastro.
- A base tambem pode ser substituida por upload da planilha no botao `Importar planilha`, sem acesso manual ao banco.
- O quadro de regras do HUB foi removido para deixar a pagina mais objetiva.
- O campo `debito em conta` e definido apenas no cadastro inicial e nao existe edicao nesta versao.
- Na lista, `debito em conta` aparece apenas como etiqueta visual, sem checkbox.
- A listagem permite ordenar os registros clicando nos titulos das colunas.
- Os cadastros podem ser ajustados manualmente pelo botao `Editar`.
- A base usa o banco de dados do portal para consultas e futuras automacoes.
- A planilha `minha lista parcelamentos.xlsx` e importada no formato de exportacao; como ela nao possui data de inicio, o importador completa esse campo com a data atual para manter o cadastro valido.

## Como acessar
- Pagina: `/parcelamentos`
- Permissao: `tool:parcelamentos` ou `tool:*`
- Layout interno: `nfe-layout` com sidebar e topbar globais

## Endpoints
- `GET /api/parcelamentos/health`
- `GET /api/parcelamentos`
- `POST /api/parcelamentos` com CSRF
- `POST /api/parcelamentos/import-file` com CSRF e upload de planilha `.xlsx`/`.xls`

## Observacoes operacionais
- A pagina foi criada para servir como HUB de parcelamentos e pode receber integracoes futuras para busca de guias.
- O arquivo `LISTA PARCELAMENTOS.xlsx` da area de trabalho pode ser enviado direto pela pagina para substituir a base atual.
- A carga inicial pode ser preparada com `npm run parcelamentos:import`; o comando gera `data/parcelamentos/parcelamentos.import.json` e `data/parcelamentos/parcelamentos.import.sql`.
