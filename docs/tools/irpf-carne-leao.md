# IRPF Carne Leao

- **Slug:** `irpf-carne-leao`
- **Grupo:** Geral
- **Página:** `/irpf-carne-leao`
- **Permissão:** `tool:irpf-carne-leao` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** _N/A_ (sem API dedicada)

## Resumo

Simule IR mensal com regras 2024, 2025 e 2026 (inclui redutor 2026).

## Contexto de uso

Informe rendimentos, despesas, dependentes e ajustes. A ferramenta calcula base, imposto devido e saldo a pagar/compensar em todos os períodos de tabela dos PDFs.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `irpf-carne-leao`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/irpf-carne-leao`
- Esta ferramenta opera primariamente via interface web (sem API dedicada catalogada).

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/irpf-carne-leao.html` e `public/js/irpf-carne-leao.js`
- Router/API: sem arquivo dedicado no catálogo atual.
