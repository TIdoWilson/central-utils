(function () {
  'use strict';

  const workbookData = window.CALCULO_SALARIO_CODEX_DATA;
  const core = window.CalculoSalarioCodexCore;

  if (!workbookData || !core) {
    throw new Error('Dados ou motor do cálculo de salário Codex não carregados.');
  }

  const workbookState = core.createWorkbookState(workbookData);
  let currentSheetName = workbookData.sheetOrder[0];

  function byId(id) {
    return document.getElementById(id);
  }

  function singleField(label, address, options = {}) {
    return {
      type: 'single',
      label,
      address,
      helper: options.helper || '',
      readonly: Boolean(options.readonly),
    };
  }

  function pairField(label, firstAddress, secondAddress, options = {}) {
    return {
      type: 'pair',
      label,
      firstAddress,
      secondAddress,
      firstLabel: options.firstLabel || 'Valor 1',
      secondLabel: options.secondLabel || 'Valor 2',
      helper: options.helper || '',
    };
  }

  function standardConfig(options) {
    const sections = [
      {
        title: 'Dados principais',
        description: 'Campos centrais da folha usados para salário base, proporcionalidade e dependentes.',
        badge: 'Editável',
        fields: [
          singleField('Salário base', 'I3'),
          singleField('Dias trabalhados', 'D3'),
          singleField('Dias do mês', 'E3'),
          singleField('Dependentes', 'N10'),
        ],
      },
    ];

    if (options.includeDsr) {
      sections.push({
        title: 'DSR e dias do mês',
        description: 'Parâmetros usados pelo cálculo de DSR da própria aba.',
        badge: options.dsrReadonly ? 'Somente leitura' : 'Editável',
        badgeReadonly: options.dsrReadonly,
        fields: [
          singleField('Dias úteis', 'H14', { readonly: options.dsrReadonly }),
          singleField('Domingos e feriados', 'H15', { readonly: options.dsrReadonly }),
        ],
      });
    }

    if (options.includeExtras) {
      sections.push({
        title: 'Horas extras e adicionais',
        description: 'Horas e minutos que alimentam as fórmulas da folha para DSR, extras e adicional noturno.',
        badge: 'Editável',
        fields: [
          pairField('Horas extras 50%', 'H18', 'I18', { firstLabel: 'Horas', secondLabel: 'Minutos' }),
          pairField('Horas extras 100%', 'H19', 'I19', { firstLabel: 'Horas', secondLabel: 'Minutos' }),
          pairField('Adicional noturno 20%', 'H20', 'I20', { firstLabel: 'Horas', secondLabel: 'Minutos' }),
        ],
      });
    }

    const parameterFields = [
      singleField('Valor por dependente', 'O10', { readonly: true }),
      singleField('Dedução simplificada', 'Q10', { readonly: true }),
      singleField('Teto do INSS', 'Q6', { readonly: true }),
    ];

    if (options.specialThreshold) {
      parameterFields.push(singleField('Limite da regra especial', 'Y29'));
    }

    if (options.specialFactor) {
      parameterFields.push(singleField('Fator da regra especial', 'R10', { readonly: true }));
      parameterFields.push(singleField('Parcela da regra especial', 'R11', { readonly: true }));
    }

    sections.push({
      title: 'Parâmetros da aba',
      description: 'Valores travados da planilha usados pela aba selecionada, exibidos para conferência.',
      badge: 'Somente leitura',
      badgeReadonly: true,
      fields: parameterFields,
    });

    return {
      kind: 'standard',
      title: options.title,
      subtitle: options.subtitle,
      summary: options.summary,
      sections,
      resultGroups: [
        {
          title: 'Resumo da folha',
          items: [
            { label: 'Salário proporcional', address: 'F3' },
            { label: 'Horas e DSR', address: 'I4' },
            { label: 'Base de cálculo', address: 'I5' },
            { label: 'Valor da hora', address: 'I8' },
            { label: 'FGTS', address: 'I10', tone: 'success' },
          ],
        },
        {
          title: 'Descontos e líquido',
          items: [
            { label: 'Desconto de INSS', address: 'F5', tone: 'danger' },
            { label: 'IRRF', address: 'F6', tone: 'danger' },
            { label: 'Salário líquido', address: 'F8', tone: 'primary' },
          ],
        },
      ],
    };
  }

  const SHEET_CONFIG = {
    'FOLHA 2024': standardConfig({
      title: 'Folha 2024',
      subtitle: 'Folha CLT com INSS 2024 e a tabela de IRRF da própria aba.',
      summary: 'Calculadora CLT com horas extras, DSR e descontos progressivos de INSS e IRRF.',
      includeDsr: true,
      includeExtras: true,
      dsrReadonly: false,
      specialThreshold: false,
      specialFactor: false,
    }),
    PROLABORE: standardConfig({
      title: 'Pró-labore',
      subtitle: 'Pró-labore com contribuição de 11% e parâmetros fixos da planilha.',
      summary: 'Versão de pró-labore com foco em salário base, dependentes e descontos finais.',
      includeDsr: true,
      includeExtras: false,
      dsrReadonly: true,
      specialThreshold: false,
      specialFactor: false,
    }),
    'PROLABORE 25': standardConfig({
      title: 'Pró-labore 25',
      subtitle: 'Pró-labore com tabela de 2025/2026 conforme a aba da planilha.',
      summary: 'Mantém o pró-labore da planilha com dedução simplificada e teto do INSS exibidos.',
      includeDsr: true,
      includeExtras: false,
      dsrReadonly: true,
      specialThreshold: false,
      specialFactor: false,
    }),
    'PROLABORE 26': standardConfig({
      title: 'Pró-labore 26',
      subtitle: 'Pró-labore 2026 com parâmetros especiais visíveis e fórmula da aba preservada.',
      summary: 'Mantém a lógica de pró-labore 2026, incluindo teto, dedução simplificada e regra especial da aba.',
      includeDsr: true,
      includeExtras: false,
      dsrReadonly: true,
      specialThreshold: true,
      specialFactor: true,
    }),
    'FOLHA 2025': standardConfig({
      title: 'Folha 2025',
      subtitle: 'Folha CLT com INSS 2025 e parâmetros de IRRF da aba original.',
      summary: 'Calculadora CLT com horas extras, DSR e descontos progressivos do ano de 2025.',
      includeDsr: true,
      includeExtras: true,
      dsrReadonly: false,
      specialThreshold: false,
      specialFactor: false,
    }),
    'FOLHA 2025 (2)': standardConfig({
      title: 'Folha 2025 (2)',
      subtitle: 'Variação da folha 2025 com regra especial e limite adicional presentes na planilha.',
      summary: 'Mantém a segunda aba de 2025 com o limite especial editável e parâmetros de IRRF visíveis.',
      includeDsr: true,
      includeExtras: true,
      dsrReadonly: false,
      specialThreshold: true,
      specialFactor: false,
    }),
    'FOLHA 2026': standardConfig({
      title: 'Folha 2026',
      subtitle: 'Folha CLT 2026 com regra especial de IRRF e parâmetros próprios da aba.',
      summary: 'Versão completa da folha 2026 com horas extras, adicional noturno, DSR e parâmetros especiais.',
      includeDsr: true,
      includeExtras: true,
      dsrReadonly: false,
      specialThreshold: true,
      specialFactor: true,
    }),
    'FOLHA 2026 open': {
      kind: 'open',
      title: 'Folha 2026 Open',
      subtitle: 'Comparativo entre a base principal e o cenário open usando os mesmos parâmetros centrais da aba.',
      summary: 'A aba Open compartilha parte das entradas da folha principal e adiciona um salário open com cálculos paralelos.',
      sections: [
        {
          title: 'Parâmetros compartilhados',
          description: 'Esses campos influenciam o cenário principal e também o cálculo open desta aba.',
          badge: 'Editável',
          fields: [
            singleField('Salário base principal', 'J3'),
            singleField('Dias trabalhados', 'D3'),
            singleField('Dias do mês', 'E3'),
            singleField('Dependentes compartilhados', 'M10'),
          ],
        },
        {
          title: 'Cenário Open',
          description: 'Entradas específicas do bloco Open, com DSR e adicionais separados do cenário principal.',
          badge: 'Editável',
          fields: [
            singleField('Salário open', 'J2'),
            singleField('Dias úteis do cenário open', 'I12'),
            singleField('Domingos e feriados do cenário open', 'I13'),
            pairField('Horas extras 50% do cenário open', 'I16', 'J16', { firstLabel: 'Horas', secondLabel: 'Minutos' }),
            pairField('Horas extras 100% do cenário open', 'I17', 'J17', { firstLabel: 'Horas', secondLabel: 'Minutos' }),
            pairField('Adicional noturno 20% do cenário open', 'I18', 'J18', { firstLabel: 'Horas', secondLabel: 'Minutos' }),
          ],
        },
        {
          title: 'Parâmetros bloqueados da aba',
          description: 'Valores fixos da própria planilha Open exibidos para conferência do cálculo.',
          badge: 'Somente leitura',
          badgeReadonly: true,
          fields: [
            singleField('Valor por dependente', 'N10', { readonly: true }),
            singleField('Dedução simplificada', 'P10', { readonly: true }),
            singleField('Teto do INSS', 'P6', { readonly: true }),
            singleField('Fator da regra especial', 'Q10', { readonly: true }),
            singleField('Parcela da regra especial', 'Q11', { readonly: true }),
          ],
        },
      ],
      resultGroups: [
        {
          title: 'Cenário principal',
          items: [
            { label: 'Salário proporcional', address: 'F3' },
            { label: 'Base de cálculo', address: 'J5' },
            { label: 'Desconto de INSS', address: 'F5', tone: 'danger' },
            { label: 'IRRF', address: 'F6', tone: 'danger' },
            { label: 'Salário líquido', address: 'F8', tone: 'primary' },
            { label: 'Valor da hora', address: 'J7' },
            { label: 'FGTS', address: 'J9', tone: 'success' },
          ],
        },
        {
          title: 'Cenário open',
          items: [
            { label: 'Salário open base', address: 'F24' },
            { label: 'Desconto de INSS open', address: 'F26', tone: 'danger' },
            { label: 'IRRF open', address: 'F27', tone: 'danger' },
            { label: 'Salário líquido open', address: 'F29', tone: 'primary' },
          ],
        },
      ],
    },
    'MULTA FGTS': {
      kind: 'multa',
      title: 'Multa FGTS',
      subtitle: 'Resumo da GRRF com os valores base da planilha e ajuste da alíquota da multa.',
      summary: 'A aba atual já traz saldo, base rescisória e FGTS do mês preenchidos; o campo editável é a alíquota de multa.',
      sections: [
        {
          title: 'Alíquota e conferência',
          description: 'O percentual da multa permanece editável; os demais valores seguem o preenchimento do workbook original.',
          badge: 'Editável',
          fields: [
            singleField('Alíquota da multa', 'C9'),
          ],
        },
        {
          title: 'Valores bloqueados da planilha',
          description: 'Esses campos são calculados ou fixados na própria planilha e aparecem aqui apenas para consulta.',
          badge: 'Somente leitura',
          badgeReadonly: true,
          fields: [
            singleField('Saldo FGTS acumulado', 'D6', { readonly: true }),
            singleField('FGTS do mês', 'D7', { readonly: true }),
            singleField('Base da rescisão', 'G3', { readonly: true }),
            singleField('FGTS sobre a base', 'G11', { readonly: true }),
          ],
        },
      ],
      resultGroups: [
        {
          title: 'Resultado da multa',
          items: [
            { label: 'Total FGTS', address: 'D8' },
            { label: 'Valor da multa', address: 'D9', tone: 'danger' },
            { label: 'Valor GRRF', address: 'D10', tone: 'primary' },
          ],
        },
      ],
    },
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getSheetConfig() {
    return SHEET_CONFIG[currentSheetName];
  }

  function getCellState(address) {
    return core.getCellState(workbookState, currentSheetName, address);
  }

  function inputHtml(address, forceReadonly) {
    const state = getCellState(address);
    const isEditable = state.editable && !forceReadonly;
    const readonlyAttr = isEditable ? '' : 'readonly';
    const cssClass = isEditable ? 'salary-codex-input' : 'salary-codex-static';
    const value = isEditable
      ? core.getInputValue(workbookState, currentSheetName, address)
      : core.getDisplayValue(workbookState, currentSheetName, address);

    return `<input class="${cssClass}" type="text" value="${escapeHtml(value)}" data-address="${address}" ${readonlyAttr} />`;
  }

  function renderSingleField(field) {
    const state = getCellState(field.address);
    const badge = state.editable && !field.readonly
      ? '<span class="salary-codex-badge">Editável</span>'
      : '<span class="salary-codex-badge salary-codex-badge--readonly">Somente leitura</span>';

    return `
      <div class="salary-codex-field">
        <div class="salary-codex-field-title">${escapeHtml(field.label)}</div>
        ${inputHtml(field.address, field.readonly)}
        <small>${escapeHtml(field.helper || '')}</small>
        ${badge}
      </div>
    `;
  }

  function renderPairField(field) {
    const firstState = getCellState(field.firstAddress);
    const secondState = getCellState(field.secondAddress);
    const editable = firstState.editable || secondState.editable;
    const badge = editable
      ? '<span class="salary-codex-badge">Editável</span>'
      : '<span class="salary-codex-badge salary-codex-badge--readonly">Somente leitura</span>';

    return `
      <div class="salary-codex-field">
        <div class="salary-codex-field-title">${escapeHtml(field.label)}</div>
        <div class="salary-codex-pair">
          <div class="salary-codex-pair-item">
            <span>${escapeHtml(field.firstLabel)}</span>
            ${inputHtml(field.firstAddress, field.readonly)}
          </div>
          <div class="salary-codex-pair-item">
            <span>${escapeHtml(field.secondLabel)}</span>
            ${inputHtml(field.secondAddress, field.readonly)}
          </div>
        </div>
        <small>${escapeHtml(field.helper || '')}</small>
        ${badge}
      </div>
    `;
  }

  function renderSummary(config) {
    byId('salaryCodexSummary').innerHTML = `
      <div class="salary-codex-summary-card">
        <strong>Aba selecionada</strong>
        <span>${escapeHtml(config.title)}</span>
        <small>${escapeHtml(config.subtitle)}</small>
      </div>
      <div class="salary-codex-summary-card">
        <strong>Como usar</strong>
        <span>Edite os campos liberados</span>
        <small>${escapeHtml(config.summary)}</small>
      </div>
    `;
  }

  function renderWarning() {
    const warning = byId('salaryCodexWarning');
    const sheetDefinition = workbookData.sheets[currentSheetName];
    const unsupported = (sheetDefinition.stats && sheetDefinition.stats.unsupportedFormulas) || [];
    if (!unsupported.length) {
      warning.style.display = 'none';
      warning.textContent = '';
      return;
    }

    warning.style.display = 'block';
    warning.textContent = 'A planilha original desta aba contém uma fórmula auxiliar inválida. Os resultados principais continuam sendo exibidos conforme o workbook, sem inventar regra complementar.';
  }

  function renderSections(config) {
    const container = byId('salaryCodexSections');
    container.innerHTML = config.sections.map((section) => {
      const badge = section.badge
        ? `<span class="salary-codex-badge${section.badgeReadonly ? ' salary-codex-badge--readonly' : ''}">${escapeHtml(section.badge)}</span>`
        : '';

      const fieldsHtml = section.fields.map((field) => (
        field.type === 'pair' ? renderPairField(field) : renderSingleField(field)
      )).join('');

      return `
        <section class="salary-codex-section">
          <div class="salary-codex-section-header">
            <h3>${escapeHtml(section.title)}</h3>
            ${badge}
            <p>${escapeHtml(section.description || '')}</p>
          </div>
          <div class="salary-codex-field-grid">
            ${fieldsHtml}
          </div>
        </section>
      `;
    }).join('');
  }

  function renderResults(config) {
    const container = byId('salaryCodexResults');
    container.innerHTML = config.resultGroups.map((group) => {
      const cards = group.items.map((item) => {
        const toneClass = item.tone ? ` salary-codex-result-card--${item.tone}` : '';
        const value = core.getDisplayValue(workbookState, currentSheetName, item.address);
        return `
          <div class="salary-codex-result-card${toneClass}">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(value || '-')}</span>
            <small>${escapeHtml(item.helper || '')}</small>
          </div>
        `;
      }).join('');

      return `
        <section class="salary-codex-result-group">
          <h3>${escapeHtml(group.title)}</h3>
          <div class="salary-codex-result-grid">
            ${cards}
          </div>
        </section>
      `;
    }).join('');
  }

  function bindInputs() {
    document.querySelectorAll('#salaryCodexSections input[data-address]').forEach((input) => {
      if (input.readOnly) return;

      const commitValue = () => {
        const address = input.getAttribute('data-address');
        core.setEditableValue(workbookState, currentSheetName, address, input.value);
        renderCurrentSheet();
      };

      input.addEventListener('change', commitValue);
      input.addEventListener('blur', commitValue);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          input.blur();
        }
      });
    });
  }

  function renderCurrentSheet() {
    const config = getSheetConfig();
    core.recalculateSheet(workbookState, currentSheetName);
    renderSummary(config);
    renderWarning();
    renderSections(config);
    renderResults(config);
    bindInputs();
  }

  function populateSheetSelector() {
    const select = byId('salaryCodexSheet');
    select.innerHTML = workbookData.sheetOrder
      .map((sheetName) => `<option value="${escapeHtml(sheetName)}">${escapeHtml(sheetName)}</option>`)
      .join('');
    select.value = currentSheetName;
    select.addEventListener('change', (event) => {
      currentSheetName = event.currentTarget.value;
      renderCurrentSheet();
    });
  }

  function bindResetButton() {
    byId('salaryCodexReset').addEventListener('click', () => {
      core.resetSheet(workbookState, currentSheetName);
      renderCurrentSheet();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    inicializarSidebar('calculo-salario-codex');
    populateSheetSelector();
    bindResetButton();
    renderCurrentSheet();
  });
})();
