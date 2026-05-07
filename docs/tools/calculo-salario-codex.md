# Cálculo de Salário Codex

**Rota:** `/calculo-salario-codex`  
**Grupo:** Pessoal  
**Tipo:** Front-end puro (sem API)  
**Classificação:** `vps-compatible`

## Descrição

Versão independente da calculadora de salário usada para comparação direta com a planilha `docs/SALARIO 4.xlsx`, sem reaproveitar nem sobrescrever a calculadora anterior do repositório.

## Como funciona

1. A página carrega um snapshot estruturado da `SALARIO 4.xlsx`.
2. Cada aba da planilha aparece no seletor superior.
3. A interface converte a planilha em blocos visuais de calculadora, com campos humanos e resultados destacados.
4. Apenas os campos liberados na planilha ficam editáveis; parâmetros travados e resultados aparecem como somente leitura.
5. Ao alterar um campo editável, a aba é recalculada com base nas fórmulas originais extraídas do workbook.

## Abas disponíveis

- `FOLHA 2024`
- `PROLABORE`
- `PROLABORE 25`
- `PROLABORE 26`
- `FOLHA 2025`
- `FOLHA 2025 (2)`
- `FOLHA 2026`
- `FOLHA 2026 open`
- `MULTA FGTS`

## Fonte de verdade

- `docs/SALARIO 4.xlsx`
- O arquivo derivado `public/js/calculo-salario-codex-data.js` é gerado a partir desta planilha e preserva:
  - faixa usada por aba;
  - células editáveis;
  - fórmulas;
  - valores iniciais;
  - mesclas relevantes.

## Observações de compatibilidade

- A implementação é isolada da calculadora existente `calculo-salario`.
- Não existe dependência de Excel local nem de bibliotecas adicionais em runtime.
- A planilha não contém referências externas utilizáveis entre arquivos; a única fórmula inválida encontrada no workbook original está em `MULTA FGTS!A3` e é apenas exibida conforme o arquivo.

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| A página aparece como uma grade de planilha com coordenadas e metadados | A primeira versão da interface usava o workbook como representação visual, em vez de tratar a planilha apenas como motor de regras | Atualizar para a UI em blocos de calculadora da versão Codex corrigida, que mantém fórmulas e permissões sem expor a grade |
| Uma célula exibe aviso de fórmula inválida | O próprio workbook original contém `#REF!` nessa posição | Conferir a planilha de origem; a página não inventa regra para corrigir fórmula quebrada |
| Um valor editado não recalculou imediatamente | O recálculo é aplicado ao confirmar o campo (Enter ou sair do input) | Confirmar a edição do campo para disparar a nova avaliação da aba |
