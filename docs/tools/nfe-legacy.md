# NFE Legacy

- **Slug:** `nfe-legacy`
- **Grupo:** Geral
- **Página:** `/nfe-legacy`
- **Permissão:** `tool:nfe-legacy` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/nfe-legacy`

## Resumo

Automação da rotina "NFE Legacy" dentro do portal.

## Contexto de uso

Esta ferramenta está catalogada no workspace v3.1 e segue autenticação, RBAC e auditoria padrão.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `nfe-legacy`.
- Chamada via API interna com token/cookie de sessão válido.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: _não exposta como página dinâmica_
- Healthcheck: `GET /api/nfe-legacy/health`
- Operações: consultar o router em `src/routes/tools/nfe-legacy.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `arquivo de página não encontrado` e `arquivo JS específico não encontrado`
- Router/API: `src/routes/tools/nfe-legacy.routes.js`
