# Acerto Lotes Toscan

- **Slug:** `acerto-lotes-toscan`
- **Grupo:** Geral
- **Página:** `/acerto-lotes-toscan`
- **Permissão:** `tool:acerto-lotes-toscan` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** _N/A_ (sem API dedicada)

## Resumo

Remove do TXT do Toscan os lançamentos cuja linha de histórico (H) está em branco, gerando um arquivo ajustado e um relatório das linhas excluídas.

## Contexto de uso

Envie o arquivo TXT de lançamentos gerado pelo Toscan. A ferramenta identifica pares de linhas L/H em que o histórico está em branco, remove esses lançamentos do arquivo principal e disponibiliza um arquivo separado com todas as linhas excluídas para conferência.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `acerto-lotes-toscan`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/acerto-lotes-toscan`
- Esta ferramenta opera primariamente via interface web (sem API dedicada catalogada).

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/acerto-lotes-toscan.html` e `public/js/acerto-lotes-toscan.js`
- Router/API: sem arquivo dedicado no catálogo atual.
