# Extrator ZIP/RAR

## 1. Visão Geral

- **Slug:** `extrator-zip-rar`
- **Grupo:** Geral
- **Página (rota):** `/extrator-zip-rar`
- **API base:** `/api/extrator-zip-rar`
- **Permissão RBAC:** `tool:extrator-zip-rar` ou `tool:*` (ADMIN acessa)

Envie um ou mais arquivos ZIP/RAR e receba um pacote único com todos os arquivos extraídos, inclusive compactados internos.

## 2. Objetivo Operacional

- A ferramenta varre todos os ZIPs e RARs enviados, abre compactados internos até 5 níveis de profundidade e grava os arquivos finais em uma pasta única, evitando duplicidades por nome e tamanho. No fim, você baixa um ZIP consolidado com todos os arquivos extraídos.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/extrator-zip-rar.html`
- **Script JS da ferramenta:** `public/js/extrator-zip-rar.js`
- **Router Node:** `src/routes/tools/extrator-zip-rar.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** `api/extrator_zip_rar_core.py`

## 4. Rotas e Endpoints

- **Rota de página:** `/extrator-zip-rar`;
- **Base de API esperada:** `/api/extrator-zip-rar`;
- **Endpoints no router:**
  - `POST /process`
  - `GET /download/:jobId`

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
