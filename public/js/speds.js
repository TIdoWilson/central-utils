/* global AuthClient, inicializarSidebar */

(function () {
  const SLUG = 'speds';
  const API_BASE = '/api/speds';

  const state = {
    spedTypes: [],
    templates: [],
    currentTemplate: null,
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

  async function safeJson(resp) {
    try {
      return await resp.json();
    } catch (_) {
      return null;
    }
  }

  function setStatus(msg, isError) {
    const el = $('runStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? '#b91c1c' : '#1e293b';
  }

  function setErrors(errors) {
    const box = $('runErrors');
    if (!box) return;
    if (!errors || errors.length === 0) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = `<strong>Validação:</strong><br>${errors.map((e) => `- ${escapeHtml(e)}`).join('<br>')}`;
  }

  function clearResult() {
    $('runSummary').innerHTML = '';
    $('downloadList').innerHTML = '';
    renderValidationInsights(null);
    setErrors([]);
  }

  function normalizeExtension(name) {
    const raw = String(name || '').trim().toLowerCase();
    if (!raw) return '';
    const lastDot = raw.lastIndexOf('.');
    return lastDot >= 0 ? raw.slice(lastDot) : '';
  }

  function formatExtensionList(list) {
    return (Array.isArray(list) ? list : [])
      .map((item) => normalizeExtension(item))
      .filter(Boolean);
  }

  function findInputElementByKey(inputKey) {
    const all = Array.from(document.querySelectorAll('[data-input-key]'));
    return all.find((el) => el.getAttribute('data-input-key') === String(inputKey || '')) || null;
  }

  function validateFilesByTemplate(template) {
    const errors = [];
    if (!template) return errors;

    for (const input of template.inputs || []) {
      const key = String(input?.key || '');
      const label = String(input?.label || key || 'arquivo');
      const el = findInputElementByKey(key);
      const files = el?.files ? Array.from(el.files) : [];
      const allowed = formatExtensionList(input?.acceptedExtensions || []);

      if (input?.required && files.length === 0) {
        errors.push(`Campo obrigatório sem arquivo: ${label}.`);
      }

      if (!input?.multiple && files.length > 1) {
        errors.push(`O campo ${label} aceita apenas 1 arquivo.`);
      }

      for (const file of files) {
        const ext = normalizeExtension(file?.name || '');
        if (allowed.length > 0 && (!ext || !allowed.includes(ext))) {
          const allowedText = allowed.join(', ');
          errors.push(`Formato inválido em ${label}: ${file.name} (permitidos: ${allowedText}).`);
        }
      }
    }

    return errors;
  }

  function validateRequiredFields(template) {
    const errors = [];
    if (!template) return errors;

    const fieldsData = collectFields();
    for (const field of template.fields || []) {
      if (!field?.required) continue;
      const value = fieldsData[field.key];
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push(`Campo obrigatório não informado: ${field.label}.`);
      }
    }
    return errors;
  }

  function bindInputValidation(template) {
    document.querySelectorAll('[data-input-key]').forEach((el) => {
      el.addEventListener('change', () => {
        const errors = validateFilesByTemplate(template);
        setErrors(errors);
      });
    });
  }

  async function loadSpedTypes() {
    const resp = await AuthClient.authFetch(`${API_BASE}/types`, { method: 'GET' });
    const data = await safeJson(resp);
    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || 'Falha ao carregar tipos de SPED.');
    }

    state.spedTypes = Array.isArray(data.spedTypes) ? data.spedTypes : [];
    const select = $('spedTypeSelect');
    select.innerHTML = '';

    for (const type of state.spedTypes) {
      const opt = document.createElement('option');
      opt.value = type.id;
      opt.textContent = `${type.label}`;
      select.appendChild(opt);
    }

    const first = state.spedTypes[0] || null;
    if (first) {
      select.value = first.id;
      updateSpedTypeMeta(first);
    }
  }

  function updateSpedTypeMeta(type) {
    const meta = $('spedTypeMeta');
    if (!meta || !type) return;
    meta.textContent = `${type.templates || 0} template(s) disponível(is) | ${type.layoutJsonCount || 0} layout(s) JSON no repositório.`;
  }

  async function loadTemplates(spedType) {
    const resp = await AuthClient.authFetch(`${API_BASE}/templates?spedType=${encodeURIComponent(spedType)}`, {
      method: 'GET',
    });
    const data = await safeJson(resp);
    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || 'Falha ao carregar templates.');
    }

    state.templates = Array.isArray(data.templates) ? data.templates : [];
    const select = $('templateSelect');
    select.innerHTML = '';

    for (const template of state.templates) {
      const opt = document.createElement('option');
      opt.value = template.id;
      opt.textContent = template.title;
      select.appendChild(opt);
    }

    const first = state.templates[0] || null;
    if (first) {
      select.value = first.id;
      $('templateMeta').textContent = first.description || '';
      await loadTemplateDetails(spedType, first.id);
    } else {
      $('templateMeta').textContent = 'Nenhum template cadastrado para este tipo de SPED.';
      renderTemplateDetails(null);
    }
  }

  async function loadTemplateDetails(spedType, templateId) {
    const resp = await AuthClient.authFetch(
      `${API_BASE}/templates/${encodeURIComponent(templateId)}?spedType=${encodeURIComponent(spedType)}`,
      { method: 'GET' }
    );
    const data = await safeJson(resp);
    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || 'Falha ao carregar detalhes do template.');
    }

    state.currentTemplate = data.template || null;
    renderTemplateDetails(state.currentTemplate);
  }

  function renderTemplateDetails(template) {
    const infoEl = $('templateInfo');
    const inputsEl = $('dynamicInputs');
    const fieldsEl = $('dynamicFields');
    const outputFormatEl = $('outputFormatSelect');

    infoEl.innerHTML = '';
    inputsEl.innerHTML = '';
    fieldsEl.innerHTML = '';
    outputFormatEl.innerHTML = '';
    clearResult();

    if (!template) {
      infoEl.innerHTML = '<h3>Sem template selecionado</h3><p>Escolha um tipo de SPED para carregar as funções.</p>';
      return;
    }

    const requirements = (template.inputs || []).map((input) => {
      const req = input.required ? 'Obrigatório' : 'Opcional';
      const multi = input.multiple ? 'Múltiplos arquivos' : 'Arquivo único';
      const accepts = (input.acceptedExtensions || []).join(', ');
      return `
        <div class="speds-requirement">
          <strong>${escapeHtml(input.label)}</strong>
          <div class="speds-muted">${req} - ${multi}</div>
          <div class="speds-muted">Aceita: ${escapeHtml(accepts)}</div>
        </div>
      `;
    }).join('');

    infoEl.innerHTML = `
      <h3>${escapeHtml(template.title)}</h3>
      <p>${escapeHtml(template.description || '')}</p>
      <div class="speds-muted">Script vinculado: ${escapeHtml(template.script?.entry || 'Nao informado')}</div>
      <div class="speds-requirements">${requirements || '<div class="speds-muted">Sem entradas configuradas.</div>'}</div>
    `;

    for (const input of template.inputs || []) {
      const wrap = document.createElement('div');
      wrap.className = 'auth-label speds-field';
      const accepts = (input.acceptedExtensions || []).join(',');
      const requiredMark = input.required ? ' *' : '';
      wrap.innerHTML = `
        <label for="input__${escapeHtml(input.key)}">${escapeHtml(input.label)}${requiredMark}</label>
        <input
          id="input__${escapeHtml(input.key)}"
          class="speds-input"
          type="file"
          ${input.multiple ? 'multiple' : ''}
          ${input.required ? 'required' : ''}
          accept="${escapeHtml(accepts)}"
          data-input-key="${escapeHtml(input.key)}"
        />
        <span class="speds-file-help">${escapeHtml(input.help || '')}</span>
      `;
      inputsEl.appendChild(wrap);
    }

    for (const field of template.fields || []) {
      const wrap = document.createElement('div');
      wrap.className = 'auth-label speds-field';
      const requiredMark = field.required ? ' *' : '';
      const fieldId = `field__${field.key}`;

      let html = `<label for="${escapeHtml(fieldId)}">${escapeHtml(field.label)}${requiredMark}</label>`;

      if (field.type === 'select') {
        const options = Array.isArray(field.options) ? field.options : [];
        const optsHtml = options
          .map((opt) => {
            const selected = String(opt.value) === String(field.defaultValue || '') ? 'selected' : '';
            return `<option value="${escapeHtml(opt.value)}" ${selected}>${escapeHtml(opt.label)}</option>`;
          })
          .join('');
        html += `<select id="${escapeHtml(fieldId)}" class="speds-select" ${field.required ? 'required' : ''} data-field-key="${escapeHtml(field.key)}">${optsHtml}</select>`;
      } else if (field.type === 'textarea') {
        html += `<textarea id="${escapeHtml(fieldId)}" class="speds-textarea" ${field.required ? 'required' : ''} data-field-key="${escapeHtml(field.key)}" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(field.defaultValue || '')}</textarea>`;
      } else {
        const inputType = field.type === 'number' ? 'number' : 'text';
        html += `<input id="${escapeHtml(fieldId)}" class="speds-input" type="${inputType}" ${field.required ? 'required' : ''} data-field-key="${escapeHtml(field.key)}" value="${escapeHtml(field.defaultValue || '')}" placeholder="${escapeHtml(field.placeholder || '')}" />`;
      }

      wrap.innerHTML = html;
      fieldsEl.appendChild(wrap);
    }

    const outputFormats = Array.isArray(template.outputFormats) ? template.outputFormats : [];
    for (const format of outputFormats) {
      const opt = document.createElement('option');
      opt.value = format;
      opt.textContent = `.${format}`;
      outputFormatEl.appendChild(opt);
    }

    $('templateMeta').textContent = template.description || '';
    bindInputValidation(template);
  }

  function collectFields() {
    const out = {};
    document.querySelectorAll('[data-field-key]').forEach((el) => {
      const key = el.getAttribute('data-field-key');
      if (!key) return;
      out[key] = el.value;
    });
    return out;
  }

  function buildSummary(summary) {
    const el = $('runSummary');
    if (!summary) {
      el.innerHTML = '';
      return;
    }
    const items = [
      { label: 'Job ID', value: summary.jobId || '-' },
      { label: 'Template', value: summary.templateTitle || '-' },
      { label: 'Arquivos', value: String(Array.isArray(summary.files) ? summary.files.length : 0) },
      { label: 'Campos', value: String(Array.isArray(summary.fields) ? summary.fields.length : 0) },
    ];
    if (summary?.validationFindings) {
      items.push({
        label: 'Pendencias',
        value: String(Number(summary.validationFindings?.totals?.invalidRefs || 0)),
      });
    }

    el.innerHTML = items
      .map((item) => `<div class="speds-kpi"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></div>`)
      .join('');
  }

  function renderValidationInsights(findings) {
    const box = $('validationInsights');
    if (!box) return;

    if (!findings || typeof findings !== 'object') {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    const totals = findings?.totals || {};
    const invalidRefs = Number(totals?.invalidRefs || 0);
    const checks = Number(totals?.checks || 0);
    const grouped = Array.isArray(findings?.groupedIssues) ? findings.groupedIssues : [];
    const firstOccurrences = Array.isArray(findings?.firstOccurrences) ? findings.firstOccurrences : [];
    const missingDomains = Array.isArray(findings?.domainsWithoutDefinitions) ? findings.domainsWithoutDefinitions : [];
    const statusOk = String(findings?.status || '') === 'ok';
    const statusText = statusOk ? 'Sem pendencias encontradas.' : 'Pendencias encontradas. Revise os itens abaixo.';

    const groupedHtml = grouped.length === 0
      ? '<div class="speds-validation-empty">Nenhuma pendencia agrupada.</div>'
      : grouped.slice(0, 12).map((item) => `
          <div class="speds-validation-item">
            <div class="speds-validation-item-top">
              <strong>${escapeHtml(`${item.count}x`)}</strong>
              <span>${escapeHtml(item.domainLabel || item.domain || 'Dominio')}</span>
            </div>
            <div class="speds-validation-item-body">${escapeHtml(item.message || '')}</div>
            <div class="speds-validation-item-help">Onde corrigir: ${escapeHtml(item.expectedDefinition || '')}</div>
            <div class="speds-validation-item-help">Como corrigir: ${escapeHtml(item.howToFix || '')}</div>
          </div>
        `).join('');

    const missingHtml = missingDomains.length === 0
      ? ''
      : `
        <div class="speds-validation-block">
          <h4>Cadastros ausentes no arquivo</h4>
          <div class="speds-validation-list">
            ${missingDomains.map((item) => `
              <div class="speds-validation-item">
                <div class="speds-validation-item-top">
                  <strong>${escapeHtml(item.domain || '')}</strong>
                  <span>${escapeHtml(item.domainLabel || '')}</span>
                </div>
                <div class="speds-validation-item-help">Necessario: ${escapeHtml(item.expectedDefinition || '')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

    const occurrencesHtml = firstOccurrences.length === 0
      ? ''
      : `
        <div class="speds-validation-block">
          <h4>Primeiras linhas com pendencia</h4>
          <div class="speds-validation-lines">
            ${firstOccurrences.slice(0, 12).map((item) => `
              <div class="speds-validation-line">
                Linha ${escapeHtml(String(item.lineNumber || 0))}: ${escapeHtml(item.message || '')}
              </div>
            `).join('')}
          </div>
        </div>
      `;

    box.className = `speds-validation-panel ${statusOk ? 'is-ok' : 'is-issues'}`;
    box.innerHTML = `
      <div class="speds-validation-head">
        <h3>Leitura amigavel da validacao</h3>
        <p>${escapeHtml(statusText)}</p>
      </div>
      <div class="speds-validation-kpis">
        <div class="speds-validation-kpi"><strong>Checagens</strong><span>${escapeHtml(String(checks))}</span></div>
        <div class="speds-validation-kpi"><strong>Pendencias</strong><span>${escapeHtml(String(invalidRefs))}</span></div>
      </div>
      <div class="speds-validation-block">
        <h4>Principais causas</h4>
        <div class="speds-validation-list">${groupedHtml}</div>
      </div>
      ${missingHtml}
      ${occurrencesHtml}
    `;
    box.style.display = 'block';
  }

  function renderDownloads(artifact) {
    const listEl = $('downloadList');
    listEl.innerHTML = '';
    if (!artifact?.downloadPath) return;

    listEl.innerHTML = `
      <div class="speds-download-item">
        <div>
          <strong>${escapeHtml(artifact.fileName || 'Resultado')}</strong>
          <div class="speds-muted">${escapeHtml(artifact.mimeType || '')}</div>
        </div>
        <a class="btn btn-secondary" href="${escapeHtml(artifact.downloadPath)}">Baixar</a>
      </div>
    `;
  }

  async function handleRun(event) {
    event.preventDefault();
    setErrors([]);
    clearResult();

    const spedType = $('spedTypeSelect').value;
    const templateId = $('templateSelect').value;
    const outputFormat = $('outputFormatSelect').value || 'txt';

    if (!spedType || !templateId) {
      setStatus('Selecione um tipo de SPED e um template antes de executar.', true);
      return;
    }

    const template = state.currentTemplate;
    const fileErrors = validateFilesByTemplate(template);
    const fieldErrors = validateRequiredFields(template);
    const validationErrors = [...fileErrors, ...fieldErrors];
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setStatus('Revise os anexos e campos obrigatórios antes de executar.', true);
      return;
    }

    const submitBtn = $('btnRunTemplate');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Executando...';
    setStatus('Processando arquivos...', false);

    try {
      const formData = new FormData();
      formData.append('spedType', spedType);
      formData.append('templateId', templateId);
      formData.append('outputFormat', outputFormat);
      formData.append('fieldsJson', JSON.stringify(collectFields()));

      document.querySelectorAll('[data-input-key]').forEach((input) => {
        const key = input.getAttribute('data-input-key');
        if (!key || !input.files) return;
        for (const file of input.files) {
          formData.append(`input__${key}`, file);
        }
      });

      const resp = await AuthClient.authFetch(`${API_BASE}/run`, {
        method: 'POST',
        body: formData,
      });
      const data = await safeJson(resp);
      if (!resp.ok || !data?.ok) {
        const error = data?.error || 'Falha ao executar template.';
        const details = Array.isArray(data?.details) ? data.details : [];
        throw { message: error, details };
      }

      setStatus(`Processamento concluído (job ${data.jobId}).`, false);
      buildSummary(data.summary || null);
      renderValidationInsights(data.summary?.validationFindings || null);
      renderDownloads(data.artifact || null);
    } catch (error) {
      console.error(error);
      const details = Array.isArray(error?.details) ? error.details : [];
      setStatus(error?.message || 'Erro ao processar template.', true);
      renderValidationInsights(null);
      setErrors(details);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Executar';
    }
  }

  async function boot() {
    try {
      if (!window.AuthClient?.authFetch) {
        throw new Error('AuthClient não disponível. Recarregue a página.');
      }

      if (typeof inicializarSidebar === 'function') {
        await inicializarSidebar(SLUG);
      }

      const meResp = await AuthClient.authFetch('/api/auth/me', { method: 'GET' });
      if (!meResp.ok) throw new Error('Sessão inválida. Faça login novamente.');
      const meData = await safeJson(meResp);
      const user = meData?.user;
      const whoami = $('whoami');
      if (whoami && user) {
        const name = String(user.name || 'Usuário');
        const email = String(user.email || '');
        const role = String(user.role || '');
        whoami.textContent = `Logado como: ${name}${email ? ` <${email}>` : ''}${role ? ` (${role})` : ''}`;
      }

      await loadSpedTypes();
      const selectedType = $('spedTypeSelect').value;
      if (selectedType) {
        await loadTemplates(selectedType);
      }

      $('spedTypeSelect').addEventListener('change', async () => {
        const selected = $('spedTypeSelect').value;
        const info = state.spedTypes.find((item) => item.id === selected);
        updateSpedTypeMeta(info || null);
        await loadTemplates(selected);
      });

      $('templateSelect').addEventListener('change', async () => {
        const selectedType = $('spedTypeSelect').value;
        const selectedTemplate = $('templateSelect').value;
        await loadTemplateDetails(selectedType, selectedTemplate);
      });

      $('spedsForm').addEventListener('submit', handleRun);
      setStatus('Selecione o template e envie os arquivos necessários.', false);
    } catch (error) {
      console.error(error);
      setStatus(error?.message || 'Falha ao iniciar página SPEDS.', true);
    }
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
