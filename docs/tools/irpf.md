# IRPF

- **Slug:** `irpf`
- **Grupo:** Geral
- **Página:** `/irpf`
- **Permissão:** `tool:irpf` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/irpf`

## Resumo

Automação da rotina "IRPF" dentro do portal.

## Contexto de uso

Esta ferramenta está catalogada no workspace v3.1 e segue autenticação, RBAC e auditoria padrão.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `irpf`.
- Chamada via API interna com token/cookie de sessão válido.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: _não exposta como página dinâmica_
- Healthcheck: `GET /api/irpf/health`
- Operações: consultar o router em `src/routes/tools/irpf.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `arquivo de página não encontrado` e `arquivo JS específico não encontrado`
- Router/API: `src/routes/tools/irpf.routes.js`
