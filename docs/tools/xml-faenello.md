# XML Faenello

- **Slug:** `xml-faenello`
- **Grupo:** Fiscal
- **Página (rota):** `/xml-faenello`
- **API base:** _N/A_
- **Classificação operacional:** `local-only`
- **Permissão RBAC:** `tool:xml-faenello` ou `tool:*` (ADMIN acessa)

## O que esta ferramenta faz

Leitura de XML Faenello com upload obrigatório do arquivo, montagem de dashboard com totais e tabela detalhada das NFS-e lidas.

## Acesso na home

- A ferramenta também aparece como card na home do portal, na seção `Fiscal`, com link direto para `/xml-faenello`.

## Regras de leitura

- `tpTributacao = "Tributado no município"` é consolidado como `Francisco Beltrão`.
- `tpTributacao = "Tributado em outro município"` usa `nrCidadeIbgeServico` para resolver o nome do município.
- `isIssRetido` é normalizado para `S` ou `N`.
- `isNfsCancelada = "Sim"` faz a nota ser ignorada por completo na tabela, no dashboard e na exportação.
- Os valores monetários são exibidos e exportados em `R$ 0,00`.

## Colunas da tabela

- `Nr NFSE`
- `Tributado em`
- `ISS retido`
- `Cliente`
- `CPF/CNPJ`
- `Valor total da nota`
- `Base de calculo ISS`
- `Valor ISS`

## Totais do dashboard

- Total faturamento
- Total tributado em Francisco Beltrão
- Total ISSQN retido
- Total ISSQN não retido por município
- Total ISSQN não retido fora de Francisco Beltrão

## Exportação

- A planilha XLSX contém abas de `Detalhe`, `Resumo` e `Municipios`.
- A exportação preserva acentuação e caracteres especiais no conteúdo das células.
- As NFS-e canceladas não entram em nenhuma aba.

## Troubleshooting

### Sintoma
- O município exibido aparece como `Município <codigo>` em vez do nome completo.

### Causa provável
- A consulta ao catálogo público de municípios do IBGE falhou ou a máquina estava sem acesso à internet.

### Solução
- Reprocessar o XML com conectividade ativa. Se o IBGE não responder, a tela mantém o código para não perder o restante do relatório.

### Sintoma
- A leitura do XML mostra acentuação corrompida.

### Causa provável
- O arquivo foi salvo em codificação diferente de UTF-8 ou o navegador aplicou uma leitura inadequada.

### Solução
- O upload usa leitura com fallback de codificação e o documento HTML já força `UTF-8`. Se necessário, reexporte o XML na origem em UTF-8.

### Sintoma
- Notas canceladas continuam aparecendo na lista.

### Causa provável
- A versão anterior da tela carregava todos os nós `<nfs>` sem filtrar `isNfsCancelada`.

### Solução
- A tela agora descarta notas com `isNfsCancelada = Sim` antes de montar os totais, a tabela e o XLSX.
