# Conversor Extrato PDF para OFX

- **Slug:** `conversor-extrato-pdf-ofx`
- **Grupo:** Contabil
- **API Base:** `/api/conversor-extrato-pdf-ofx`
- **Classificacao operacional:** `vps-compatible`

## O que esta ferramenta faz
Converte extratos bancarios em PDF para OFX, com suporte aos layouts de extrato Sicredi, Evolua e Stone.
Aceita envio de um ou varios PDFs e disponibiliza o resultado por arquivo (OFX) e em lote (ZIP).

## Como acessar
- Pagina: `/conversor-extrato-pdf-ofx`
- Permissao: `tool:conversor-extrato-pdf-ofx` ou `tool:*`
- Categoria no menu: Contabil

## Endpoint principal
- `POST /api/conversor-extrato-pdf-ofx/processar`
  - `multipart/form-data`
  - Campos:
    - `arquivos` (1..N PDFs)
    - `bankid` (opcional, padrao `0000`; codigo do banco escrito dentro da tag `BANKID` do OFX)
    - `acctid` (opcional; numero/identificador da conta escrito na tag `ACCTID`; se vazio, usa a conta detectada no PDF)

## Saida
- Lista de resultados por arquivo (status, banco identificado, conta final, total de lancamentos).
- `ofxBase64` para download individual.
- `zipBase64` para download consolidado.

## Campos OFX
- `BANKID`: identificador do banco no arquivo OFX. A ferramenta nao deduz esse valor hoje; ela envia exatamente o que for informado no formulario.
- `ACCTID`: identificador da conta no OFX. Quando o campo fica vazio, a API tenta extrair a conta do proprio extrato PDF e usa esse valor no arquivo final.

## Correcao registrada em 2026-03-24
- Sintoma: a ferramenta abria por URL direta, mas nao aparecia no card da home nem na sidebar do portal.
- Causa provavel: integracao parcial da navegacao; o slug existia no catalogo oficial e nas rotas, mas faltava cadastro manual em `public/js/sidebar.js` e o card correspondente em `public/home.html`.
- Solucao: inclusao da ferramenta na sidebar, criacao do card na home e reforco da explicacao de `BANKID`/`ACCTID` na propria tela.

## Correcao registrada em 2026-03-25
- Sintoma: o PDF da Stone podia exigir preenchimento manual de `ACCTID` ou gerar OFX com conta `0000`.
- Causa provavel: no extrato Stone o campo `Conta` pode vir sem `:` e em linha separada, fora do padrao usado pela regex anterior.
- Solucao: ajuste da extracao de conta para aceitar `Conta` sem `:` e com quebra de linha; regressao validada com os PDFs de exemplo da Stone, Evolua e Sicredi.

## Correcao registrada em 2026-03-25 (lancamentos e saldo final Stone)
- Sintoma: o OFX da Stone podia sair com um lancamento a menos e com `LEDGERBAL` divergente do saldo final do PDF.
- Causa provavel: o parser nao capturava movimentos em linha unica (ex.: `Saida Tarifa - R$ 0,11 R$ 14,89`) e sobrescrevia o saldo final com o saldo mais antigo do extrato, embora a Stone apresente os movimentos em ordem decrescente.
- Solucao: suporte a linhas Stone com descricao, valor e saldo na mesma linha, coleta mais robusta de contraparte e preservacao do primeiro saldo lido como saldo final real do extrato.

## Correcao registrada em 2026-03-25 (novo layout mensal do Evolua)
- Sintoma: o extrato `EXTRATO MES DE JULHO A DEZEMBRO 2025 EVOLUA.pdf` nao era reconhecido pelo parser antigo do Evolua.
- Causa provavel: esse modelo usa uma camada de texto codificada diferente do layout `EXTRATO ESPECIAL`, o que fazia a extracao direta falhar nas datas, valores e descricao.
- Solucao: adicionado fallback OCR apenas para esse layout, preservando o parser antigo do Evolua e calculando o valor pelo saldo do proprio extrato para reduzir divergencias.

## Correcao registrada em 2026-03-25 (datas OCR do Evolua mensal)
- Sintoma: o fallback OCR do novo layout Evolua reconhecia a maior parte das linhas, mas alguns dias vinham corrompidos, como `86/08/2025`.
- Causa provavel: o OCR estava trocando o `0` inicial do dia por `8` em uma pequena parte das linhas.
- Solucao: correção conservadora de datas OCR invalidas antes do `datetime.strptime`, sem alterar o parser classico do Evolua.

## Correcao registrada em 2026-03-26 (mes/ano OCR do Evolua mensal)
- Sintoma: algumas linhas do layout mensal do Evolua apareciam com mes fora do padrao e ano corrompido, como `27/18/225` e `10/12/2825`.
- Causa provavel: o OCR do PDF mensal mistura mes de uma pagina com leitura falsa de ano e, em alguns casos, `datetime.strptime` aceitava o ano errado como valido.
- Solucao: inferencia de mes por pagina, aceitando meses de 1 digito no OCR e rejeitando anos fora da faixa esperada antes de aplicar a correção.
## Correcao registrada em 2026-03-26 (qualidade OCR do Evolua mensal)
- Sintoma: o layout mensal do Evolua ainda gerava pequenas divergencias em credito, debito e saldo quando a imagem era rasterizada com escala baixa.
- Causa provavel: a leitura OCR perdia nitidez em algumas paginas intermediarias, mesmo com o extrato sendo de linha unica e colunas bem definidas.
- Solucao: aumento da escala de OCR usada pelo parser mensal do Evolua para melhorar a leitura dos valores e manter o parser classico, Stone e Sicredi sem alteracao.

## Correcao registrada em 2026-03-26 (fallback local do conversor)
- Sintoma: a conversao falhava com `connect ECONNREFUSED 127.0.0.1:8001` quando a API Python nao estava em execucao.
- Causa provavel: a rota do Node dependia exclusivamente do FastAPI local para converter os PDFs.
- Solucao: adicionado fallback local no proprio Node para executar o core Python do conversor quando o FastAPI estiver indisponivel, mantendo a mesma resposta para a tela.

## Correcao registrada em 2026-03-26 (normalizacao do historico OCR do Evolua mensal)
- Sintoma: o OFX do layout mensal do Evolua ainda saia com ruido de historico, principalmente em espacamento ao redor de `-`, `CR.INTERNET`, `PG.P/INTERNET` e alguns titulos curtos como `PREST.EMPREST` e `TAXA C/C NEG.`.
- Causa provavel: o OCR entregava a mesma informacao com variacoes de pontuacao e espacamento entre paginas, gerando divergencia visual desnecessaria no campo `MEMO`.
- Solucao: normalizacao adicional do `MEMO` apenas para o parser OCR do Evolua mensal, preservando data e valor e reduzindo o ruido de comparacao com o PDF.

## Correcao registrada em 2026-03-31 (layout Sicredi CCPI Iguacu)
- Sintoma: o PDF `EXTRATO.pdf` da Sicredi/Iguacu era reconhecido como Sicredi, mas o conversor gerava `Nenhum lancamento foi identificado para gerar OFX`.
- Causa provavel: esse layout vem com o texto praticamente colado em uma unica linha por pagina, usa saldos negativos com sinal na frente (`-41,84`) e nao encaixa no parser Sicredi antigo baseado em `splitlines()`.
- Solucao: adicionado parser segmentado para o layout `CCPI IGUACU`, com leitura por data no texto bruto, reconhecimento de saldos com sinal frontal e preservacao do parser Sicredi classico como fallback.
