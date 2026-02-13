# PDF A

- **Slug:** `pdf-a`
- **Grupo:** Geral
- **Página:** `/pdf-a`
- **Permissão:** `tool:pdf-a` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/pdfa` (compatibilidade atual)

## Resumo

Converta arquivos para o padrão PDF/A.

## Contexto de uso

Envie um PDF (ou outro formato suportado) e receba a versão em PDF/A pronta para uso.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `pdf-a`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/pdf-a`
- API principal: `POST /api/pdfa/convert`
- Healthcheck: `GET /api/pdfa/health`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/pdf-a.html` e `public/js/pdfa.js`
- Router/API: `src/routes/tools/pdfa.routes.js`
