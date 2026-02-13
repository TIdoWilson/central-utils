# Tareffa Empresas Lote

- **Slug:** `tareffa-empresas-lote`
- **Grupo:** Geral
- **Página:** `/tareffa-empresas-lote`
- **Permissão:** `tool:tareffa-empresas-lote` ou `tool:*` (ADMIN sempre acessa)
- **API Base:** `/api/tareffa-empresas-lote`

## Resumo

Digite CNPJs em formato de planilha, auto-preencha por API e cadastre tudo no Tareffa com características e serviços.

## Contexto de uso

Tabela estilo planilha: CNPJ + dados. Ao cadastrar, o robô cria as empresas em lote no Tareffa, baixa os IDs, marca Regime/Atividades/Município/Estado e gera serviços automaticamente.

## Entradas esperadas

- Acesso autenticado no portal.
- Permissão RBAC para `tareffa-empresas-lote`.
- Uso da página interna com AuthClient.authFetch para chamadas protegidas.

## Saídas esperadas

- Resultado processado na própria interface ou via download.
- Registro em logs de auditoria sem interromper a requisição em caso de falha de log.

## Acesso e rotas

- Página: `/tareffa-empresas-lote`
- Healthcheck: `GET /api/tareffa-empresas-lote/health`
- Operações: consultar o router em `src/routes/tools/tareffa-empresas-lote.routes.js`

## Operação e troubleshooting rápido

- Validar se o usuário possui a permissão correta no RBAC.
- Em erro de API, inspecionar o endpoint no navegador (aba Network) e logs do serviço.
- Confirmar estrutura/encoding dos arquivos de entrada antes do processamento.

## Referências

- Catálogo: `src/core/tool-catalog.json`
- Front-end: `public/tareffa-empresas-lote.html` e `public/js/tareffa-empresas-lote.js`
- Router/API: `src/routes/tools/tareffa-empresas-lote.routes.js`
