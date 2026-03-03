# Comparador de Eventos de Holerite

## 1. Visao Geral

- **Slug:** `comparador-eventos-holerite`
- **Grupo:** Pessoal
- **Pagina (rota):** `/comparador-eventos-holerite`
- **API base:** `/api/comparador-eventos-holerite`
- **Permissao RBAC:** `tool:comparador-eventos-holerite` ou `tool:*` (ADMIN acessa)

Compara duas competencias dentro de um arquivo `.slk` de holerites e lista, por funcionario, os eventos que existiam no periodo inicial e nao aparecem no periodo final.

## 2. Objetivo Operacional

- Enviar um arquivo `.slk` exportado da folha.
- Deixar o sistema detectar automaticamente a competencia inicial e a final.
- Gerar preview em tela e Excel para download.
- Marcar apenas os eventos que devem permanecer visiveis no preview e no Excel final.

## 3. Arquivos Relacionados

- **Pagina HTML:** `public/comparador-eventos-holerite.html`
- **Script JS:** `public/js/comparador-eventos-holerite.js`
- **Router Node:** `src/routes/tools/comparador-eventos-holerite.routes.js`
- **Core Python:** `api/comparador_eventos_holerite_core.py`

## 4. Endpoint

- **POST** `/api/comparador-eventos-holerite/processar`

Campos:

- `arquivo`
- `ocultarEventosJson` (opcional)

## 5. Troubleshooting Rapido

- **400:** arquivo nao enviado, arquivo com quantidade invalida de competencias ou competencia nao encontrada no SLK.
- **403:** usuario sem permissao `tool:comparador-eventos-holerite`.
- **500:** falha interna no processamento do arquivo ou geracao do Excel.
