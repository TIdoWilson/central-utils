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
  - debug opcional: `debug=1` para retornar diagnostico de extracao e contagem por arquivo

## Troubleshooting

### Sintoma
- Na VPS, os mesmos PDFs que funcionam no ambiente local podem falhar com `Sem registros validos para RECOLHER.`
- Na VPS, os mesmos PDFs podem gerar mais registros de relatorio do que no ambiente local, inflando as inconsistencias.

### Causa provavel
- Diferenca na extracao de texto do PDF entre ambientes. Em alguns PDFs, o parser baseado em `PyPDF2` pode perder ou fragmentar linhas relevantes do Razao/Relatorio, impedindo a identificacao dos registros de `RECOLHER`.
- Em outros casos, a extracao alternativa pode repetir linhas identicas do relatorio no Ubuntu/VPS, fazendo o parser contar notas duplicadas.

### Solucao
- O parser agora tenta extrair texto com mais de um backend (`PyPDF2`/`pypdf` e `pdfplumber`) e escolhe automaticamente a extracao com mais sinais validos para o layout da ferramenta. Isso reduz divergencias entre Windows/local e Ubuntu/VPS usando os mesmos arquivos.
- O parser do relatorio tambem passou a descartar linhas duplicadas exatas por `(nota, data, valor_pis, valor_cofins)`, evitando inflar o total de registros e as inconsistencias na VPS.
- Para comparar local x VPS com precisao, a API aceita `debug=1` e retorna no JSON qual extrator foi escolhido em cada PDF e quantos registros de razao/relatorio foram parseados por movimento.
