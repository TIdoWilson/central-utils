# SN

## 1. Visão Geral

- **Slug:** `sn`
- **Grupo:** Geral
- **Página (rota):** `/sn`
- **API base:** `/api/sn`
- **Permissão RBAC:** `tool:sn` ou `tool:*` (ADMIN acessa)

Envie a declaração mensal sem movimento pelo Integra Contador.

## 2. Objetivo Operacional

- Serviço que transmite a declaração mensal do Simples Nacional de forma automatizada. (Apenas com procuração para o CNPJ).
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/sn.html`
- **Script JS da ferramenta:** `public/js/sn.js`
- **Router Node:** `src/routes/tools/sn.routes.js`
- **Service Node:** `src/services/sn.service.js`
- **Arquivos Python relacionados:** _não foi identificado arquivo Python específico para este slug_

## 4. Rotas e Endpoints

- **Rota de página:** `/sn`;
- **Base de API esperada:** `/api/sn`;
- **Endpoints no router:**
  - `GET /companies`
  - `POST /companies`
  - `PUT /companies/:id`
  - `GET /summary`
  - `GET /receipt/:id`
  - `POST /receipts/batch-download`
  - `POST /declaration`
  - `POST /consult-last`

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

## 7.1 Cadastro de Empresas

- O modal de cadastro consulta `GET /api/cnpj/:cnpj` (BrasilAPI já centralizada no portal) ao informar 14 dígitos de CNPJ.
- Se a BrasilAPI retornar `razao_social`, o campo é preenchido automaticamente, mas continua editável.
- Empresas já cadastradas podem ser ajustadas pelo botão `Editar`, via `PUT /api/sn/companies/:id`.
- A lista principal mantém a seleção atual ao recarregar e exibe uma área visível maior para facilitar marcação em lote.
- Ao abrir a página, o período de apuração é pré-preenchido com o mês anterior e o respectivo ano, permanecendo editável pelo operador.
- A área de empresas informa explicitamente quantas estão selecionadas no total, inclusive durante filtros, para evitar leitura equivocada do checkbox `Selecionar todas as exibidas`.

## 8. Troubleshooting Rápido

- **401/403:** conferir sessão do usuário e permissão RBAC.
- **404 em endpoint:** validar rota no `router` e base URL consumida no JS.
- **422/400:** revisar campos obrigatórios e estrutura do arquivo enviado.
- **500:** inspecionar logs do Node e, quando existir, logs do processamento Python.
- **Razão social não preenche no cadastro:**
  - **Sintoma:** o CNPJ chega a 14 dígitos, mas o campo continua vazio ou mostra erro.
  - **Causa provável:** BrasilAPI sem retorno para o CNPJ, indisponibilidade momentânea do serviço ou CNPJ inválido.
  - **Solução:** concluir o cadastro/manual com a razão social informada pelo operador; o envio da declaração continua usando os dados salvos localmente e não depende da BrasilAPI em tempo de transmissão.
- **Ao apertar Enter no CNPJ da edição, o modal tenta salvar e retorna erro de atualização:**
  - **Sintoma:** no modal `Editar empresa`, pressionar `Enter` no campo CNPJ dispara a mensagem `Erro ao atualizar empresa.` antes de revisar a razão social.
  - **Causa provável:** o `Enter` estava submetendo o formulário inteiro em vez de apenas consultar a BrasilAPI.
  - **Solução:** o campo passou a interceptar `Enter` para executar somente a busca do CNPJ e mover o foco para `Razão Social`; a gravação continua apenas no botão de salvar ou no submit intencional do formulário.
- **Ao clicar em salvar na edição, a UI mostra erro genérico mesmo com os dados válidos:**
  - **Sintoma:** após editar a razão social, o modal exibe apenas `Erro ao atualizar empresa.` sem detalhe do motivo.
  - **Causa provável:** resposta não-JSON do backend, rota `PUT /api/sn/companies/:id` indisponível no processo Node atual ou erro interno 5xx.
  - **Solução:** a UI passou a exibir o status HTTP real e orientar reinício do serviço Node quando a rota retornar `404`; em deploy local/VPS, reiniciar o processo após publicar alterações do router.
- **Ao filtrar empresas, marcar uma e limpar a busca, a tela passa a indicar seleção total incorreta:**
  - **Sintoma:** ao marcar empresa(s) em um resultado filtrado e depois limpar o campo de busca, o checkbox `Selecionar todas as exibidas` aparece marcado como se toda a base estivesse selecionada.
  - **Causa provável:** a renderização estava reaproveitando o estado visual do checkbox mestre filtrado para remontar a lista inteira, em vez de recalcular a seleção a partir dos IDs realmente marcados.
  - **Solução:** a lista passou a reconstruir os checkboxes apenas com base em `selectedCompanyIds`; limpar ou trocar o filtro preserva as empresas marcadas e o checkbox mestre reflete somente os itens exibidos no filtro atual.

## 9. Observações de Manutenção

- Ao alterar nomes de arquivo/rota, manter compatibilidade (alias/redirect) para não quebrar links legados.
- Se incluir nova API/fluxo, atualizar este documento e `src/core/tool-catalog.json`.
