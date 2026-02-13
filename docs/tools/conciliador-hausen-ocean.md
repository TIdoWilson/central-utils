# Conciliador Hausen Ocean

- **Slug:** `conciliador-hausen-ocean`
- **Grupo:** Geral
- **Página:** `/conciliador-hausen-ocean`
- **Permissão:** `tool:conciliador-hausen-ocean` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/conciliador-hausen-ocean`

## Resumo

Merge arquivos excel do DRE e Balancetes das duas empresas.

## Contexto de uso

Selecione se é DRE ou Balancete, envie dois arquivos Excel (Hausen e Ocean) e baixe o consolidado automaticamente.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `conciliador-hausen-ocean`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/conciliador-hausen-ocean`
- Healthcheck: `GET /api/conciliador-hausen-ocean/health`
- Operações: consultar o router em `src/routes/tools/conciliador-hausen-ocean.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/conciliador-hausen-ocean.html` e `public/js/conciliador-hausen-ocean.js`
- Router/API: `src/routes/tools/conciliador-hausen-ocean.routes.js`
