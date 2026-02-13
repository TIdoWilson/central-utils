# Ajuste Diario Gfbr C

- **Slug:** `ajuste-diario-gfbr-c`
- **Grupo:** Geral
- **Página:** `/ajuste-diario-gfbr-c`
- **Permissão:** `tool:ajuste-diario-gfbr-c` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/ajuste-diario-gfbr-c`

## Resumo

Arruma lançamentos do grupo GFBR para importação correta do diário contábil.

## Contexto de uso

Envie o diário em Excel exportado do sistema GFBR e deixe o robô remover contas transitórias, separar estornos em uma aba própria e filtrar recebimentos e lançamentos indesejados, mantendo a formatação da planilha de origem.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `ajuste-diario-gfbr-c`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/ajuste-diario-gfbr-c`
- Healthcheck: `GET /api/ajuste-diario-gfbr-c/health`
- Operações: consultar o router em `src/routes/tools/ajuste-diario-gfbr-c.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/ajuste-diario-gfbr-c.html` e `public/js/ajuste-diario-gfbr-c.js`
- Router/API: `src/routes/tools/ajuste-diario-gfbr-c.routes.js`
