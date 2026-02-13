# NFE

- **Slug:** `nfe`
- **Grupo:** Geral
- **Página:** `/nfe`
- **Permissão:** `tool:nfe` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** _N/A_ (sem API dedicada)

## Resumo

Robô que consulta notas no Portal Nacional via extensão.

## Contexto de uso

Utilitário que usa a extensão NFe Helper para buscar as notas automaticamente.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `nfe`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/nfe`
- Esta ferramenta opera primariamente via interface web (sem API dedicada catalogada).

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/nfe.html` e `public/js/nfe.js`
- Router/API: sem arquivo dedicado no catálogo atual.
