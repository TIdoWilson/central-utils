# Separador PDF - Relatório de Férias

## 1. Visão Geral

- **Slug:** `separador-pdf-relatorio-de-ferias`
- **Grupo:** Geral
- **Página (rota):** `/separador-pdf-relatorio-de-ferias`
- **API base:** `/api/separador-pdf-relatorio-de-ferias`
- **Permissão RBAC:** `tool:separador-pdf-relatorio-de-ferias` ou `tool:*` (ADMIN acessa)

Divide o PDF de relatório de férias por empresa e gera um ZIP com um PDF por empresa.

## 2. Objetivo Operacional

- Envie um único PDF de “Relatório de Férias” contendo várias empresas, informe a competência desejada (ex.: 112025) e baixe um arquivo ZIP com um PDF separado para cada empresa, já com o nome padronizado.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/separador-pdf-relatorio-de-ferias.html`
- **Script JS da ferramenta:** `public/js/separador-pdf-relatorio-de-ferias.js`
- **Router Node:** `src/routes/tools/separador-pdf-relatorio-de-ferias.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** `api/relatorio_ferias_core.py`

## 4. Rotas e Endpoints

- **Rota de página:** `/separador-pdf-relatorio-de-ferias`;
- **Base de API esperada:** `/api/separador-pdf-relatorio-de-ferias`;
- **Endpoints no router:**
  - `POST /processar`

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
