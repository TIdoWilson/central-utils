# STATUS_ATUAL.md

Data de referencia: 2026-03-25

## Concluido recentemente
1. Projeto `Central utilitarios` estruturado no Linear com resumo, descricao, lead, prioridade, datas e milestones.
2. Backlog inicial criado no Linear com historico de entregas concluidas e erros mitigados:
   - `WIL-39` a `WIL-50` em `Done`.
3. Fase ativa registrada no Linear:
   - issue-mae `WIL-51` em `In Progress`.
   - subtarefas `WIL-52`, `WIL-53`, `WIL-55` e `WIL-54` em `Todo`.
4. Documento de governanca do Linear criado em `docs/LINEAR_PLAYBOOK.md`.
5. Regras de sincronizacao docs + Linear adicionadas ao fluxo do projeto.
6. HUB de `Parcelamentos de Impostos` criado no portal com rota, tela interna, cadastro em banco, modal de inclusao, importacao por upload da planilha, agrupamentos por tipo fixo, ordenacao em lista, edicao manual e limpeza temporaria da base, com documentacao inicial.
7. Integrador `icms-integrar-inventario-sped` ajustado para apenas integrar o inventario e recalcular totalizadores, sem validacao global de relacionamento.
8. Saidas TXT dos scripts SPEDS padronizadas em `UTF-8` sem BOM.
9. Corretor `icms-corretor-total-inventario` ajustado para apenas corrigir o inventario e recalcular totalizadores, sem validacao global de relacionamento.
10. Gerador `gfbr-gerador-txt` passou a excluir automaticamente lancamentos de renda/rendimento com classificacao resolvida iniciando em `11102`.
11. Gerador `gfbr-gerador-txt` ajustado para aplicar a direcao correta dos PDFs Itaú: aplicação debita a aplicação e credita a conta corrente; resgate faz o inverso.
12. Upload do `gfbr-gerador-txt` passou a aceitar Excel + PDF juntos no mesmo envio, corrigindo o limite de arquivos do multer.
11. `acerto-lotes-toscan` corrigido para ler TXT de layout fixo sem quebrar no processamento e identificar historico vazio pelo trecho util da linha.

13. Templates locais de correcao de participantes adicionados na pagina `/speds` para `ICMS` e `Contribuicoes`, com selecao de arquivos via upload e suporte a XML/ZIP/RAR conforme o script.

## Estado tecnico atual
- Arquitetura multicamadas consolidada (Node.js, Python/FastAPI, PostgreSQL e filesystem).
- Catalogo operacional de ferramentas ativo e documentado (`docs/UI_MAP.md`, `docs/tools/index.md`).
- Runbooks de diagnostico e operacao disponiveis para ferramentas criticas.
- Fluxo de deploy VPS documentado com checks de release e migrations.
- Correcoes relevantes registradas nos docs de ferramentas (SN, MIT, GIAST, SPEDS, correcao de participantes local).

## Pendencias ativas (Linear)
1. `WIL-52` - implementar endpoint real da API do Conciliador Hausen Ocean.
2. `WIL-53` - estruturar suite minima de testes automatizados.
3. `WIL-55` - implantar pipeline CI/CD com gates de seguranca.
4. `WIL-54` - revisar templates SPEDS com fallback e planejar cobertura completa.

## Proximo passo recomendado
1. Executar `WIL-52` para eliminar o 404 operacional do `conciliador-hausen-ocean`.
2. Definir baseline de testes para `WIL-53` e amarrar esse baseline no pipeline de `WIL-55`.
3. Fechar inventario de templates SPEDS com fallback para `WIL-54` e priorizar execucao real por risco operacional.
