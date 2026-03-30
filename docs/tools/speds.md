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

## Observacoes de seguranca
- Mutacoes exigem `x-csrf-token`
- Nunca servir HTML por static; pagina deve ser acessada sem `.html`
- Nao incluir botao local de logout na pagina (usar logout global da sidebar/topbar)
