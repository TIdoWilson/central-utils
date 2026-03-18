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

### Sintoma (upload por arrastar/soltar)

- Ao arrastar e soltar o PDF na pagina, o nome do arquivo aparece, mas o preview e a previa automatica nao atualizam.
- O fluxo passa a funcionar apenas quando o arquivo e escolhido pelo seletor nativo (`Selecionar PDF do cartao`).

### Causa provavel (upload por arrastar/soltar)

- O helper global de upload (`public/js/upload-helper.js`) atribuia `input.files` no evento `drop`, mas no drop local nao disparava o evento `change`.
- Como a tela `cartao-horas-iob` depende do `change` para atualizar preview, status e processamento automatico, o arquivo ficava sem processamento.

### Solucao (upload por arrastar/soltar)

- O helper foi ajustado para sempre disparar `change` apos aplicar arquivos via drag-and-drop (drop local e drop global).
- Com isso, arrastar/soltar e selecionar pelo popup passam a seguir o mesmo fluxo de processamento da ferramenta.
