/* ===== DIMOB Global Auth/CSRF Helpers ===== */
(() => {
    // Evita duplicação caso o script seja carregado mais de uma vez.
    if (window.__DIMOB_GLOBALS_INITIALIZED__) return;
    window.__DIMOB_GLOBALS_INITIALIZED__ = true;

    const safeSet = (k, v) => {
        try { localStorage.setItem(k, v); } catch { }
    };
    const safeGet = (k) => {
        try { return localStorage.getItem(k) || ''; } catch { return ''; }
    };

    // Token CSRF (cache em memória + localStorage)
    window.__DIMOB_CSRF_TOKEN__ = window.__DIMOB_CSRF_TOKEN__ || window.csrfToken || safeGet('csrfToken') || '';

    window.dimobGetCsrfToken = window.dimobGetCsrfToken || (() => {
        return window.__DIMOB_CSRF_TOKEN__ || window.csrfToken || safeGet('csrfToken') || '';
    });

    window.dimobEnsureAuth = window.dimobEnsureAuth || (async () => {
        // 1) Preferir AuthClient se existir (mesmo padrão das outras telas).
        if (window.AuthClient?.getAuthContext) {
            const ctx = await AuthClient.getAuthContext().catch(() => null);
            if (!ctx) throw new Error('Sessão inválida.');
            const token = ctx.csrfToken || ctx?.auth?.csrfToken || ctx?.user?.csrfToken || '';
            if (token) {
                window.__DIMOB_CSRF_TOKEN__ = token;
                try { window.csrfToken = token; } catch { }
                safeSet('csrfToken', token);
            }
            return ctx;
        }

        // 2) Fallback: /api/auth/me (cookie de sessão)
        const resp = await fetch('/api/auth/me', { credentials: 'include' });
        if (!resp.ok) throw new Error('Não autenticado.');
        const ctx = await resp.json().catch(() => null);
        const token = ctx?.csrfToken || '';
        if (token) {
            window.__DIMOB_CSRF_TOKEN__ = token;
            try { window.csrfToken = token; } catch { }
            safeSet('csrfToken', token);
        }
        return ctx;
    });

    window.dimobAuthFetch = window.dimobAuthFetch || (async (url, options = {}) => {
        const opts = options || {};
        const method = String(opts.method || 'GET').toUpperCase();
        const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);

        // garante cookies
        if (!('credentials' in opts)) opts.credentials = 'include';

        // garante CSRF nos POST/PUT/DELETE
        const headers = new Headers(opts.headers || {});
        if (needsCsrf) {
            // garante token carregado
            if (!window.dimobGetCsrfToken()) {
                await window.dimobEnsureAuth();
            }
            const token = window.dimobGetCsrfToken();
            if (token) headers.set('x-csrf-token', token);
        }
        opts.headers = headers;

        return fetch(url, opts);
    });
    // Aliases de compatibilidade (evita erros em handlers antigos)
    window.ensureAuth = window.ensureAuth || window.dimobEnsureAuth;
    window.authFetch = window.authFetch || window.dimobAuthFetch;
})();

/* public/js/dimob.js */

document.addEventListener('DOMContentLoaded', async () => {
    try { if (typeof inicializarSidebar === 'function') inicializarSidebar('dimob'); } catch { }

    const elCnpj = document.getElementById('dimobCnpj');
    const elYear = document.getElementById('dimobYear');

    const elSpedFiles = document.getElementById('spedFiles');
    const elPrevDimob = document.getElementById('previousDimobFile');

    const btnParse = document.getElementById('btnParseSped');
    const btnFindPrev = document.getElementById('btnFindPrevious');
    const btnGenerate = document.getElementById('btnGenerateDimob');

    const statusEl = document.getElementById('dimobStatus');
    const logEl = document.getElementById('dimobLog');

    const billingWrap = document.getElementById('billingTableWrapper');
    const newTenantsWrap = document.getElementById('newTenantsTableWrapper');
    const atividadeWrap = document.getElementById('atividadeImobiliariaTableWrapper');
    const prevNetworkInfo = document.getElementById('previousNetworkInfo');

    let previousFileId = null;
    let previousFileLabel = null;
    let lastParseData = null;
    let lastParseCnpj = null;
    let lastParseYear = null;

    // ========= utils =========
    const nowStr = () => new Date().toLocaleString('pt-BR');

    function getFilenameFromContentDisposition(cd) {
        if (!cd) return '';
        // filename="..."
        let m = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
        if (m?.[1]) return m[1];

        // filename*=UTF-8''...
        m = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
        if (m?.[1]) {
            try { return decodeURIComponent(m[1]); } catch { return m[1]; }
        }
        return '';
    }

    function collectNewLocatariosFromUI() {
        // Lê a tabela renderizada em renderNewTenantsTable()
        const table = newTenantsWrap?.querySelector('table');
        if (!table) return [];

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        const out = [];
        const missing = [];

        for (const tr of rows) {
            const doc = String(tr.querySelector('td')?.title || '').replace(/\D+/g, '');

            const inputs = Array.from(tr.querySelectorAll('input'));
            const [nomeInput, contratoInput, cepInput, enderecoInput, municipioInput, ufInput, dataInput] = inputs;

            const item = {
                doc,
                nome: (nomeInput?.value || '').trim(),
                contrato: (contratoInput?.value || '').trim(),
                cep: (cepInput?.value || '').trim(),
                endereco: (enderecoInput?.value || '').trim(),
                municipio: (municipioInput?.value || '').trim(),
                uf: (ufInput?.value || '').trim(),
                dataInicio: (dataInput?.value || '').trim(),
            };

            // validação rápida (para já logar antes de mandar pro backend)
            const reqFields = ['doc', 'nome', 'contrato', 'cep', 'endereco', 'municipio', 'uf', 'dataInicio'];
            const miss = reqFields.filter(k => !String(item[k] || '').trim());
            if (miss.length) {
                missing.push(`${doc || '(sem doc)'}: faltando ${miss.join(', ')}`);
            }

            out.push(item);
        }

        if (missing.length) {
            log('GERAÇÃO: campos obrigatórios faltando nos novos locatários:');
            missing.forEach(m => log(`- ${m}`));
            throw new Error('Preencha todos os campos dos novos locatários antes de gerar.');
        }

        return out;
    }


    function setStatus(msg) {
        if (statusEl) statusEl.textContent = msg || '';
    }

    function log(msg) {
        if (!logEl) return;
        const line = `[${nowStr()}] ${msg}`;
        logEl.textContent = (logEl.textContent ? (logEl.textContent + '\n') : '') + line;
        logEl.scrollTop = logEl.scrollHeight;
    }

    function hr(title) {
        log(`==================== ${title} ====================`);
    }

    function onlyDigits(s) { return String(s || '').replace(/\D+/g, ''); }
    function isValidCnpj14(d) { return /^\d{14}$/.test(d); }

    function formatMoney(v) {
        const n = Number(v || 0);
        return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function shortText(t, max = 1800) {
        const s = String(t ?? '');
        if (s.length <= max) return s;
        return s.slice(0, max) + ` ... (cortado, ${s.length} chars)`;
    }

    function ensureEmptyState() {
        if (billingWrap) billingWrap.innerHTML = '<div class="wl-upload-summary">Nenhum resultado ainda.</div>';
        if (newTenantsWrap) newTenantsWrap.innerHTML = '<div class="wl-upload-summary">Nenhum resultado ainda.</div>';
    }

    function buildYearOptions() {
        if (!elYear) return;
        const start = 2015;
        const end = 2025;
        const prefer = 2025;

        elYear.innerHTML = '';
        for (let y = end; y >= start; y--) {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            elYear.appendChild(opt);
        }
        elYear.value = String(prefer);
    }

    async function ensureAuth() {
        // Delegar para helper global (evita CSRF ausente e funciona mesmo sem AuthClient)
        return await window.dimobEnsureAuth();
    }

    async function authFetch(url, options = {}) {
        // Delegar para helper global (inclui x-csrf-token nos POSTs)
        return await window.dimobAuthFetch(url, options);
    }

    async function safeReadResponse(resp) {
        const raw = await resp.text();
        try { return { data: JSON.parse(raw), raw }; } catch { return { data: null, raw }; }
    }

    // ========= render =========
    function renderBillingTable(data) {
        if (!billingWrap) return;

        const months = [
            { id: 1, label: 'Jan' }, { id: 2, label: 'Fev' }, { id: 3, label: 'Mar' },
            { id: 4, label: 'Abr' }, { id: 5, label: 'Mai' }, { id: 6, label: 'Jun' },
            { id: 7, label: 'Jul' }, { id: 8, label: 'Ago' }, { id: 9, label: 'Set' },
            { id: 10, label: 'Out' }, { id: 11, label: 'Nov' }, { id: 12, label: 'Dez' },
        ];

        const rows = Array.isArray(data?.byParticipant) ? data.byParticipant : [];
        const totalsByMonth = data?.totalsByMonth || {};
        const grandTotal = Number(data?.grandTotal || 0);

        // ✅ se não tem rows, mas tem monthsUsed (ou mesmo assim), renderiza a tabela com TOTAL = 0
        if (!rows.length) {
            billingWrap.innerHTML = '';
            const table = document.createElement('table');
            table.className = 'nfe-table';

            const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

            table.innerHTML = `
                <thead>
                <tr>
                    <th>CPF/CNPJ</th>
                    ${months.map(m => `<th>${m}</th>`).join('')}
                    <th>Total</th>
                </tr>
                </thead>
                <tbody></tbody>
                <tfoot>
                <tr>
                    <td>TOTAL</td>
                    ${Array.from({ length: 12 }, (_, i) => `<td>${formatMoney(Number(totalsByMonth[String(i + 1)] || 0))}</td>`).join('')}
                    <td>${formatMoney(grandTotal)}</td>
                </tr>
                </tfoot>
            `;

            billingWrap.appendChild(table);
            return;
        }


        const table = document.createElement('table');
        table.className = 'nfe-table';

        const thead = document.createElement('thead');
        const trh = document.createElement('tr');

        const thDoc = document.createElement('th');
        thDoc.textContent = 'CPF/CNPJ';
        trh.appendChild(thDoc);

        for (const m of months) {
            const th = document.createElement('th');
            th.textContent = m.label;
            trh.appendChild(th);
        }

        const thTot = document.createElement('th');
        thTot.textContent = 'Total';
        trh.appendChild(thTot);

        thead.appendChild(trh);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        for (const r of rows) {
            const tr = document.createElement('tr');

            const tdDoc = document.createElement('td');
            tdDoc.textContent = r.participantDoc || '';
            tr.appendChild(tdDoc);

            let rowTotal = 0;

            for (const m of months) {
                const td = document.createElement('td');
                const val = Number(r?.months?.[String(m.id)] || 0);
                rowTotal += val;
                td.textContent = formatMoney(val);
                tr.appendChild(td);
            }

            const tdTotal = document.createElement('td');
            tdTotal.textContent = formatMoney(rowTotal);
            tr.appendChild(tdTotal);

            tbody.appendChild(tr);
        }

        table.appendChild(tbody);

        const tfoot = document.createElement('tfoot');
        const trf = document.createElement('tr');

        const tdLabel = document.createElement('td');
        tdLabel.textContent = 'TOTAL';
        trf.appendChild(tdLabel);

        for (const m of months) {
            const td = document.createElement('td');
            td.textContent = formatMoney(Number(totalsByMonth[String(m.id)] || 0));
            trf.appendChild(td);
        }

        const tdGrand = document.createElement('td');
        tdGrand.textContent = formatMoney(grandTotal);
        trf.appendChild(tdGrand);

        tfoot.appendChild(trf);
        table.appendChild(tfoot);

        billingWrap.innerHTML = '';
        billingWrap.appendChild(table);
    }

    function renderNewTenantsTable(data) {
        if (!newTenantsWrap) return;

        const tenants = Array.isArray(data?.newParticipants) ? data.newParticipants : [];
        if (!tenants.length) {
            newTenantsWrap.innerHTML =
                '<div class="wl-upload-summary">Nenhum novo locatário identificado (ou DIMOB anterior não foi fornecida).</div>';
            return;
        }

        const year = Number(data?.year || Number(elYear?.value) || 0);

        const table = document.createElement('table');
        table.className = 'nfe-table';

        table.innerHTML = `
    <thead>
      <tr>
        <th>CPF/CNPJ</th>
        <th>Nome locatário</th>
        <th>Nº Contrato</th>
        <th>CEP</th>
        <th>Endereço</th>
        <th>Município</th>
        <th>UF</th>
        <th>Data início (ddmmaaaa)</th>
        <th>Observação</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

        const tbody = table.querySelector('tbody');

        for (const t of tenants) {
            const doc14 = String(t.participantDoc || '').replace(/\D+/g, '');
            const docDisplay = dimobDisplayDoc(doc14);
            const firstMonth = Number(t.firstMonthDetected || t.firstMonth || 0);

            const tr = document.createElement('tr');

            // CPF/CNPJ
            const tdDoc = document.createElement('td');
            tdDoc.textContent = docDisplay;
            tdDoc.title = doc14;
            tr.appendChild(tdDoc);

            // Nome locatário (auto para CNPJ)
            const tdNome = document.createElement('td');
            const nomeInput = document.createElement('input');
            nomeInput.className = 'nfe-input';
            nomeInput.placeholder = 'Razão social / Nome';
            nomeInput.dataset.doc = doc14;
            tdNome.appendChild(nomeInput);
            tr.appendChild(tdNome);

            // Nº contrato
            const tdContrato = document.createElement('td');
            const contratoInput = document.createElement('input');
            contratoInput.className = 'nfe-input';
            contratoInput.placeholder = 'Ex: 123456';
            contratoInput.dataset.doc = doc14;
            tdContrato.appendChild(contratoInput);
            tr.appendChild(tdContrato);

            // CEP
            const tdCep = document.createElement('td');
            const cepInput = document.createElement('input');
            cepInput.className = 'nfe-input';
            cepInput.placeholder = '00000000';
            cepInput.inputMode = 'numeric';
            cepInput.maxLength = 9;
            cepInput.dataset.doc = doc14;
            tdCep.appendChild(cepInput);
            tr.appendChild(tdCep);

            // Endereço
            const tdEndereco = document.createElement('td');
            const enderecoInput = document.createElement('input');
            enderecoInput.className = 'nfe-input';
            enderecoInput.placeholder = 'Rua / Logradouro';
            enderecoInput.dataset.doc = doc14;
            tdEndereco.appendChild(enderecoInput);
            tr.appendChild(tdEndereco);

            // Município
            const tdMunicipio = document.createElement('td');
            const municipioInput = document.createElement('input');
            municipioInput.className = 'nfe-input';
            municipioInput.placeholder = 'Município';
            municipioInput.dataset.doc = doc14;
            tdMunicipio.appendChild(municipioInput);
            tr.appendChild(tdMunicipio);

            // UF
            const tdUf = document.createElement('td');
            const ufInput = document.createElement('input');
            ufInput.className = 'nfe-input';
            ufInput.placeholder = 'UF';
            ufInput.maxLength = 2;
            ufInput.dataset.doc = doc14;
            tdUf.appendChild(ufInput);
            tr.appendChild(tdUf);

            // Data início
            const tdData = document.createElement('td');
            const dataInput = document.createElement('input');
            dataInput.className = 'nfe-input';
            dataInput.placeholder = '01012024';
            dataInput.inputMode = 'numeric';
            dataInput.maxLength = 8;
            dataInput.dataset.doc = doc14;
            tdData.appendChild(dataInput);
            tr.appendChild(tdData);

            // Observação (primeiro mês detectado)
            const tdObs = document.createElement('td');

            const obsFromApi = String(t.observacao || '').trim();
            tdObs.textContent = obsFromApi
                ? obsFromApi
                : (firstMonth >= 1 && firstMonth <= 12 && year)
                    ? `Detectado 1ª vez em ${String(firstMonth).padStart(2, '0')}/${year}`
                    : 'Detectado (mês não informado)';

            tr.appendChild(tdObs);


            tbody.appendChild(tr);

            // ===== Automação =====

            // 1) Se for CNPJ, buscar razão social automaticamente
            if (dimobIsCnpj(doc14)) {
                dimobAutoFillCnpjName(doc14, nomeInput).catch(() => { });
            }

            // 2) Ao preencher CEP, buscar endereço/município/UF automaticamente
            dimobAttachCepLookup(cepInput, enderecoInput, municipioInput, ufInput);
        }


        newTenantsWrap.innerHTML = '';
        newTenantsWrap.appendChild(table);
    }

    /* ===== Atividade Imobiliaria ======== */

    function renderAtividadeImobiliariaTable(data) {
        if (!atividadeWrap) return;

        const ops = Array.isArray(data?.atividadeImobiliaria) ? data.atividadeImobiliaria : [];
        if (!ops.length) {
            atividadeWrap.innerHTML = '<div class="wl-upload-summary">Nenhuma operação F200 encontrada nos SPEDs.</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'nfe-table';

        table.innerHTML = `
    <thead>
      <tr>
        <th>CPF/CNPJ</th>
        <th>Nome Comprador</th>
        <th>Valor da operação</th>
        <th>Valor pago no ano</th>
        <th>Nº contrato</th>
        <th>Data contrato (ddmmaaaa)</th>
        <th>CEP</th>
        <th>Endereço</th>
        <th>Município</th>
        <th>UF</th>
        <th>Observações</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

        const tbody = table.querySelector('tbody');

        for (const op of ops) {
            const doc14 = String(op.participantDoc || '').replace(/\D+/g, '');
            const docDisplay = dimobDisplayDoc(doc14);

            const tr = document.createElement('tr');

            // CPF/CNPJ
            const tdDoc = document.createElement('td');
            tdDoc.textContent = docDisplay;
            tdDoc.title = doc14;
            tr.appendChild(tdDoc);

            // Nome Comprador (auto para CNPJ)
            const tdNome = document.createElement('td');
            const nomeInput = document.createElement('input');
            nomeInput.className = 'nfe-input';
            nomeInput.placeholder = 'Nome / Razão social';
            tdNome.appendChild(nomeInput);
            tr.appendChild(tdNome);

            // Valor operação (readonly)
            const tdOp = document.createElement('td');
            tdOp.textContent = formatMoney(Number(op.operationValue || 0));
            tr.appendChild(tdOp);

            // Valor pago no ano (auto se 01/03, senão input)
            const tdPago = document.createElement('td');
            const pagoInput = document.createElement('input');
            pagoInput.className = 'nfe-input';
            pagoInput.placeholder = '0,00';
            pagoInput.inputMode = 'decimal';

            if (op.paidValue !== null && op.paidValue !== undefined) {
                pagoInput.value = String(Number(op.paidValue || 0)).replace('.', ',');
                pagoInput.disabled = true;
                pagoInput.title = `Auto (tipo pagamento ${op.paymentType})`;
            } else {
                pagoInput.title = `Preencher (tipo pagamento ${op.paymentType || '?'})`;
            }
            tdPago.appendChild(pagoInput);
            tr.appendChild(tdPago);

            // Nº contrato
            const tdContrato = document.createElement('td');
            const contratoInput = document.createElement('input');
            contratoInput.className = 'nfe-input';
            contratoInput.placeholder = 'Ex: 123456';
            tdContrato.appendChild(contratoInput);
            tr.appendChild(tdContrato);

            // Data contrato (preenchida)
            const tdData = document.createElement('td');
            const dataInput = document.createElement('input');
            dataInput.className = 'nfe-input';
            dataInput.placeholder = 'ddmmaaaa';
            dataInput.inputMode = 'numeric';
            dataInput.maxLength = 8;
            dataInput.value = String(op.contractDate || '').replace(/\D+/g, '').slice(0, 8);
            tdData.appendChild(dataInput);
            tr.appendChild(tdData);

            // CEP
            const tdCep = document.createElement('td');
            const cepInput = document.createElement('input');
            cepInput.className = 'nfe-input';
            cepInput.placeholder = '00000000';
            cepInput.inputMode = 'numeric';
            cepInput.maxLength = 8;
            tdCep.appendChild(cepInput);
            tr.appendChild(tdCep);

            // Endereço
            const tdEndereco = document.createElement('td');
            const enderecoInput = document.createElement('input');
            enderecoInput.className = 'nfe-input';
            enderecoInput.placeholder = 'Rua / Logradouro';
            tdEndereco.appendChild(enderecoInput);
            tr.appendChild(tdEndereco);

            // Município
            const tdMunicipio = document.createElement('td');
            const municipioInput = document.createElement('input');
            municipioInput.className = 'nfe-input';
            municipioInput.placeholder = 'Município';
            tdMunicipio.appendChild(municipioInput);
            tr.appendChild(tdMunicipio);

            // UF
            const tdUf = document.createElement('td');
            const ufInput = document.createElement('input');
            ufInput.className = 'nfe-input';
            ufInput.placeholder = 'UF';
            ufInput.maxLength = 2;
            tdUf.appendChild(ufInput);
            tr.appendChild(tdUf);

            // Observações (preenchida)
            const tdObs = document.createElement('td');
            const obsArea = document.createElement('textarea');
            obsArea.className = 'nfe-input';
            obsArea.rows = 2;
            obsArea.placeholder = 'Observações';
            obsArea.value = String(op.observations || '');
            tdObs.appendChild(obsArea);
            tr.appendChild(tdObs);

            tbody.appendChild(tr);

            // ===== automações =====

            // Nome comprador via /api/cnpj (somente para CNPJ; CPF não tem API)
            if (dimobIsCnpj(doc14)) {
                dimobAutoFillCnpjName(doc14, nomeInput).catch(() => { });
            }

            // CEP -> endereço/município/UF via /api/cep
            dimobAttachCepLookup(cepInput, enderecoInput, municipioInput, ufInput);
        }

        atividadeWrap.innerHTML = '';
        atividadeWrap.appendChild(table);
    }



    /* ===== Helpers da tabela novos locatários ===== */

    function dimobDisplayDoc(doc14) {
        const d = String(doc14 || '').replace(/\D+/g, '');
        if (d.length !== 14) return d;
        // CPFs vêm "padded" com 000 no início (do backend). Mostra só os 11 últimos.
        if (d.startsWith('000')) return d.slice(3);
        return d;
    }

    function dimobIsCnpj(doc14) {
        const d = String(doc14 || '').replace(/\D+/g, '');
        return d.length === 14 && !d.startsWith('000'); // evita chamar CNPJ API para CPF padded
    }

    async function dimobAutoFillCnpjName(cnpj14, nomeInput) {
        try {
            nomeInput.placeholder = 'Buscando na BrasilAPI...';

            const resp = await authFetch(`/api/cnpj/${encodeURIComponent(cnpj14)}`, { method: 'GET' });
            const json = await resp.json().catch(() => null);

            if (!resp.ok || !json || json.ok !== true) {
                nomeInput.placeholder = 'Razão social / Nome';
                return;
            }

            const nome =
                json.data?.razao_social ||
                json.data?.nome_fantasia ||
                json.data?.nome ||
                '';

            if (nome && !nomeInput.value) {
                nomeInput.value = nome;
            }

            nomeInput.placeholder = 'Razão social / Nome';
        } catch {
            nomeInput.placeholder = 'Razão social / Nome';
        }
    }

    function dimobAttachCepLookup(cepInput, enderecoInput, municipioInput, ufInput) {
        let timer = null;

        const run = async () => {
            const cep = String(cepInput.value || '').replace(/\D+/g, '');
            if (cep.length !== 8) return;

            try {
                const resp = await authFetch(`/api/cep/${encodeURIComponent(cep)}`, { method: 'GET' });
                const json = await resp.json().catch(() => null);

                if (!resp.ok || !json || json.ok !== true) return;

                const street = json.data?.street || json.data?.logradouro || '';
                const neighborhood = json.data?.neighborhood || json.data?.bairro || '';
                const city = json.data?.city || json.data?.municipio || '';
                const state = json.data?.state || json.data?.uf || '';

                if (street && !enderecoInput.value) {
                    enderecoInput.value = neighborhood ? `${street} - ${neighborhood}` : street;
                }
                if (city && !municipioInput.value) municipioInput.value = city;
                if (state && !ufInput.value) ufInput.value = state;
            } catch {
                // silêncio: se erro, deixa em branco
            }
        };

        cepInput.addEventListener('input', () => {
            cepInput.value = String(cepInput.value || '').replace(/\D+/g, '').slice(0, 8);
            clearTimeout(timer);
            timer = setTimeout(run, 450);
        });

        cepInput.addEventListener('blur', () => {
            clearTimeout(timer);
            run();
        });
    }


    // ========= diagnóstico SPED (antes de enviar) =========
    async function previewSpedFile(file) {
        const MAX_BYTES = 1200000; // ~1.2MB
        const slice = file.slice(0, MAX_BYTES);

        let txt = '';
        try {
            txt = await slice.text();
        } catch (e) {
            log(`(prévia) Falha ao ler início do arquivo ${file.name}: ${e.message || e}`);
            return;
        }

        const lines = txt.split(/\r?\n/);

        const f525Samples = [];
        for (const ln of lines) {
            if (ln.includes('|F525|') && f525Samples.length < 5) f525Samples.push(ln);
            if (f525Samples.length >= 5) break;
        }

        if (!f525Samples.length) {
            log(`(prévia) ${file.name}: NÃO achou nenhuma linha |F525| no começo do arquivo.`);
            return;
        }

        log(`(prévia) ${file.name}: amostras de |F525| (até 5) — usando campos fixos: mês=parts[3], doc=parts[4], valor=parts[7]`);
        f525Samples.forEach((ln, idx) => {
            const parts = ln.split('|');
            const mes = (parts[3] || '').trim();
            const doc = onlyDigits(parts[4] || '');
            const valor = (parts[7] || '').trim();
            log(`  [${idx + 1}] ${shortText(ln, 240)}`);
            log(`      -> mes(parts[3])=${mes || '(vazio)'} | doc(parts[4])=${doc || '(vazio)'} | valor(parts[7])=${valor || '(vazio)'}`);
        });
    }

    async function previewAllSpeds(files) {
        hr('PRÉVIA LOCAL DOS SPEDs (ANTES DE ENVIAR)');
        log(`Total de arquivos: ${files.length}`);
        files.forEach(f => log(`- ${f.name} | ${(f.size / 1024 / 1024).toFixed(2)} MB`));
        for (const f of files) await previewSpedFile(f);
    }

    // ========= handlers =========
    if (elCnpj) {
        elCnpj.addEventListener('input', () => {
            elCnpj.value = onlyDigits(elCnpj.value);
        });
    }

    async function findPreviousDimobOnNetwork() {
        setStatus('');

        const cnpj = onlyDigits(elCnpj?.value);
        const selectedYear = Number(elYear?.value);

        if (!isValidCnpj14(cnpj)) {
            setStatus('Informe um CNPJ válido (14 dígitos).');
            log('Busca DIMOB: CNPJ inválido.');
            return;
        }
        if (!Number.isFinite(selectedYear)) {
            setStatus('Selecione o ano.');
            log('Busca DIMOB: ano inválido.');
            return;
        }

        const expectedPrevYear = selectedYear - 1;

        hr('BUSCA DIMOB ANTERIOR (REDE)');
        log(`Ano selecionado (DIMOB a gerar): ${selectedYear}`);
        log(`Ano esperado do arquivo anterior: ${expectedPrevYear}`);
        log(`Padrão esperado no nome: ${cnpj}-DIMOB-${expectedPrevYear}-ORIGI.DEC OU ${cnpj}-DIMOB-${expectedPrevYear}-RETIF.DEC (preferir RETIF)`);

        const url = `/api/dimob/previous-file?cnpj=${encodeURIComponent(cnpj)}&year=${encodeURIComponent(String(selectedYear))}&debug=1`;
        log(`Chamando: ${url}`);

        try {
            await ensureAuth();
            const resp = await authFetch(url, { method: 'GET' });
            const { data, raw } = await safeReadResponse(resp);

            log(`Resposta HTTP: ${resp.status}`);

            if (!resp.ok) {
                const errMsg = data?.error || raw || `Erro HTTP ${resp.status}`;
                setStatus(errMsg);
                log(`ERRO /previous-file: ${shortText(errMsg, 1800)}`);
                if (prevNetworkInfo) prevNetworkInfo.textContent = errMsg;
                previousFileId = null;
                previousFileLabel = null;
                return;
            }

            log(`JSON /previous-file: ${shortText(JSON.stringify(data), 2200)}`);

            if (data?.debug) {
                log(`DEBUG /previous-file: ${shortText(JSON.stringify(data.debug), 2200)}`);
            }

            if (!data?.found) {
                const err = data?.error || 'Não encontrado.';
                setStatus(`DIMOB anterior não encontrada: ${err}`);
                log(`NÃO ENCONTRADO: ${err}`);

                if (String(err).toLowerCase().includes('diretório não encontrado')) {
                    log('DICA: isso costuma ser drive W: não mapeado/sem permissão no usuário do serviço. Recomendo configurar DIMOB_NETWORK_BASE_DIR com UNC (\\\\servidor\\share\\DECLARAÇÕES\\DIMOB).');
                }

                if (prevNetworkInfo) prevNetworkInfo.textContent = `Nenhum arquivo encontrado. ${err}`;
                previousFileId = null;
                previousFileLabel = null;
                return;
            }

            previousFileId = data.fileId || null;
            previousFileLabel = data.fileName || null;

            const mtime = data?.mtime ? new Date(data.mtime).toLocaleString('pt-BR') : '';
            const txt = `Encontrado: ${previousFileLabel || '(sem nome)'} ${mtime ? `(${mtime})` : ''}`;
            if (prevNetworkInfo) prevNetworkInfo.textContent = txt;

            setStatus(`DIMOB anterior encontrada (${expectedPrevYear}).`);
            log(`OK: fileId=${previousFileId}`);
        } catch (e) {
            setStatus(`Erro: ${e.message || e}`);
            log(`ERRO /previous-file (exception): ${e.message || e}`);
            if (prevNetworkInfo) prevNetworkInfo.textContent = 'Erro ao buscar arquivo na rede.';
            previousFileId = null;
            previousFileLabel = null;
        }
    }

    async function parseSpedAndBuildTable() {
        setStatus('');
        if (billingWrap) billingWrap.innerHTML = '<div class="wl-upload-summary">Processando SPED...</div>';
        if (newTenantsWrap) newTenantsWrap.innerHTML = '<div class="wl-upload-summary">Processando...</div>';

        const cnpj = onlyDigits(elCnpj?.value);
        const selectedYear = Number(elYear?.value);

        if (!isValidCnpj14(cnpj)) {
            setStatus('Informe um CNPJ válido (14 dígitos).');
            log('Parsing: CNPJ inválido.');
            ensureEmptyState();
            return;
        }
        if (!Number.isFinite(selectedYear)) {
            setStatus('Selecione o ano.');
            log('Parsing: ano inválido.');
            ensureEmptyState();
            return;
        }

        const spedFiles = elSpedFiles?.files ? Array.from(elSpedFiles.files) : [];
        if (!spedFiles.length) {
            setStatus('Anexe pelo menos um arquivo SPED.');
            log('Parsing: nenhum SPED anexado.');
            ensureEmptyState();
            return;
        }

        hr('MONTAR TABELA (ENVIO PARA BACKEND)');
        log(`CNPJ: ${cnpj}`);
        log(`Ano selecionado: ${selectedYear}`);

        await previewAllSpeds(spedFiles);

        const fd = new FormData();
        fd.append('cnpj', cnpj);
        fd.append('year', String(selectedYear));
        spedFiles.forEach(f => fd.append('spedFiles', f));

        if (elPrevDimob?.files?.[0]) {
            fd.append('previousDimob', elPrevDimob.files[0]);
            log(`DIMOB anterior (upload manual): ${elPrevDimob.files[0].name}`);
        } else if (previousFileId) {
            fd.append('previousFileId', previousFileId);
            log(`DIMOB anterior (rede): ${previousFileLabel || ''} | fileId=${previousFileId}`);
        } else {
            log('DIMOB anterior: NÃO informada (nem upload nem rede).');
        }

        btnParse && (btnParse.disabled = true);

        try {
            await ensureAuth();

            log('POST /api/dimob/parse-sped?debug=1');
            const resp = await authFetch('/api/dimob/parse-sped?debug=1', { method: 'POST', body: fd });
            const { data, raw } = await safeReadResponse(resp);

            log(`Resposta HTTP: ${resp.status}`);

            if (!resp.ok) {
                const errMsg = data?.error || raw || `Erro HTTP ${resp.status}`;
                log(`ERRO /parse-sped bruto: ${shortText(errMsg, 3000)}`);
                throw new Error(data?.error || 'Erro ao processar SPED.');
            }

            log(`JSON /parse-sped resumo: parsedLines=${data?.parsedLines}, skippedLines=${data?.skippedLines}, participantes=${data?.byParticipant?.length || 0}, total=${formatMoney(data?.grandTotal || 0)}`);

            if (Array.isArray(data?.warnings) && data.warnings.length) {
                log(`Warnings (${data.warnings.length}):`);
                data.warnings.forEach(w => log(`- ${w}`));
            }

            if (data?.debug) {
                log(`DEBUG /parse-sped: ${shortText(JSON.stringify(data.debug), 3000)}`);
            }

            if ((data?.byParticipant?.length || 0) === 0 || Number(data?.grandTotal || 0) === 0) {
                log('ATENÇÃO: retorno sem valores. Isso indica que o BACKEND não está extraindo month/doc/value corretamente do F525.');
                log('Seu exemplo confirma que valor correto é parts[7]. O backend deve usar mês=parts[3], doc=parts[4], valor=parts[7].');
            }

            setStatus(`OK: ${data.parsedLines} linha(s) interpretadas. Ignoradas: ${data.skippedLines}.`);
            renderAtividadeImobiliariaTable(data);
            renderBillingTable(data);
            renderNewTenantsTable(data);
            // guarda o último retorno para usar na geração
            lastParseData = data;
            lastParseCnpj = cnpj;
            lastParseYear = selectedYear;

            // ✅ botão gerar deve ficar habilitado (se existir)
            if (btnGenerate) btnGenerate.disabled = false;
        } catch (e) {
            setStatus(`Erro: ${e.message || e}`);
            log(`ERRO parsing SPED: ${e.message || e}`);
            ensureEmptyState();
        } finally {
            btnParse && (btnParse.disabled = false);
        }
    }

    async function generateDimobFile(ev) {
        ev?.preventDefault?.();

        hr('GERAR ARQUIVO DIMOB (CLIQUES/REQUEST/RESPONSE)');
        log('Clique no botão "Gerar arquivo" detectado.');

        try {
            await ensureAuth();

            const cnpj = onlyDigits(lastParseCnpj || elCnpj?.value);
            const year = Number(lastParseYear || elYear?.value);

            if (!isValidCnpj14(cnpj)) throw new Error('CNPJ inválido (14 dígitos).');
            if (!Number.isFinite(year)) throw new Error('Ano inválido.');

            if (!lastParseData) {
                throw new Error('Nenhum SPED processado ainda. Clique em "Montar tabela" primeiro.');
            }

            // precisa do arquivo DIMOB anterior salvo no servidor (rede)
            if (!previousFileId) {
                log('GERAÇÃO: previousFileId está vazio (arquivo DIMOB anterior não foi selecionado via rede).');
                throw new Error('Selecione a DIMOB anterior via "Buscar DIMOB anterior" (rede) antes de gerar.');
            }

            const byParticipant = Array.isArray(lastParseData?.byParticipant) ? lastParseData.byParticipant : [];
            const newLocatarios = collectNewLocatariosFromUI();

            log(`Payload: cnpj=${cnpj} year=${year} previousFileId=${previousFileId}`);
            log(`Payload: byParticipant=${byParticipant.length} | newLocatarios=${newLocatarios.length}`);

            btnGenerate && (btnGenerate.disabled = true);

            const payload = { cnpj, year, previousFileId, byParticipant, newLocatarios };

            log('POST /api/dimob/generate-file');
            const resp = await authFetch('/api/dimob/generate-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            log(`Resposta HTTP: ${resp.status}`);

            if (!resp.ok) {
                const { data, raw } = await safeReadResponse(resp);

                const errMsg =
                    (data?.detail ? `${data.error} | detail: ${data.detail}` : (data?.error || 'Erro')) +
                    (data?.traceId ? ` | traceId: ${data.traceId}` : '');

                log(`ERRO /generate-file bruto: ${shortText(raw || JSON.stringify(data || {}), 3000)}`);
                throw new Error(errMsg || `Erro HTTP ${resp.status}`);
            }

            const cd = resp.headers.get('content-disposition') || '';
            const ct = resp.headers.get('content-type') || '';
            const fileName = getFilenameFromContentDisposition(cd) || `${cnpj}-DIMOB-${year}.txt`;

            log(`OK /generate-file | content-type=${ct}`);
            log(`Content-Disposition: ${cd || '(vazio)'}`);
            log(`Arquivo: ${fileName}`);

            const blob = await resp.blob();
            log(`Tamanho (bytes): ${blob.size}`);

            // dispara download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);

            setStatus(`Arquivo gerado: ${fileName}`);
            log('Download disparado com sucesso.');
            
        } catch (e) {
            setStatus(`Erro: ${e.message || e}`);
            log(`ERRO gerar DIMOB: ${e.message || e}`);
        }
    }

    // ========= init =========
    buildYearOptions();
    ensureEmptyState();

    if (logEl) logEl.textContent = '';
    log('Tela DIMOB inicializada.');
    log('Use "Buscar DIMOB anterior" e "Montar tabela" para gerar logs detalhados (inclui debug retornado pelo backend).');

    btnFindPrev?.addEventListener('click', findPreviousDimobOnNetwork);
    btnParse?.addEventListener('click', parseSpedAndBuildTable);
    btnGenerate?.addEventListener('click', generateDimobFile);

});
