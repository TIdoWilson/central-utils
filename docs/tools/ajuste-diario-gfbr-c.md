# Ajuste Diario Gfbr C

## 1. Visão Geral

- **Slug:** `ajuste-diario-gfbr-c`
- **Grupo:** Geral
- **Página (rota):** `/ajuste-diario-gfbr-c`
- **API base (Node):** `/api/ajuste-diario-gfbr-c`
- **Permissão RBAC:** `tool:ajuste-diario-gfbr-c` ou `tool:*` (ADMIN acessa)

Versão de alto desempenho do ajuste diário GFBR. O Node atua como gateway, a API em Go executa a orquestração do processamento e o executável `.NET/C#` aplica as regras na planilha.

## 2. Objetivo Operacional

- Processar o diário contábil (`.xlsx`) removendo grupos transitórios e linhas indesejadas.
- Separar estornos e produzir resumo técnico do processamento.
- Disponibilizar download do arquivo ajustado e, quando habilitado, do backup.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/ajuste-diario-gfbr-c.html`
- **Script JS da página:** `public/js/ajuste-diario-gfbr-c.js`
- **Router Node (gateway):** `src/routes/tools/ajuste-diario-gfbr-c.routes.js`
- **API Go:** `go-api/main.go`
- **Binário .NET usado pela API Go:** `go-api/bin/AjusteDiarioGfbr.exe` (Windows)
- **Service Node dedicado:** _não há; a orquestração está no router + API Go_

## 4. Rotas e Endpoints

- **Página interna:** `GET /ajuste-diario-gfbr-c`
- **Node -> cliente:**
  - `POST /api/ajuste-diario-gfbr-c/processar`
  - `GET /api/ajuste-diario-gfbr-c/download/ajustado/:id`
  - `GET /api/ajuste-diario-gfbr-c/download/backup/:id`
- **Go API (upstream):**
  - `POST /api/ajuste-diario-gfbr-c/processar`
  - `GET /api/ajuste-diario-gfbr-c/download/ajustado/:id`
  - `GET /api/ajuste-diario-gfbr-c/download/backup/:id`

## 5. Fluxo Técnico Real

1. Usuário envia arquivo na página (`public/js/ajuste-diario-gfbr-c.js`).
2. Front chama `POST /api/ajuste-diario-gfbr-c/processar` (multipart).
3. Router Node valida upload e repassa para `GO_API_URL` (default `http://127.0.0.1:8002`).
4. Go salva arquivo temporário em `go-api/work`, executa `AjusteDiarioGfbr.exe` e parseia o resumo.
5. Go retorna `download_id`, `download_url_ajustado` e `download_url_backup`.
6. Front habilita os botões de download e exibe métricas.

## 6. Configuração de Runtime (Go + C#)

- `GO_API_URL`: URL base consumida pelo Node para chamar a API Go.
- `GO_API_PORT`: porta de publicação da API Go.
- `AJUSTE_DIARIO_GFBR_BIN`: caminho do binário `.NET`; se ausente, Go tenta `go-api/bin/AjusteDiarioGfbr(.exe)`.

Pré-requisitos:
- Processo da Go API ativo.
- Binário `.NET` acessível no host.
- Permissão de escrita em `go-api/work`.

## 7. Segurança e Governança

- Exige autenticação e RBAC da ferramenta.
- `POST /processar` exige CSRF (`x-csrf-token`).
- Downloads são protegidos por sessão e permissão via middleware do servidor Node.
- No fluxo atual, a API Go não é pública por si só; deve ficar restrita à rede interna/local.

## 8. Entradas, Saídas e Erros Comuns

Entradas:
- Campo `arquivoDiario` (`.xlsx`).
- Opcionais: `abaOrigem`, `criarBackup`.

Saídas:
- JSON com `resultado`, `download_id` e URLs de download.
- Arquivo ajustado e backup opcional.

Erros observáveis:
- `400 Arquivo é obrigatório`: upload sem arquivo.
- `500 Executável .NET não encontrado`: validar `AJUSTE_DIARIO_GFBR_BIN` e `go-api/bin/`.
- `504 Processamento excedeu o tempo limite`: arquivo grande ou travamento do binário.
- `404 download`: ID expirado (janela curta de retenção no Go).

## 9. Observações de Manutenção

- O documento antigo citava Python para este slug; o fluxo atual é **Node + Go + .NET**, sem core Python nesta rota.
- Se alterar payload entre Node e Go, atualizar este `.md` e o front (`public/js/ajuste-diario-gfbr-c.js`) no mesmo commit.
- Ao surgir incidente real em produção, registrar aqui em seção de erros com causa e correção aplicada.
