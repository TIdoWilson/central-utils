# Gerador TXT GFBR

## 1. Visao geral

- Slug: `gfbr-gerador-txt`
- Grupo (menu): `Contabil`
- Pagina: `/gfbr-gerador-txt`
- API base (Node): `/api/gfbr-gerador-txt`
- API Python: `/api/gfbr-gerador-txt/processar`
- Permissao RBAC: `tool:gfbr-gerador-txt` ou `tool:*` (ADMIN tambem acessa)
- Classificacao operacional: `vps-compatible`

A ferramenta converte o diario GFBR (Excel) para TXT no layout IOB (`C`, `L`, `H`) usado no fluxo do `lotes-txt`, gerando obrigatoriamente o arquivo final com nome `LOTD0000.txt`.

## 2. Entradas e saidas

Entradas:
- arquivo Excel (`.xlsx`/`.xlsm`) do diario
- nome da aba (opcional)
- mapeamento automatico de prefixos de parceiro para conta contabil:
  `TG`, `SW`, `DR` -> `1.1.2.02.04.01`; `CL`/`BF` -> `1.1.2.01.01.01`; `F` -> `2.1.1.01.01.01`

Saidas:
- `LOTD0000.txt` (layout IOB)
- `PENDENCIAS_GFBR.csv`
- `EXCLUSOES_GFBR.csv`

## 3. Fluxo tecnico

1. Front faz upload na pagina `public/gfbr-gerador-txt.html`.
2. JS chama `POST /api/gfbr-gerador-txt/processar` via `AuthClient.authFetch`.
3. Router Node salva upload em `data/uploads/gfbr-gerador-txt`, cria pasta de saida por execucao e chama FastAPI.
4. Core Python:
   - le e agrupa lancamentos da planilha;
   - aplica regras de exclusao (direta + cancelamentos/estornos);
   - mapeia contas de parceiros para contas contabeis;
   - gera partidas no layout IOB e escreve `LOTD0000.txt`;
   - gera CSVs de pendencias e exclusoes.
5. Front habilita os botoes de download.

## 4. Arquivos relacionados

- Pagina: `public/gfbr-gerador-txt.html`
- Script da pagina: `public/js/gfbr-gerador-txt.js`
- Router Node: `src/routes/tools/gfbr-gerador-txt.routes.js`
- Core Python: `api/gfbr_gerador_txt_core.py`
- Endpoint FastAPI: `api/integra_api.py`

## 5. Troubleshooting

### Sintoma
Erro de cabecalho ao processar o Excel.

### Causa provavel
A aba enviada nao possui os campos obrigatorios do diario GFBR (ex.: numero de sequencia, numero de transacao, data, conta e valor).

### Solucao
Validar se o arquivo e a aba corretos foram exportados do sistema origem e reenviar.

---

### Sintoma
TXT gerado com poucas linhas `L`.

### Causa provavel
Lancamentos com itens sem pareamento debito x credito foram enviados para pendencias em vez de compor partida contabil.

### Solucao
Baixar `PENDENCIAS_GFBR.csv`, ajustar dados de origem/mapeamento e processar novamente.
