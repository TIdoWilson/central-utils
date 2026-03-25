# Conversor Extrato PDF para OFX

- **Slug:** `conversor-extrato-pdf-ofx`
- **Grupo:** Contabil
- **API Base:** `/api/conversor-extrato-pdf-ofx`
- **Classificacao operacional:** `vps-compatible`

## O que esta ferramenta faz
Converte extratos bancarios em PDF para OFX, com suporte aos layouts de extrato Sicredi e Evolua.
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
