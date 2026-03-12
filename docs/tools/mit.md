# MIT

## 1. Visão Geral

- **Slug:** `mit`
- **Grupo:** Geral
- **Página (rota):** `/mit`
- **API base:** `/api/mit`
- **Permissão RBAC:** `tool:mit` ou `tool:*` (ADMIN acessa)

Envie o JSON do MIT direto para o Integra Contador / SERPRO.

## 2. Objetivo Operacional

- Faça upload do arquivo JSON gerado pelo IOB; se for sem movimento, entrega MIT e DCTFWeb automaticamente (com procuração para o CNPJ).
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/mit.html`
- **Script JS da ferramenta:** `public/js/mit.js`
- **Router Node:** `src/routes/tools/mit.routes.js`
- **Service Node:** `src/services/mit.service.js`
- **Arquivos Python relacionados:** _não foi identificado arquivo Python específico para este slug_

## 4. Rotas e Endpoints

- **Rota de página:** `/mit`
- **Base de API esperada:** `/api/mit`
- **Endpoints no router:**
  - `POST /enviar-declaracao`

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
- **Clique em "Enviar apuração para o MIT" não faz nada (sem request na rede):**
  - **Sintoma:** botão clicado sem alterar status da tela e sem chamada para `POST /api/mit/enviar-declaracao`.
  - **Causa provável:** `public/mit.html` com formulários aninhados e `id="mitSubmitBtn"` duplicado, fazendo o botão principal ficar fora do form efetivo no DOM.
  - **Solução:** separar `mitForm` e `mitSemMovForm` (sem aninhamento), manter IDs únicos (`mitSubmitBtn` e `semMovSubmitBtn`) e usar `AuthClient.authFetch` no envio da apuração.
- **Erro `obterToken is not a function` ao enviar apuração:**
  - **Sintoma:** retorno da API com `ok: false`, `serproStatus: 500` e `detalhe: "obterToken is not a function"`.
  - **Causa provável:** a rota MIT estava injetando funções legadas (`obterToken`/`createHttpsAgent`) que não são exportadas por `src/serpro-auth.js`.
  - **Solução:** alinhar a rota MIT com `autenticarSerpro` (mesmo padrão da ferramenta SN), usando `access_token` e `jwt_token` retornados pela autenticação atual.
- **Erro `Certificado não encontrado` mesmo com arquivo existente no Windows:**
  - **Sintoma:** retorno com `detalhe` apontando para `W:\...<certificado>.pfx` e `serproStatus: 500`.
  - **Causa provável:** o processo do serviço não enxerga drive mapeado (`W:`) no mesmo contexto do usuário logado.
  - **Solução:** configurar `CERT_PFX_PATH` e `SERPRO_PFX_PATH` com caminho UNC (`\\servidor\share\...`) no `.env` e reiniciar o serviço do portal.
- **Erro SERPRO `900908 Resource forbidden` ao enviar MIT:**
  - **Sintoma:** resposta `serproStatus: 403` com `description: "API Subscription validation failed."`.
  - **Causa provável:** `SERPRO_MIT_DECLARAR_URL` apontando para `integra-contador-trial` sem assinatura ativa nesse recurso.
  - **Solução:** usar endpoint da assinatura ativa (`https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Declarar`) em `SERPRO_MIT_DECLARAR_URL` e reiniciar o serviço.

## 9. Observações de Manutenção

- Ao alterar nomes de arquivo/rota, manter compatibilidade (alias/redirect) para não quebrar links legados.
- Se incluir nova API/fluxo, atualizar este documento e `src/core/tool-catalog.json`.
