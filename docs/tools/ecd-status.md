# ECD Status

## 1. Visão Geral

- **Slug:** `ecd-status`
- **Grupo:** Geral
- **Página (rota):** `/ecd-status`
- **API base:** `/api/ecd-status`
- **Permissão RBAC:** `tool:ecd-status` ou `tool:*` (ADMIN acessa)

Marque as empresas prontas para gerar ECD para que fiquem na fila do robô.

## 2. Objetivo Operacional

- Lista de empresas com marcação de Simples/Normal e necessidade de DFC. Após salvar, o registro fica gerado e bloqueado (somente ADMIN pode alterar).
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/ecd-status.html`
- **Script JS da ferramenta:** `public/js/ecd-status.js`
- **Router Node:** `src/routes/tools/ecd-status.routes.js`
- **Service Node:** `src/services/ecd-status.service.js`
- **Arquivos Python relacionados:** _não foi identificado arquivo Python específico para este slug_

## 4. Rotas e Endpoints

- **Rota de página:** `/ecd-status`;
- **Base de API esperada:** `/api/ecd-status`;
- **Endpoints no router:**
  - `GET /companies`
  - `POST /save`

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
