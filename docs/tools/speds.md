# SPEDS

- **Slug:** `speds`
- **Grupo:** Fiscal
- **API Base:** `/api/speds`

## O que esta ferramenta faz
Descreva aqui em 2–5 linhas.

## Como acessar
- Página: `/<slug>` (rota dinâmica)
- Permissão: `tool:speds` ou `tool:*`
- Admin: sempre acessa (páginas admin são separadas)
- UI interna: layout padrão com sidebar e topbar global (injetada por `sidebar.js`)

## Endpoints (se aplicável)
- `GET /api/speds/health`
- `POST /api/speds/run` (CSRF obrigatório)

## Observações de segurança
- Mutações exigem `x-csrf-token`
- Nunca servir HTML por static; página deve ser acessada sem `.html`
- Não incluir botão local de logout na página (usar logout global da sidebar/topbar)
