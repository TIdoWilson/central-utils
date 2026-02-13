# Balancete Transitorio

## 1. Visão Geral

- **Slug:** `balancete-transitorio`
- **Grupo:** Geral
- **Página (rota):** `/balancete-transitorio`
- **API base:** `/api/balancete-transitorio`
- **Permissão RBAC:** `tool:balancete-transitorio` ou `tool:*` (ADMIN acessa)

Concilia conta transitória da Werbran para localizar notas com diferença.

## 2. Objetivo Operacional

- CONCILIA CONTA TRANSITÓRIA DA WERBRAN PARA LOCALIZAÇÃO DAS NOTAS COM DIFERENÇA NOS LANÇAMENTOS
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/balancete-transitorio.html`
- **Script JS da ferramenta:** `public/js/balancete-transitorio.js`
- **Router Node:** `src/routes/tools/balancete-transitorio.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** _não foi identificado arquivo Python específico para este slug_

## 4. Rotas e Endpoints

- **Rota de página:** `/balancete-transitorio`;
- **Base de API esperada:** `/api/balancete-transitorio`;
- **Endpoints no router:**
  - `GET /jobs/:jobId`
  - `GET /jobs/:jobId/download`

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
