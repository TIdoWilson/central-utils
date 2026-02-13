<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>__TITLE__ • Integra Python</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>

  <body>
    <!-- Sidebar (injetada pelo sidebar.js) -->
    <nav id="sidebarMenu"></nav>

    <main class="page">
      <header class="page-header">
        <h1 class="page-title">__TITLE__</h1>
        <p class="page-subtitle">Grupo: <strong>__GROUP__</strong> • Slug: <code>__SLUG__</code></p>
      </header>

      <section class="page-card">
        <h2>Como usar</h2>
        <ol>
          <li>Esta página já está protegida por login e RBAC (rota dinâmica no server).</li>
          <li>No JS, use <code>AuthClient.authFetch</code> para chamar APIs internas (CSRF automático em mutações).</li>
        </ol>
      </section>

      <section class="page-card">
        <h2>Ações</h2>
        <div class="page-actions">
          <button id="btnAction" type="button">Executar ação</button>
        </div>

        <pre id="output" class="page-output"></pre>
      </section>
    </main>

    <!-- Ordem padrão de scripts (v3.1) -->
    <script src="/js/sidebar.js"></script>
    <script src="/js/auth-client.js"></script>
    <!-- Se esta ferramenta usar upload helper, habilite também: -->
    <!-- <script src="/js/upload-helper.js"></script> -->
    <script src="/js/__SLUG__.js"></script>
  </body>
</html>
