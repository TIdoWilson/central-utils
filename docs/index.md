<div class="portal-hero">
  <img src="./assets/img/logo-portal.png" alt="Central Utils" class="portal-hero-logo" />
  <h1>Integra Python Portal</h1>
  <p>Base oficial da documentação operacional do Central Utils.</p>
</div>

<div class="portal-cards">
  <a class="portal-card" href="./tools/index.html">
    <h3>Ferramentas</h3>
    <p>Catálogo completo por rota, RBAC e API base.</p>
  </a>
  <a class="portal-card" href="./runbooks/runbook-gerador-atas.html">
    <h3>Runbooks</h3>
    <p>Procedimentos operacionais, troubleshooting e recuperação.</p>
  </a>
  <a class="portal-card" href="./01-ARQUITETURA.html">
    <h3>Arquitetura</h3>
    <p>Visão de componentes, fluxos e integrações.</p>
  </a>
  <a class="portal-card" href="./FAQ-GLOBAL.html">
    <h3>FAQ Global</h3>
    <p>Dúvidas e incidentes comuns com respostas práticas.</p>
  </a>
  <a class="portal-card" href="./engineering/integra-python-v3.1.html">
    <h3>Engenharia v3.1</h3>
    <p>Regras mandatórias de segurança, rotas e compatibilidade.</p>
  </a>
</div>

## Convenções

- Ferramentas internas: rota de página `/:toolSlug` com RBAC (`tool:<slug>` ou `tool:*`).
- APIs internas: compatibilidade de endpoint e CSRF obrigatório em mutações (exceto login).
- Auditoria: `auditLog` tolerante (nunca derruba request).
