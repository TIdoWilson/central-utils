# conciliador-cartao-tipo50

## Visão geral
- Página: `/conciliador-cartao-tipo50`
- API Node: `/api/conciliador-cartao-tipo50/process`
- API Python: `/api/conciliador/cartao-tipo50`

Compara dois PDFs (Livro de Registros IOB e Balancete Tipo 50), identifica automaticamente qual é qual pelo conteúdo e gera um XLSX com:
- Aba `DIVERGENCIAS`
- Aba `CFOP_DIFERENTE`

## Entradas
- `arquivoA` (PDF)
- `arquivoB` (PDF)

## Saída
- JSON com:
- `filename`
- `xlsxBase64`
- `resumo`
- `divergencias`
- `cfopDiferente`

## Regras principais
- Conciliação por nota para divergências principais.
- Comparação por `NOTA + CFOP` na aba de CFOP.
- Anulação de pares opostos (+X/-X) na divergência.
- CFOP: remove linhas com `VALOR_RELATÓRIO = 0,00`.
- Tolerância padrão: `0,10`.

## Troubleshooting
- Sintoma: página abre mas processamento falha com erro 500/400.
- Causa provável: API Python não está rodando ou sem dependências (`fastapi`, `pydantic`, `openpyxl`, leitor PDF).
- Solução:
- Subir API Python no projeto `central-utils`.
- Validar import de `api.integra_api`.

- Sintoma: usuário não vê a ferramenta no menu.
- Causa provável: RBAC sem permissão `tool:conciliador-cartao-tipo50`.
- Solução: conceder permissão no admin de usuários ou usar `tool:*`.
