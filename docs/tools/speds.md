# SPEDS

- **Slug:** `speds`
- **Grupo:** Fiscal
- **API Base:** `/api/speds`

## O que esta ferramenta faz
Centraliza as rotinas de SPED ICMS/IPI, Contribuicoes, ECD e ECF em uma unica pagina com templates dinamicos.
Cada template define arquivos exigidos, campos extras, formato de saida e o script Python associado.
Na area de Contribuicoes, inclui a rotina `Contribuicoes - Consolidar SPEDs`, que combina matriz + filiais em um unico TXT para download.

## Como acessar
- Pagina: `/<slug>` (rota dinamica)
- Permissao: `tool:speds` ou `tool:*`
- Admin: sempre acessa (paginas admin sao separadas)
- UI interna: layout padrao com sidebar e topbar global (injetada por `sidebar.js`)

## Endpoints (se aplicavel)
- `GET /api/speds/health`
- `GET /api/speds/types`
- `GET /api/speds/templates?spedType=<tipo>`
- `GET /api/speds/templates/:templateId?spedType=<tipo>`
- `POST /api/speds/run` (CSRF obrigatorio)

## Templates relevantes
- `Contribuicoes - Consolidar SPEDs`: recebe 1 arquivo da matriz e 1 ou mais arquivos das filiais, executa o script `W:\DOCUMENTOS ESCRITORIO\INSTALACAO SISTEMA\python\Combinar SPEDs Matriz + Filiais\Combinador_SPEDs.py` e devolve o TXT consolidado.
- Classificacao operacional do template `Contribuicoes - Consolidar SPEDs`: `local-only`.
- A integracao copia os uploads para uma pasta temporaria com nomes previsiveis antes de chamar o script, preservando o nome final do download conforme o arquivo da matriz.

## Observacoes de seguranca
- Mutacoes exigem `x-csrf-token`
- Nunca servir HTML por static; pagina deve ser acessada sem `.html`
- Nao incluir botao local de logout na pagina (usar logout global da sidebar/topbar)
