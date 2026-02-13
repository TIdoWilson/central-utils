# Provisao DE Ferias

- **Slug:** `provisao-de-ferias`
- **Grupo:** Geral
- **Página:** `/provisao-de-ferias`
- **Permissão:** `tool:provisao-de-ferias` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** _N/A_ (sem API dedicada)

## Resumo

Automação da rotina "Provisao DE Ferias" dentro do portal.

## Contexto de uso

Esta ferramenta está catalogada no workspace v3.1 e segue autenticação, RBAC e auditoria padrão.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `provisao-de-ferias`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/provisao-de-ferias`
- Esta ferramenta opera primariamente via interface web (sem API dedicada catalogada).

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/provisao-de-ferias.html` e `public/js/provisao-de-ferias.js`
- Router/API: sem arquivo dedicado no catálogo atual.
