# Conciliador Hausen Ocean

## 1. Visão Geral

- **Slug:** `conciliador-hausen-ocean`
- **Grupo:** Geral
- **Página (rota):** `/conciliador-hausen-ocean`
- **API base:** `/api/conciliador-hausen-ocean`
- **Permissão RBAC:** `tool:conciliador-hausen-ocean` ou `tool:*` (ADMIN acessa)

Concilia dois arquivos Excel (Hausen e Ocean) para gerar consolidado por tipo (`dre`/`balancete`).

## 2. Objetivo Operacional

- Selecione se é DRE ou Balancete, envie dois arquivos Excel (Hausen e Ocean) e baixe o consolidado automaticamente.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/conciliador-hausen-ocean.html`
- **Script JS da ferramenta:** `public/js/conciliador-hausen-ocean.js`
- **Router Node:** `src/routes/tools/conciliador-hausen-ocean.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Go/C# relacionados:** _não encontrados no backend atual para este slug_

## 4. Rotas e Endpoints

- **Rota de página:** `/conciliador-hausen-ocean`;
- **Base de API esperada:** `/api/conciliador-hausen-ocean`;
- **Estado atual do router:** arquivo existe, mas retorna `express.Router()` vazio.
- **Fluxo esperado pelo front:** `POST /api/conciliador-hausen-ocean/processar`.

## 5. Fluxo Técnico Atual (Importante)

1. Front coleta `tipo` (`dre` ou `balancete`) + 2 arquivos.
2. Front chama `POST /api/conciliador-hausen-ocean/processar` com CSRF.
3. Backend montado em `src/server.js` não expõe esse endpoint hoje.
4. Resultado prático atual: retorno `404` para processamento.

Conclusão: a página está publicada, mas a API da ferramenta está pendente de implementação.

## 6. Segurança e Governança

- Exige autenticação ativa no portal.
- RBAC por ferramenta (`tool:<slug>`, `tool:*`, ADMIN).
- Em mutações, usar token CSRF via header `x-csrf-token` (exceto login).
- `auditLog` deve registrar evento sem interromper a requisição em falhas de auditoria.

## 7. Entradas e Saídas Esperadas

- **Entradas:** parâmetros de formulário e/ou upload conforme UI da ferramenta.
- **Saídas:** resposta em tela e, quando aplicável, artefatos (ZIP/PDF/XLSX/CSV/JSON).
- **Observação:** validar encoding, formato e tamanho dos arquivos para evitar erro 400/422.

## 8. Troubleshooting Real do Estado Atual

- **401/403:** conferir sessão do usuário e permissão RBAC.
- **404 em `/processar`:** comportamento esperado no estado atual, pois o router está vazio.
- **Erro de download não iniciar:** consequência do `POST` não implementado.
- **Ação necessária:** implementar endpoint no router e registrar runtime real (Node/Python/Go/C#) após definição técnica.

## 9. Observações de Manutenção

- Ao alterar nomes de arquivo/rota, manter compatibilidade (alias/redirect) para não quebrar links legados.
- Se incluir nova API/fluxo, atualizar este documento e `src/core/tool-catalog.json`.
- Se esta ferramenta passar a usar Go ou C#, documentar no mesmo padrão aplicado em `formatador-bernardina` e ferramentas similares com fluxos externos.
