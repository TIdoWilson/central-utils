# Acertos Lotes Internets

- **Slug:** `acertos-lotes-internets`
- **Grupo:** Geral
- **Página:** `/acertos-lotes-internets`
- **Permissão:** `tool:acertos-lotes-internets` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/acertos-lotes-internets`

## Resumo

Limpa o TXT de lançamentos removendo automaticamente os lançamentos de rendimentos, pagamentos, tarifas etc., gerando também um arquivo com as linhas excluídas.

## Contexto de uso

Envie o arquivo TXT de lotes de internet exportado do cliente e receba um arquivo ajustado, sem os lançamentos indesejados (L + H), além de um TXT separado com todas as linhas removidas para conferência.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `acertos-lotes-internets`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/acertos-lotes-internets`
- Healthcheck: `GET /api/acertos-lotes-internets/health`
- Operações: consultar o router em `src/routes/tools/acertos-lotes-internets.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/acertos-lotes-internets.html` e `public/js/acertos-lotes-internets.js`
- Router/API: `src/routes/tools/acertos-lotes-internets.routes.js`
