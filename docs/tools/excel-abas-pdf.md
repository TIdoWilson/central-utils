# Excel para PDF em Abas

## 1. Visão Geral

- **Slug:** `excel-abas-pdf`
- **Grupo:** Geral
- **Página (rota):** `/excel-abas-pdf`
- **API base:** `/api/excel-abas-pdf`
- **Permissão RBAC:** `tool:excel-abas-pdf` ou `tool:*` (ADMIN acessa)

Envie planilhas Excel e receba um PDF por aba, já ajustado para 1 página.

## 2. Objetivo Operacional

- Selecione um ou mais arquivos .xlsx/.xlsm e gere automaticamente um PDF para cada aba (A1:I32, ajustado para uma página) em um único ZIP para download, mantendo o padrão de nomes "&lt;Arquivo&gt; - &lt;Aba&gt;.pdf".
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/excel-abas-pdf.html`
- **Script JS da ferramenta:** `public/js/excel-abas-pdf.js`
- **Router Node:** `src/routes/tools/excel-abas-pdf.routes.js`
- **Service Node:** `src/services/excel-abas-pdf.service.js`
- **Arquivos Python relacionados:** `api/excel_abas_pdf_core.py`

## 4. Rotas e Endpoints

- **Rota de página:** `/excel-abas-pdf`;
- **Base de API esperada:** `/api/excel-abas-pdf`;
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
