# IRPF Carne Leao

## 1. Visão Geral

- **Slug:** `irpf-carne-leao`
- **Grupo:** Geral
- **Página (rota):** `/irpf-carne-leao`
- **API base:** _N/A_
- **Permissão RBAC:** `tool:irpf-carne-leao` ou `tool:*` (ADMIN acessa)

Simule IR mensal com regras 2024, 2025 e 2026 (inclui redutor 2026).

## 2. Objetivo Operacional

- Informe rendimentos, despesas, dependentes e ajustes. A ferramenta calcula base, imposto devido e saldo a pagar/compensar em todos os períodos de tabela dos PDFs.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/irpf-carne-leao.html`
- **Script JS da ferramenta:** `public/js/irpf-carne-leao.js`
- **Router Node:** _não identificado_
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** _não foi identificado arquivo Python específico para este slug_

## 4. Rotas e Endpoints

- **Rota de página:** `/irpf-carne-leao`;
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
