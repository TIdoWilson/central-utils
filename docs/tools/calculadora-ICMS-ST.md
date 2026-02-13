# Calculadora ICMS ST

- **Slug:** `calculadora-ICMS-ST`
- **Grupo:** Geral
- **Página:** `/calculadora-ICMS-ST`
- **Permissão:** `tool:calculadora-ICMS-ST` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** _N/A_ (sem API dedicada)

## Resumo

Automação da rotina "Calculadora ICMS ST" dentro do portal.

## Contexto de uso

Esta ferramenta está catalogada no workspace v3.1 e segue autenticação, RBAC e auditoria padrão.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `calculadora-ICMS-ST`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/calculadora-ICMS-ST`
- Esta ferramenta opera primariamente via interface web (sem API dedicada catalogada).

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/calculadora-ICMS-ST.html` e `public/js/calculadora-ICMS-ST.js`
- Router/API: sem arquivo dedicado no catálogo atual.
