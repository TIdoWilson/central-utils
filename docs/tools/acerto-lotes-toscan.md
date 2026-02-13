# Acerto Lotes Toscan

## 1. Visão Geral

- **Slug:** `acerto-lotes-toscan`
- **Grupo:** Geral
- **Página (rota):** `/acerto-lotes-toscan`
- **API base:** _N/A_
- **Permissão RBAC:** `tool:acerto-lotes-toscan` ou `tool:*` (ADMIN acessa)

Remove do TXT do Toscan os lançamentos cuja linha de histórico (H) está em branco, gerando um arquivo ajustado e um relatório das linhas excluídas.

## 2. Objetivo Operacional

- Envie o arquivo TXT de lançamentos gerado pelo Toscan. A ferramenta identifica pares de linhas L/H em que o histórico está em branco, remove esses lançamentos do arquivo principal e disponibiliza um arquivo separado com todas as linhas excluídas para conferência.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/acerto-lotes-toscan.html`
- **Script JS da ferramenta:** `public/js/acerto-lotes-toscan.js`
- **Router Node:** _não identificado_
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** _não foi identificado arquivo Python específico para este slug_

## 4. Rotas e Endpoints

- **Rota de página:** `/acerto-lotes-toscan`;
- **Base de API esperada:** _sem API dedicada no catálogo_;
- **Endpoints no router:** _não foi possível extrair endpoints específicos (arquivo ausente ou dinâmica indireta)._

## 5. Fluxo Técnico (Página -> Node -> Python/Serviço)

- Front-end coleta parâmetros/arquivos e chama APIs internas (preferência por `AuthClient.authFetch`).
- Router valida entrada, aplica segurança (CSRF em mutações quando aplicável) e orquestra o processamento.
- Service concentra regra de negócio, integração com armazenamento e chamadas a serviços externos/Python.
- Retorno padronizado em JSON e/ou arquivo para download.

## 6. Segurança e Governança

- Exige autenticação ativa no portal.
- RBAC por ferramenta (`tool:<slug>`, `tool:*`, ADMIN).
- Em mutações, usar token CSRF via header `x-csrf-token` (exceto login).
- `auditLog` deve registrar evento sem interromper a requisição em falhas de auditoria.

## 7. Entradas e Saídas Esperadas

- **Entradas:** parâmetros de formulário e/ou upload conforme UI da ferramenta.
- **Saídas:** resposta em tela e, quando aplicável, artefatos (ZIP/PDF/XLSX/CSV/JSON).
- **Observação:** validar encoding, formato e tamanho dos arquivos para evitar erro 400/422.

## 8. Troubleshooting Rápido

- **401/403:** conferir sessão do usuário e permissão RBAC.
- **404 em endpoint:** validar rota no `router` e base URL consumida no JS.
- **422/400:** revisar campos obrigatórios e estrutura do arquivo enviado.
- **500:** inspecionar logs do Node e, quando existir, logs do processamento Python.

## 9. Observações de Manutenção

- Ao alterar nomes de arquivo/rota, manter compatibilidade (alias/redirect) para não quebrar links legados.
- Se incluir nova API/fluxo, atualizar este documento e `src/core/tool-catalog.json`.
