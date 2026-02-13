# Conciliador Cartao Wilson

## 1. Visão Geral

- **Slug:** `conciliador-cartao-wilson`
- **Grupo:** Geral
- **Página (rota):** `/conciliador-cartao-wilson`
- **API base:** `/api/conciliador-cartao-wilson`
- **Permissão RBAC:** `tool:conciliador-cartao-wilson` ou `tool:*` (ADMIN acessa)

Envie os PDFs do Razão e do Financeiro e gere um Excel com casados e diferenças.

## 2. Objetivo Operacional

- Concilia por valor (com tolerância), janela de dias e similaridade do nome do cliente. Baixe o XLSX com abas CASADOS, DIF_SO_RAZAO, DIF_SO_FIN e RESUMO.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/conciliador-cartao-wilson.html`
- **Script JS da ferramenta:** `public/js/conciliador-cartao-wilson.js`
- **Router Node:** `src/routes/tools/conciliador-cartao-wilson.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** `api/conciliador_cartao_wilson_core.py`

## 4. Rotas e Endpoints

- **Rota de página:** `/conciliador-cartao-wilson`;
- **Base de API esperada:** `/api/conciliador-cartao-wilson`;
- **Endpoints no router:**
  - `POST /process`

## 5. Fluxo Técnico (Página -> Node -> Python/Serviço)

- Front-end coleta parâmetros/arquivos e chama APIs internas (preferência por `AuthClient.authFetch`).
- Router valida entrada, aplica segurança (CSRF em mutações quando aplicável) e orquestra o processamento.
- Service concentra regra de negócio, integração com armazenamento e chamadas a serviços externos/Python.
- Retorno padronizado em JSON e/ou arquivo para download.

## 6. Segurança e Governança

- Exige autenticação ativa no portal.
- RBAC por ferramenta (`tool:<slug>`, `tool:*`, ADMIN).
- Em mutações, usar token CSRF via header `x-csrf-token` (exceto login).
- `auditLog` deve registrar evento sem interromper a requisição em falhas de auditoria.

## 7. Entradas e Saídas Esperadas

- **Entradas:** parâmetros de formulário e/ou upload conforme UI da ferramenta.
- **Saídas:** resposta em tela e, quando aplicável, artefatos (ZIP/PDF/XLSX/CSV/JSON).
- **Observação:** validar encoding, formato e tamanho dos arquivos para evitar erro 400/422.

## 8. Troubleshooting Rápido

- **401/403:** conferir sessão do usuário e permissão RBAC.
- **404 em endpoint:** validar rota no `router` e base URL consumida no JS.
- **422/400:** revisar campos obrigatórios e estrutura do arquivo enviado.
- **500:** inspecionar logs do Node e, quando existir, logs do processamento Python.

## 9. Observações de Manutenção

- Ao alterar nomes de arquivo/rota, manter compatibilidade (alias/redirect) para não quebrar links legados.
- Se incluir nova API/fluxo, atualizar este documento e `src/core/tool-catalog.json`.
