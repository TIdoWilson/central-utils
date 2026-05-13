# Comparador FSIST x SPED

- **Slug:** `comparador-fsist-sped`
- **Grupo:** Fiscal
- **Página (rota):** `/comparador-fsist-sped`
- **API Base:** `/api/comparador-fsist-sped`
- **Classificação operacional:** `local-only`
- **Permissão RBAC:** `tool:comparador-fsist-sped` ou `tool:*` (ADMIN acessa)

## O que esta ferramenta faz

Compara as notas de entrada do SPED ICMS/IPI ou Contribuições com os XMLs exportados/salvos no FSIST.
O foco da análise fica apenas nas notas que existem no FSIST e não foram encontradas no SPED.
Além disso, a ferramenta lê os CSTs de PIS e COFINS dos XMLs e confronta com o que foi lançado no SPED, item a item.

## Como acessar

- Página: `/comparador-fsist-sped`
- Card na home: seção `Fiscal`
- Permissão: `tool:comparador-fsist-sped` ou `tool:*`

## Entradas

- 1 TXT do SPED.
- 1 ou mais arquivos do FSIST em `.xml` ou `.zip`.
- Leitura compatível com:
  - SPED ICMS/IPI: registros `C100` e `C170`.
  - SPED Contribuições: registros `A100`, `A170`, `C100` e `C170`.

## Saída

- Preview na tela com:
  - notas faltantes;
  - comparações de CST.
- Exportação em XLSX com 2 abas:
  - `Notas faltantes`
  - `CST comparacoes`

## Regras de comparação

- Só entram na análise as notas de entrada.
- XMLs de saída são ignorados.
- A conferência de notas ausentes considera chave, série e número quando a chave não estiver disponível.
- A comparação de CST usa os campos do XML:
  - `PIS/CST`
  - `COFINS/CST`
- Se o XML e o SPED não tiverem CST para o item, a linha é tratada como `SEM CST` e não vira divergência.

## Troubleshooting

### Sintoma
- O processamento falha com mensagem sobre arquivo inválido ou formato não suportado.

### Causa provável
- O arquivo do FSIST não é `.xml` nem `.zip`, ou o ZIP não contém XMLs válidos.

### Solução
- Enviar XMLs válidos do FSIST ou compactá-los em ZIP antes do upload.

### Sintoma
- O SPED é carregado, mas a ferramenta informa que não encontrou registros de entrada.

### Causa provável
- O arquivo enviado não é o SPED correto, ou o período/livro enviado contém apenas saídas. Em alguns livros de EFD-Contribuições há apenas `C100/C170` de saída e nenhum `C100/A100` com `IND_OPER=0`.

### Solução
- Conferir se o TXT corresponde ao SPED certo e se possui registros de entrada em `C100/C170` ou `A100/A170`. Quando o arquivo vier só com saídas, o comparador não tem base para confrontar o FSIST e a mensagem agora aponta a contagem de registros encontrados.

### Sintoma
- A exportação XLSX abre com acentuação quebrada.

### Causa provável
- O arquivo foi salvo fora de UTF-8 ou houve leitura incorreta na origem.

### Solução
- A rotina já grava a saída em UTF-8 e o download é feito em XLSX; se a origem tiver codificação inconsistente, reexportar o TXT/XML no sistema de origem.
