/* global inicializarSidebar */
(() => {
  const SLUG = 'lotes-txt';
  const DEFAULT_FIELDS = {
    DTI: 2, DTF: 9, DBI: 10, DBF: 15, CRI: 16, CRF: 21,
    H3I: 22, H3F: 24, CPI: 25, CPF: 49, VLI: 50, VLF: 64,
    CDI: 68, CDF: 81, CCI: 82, CCF: 95,
    H4I: 533, H4F: 536, HEI: 2, HEF: 51,
    HTI: 11, HTF: 25,
  };
  const F = window.ErpTxtLayouts?.IOB_LOTE_NORMAL?.fields || DEFAULT_FIELDS;

  const st = {
    base: 'lote', file: null, eol: '\n', trail: false,
    lines: [], pend: [], baseD: 0, baseC: 0,
    map: new Map(), diffRows: [], diffMap: new Map(),
  };

  const $ = (id) => document.getElementById(id);
  const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
  const onlyDigits = (v, n = 50) => String(v || '').replace(/\D/g, '').slice(0, n);
  const onlyAN = (v) => String(v || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const pad = (s, n) => (String(s || '').length >= n ? String(s || '') : String(s || '') + ' '.repeat(n - String(s || '').length));
  const cut = (line, a, b) => pad(line, b).slice(a - 1, b);
  const setR = (line, a, b, val, ch = ' ') => {
    const w = b - a + 1; const v = String(val || '').padStart(w, ch).slice(-w); const s = pad(line, b);
    return s.slice(0, a - 1) + v + s.slice(b);
  };
  const setL = (line, a, b, val, ch = ' ') => {
    const w = b - a + 1; const v = String(val || '').slice(0, w).padEnd(w, ch); const s = pad(line, b);
    return s.slice(0, a - 1) + v + s.slice(b);
  };
  const vnum = (raw) => { const d = onlyDigits(raw, 30); return d ? Number(d) / 100 : 0; };
  const missRed = (v) => { const t = String(v || '').trim(); return !t || /^0+$/.test(t); };
  const missCls = (v) => { const a = onlyAN(v); return !a || /^0+$/.test(a); };
  const hasSide = (red, cls) => !missRed(red) || !missCls(cls);
  const kAlert = (id, on) => { const el = $(id); if (el) el.classList.toggle('is-alert', !!on); };
  const status = (m, err) => { const el = $('status'); if (!el) return; el.textContent = String(m || ''); el.style.color = err ? '#b42318' : '#0c4a6e'; };

  const ddmmyyyyToIso = (raw) => {
    const d = onlyDigits(raw, 8); if (d.length !== 8) return null;
    const iso = `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
    return Number.isNaN(new Date(iso + 'T00:00:00').getTime()) ? null : iso;
  };
  const isoToRaw = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}` : null);
  const dshow = (raw) => { const d = onlyDigits(raw, 8); return d.length === 8 ? `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4,8)}` : String(raw || ''); };

  const histBuildFull = (r, hs) => {
    const p = [];
    if (onlyDigits(r.h3, 10) && !/^0+$/.test(onlyDigits(r.h3, 10))) p.push('Hist. padrao: ' + r.h3);
    if (r.cp) p.push('Complemento: ' + r.cp);
    if (onlyDigits(r.h4, 10) && !/^0+$/.test(onlyDigits(r.h4, 10))) p.push('Hist. 4 digitos: ' + r.h4);
    if (hs.length) p.push('Hist. especial: ' + hs.join(' | '));
    return p.length ? p.join('\n') : '(sem historico informado)';
  };
  const histBuildCmp = (cp, hs) => {
    const p = [];
    if (cp) p.push('Complemento: ' + cp);
    if (hs.length) p.push('Hist. especial: ' + hs.join(' | '));
    return p.length ? p.join('\n') : '(sem complemento/historico especial)';
  };
  const histKey = (t) => String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const accountLabel = (red, cls) => {
    const r = String(red || '').trim();
    const c = String(cls || '').trim();
    const out = [];
    if (!missRed(r)) out.push(`Red: ${r}`);
    if (!missCls(c)) out.push(`Clas: ${c}`);
    return out.length ? out.join(' | ') : '(sem conta)';
  };

  const moneyInput = (v) => String((Number(v) || 0).toFixed(2)).replace('.', ',');
  const parseMoneyInput = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return { ok: false, empty: true };
    let n = t.replace(/\s+/g, '').replace(/R\$/gi, '').replace(/[^0-9,.\-]/g, '');
    const lastComma = n.lastIndexOf(',');
    const lastDot = n.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) n = n.replace(/\./g, '').replace(',', '.');
      else n = n.replace(/,/g, '');
    } else if (lastComma >= 0) n = n.replace(',', '.');
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return { ok: false, empty: false };
    return { ok: true, empty: false, val: v };
  };

  const parseEntry = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return { ok: false, empty: true };
    if (/^\d{1,6}$/.test(t)) return { ok: true, empty: false, type: 'red', red: t.padStart(6, '0') };
    const a = onlyAN(t);
    if (a && a.length <= 14) return { ok: true, empty: false, type: 'cls', cls: a };
    return { ok: false, empty: false };
  };

  const splitInfo = (text) => {
    const src = String(text || '');
    const eol = src.includes('\r\n') ? '\r\n' : '\n';
    const trail = /\r\n$|\n$|\r$/.test(src);
    const norm = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = norm.split('\n'); if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return { eol, trail, lines };
  };

  function parseTxt(txt) {
    const info = splitInfo(txt);
    const pend = []; const lcts = [];
    let td = 0, tc = 0; let minIso = null, maxIso = null;

    for (let i = 0; i < info.lines.length; i += 1) {
      const line = info.lines[i] || ''; if ((line[0] || '').toUpperCase() !== 'L') continue;
      const rawDate = cut(line, F.DTI, F.DTF); const iso = ddmmyyyyToIso(rawDate);
      if (iso) { if (!minIso || iso < minIso) minIso = iso; if (!maxIso || iso > maxIso) maxIso = iso; }

      const dr = cut(line, F.DBI, F.DBF), cr = cut(line, F.CRI, F.CRF);
      const dc = cut(line, F.CDI, F.CDF), cc = cut(line, F.CCI, F.CCF);
      const val = vnum(cut(line, F.VLI, F.VLF));
      const hd = hasSide(dr, dc), hc = hasSide(cr, cc);
      if (hd) td += val; if (hc) tc += val;

      const hs = [];
      for (let j = i + 1; j < info.lines.length; j += 1) {
        const h = info.lines[j] || ''; if ((h[0] || '').toUpperCase() !== 'H') break;
        const t = cut(h, F.HEI, F.HEF).trim(); if (t) hs.push(t);
      }

      const h3 = cut(line, F.H3I, F.H3F).trim();
      const h4 = cut(line, F.H4I, F.H4F).trim();
      const cp = cut(line, F.CPI, F.CPF).trim();
      const h = histBuildFull({ h3, h4, cp }, hs);
      const hCmp = histBuildCmp(cp, hs);
      lcts.push({
        key: `L${i}`, idx: i, line: i + 1, rawDate, iso, val, d: hd, c: hc, h,
        hCmp, dAcc: accountLabel(dr, dc), cAcc: accountLabel(cr, cc), hk: histKey(hCmp),
      });

      if (!hd && !hc) {
        pend.push({
          key: `L${i}`, idx: i, lineLabel: `linha ${i + 1}`, val, h,
          dm: { ri: F.DBI, rf: F.DBF, ci: F.CDI, cf: F.CDF },
          cm: { ri: F.CRI, rf: F.CRF, ci: F.CCI, cf: F.CCF },
        });
      }
    }

    return { ...info, pend, baseD: td, baseC: tc, diff: analyzeDiff(lcts), minIso, maxIso };
  }

  function analyzeDiff(lcts) {
    const TOL = 0.005;
    const byDay = new Map();
    lcts.forEach((x) => {
      if (!x.iso) return;
      if (!byDay.has(x.iso)) byDay.set(x.iso, { iso: x.iso, rawDate: x.rawDate, d: 0, c: 0, arr: [] });
      const b = byDay.get(x.iso); if (x.d) b.d += x.val; if (x.c) b.c += x.val; b.arr.push(x);
    });

    const days = [];
    [...byDay.values()]
      .sort((a, b) => {
        const aMin = a.arr.reduce((m, x) => (x.idx < m ? x.idx : m), Number.POSITIVE_INFINITY);
        const bMin = b.arr.reduce((m, x) => (x.idx < m ? x.idx : m), Number.POSITIVE_INFINITY);
        return aMin - bMin;
      })
      .forEach((d) => {
      const dif = d.d - d.c; if (Math.abs(dif) < TOL) return;
      const absDif = Math.abs(dif);
      const daySign = dif >= 0 ? 1 : -1;
      const noAccount = d.arr
        .filter((x) => !x.d && !x.c)
        .sort((a, b) => a.line - b.line);
      const noAccountSum = noAccount.reduce((s, x) => s + x.val, 0);
      const noAccountExplains = noAccountSum + TOL >= absDif;
      const needNormalSearch = !noAccountExplains;

      const gmap = new Map();
      d.arr.forEach((x) => {
        if (!x.d && !x.c) return;
        const k = x.hk || '(SEM HIST)';
        if (!gmap.has(k)) gmap.set(k, { d: 0, c: 0, arr: [], firstIdx: x.idx });
        const g = gmap.get(k);
        if (x.d) g.d += x.val;
        if (x.c) g.c += x.val;
        g.arr.push(x);
        if (x.idx < g.firstIdx) g.firstIdx = x.idx;
      });

      const suspects = [];
      noAccount.forEach((x) => suspects.push({
        ...x,
        reason: noAccountExplains
          ? 'Lancamento sem conta (diferenca do dia coberta por sem conta)'
          : 'Lancamento sem conta (cobre parcialmente a diferenca do dia)',
      }));

      const groups = [];
      gmap.forEach((g) => {
        const gd = g.d - g.c;
        if (Math.abs(gd) < TOL) return;
        groups.push({ ...g, gd });
      });

      if (groups.length && (needNormalSearch || !noAccount.length)) {
        const target = needNormalSearch ? Math.max(0, absDif - noAccountSum) : absDif;
        const sameSign = groups.filter((g) => (g.gd >= 0 ? 1 : -1) === daySign);
        const pool = (sameSign.length ? sameSign : groups).slice();
        pool.sort((a, b) => {
          const ad = Math.abs(Math.abs(a.gd) - target);
          const bd = Math.abs(Math.abs(b.gd) - target);
          if (ad !== bd) return ad - bd;
          const aa = Math.abs(a.gd);
          const bb = Math.abs(b.gd);
          if (aa !== bb) return aa - bb;
          return a.firstIdx - b.firstIdx;
        });

        const selected = [];
        let covered = 0;
        pool.forEach((g) => {
          if (selected.length && covered + TOL >= target) return;
          selected.push(g);
          covered += Math.abs(g.gd);
        });
        if (!selected.length && pool.length) selected.push(pool[0]);
        selected
          .sort((a, b) => a.firstIdx - b.firstIdx)
          .forEach((g) => {
            g.arr
              .slice()
              .sort((a, b) => a.line - b.line)
              .forEach((x) => suspects.push({
                ...x,
                reason: `Historico semelhante com diferenca ${money(g.gd)} (debitos e creditos do grupo)`,
              }));
          });
      }

      const uniqMap = new Map();
      suspects.forEach((x) => { if (!uniqMap.has(x.key)) uniqMap.set(x.key, x); });
      const uniq = [...uniqMap.values()].sort((a, b) => a.line - b.line);
      days.push({ rawDate: d.rawDate, d: d.d, c: d.c, dif, entries: uniq });
      });
    return { days };
  }

  function rowState(row) {
    const p = st.map.get(row.key) || {};
    const d = parseEntry(p.d ? p.d.value : '');
    const c = parseEntry(p.c ? p.c.value : '');
    return {
      d: { p: d, v: d.ok, bad: !d.ok && !d.empty },
      c: { p: c, v: c.ok, bad: !c.ok && !c.empty },
    };
  }

  function diffValueState(row) {
    const p = st.diffMap.get(row.key);
    const v = parseMoneyInput(p?.v ? p.v.value : '');
    if (v.empty) return { value: row.val, bad: false, changed: false };
    if (!v.ok) return { value: row.val, bad: true, changed: false };
    return { value: v.val, bad: false, changed: Math.abs(v.val - row.val) >= 0.005 };
  }

  function valueForLine(key, fallback) {
    const p = st.diffMap.get(key);
    if (!p?.row) return fallback;
    const v = diffValueState(p.row);
    return v.bad ? fallback : v.value;
  }

  function kpiSnapshot() {
    let d = Number(st.baseD) || 0; let c = Number(st.baseC) || 0;
    let pendOpen = 0, anyPendV = false, anyDiffV = false, anyBad = false;
    st.pend.forEach((r) => {
      const s = rowState(r);
      const rv = valueForLine(r.key, r.val);
      if (s.d.v) { d += rv; anyPendV = true; }
      if (s.c.v) { c += rv; anyPendV = true; }
      if (!s.d.v && !s.c.v) pendOpen += 1;
      if (s.d.bad || s.c.bad) anyBad = true;
    });
    const seen = new Set();
    st.diffRows.forEach((r) => {
      if (seen.has(r.key)) return;
      seen.add(r.key);
      const v = diffValueState(r);
      if (v.bad) { anyBad = true; return; }
      if (!v.changed) return;
      const delta = v.value - r.val;
      if (r.d) d += delta;
      if (r.c) c += delta;
      anyDiffV = true;
    });
    return { d, c, dif: d - c, pendOpen, anyPendV, anyDiffV, anyBad };
  }

  function renderKpi(k) {
    $('kpiDebitos').textContent = money(k.d);
    $('kpiCreditos').textContent = money(k.c);
    $('kpiDiferencas').textContent = money(k.dif);
    $('kpiPendencias').textContent = String(k.pendOpen);
    const alert = Math.abs(k.dif) >= 0.005 || k.pendOpen > 0;
    kAlert('kpiDebitos', alert); kAlert('kpiCreditos', alert); kAlert('kpiDiferencas', alert); kAlert('kpiPendencias', alert);
  }

  function periodSelected() {
    const s = $('periodoInicio')?.value || null;
    const e = $('periodoFim')?.value || null;
    if (s && e && s > e) throw new Error('Periodo invalido: data inicial maior que data final.');
    return { s, e, on: !!(s || e) };
  }

  function inRange(iso, p) {
    if (!p.on) return true;
    if (!iso) return false;
    if (p.s && iso < p.s) return false;
    if (p.e && iso > p.e) return false;
    return true;
  }

  function applyPeriod(lines, p) {
    if (!p.on) return lines.slice();
    const out = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] || ''; const t = (line[0] || '').toUpperCase();
      if (t === 'L') {
        const keep = inRange(ddmmyyyyToIso(cut(line, F.DTI, F.DTF)), p);
        if (keep) out.push(line);
        let j = i + 1;
        while (j < lines.length && ((lines[j] || '')[0] || '').toUpperCase() === 'H') { if (keep) out.push(lines[j]); j += 1; }
        i = j - 1; continue;
      }
      if (t === 'H') continue;
      out.push(line);
    }
    return out;
  }

  function updateHeader(lines) {
    const out = lines.slice();
    const idx = out.findIndex((x) => String(x || '').startsWith('C')); if (idx < 0) return out;
    let td = 0;
    out.forEach((line) => {
      if (!String(line || '').startsWith('L')) return;
      if (!hasSide(cut(line, F.DBI, F.DBF), cut(line, F.CDI, F.CDF))) return;
      td += vnum(cut(line, F.VLI, F.VLF));
    });
    const field = String(Math.round(td * 100)).padStart(15, '0').slice(-15);
    out[idx] = setR(out[idx], F.HTI, F.HTF, field, '0');
    return out;
  }

  function renderDiff(a) {
    const s = $('diffSummary'), db = $('diffDaysBody'), lb = $('diffLancBody');
    if (!s || !db || !lb) return;
    db.innerHTML = ''; lb.innerHTML = ''; st.diffRows = []; st.diffMap.clear();
    const days = Array.isArray(a?.days) ? a.days : [];
    if (!days.length) {
      s.textContent = 'Nenhum dia com diferenca encontrado.';
      db.innerHTML = '<tr><td colspan="4">Nenhum dia com diferenca.</td></tr>';
      lb.innerHTML = '<tr><td colspan="8">Nenhum lancamento suspeito para ajuste.</td></tr>';
      return;
    }
    s.textContent = `Dias com diferenca: ${days.length}. O quadro abaixo mostra apenas lancamentos suspeitos da causa da diferenca.`;
    days.forEach((d) => {
      db.insertAdjacentHTML('beforeend', `<tr><td>${dshow(d.rawDate)}</td><td>${money(d.d)}</td><td>${money(d.c)}</td><td>${money(d.dif)}</td></tr>`);
      if (!d.entries.length) {
        lb.insertAdjacentHTML('beforeend', `<tr><td>${dshow(d.rawDate)}</td><td colspan="7">Sem lancamentos suspeitos encontrados para este dia.</td></tr>`);
      } else {
        d.entries.forEach((r) => {
          st.diffRows.push(r);
          const tr = document.createElement('tr');
          const day = document.createElement('td'); day.textContent = dshow(r.rawDate);
          const line = document.createElement('td'); line.textContent = `linha ${r.line}`;
          const da = document.createElement('td'); da.textContent = r.dAcc;
          const ca = document.createElement('td'); ca.textContent = r.cAcc;
          const side = document.createElement('td');
          side.textContent = r.d && r.c ? 'Debito/Credito' : r.d ? 'Debito' : r.c ? 'Credito' : 'Sem conta';
          const rs = document.createElement('td'); rs.textContent = r.reason || 'Lancamento desequilibrado';
          const val = document.createElement('td');
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'lotes-txt-value-input';
          inp.maxLength = 22;
          inp.placeholder = '0,00';
          inp.value = moneyInput(r.val);
          inp.addEventListener('input', refresh);
          val.appendChild(inp);
          st.diffMap.set(r.key, { v: inp, row: r });
          const hh = document.createElement('td'); hh.className = 'lotes-txt-hist'; hh.textContent = r.hCmp || '(sem complemento/historico especial)';
          tr.append(day, line, da, ca, side, rs, val, hh); lb.appendChild(tr);
        });
      }
    });
  }

  function renderPend(pend) {
    const tb = $('pendenciasBody'); if (!tb) return;
    tb.innerHTML = ''; st.map.clear();
    if (!pend.length) { tb.innerHTML = '<tr><td colspan="5">Nenhum lancamento sem conta/classificacao encontrado.</td></tr>'; return; }
    pend.forEach((r) => {
      const tr = document.createElement('tr');
      const id = document.createElement('td'); id.textContent = r.lineLabel;
      const dd = document.createElement('td'); const di = document.createElement('input');
      di.type = 'text'; di.className = 'lotes-txt-account-input'; di.maxLength = 24; di.placeholder = 'Conta/Clas. debito'; di.addEventListener('input', refresh);
      dd.appendChild(di);
      const cd = document.createElement('td'); const ci = document.createElement('input');
      ci.type = 'text'; ci.className = 'lotes-txt-account-input'; ci.maxLength = 24; ci.placeholder = 'Conta/Clas. credito'; ci.addEventListener('input', refresh);
      cd.appendChild(ci);
      st.map.set(r.key, { d: di, c: ci });
      const vv = document.createElement('td'); vv.textContent = money(r.val);
      const hh = document.createElement('td'); hh.className = 'lotes-txt-hist'; hh.textContent = r.h;
      tr.append(id, dd, cd, vv, hh); tb.appendChild(tr);
    });
  }

  function refresh() {
    st.pend.forEach((r) => {
      const p = st.map.get(r.key); if (!p) return;
      const s = rowState(r);
      p.d.classList.toggle('invalid', s.d.bad);
      p.c.classList.toggle('invalid', s.c.bad);
    });
    const seen = new Set();
    st.diffRows.forEach((r) => {
      if (seen.has(r.key)) return;
      seen.add(r.key);
      const p = st.diffMap.get(r.key); if (!p?.v) return;
      const v = diffValueState(r);
      p.v.classList.toggle('invalid', v.bad);
    });

    const k = kpiSnapshot(); renderKpi(k);
    let p = { on: false };
    try { p = periodSelected(); } catch (e) {
      const b = $('btnDownload'); if (b) b.disabled = true; status(e.message || 'Periodo invalido.', true); return;
    }

    const can = st.lines.length > 0 && !k.anyBad && (st.pend.length === 0 || k.anyPendV || k.anyDiffV || p.on);
    const b = $('btnDownload'); if (b) b.disabled = !can;

    if (st.pend.length === 0 && st.lines.length > 0) {
      status(p.on ? 'Sem pendencias de conta. Download com fatiamento liberado.' : 'Arquivo lido. Sem pendencias. Voce pode ajustar valores no diagnostico e baixar.', false);
      return;
    }
    if (k.anyBad) { status('Existem campos com formato invalido. Revise os campos em vermelho.', true); return; }
    if (can) { status('Download liberado. Informe debito/credito, ajuste valor e/ou periodo para gerar o TXT.', false); return; }
    status('Preencha debito/credito, ajuste valor em diferencas ou defina um periodo para gerar o TXT.', false);
  }

  function applySide(line, m, parsed) {
    if (!parsed?.ok) return line;
    if (parsed.type === 'red') return setR(line, m.ri, m.rf, parsed.red, '0');
    let x = setR(line, m.ri, m.rf, '000000', '0');
    x = setL(x, m.ci, m.cf, parsed.cls, ' ');
    return x;
  }

  function buildOut() {
    const out = st.lines.slice();
    let ch = 0;
    st.pend.forEach((r) => {
      const s = rowState(r);
      if (s.d.bad || s.c.bad) throw new Error(`Existe campo invalido em ${r.lineLabel}.`);
      let line = out[r.idx] || '';
      if (s.d.v) { line = applySide(line, r.dm, s.d.p); ch += 1; }
      if (s.c.v) { line = applySide(line, r.cm, s.c.p); ch += 1; }
      out[r.idx] = line;
    });

    let vh = 0;
    const seen = new Set();
    st.diffRows.forEach((r) => {
      if (seen.has(r.key)) return;
      seen.add(r.key);
      const v = diffValueState(r);
      if (v.bad) throw new Error(`Valor invalido em linha ${r.line}.`);
      if (!v.changed) return;
      const cents = String(Math.round(v.value * 100)).padStart(15, '0').slice(-15);
      out[r.idx] = setR(out[r.idx] || '', F.VLI, F.VLF, cents, '0');
      vh += 1;
    });

    const p = periodSelected();
    if (st.pend.length > 0 && ch === 0 && vh === 0 && !p.on) throw new Error('Preencha debito/credito, ajuste valor ou defina um periodo para gerar o TXT.');
    const sliced = applyPeriod(out, p);
    const hdr = updateHeader(sliced);
    const txt = hdr.join(st.eol);
    return st.trail ? txt + st.eol : txt;
  }

  function download(content, name) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setPeriodBounds(minIso, maxIso) {
    const s = $('periodoInicio'), e = $('periodoFim'), info = $('periodoInfo');
    if (s) { s.min = minIso || ''; s.max = maxIso || ''; }
    if (e) { e.min = minIso || ''; e.max = maxIso || ''; }
    if (info) info.textContent = minIso && maxIso ? `Periodo encontrado no arquivo: ${dshow(isoToRaw(minIso))} a ${dshow(isoToRaw(maxIso))}.` : '';
  }

  function isTxt(f) { return !!f && (/\.txt$/i.test(String(f.name || '')) || String(f.type || '').toLowerCase().includes('text')); }
  function setFile(file, input) {
    if (!isTxt(file)) { status('Use um arquivo .txt valido.', true); return false; }
    st.file = file; st.base = String(file.name || 'lote').replace(/\.txt$/i, '');
    const z = $('dropZoneText'); if (z) z.textContent = 'Arquivo selecionado: ' + file.name;
    if (input && typeof DataTransfer !== 'undefined') {
      try { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; } catch (_) {}
    }
    return true;
  }

  async function onProcess(ev) {
    ev.preventDefault();
    const inp = $('lotesTxtFile');
    const f = inp?.files?.[0] || st.file;
    if (!f) { status('Selecione um arquivo TXT.', true); return; }
    if (!setFile(f, inp)) return;

    status('Lendo arquivo...', false);
    try {
      const txt = await new Promise((res, rej) => {
        const rd = new FileReader(); rd.onload = () => res(String(rd.result || '')); rd.onerror = () => rej(rd.error || new Error('Falha leitura')); rd.readAsText(f, 'latin1');
      });

      const r = parseTxt(txt);
      st.eol = r.eol; st.trail = r.trail; st.lines = r.lines; st.pend = r.pend; st.baseD = r.baseD; st.baseC = r.baseC;
      setPeriodBounds(r.minIso, r.maxIso);
      renderDiff(r.diff);
      renderPend(r.pend);
      renderKpi(kpiSnapshot());
      refresh();
    } catch (e) {
      console.error(e);
      st.lines = []; st.pend = []; st.baseD = 0; st.baseC = 0; st.map.clear();
      setPeriodBounds(null, null); renderDiff({ days: [] }); renderKpi(kpiSnapshot());
      const b = $('btnDownload'); if (b) b.disabled = true;
      status('Nao foi possivel processar o TXT. Verifique se o arquivo segue o layout esperado.', true);
    }
  }

  function onDownload() {
    if (!st.lines.length) { status('Processe um arquivo antes de baixar.', true); return; }
    try {
      const txt = buildOut();
      download(txt, `${st.base}-ajustado.txt`);
      status('Arquivo ajustado gerado com sucesso (total do cabecalho recalculado).', false);
    } catch (e) {
      console.error(e);
      status(e.message || 'Nao foi possivel gerar o arquivo.', true);
    }
  }

  function boot() {
    if (typeof inicializarSidebar === 'function') inicializarSidebar(SLUG);

    const inp = $('lotesTxtFile');
    if (inp) {
      inp.addEventListener('change', () => { const f = inp.files?.[0]; if (f && setFile(f, inp)) status('Arquivo selecionado. Clique em "Ler arquivo".', false); });
    }

    $('periodoInicio')?.addEventListener('change', refresh);
    $('periodoFim')?.addEventListener('change', refresh);
    $('lotesTxtForm')?.addEventListener('submit', onProcess);
    const b = $('btnDownload'); if (b) { b.disabled = true; b.addEventListener('click', onDownload); }

    const z = $('dropZoneText'); if (z) z.textContent = 'Selecionar TXT de lote ou arrastar o arquivo para esta area...';
    setPeriodBounds(null, null);
    renderDiff({ days: [] });
    renderKpi(kpiSnapshot());
    status('Anexe um TXT e clique em "Ler arquivo".', false);
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
