/* global AuthClient, inicializarSidebar */

(function () {
  const SLUG = 'planilha-nrc';
  const API_BASE = '/api/planilha-nrc';

  const state = {
    mappings: [],
    downloadUrl: '',
    processing: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeSpaces(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sanitizeMappings(rows) {
    const input = Array.isArray(rows) ? rows : [];
    const seen = new Set();
    const out = [];

    for (const row of input) {
      const historico = normalizeSpaces(row?.historico);
      const agrupamento = normalizeSpaces(row?.agrupamento);
      if (!historico || !agrupamento) continue;
      const key = `${historico.toLowerCase()}|${agrupamento.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ historico, agrupamento });
    }

    return out;
  }

  function parsePeriodo(periodo) {
    const value = normalizeSpaces(periodo);
    const match = /^(\d{2})\/(\d{4})$/.exec(value);
    if (!match) return null;
    const month = Number(match[1]);
    const year = Number(match[2]);
    if (month < 1 || month > 12 || year < 1900 || year > 2999) return null;
    return { value, serial: year * 12 + month };
  }

  function setStatus(message, isError) {
    const el = $('statusBox');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.toggle('is-error', !!isError);
  }

  function setDownloadUrl(url) {
    state.downloadUrl = String(url || '');
    const btn = $('btnExportar');
    if (btn) btn.disabled = !state.downloadUrl;
  }

  function setProcessing(loading) {
    state.processing = !!loading;
    const btn = $('btnCarregar');
    if (btn) {
      btn.disabled = state.processing;
      btn.textContent = state.processing ? 'Carregando...' : 'Carregar';
    }
  }

  function createEmptyRow() {
    return { historico: '', agrupamento: '' };
  }

  function ensureAtLeastOneRow() {
    if (!state.mappings.length) state.mappings = [createEmptyRow()];
  }

  function renderMappings() {
    ensureAtLeastOneRow();
    const tbody = $('tbodyMappings');
    if (!tbody) return;

    tbody.innerHTML = state.mappings
      .map((row, index) => `
        <tr>
          <td><input type="text" data-field="historico" data-index="${index}" value="${escapeHtml(row.historico)}" placeholder="Ex: NRC" /></td>
          <td><input type="text" data-field="agrupamento" data-index="${index}" value="${escapeHtml(row.agrupamento)}" placeholder="Ex: transferencia" /></td>
          <td><button type="button" class="planilha-nrc-danger" data-remove="${index}">Excluir</button></td>
        </tr>
      `)
      .join('');
  }

  function collectMappingsFromDom() {
    const rows = [];
    const tbody = $('tbodyMappings');
    if (!tbody) return [];
    const trList = Array.from(tbody.querySelectorAll('tr'));
    for (const tr of trList) {
      const historico = tr.querySelector('input[data-field="historico"]')?.value || '';
      const agrupamento = tr.querySelector('input[data-field="agrupamento"]')?.value || '';
      rows.push({ historico, agrupamento });
    }
    return sanitizeMappings(rows);
  }

  function renderSummary(resumo) {
    const box = $('summaryBox');
    if (!box) return;
    if (!resumo || typeof resumo !== 'object') {
      box.innerHTML = '<p>Nenhum resumo disponivel.</p>';
      return;
    }

    const abas = Array.isArray(resumo.abasProcessadas) ? resumo.abasProcessadas.join(', ') : '-';
    box.innerHTML = `
      <dl>
        <div><dt>Abas processadas</dt><dd>${escapeHtml(String(resumo.totalAbasProcessadas || 0))}</dd></div>
        <div><dt>Linhas no periodo</dt><dd>${escapeHtml(String(resumo.linhasNoPeriodo || 0))}</dd></div>
        <div><dt>Linhas alteradas</dt><dd>${escapeHtml(String(resumo.linhasAlteradas || 0))}</dd></div>
        <div><dt>Regras aplicadas</dt><dd>${escapeHtml(String(resumo.totalRegras || 0))}</dd></div>
        <div><dt>Conflitos detectados</dt><dd>${escapeHtml(String(resumo.totalConflitos || 0))}</dd></div>
        <div><dt>Nomes das abas</dt><dd>${escapeHtml(abas)}</dd></div>
      </dl>
    `;
  }

  function renderConflicts(resumo) {
    const host = $('conflictsBox');
    if (!host) return;

    const conflitos = Array.isArray(resumo?.conflitos) ? resumo.conflitos : [];
    if (!conflitos.length) {
      host.innerHTML = '<p class="nfe-card-subtitle">Sem conflitos de regras para este processamento.</p>';
      return;
    }

    const rows = conflitos
      .map((item) => {
        const regras = Array.isArray(item.regras) ? item.regras.join(' | ') : '';
        return `
          <tr>
            <td>${escapeHtml(item.aba)}</td>
            <td>${escapeHtml(String(item.linha || ''))}</td>
            <td>${escapeHtml(item.historico || '')}</td>
            <td>${escapeHtml(regras)}</td>
            <td>${escapeHtml(item.aplicada || '')}</td>
            <td>${escapeHtml(item.criterio || '')}</td>
          </tr>
        `;
      })
      .join('');

    host.innerHTML = `
      <p class="nfe-card-subtitle">Conflitos encontrados: ${escapeHtml(String(conflitos.length))}. Regra aplicada conforme criterio da ferramenta.</p>
      <div class="planilha-nrc-conflicts">
        <table>
          <thead>
            <tr>
              <th>Aba</th>
              <th>Linha</th>
              <th>Historico</th>
              <th>Regras que casaram</th>
              <th>Regra aplicada</th>
              <th>Criterio</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  async function safeJson(response) {
    try {
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  async function loadConfig() {
    const response = await AuthClient.authFetch(`${API_BASE}/config`, { method: 'GET' });
    const data = await safeJson(response);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Erro ao carregar de/para.');
    }
    state.mappings = sanitizeMappings(data?.config?.mappings || []);
    ensureAtLeastOneRow();
    renderMappings();
  }

  async function saveConfig() {
    const mappings = collectMappingsFromDom();
    const response = await AuthClient.authFetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings }),
    });
    const data = await safeJson(response);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Erro ao salvar de/para.');
    }
    state.mappings = sanitizeMappings(data?.config?.mappings || mappings);
    ensureAtLeastOneRow();
    renderMappings();
    return state.mappings;
  }

  async function processarPlanilha() {
    const file = $('arquivoPlanilha')?.files?.[0] || null;
    if (!file) {
      throw new Error('Selecione uma planilha para continuar.');
    }

    const periodoInicialRaw = $('periodoInicial')?.value || '';
    const periodoFinalRaw = $('periodoFinal')?.value || '';
    const start = parsePeriodo(periodoInicialRaw);
    const end = parsePeriodo(periodoFinalRaw);

    if (!start || !end) {
      throw new Error('Informe periodo inicial e final no formato MM/AAAA.');
    }
    if (start.serial > end.serial) {
      throw new Error('Periodo inicial nao pode ser maior que periodo final.');
    }

    const mappings = collectMappingsFromDom();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('periodoInicial', start.value);
    formData.append('periodoFinal', end.value);
    formData.append('config_json', JSON.stringify({ mappings }));

    const response = await AuthClient.authFetch(`${API_BASE}/processar`, {
      method: 'POST',
      body: formData,
    });
    const data = await safeJson(response);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Erro ao processar planilha.');
    }

    renderSummary(data.resumo || {});
    renderConflicts(data.resumo || {});
    setDownloadUrl(data.downloadUrl || '');

    const alteradas = Number(data?.resumo?.linhasAlteradas || 0);
    const conflitos = Number(data?.resumo?.totalConflitos || 0);
    if (conflitos > 0) {
      setStatus(`Processamento concluido. ${alteradas} linha(s) alterada(s). Conflitos detectados: ${conflitos}.`, false);
    } else {
      setStatus(`Processamento concluido. ${alteradas} linha(s) alterada(s).`, false);
    }
  }

  function bindEvents() {
    $('tbodyMappings')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-remove]');
      if (!button) return;
      const index = Number(button.getAttribute('data-remove'));
      if (!Number.isFinite(index)) return;
      state.mappings = state.mappings.filter((_, i) => i !== index);
      ensureAtLeastOneRow();
      renderMappings();
    });

    $('tbodyMappings')?.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const field = target.getAttribute('data-field');
      const index = Number(target.getAttribute('data-index'));
      if (!field || !Number.isFinite(index) || !state.mappings[index]) return;
      state.mappings[index][field] = target.value;
    });

    $('btnAddLinha')?.addEventListener('click', () => {
      state.mappings.push(createEmptyRow());
      renderMappings();
    });

    $('btnSalvarConfig')?.addEventListener('click', async () => {
      try {
        const mappings = await saveConfig();
        setStatus(`De/para salvo com sucesso. Total de regras: ${mappings.length}.`, false);
      } catch (error) {
        setStatus(String(error?.message || error || 'Erro ao salvar de/para.'), true);
      }
    });

    $('btnCarregar')?.addEventListener('click', async () => {
      try {
        setProcessing(true);
        setDownloadUrl('');
        setStatus('Processando planilha...', false);
        await processarPlanilha();
      } catch (error) {
        setStatus(String(error?.message || error || 'Erro ao processar planilha.'), true);
      } finally {
        setProcessing(false);
      }
    });

    $('btnExportar')?.addEventListener('click', () => {
      if (!state.downloadUrl) return;
      const a = document.createElement('a');
      a.href = state.downloadUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  async function boot() {
    try {
      if (typeof inicializarSidebar === 'function') {
        await inicializarSidebar(SLUG);
      }
      renderSummary(null);
      renderConflicts(null);
      await loadConfig();
      bindEvents();
      setStatus('Pronto para processar a planilha NRC.', false);
    } catch (error) {
      setStatus(String(error?.message || error || 'Erro ao iniciar pagina.'), true);
    }
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
