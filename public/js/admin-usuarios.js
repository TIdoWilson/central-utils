document.addEventListener('DOMContentLoaded', async () => {
  inicializarSidebar('admin-usuarios');

  const whoami = document.getElementById('whoami');

  if (!window.AuthClient) {
    window.location.href = '/login';
    return;
  }

  document.getElementById('btnReloadUsers')?.addEventListener('click', carregarUsuarios);

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx?.user) {
    window.location.href = '/login';
    return;
  }

  if (whoami) {
    whoami.textContent = `Logado como: ${ctx.user.name} <${ctx.user.email}> (${ctx.user.role})`;
  }

  // Catálogo de ferramentas vem do MENU_CONFIG da sidebar
  const toolsCatalog = buildToolsCatalogFromMenu(window.MENU_CONFIG || []);
  setupPermissionsModal(toolsCatalog);

  // IMPORTAÇÃO
  document.getElementById('importForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const importMsg = document.getElementById('importMessage');
    if (importMsg) importMsg.textContent = '';

    const fileInput = document.getElementById('fileInput');
    const usersText = document.getElementById('usersText');

    const fd = new FormData();
    if (fileInput?.files?.[0]) fd.append('file', fileInput.files[0]);
    if (usersText?.value?.trim()) fd.append('usersText', usersText.value.trim());

    try {
      const resp = await AuthClient.authFetch('/api/admin/users/import', { method: 'POST', body: fd });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao importar');

      if (importMsg) {
        const total = Number(data.total || 0);
        const createdOrUpdated = Number(data.createdOrUpdated || 0);
        const errors = Array.isArray(data.errors) ? data.errors.length : 0;
        importMsg.textContent = `Importação OK: ${createdOrUpdated}/${total} processados, ${errors} erros.`;
      }

      if (fileInput) fileInput.value = '';
      if (usersText) usersText.value = '';

      await carregarUsuarios();
    } catch (err) {
      if (importMsg) importMsg.textContent = err.message || 'Erro inesperado';
    }
  });

  // NOVO USUÁRIO (manual)
  document.getElementById('btnNewUser')?.addEventListener('click', async () => {
    try {
      const name = prompt('Nome:', '') ?? '';
      if (!name.trim()) return;

      const email = prompt('E-mail (login):', '') ?? '';
      if (!email.trim()) return;

      const password = prompt('Senha inicial (mínimo 6):', '') ?? '';
      if (!password) return;

      let role = (prompt('Role (ADMIN/USER):', 'USER') ?? 'USER').toUpperCase().trim();
      role = role === 'ADMIN' ? 'ADMIN' : 'USER';

      const resp = await AuthClient.authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Falha ao criar usuário');

      await carregarUsuarios();
    } catch (err) {
      alert(err.message || 'Erro');
    }
  });

  await carregarUsuarios();
});

async function carregarUsuarios() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '';

  try {
    const resp = await AuthClient.authFetch('/api/admin/users', { method: 'GET' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.error) throw new Error(data.error || 'Erro ao carregar');

    const users = Array.isArray(data) ? data : (Array.isArray(data.users) ? data.users : []);
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="7">Nenhum usuário cadastrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = users
      .map((u) => {
        const isActive = typeof u.is_active === 'boolean' ? u.is_active : !!u.isActive;
        const createdAt = u.created_at || u.createdAt || null;
        const accessMeta = describeAccessMode(u);
        return `
          <tr data-id="${u.id}">
            <td>${esc(u.name)}</td>
            <td>${esc(u.email)}</td>
            <td>${esc(u.role)}</td>
            <td>${renderAccessBadge(accessMeta)}</td>
            <td>${isActive ? 'Sim' : 'Não'}</td>
            <td>${createdAt ? new Date(createdAt).toLocaleString() : '-'}</td>
            <td>
              <button class="btn btn-secondary btn-sm" data-action="perms">Permissões</button>
              <button class="btn btn-secondary btn-sm" data-action="edit">Editar</button>
              <button class="btn btn-secondary btn-sm" data-action="pass">Senha</button>
              <button class="btn btn-secondary btn-sm" data-action="toggle">${isActive ? 'Desativar' : 'Ativar'}</button>
              <button class="btn btn-ghost-danger btn-sm" data-action="delete">Excluir</button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', onRowAction);
    });
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="7">Erro ao carregar usuários.</td></tr>`;
  }
}

async function onRowAction(e) {
  const btn = e.currentTarget;
  const action = btn.getAttribute('data-action');
  const tr = btn.closest('tr');
  const id = Number(tr?.getAttribute('data-id'));
  if (!id) return;

  const nameCell = tr.children[0]?.textContent || '';
  const emailCell = tr.children[1]?.textContent || '';
  const roleCell = tr.children[2]?.textContent || 'USER';
  const activeCell = tr.children[3]?.textContent?.trim() === 'Sim';

  try {
    if (action === 'perms') {
      await openPermissionsModal({ id, name: nameCell, email: emailCell, role: roleCell });
      return;
    }

    if (action === 'edit') {
      const name = prompt('Nome:', nameCell) ?? '';
      if (!name.trim()) return;

      const email = prompt('E-mail (login):', emailCell) ?? '';
      if (!email.trim()) return;

      const role = (prompt('Role (ADMIN/USER):', roleCell) ?? 'USER').toUpperCase();

      const resp = await AuthClient.authFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Falha ao editar');
      await carregarUsuarios();
    }

    if (action === 'pass') {
      const pw = prompt('Nova senha (mínimo 6):', '') ?? '';
      if (!pw) return;

      const resp = await AuthClient.authFetch(`/api/admin/users/${id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Falha ao alterar senha');
      alert('Senha alterada e sessões do usuário foram encerradas.');
    }

    if (action === 'toggle') {
      const resp = await AuthClient.authFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !activeCell }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Falha ao alterar status');
      await carregarUsuarios();
    }

    if (action === 'delete') {
      if (!confirm(`Excluir o usuário ${emailCell}?`)) return;

      const resp = await AuthClient.authFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Falha ao excluir');
      await carregarUsuarios();
    }
  } catch (err) {
    alert(err.message || 'Erro');
  }
}

// ===== Permissões =====

let __toolsCatalog = [];
let __rbacStrict = true;

function normalizeToolSlugFromHref(href) {
  if (!href) return null;
  const raw = String(href).trim();
  if (!raw || raw === '#') return null;

  try {
    const url = new URL(raw, window.location.origin);
    let p = decodeURIComponent(url.pathname || '');
    p = p.replace(/^\/+/, '');
    p = p.replace(/\.html$/i, '');
    return p.toLowerCase();
  } catch (_) {
    let p = raw.split('?')[0].split('#')[0];
    p = p.replace(/^\/+/, '');
    p = p.replace(/\.html$/i, '');
    return p.toLowerCase() || null;
  }
}

function buildToolsCatalogFromMenu(menu) {
  const tools = [];
  for (const group of menu) {
    for (const item of (group.items || [])) {
      const slug = normalizeToolSlugFromHref(item.href);
      if (!slug) continue;

      tools.push({
        groupId: group.id,
        groupLabel: group.label,
        id: item.id,
        label: item.label,
        href: item.href,
        slug,
        perm: `tool:${slug}`,
        adminOnly: !!(group.adminOnly || item.adminOnly),
      });
    }
  }
  // tira duplicados por perm
  const seen = new Set();
  return tools.filter(t => {
    if (seen.has(t.perm)) return false;
    seen.add(t.perm);
    return true;
  });
}

function setupPermissionsModal(toolsCatalog) {
  __toolsCatalog = toolsCatalog;
  __rbacStrict = !!(window.AuthClient && AuthClient._ctx && AuthClient._ctx.rbacStrict !== false);

  const modal = document.getElementById('permissionsModal');
  const btnClose = document.getElementById('btnClosePermissions');
  const btnCancel = document.getElementById('btnCancelPermissions');
  const btnSelectAll = document.getElementById('btnSelectAllPermissions');
  const btnClearAll = document.getElementById('btnClearAllPermissions');

  const close = () => {
    modal?.classList.add('hidden');
    modal?.setAttribute('aria-hidden', 'true');
    document.getElementById('permissionsMessage').textContent = '';
  };

  btnClose?.addEventListener('click', close);
  btnCancel?.addEventListener('click', close);
  btnSelectAll?.addEventListener('click', () => toggleAllPermissions(true));
  btnClearAll?.addEventListener('click', () => toggleAllPermissions(false));

  modal?.querySelector('[data-close="1"]')?.addEventListener('click', close);

  window.__closePermissionsModal = close;
}

async function openPermissionsModal(user) {
  const modal = document.getElementById('permissionsModal');
  const subtitle = document.getElementById('permissionsSubtitle');
  const rbacWarning = document.getElementById('permissionsRbacWarning');
  const msg = document.getElementById('permissionsMessage');
  const list = document.getElementById('permissionsList');
  const btnSave = document.getElementById('btnSavePermissions');

  if (!modal || !subtitle || !msg || !list || !btnSave) return;

  msg.textContent = '';
  subtitle.textContent = `Usuário: ${user.name} <${user.email}> (${user.role})`;
  if (rbacWarning) {
    rbacWarning.textContent = 'Regra atual: sem permissões marcadas = acesso total; todas marcadas = acesso total (salvo como tool:*); marcação parcial = acesso somente ao marcado.';
    rbacWarning.classList.remove('hidden');
  }
  btnSave.disabled = true;

  modal.dataset.userId = String(user.id);

  // carrega permissões atuais
  const current = await fetchUserPermissions(user.id).catch(() => []);
  const selected = new Set(current);

  renderPermissionsList(list, __toolsCatalog, selected);

  btnSave.disabled = false;

  const onSave = async () => {
    msg.textContent = '';
    btnSave.disabled = true;

    const allPerms = Array.from(list.querySelectorAll('input[type="checkbox"][data-perm]'))
      .map(i => String(i.getAttribute('data-perm') || '').trim())
      .filter(Boolean);

    const checked = Array.from(list.querySelectorAll('input[type="checkbox"][data-perm]'))
      .filter(i => i.checked)
      .map(i => i.getAttribute('data-perm'));

    const checkedSet = new Set(checked.map((p) => String(p || '').trim().toLowerCase()));
    const allSet = new Set(allPerms.map((p) => String(p || '').trim().toLowerCase()));
    const allChecked = allSet.size > 0 && Array.from(allSet).every((p) => checkedSet.has(p));
    const toSave = allChecked ? ['tool:*'] : checked;

    try {
      const resp = await AuthClient.authFetch(`/api/admin/users/${user.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: toSave }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Falha ao salvar');

      msg.textContent = 'Permissões salvas com sucesso.';
      // menus do navegador podem estar cacheados:
      AuthClient.clearCache();
      setTimeout(() => window.__closePermissionsModal?.(), 450);
    } catch (e) {
      msg.textContent = e.message || 'Erro ao salvar permissões.';
      btnSave.disabled = false;
    }
  };

  // evita empilhar handlers
  btnSave.replaceWith(btnSave.cloneNode(true));
  const btnSave2 = document.getElementById('btnSavePermissions');
  btnSave2.addEventListener('click', onSave);

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

async function fetchUserPermissions(userId) {
  const resp = await AuthClient.authFetch(`/api/admin/users/${userId}/permissions`, { method: 'GET' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.error) throw new Error(data.error || 'Falha ao carregar permissões');
  return Array.isArray(data.permissions) ? data.permissions : [];
}

function renderPermissionsList(container, toolsCatalog, selectedSet) {
  const ctx = (window.AuthClient && AuthClient.getAuthContext) ? AuthClient._ctx : null;

  const tools = toolsCatalog
    .filter(t => !t.adminOnly) // permissões “de ferramenta” (não admin)
    .sort((a, b) => (a.groupLabel + a.label).localeCompare(b.groupLabel + b.label));

  const groups = new Map();
  for (const t of tools) {
    if (!groups.has(t.groupLabel)) groups.set(t.groupLabel, []);
    groups.get(t.groupLabel).push(t);
  }

  let html = '';
  const hasWildcard = selectedSet.has('tool:*');
  for (const [groupLabel, arr] of groups.entries()) {
    html += `<div class="perm-group-title">${esc(groupLabel)}</div>`;
    for (const t of arr) {
      const checked = (hasWildcard || selectedSet.has(t.perm)) ? 'checked' : '';
      html += `
        <label class="perm-item">
          <input type="checkbox" data-perm="${esc(t.perm)}" ${checked} />
          <div class="perm-item-text">
            <div class="perm-item-title">${esc(t.label)}</div>
            <div class="perm-item-sub">${esc(t.href)} · <code>${esc(t.perm)}</code></div>
          </div>
        </label>
      `;
    }
  }

  container.innerHTML = html || '<p class="nfe-card-subtitle">Nenhuma ferramenta encontrada no MENU_CONFIG.</p>';
}

function toggleAllPermissions(checked) {
  const list = document.getElementById('permissionsList');
  if (!list) return;

  const boxes = list.querySelectorAll('input[type="checkbox"][data-perm]');
  boxes.forEach((box) => {
    box.checked = !!checked;
  });
}

function describeAccessMode(user) {
  const role = String(user?.role || '').toUpperCase();
  if (role === 'ADMIN') {
    return { tone: 'admin', label: 'Admin', detail: 'Acesso total por perfil' };
  }

  const perms = (Array.isArray(user?.permissions) ? user.permissions : [])
    .map((p) => String(p || '').trim().toLowerCase())
    .filter((p) => p.startsWith('tool:'));

  if (perms.length === 0) {
    return { tone: 'full', label: 'Acesso total', detail: 'Sem marcações' };
  }

  if (perms.includes('tool:*')) {
    return { tone: 'full', label: 'Acesso total', detail: 'Todas marcadas' };
  }

  return { tone: 'limited', label: 'Limitado', detail: `${perms.length} permiss${perms.length === 1 ? 'ão' : 'ões'}` };
}

function renderAccessBadge(accessMeta) {
  const tone = esc(accessMeta?.tone || 'limited');
  const label = esc(accessMeta?.label || 'Limitado');
  const detail = esc(accessMeta?.detail || '');
  return `
    <div class="user-access-mode">
      <span class="user-access-pill user-access-pill-${tone}">${label}</span>
      <div class="user-access-detail">${detail}</div>
    </div>
  `;
}

function esc(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
