# Calculadora ICMS ST

## 1. Visão Geral

- **Slug:** `calculadora-icms-st`
- **Grupo:** Geral
- **Página (rota):** `/calculadora-icms-st`
- **API base:** _N/A_
- **Permissão RBAC:** `tool:calculadora-icms-st` ou `tool:*` (ADMIN acessa)

Ferramenta Calculadora ICMS ST no portal, com fluxo autenticado e controle de acesso por RBAC.

## 2. Objetivo Operacional

- Automatiza uma rotina operacional para reduzir trabalho manual e padronizar saída.
- Uso recomendado quando há alto volume, risco de erro manual ou necessidade de padronização de entrega.

## 3. Arquivos Relacionados (Verificados)

- **Página HTML:** `public/calculadora-icms-st.html`
- **Script JS da ferramenta:** `public/js/calculadora-icms-st.js`
- **Router Node:** _não identificado_
- **Service Node:** _não identificado_
- **Arquivos Python relacionados:** _não foi identificado arquivo Python específico para este slug_

## 4. Rotas e Endpoints

- **Rota de página:** `/calculadora-icms-st`;

## Troubleshooting

### Sintoma
- No servidor Linux/VPS, a página pode falhar ao abrir com `Cannot GET /calculadora-icms-st` ou carregar sem o JavaScript da ferramenta.

### Causa provavel
- Os arquivos da ferramenta estavam com letras maiúsculas no nome (`calculadora-ICMS-ST`), enquanto links e referências do portal já usavam slug minúsculo em parte da navegação. Em Windows isso pode passar despercebido, mas no Ubuntu a diferença de maiúsculas/minúsculas quebra rota e asset.

### Solucao
- Padronizar slug, rota e nomes de arquivos da ferramenta em minúsculo (`calculadora-icms-st`) e manter compatibilidade da rota dinâmica para acessos antigos.
- A exportacao XLSX tambem passou a usar bundle local em `/vendor/xlsx.full.min.js`, eliminando a dependencia de CDN externo.

### Sintoma
- A exportacao XLSX pode parar com a mensagem `Biblioteca XLSX nao carregada`.

### Causa provavel
- O front dependia de um bundle carregado via CDN externo, que nao estava disponivel de forma confiavel no portal.

### Solucao
- Servir o bundle do `xlsx` a partir do proprio portal em `/vendor/xlsx.full.min.js` e apontar a pagina para esse arquivo local.
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
