# Lotes TXT

## 1. Visao geral

- Slug: `lotes-txt`
- Grupo (menu): `Contabil`
- Pagina: `/lotes-txt`
- API dedicada: nao (processamento em front-end)
- Permissao RBAC: `tool:lotes-txt` ou `tool:*` (ADMIN tambem acessa)
- Classificacao operacional: `vps-compatible`

A ferramenta le o TXT de lote contabil, identifica lancamentos (`L`), totaliza debitos e creditos, mostra diagnostico de diferencas por dia e por lancamento (sem consolidacao) e permite gerar um TXT ajustado (com fatiamento opcional de periodo).

## 2. Fonte do layout

- Referencia oficial IOB: [Layout do Arquivo de Importacao/Exportacao de Lote Normal](https://ajudaonline.iob.com.br/SGC/cscoutimpnorlay.htm)

Campos usados no parser:
- Registro de lancamento `L`
- Conta a debito: posicao `010 a 015`
- Conta a credito: posicao `016 a 021`
- Classificacao a debito: posicao `068 a 081`
- Classificacao a credito: posicao `082 a 095`
- Valor: posicao `050 a 064` (2 casas decimais implicitas)
- Sequencia: posicao `096 a 100`
- Historico padrao: `022 a 024`
- Complemento: `025 a 049`
- Historico (4 digitos): `533 a 536`
- Registro `H` (historico especial): texto em `002 a 051`

## 3. Fluxo de uso

1. Abrir `/lotes-txt`.
2. Anexar o arquivo `.txt`.
3. Clicar em **Ler arquivo**.
4. Conferir totais de debitos/creditos.
5. (Opcional) Usar o quadro **Dividir periodo** para definir data inicial/final.
6. No diagnostico de diferencas, revisar lancamentos linha a linha e ajustar valor quando necessario.
7. Na tabela de pendencias, preencher Debito e/ou Credito na mesma linha (quando houver pendencias).
8. Clicar em **Baixar TXT ajustado**.

## 4. Regras de processamento

- Linha iniciando com `L`: tratada como lancamento contabil.
- Linha iniciando com `H` apos um `L`: agregada como historico especial daquele lancamento.
- Para cada lado (debito/credito), a ferramenta considera preenchido quando existir conta reduzida **ou** classificacao contabil.
- Pendencia ocorre somente para **linhas de lancamento em que debito e credito** estejam sem conta reduzida e sem classificacao.
- O diagnostico de diferencas mostra somente os lancamentos **suspeitos** da causa da diferenca (sem consolidar linhas) e exibe conta de debito e conta de credito.
- Para comparar historicos semelhantes no diagnostico, a ferramenta usa somente **Complemento (025-049)** e **Historico especial (registro H)**.
- Os codigos de historico (`022-024` e `533-536`) nao entram na comparacao e nao sao exibidos na tabela de diagnostico.
- Se o dia tiver lancamentos sem conta, eles sao priorizados no diagnostico como provavel causa da diferenca.
- Quando o diagnostico seleciona um grupo de historico semelhante, ele lista os lancamentos a debito **e** a credito do grupo para facilitar a localizacao do erro.
- Se os lancamentos sem conta nao cobrirem exatamente o valor da diferenca do dia, o diagnostico procura o restante da diferenca pelos historicos semelhantes.
- No diagnostico, o campo de valor e editavel para ajuste direto do lancamento.
- A ordem da listagem no diagnostico segue a ordem original das linhas no TXT.
- A tela exibe os dois campos (Debito/Credito) na mesma linha da pendencia.
- O TXT pode ser gerado quando houver pelo menos um dos dois campos preenchido em qualquer linha pendente.
- O TXT tambem pode ser gerado quando houver ajuste de valor no diagnostico.
- Quando nao houver preenchimento nas pendencias, o TXT ainda pode ser gerado se houver fatiamento de periodo ativo.
- Os campos de periodo sao apenas para divisao/fatiamento do TXT (uso opcional).
- No download, o total do cabecalho (`C`, posicao `011 a 025`) e recalculado com base no total de debitos do arquivo final.
- A secao de diagnostico lista: dias com diferenca (`debitos - creditos`) e os lancamentos suspeitos desses dias.
- Arquivo de saida preserva as demais colunas/linhas e altera somente campos de conta faltante e/ou valor ajustado.

## 5. Arquivos relacionados

- Pagina: `public/lotes-txt.html`
- Script: `public/js/lotes-txt.js`
- Layout compartilhado ERP TXT: `public/js/shared/erp-txt-layouts.js`
- Menu: `public/js/sidebar.js`
- Catalogo RBAC: `src/core/tool-catalog.json`

O layout do ERP (IOB Lote Normal) fica centralizado em `window.ErpTxtLayouts` para reuso por outros scripts front-end.
Exemplo de uso:

```js
const fields = window.ErpTxtLayouts?.IOB_LOTE_NORMAL?.fields;
```

## 6. Troubleshooting

### Sintoma
Ao arrastar um arquivo para a pagina, nao aparece o feedback visual de upload ("Solte o arquivo para fazer o upload"/"anexar aqui").

### Causa provavel
A pagina estava sem o helper global de upload (`/js/upload-helper.js`) e com drag-and-drop manual local, fora do padrao visual global.

### Solucao
A pagina passou a incluir o helper global e o drag-and-drop manual do `lotes-txt` foi removido para usar o comportamento padrao (`wl-upload-area--dragover` e `body.wl-page-dragover`).

---

### Sintoma
Botao de download permanece desabilitado.

### Causa provavel
Nao existe nenhum campo Debito/Credito preenchido com formato valido, nao ha ajuste de valor no diagnostico, ou ha campo invalido.

### Solucao
Preencher ao menos um campo Debito ou Credito com formato valido em qualquer linha de pendencia, ou ajustar valor valido no diagnostico.

- Se informar ate 6 digitos numericos, a ferramenta grava como **conta reduzida**.
- Se informar alfanumerico (ou mais de 6 caracteres), a ferramenta grava como **classificacao contabil**.

O botao sera habilitado automaticamente.

---

### Sintoma
Valor total do lote no cabecalho nao confere apos fatiar periodo ou ajustar lancamentos.

### Causa provavel
O arquivo foi gerado sem recalcular o campo de total do registro `C` (posicao `011 a 025`).

### Solucao
A ferramenta recalcula automaticamente o total de debitos do arquivo final e grava no cabecalho durante a geracao do TXT.

---

### Sintoma
Existem diferencas no dia e o usuario precisa ajustar valor por linha.

### Causa provavel
A grade nao filtrava os suspeitos da causa da diferenca e ficava poluida com todos os lancamentos do dia.

### Solucao
Usar o bloco **Diagnostico de diferencas**:
1. conferir a tabela de dias com diferenca;
2. revisar apenas os lancamentos suspeitos listados (sem consolidacao);
3. ajustar o valor na coluna editavel e gerar o TXT.

---

### Sintoma
Dia com diferenca tem lancamentos sem conta e eles nao eram priorizados no diagnostico.

### Causa provavel
Heuristica anterior priorizava apenas desequilibrio por historico semelhante.

### Solucao
Quando houver lancamento sem conta no dia com diferenca, a ferramenta passa a listar esses lancamentos como suspeitos prioritarios da causa.

---

### Sintoma
Diagnostico de historicos semelhantes trouxe apenas lancamentos de um lado (so debito ou so credito).

### Causa provavel
Heuristica anterior destacava apenas o lado em excesso do grupo desequilibrado.

### Solucao
Ao detectar grupo suspeito por historico semelhante, a ferramenta lista debitos e creditos do grupo.
Se houver lancamentos sem conta e eles nao fecharem a diferenca do dia, o sistema tambem busca o restante da diferenca por historicos semelhantes.

---

### Sintoma
Diferenca residual pequena (ex.: `R$ 0,04`) nao era localizada quando havia lancamento sem conta de valor alto no mesmo dia.

### Causa provavel
Selecao de grupos suspeitos priorizava primeiro os maiores valores de diferenca, em vez do grupo mais aderente ao restante da diferenca do dia.

### Solucao
Quando houver restante da diferenca apos os sem conta, o diagnostico prioriza grupos de historico semelhante com valor mais proximo do restante, permitindo localizar residuos pequenos.

---

### Sintoma
Arquivo com classificacao contabil foi marcado como pendente indevidamente.

### Causa provavel
Integracao antiga considerava apenas conta reduzida (`010-015` e `016-021`), ignorando classificacao (`068-081` e `082-095`).

### Solucao
Ferramenta atualizada para validar preenchimento por **conta reduzida ou classificacao** em cada lado do lancamento.

---

### Sintoma
Nenhuma pendencia aparece, mas o usuario esperava contas faltantes.

### Causa provavel
No arquivo, as contas ja estao preenchidas (diferentes de vazio/`000000`) ou o layout nao esta no padrao `L`/`H` esperado.

### Solucao
Validar o TXT na origem e conferir se os registros de lancamento iniciam com `L` e obedecem as posicoes do layout IOB.

---

### Sintoma
Os acentos do TXT de origem ou do arquivo ajustado saem quebrados.

### Causa provavel
O arquivo foi lido com uma codificacao fixa diferente da codificacao real do TXT, o que corrompia os caracteres acentuados antes da geracao.

### Solucao
A ferramenta passou a detectar UTF-8, Windows-1252 e Latin1 antes de processar o arquivo, e a saida continua sendo gerada em UTF-8.
