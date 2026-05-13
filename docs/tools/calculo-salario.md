# Cálculo de Salário / Pró-labore

**Rota:** `/calculo-salario`  
**Grupo:** Pessoal  
**Tipo:** Front-end puro (sem API)  
**Classificação:** `vps-compatible`

## Descrição

Ferramenta que replica a planilha `docs/SALARIO 4.xlsx`. Permite calcular folha de pagamento CLT, pró-labore e multa rescisória (FGTS) para os anos 2024, 2025 e 2026, respeitando as tabelas de INSS e IRRF de cada período.

## Base de feriados 2026

- O arquivo `data/calculo-salario/feriados_2026.json` mantém apenas feriados e pontos facultativos usados no cálculo; registros com `type: commemorative` não devem entrar na base operacional.
- Localizações municipais devem permanecer padronizadas com `locations[].name` em maiúsculo e `locations[].code` no formato `UF-slug`, evitando cidades duplicadas por diferença de caixa ou grafia inconsistente.
- Registros logicamente iguais também devem ser deduplicados por `data + tipo + nome + local`, mesmo quando a origem trouxer formatos diferentes para a data (`YYYY-MM-DD` e `YYYY-MM-DDT00:00:00.000Z`).

## Abas disponíveis

| Aba | Tipo | Período |
|-----|------|---------|
| FOLHA 2026 | CLT progressivo | 2026 |
| FOLHA 2025 (2) | CLT (tabela IRRF 2026) | 2025 |
| FOLHA 2025 | CLT progressivo | 2025 |
| FOLHA 2024 | CLT progressivo | 2024 |
| FOLHA 2026 open | CLT (dois funcionários) | 2026 |
| PROLABORE 26 | Pró-labore 11% plano | 2026 |
| PROLABORE 25 | Pró-labore 11% progressivo | 2025 |
| PROLABORE | Pró-labore 11% progressivo | 2024/2025 |
| MULTA FGTS | Multa rescisória 40% | — |

## Campos editáveis (CLT / Pró-labore)

- **Salário Base** — valor mensal bruto (I3)
- **Dias Trabalhados** — proporcional (D3, padrão: 30)
- **Dias do Mês** — (E3, padrão: 30)
- **Horas Extras 50%** — horas e minutos (H18/I18)
- **Horas Extras 100%** — horas e minutos (H19/I19)
- **Adicional Noturno 20%** — horas e minutos (H20/I20)
- **Dependentes** — quantidade (N10), deduz R$ 189,59/dep. da base IRRF
- **Dias Úteis** — divisor DSR (H14), ajustável por mês
- **Domingos/Feriados** — multiplicador DSR (H15)

## Campos calculados

| Campo | Fórmula | Referência planilha |
|-------|---------|---------------------|
| Valor da hora | I3 / 220 | I8 |
| Salário proporcional | (I5/E3)*D3 | F3 |
| Horas extras + DSR | P29+P30+P31+P32 | I4 |
| Base INSS | I3 + I4 | I5 |
| (-) INSS | progressivo / plano | F5 |
| (-) IRRF | min(Q34, Q35) | F6 |
| (=) Salário líquido | F3 - F5 - F6 | F8 |
| FGTS | base × 8% | I10 |

## Regras especiais de IRRF

- **FOLHA 2026:** usa fórmula com desconto simplificado (R10=0.133145, R11=978.62). IRRF zerado quando diferença < R$ 10,00.
- **FOLHA 2025 (2):** IRRF zerado quando < R$ 10,00.
- **PROLABORE 26:** INSS flat 11%, cap R$ 988,09. Deduão simplificada = R$ 564,80.

## ParÃ¢metros avanÃ§ados compartilhados

- A ediÃ§Ã£o dos parÃ¢metros avanÃ§ados exige usuÃ¡rio `ADMIN` ou e-mail explicitamente liberado na lista de controle da prÃ³pria ferramenta.
- UsuÃ¡rios fora dessa lista continuam usando a calculadora normalmente, mas nÃ£o podem persistir alteraÃ§Ãµes em tabelas de IRRF/INSS, teto do INSS, percentual do prÃ³-labore nem lista de e-mails autorizados.
- As tabelas de IRRF sÃ£o sincronizadas entre as abas vinculadas de folha e prÃ³-labore ao salvar os parÃ¢metros avanÃ§ados.
- Nas abas de prÃ³-labore, o modal avanÃ§ado exibe e permite alterar tanto o percentual do INSS quanto o teto do INSS.

- Usuarios sem permissao de edicao ainda podem abrir o modal em modo somente leitura para consultar os parametros.
- Entre abas do mesmo ano, a sincronizacao inclui: `diasTrab`, `diasMes`, `dsr.diasUteis`, `dsr.domingosFer`, `params.fgtsRate`, `params.valorPorDep`, `params.deducaoSimplificada`, `inssMax` e `irrfBands`.

## Tabelas por ano

### INSS 2024
| Faixa | Até | Alíquota |
|-------|-----|----------|
| 1 | R$ 1.412,00 | 7,5% |
| 2 | R$ 2.666,68 | 9% |
| 3 | R$ 4.000,03 | 12% |
| 4 | R$ 7.786,02 | 14% |

### INSS 2025
| Faixa | Até | Alíquota |
|-------|-----|----------|
| 1 | R$ 1.518,00 | 7,5% |
| 2 | R$ 2.793,88 | 9% |
| 3 | R$ 4.190,83 | 12% |
| 4 | R$ 8.157,41 | 14% |

### INSS 2026
| Faixa | Até | Alíquota |
|-------|-----|----------|
| 1 | R$ 1.621,00 | 7,5% |
| 2 | R$ 2.902,84 | 9% |
| 3 | R$ 4.354,27 | 12% |
| 4 | R$ 8.475,55 | 14% |

### IRRF 2025 (base < R$ 2.259,20: isento)
| Faixa | Até | Alíquota | Dedução |
|-------|-----|----------|---------|
| 1 | R$ 2.259,20 | 0% | R$ 0 |
| 2 | R$ 2.826,65 | 7,5% | R$ 169,44 |
| 3 | R$ 3.751,05 | 15% | R$ 381,44 |
| 4 | R$ 4.664,68 | 22,5% | R$ 662,77 |
| 5 | acima | 27,5% | R$ 896,00 |

### IRRF 2026 (base < R$ 2.428,80: isento)
| Faixa | Até | Alíquota | Dedução |
|-------|-----|----------|---------|
| 1 | R$ 2.428,80 | 0% | R$ 0 |
| 2 | R$ 2.826,65 | 7,5% | R$ 182,16 |
| 3 | R$ 3.751,05 | 15% | R$ 394,16 |
| 4 | R$ 4.664,68 | 22,5% | R$ 675,49 |
| 5 | acima | 27,5% | R$ 908,73 |

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|---------------|---------|
| IRRF sempre zero em FOLHA 2026 | Desconto simplificado R13 supera Q35; diferença < R$10 | Normal para salários baixos/médios |
| INSS acima do máximo | Salário acima do teto da tabela | P23 é limitado ao máximo da tabela |
| DSR zero com horas extras | Campos diasUteis/domingosFer = 0 | Preencher dias úteis e domingos/feriados |
| Cidade aparece duplicada no seletor de feriados | Base com município salvo em caixa/grafia inconsistente (`Rio de Janeiro`/`RIO DE JANEIRO`, `GOIANIA`/`GOIÂNIA`) | Normalizar `locations[].name` em maiúsculo, padronizar `locations[].code` e remover duplicatas lógicas do JSON |
| Mesmo feriado municipal aparece 2x no card/calendário | Base contém o mesmo feriado com data em formatos diferentes (`2026-02-02` e `2026-02-02T00:00:00.000Z`) ou carga repetida da mesma cidade | Deduplicar por chave lógica (`data + tipo + nome + local`) no JSON e manter deduplicação defensiva no front ao carregar os feriados |
| UsuÃ¡rio sem e-mail liberado consegue salvar tabela IRRF/INSS | Restricao aplicada so no front ou lista de e-mails vazia | Validar a lista de e-mails no modal `Gerenciar abas` e conferir que o backend retorna `403` para mutacoes avancadas fora da lista |
| Aba de prÃ³-labore nÃ£o mostra teto/percentual do INSS no modal avanÃ§ado | Modal exibindo apenas a grade de faixas ou somente parte dos campos do INSS | Abrir o modal da aba de prÃ³-labore e ajustar `Percentual INSS` e `Teto INSS` diretamente na secao `INSS do Pro-labore` |
