# Formatador Bernardina

- **Slug:** `formatador-bernardina`
- **Grupo:** Geral
- **Página:** `/formatador-bernardina`
- **Permissão:** `tool:formatador-bernardina` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/formatador-bernardina`

## Resumo

Envie os XLSX das filiais e gere o XLSM “AGRUPADA” pronto, com período validado e colunas na ordem correta.

## Contexto de uso

Faça upload do lote de .xlsx (IOB limpos). O portal identifica CNPJ/período, verifica filiais faltantes e gera um .xlsm final usando o template padrão (ou um template enviado).

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `formatador-bernardina`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/formatador-bernardina`
- Healthcheck: `GET /api/formatador-bernardina/health`
- Operações: consultar o router em `src/routes/tools/formatador-bernardina.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/formatador-bernardina.html` e `public/js/formatador-bernardina.js`
- Router/API: `src/routes/tools/formatador-bernardina.routes.js`
