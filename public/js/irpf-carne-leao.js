/* global inicializarSidebar */

document.addEventListener('DOMContentLoaded', () => {
    inicializarSidebar('irpf-carne-leao');

    const el = {
        rendimentos: document.getElementById('rendimentos'),
        despesas: document.getElementById('despesas'),
        dependentes: document.getElementById('dependentes'),
        impostoPago: document.getElementById('impostoPago'),
        saldoAnterior: document.getElementById('saldoAnterior'),
        btnCalcular: document.getElementById('btnCalcular'),
        btnPreencherExemplo: document.getElementById('btnPreencherExemplo'),
        status: document.getElementById('irpfStatus'),
        log: document.getElementById('irpfLog'),
        periodCards: document.getElementById('periodCards')
    };


    function log(msg) {
        const ts = new Date().toLocaleTimeString('pt-BR');
        el.log.textContent += `[${ts}] ${msg}\n`;
        el.log.scrollTop = el.log.scrollHeight;
    }

    function setStatus(msg, kind = 'info') {
        el.status.textContent = msg || '';
        el.status.style.color = kind === 'error' ? '#b91c1c' : '#0f172a';
    }

    function parseBRNumber(v) {
        if (v == null) return 0;
        const s = String(v).trim();
        if (!s) return 0;
        // remove R$, espaços e separadores de milhar
        const cleaned = s
            .replace(/\s/g, '')
            .replace(/^R\$\s?/i, '')
            .replace(/\./g, '')
            .replace(/,/g, '.');
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : 0;
    }

    function formatBRL(n) {
        const v = Number(n || 0);
        return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatPct(n) {
        return `${(Number(n || 0) * 100).toFixed(1).replace('.', ',')}%`;
    }

    async function calcular() {
        el.log.textContent = '';
        setStatus('Calculando...');
        log('Iniciando simulação.');

        const payload = {
            rendimentos: parseBRNumber(el.rendimentos.value),
            despesas: parseBRNumber(el.despesas.value),
            dependentes: Math.max(0, Math.floor(parseBRNumber(el.dependentes.value))),
            impostoPago: parseBRNumber(el.impostoPago.value),
            saldoAnterior: parseBRNumber(el.saldoAnterior.value)
        };

        if (payload.rendimentos <= 0) {
            setStatus('Informe ao menos os rendimentos.', 'error');
            log('Erro: rendimentos ausentes/zero.');
            return;
        }

        try {
            const qs = new URLSearchParams({
                rendimentos: String(payload.rendimentos),
                despesas: String(payload.despesas),
                dependentes: String(payload.dependentes),
                impostoPago: String(payload.impostoPago),
                saldoAnterior: String(payload.saldoAnterior)
            });

            const resp = await fetch(`/api/irpf/simular?${qs.toString()}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (resp.status === 401) {
                window.location.href = '/login';
                return;
            }

            const data = await resp.json().catch(() => null);
            if (!resp.ok) {
                const msg = (data && data.error) ? data.error : `Falha HTTP ${resp.status}`;
                throw new Error(msg);
            }

            render(data);
            scrollToCardsAfterRender();
            setStatus('Cálculo concluído.');
            log('Concluído.');
        } catch (err) {
            console.error(err);
            setStatus(`Erro ao calcular: ${err.message}`, 'error');
            log(`Erro: ${err.message}`);
        }
    }

    function getScrollParent(node) {
        let parent = node?.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY;
            const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') &&
                parent.scrollHeight > parent.clientHeight + 5;

            if (isScrollable) return parent;
            parent = parent.parentElement;
        }
        return null;
    }

    function scrollToElementSmart(targetEl, offset = 24) {
        if (!targetEl) return;

        const scrollParent = getScrollParent(targetEl);

        // Se existir um container com scroll (ex.: main), rola ele
        if (scrollParent) {
            const parentRect = scrollParent.getBoundingClientRect();
            const elRect = targetEl.getBoundingClientRect();

            const currentTop = scrollParent.scrollTop;
            const targetTop = currentTop + (elRect.top - parentRect.top) - offset;

            scrollParent.scrollTo({ top: targetTop, behavior: 'smooth' });
            return;
        }

        // Caso padrão: rola a janela/página
        const y = targetEl.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: y, behavior: 'smooth' });
    }

    function shouldAutoScrollToCard(cardEl) {
        if (!cardEl) return false;
        const rect = cardEl.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;

        // Se o card já estiver no "topo/metade" da tela, não precisa descer
        // (ajuste 0.55 se quiser mais/menos sensível)
        const alreadyInGoodView = rect.top >= 0 && rect.top <= vh * 0.55;

        return !alreadyInGoodView;
    }

    function scrollToCardsAfterRender({ maxFrames = 120 } = {}) {
        let frames = 0;

        const tick = () => {
            const container = el.periodCards;
            const firstCard = container?.querySelector('.irpf-period-card');

            // ainda não renderizou os cards
            if (!firstCard) {
                if (++frames < maxFrames) return requestAnimationFrame(tick);
                return;
            }

            // ainda não calculou layout/pintura
            if (firstCard.offsetHeight === 0) {
                if (++frames < maxFrames) return requestAnimationFrame(tick);
                return;
            }

            // agora decide se deve rolar
            if (shouldAutoScrollToCard(firstCard)) {
                // dupla RAF pra garantir layout 100% aplicado
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        scrollToElementSmart(firstCard, 24);
                    });
                });
            }
        };

        requestAnimationFrame(tick);
    }

    function render(data) {
        el.periodCards.innerHTML = '';

        const items = (data && data.items) ? data.items : [];
        if (!items.length) {
            el.periodCards.innerHTML = `<div class="nfe-card">Sem resultados.</div>`;
            return;
        }

        // pega valores do formulário para exibir nos blocos (livro caixa e rendimentos)
        const rend = parseBRNumber(el.rendimentos.value);
        const desp = parseBRNumber(el.despesas.value);
        const depQtde = Math.max(0, Math.floor(parseBRNumber(el.dependentes.value)));

        const orderWeight = {
            '2026_jan_dez': 400,
            '2025_mai25_dez25': 300,
            '2024_fev24_abr25': 200,  // 2024/2025 (fev/24–abr/25) = mais recente que 2024 (mai/23–jan/24)
            '2024_mai23_jan24': 100
        };

        const itemsOrdenados = [...items].sort((a, b) => {
            const wa = orderWeight[a.regraId] ?? 0;
            const wb = orderWeight[b.regraId] ?? 0;
            return wb - wa; // desc
        });

        for (const it of itemsOrdenados) {
            const saldo = Number(it.saldoPagarCompensar || 0);
            const saldoClass = saldo > 0 ? 'is-devido' : saldo < 0 ? 'is-compensar' : 'is-zero';

            const card = document.createElement('div');
            card.className = `irpf-period-card`;

            card.innerHTML = `
      <div class="irpf-card-header">
        <div class="irpf-period-title">${it.periodoLabel}</div>
      </div>

      <!-- BLOCO 1: SALDO -->
      <div class="irpf-block ${saldoClass}">
        <div class="irpf-block-icon red">🧾</div>
        <div class="irpf-block-main">
          <div class="irpf-block-value">${formatBRL(saldo)}</div>
          <div class="irpf-block-label">Saldo a pagar / compensar</div>
        </div>
        <div class="irpf-block-lines">
          <div class="line"><span>Imposto Devido</span><strong>${formatBRL(it.impostoDevido)}</strong></div>
          <div class="line"><span>Imposto Pago</span><strong>${formatBRL(it.impostoPago)}</strong></div>
        </div>
      </div>

      <!-- BLOCO 2: RENDIMENTOS -->
      <div class="irpf-block">
        <div class="irpf-block-icon blue">💰</div>
        <div class="irpf-block-main">
          <div class="irpf-block-value">${formatBRL(rend)}</div>
          <div class="irpf-block-label">Rendimentos</div>
        </div>
        <div class="irpf-block-lines">
          <div class="line"><span>Referência</span><strong>Mês informado</strong></div>
        </div>
      </div>

      <!-- BLOCO 3: DEDUÇÕES -->
      <div class="irpf-block">
        <div class="irpf-block-icon yellow">🟡</div>
        <div class="irpf-block-main">
          <div class="irpf-block-value">${formatBRL(it.deducao.valor)}</div>
          <div class="irpf-block-label">Deduções (${it.deducao.tipo})</div>
        </div>
        <div class="irpf-block-lines">
          <div class="line">
            <span>Dependentes (${depQtde})</span>
            <strong>${formatBRL(it.deducao.deducaoDependentes || 0)}</strong>
          </div>
          <div class="line">
            <span>Livro Caixa</span>
            <strong>${formatBRL(desp)}</strong>
          </div>
        </div>
      </div>

      <!-- BLOCO 4: IMPOSTO -->
      <div class="irpf-block">
        <div class="irpf-block-icon cyan">🪙</div>
        <div class="irpf-block-main">
          <div class="irpf-block-value">${formatBRL(it.impostoDevido)}</div>
          <div class="irpf-block-label">Imposto</div>
        </div>
        <div class="irpf-block-lines">
          <div class="line"><span>Base de Cálculo</span><strong>${formatBRL(it.baseCalculo)}</strong></div>
          <div class="line"><span>Alíquota</span><strong>${formatPct(it.faixa.aliquota)}</strong></div>
          <div class="line"><span>Parcela a Deduzir</span><strong>${formatBRL(it.faixa.parcelaADeduzir)}</strong></div>
          <div class="line"><span>Imposto Pago</span><strong>${formatBRL(it.impostoPago)}</strong></div>
          <div class="line"><span>Saldo anterior</span><strong>${formatBRL(it.saldoAnterior)}</strong></div>
        </div>
      </div>
    `;

            el.periodCards.appendChild(card);
        }

        // log da regra 2026
        const y2026 = items.find((x) => x.regraId === '2026_jan_dez');
        if (y2026 && y2026.meta2026) {
            log(
                `2026: redutor adicional aplicado = ${formatBRL(y2026.meta2026.redutorAplicado)} ` +
                `(rendimentos=${formatBRL(y2026.meta2026.rendimentosReferencia)}).`
            );
        }
    }


    el.btnCalcular.addEventListener('click', calcular);

    el.btnPreencherExemplo.addEventListener('click', () => {
        // exemplo inspirado no print da sua planilha
        el.rendimentos.value = '7518,20';
        el.despesas.value = '379,18';
        el.dependentes.value = '0';
        el.impostoPago.value = '0,00';
        el.saldoAnterior.value = '0,00';
        setStatus('Exemplo preenchido. Clique em Calcular.');
    });
});