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
- `npm run dev` falha ao subir a API Python com `ModuleNotFoundError: No module named 'api.conciliador_pis_cofins_core'`.

### Causa provavel
- O arquivo `api/conciliador_pis_cofins_core.py` foi removido ou ficou ausente no workspace, mas `api/integra_api.py` continua importando `conciliar_pis_cofins`.

### Solucao
- Restaurar `api/conciliador_pis_cofins_core.py` mantendo o import existente em `api/integra_api.py`. Isso preserva a rota Python `/api/conciliador/pis-cofins` e a API Node `/api/conciliador-pis-cofins/process` sem quebrar compatibilidade.
