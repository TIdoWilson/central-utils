# SN

- **Slug:** `sn`
- **Grupo:** Geral
- **Página:** `/sn`
- **Permissão:** `tool:sn` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/sn`

## Resumo

Envie a declaração mensal sem movimento pelo Integra Contador.

## Contexto de uso

Serviço que transmite a declaração mensal do Simples Nacional de forma automatizada. (Apenas com procuração para o CNPJ).

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `sn`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/sn`
- Healthcheck: `GET /api/sn/health`
- Operações: consultar o router em `src/routes/tools/sn.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/sn.html` e `public/js/sn.js`
- Router/API: `src/routes/tools/sn.routes.js`
