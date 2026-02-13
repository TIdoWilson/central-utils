# Dimob

- **Slug:** `dimob`
- **Grupo:** Geral
- **Página:** `/dimob`
- **Permissão:** `tool:dimob` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/dimob`

## Resumo

Tabela de faturamento mensal via SPED e preparação para gerar o TXT de importação.

## Contexto de uso

Informe CNPJ/ano, anexe SPED(s) e veja o faturamento mensal. (Geração do arquivo DIMOB: próxima etapa.)

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `dimob`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/dimob`
- Healthcheck: `GET /api/dimob/health`
- Operações: consultar o router em `src/routes/tools/dimob.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/dimob.html` e `public/js/dimob.js`
- Router/API: `src/routes/tools/dimob.routes.js`
