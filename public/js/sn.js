// public/js/sn.js

document.addEventListener('DOMContentLoaded', async () => {
  // Sidebar
  if (typeof inicializarSidebar === 'function') {
    await inicializarSidebar('sn');
  }

  // AuthClient é obrigatório (CSRF nas mutações)
  if (!window.AuthClient) {
    console.error('AuthClient não carregado. Inclua /js/auth-client.js antes do /js/sn.js');
    window.location.href = '/login';
    return;
  }

  const ctx = await AuthClient.getAuthContext().catch(() => null);
  if (!ctx) {
    window.location.href = '/login';
    return;
  }

  // Referências principais (aceita IDs novos e antigos)
  const paMes = document.getElementById('paMes');
  const paAno = document.getElementById('paAno');
  const companiesOptions = document.getElementById('companiesOptions');

  const btnEnviar =
    document.getElementById('btnEnviarDeclaracao') || document.getElementById('btnEnviarDecl');
  const btnConsultar = document.getElementById('btnConsultarRecibos');
  const btnDownloadTodos = document.getElementById('btnDownloadTodosRecibos');

  const snStatus = document.getElementById('snStatus');
  const consumoInfo = document.getElementById('consumoInfo');

  const companyModal = document.getElementById('companyModal');
  const companyModalOverlay = document.getElementById('companyModalOverlay');

  // botão do modal: NOVO vs ANTIGO
  const btnOpenCompanyModal =
    document.getElementById('btnOpenCompanyModal') || document.getElementById('openCompanyModal');

  const btnCloseCompanyModal = document.getElementById('closeCompanyModal');
  const snCompanyForm = document.getElementById('snCompanyForm');
  const snCompanyMessage = document.getElementById('snCompanyMessage');

  // Se você ainda usa o dropdown antigo em algum ambiente, mantém o toggle:
  const companiesDropdown = document.getElementById('companiesDropdown');
  if (companiesDropdown && companiesOptions) {
    companiesDropdown.addEventListener('click', () => companiesOptions.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!companiesOptions.contains(e.target) && !companiesDropdown.contains(e.target)) {
        companiesOptions.classList.remove('open');
      }
    });
  }

  // Guarda último resultado para habilitar download em lote
  let lastSnResults = null;

  function extractReceiptIds(data) {
    const fromTop = Array.isArray(data?.receiptIds) ? data.receiptIds : [];
    const fromRows = Array.isArray(data?.resultados)
      ? data.resultados.filter((r) => r?.receiptId).map((r) => r.receiptId)
      : [];
    return Array.from(new Set([...fromTop, ...fromRows]));
  }

  // Preencher anos (ano atual - 5 até ano atual + 1)
  if (paAno) {
    const now = new Date();
    const anoAtual = now.getFullYear();
    const start = anoAtual - 5;
    const end = anoAtual + 1;
    paAno.innerHTML = '<option value="">Selecione</option>';
    for (let a = end; a >= start; a--) {
      const opt = document.createElement('option');
      opt.value = String(a);
      opt.textContent = String(a);
      paAno.appendChild(opt);
    }
  }

  // Modal: abrir/fechar
  function openCompanyModal() {
    if (!companyModal) return;
    companyModal.classList.remove('hidden');
    if (snCompanyMessage) snCompanyMessage.textContent = '';
    const cnpj = document.getElementById('cadCnpj');
    const razao = document.getElementById('cadRazao');
    if (cnpj) cnpj.value = '';
    if (razao) razao.value = '';
  }

  function closeCompanyModal() {
    if (!companyModal) return;
    companyModal.classList.add('hidden');
  }

  btnOpenCompanyModal?.addEventListener('click', openCompanyModal);
  btnCloseCompanyModal?.addEventListener('click', closeCompanyModal);
  companyModalOverlay?.addEventListener('click', closeCompanyModal);

  // Cadastro de empresa
  snCompanyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!snCompanyMessage) return;

    snCompanyMessage.textContent = '';
    snCompanyMessage.style.color = '';

    const cnpjInput = document.getElementById('cadCnpj');
    const razaoInput = document.getElementById('cadRazao');

    const cnpj = (cnpjInput ? cnpjInput.value : '').replace(/\D/g, '');
    const razaoSocial = (razaoInput ? razaoInput.value : '').trim();

    if (!cnpj || !razaoSocial) {
      snCompanyMessage.textContent = 'Preencha CNPJ e Razão Social.';
      snCompanyMessage.style.color = 'red';
      return;
    }
    if (cnpj.length !== 14) {
      snCompanyMessage.textContent = 'CNPJ deve ter 14 dígitos.';
      snCompanyMessage.style.color = 'red';
      return;
    }

    try {
      const resp = await AuthClient.authFetch('/api/sn/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj, razaoSocial }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        snCompanyMessage.textContent = data.error || 'Erro ao cadastrar empresa.';
        snCompanyMessage.style.color = 'red';
        return;
      }

      snCompanyMessage.textContent = 'Empresa cadastrada com sucesso.';
      snCompanyMessage.style.color = 'green';

      await carregarEmpresas();
      closeCompanyModal();
    } catch (e2) {
      console.error(e2);
      snCompanyMessage.textContent = 'Erro inesperado ao cadastrar empresa.';
      snCompanyMessage.style.color = 'red';
    }
  });

  // Carregar empresas (lista com checkboxes)
  async function carregarEmpresas() {
    if (!companiesOptions) return;
    try {
      const resp = await AuthClient.authFetch('/api/sn/companies');
      if (!resp.ok) return;
      const empresas = await resp.json();

      companiesOptions.innerHTML = '';

      // opção "Todos"
      const lblAll = document.createElement('label');
      lblAll.className = 'sn-company-option';
      lblAll.innerHTML = `
        <input type="checkbox" id="chkAllCompanies" />
        <span>Selecionar todas</span>
      `;
      companiesOptions.appendChild(lblAll);

      (empresas || []).forEach((emp) => {
        const lbl = document.createElement('label');
        lbl.className = 'sn-company-option';
        lbl.innerHTML = `
          <input type="checkbox" class="sn-company-checkbox" value="${emp.id}" />
          <span>${emp.cnpj} — ${emp.razaoSocial}</span>
        `;
        companiesOptions.appendChild(lbl);
      });

      // Comportamento do "Selecionar todas"
      const chkAll = document.getElementById('chkAllCompanies');
      chkAll?.addEventListener('change', () => {
        const checked = chkAll.checked;
        document.querySelectorAll('.sn-company-checkbox').forEach((c) => {
          c.checked = checked;
        });
      });
    } catch (e) {
      console.error('Erro ao carregar empresas SN:', e);
    }
  }

  // Atualiza card de consumo
  function atualizarResumoConsumo(resumo) {
    if (!consumoInfo) return;
    if (!resumo) {
      consumoInfo.textContent = 'Nenhuma operação realizada.';
      return;
    }

    const totalOps = resumo.totalOperacoes ?? resumo.totalRequisicoes ?? 0;
    const totalSucesso = resumo.totalSucesso ?? 0;
    const totalErro = resumo.totalErro ?? 0;
    const precoUnitario = (resumo.precoUnitario ?? 0.4).toFixed(2);
    const valorTotal = (resumo.valorTotal ?? 0).toFixed(2);

    consumoInfo.textContent =
      'Operações: ' +
      totalOps +
      ' | Sucessos: ' +
      totalSucesso +
      ' | Erros: ' +
      totalErro +
      ' | Preço unitário atual: R$ ' +
      precoUnitario +
      ' | Valor total estimado: R$ ' +
      valorTotal;
  }

  async function carregarResumo() {
    try {
      const resp = await AuthClient.authFetch('/api/sn/summary');
      if (!resp.ok) return;
      const resumo = await resp.json();
      atualizarResumoConsumo(resumo);
    } catch (e) {
      console.error('Erro ao carregar resumo SN:', e);
    }
  }

  function getPeriodoEEmpresas() {
    if (!paMes || !paAno || !snStatus) return null;

    const mes = String(paMes.value || '').trim();
    const ano = String(paAno.value || '').trim();

    if (!mes || !ano) {
      snStatus.textContent = 'Selecione mês e ano do período de apuração.';
      return null;
    }

    const pa = Number(ano + mes);

    const all = !!document.getElementById('chkAllCompanies')?.checked;
    const ids = Array.from(document.querySelectorAll('.sn-company-checkbox'))
      .filter((c) => c.checked)
      .map((c) => Number(c.value))
      .filter((n) => Number.isFinite(n));

    if (!all && ids.length === 0) {
      snStatus.textContent = 'Selecione pelo menos uma empresa (ou marque "Selecionar todas").';
      return null;
    }

    return { pa, all, companyIds: ids };
  }

  function setSending(isSending) {
    if (btnEnviar) btnEnviar.disabled = isSending;
    if (btnConsultar) btnConsultar.disabled = isSending;
  }

  // Renderiza tabela de resultados
  function renderResultados(resultados) {
    const table = document.getElementById('snResultsTable');
    const tbody = table?.querySelector('tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    (resultados || []).forEach((r) => {
      const tr = document.createElement('tr');

      const tdCnpj = document.createElement('td');
      tdCnpj.textContent = r.cnpj || '-';

      const tdRazao = document.createElement('td');
      tdRazao.textContent = r.razaoSocial || '-';

      const tdOp = document.createElement('td');
      tdOp.textContent = r.operacao || '-';

      const tdStatus = document.createElement('td');
      tdStatus.textContent = r.status || (r.sucesso ? 'Sucesso' : 'Erro');

      const tdMsg = document.createElement('td');
      if (r.mensagens && Array.isArray(r.mensagens) && r.mensagens.length) {
        tdMsg.textContent = r.mensagens.map((m) => m.texto || m).join(' | ');
      } else if (r.mensagem) {
        tdMsg.textContent = r.mensagem;
      } else {
        tdMsg.textContent = '-';
      }

      const tdRecibo = document.createElement('td');
      if (r.receiptId && r.sucesso) {
        const link = document.createElement('a');
        link.href = '/api/sn/receipt/' + r.receiptId;
        link.target = '_blank';
        link.textContent = 'Abrir recibo';
        tdRecibo.appendChild(link);
      } else {
        tdRecibo.textContent = '-';
      }

      tr.appendChild(tdCnpj);
      tr.appendChild(tdRazao);
      tr.appendChild(tdOp);
      tr.appendChild(tdStatus);
      tr.appendChild(tdMsg);
      tr.appendChild(tdRecibo);
      tbody.appendChild(tr);
    });
  }

  // Enviar declaração
  btnEnviar?.addEventListener('click', async () => {
    if (!snStatus) return;

    snStatus.textContent = '';
    lastSnResults = null;
    if (btnDownloadTodos) btnDownloadTodos.disabled = true;

    const params = getPeriodoEEmpresas();
    if (!params) return;

    setSending(true);
    snStatus.textContent = 'Enviando declarações...';

    try {
      const resp = await AuthClient.authFetch('/api/sn/declaration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          indicadorTransmissao: true,
          indicadorComparacao: false,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        let msgErro = data.error || 'Erro ao enviar declarações.';
        if (data.status) msgErro += ' (HTTP ' + data.status + ')';
        snStatus.textContent = msgErro;
        return;
      }

      const receiptIds = extractReceiptIds(data);
      lastSnResults = { ...data, receiptIds };

      if (btnDownloadTodos) btnDownloadTodos.disabled = receiptIds.length === 0;

      renderResultados(data.resultados);
      snStatus.textContent = 'Declarações enviadas.';

      if (data.resumoConsumo) atualizarResumoConsumo(data.resumoConsumo);
    } catch (e) {
      console.error(e);
      snStatus.textContent = e?.message || 'Erro inesperado.';
    } finally {
      setSending(false);
    }
  });

  // Consultar recibos
  btnConsultar?.addEventListener('click', async () => {
    if (!snStatus) return;

    snStatus.textContent = '';
    lastSnResults = null;
    if (btnDownloadTodos) btnDownloadTodos.disabled = true;

    const params = getPeriodoEEmpresas();
    if (!params) return;

    setSending(true);
    snStatus.textContent = 'Consultando recibos...';

    try {
      const resp = await AuthClient.authFetch('/api/sn/consult-last', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        let msgErro = data.error || 'Erro ao consultar recibos.';
        if (data.status) msgErro += ' (HTTP ' + data.status + ')';
        snStatus.textContent = msgErro;
        return;
      }

      const receiptIds = extractReceiptIds(data);
      lastSnResults = { ...data, receiptIds };

      if (btnDownloadTodos) btnDownloadTodos.disabled = receiptIds.length === 0;

      renderResultados(data.resultados);
      snStatus.textContent = 'Consultas de recibo concluídas.';

      if (data.resumoConsumo) atualizarResumoConsumo(data.resumoConsumo);
    } catch (e) {
      console.error(e);
      snStatus.textContent = e?.message || 'Erro inesperado.';
    } finally {
      setSending(false);
    }
  });

  // Download em lote (ZIP)
  btnDownloadTodos?.addEventListener('click', async () => {
    const receiptIds = lastSnResults?.receiptIds || [];

    if (!receiptIds.length) {
      alert('Nenhum recibo disponível para download.');
      return;
    }

    try {
      btnDownloadTodos.disabled = true;
      btnDownloadTodos.textContent = 'Gerando ZIP...';

      const resp = await AuthClient.authFetch('/api/sn/receipts/batch-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error('Erro ao baixar ZIP:', err);
        alert(err.error || 'Erro ao gerar o arquivo ZIP de recibos.');
        return;
      }

      const blob = await resp.blob();

      // tenta pegar filename do Content-Disposition
      const cd = resp.headers.get('content-disposition') || '';
      const m = cd.match(/filename="([^"]+)"/i);
      const filename = m?.[1] || 'recibos-sn.zip';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.error(e);
      alert('Erro ao baixar os recibos.');
    } finally {
      btnDownloadTodos.disabled = false;
      btnDownloadTodos.textContent = 'Baixar todos os recibos';
    }
  });

  // Init
  await carregarEmpresas();
  await carregarResumo();
});
