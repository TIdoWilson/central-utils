# ECD Status

- **Slug:** `ecd-status`
- **Grupo:** Geral
- **Página:** `/ecd-status`
- **Permissão:** `tool:ecd-status` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/ecd-status`

## Resumo

Marque as empresas prontas para gerar ECD para que fiquem na fila do robô.

## Contexto de uso

Lista de empresas com marcação de Simples/Normal e necessidade de DFC. Após salvar, o registro fica gerado e bloqueado (somente ADMIN pode alterar).

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `ecd-status`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/ecd-status`
- Healthcheck: `GET /api/ecd-status/health`
- Operações: consultar o router em `src/routes/tools/ecd-status.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/ecd-status.html` e `public/js/ecd-status.js`
- Router/API: `src/routes/tools/ecd-status.routes.js`
