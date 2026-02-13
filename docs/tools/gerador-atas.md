# Gerador de Atas

## 1. Visão Geral

- **Slug:** `gerador-atas`
- **Grupo:** Geral
- **Página (rota):** `/gerador-atas`
- **API base:** `/api/gerador-atas`
- **Permissão RBAC:** `tool:gerador-atas` ou `tool:*` (ADMIN acessa)

Preencha os dados da empresa, lucros e sócios e gere atas societárias a partir de modelos Word.

## 2. Objetivo Operacional

- Escolha um modelo de ata em Word, informe os dados (NIRE, CNPJ, endereço, lucros por ano), cadastre as assinaturas dos sócios PF e PJ e baixe a ata pronta em formato .docx.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/gerador-atas.html`
- **Script JS da ferramenta:** `public/js/gerador-atas.js`
- **Router Node:** `src/routes/tools/gerador-atas.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** `api/gerador_atas_core.py`

## 4. Rotas e Endpoints

- **Rota de página:** `/gerador-atas`;
- **Base de API esperada:** `/api/gerador-atas`;
- **Endpoints no router:**
  - `GET /modelos`
  - `GET /modelos/:modeloId/campos`
  - `POST /gerar`
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
