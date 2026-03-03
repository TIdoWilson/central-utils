# Cartao Horas IOB

## Visao geral

- Pagina: `/cartao-horas-iob`
- API Node: `/api/cartao-horas-iob`
- API Python: `/api/cartao-horas-iob/processar`
- Classificacao operacional: `local-only`

## Dependencias

- O endpoint depende de um script externo localizado dentro da pasta `python/`:
  - `Conversor de PDF Cart* de Horas para TXT + Conversor para IOB/extrair_cartoes_para_excel.py`

## Troubleshooting

### Sintoma

- A API Python da VPS nao sobe e o `central-python` entra em loop com erro:
  - `FileNotFoundError: Nao foi possivel localizar o script de conversao do cartao de horas para IOB.`

### Causa provavel

- O modulo `api.cartao_horas_iob_core` era importado na inicializacao global de `api/integra_api.py`.
- Em ambiente sem o script auxiliar dessa ferramenta, toda a API Python falhava antes mesmo de servir outras rotas.

### Solucao

- O carregamento do modulo foi alterado para acontecer sob demanda, apenas quando o endpoint `/api/cartao-horas-iob/processar` e chamado.
- Em ambientes sem o script auxiliar, o endpoint agora responde `503` com mensagem especifica, sem derrubar a API Python inteira.
- Para usar a ferramenta neste ambiente, copie o script auxiliar esperado para a pasta `python/` ou mantenha a ferramenta apenas no ambiente local Windows.
