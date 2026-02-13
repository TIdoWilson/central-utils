# Tareffa Empresas Lote

## 1. Visão Geral

- **Slug:** `tareffa-empresas-lote`
- **Grupo:** Geral
- **Página (rota):** `/tareffa-empresas-lote`
- **API base:** `/api/tareffa-empresas-lote`
- **Permissão RBAC:** `tool:tareffa-empresas-lote` ou `tool:*` (ADMIN acessa)

Digite CNPJs em formato de planilha, auto-preencha por API e cadastre tudo no Tareffa com características e serviços.

## 2. Objetivo Operacional

- Tabela estilo planilha: CNPJ + dados. Ao cadastrar, o robô cria as empresas em lote no Tareffa, baixa os IDs, marca Regime/Atividades/Município/Estado e gera serviços automaticamente.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/tareffa-empresas-lote.html`
- **Script JS da ferramenta:** `public/js/tareffa-empresas-lote.js`
- **Router Node:** `src/routes/tools/tareffa-empresas-lote.routes.js`
- **Service Node:** `src/services/tareffa-empresas-lote.service.js`
- **Arquivos Python relacionados:** `api/tareffa_empresas_lote_core.py`, `api/tareffa_empresas_lote_job.py`

## 4. Rotas e Endpoints

- **Rota de página:** `/tareffa-empresas-lote`;
- **Base de API esperada:** `/api/tareffa-empresas-lote`;
- **Endpoints no router:**
  - `POST /jobs`
  - `GET /jobs/:jobKey`

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
