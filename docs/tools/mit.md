# MIT

- **Slug:** `mit`
- **Grupo:** Geral
- **Página:** `/mit`
- **Permissão:** `tool:mit` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/mit`

## Resumo

Envie o JSON do MIT direto para o Integra Contador / SERPRO.

## Contexto de uso

Faça upload do arquivo JSON gerado pelo IOB, caso seja sem movimento entregara o MIT e a DCTFWeb automaticamente. (Apenas com procuração para o CNPJ)

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `mit`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/mit`
- Healthcheck: `GET /api/mit/health`
- Operações: consultar o router em `src/routes/tools/mit.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/mit.html` e `public/js/mit.js`
- Router/API: `src/routes/tools/mit.routes.js`
