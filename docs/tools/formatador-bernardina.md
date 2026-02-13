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
- **Binário C#/.NET (publish):** `tools/formatador-bernardina/publish/Formatador Bernadina.exe`
- **Service Node:** _não há service dedicado; execução ocorre diretamente no router_
- **Arquivos Python relacionados:** _não aplicável para este slug_

## 4. Rotas e Endpoints

- **Rota de página:** `/formatador-bernardina`;
- **Base de API esperada:** `/api/formatador-bernardina`;
- **Endpoints no router:**
  - `POST /jobs`
  - `GET /jobs/:jobId`
  - `GET /jobs/:jobId/download`

## 5. Fluxo Técnico Real (Página -> Node -> C#)

1. Front autentica usuário em `/api/auth/me` para obter CSRF.
2. Front envia `FormData` com múltiplos `files` para `POST /api/formatador-bernardina/jobs`.
3. Router cria diretório do job em `data/formatador-bernardina/<jobId>/`.
4. Router executa `spawn(BERNADINA_EXE_PATH, [inputDir, outputPath, BERNADINA_TEMPLATE_PATH])`.
5. Status é persistido em `job.json` e consultado via polling (`GET /jobs/:jobId`).
6. Ao concluir, download fica disponível em `GET /jobs/:jobId/download`.

## 6. Segurança e Governança

- Exige autenticação ativa no portal.
- RBAC por ferramenta (`tool:<slug>`, `tool:*`, ADMIN).
- Em mutações, usar token CSRF via header `x-csrf-token` (exceto login).
- `auditLog` deve registrar evento sem interromper a requisição em falhas de auditoria.

## 7. Configuração de Runtime (C#)

- `BERNADINA_EXE_PATH`: caminho absoluto do executável C#.
- `BERNADINA_TEMPLATE_PATH`: caminho do template `.xlsm` base.

Falhas de configuração retornam erro explícito:
- `BERNADINA_EXE_PATH não configurado no .env`
- `BERNADINA_TEMPLATE_PATH não configurado no .env`

## 8. Entradas e Saídas Esperadas

- **Entradas:** array `files` com planilhas `.xlsx`.
- **Saídas:** `jobId`, status incremental (`processing/done/error`) e arquivo `.xlsm` final.
- **Persistência local:** logs e metadados por job em `job.json`.

## 9. Troubleshooting Específico

- **401/403:** conferir sessão do usuário e permissão RBAC.
- **400 "Envie pelo menos 1 .xlsx":** campo multipart incorreto (esperado `files`).
- **500 ao criar job:** validar `BERNADINA_EXE_PATH` e permissões de execução do `.exe`.
- **Job `error` com `exitCode != 0`:** abrir logs do job em `job.json` (stdout/stderr gravados).
- **404 no download:** job inexistente ou sem `.xlsm` produzido.

## 10. Observações de Manutenção

- Ao alterar nomes de arquivo/rota, manter compatibilidade (alias/redirect) para não quebrar links legados.
- Se incluir nova API/fluxo, atualizar este documento e `src/core/tool-catalog.json`.
- Se o executável C# mudar contrato de argumentos, atualizar o router e esta documentação em conjunto.
