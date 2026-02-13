# Separador CSV - Baixa Automática

## 1. Visão Geral

- **Slug:** `separador-csv-baixa-automatica`
- **Grupo:** Geral
- **Página (rota):** `/separador-csv-baixa-automatica`
- **API base:** `/api/separador-csv-baixa-automatica`
- **Permissão RBAC:** `tool:separador-csv-baixa-automatica` ou `tool:*` (ADMIN acessa)

Separa o Excel de baixas da GFBR em vários CSVs por ano, com até 50 linhas cada, prontos para importação.

## 2. Objetivo Operacional

- Envie o Excel da aba “BAIXAS” com as colunas padrão da GFBR. A ferramenta usa a coluna “DATA EMISSÃO” para separar os registros por ano, formata datas e valores e gera diversos arquivos CSV limitados a 50 linhas, além de um ZIP único para download.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/separador-csv-baixa-automatica.html`
- **Script JS da ferramenta:** `public/js/separador-csv-baixa-automatica.js`
- **Router Node:** `src/routes/tools/separador-csv-baixa-automatica.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** `api/separador_csv_baixa_automatica_core.py`

## 4. Rotas e Endpoints

- **Rota de página:** `/separador-csv-baixa-automatica`;
- **Base de API esperada:** `/api/separador-csv-baixa-automatica`;
- **Endpoints no router:**
  - `POST /processar`
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
