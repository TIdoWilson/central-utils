# Conciliador Cartao Wilson

- **Slug:** `conciliador-cartao-wilson`
- **Grupo:** Geral
- **Página:** `/conciliador-cartao-wilson`
- **Permissão:** `tool:conciliador-cartao-wilson` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/conciliador-cartao-wilson`

## Resumo

Envie os PDFs do Razão e do Financeiro e gere um Excel com casados e diferenças.

## Contexto de uso

Concilia por valor (com tolerância), janela de dias e similaridade do nome do cliente. Baixe o XLSX com abas CASADOS, DIF_SO_RAZAO, DIF_SO_FIN e RESUMO.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `conciliador-cartao-wilson`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/conciliador-cartao-wilson`
- Healthcheck: `GET /api/conciliador-cartao-wilson/health`
- Operações: consultar o router em `src/routes/tools/conciliador-cartao-wilson.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/conciliador-cartao-wilson.html` e `public/js/conciliador-cartao-wilson.js`
- Router/API: `src/routes/tools/conciliador-cartao-wilson.routes.js`
