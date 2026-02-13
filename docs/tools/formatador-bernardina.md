# Formatador Bernardina

## 1. Visão Geral

- **Slug:** `formatador-bernardina`
- **Grupo:** Geral
- **Página (rota):** `/formatador-bernardina`
- **API base:** `/api/formatador-bernardina`
- **Permissão RBAC:** `tool:formatador-bernardina` ou `tool:*` (ADMIN acessa)

Envie os XLSX das filiais e gere o XLSM “AGRUPADA” pronto, com período validado e colunas na ordem correta.

## 2. Objetivo Operacional

- Faça upload do lote de .xlsx (IOB limpos). O portal identifica CNPJ/período, verifica filiais faltantes e gera um .xlsm final usando o template padrão (ou um template enviado).
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/formatador-bernardina.html`
- **Script JS da ferramenta:** `public/js/formatador-bernardina.js`
- **Router Node:** `src/routes/tools/formatador-bernardina.routes.js`
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** _não foi identificado arquivo Python específico para este slug_

## 4. Rotas e Endpoints

- **Rota de página:** `/formatador-bernardina`;
- **Base de API esperada:** `/api/formatador-bernardina`;
- **Endpoints no router:**
  - `POST /jobs`
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
