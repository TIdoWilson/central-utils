# Separador de Férias por Funcionário

## 1. Visão Geral

- **Slug:** `separador-ferias-funcionario`
- **Grupo:** Geral
- **Página (rota):** `/separador-ferias-funcionario`
- **API base:** `/api/separador-ferias-funcionario`
- **Permissão RBAC:** `tool:separador-ferias-funcionario` ou `tool:*` (ADMIN acessa)

Envie um PDF de férias agrupadas e receba um PDF separado para cada funcionário, em um ZIP.

## 2. Objetivo Operacional

- Faça o upload de um único PDF de férias da empresa; a ferramenta identifica a empresa e divide o arquivo em blocos de 2 páginas (recibo + aviso) para cada funcionário, gerando um ZIP com todos os PDFs individuais de férias já nomeados.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/separador-ferias-funcionario.html`
- **Script JS da ferramenta:** `public/js/separador-ferias-funcionario.js`
- **Router Node:** `src/routes/tools/separador-ferias-funcionario.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** `api/separador_ferias_funcionario_core.py`, `api/tareffa_empresas_lote_job.py`

## 4. Rotas e Endpoints

- **Rota de página:** `/separador-ferias-funcionario`;
- **Base de API esperada:** `/api/separador-ferias-funcionario`;
- **Endpoints no router:**
  - `POST /process`
  - `GET /download/:zipName`

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
