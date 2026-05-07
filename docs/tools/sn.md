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
  - `DELETE /companies/:id`
  - `GET /summary`
  - `GET /receipt/:id`
  - `GET /receipts/history`
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
- Empresas cadastradas podem ser removidas pelo botão `Excluir empresa`, via `DELETE /api/sn/companies/:id`.
- A lista principal mantém a seleção atual ao recarregar e exibe uma área visível maior para facilitar marcação em lote.
- A lista de empresas passa a aparecer em duas colunas no desktop para facilitar buscas visuais, mantendo uma coluna no mobile.
- Ao abrir a página, o período de apuração é pré-preenchido com o mês anterior e o respectivo ano, permanecendo editável pelo operador.
- A área de empresas informa explicitamente quantas estão selecionadas no total, inclusive durante filtros, para evitar leitura equivocada do checkbox `Selecionar todas as exibidas`.
- O resumo acima da lista deixa de ficar fixo e passa a refletir, em tempo real, quantas empresas existem e quantas estão realmente selecionadas.
- A área de ações ganhou um botão de histórico que abre os recibos gerados pela API nos últimos 90 dias, com link direto para cada PDF.

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
- **Ao enviar declaração da SN no site local, a tela retorna `Certificado não encontrado em: /opt/central-utils/certs/WILSON.pfx`:**
  - **Sintoma:** o front local da SN tenta enviar a declaração, mas o backend responde com caminho Linux inexistente apesar do certificado `.pfx` existir na máquina Windows.
  - **Causa provável:** o `.env` local ficou com `CERT_PFX_PATH`/`SERPRO_PFX_PATH` apontando para o caminho da VPS em vez do caminho Windows do ambiente local.
  - **Solução:** ajustar `CERT_PFX_PATH` e `SERPRO_PFX_PATH` do `.env` local para o caminho real do `.pfx` na máquina/servidor Windows e reiniciar o serviço local do portal para recarregar o ambiente. O backend também passou a tentar automaticamente o mesmo nome de arquivo em `Documents` e `OneDrive\\Documentos` do usuário Windows atual antes de falhar.
- **Após corrigir o caminho do `.pfx`, a SN ainda falha no envio local:**
  - **Sintoma:** a autenticação deixa de falhar por arquivo ausente, mas a integração com o SERPRO retorna erro `400`.
  - **Causa provável:** credenciais (`CONSUMER_KEY`/`CONSUMER_SECRET`), certificado, `ROLE_TYPE` ou payload da autenticação rejeitados pelo endpoint do SERPRO.
  - **Solução:** o backend passou a expor o detalhe bruto do `HTTP 400` na autenticação do SERPRO para facilitar o diagnóstico; testar novamente com `SERPRO_AUTH_DEBUG=true` no `.env` local quando precisar validar o motivo exato retornado pelo serviço.
- **Após autenticar no SERPRO, a declaração retorna `Required property 'TipoDeclaracao' not found in JSON`:**
  - **Sintoma:** a linha da empresa aparece com status `400` e mensagem informando ausência de `TipoDeclaracao` dentro de `declaracao`.
  - **Causa provável:** o backend estava montando o objeto com a chave `tipoDeclaracao` em minúsculo e o front nem sempre enviava esse campo explicitamente.
  - **Solução:** a rota passou a enviar `TipoDeclaracao` com capitalização compatível com o contrato do SERPRO e assume `1` (declaração original) quando o front não informar o valor.
- **Ao filtrar empresas, marcar uma e limpar a busca, a tela passa a indicar seleção total incorreta:**
  - **Sintoma:** ao marcar empresa(s) em um resultado filtrado e depois limpar o campo de busca, o checkbox `Selecionar todas as exibidas` aparece marcado como se toda a base estivesse selecionada.
  - **Causa provável:** a renderização estava reaproveitando o estado visual do checkbox mestre filtrado para remontar a lista inteira, em vez de recalcular a seleção a partir dos IDs realmente marcados.
  - **Solução:** a lista passou a reconstruir os checkboxes apenas com base em `selectedCompanyIds`; limpar ou trocar o filtro preserva as empresas marcadas e o checkbox mestre reflete somente os itens exibidos no filtro atual.

## 9. Observações de Manutenção

- Ao alterar nomes de arquivo/rota, manter compatibilidade (alias/redirect) para não quebrar links legados.
- Se incluir nova API/fluxo, atualizar este documento e `src/core/tool-catalog.json`.
