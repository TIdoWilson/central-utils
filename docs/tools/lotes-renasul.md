# Lotes Renasul

- **Slug:** `lotes-renasul`
- **Grupo:** Contabil
- **API Base:** `/api/lotes-renasul`

## O que esta ferramenta faz
Cadastro local de de/para e centros de custo para processar o resumo mensal da folha Renasul e gerar o TXT no layout IOB.

## Como acessar
- Pagina: `/lotes-renasul`
- Permissao: `tool:lotes-renasul` ou `tool:*`
- Interface: layout interno padrao com sidebar e topbar global

## Fluxo operacional
1. Ajuste os cadastros de `De/para` e `Centros de custo`.
2. Selecione o arquivo `.xls` da folha.
3. Clique em `Validar` para conferir se faltam contas.
4. Se nao houver pendencias, clique em `Gerar TXT`.
5. Se houver pendencias, preencha os campos diretamente na tabela de pendencias e clique em `Salvar cadastros`.

## Regras de processamento
- Usa apenas os quadros de resumo da folha.
- Ignora linhas informativas.
- Ignora linhas com `*` na coluna de valor.
- Mantem um preview separado de eventos localizados, pendencias e TXT.
- Os quadros de `Eventos localizados` e `Pendencias de de/para` ficam empilhados um sobre o outro.

## Diagnostico recente
- Sintoma: `500` com erro de leitura do `.xls`, incluindo `Unsupported format, or corrupt file: Expected BOF record`.
- Causa provavel: o upload caia no leitor `xlrd`, que falhava nesse workbook especifico.
- Solucao aplicada: leitura do `.xls` passou a tentar `python-calamine` antes do `xlrd`, mantendo `COM`/`openpyxl` como fallback.

## Observacoes
- Ferramenta `local-only`.
- O arquivo de configuracao fica em `data/lotes-renasul/config.json`.
- A geracao do TXT exige que o arquivo passe primeiro pela validacao.
- O salvamento de cadastros pode ser feito diretamente pela tabela de pendencias sem sair da tela principal.
