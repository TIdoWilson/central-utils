# Importador de Recebimentos MADRE SCP

## 1. Visão Geral

- **Slug:** `importador-recebimentos-madre-scp`
- **Grupo:** Geral
- **Página (rota):** `/importador-recebimentos-madre-scp`
- **API base:** `/api/importador-recebimentos-madre-scp`
- **Permissão RBAC:** `tool:importador-recebimentos-madre-scp` ou `tool:*` (ADMIN acessa)

Concilia razão IOB considerando apenas históricos semelhantes.

## 2. Objetivo Operacional

- CONCILIA RAZÃO IOB - APENAS COM HISTORICOS SEMELHANTES
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/importador-recebimentos-madre-scp.html`
- **Script JS da ferramenta:** `public/js/importador-recebimentos-madre-scp.js`
- **Router Node:** `src/routes/tools/importador-recebimentos-madre-scp.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** `api/importador_recebimentos_madre_scp_core.py`

## 4. Rotas e Endpoints

- **Rota de página:** `/importador-recebimentos-madre-scp`;
- **Base de API esperada:** `/api/importador-recebimentos-madre-scp`;
- **Endpoints no router:**
  - `POST /upload`
  - `GET /download/:fileName`

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
