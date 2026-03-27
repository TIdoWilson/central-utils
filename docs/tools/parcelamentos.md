# Parcelamentos de Impostos

- **Slug:** `parcelamentos`
- **Grupo:** Parcelamentos
- **API Base:** `/api/parcelamentos`

## O que esta ferramenta faz
Centraliza o cadastro e a visualização dos parcelamentos de impostos por empresa.
Cada registro guarda nome da empresa, CNPJ, tipo do parcelamento, número, data de início,
indicação de débito em conta e observações.

## Interface atual
- A inclusão de novos parcelamentos acontece por popup/modal.
- A listagem é exibida em tabelas agrupadas por tipo de parcelamento.
- As colunas da tabela podem ser ordenadas ao clicar nos títulos.
- A coluna de observações fica vazia quando não houver conteúdo.
- O campo `débito em conta` é definido apenas no cadastro inicial e não é alterado na edição.
- A data de início foi removida da listagem e permanece apenas no cadastro/edição.

## Grupos visuais
- `PERT 1124`
- `PGFN`
- `ICMS`
- `SIMPLIFICADO`
- `ICMS SC`
- `1124`
- `ITCMD`
- `NÃO PREVIDENCIARIO`
- `4308`
- `PERTSN`
- `RELPSN`

## Como acessar
- Página: `/parcelamentos`
- Permissão: `tool:parcelamentos` ou `tool:*`
- Layout interno: `nfe-layout` com sidebar e topbar globais

## Endpoints
- `GET /api/parcelamentos/health`
- `GET /api/parcelamentos`
- `POST /api/parcelamentos` com CSRF
- `PUT /api/parcelamentos/:id` com CSRF
- `POST /api/parcelamentos/import-file` com CSRF

## Operação
- O botão `Importar planilha` substitui toda a base atual pelos dados do arquivo Excel enviado.
- O botão `Editar` abre o mesmo popup em modo de alteração, mantendo o débito em conta travado.
- A importação aceita arquivos `.xlsx` e `.xls`.

## Troubleshooting rápido
- **401/403:** conferir sessão do usuário e permissão RBAC.
- **404 em endpoint:** validar rota no `router` e base URL consumida no JS.
- **422/400:** revisar campos obrigatórios, formato do CNPJ e data de início.
- **500:** inspecionar logs do Node e a resposta da importação.

## Observações operacionais
- Se os dados vierem de planilha, o importador normaliza o texto das observações e remove metadados de origem.
- A tela foi pensada como HUB de parcelamentos e pode receber automações futuras para busca de guias.
