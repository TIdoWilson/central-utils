# SPEDS

- **Slug:** `speds`
- **Grupo:** Fiscal
- **API Base:** `/api/speds`

## O que esta ferramenta faz
Executa templates de processamento de SPED (ICMS, Contribuicoes, ECD e ECF) com upload de arquivos e download do artefato final gerado por script Python.

## Como acessar
- Pagina: `/speds` (rota dinamica)
- Permissao: `tool:speds` ou `tool:*`
- Admin: sempre acessa
- UI interna: layout padrao com sidebar e topbar global

## Endpoints
- `GET /api/speds/health`
- `GET /api/speds/types`
- `GET /api/speds/templates`
- `GET /api/speds/templates/:templateId`
- `POST /api/speds/run` (CSRF obrigatorio)
- `GET /api/speds/download/:jobId/:fileName`

## Mapas de relacionamentos
### ICMS
- `api/layouts/speds/icms/relationships/hierarchy.parent_child.json`
- `api/layouts/speds/icms/relationships/dependencies.cross_record.json`
- `api/layouts/speds/icms/relationships/reference_domains.validator.json`
- `api/layouts/speds/icms/relationships/index.json`
- validador: `api/speds_scripts/icms/sped_relationship_validator.py`

### Contribuicoes
- `api/layouts/speds/contribuicoes/relationships/hierarchy.parent_child.json`
- `api/layouts/speds/contribuicoes/relationships/dependencies.cross_record.json`
- `api/layouts/speds/contribuicoes/relationships/reference_domains.validator.json`
- `api/layouts/speds/contribuicoes/relationships/index.json`
- validador reutilizavel: `api/speds_scripts/icms/sped_relationship_validator.py` (informar `--layouts-dir` e `--rules-file`)

## Observacoes de seguranca
- Mutacoes exigem `x-csrf-token`.
- Nao servir HTML por static; pagina acessada sem `.html`.
- Nao criar botao local de logout na pagina.

## Template novo: Copiar Bloco K
- ID: `icms-copiar-bloco-k-sped`
- Entradas:
- `sped_destino` (TXT)
- `sped_origem_k` (TXT)
- Campo opcional:
- `modo_produto_faltante`:
- `incluir` (padrao): inclui 0200 faltantes no destino usando origem
- `erro`: aborta quando faltar produto
- Saida: TXT
- Regras de integridade:
- copia K001..K990 da origem
- substitui bloco K no destino
- ajusta K001/K990, 0990 e bloco 9
- verifica produtos do Bloco K e aplica politica de faltantes
- preserva hierarquia de registros filhos no bloco 0 (0200 + 0205/0210/0220/0221)

## Template novo: Contribuicoes - Validador SPED
- ID: `contribuicoes-validador-sped`
- Entradas:
- `sped_txt` (TXT)
- Campo opcional:
- `max_issues` (limite de pendencias detalhadas no relatorio)
- Saida: TXT ou XLSX
- Comportamento:
- nao altera o SPED de entrada;
- executa validacao global de referencias internas;
- retorna pendencias agrupadas e ocorrencias detalhadas (linha/registro/campo/valor).

## Modelo de pensamento base (obrigatorio)
- Etapa 1: mapear registro alvo e relacionamentos (pai, filhos e referencias cruzadas).
- Etapa 2: analisar impacto da acao (`insert`, `update`, `delete`) na cadeia completa.
- Etapa 3: simular mudanca em memoria (sem escrever arquivo).
- Etapa 4: validar integridade global do arquivo:
- sem orfaos (ex.: `0221` sem `0200`);
- sem duplicidade de chave;
- hierarquia preservada;
- totalizadores consistentes;
- referencias internas consistentes por dominio (`COD_ITEM`, `UNID`, `COD_PART`, `COD_CTA`, `COD_CCUS`, `COD_INF`, `COD_OBS`).
- Etapa 5: aplicar mudanca real.
- Etapa 6: recalcular totalizadores afetados (`0990`, `H990`, `9900`, `9990`, `9999` e outros blocos alterados).
- Etapa 7: emitir relatorio de mudancas (antes/depois + contagem por registro).

## Regra formal obrigatoria
- Regra R-001 (Cascade Safety): toda exclusao/alteracao de registro deve verificar e tratar registros filhos e vinculos dependentes antes da persistencia.
- Se nao for possivel tratar a dependencia, o script deve abortar com erro explicito.

## Estado atual apos as ultimas mudancas
- O validador global de relacionamentos esta em `api/speds_scripts/icms/sped_relationship_validator.py`.
- O validador compara o arquivo inteiro (de `0000` a `9999`) com base nos layouts JSON e nos dominios de `api/layouts/speds/icms/relationships/reference_domains.validator.json`.
- Os templates `icms-corretor-total-inventario` e `icms-integrar-inventario-sped` ja executam comparacao de integridade origem x final e bloqueiam somente inconsistencias novas.
- A hierarquia `0200` -> filhos (`0205`, `0210`, `0220`, `0221`) esta preservada nos fluxos de exclusao e integracao de inventario.
- Cobertura de manifesto no ICMS: 6/6 templates com `manifest` referenciado em `api/layouts/speds/templates.json`.
- Cobertura de manifesto no Contribuicoes: 2/2 templates com `manifest` referenciado em `api/layouts/speds/templates.json`.
- A API (`src/services/speds.service.js`) agora executa validacao automatica de relacionamentos no artefato final quando:
- o manifesto define `validators.globalRelationshipValidation = true`;
- o artefato final e `.txt`;
- o arquivo final e um SPED completo (`0000` ate `9999`).
- Se a validacao reprovar, o processamento aborta com erro explicito.
- O template `contribuicoes-validador-sped` agora retorna `summary.validationFindings` na API (`POST /api/speds/run`) com:
- totais (`linhas`, `checagens`, `pendencias`);
- pendencias agrupadas com mensagem amigavel e orientacao de correcao;
- primeiras ocorrencias com linha do arquivo.
- A UI `public/speds.html` renderiza esse resumo em painel amigavel na secao `Resultado`, reduzindo dependencia de leitura tecnica de registro/campo.
- O script `api/speds_scripts/icms/sped_relationship_validator.py` passou a operar em modo `pva-like` para layouts de `contribuicoes` (modo `auto`), com validacoes adicionais:
- estrutura/tipos/obrigatoriedade por layout em todos os blocos;
- totalizadores (`9900`, `0990`, `1990`, `9990`, `9999`);
- hierarquia contigua pai/filho (quando definida no mapa de relacionamento);
- regras fiscais iniciais do Bloco M/F (`MSG_VALIDA_VL_CONT_CUM_REC`, `MSG_VALIDA_DET_RECEITA_DCTF`, `MSG_OBRIGATORIO_M205_M605_NAO_DEVE_EXISTIR`, `MSG_CALCULAR_CONTRIBUICAO`, `MSG_CAMPO_OBRIGATORIO`).

## Contrato para novos templates (manifesto JSON)
- Objetivo: reduzir script ad-hoc e transformar novos templates em `config + regras`.
- Arquivo recomendado por template: `api/layouts/speds/<tipo>/manifests/<template-id>.manifest.json`.
- Schema base: `api/layouts/speds/template.manifest.schema.json`.
- Exemplo inicial: `api/layouts/speds/icms/manifests/icms-corretor-total-inventario.manifest.json`.
- Exemplo multi-arquivo: `api/layouts/speds/icms/manifests/icms-integrar-inventario-sped.manifest.json`.
- Campos minimos do manifesto:
- `templateId`, `spedType`, `operation`.
- `inputs` (obrigatorios/opcionais, multiplos, extensoes aceitas).
- `fields` (parametros de execucao).
- `targets` (registros alvo).
- `cascadePolicy` (regras de exclusao/alteracao com filhos e dependencias).
- `validators` (regras de integridade e relacionamento), com:
- `globalRelationshipValidation` (boolean);
- `rulesFile` (arquivo de dominios);
- `maxIssues` (opcional; default 200).
- `totalizers` (lista a recalcular).
- `output` (formato final e nome sugerido).
- `dryRun` (habilita simulacao com preview de impacto).

## Politica de novos templates
- Para `ICMS` e `Contribuicoes`, manifesto e obrigatorio.
- Template sem manifesto valido nao executa no backend.
- Novo template que gera SPED final em `.txt` deve sair com `validators.globalRelationshipValidation = true` por padrao.

## Checklist de qualidade para todo template
- Preserva hierarquia pai-filho.
- Nao cria registro orfao.
- Recalcula totalizadores afetados.
- Gera log de mudancas.
- Passa em teste com arquivo real e arquivo de borda.
- Valida extensoes/anexos recebidos conforme manifesto.

## Informacoes minimas para abrir um novo template
- Formulario pronto: `docs/tools/speds-template-briefing.md`.
- Qual SPED (`ICMS`, `Contribuicoes`, `ECD`, `ECF`).
- Objetivo funcional em uma frase (o que entra e o que sai).
- Registros alvo e tipo de acao (`insert`, `update`, `delete`).
- Regras de relacionamento obrigatorias (pais, filhos, referencias cruzadas).
- Campos obrigatorios de tela (parametros).
- Arquivos necessarios (1..N) e formatos aceitos.
- Exemplo real de entrada + resultado esperado.
- Regras de erro que devem abortar processamento.

## Roadmap de padronizacao (SPED Core)
- Fase 1: parser comum, indice por registro e funcoes de escrita segura.
- Fase 2: engine de cascata (pai/filho + dependencias cruzadas).
- Fase 3: validacao global compartilhada por dominio e por manifesto.
- Fase 4: dry-run obrigatorio na API/UI antes de executar mudanca real.
- Fase 5: testes automatizados por template com fixture real e fixture de borda.

## Troubleshooting
### Sintoma
Templates SPEDS retornavam apenas arquivo `.txt` de resumo (`<template>_<job>.txt`) em vez do arquivo final processado pelo script.

### Causa provavel
Backend tinha execucao real apenas para um template especifico (`icms-corretor-total-inventario`) e os demais caiam no fallback de resumo.

### Solucao
Mapear todos os templates com script para execucao automatica no `src/services/speds.service.js`, incluindo:
- montagem de argumentos por template;
- validacao de arquivos/campos;
- retorno do artefato gerado pelo script;
- fallback de resumo somente para template sem script (ex.: template pendente).

### Sintoma
No template `icms-corretor-total-inventario`, ao excluir itens do inventario, o arquivo final podia quebrar a hierarquia do bloco 0 (`0200` com filhos `0221`), deixando filho sem pai ou ordem inconsistente.

### Causa provavel
O script removia linha `0200` por `COD_ITEM`, mas nao removia os registros filhos subsequentes (`0221` e demais filhos do `0200`), mantendo linhas orfas.

### Solucao
No `api/speds_scripts/icms/corretor_total_inventario.py`, remover o `0200` junto com os registros filhos imediatos (`0205`, `0210`, `0220`, `0221`) quando o item for excluido.

### Sintoma
No template `icms-integrar-inventario-sped`, ao incluir novos itens, o arquivo podia inserir `0200` no meio da estrutura existente e separar pares `0200`/`0221`.

### Causa provavel
A rotina de insercao de `0200` considerava `0200` como cabecalho, mas nao tratava `0221` como parte do mesmo bloco pai/filho para definir o ponto de insercao.

### Solucao
No `api/speds_scripts/icms/integrar_inventario_sped.py`:
- tratar `0200` + filhos (`0205`, `0210`, `0220`, `0221`) como grupo;
- inserir grupos completos de novos itens;
- considerar `0221` no calculo do fim do bloco de cabecalho para nao quebrar a sequencia pai/filho.

### Sintoma
No template `icms-comparador-sped-relatorio`, o processamento pedia apenas um relatorio por vez e a planilha final trazia abas demais (resumo tecnico/divergencias), gerando leitura confusa para conferencia operacional.

### Causa provavel
O fluxo antigo foi desenhado para comparacao unica (entradas **ou** saidas) e para auditoria detalhada, com foco em C100/CFOP e varias abas auxiliares.

### Solucao
Atualizar o template e o script para:
- aceitar `SPED + relatorio_entradas + relatorio_saidas` no mesmo processamento;
- permitir execucao com apenas um dos relatorios quando o outro nao for anexado;
- ampliar leitura de notas no SPED para outros registros de documento fiscal (além de C100), usando registros analiticos por CFOP;
- gerar somente 4 abas finais: `Somente no SPED`, `Somente no Rel Entradas`, `Somente no Rel Saidas` e `Totais` (com totais de valor por origem).

### Sintoma
No comparador SPED x relatorio, havia casos de mesma nota repetida em varias linhas (itens/quebras) que apareciam como divergencia mesmo quando o total consolidado estava correto.

### Causa provavel
A comparacao era feita por linha detalhada sem consolidar repeticoes da mesma chave operacional.

### Solucao
Consolidar os dados antes da comparacao por `numero da nota + serie`, somando o `valor` de linhas repetidas em cada origem (SPED/relatorio), e manter a coluna `emitente` nas abas finais apenas para visualizacao.

### Sintoma
No template `icms-integrar-inventario-sped`, o resultado final pode trazer varios registros `0200` novos que nao sao usados por nenhum `H010`, gerando erro de validacao no PVA.

### Causa provavel
A integracao importava todos os `0200` do arquivo de inventario sem filtrar se o `COD_ITEM` era realmente referenciado no arquivo integrado.

### Solucao
No `api/speds_scripts/icms/integrar_inventario_sped.py`, importar apenas grupos `0200` (com filhos `0205/0210/0220/0221`) cujo `COD_ITEM` apareca em referencias validas do arquivo integrado:
- `H010` (bloco H do inventario);
- outros registros com `COD_ITEM` no SPED de origem, usando mapeamento pelos layouts JSON em `api/layouts/speds/icms/*.json` (campos `COD_ITEM*`).

O resumo final do script tambem deve informar:
- total de `0200` no inventario;
- quantidade usada por referencias validas;
- quantidade ignorada por nao ter referencia.

### Sintoma
No template `icms-corretor-total-inventario`, um `0200` podia ser removido mesmo ainda referenciado em registros diferentes de `C170`, causando inconsistencias no PVA.

### Causa provavel
A regra de exclusao do corretor considerava apenas referencias no `C170` para decidir se um `COD_ITEM` podia ser removido.

### Solucao
No `api/speds_scripts/icms/corretor_total_inventario.py`, bloquear exclusao de `COD_ITEM` quando houver referencia externa em qualquer registro mapeado nos layouts `api/layouts/speds/icms/*.json` com campo `COD_ITEM*` (excluindo apenas `H010` e `0200`, que sao tratados pela propria rotina de ajuste).
