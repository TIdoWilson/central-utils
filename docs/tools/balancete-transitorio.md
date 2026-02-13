# Balancete Transitorio

- **Slug:** `balancete-transitorio`
- **Grupo:** Geral
- **Página:** `/balancete-transitorio`
- **Permissão:** `tool:balancete-transitorio` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/balancete-transitorio`

## Resumo

Concilia conta transitória da Werbran para localizar notas com diferença.

## Contexto de uso

CONCILIA CONTA TRANSITÓRIA DA WERBRAN PARA LOCALIZAÇÃO DAS NOTAS COM DIFERENÇA NOS LANÇAMENTOS

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `balancete-transitorio`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/balancete-transitorio`
- Healthcheck: `GET /api/balancete-transitorio/health`
- Operações: consultar o router em `src/routes/tools/balancete-transitorio.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/balancete-transitorio.html` e `public/js/balancete-transitorio.js`
- Router/API: `src/routes/tools/balancete-transitorio.routes.js`
