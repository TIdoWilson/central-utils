# Calculadora de Ferias

**Rota:** `/calculadora-ferias`  
**Grupo:** Pessoal  
**Tipo:** Front-end puro (HTML/CSS/JS sem framework) + API leve de estado  
**Classificacao:** `vps-compatible`

## Descricao

Tela interna criada para substituir a planilha `data/CALCULO FERIAS.xlsx` no portal, focada exclusivamente no modelo `2026`, mantendo o calculo principal de ferias na area central e deixando tabelas/faixas editaveis em um modal de parametros avancados com controle de permissao por `ADMIN` ou e-mail liberado.

## Como funciona

1. A pagina abre dentro do layout autenticado padrao do portal.
2. O usuario preenche apenas os campos operacionais necessarios para o calculo.
3. O modal `Parametros avancados` permite ajustar faixas de INSS, IRRF e constantes usadas nas formulas, incluindo os parametros do `calculo novo` de 2026.
4. O card `Aba / Ano` fica ao final da pagina e abre o modal `Gerenciar abas`, usado para exibir o modelo fixo e controlar os e-mails liberados.
5. Os resultados sao exibidos em KPIs, cards de detalhamento e composicao do recebimento.
6. O historico fica salvo localmente no navegador do usuario.

## Arquivos relacionados

- `public/calculadora-ferias.html`
- `public/js/calculadora-ferias.js`
- `public/js/sidebar.js`
- `src/routes/tools/calculadora-ferias.routes.js`
- `src/core/tool-catalog.json`

## Compatibilidade

- A ferramenta nao depende de Excel local em runtime.
- A logica fica em `public/js/calculadora-ferias.js` e usa apenas assets publicos do portal.
- O acesso deve respeitar RBAC via `tool:calculadora-ferias` ou `tool:*`.
- A persistencia compartilhada dos parametros avancados usa `GET/POST /api/calculadora-ferias/state`.
- Somente `ADMIN` ou e-mails liberados conseguem salvar parametros avancados; somente `ADMIN` pode alterar a lista de e-mails liberados.
- O modelo atual esta travado na aba `2026` e opera no fluxo simplificado de um bloco principal de ferias + um bloco de abono.

## Troubleshooting

| Sintoma | Causa provavel | Solucao |
|---------|----------------|---------|
| A pagina abre com sidebar, topbar ou fundo diferentes do restante do portal | O HTML foi gerado com uma casca propria (`shell`, `sidebar`, `topbar`) em vez de reutilizar `nfe-layout` + `sidebar.js` | Manter a pagina montada dentro de `nfe-layout`, carregar `/styles.css` e inicializar `inicializarSidebar('calculadora-ferias')` |
| A sidebar parece "um pouco diferente" das outras paginas | A pagina carregou uma fonte web (`Inter`) so nela, alterando a renderizacao do texto global da sidebar/topbar | Deixar a tipografia global do portal vir apenas de `/styles.css` e restringir a fonte externa ao que for realmente exclusivo da ferramenta |
| Os tres botoes do topo ficam com cor/tamanho diferente da `calculo-salario` | A ferramenta usava botoes locais em vez dos componentes globais `.btn`, `.btn-secondary` e `.btn-primary` | Reaproveitar os mesmos componentes de botao e o mesmo espaco de acoes da pagina de salario |
| A ferramenta aparece no menu, mas nao entra no catalogo/documentacao do portal | O slug nao foi registrado em `src/core/tool-catalog.json` | Adicionar `calculadora-ferias` ao catalogo e regenerar `docs/tools/index.md` |
| O campo de ano sugere cenarios diferentes, mas o calculo esta travado em 2026 | A planilha original possui multiplas abas/anos, mas a ferramenta foi deliberadamente reduzida para um unico modelo | Exibir uma aba fixa `FÉRIAS 2026`, remover o ano editavel da tela principal e manter os parametros do modelo 2026 no modal avancado |
| Um cenario fracionado da planilha nao bate exatamente com a tela | A planilha `CALCULO FERIAS.xlsx` permite distribuir ferias/abono em multiplos blocos e divisores, enquanto a tela usa um unico bloco operacional simplificado | Usar a ferramenta apenas para o fluxo `2026` simplificado ou evoluir a UI para suportar multiplos blocos/periodos se a operacao exigir paridade total |
| O bloco de detalhamento aparece sem os cards de descontos | A secao foi publicada apenas com cards de parcelas/bases e acabou omitindo INSS, IRRF, e-Consignado e total de descontos | Completar a grade de detalhamento com os 4 cards negativos para fechar o mesmo conjunto de conferencia esperado no layout da calculadora |
| O modal de parametros abre deslocado para a esquerda | O modal foi renderizado dentro de uma casca React com layout proprio, em vez de ser projetado no `document.body` | Renderizar o modal via `ReactDOM.createPortal(...)` para centralizar no viewport inteiro e manter o `z-index` acima da sidebar global |
| O modelo 2026 fica sem o parametro `limite do calculo novo` | O valor fixo da planilha (`Z23`) nao estava exposto na tela, mesmo afetando o IRRF final | Incluir `limite do calculo novo` nos parametros avancados junto com `R10` e `R11`, para permitir ajuste facil sem editar o codigo |
| Os cards principais ficam com um bege/amarelo diferente das outras ferramentas | A paleta local da calculadora usava superficies quentes demais (`#fffdf8`, `#fce8c7`, bordas bege), destoando do padrao branco/azulado do portal | Trocar os cards para superficies brancas/neutras e usar destaques suaves em azul, verde e vermelho alinhados ao restante das paginas |
| O modal de parametros ainda fica com tom amarelado/bege | O container do modal e o rodape/tab strip ainda estavam com `#fffdfa`/superficies quentes, mesmo depois de neutralizar o restante da pagina | Usar fundo branco no modal e cinza frio suave apenas nas abas, mantendo o modal no mesmo clima visual das outras telas internas |
| O modal de parametros mostra numeros com muitas casas e fica dificil editar | Inputs controlados em React/Babel estavam reformatando floats crus em cada render e podiam brigar com o cursor do usuario | Migrar a tela para HTML/JS puro, limitar a formatacao editavel e salvar os campos do modal apenas na confirmacao |
| Usuarios liberados por e-mail conseguem editar parametros, mas nao deveriam gerenciar a propria lista de autorizacao | A mesma permissao era reutilizada tanto para editar tabelas quanto para administrar a allowlist | Separar as regras: `ADMIN` ou e-mail liberado edita parametros, mas somente `ADMIN` pode adicionar/remover e-mails autorizados |
| A tela redireciona para login ao abrir fora do portal | A pagina depende do fluxo autenticado e do contexto provido por `AuthClient` | Validar pelo portal autenticado ou mockar `AuthClient` apenas em testes locais isolados |
