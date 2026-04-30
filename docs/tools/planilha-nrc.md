# Planilha NRC

- **Slug:** `planilha-nrc`
- **Grupo:** Contabil
- **API Base:** `/api/planilha-nrc`

## O que esta ferramenta faz
Recebe uma planilha de extratos bancarios, filtra os lancamentos por periodo (`MM/AAAA` inicial-final) e aplica regras de de/para para substituir o valor de `Agrupamento` com base no `Historico`.

## Como acessar
- Pagina: `/planilha-nrc`
- Permissao: `tool:planilha-nrc` ou `tool:*`
- Interface: layout interno padrao com sidebar/topbar global

## Fluxo operacional
1. Ajuste e salve as linhas de de/para (`Historico` -> `Agrupamento`).
2. Selecione o arquivo `.xlsx`/`.xls`.
3. Informe periodo inicial e final no formato `MM/AAAA`.
4. Clique em `Carregar` para processar.
5. Revise o resumo e conflitos de regras.
6. Clique em `Exportar Excel` para baixar o arquivo alterado.

## Regras de processamento
- Processa apenas abas que contem as colunas `Data`, `Historico` e `Agrupamento`.
- Aplica alteracoes somente nas linhas dentro do periodo informado (inclusivo por mes).
- A regra de de/para usa `contains` no campo `Historico` (comparacao case/acento-insensitive).
- Se mais de uma regra casar no mesmo historico, aplica a mais especifica (maior texto de busca).
- Em empate de especificidade, aplica a primeira regra da lista e registra conflito no resumo.
- Apenas a coluna `Agrupamento` e alterada.
- O arquivo de saida e sempre `.xlsx`.

## Persistencia
- Configuracao local: `data/planilha-nrc/config.json`
- Estrutura principal: `mappings: [{ historico, agrupamento }]`
- Salva em UTF-8 com saneamento de espacos, remocao de linhas vazias e deduplicacao.

## Endpoints
- `GET /api/planilha-nrc/health`
- `GET /api/planilha-nrc/config`
- `PUT /api/planilha-nrc/config` (CSRF obrigatorio)
- `POST /api/planilha-nrc/processar` (CSRF obrigatorio, multipart)
- `GET /api/planilha-nrc/download/:jobId/:fileName`

## Observacoes
- Ferramenta classificada como `local-only`.
- Upload `.xls` e convertido para `.xlsx` via Excel/COM no Windows antes do processamento.

## Diagnostico recente
- Sintoma: retorno `400` com mensagem de periodo invalido.
- Causa provavel: campo fora do formato `MM/AAAA` ou periodo inicial maior que final.
- Solucao aplicada: validacao explicita no front e no backend com mensagens objetivas.
