# SPEDS

- **Slug:** `speds`
- **Grupo:** Fiscal
- **API Base:** `/api/speds`

## O que esta ferramenta faz
Centraliza as rotinas de SPED ICMS/IPI, Contribuicoes, ECD e ECF em uma unica pagina com templates dinamicos.
Cada template define arquivos exigidos, campos extras, formato de saida e o script Python associado.
Na area de Contribuicoes, inclui a rotina `Contribuicoes - Consolidar SPEDs`, que combina matriz + filiais em um unico TXT para download.
Na area de ECD, inclui a rotina `ECD - Comparar J150 x DRE mensal`, que recebe o TXT da ECD, a planilha da DRE mensal e, opcionalmente, o balanco patrimonial para gerar um XLSX comparativo.

## Como acessar
- Pagina: `/<slug>` (rota dinamica)
- Permissao: `tool:speds` ou `tool:*`
- Admin: sempre acessa (paginas admin sao separadas)
- UI interna: layout padrao com sidebar e topbar global (injetada por `sidebar.js`)

## Endpoints (se aplicavel)
- `GET /api/speds/health`
- `GET /api/speds/types`
- `GET /api/speds/templates?spedType=<tipo>`
- `GET /api/speds/templates/:templateId?spedType=<tipo>`
- `POST /api/speds/run` (CSRF obrigatorio)

## Templates relevantes
- `Contribuicoes - Consolidar SPEDs`: recebe 1 arquivo da matriz e 1 ou mais arquivos das filiais, executa o script interno `api/speds_scripts/contribuicoes/combinador_speds.py` e devolve o TXT consolidado.
- Classificacao operacional do template `Contribuicoes - Consolidar SPEDs`: `local-only`.
- A integracao copia os uploads para uma pasta temporaria com nomes previsiveis antes de chamar o script, preservando o nome final do download conforme o arquivo da matriz.
- O TXT consolidado final e gravado em UTF-8 sem BOM.
- A montagem estrutural usa os JSONs salvos em `api/layouts/speds/contribuicoes`, incluindo ordem oficial de blocos, hierarquia pai/filho e metadados de campos numericos.
- `ECD - Comparar J150 x DRE mensal`: recebe 1 TXT da ECD e aceita DRE mensal, balanco patrimonial ou ambos. Pelo menos um dos dois Excel deve ser enviado. Executa o script interno `api/speds_scripts/ecd/comparar_j150_ecd_dre_mensal.py` com `--no-gui` no portal e devolve um XLSX comparativo.
- Classificacao operacional do template `ECD - Comparar J150 x DRE mensal`: `local-only`.
- No uso direto fora do portal, o script continua abrindo popups para selecao de arquivos quando executado sem `--no-gui`.
- `ECF - Gerador bloco custo L210`: agora abre um quadro manual no portal com apuracao, ano da declaracao e saldo inicial do estoque, gerando automaticamente 12 linhas no modo mensal ou 4 linhas no modo trimestral. O saldo inicial de janeiro se replica para os demais periodos no modo mensal; no modo trimestral, o saldo inicial de cada periodo passa a ser o saldo final do trimestre anterior. As compras/custos continuam sendo calculados antes de gerar o TXT.
- O quadro L210 tambem responde as setas do teclado nos campos editaveis, no mesmo estilo de navegação em grade usado no Y570.
- Classificacao operacional do template `ECF - Gerador bloco custo L210`: `vps-compatible`.
- O modo legado com razao continua disponivel no script local, mas no portal o fluxo principal e o quadro manual, sem anexos obrigatorios.
- `ECF - Y570 Fontes pagadoras`: recebe um ou mais TXT do RendC411, monta na tela os quadros `Resumo`, `Codigos utilizaveis na ECF`, `Nao_localizados` e `Fontes` e depois exporta o TXT final do Y570 da ECF.
- Classificacao operacional do template `ECF - Y570 Fontes pagadoras`: `vps-compatible`.
- No portal, a planilha de codigos aceitos e fixa e vem do asset interno `api/speds_scripts/ecf/assets/codigos_aceitos.xlsx`.
- Os quadros deixam `Codigo DARF`, `Aliquota IRRF (%)`, `Aliquota CSLL (%)`, `Rendimento ECF`, `IRRF` e `CSLL` prontos para revisao antes da exportacao; a tabela de fontes pagadoras mostra totais no topo e no rodape, oferece filtros por CNPJ/nome/codigo e remove os codigos que nao estao na base aceita.
- Regra especial do Y570: o codigo `3426` reaproveita a retençao original do TXT no campo de IRRF quando a linha é montada ou recalculada.
- Depois do processamento, o TXT final é baixado automaticamente na pagina para todos os templates que retornam arquivo.
- A navegacao por teclado no preview do Y570 segue o estilo de planilha: as setas movem entre campos da mesma linha e tambem avancam ou retornam entre linhas quando necessario.
- `ICMS - Integrar inventario no SPED`: recebe o SPED original e o inventario gerado, injeta 0190/0200/bloco H e recalcula os totalizadores finais.
- A rotina nao bloqueia mais a entrega por validacao global de relacionamentos no arquivo final. Se houver auditoria complementar de dominios como `H010.COD_CTA` ou `0200.UNID_INV`, ela deve ser feita por um validador separado.

## Troubleshooting
- Sintoma: o TXT consolidado abre com BOM UTF-8 no validador, ou o PVA acusa hierarquia invalida no bloco M (`M210`/`M105` em posicao errada, `M990` divergente ou `9999` incorreto).
- Causa provavel: versao antiga do consolidado gravando com `utf-8-sig` e usando heuristica incompleta para o bloco M, sem respeitar integralmente os JSONs de hierarquia/layout de Contribuicoes.
- Solucao: usar a versao interna `api/speds_scripts/contribuicoes/combinador_speds.py`, que grava em UTF-8 sem BOM, inclui o bloco `P` na ordem canonica e monta o bloco M com base nos JSONs de `relationships` e `layout`.
- Sintoma: ao executar `ECD - Comparar J150 x DRE mensal`, a tela mostra `Falha ao executar template.` sem contexto suficiente.
- Causa provavel: erro real retornado pelo backend sem destaque visual suficiente na tela, ou processo Node ainda rodando com codigo antigo apos publicar ajuste de template/runner.
- Solucao: conferir os detalhes exibidos abaixo do status, inclusive `Trace ID`, e reiniciar o servico Node (`node src/worker.js` ou o servico equivalente) antes de testar novamente quando houver mudanca recente no template ou no runner. A rotina agora aceita `DRE mensal`, `balanco patrimonial` ou ambos, desde que pelo menos um deles seja enviado. Validacao local reproduzida com sucesso nos tres cenarios.
- Sintoma: a ECD fica algum tempo em upload/processamento e depois cai em `Falha ao executar template.` sem download.
  - Causa provavel: o TXT da ECD ultrapassa o limite de upload do SPEDS. O caso validado usava `ECD_G_2025_00121.TXT` com `132.185.080` bytes, acima do limite antigo de `100 MB`.
  - Solucao: o limite do `uploadSpeds` foi elevado para `250 MB` e a rota agora devolve JSON explicito quando o `multer` rejeitar arquivo por tamanho ou quantidade. Reinicie o Node antes de retestar.
- Sintoma: ao clicar em `Gerar TXT` no template `ECF - Gerador bloco custo L210`, o quadro manual volta vazio e o TXT sai com compras/custos zerados.
  - Causa provavel: o reset da tela limpava `state.l210Rows` antes da coleta dos dados, entao o backend recebia um payload reconstruido com linhas vazias.
  - Solucao: o reset agora preserva o estado do L210 durante o envio e a coleta volta a usar os valores digitados no quadro manual.
- Sintoma: `ICMS - Integrar inventario no SPED` falhava com erros do tipo `validacao global de relacionamentos detectou novas inconsistencias no arquivo final`.
  - Causa provavel: a rotina antiga comparava o arquivo original com o arquivo final e interrompia a entrega se surgissem novos apontamentos globais de relacionamento.
  - Solucao: a rotina foi ajustada para nao aplicar esse bloqueio durante a integracao. O fluxo agora conclui a geracao e deixa a validacao global para um passo separado, quando necessario.

## Utilitario local Y570
- Script local-only: `api/speds_scripts/ecf/gerador_y570_fontes_pagadoras.py`
  - Fluxo: continua disponivel para uso manual com janela local de arquivos.
  - O portal `/speds` usa o mesmo layout de dados do Y570 e a mesma base fixa de codigos aceitos para montar o preview e exportar o TXT final.
  - Saida local: arquivo gerado a partir dos TXT das fontes pagadoras.
  - Observacao: no portal, os TXT podem ser anexados em lote diretamente no template; nao e necessario zipar.

## Observacoes de seguranca
- Mutacoes exigem `x-csrf-token`
- Nunca servir HTML por static; pagina deve ser acessada sem `.html`
- Nao incluir botao local de logout na pagina (usar logout global da sidebar/topbar)
