# Conciliador PIS-COFINS

- **Slug:** `conciliador-pis-cofins`
- **Grupo:** Geral
- **API Base:** `/api/conciliador-pis-cofins`

## O que esta ferramenta faz
Compara os PDFs de Razao (PIS e COFINS) com o Relatorio de Apuracao e gera um XLSX com inconsistencias por nota.

## Como acessar
- Pagina: `/conciliador-pis-cofins`
- Permissao: `tool:conciliador-pis-cofins` ou `tool:*`

## Endpoint
- `POST /api/conciliador-pis-cofins/process`
  - multipart: `arquivos` (3 a 8 PDFs), `modo` (`AUTO`, `RECUPERAR`, `RECOLHER`)

## Troubleshooting

### Sintoma
- Na VPS, os mesmos PDFs que funcionam no ambiente local podem falhar com `Sem registros validos para RECOLHER.`

### Causa provavel
- Diferenca na extracao de texto do PDF entre ambientes. Em alguns PDFs, o parser baseado em `PyPDF2` pode perder ou fragmentar linhas relevantes do Razao/Relatorio, impedindo a identificacao dos registros de `RECOLHER`.

### Solucao
- O parser agora tenta extrair texto com mais de um backend (`PyPDF2`/`pypdf` e `pdfplumber`) e escolhe automaticamente a extracao com mais sinais validos para o layout da ferramenta. Isso reduz divergencias entre Windows/local e Ubuntu/VPS usando os mesmos arquivos.
