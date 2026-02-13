# Ajuste Diario Gfbr C

## 1. Visão Geral

- **Slug:** `ajuste-diario-gfbr-c`
- **Grupo:** Geral
- **Página (rota):** `/ajuste-diario-gfbr-c`
- **API base:** `/api/ajuste-diario-gfbr-c`
- **Permissão RBAC:** `tool:ajuste-diario-gfbr-c` ou `tool:*` (ADMIN acessa)

Arruma lançamentos do grupo GFBR para importação correta do diário contábil.

## 2. Objetivo Operacional

- Envie o diário em Excel exportado do sistema GFBR e deixe o robô remover contas transitórias, separar estornos em uma aba própria e filtrar recebimentos e lançamentos indesejados, mantendo a formatação da planilha de origem.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/ajuste-diario-gfbr-c.html`
- **Script JS da ferramenta:** `public/js/ajuste-diario-gfbr-c.js`
- **Router Node:** `src/routes/tools/ajuste-diario-gfbr-c.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** `api/ajuste_diario_gfbr_core.py`

## 4. Rotas e Endpoints

- **Rota de página:** `/ajuste-diario-gfbr-c`;
- **Base de API esperada:** `/api/ajuste-diario-gfbr-c`;
- **Endpoints no router:**
  - `POST /processar`
  - `GET /download/ajustado/:id`
  - `GET /download/backup/:id`

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
