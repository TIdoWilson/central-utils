/* global AuthClient, inicializarSidebar */

(function () {
  const SLUG = 'lotes-renasul';
  const API_BASE = '/api/lotes-renasul';
  const DEFAULT_CONFIG = {
    version: 1,
    updatedAt: '',
    planoContas: [],
    dePara: [],
    centrosCusto: {
      adm: '2,4',
      producao: '1,5,6,7',
    },
  };

  const state = {
    config: structuredClone(DEFAULT_CONFIG),
    activePanel: null,
    saving: false,
    saveTimer: null,
    downloadUrl: '',
    validatedOk: false,
    validatedSignature: '',
    currentSignature: '',
    logs: [],
    pendingDraftRows: [],
    pendingDirty: false,
    panelInputsBound: false,
    pendingInputsBound: false,
    globalActionsBound: false,
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalizeDigits(value) {
    return String(value ?? '').replace(/\D+/g, '');
  }

  function findDeParaMapping(rubrica) {
    const key = normalizeDigits(rubrica);
    if (!key) return null;
    return getDeParaRows().find((row) => normalizeDigits(row.rubrica || row.classificacao || '') === key) || null;
  }

  function cloneConfig(config) {
    const base = structuredClone(DEFAULT_CONFIG);
    const src = config && typeof config === 'object' ? config : {};

    base.version = Number(src.version || 1) || 1;
    base.updatedAt = normalizeText(src.updatedAt || '');
    base.planoContas = Array.isArray(src.planoContas) ? src.planoContas.slice() : [];
    base.dePara = Array.isArray(src.dePara) ? src.dePara.slice() : [];
    base.centrosCusto = {
      adm: normalizeText(src.centrosCusto?.adm || DEFAULT_CONFIG.centrosCusto.adm),
      producao: normalizeText(src.centrosCusto?.producao || DEFAULT_CONFIG.centrosCusto.producao),
    };

    return base;
  }

  function safeJson(response) {
    return response.json().catch(() => null);
  }

  function setStatus(message, isError = false) {
    const el = $('processStatus');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.toggle('is-error', !!isError);
  }

  function setMetric(id, value) {
    const el = $(id);
    if (!el) return;
    el.textContent = String(value);
  }

  function setDownloadUrl(url) {
    state.downloadUrl = String(url || '');
    const btn = $('btnDownload');
    if (btn) btn.disabled = !state.downloadUrl;
  }

  function timestampLabel() {
    return new Date().toLocaleTimeString('pt-BR', { hour12: false });
  }

  function formatErrorDetail(error) {
    if (!error) return 'sem detalhe';
    if (typeof error === 'string') return error;
    if (error instanceof Error) {
      return error.stack || error.message || String(error);
    }
    if (typeof error === 'object') {
      try {
        return JSON.stringify(error, null, 2);
      } catch (jsonError) {
        return String(error.message || error.error || error.detail || jsonError?.message || 'erro nao serializavel');
      }
    }
    return String(error);
  }

  function renderLog() {
    const el = $('logBox');
    if (!el) return;

    if (!state.logs.length) {
      el.innerHTML = '<div class="lotes-renasul-preview-empty">Nenhum log registrado ainda.</div>';
      return;
    }

    const html = state.logs
      .slice(-80)
      .map((entry) => {
        const time = escapeHtml(entry.time || '');
        const level = escapeHtml(String(entry.level || 'info').toUpperCase());
        const message = escapeHtml(entry.message || '');
        const details = entry.details ? ` <span style="color:#94a3b8;">${escapeHtml(entry.details)}</span>` : '';
        return `<div><strong>[${time}] ${level}:</strong> ${message}${details}</div>`;
      })
      .join('');

    el.innerHTML = `<div class="lotes-renasul-preview-empty" style="white-space: pre-wrap; margin: 0;">${html}</div>`;
    el.scrollTop = el.scrollHeight;
  }

  function appendLog(level, message, details = '') {
    state.logs.push({
      time: timestampLabel(),
      level: String(level || 'info'),
      message: String(message || ''),
      details: String(details || ''),
    });
    renderLog();
  }

  function clearLog() {
    state.logs = [];
    renderLog();
  }

  function logError(prefix, response, payload) {
    const status = response?.status || payload?.status || '';
    const detail = payload?.error
      || payload?.detail
      || response?.statusText
      || (payload && typeof payload === 'object' ? formatErrorDetail(payload) : '')
      || 'Erro desconhecido';
    const suffix = status ? `http=${status}; ${detail}` : detail;
    appendLog('error', prefix, suffix);
  }

  function setProcessEnabled(enabled) {
    const btn = $('btnProcess');
    if (btn) btn.disabled = !enabled;
  }

  function getCurrentSignature() {
    const file = $('excelFile')?.files?.[0] || null;
    if (!file) return '';
    return [file.name || '', file.size || 0, file.lastModified || 0].join('|');
  }

  function invalidateValidation(message) {
    state.validatedOk = false;
    state.validatedSignature = '';
    state.currentSignature = getCurrentSignature();
    setProcessEnabled(false);
    if (message) setStatus(message, false);
  }

  function setPreviewEmpty(containerId, message) {
    const el = $(containerId);
    if (!el) return;
    el.innerHTML = `<div class="lotes-renasul-preview-empty">${escapeHtml(message)}</div>`;
  }

  function renderPreviewTable(containerId, rows, columns, emptyMessage) {
    const el = $(containerId);
    if (!el) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      setPreviewEmpty(containerId, emptyMessage);
      return;
    }

    const header = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
    const body = rows
      .map((row) => {
        const cells = columns
          .map((column) => {
            const value = typeof column.getter === 'function'
              ? column.getter(row)
              : row[column.key];
            return `<td>${escapeHtml(value ?? '')}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    el.innerHTML = `
      <table class="lotes-renasul-preview-table">
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function renderTxtPreview(lines) {
    const el = $('previewBox');
    if (!el) return;
    if (!Array.isArray(lines) || lines.length === 0) {
      setPreviewEmpty('previewBox', 'Nenhum TXT foi gerado ainda.');
      return;
    }
    el.innerHTML = `<pre class="lotes-renasul-preview-empty" style="white-space: pre-wrap; margin: 0;">${escapeHtml(lines.join('\n'))}</pre>`;
  }

  function updateValidationSummary(resumo) {
    const totalPendencias = Number(resumo?.total_pendencias || 0);
    const validado = !!resumo?.validado && totalPendencias === 0;
    state.validatedOk = validado;
    state.validatedSignature = state.currentSignature;
    setProcessEnabled(validado);

    if (validado) {
      setStatus('Validacao concluida. Nenhuma conta em falta para este arquivo.', false);
      return;
    }

    if (totalPendencias > 0) {
      setStatus(`Validacao encontrou ${totalPendencias} pendencia(s). Corrija os cadastros antes de gerar o TXT.`, true);
      return;
    }

    setStatus(resumo?.message || 'Validacao concluida.', false);
  }

  function recordValidationState(resumo) {
    const totalPendencias = Number(resumo?.total_pendencias || 0);
    if (resumo?.validado && totalPendencias === 0) {
      appendLog('info', 'Validação concluída', 'Nenhuma conta em falta para este arquivo.');
      return;
    }
    appendLog('warn', 'Validação com pendências', `pendencias=${totalPendencias}`);
  }

  function renderEventosPreview(rows) {
    renderPreviewTable(
      'previewEventosBox',
      rows,
      [
        { key: 'rubrica', label: 'Rubrica' },
        { key: 'nome', label: 'Nome' },
        { key: 'centro', label: 'Centro' },
        { key: 'status', label: 'Status' },
        { key: 'valor', label: 'Valor' },
        { key: 'motivo', label: 'Motivo' },
      ],
      'Nenhum evento localizado ainda.'
    );
  }

  function renderPendenciasPreview(rows) {
    const host = $('pendenciasBox');
    if (!host) return;

    state.pendingDraftRows = Array.isArray(rows)
      ? rows.map((row) => {
          const mapping = findDeParaMapping(row?.rubrica);
          return {
            rubrica: normalizeText(row?.rubrica || ''),
            nome: normalizeText(row?.nome || ''),
            centro: normalizeText(row?.centro || ''),
            centroNumero: normalizeText(row?.centroNumero || ''),
            centroNome: normalizeText(row?.centroNome || ''),
            motivo: normalizeText(row?.motivo || ''),
            valor: normalizeText(row?.valor || ''),
            contaDebitoProducao: normalizeText(mapping?.contaDebitoProducao || ''),
            contaCreditoProducao: normalizeText(mapping?.contaCreditoProducao || ''),
            contaDebitoAdm: normalizeText(mapping?.contaDebitoAdm || ''),
            contaCreditoAdm: normalizeText(mapping?.contaCreditoAdm || ''),
          };
        })
      : [];
    state.pendingDirty = false;

    if (!state.pendingDraftRows.length) {
      host.innerHTML = '<div class="lotes-renasul-preview-empty">Nenhuma pendência carregada.</div>';
      return;
    }

    host.innerHTML = `
      <table class="lotes-renasul-pending-table">
        <thead>
          <tr>
            <th>Rubrica</th>
            <th>Nome</th>
            <th>Centro</th>
            <th>Motivo</th>
            <th>Valor</th>
            <th>Débito prod.</th>
            <th>Crédito prod.</th>
            <th>Débito adm.</th>
            <th>Crédito adm.</th>
          </tr>
        </thead>
        <tbody id="pendenciasBody">
          ${state.pendingDraftRows.map((row, index) => `
            <tr data-row="${index}" data-table="pendencias">
              <td>${escapeHtml(row.rubrica || '')}</td>
              <td>${escapeHtml(row.nome || '')}</td>
              <td>${escapeHtml(row.centro || '')}</td>
              <td>${escapeHtml(row.motivo || '')}</td>
              <td>${escapeHtml(row.valor || '')}</td>
              <td>
                <input data-table="pendencias" data-row="${index}" data-field="contaDebitoProducao" data-nav-row="${index}" data-nav-col="0" type="text" value="${escapeHtml(row.contaDebitoProducao || '')}" placeholder="Conta débito prod." />
              </td>
              <td>
                <input data-table="pendencias" data-row="${index}" data-field="contaCreditoProducao" data-nav-row="${index}" data-nav-col="1" type="text" value="${escapeHtml(row.contaCreditoProducao || '')}" placeholder="Conta crédito prod." />
              </td>
              <td>
                <input data-table="pendencias" data-row="${index}" data-field="contaDebitoAdm" data-nav-row="${index}" data-nav-col="2" type="text" value="${escapeHtml(row.contaDebitoAdm || '')}" placeholder="Conta débito adm." />
              </td>
              <td>
                <input data-table="pendencias" data-row="${index}" data-field="contaCreditoAdm" data-nav-row="${index}" data-nav-col="3" type="text" value="${escapeHtml(row.contaCreditoAdm || '')}" placeholder="Conta crédito adm." />
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    bindPendingInputs();
  }

  function updateMetricsFromResult(result) {
    setMetric('metricRegistros', Number(result?.total_registros || 0));
    setMetric('metricPendencias', Number(result?.total_pendencias || 0));
    setMetric('metricCentros', Number(result?.total_centros || 0));
    setMetric('metricValor', `R$ ${Number(result?.total_valor || 0).toFixed(2).replace('.', ',')}`);
  }

  function setActivePanel(panel) {
    const host = $('cadastroPanelHost');
    const buttons = Array.from(document.querySelectorAll('.lotes-renasul-tab[data-panel]'));
    const sections = Array.from(document.querySelectorAll('.lotes-renasul-panel[data-panel]'));

    if (state.activePanel === panel) {
      state.activePanel = null;
      if (host) host.hidden = true;
      buttons.forEach((button) => button.classList.remove('is-active'));
      sections.forEach((section) => section.classList.remove('is-active'));
      return;
    }

    state.activePanel = panel;
    if (host) host.hidden = false;

    buttons.forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-panel') === panel);
    });
    sections.forEach((section) => {
      section.classList.toggle('is-active', section.getAttribute('data-panel') === panel);
    });
  }

  function getDeParaRows() {
    if (!Array.isArray(state.config.dePara)) state.config.dePara = [];
    return state.config.dePara;
  }

  function renderDeParaTable() {
    const tbody = $('deParaBody');
    if (!tbody) return;

    const rows = getDeParaRows();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7">Nenhuma rubrica cadastrada ainda.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map((row, index) => `
        <tr data-row="${index}" data-table="depara">
          <td>
            <input data-table="depara" data-row="${index}" data-field="rubrica" data-nav-row="${index}" data-nav-col="0" type="text" value="${escapeHtml(row.rubrica || '')}" placeholder="1" />
          </td>
          <td>
            <input data-table="depara" data-row="${index}" data-field="nome" data-nav-row="${index}" data-nav-col="1" type="text" value="${escapeHtml(row.nome || '')}" placeholder="Nome da rubrica" />
          </td>
          <td>
            <input data-table="depara" data-row="${index}" data-field="contaDebitoProducao" data-nav-row="${index}" data-nav-col="2" type="text" value="${escapeHtml(row.contaDebitoProducao || '')}" placeholder="Débito prod." />
          </td>
          <td>
            <input data-table="depara" data-row="${index}" data-field="contaCreditoProducao" data-nav-row="${index}" data-nav-col="3" type="text" value="${escapeHtml(row.contaCreditoProducao || '')}" placeholder="Crédito prod." />
          </td>
          <td>
            <input data-table="depara" data-row="${index}" data-field="contaDebitoAdm" data-nav-row="${index}" data-nav-col="4" type="text" value="${escapeHtml(row.contaDebitoAdm || '')}" placeholder="Débito adm." />
          </td>
          <td>
            <input data-table="depara" data-row="${index}" data-field="contaCreditoAdm" data-nav-row="${index}" data-nav-col="5" type="text" value="${escapeHtml(row.contaCreditoAdm || '')}" placeholder="Crédito adm." />
          </td>
          <td>
            <button type="button" class="lotes-renasul-delete-btn" data-action="remove-depara" data-row="${index}" title="Excluir linha">Excluir</button>
          </td>
        </tr>
      `)
      .join('');
  }

  function renderCentros() {
    const adm = $('centroAdm');
    const prod = $('centroProducao');
    if (adm) adm.value = state.config.centrosCusto?.adm || DEFAULT_CONFIG.centrosCusto.adm;
    if (prod) prod.value = state.config.centrosCusto?.producao || DEFAULT_CONFIG.centrosCusto.producao;
  }

  function renderAll() {
    renderDeParaTable();
    renderCentros();
    invalidateValidation();
    renderLog();
  }

  function scheduleSave() {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      void saveConfigNow();
    }, 500);
  }

  function updateDeParaRowFromInput(target) {
    const rowIndex = Number(target.getAttribute('data-row'));
    const field = target.getAttribute('data-field');
    const row = state.config.dePara[rowIndex];
    if (!row || !field) return;
    row[field] = String(target.value || '');
  }

  function updateCentersFromInputs() {
    state.config.centrosCusto = {
      adm: normalizeText($('centroAdm')?.value || DEFAULT_CONFIG.centrosCusto.adm),
      producao: normalizeText($('centroProducao')?.value || DEFAULT_CONFIG.centrosCusto.producao),
    };
  }

  function isInputVisible(input) {
    if (!input || !(input instanceof HTMLElement)) return false;
    return input.offsetParent !== null;
  }

  function focusInputByCoords(tableId, row, col, fallbackDirection = 1) {
    const root = $(tableId) || target.closest('tbody') || target.closest('table');
    if (!root) return false;

    const exact = root.querySelector(`input[data-nav-row="${row}"][data-nav-col="${col}"]`);
    if (exact && isInputVisible(exact)) {
      exact.focus();
      exact.select?.();
      return true;
    }

    const rowInputs = Array.from(root.querySelectorAll(`input[data-nav-row="${row}"]`)).filter(isInputVisible);
    if (rowInputs.length) {
      const sorted = rowInputs.sort((a, b) => Number(a.getAttribute('data-nav-col')) - Number(b.getAttribute('data-nav-col')));
      const candidate = fallbackDirection >= 0 ? sorted[0] : sorted[sorted.length - 1];
      candidate.focus();
      candidate.select?.();
      return true;
    }

    return false;
  }

  function moveByArrow(target, key) {
    const tableId = target.getAttribute('data-table');
    const row = Number(target.getAttribute('data-nav-row'));
    const col = Number(target.getAttribute('data-nav-col'));
    if (!tableId || Number.isNaN(row) || Number.isNaN(col)) return false;

    if (key === 'ArrowLeft') return focusInputByCoords(tableId, row, col - 1, -1);
    if (key === 'ArrowRight') return focusInputByCoords(tableId, row, col + 1, 1);

    const delta = key === 'ArrowDown' ? 1 : -1;
    const root = $(tableId);
    if (!root) return false;

    const candidateRow = row + delta;
    const candidate = root.querySelector(`input[data-nav-row="${candidateRow}"][data-nav-col="${col}"]`);
    if (candidate && isInputVisible(candidate)) {
      candidate.focus();
      candidate.select?.();
      return true;
    }

    const rowInputs = Array.from(root.querySelectorAll(`input[data-nav-row="${candidateRow}"]`)).filter(isInputVisible);
    if (rowInputs.length) {
      const sorted = rowInputs.sort((a, b) => Number(a.getAttribute('data-nav-col')) - Number(b.getAttribute('data-nav-col')));
      let selected = sorted[0];
      for (const input of sorted) {
        const inputCol = Number(input.getAttribute('data-nav-col'));
        if (inputCol >= col) {
          selected = input;
          break;
        }
      }
      selected.focus();
      selected.select?.();
      return true;
    }

    return false;
  }

  function bindArrowNavigation(container) {
    if (!container) return;
    container.addEventListener('keydown', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      if (moveByArrow(target, event.key)) event.preventDefault();
    });
  }

  function removeDeParaRow(index) {
    state.config.dePara.splice(index, 1);
    renderDeParaTable();
    bindPanelInputs();
    scheduleSave();
    invalidateValidation('Cadastro alterado. Valide novamente antes de gerar o TXT.');
    appendLog('warn', 'Linha de de/para removida', `indice=${index}`);
  }

  function bindPanelInputs() {
    if (state.panelInputsBound) return;
    state.panelInputsBound = true;

    bindArrowNavigation($('deParaBody'));

    $('deParaBody')?.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      updateDeParaRowFromInput(target);
      scheduleSave();
      invalidateValidation('Cadastro alterado. Valide novamente antes de gerar o TXT.');
      appendLog('info', 'Cadastro alterado', 'Linha de de/para editada.');
    });

    $('deParaBody')?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute('data-action');
      if (action === 'remove-depara') {
        const row = Number(target.getAttribute('data-row'));
        if (!Number.isNaN(row)) removeDeParaRow(row);
      }
    });

    $('centroAdm')?.addEventListener('input', () => {
      updateCentersFromInputs();
      scheduleSave();
      invalidateValidation('Cadastro alterado. Valide novamente antes de gerar o TXT.');
      appendLog('info', 'Cadastro alterado', 'Centros de custo ADM atualizados.');
    });

    $('centroProducao')?.addEventListener('input', () => {
      updateCentersFromInputs();
      scheduleSave();
      invalidateValidation('Cadastro alterado. Valide novamente antes de gerar o TXT.');
      appendLog('info', 'Cadastro alterado', 'Centros de custo Produção atualizados.');
    });
  }

  function bindPendingInputs() {
    if (state.pendingInputsBound) return;
    state.pendingInputsBound = true;

    bindArrowNavigation($('pendenciasBox'));

    $('pendenciasBox')?.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const rowIndex = Number(target.getAttribute('data-row'));
      const field = target.getAttribute('data-field');
      const row = state.pendingDraftRows[rowIndex];
      if (!row || !field) return;
      row[field] = String(target.value || '');
      state.pendingDirty = true;
      invalidateValidation('Preencha os cadastros pendentes e clique em Salvar cadastros.');
      appendLog('info', 'Pendencia editada', `linha=${rowIndex}; campo=${field}`);
    });
  }

  function collectPendingMappings() {
    const map = new Map();

    for (const row of state.pendingDraftRows) {
      const rubrica = normalizeText(row?.rubrica || '');
      const key = normalizeDigits(rubrica);
      if (!key) continue;

      const current = map.get(key) || {
        rubrica,
        nome: normalizeText(row?.nome || ''),
        contaDebitoProducao: '',
        contaCreditoProducao: '',
        contaDebitoAdm: '',
        contaCreditoAdm: '',
      };

      if (!current.nome) current.nome = normalizeText(row?.nome || '');

      for (const field of ['contaDebitoProducao', 'contaCreditoProducao', 'contaDebitoAdm', 'contaCreditoAdm']) {
        const value = normalizeText(row?.[field] || '');
        if (value) current[field] = value;
      }

      map.set(key, current);
    }

    return Array.from(map.values()).filter((row) =>
      Boolean(row.contaDebitoProducao || row.contaCreditoProducao || row.contaDebitoAdm || row.contaCreditoAdm)
    );
  }

  function upsertDeParaMappings(rows) {
    if (!Array.isArray(rows) || !rows.length) return 0;
    if (!Array.isArray(state.config.dePara)) state.config.dePara = [];

    const indexByKey = new Map();
    state.config.dePara.forEach((row, index) => {
      const key = normalizeDigits(row?.rubrica || row?.classificacao || '');
      if (!key || indexByKey.has(key)) return;
      indexByKey.set(key, index);
    });

    let inserted = 0;
    for (const row of rows) {
      const key = normalizeDigits(row?.rubrica || '');
      if (!key) continue;

      const existingIndex = indexByKey.get(key);
      if (typeof existingIndex === 'number') {
        const target = state.config.dePara[existingIndex];
        if (!target) continue;
        target.rubrica = normalizeText(row.rubrica || target.rubrica || '');
        target.nome = normalizeText(row.nome || target.nome || '');
        for (const field of ['contaDebitoProducao', 'contaCreditoProducao', 'contaDebitoAdm', 'contaCreditoAdm']) {
          const value = normalizeText(row[field] || '');
          if (value) target[field] = value;
        }
        continue;
      }

      state.config.dePara.push({
        rubrica: normalizeText(row.rubrica || ''),
        nome: normalizeText(row.nome || ''),
        contaDebitoProducao: normalizeText(row.contaDebitoProducao || ''),
        contaCreditoProducao: normalizeText(row.contaCreditoProducao || ''),
        contaDebitoAdm: normalizeText(row.contaDebitoAdm || ''),
        contaCreditoAdm: normalizeText(row.contaCreditoAdm || ''),
      });
      indexByKey.set(key, state.config.dePara.length - 1);
      inserted += 1;
    }

    state.config.dePara.sort((a, b) => {
      const keyA = normalizeDigits(a?.rubrica || a?.classificacao || '');
      const keyB = normalizeDigits(b?.rubrica || b?.classificacao || '');
      if (keyA !== keyB) return keyA.localeCompare(keyB, 'pt-BR', { numeric: true });
      return normalizeText(a?.nome || '').localeCompare(normalizeText(b?.nome || ''), 'pt-BR');
    });

    return inserted;
  }

  async function savePendingCadastros() {
    const mappings = collectPendingMappings();
    if (!mappings.length) {
      setStatus('Preencha pelo menos uma conta nas pendências antes de salvar.', true);
      appendLog('warn', 'Salvar cadastros bloqueado', 'Nenhuma conta informada nas pendencias.');
      return;
    }

    ensureCurrentConfigFromDom();
    const inserted = upsertDeParaMappings(mappings);
    state.pendingDirty = false;
    await saveConfigNow();
    invalidateValidation('Cadastros salvos. Valide novamente antes de gerar o TXT.');
    appendLog('info', 'Cadastros salvos', `rubricas=${mappings.length}; novas=${inserted}`);
  }

  function addDeParaRow() {
    state.config.dePara.push({
      rubrica: '',
      nome: '',
      contaDebitoProducao: '',
      contaCreditoProducao: '',
      contaDebitoAdm: '',
      contaCreditoAdm: '',
    });
    renderDeParaTable();
    bindPanelInputs();
    scheduleSave();
    window.setTimeout(() => {
      const rowIndex = state.config.dePara.length - 1;
      const input = $('deParaBody')?.querySelector(`input[data-row="${rowIndex}"][data-field="rubrica"]`);
      input?.focus();
    }, 0);
  }

  function ensureCurrentConfigFromDom() {
    updateCentersFromInputs();
  }

  async function saveConfigNow() {
    if (state.saving) return state.config;
    ensureCurrentConfigFromDom();
    state.saving = true;
    try {
      const response = await AuthClient.authFetch(`${API_BASE}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.config),
      });
      const data = await safeJson(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao salvar configuracao.');
      }

      state.config = cloneConfig(data.config || state.config);
      renderAll();
      bindPanelInputs();
      bindPendingInputs();
      setStatus('Cadastros salvos no servidor local.', false);
      invalidateValidation();
      appendLog('info', 'Configuração salva', 'Cadastros persistidos no servidor local.');
      return state.config;
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Erro ao salvar configuracao.', true);
      appendLog('error', 'Falha ao salvar configuração', formatErrorDetail(error));
      return state.config;
    } finally {
      state.saving = false;
    }
  }

  async function loadConfig() {
    const response = await AuthClient.authFetch(`${API_BASE}/config`, { method: 'GET' });
    const data = await safeJson(response);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Falha ao carregar configuracao.');
    }
    state.config = cloneConfig(data.config || DEFAULT_CONFIG);
    renderAll();
    bindPanelInputs();
    bindPendingInputs();
    invalidateValidation();
    appendLog('info', 'Configuração carregada', 'Dados locais do lotes-renasul foram carregados.');
  }

  async function validateFile(file) {
    if (!file) {
      setStatus('Selecione um arquivo Excel valido para validar.', true);
      appendLog('warn', 'Validação bloqueada', 'Nenhum arquivo selecionado.');
      return null;
    }

    const signature = [file.name || '', file.size || 0, file.lastModified || 0].join('|');
    state.currentSignature = signature;

    const formData = new FormData();
    formData.append('file', file, file.name || 'lotes-renasul.xls');

    setStatus('Validando arquivo e conferindo de/para...', false);
    appendLog('info', 'Iniciando validação', `arquivo=${file.name || 'lotes-renasul.xls'}`);
    setDownloadUrl('');
    setProcessEnabled(false);

    const response = await AuthClient.authFetch(`${API_BASE}/validate`, {
      method: 'POST',
      body: formData,
    });
    const data = await safeJson(response);
    if (!response.ok || !data?.ok) {
      logError('Validação falhou', response, data);
      appendLog('error', 'Validação interrompida', formatErrorDetail(data || response));
      throw new Error(data?.error || 'Falha ao validar arquivo.');
    }

    const resumo = data.resumo || {};
    renderEventosPreview(resumo.preview_eventos || []);
    renderPendenciasPreview(resumo.preview_pendencias || resumo.pendencias || []);
    updateMetricsFromResult(resumo);
    renderTxtPreview(resumo.preview_linhas || []);
    updateValidationSummary(resumo);
    recordValidationState(resumo);
    return resumo;
  }

  async function processFile(file) {
    if (!file) {
      setStatus('Selecione um arquivo Excel valido.', true);
      appendLog('warn', 'Processamento bloqueado', 'Nenhum arquivo selecionado.');
      return;
    }

    const signature = [file.name || '', file.size || 0, file.lastModified || 0].join('|');
    state.currentSignature = signature;
    if (!state.validatedOk || state.validatedSignature !== signature) {
      setStatus('Valide o arquivo antes de gerar o TXT.', true);
      appendLog('warn', 'Processamento bloqueado', 'Validação obrigatória antes do TXT.');
      setProcessEnabled(false);
      return;
    }

    const formData = new FormData();
    formData.append('file', file, file.name || 'lotes-renasul.xls');

    setStatus('Processando folha e gerando TXT...', false);
    appendLog('info', 'Iniciando processamento', `arquivo=${file.name || 'lotes-renasul.xls'}`);
    setDownloadUrl('');
    renderEventosPreview([]);
    renderPendenciasPreview([]);
    renderTxtPreview([]);
    setMetric('metricRegistros', '0');
    setMetric('metricPendencias', '0');
    setMetric('metricCentros', '0');
    setMetric('metricValor', 'R$ 0,00');

    const response = await AuthClient.authFetch(`${API_BASE}/process`, {
      method: 'POST',
      body: formData,
    });
    const data = await safeJson(response);
    if (!response.ok || !data?.ok) {
      logError('Processamento falhou', response, data);
      appendLog('error', 'Processamento interrompido', formatErrorDetail(data || response));
      throw new Error(data?.error || 'Falha ao processar arquivo.');
    }

    const resumo = data.resumo || {};
    updateMetricsFromResult(resumo);
    renderEventosPreview(resumo.preview_eventos || []);
    renderPendenciasPreview(resumo.preview_pendencias || resumo.pendencias || []);
    renderTxtPreview(resumo.preview_linhas || []);
    setDownloadUrl(data.downloadUrl || '');
    setStatus(resumo.message || data.message || (resumo.gerou_txt ? 'TXT gerado com sucesso.' : 'Processado sem gerar TXT.'), false);
    invalidateValidation('Arquivo gerado. Se fizer qualquer ajuste nos cadastros, valide novamente.');
    appendLog('info', 'Processamento concluído', `registros=${resumo.total_registros || 0}; pendencias=${resumo.total_pendencias || 0}`);
  }

  function bindGlobalActions() {
    if (state.globalActionsBound) return;
    state.globalActionsBound = true;

    document.querySelectorAll('.lotes-renasul-tab[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => setActivePanel(btn.getAttribute('data-panel')));
    });

    $('btnValidate')?.addEventListener('click', async () => {
      try {
        const file = $('excelFile')?.files?.[0] || null;
        await validateFile(file);
      } catch (error) {
        console.error(error);
        setStatus(error.message || 'Erro inesperado ao validar arquivo.', true);
        appendLog('error', 'Erro na validação', formatErrorDetail(error));
      }
    });

    $('btnAddRubrica')?.addEventListener('click', addDeParaRow);

    $('btnSaveCadastros')?.addEventListener('click', async () => {
      try {
        await savePendingCadastros();
      } catch (error) {
        console.error(error);
        setStatus(error.message || 'Erro inesperado ao salvar cadastros.', true);
        appendLog('error', 'Erro ao salvar cadastros', formatErrorDetail(error));
      }
    });

    $('btnDownload')?.addEventListener('click', () => {
      if (!state.downloadUrl) return;
      window.open(state.downloadUrl, '_blank', 'noopener,noreferrer');
    });

    $('processForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const file = $('excelFile')?.files?.[0] || null;
        await processFile(file);
      } catch (error) {
        console.error(error);
        setStatus(error.message || 'Erro inesperado ao processar arquivo.', true);
        appendLog('error', 'Erro no processamento', formatErrorDetail(error));
      }
    });

    $('scrollTopBtn')?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('btnClearLog')?.addEventListener('click', () => {
      clearLog();
      appendLog('info', 'Log limpo', 'O histórico de logs da página foi apagado.');
    });

    $('excelFile')?.addEventListener('change', () => {
      invalidateValidation('Selecione Validar antes de gerar o TXT.');
      setDownloadUrl('');
      renderEventosPreview([]);
      renderPendenciasPreview([]);
      renderTxtPreview([]);
      clearLog();
      setMetric('metricRegistros', '0');
      setMetric('metricPendencias', '0');
      setMetric('metricCentros', '0');
      setMetric('metricValor', 'R$ 0,00');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.activePanel) {
        setActivePanel(state.activePanel);
      }
    });

    window.addEventListener('error', (event) => {
      const detail = event?.error
        ? formatErrorDetail(event.error)
        : `${event.message || 'Erro de runtime'} @ ${event.filename || 'desconhecido'}:${event.lineno || 0}:${event.colno || 0}`;
      appendLog('error', 'Erro de runtime capturado', detail);
    });

    window.addEventListener('unhandledrejection', (event) => {
      appendLog('error', 'Promise rejeitada sem tratamento', formatErrorDetail(event?.reason));
    });
  }

  async function boot() {
    if (typeof inicializarSidebar === 'function') {
      await inicializarSidebar(SLUG);
    }

    const ctx = await AuthClient.getAuthContext().catch(() => null);
    if (!ctx?.user) {
      window.location.href = '/login';
      return;
    }

    const whoami = $('whoami');
    if (whoami) {
      whoami.textContent = `Logado como: ${ctx.user.name} <${ctx.user.email}> (${ctx.user.role})`;
    }

    bindGlobalActions();
    setActivePanel(null);
    setProcessEnabled(false);

    try {
      await loadConfig();
      setStatus('Configuracao carregada. Selecione o Excel e valide antes de gerar o TXT.', false);
      appendLog('info', 'Página carregada', 'Configuração local pronta.');
    } catch (error) {
      console.error(error);
      renderAll();
      bindPanelInputs();
      setStatus(error.message || 'Nao foi possivel carregar a configuracao.', true);
      appendLog('error', 'Falha ao carregar a configuração', error.message || 'sem detalhe');
    }
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
