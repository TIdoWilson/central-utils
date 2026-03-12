# Cadastro de Empresas (BrasilAPI)

## 1. Visao Geral

- **Slug:** `cadastro-empresas-brasilapi`
- **Grupo:** Geral
- **Classificacao operacional:** `local-only`
- **Pagina (rota):** `/cadastro-empresas-brasilapi`
- **API base:** `/api/cadastro-empresas-brasilapi`
- **Permissao RBAC:** `tool:cadastro-empresas-brasilapi` ou `tool:*` (ADMIN acessa)

Ferramenta para cadastro em lote de empresas por CNPJ com consulta na BrasilAPI, persistencia estruturada em banco e filtros de consulta.

## 2. Objetivo Operacional

- Importar CNPJs em lote via texto, CSV/TXT ou planilha Excel.
- Consultar a BrasilAPI e salvar dados tratados da empresa no banco.
- Permitir visualizacao simples com selecao de colunas, filtros por socio e por um ou mais CNAEs.
- Exibir `Regime Tributario` atual em coluna/filtro e abrir o botao de regime com historico de mudancas (`regime_tributario`).
- Permitir ajuste manual de `Regime Tributario` por empresa quando a origem nao trouxer regime confiavel/completo.
- Evitar layout confuso de planilha e disponibilizar leitura clara de socios/CNAEs sem poluir a grade principal.

## 3. Arquivos Relacionados (Verificados)

- **Pagina HTML:** `public/cadastro-empresas-brasilapi.html`
- **Script JS da ferramenta:** `public/js/cadastro-empresas-brasilapi.js`
- **Router Node:** `src/routes/tools/cadastro-empresas-brasilapi.routes.js`
- **Migrations SQL:**
  - `db/migrations/20260304_003_office_companies_brasilapi.sql`
  - `db/migrations/20260305_004_office_companies_regime_history.sql`
  - `db/migrations/20260306_005_office_companies_regime_atual.sql`

## 4. Endpoints

- `GET /api/cadastro-empresas-brasilapi/health`
- `GET /api/cadastro-empresas-brasilapi/meta`
- `GET /api/cadastro-empresas-brasilapi/companies`
- `GET /api/cadastro-empresas-brasilapi/companies/:id`
- `POST /api/cadastro-empresas-brasilapi/companies/:id/regime-manual`
- `GET /api/cadastro-empresas-brasilapi/export.xlsx`
- `POST /api/cadastro-empresas-brasilapi/import`
- `POST /api/cadastro-empresas-brasilapi/import-file`
- `POST /api/cadastro-empresas-brasilapi/refresh`
- `POST /api/cadastro-empresas-brasilapi/refresh-all`

## 5. Seguranca e Governanca

- Exige autenticacao ativa no portal.
- RBAC por ferramenta (`tool:<slug>`, `tool:*`, ADMIN).
- Mutacoes protegidas por CSRF (`x-csrf-token`) com `AuthClient.authFetch`.
- `auditLog` registra importacoes/atualizacoes sem derrubar requisicao.

## 6. Persistencia

- `office_companies`: dados gerais + `regime_tributario_atual` + `raw_response` (JSONB da BrasilAPI, incluindo historico `regime_tributario`).
- `office_companies.regime_tributario_manual`: override manual opcional, com prioridade sobre o calculo automatico.
  - Ao atualizar via BrasilAPI: se vier regime atual nao vazio, o manual e limpo automaticamente; se vier sem regime, o manual permanece.
- `office_company_partners`: lista de socios/QSA por empresa.
- `office_company_cnaes`: CNAEs principal/secundarios por empresa.

## 7. Campos da BrasilAPI Gravados/Usados

- Cadastrais principais: CNPJ, razao social, fantasia, situacao, natureza, porte, inicio de atividade, endereco e contato.
- Quadro societario: `qsa` em `office_company_partners`.
- CNAEs: `cnae_fiscal` + `cnaes_secundarios` em `office_company_cnaes`.
- Regime tributario:
  - Historico completo mantido em `raw_response.regime_tributario`.
  - Regime atual prioriza `SIMEI`/`SIMPLES NACIONAL` via `opcao_pelo_mei` e `opcao_pelo_simples`; sem esses indicadores, usa historico e campos legados como fallback.
  - Quando houver apenas data de exclusao e a empresa estiver `BAIXADA`, o regime exibido passa a `EXCLUIDA DO SIMEI` ou `EXCLUIDA DO SIMPLES NACIONAL`.
  - Indicadores Simples/MEI (`opcao_*`, `data_opcao_*`, `data_exclusao_*`) em colunas proprias.

## 8. Troubleshooting Rapido

- **Nenhum CNPJ encontrado no arquivo:** validar extensao e conteudo da planilha/arquivo.
- **CSV exportado do Excel em notacao cientifica (`3,4690183E+13`):** a ferramenta faz tentativa de normalizacao automatica para 14 digitos; quando houver arredondamento na origem, reexportar mantendo coluna como texto.
- **Falhas em lote na consulta (`HTTP 429`):** a ferramenta aplica rate-limit interno por intervalo (`CADASTRO_EMPRESAS_BRASILAPI_MIN_INTERVAL_MS`) e retry com backoff + `Retry-After`. Mesmo assim, em picos pode haver 429; manter lotes menores reduz recorrencia.
- **Como reprocessar falhas de lote:** apos uma execucao com erros, usar `Reprocessar falhas` (somente os CNPJs com erro da ultima execucao) ou `Baixar falhas (CSV)` para controle externo.
- **`Ver socios`/`Ver CNAEs` sem abrir detalhes:** a visualizacao abre em modal dedicado; se nao abrir, atualizar a pagina com `Ctrl+F5` para garantir cache limpo do JS.
- **Coluna/Filtro `Regime Tributario` vazio em empresas antigas:** executar `npm run migrate` e recarregar listagem; o valor atual e derivado de `raw_response.regime_tributario`.
- **Empresa optante pelo Simples sem regime na coluna/filtro:** agora o fallback preenche `SIMPLES NACIONAL`/`SIMEI` quando o historico nao vem. Reconsultar os CNPJs para persistir o novo valor.
- **Divergencia com Consulta Optantes (SN):** alguns CNPJs retornam `opcao_pelo_simples=false` com `data_opcao_pelo_simples` e `data_exclusao_do_simples` no mesmo dia. Causa provavel: historico/normalizacao da origem BrasilAPI. Solucao aplicada: o sistema nao promove mais esses casos para optante automaticamente; prioriza o booleano oficial (`opcao_*`), usa historico para regime atual e marca `EXCLUIDA` apenas quando nao houver regime historico.
- **Muitas empresas ATIVAS exibindo `EXCLUIDA DO SIMPLES NACIONAL`:** sintoma ocorre quando a coluna de regime foi contaminada por regra de exclusao ampla. Solucao aplicada: `EXCLUIDA...` agora so pode ser regime atual para `situacao_cadastral=BAIXADA`; para empresas ativas, o regime atual prioriza optante atual e historico (`regime_tributario`).
- **Empresas sem regime e sem forma de filtrar:** solucao aplicada com opcao `Sem regime informado` no filtro de regime (valor especial `__EMPTY__`) para localizar registros sem regime calculado.
- **Necessidade de corrigir regime manualmente:** solucao aplicada com acao `Editar regime` por linha (persistida em `regime_tributario_manual`), sem perder em atualizacoes futuras da BrasilAPI.
  - Lista padrao inclui: `LUCRO REAL`, `LUCRO PRESUMIDO`, `SIMPLES NACIONAL`, `SIMEI`, `INATIVA`, `ISENTA DO IRPJ`, `IMUNE DO IRPJ` e opcoes de `EXCLUIDA`.
- **Filtro de regime com duplicidade de escrita (`lucro presumido` x `LUCRO PRESUMIDO`):** normalizacao aplicada para exibicao e comparacao em caixa alta, evitando opcoes duplicadas.
- **Botao `Ver historico regime` sem tabela de mudancas:** significa que a resposta BrasilAPI daquele CNPJ nao trouxe `regime_tributario`; usar `Atualizar` para reconsultar.
- **Filtro de CNAE por palavra:** o campo aceita descricao (ex.: `aluguel`) e codigos (ex.: `6810202`), com multiplos termos separados por virgula/`;`.
- **401/403:** checar sessao e permissao RBAC.
- **500 ao listar/importar:** confirmar schema/migration aplicada no banco.
