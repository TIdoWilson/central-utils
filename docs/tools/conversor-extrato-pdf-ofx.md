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
    - `bankid` (opcional, padrao `0000`)
    - `acctid` (opcional, sobrescreve conta detectada)

## Saida
- Lista de resultados por arquivo (status, banco identificado, conta final, total de lancamentos).
- `ofxBase64` para download individual.
- `zipBase64` para download consolidado.
