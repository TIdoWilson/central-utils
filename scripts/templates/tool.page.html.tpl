<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>__TITLE__ • Integra Python</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>

  <body class="app-body nfe-body">
    <div class="nfe-layout collapsed">
      <aside class="nfe-sidebar">
        <div class="nfe-sidebar-top">
          <button class="nfe-sidebar-toggle" id="sidebarToggle" type="button" aria-label="Abrir menu">
            <span></span><span></span><span></span>
          </button>
        </div>
        <nav class="nfe-sidebar-menu" id="sidebarMenu"></nav>
      </aside>

      <main class="nfe-main">
        <header class="nfe-header">
          <div class="nfe-breadcrumb">Portal / __GROUP__ / __TITLE__</div>
          <h1>__TITLE__</h1>
          <p>Slug da ferramenta: <code>__SLUG__</code>.</p>
        </header>

        <section class="nfe-card">
          <h2>Como usar</h2>
          <ol>
            <li>Esta página está protegida por login e RBAC (rota dinâmica no servidor).</li>
            <li>No JS, use <code>AuthClient.authFetch</code> para chamadas internas (CSRF automático em mutações).</li>
          </ol>
        </section>

        <section class="nfe-card">
          <h2>Ações</h2>
          <div class="nfe-table-actions">
            <button id="btnAction" type="button" class="btn btn-primary">Executar ação</button>
          </div>

          <pre id="output" class="nfe-upload-message" style="white-space: pre-wrap;"></pre>
        </section>
      </main>
    </div>

    <!-- Ordem padrão de scripts (v3.1) -->
    <script src="/js/sidebar.js"></script>
    <script src="/js/auth-client.js"></script>
    <!-- Se esta ferramenta usar upload helper, habilite também: -->
    <!-- <script src="/js/upload-helper.js"></script> -->
    <script src="/js/__SLUG__.js"></script>
  </body>
</html>
