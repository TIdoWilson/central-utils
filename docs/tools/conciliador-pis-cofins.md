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

