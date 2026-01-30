// script.js (versão sem data.js)
// Requer o server.js com endpoint POST /upload que devolve { count, records }

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);

  const els = {
    file: $("#excelFile") || $("#file") || $("input[type='file']"),
    btnUpload: $("#btnUpload") || $("#uploadBtn"),
    btnReset: $("#btnReset") || $("#resetBtn"),
    btnExport: $("#btnExport") || $("#exportBtn"),
    btnBaixarExcel: $("#btnBaixarExcel") || $("#downloadExcelBtn"),
    linkBaixarExcel: $("#linkBaixarExcel") || $("#downloadExcelLink"),

    search: $("#search") || $("#buscar") || $("#q"),
    mesIni: $("#mesInicial") || $("#filtroMesInicial"),
    mesFim: $("#mesFinal") || $("#filtroMesFinal"),

    table: $("#tblRelatorio") || $("#tabela") || $("table"),
    thead: $("#tblRelatorio thead") || $("table thead"),
    tbody: $("#tblRelatorio tbody") || $("table tbody"),

    metaCount: $("#metaCount") || $("#count") || $("#qtd"),
    metaSumMes1: $("#metaSumMes1") || $("#sumMes1"),
    metaSumMes2: $("#metaSumMes2") || $("#sumMes2"),
    metaSumTotal: $("#metaSumTotal") || $("#sumTotal"),

    status: $("#status") || $("#msg") || $("#toast"),
  };

  const fmtMoney = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const toNumber = (v) => {
    if (v === null || v === undefined) return NaN;
    if (typeof v === "number") return v;
    // aceita "1.234,56" e "1234.56"
    const s = String(v).trim()
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };

  const safeText = (v) => (v === null || v === undefined ? "" : String(v));

  function setStatus(msg, isError = false) {
    if (!els.status) return;
    els.status.textContent = msg || "";
    els.status.style.opacity = msg ? "1" : "0";
    els.status.dataset.type = isError ? "error" : "info";
  }

  function uniqueSorted(arr) {
    return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- State ----------
  let DATA = [];       // todos os registros
  let VIEW = [];       // registros filtrados/ordenados

  let sortKey = "nomeCompleto";
  let sortDir = "asc"; // asc | desc

  // ---------- Normalização dos registros vindos do server ----------
  function normalizeRecords(records) {
    return (records || []).map((r) => ({
      nomeCompleto: safeText(r.nomeCompleto ?? r["NOME COMPLETO"] ?? r.nome ?? r.name).trim(),
      mesInicial: safeText(r.mesInicial ?? r["MES INICIAL"] ?? r["MES INICIAL PROVISAO"]).trim(),
      mesFinal: safeText(r.mesFinal ?? r["MES FINAL"] ?? r["MES FINAL PROVISAO"]).trim(),
      valorMes1: toNumber(r.valorMes1 ?? r["VALOR MES 1"]),
      valorMes2: toNumber(r.valorMes2 ?? r["VALOR MES 2"]),
    }));
  }

  // ---------- Render ----------
  function render() {
    const q = (els.search?.value || "").trim().toUpperCase();
    const fIni = (els.mesIni?.value || "").trim();
    const fFim = (els.mesFim?.value || "").trim();

    let rows = DATA.slice();

    if (q) {
      rows = rows.filter((r) => (r.nomeCompleto || "").toUpperCase().includes(q));
    }
    if (fIni) rows = rows.filter((r) => (r.mesInicial || "") === fIni);
    if (fFim) rows = rows.filter((r) => (r.mesFinal || "") === fFim);

    rows.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];

      // números
      if (sortKey === "valorMes1" || sortKey === "valorMes2") {
        const an = Number.isFinite(av) ? av : -Infinity;
        const bn = Number.isFinite(bv) ? bv : -Infinity;
        return (an - bn) * dir;
      }

      // texto
      return safeText(av).localeCompare(safeText(bv), "pt-BR", { sensitivity: "base" }) * dir;
    });

    VIEW = rows;

    // Tabela
    if (els.tbody) {
      els.tbody.innerHTML = "";
      const frag = document.createDocumentFragment();

      for (const r of VIEW) {
        const tr = document.createElement("tr");

        const tdNome = document.createElement("td");
        tdNome.textContent = r.nomeCompleto;

        const tdIni = document.createElement("td");
        tdIni.textContent = r.mesInicial;

        const tdFim = document.createElement("td");
        tdFim.textContent = r.mesFinal;

        const tdV1 = document.createElement("td");
        tdV1.textContent = fmtMoney(r.valorMes1);
        tdV1.className = "num";

        const tdV2 = document.createElement("td");
        tdV2.textContent = fmtMoney(r.valorMes2);
        tdV2.className = "num";

        tr.append(tdNome, tdIni, tdFim, tdV1, tdV2);
        frag.appendChild(tr);
      }

      els.tbody.appendChild(frag);
    }

    // Metas (contagem e somas)
    const sum1 = VIEW.reduce((acc, r) => acc + (Number.isFinite(r.valorMes1) ? r.valorMes1 : 0), 0);
    const sum2 = VIEW.reduce((acc, r) => acc + (Number.isFinite(r.valorMes2) ? r.valorMes2 : 0), 0);

    if (els.metaCount) els.metaCount.textContent = String(VIEW.length);
    if (els.metaSumMes1) els.metaSumMes1.textContent = fmtMoney(sum1);
    if (els.metaSumMes2) els.metaSumMes2.textContent = fmtMoney(sum2);
    if (els.metaSumTotal) els.metaSumTotal.textContent = fmtMoney(sum1 + sum2);

    // Atualiza indicadores de sort no header (opcional)
    updateHeaderSortIndicators();
  }

  function updateHeaderSortIndicators() {
    if (!els.thead) return;
    const ths = els.thead.querySelectorAll("th[data-key]");
    ths.forEach((th) => {
      const k = th.getAttribute("data-key");
      th.classList.toggle("sort", k === sortKey);
      const caret = th.querySelector(".caret");
      if (caret) caret.textContent = k === sortKey ? (sortDir === "asc" ? "▲" : "▼") : "";
    });
  }

  function populateMonthFilters() {
    if (!els.mesIni && !els.mesFim) return;

    const monthsIni = uniqueSorted(DATA.map((r) => r.mesInicial));
    const monthsFim = uniqueSorted(DATA.map((r) => r.mesFinal));

    const fill = (select, values) => {
      if (!select) return;
      const current = select.value || "";
      select.innerHTML = "";
      const optAll = document.createElement("option");
      optAll.value = "";
      optAll.textContent = "Todos";
      select.appendChild(optAll);

      values.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
      });

      // tenta manter seleção anterior
      if (current && values.includes(current)) select.value = current;
    };

    fill(els.mesIni, monthsIni);
    fill(els.mesFim, monthsFim);
  }

  // ---------- Upload / Load ----------
  async function processUpload(file) {
    if (!file) return;

    setStatus("Processando Excel...");
    try {
      const fd = new FormData();
      fd.append("file", file);

      const resp = await fetch("/upload", { method: "POST", body: fd });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${txt}`);
      }

      const json = await resp.json();
      DATA = normalizeRecords(json.records);
      populateMonthFilters();
      render();
      setStatus(`Carregado: ${DATA.length} registros.`);
    } catch (err) {
      console.error(err);
      setStatus("Falha ao processar o arquivo. Verifique o console.", true);
    }
  }

  // ---------- Actions ----------
  function resetFilters() {
    if (els.search) els.search.value = "";
    if (els.mesIni) els.mesIni.value = "";
    if (els.mesFim) els.mesFim.value = "";
    sortKey = "nomeCompleto";
    sortDir = "asc";
    render();
  }

  function exportCSV() {
    const header = ["NOME COMPLETO DO FUNCIONARIO", "MES INICIAL PROVISAO", "MES FINAL PROVISAO", "VALOR MES 1", "VALOR MES 2"];
    const lines = [header.join(";")];

    for (const r of VIEW) {
      lines.push([
        `"${(r.nomeCompleto || "").replace(/"/g, '""')}"`,
        r.mesInicial || "",
        r.mesFinal || "",
        fmtMoney(r.valorMes1),
        fmtMoney(r.valorMes2),
      ].join(";"));
    }

    downloadText("relatorio_provisao_ferias.csv", lines.join("\n"));
  }

  // ---------- Wiring ----------
  function bindEvents() {
    // Se existir botão upload: usa clique; senão processa no change do input file
    if (els.btnUpload && els.file) {
      els.btnUpload.addEventListener("click", () => processUpload(els.file.files?.[0]));
    }
    if (els.file) {
      els.file.addEventListener("change", () => {
        const f = els.file.files?.[0];
        if (f) processUpload(f);
      });
    }

    els.search?.addEventListener("input", render);
    els.mesIni?.addEventListener("change", render);
    els.mesFim?.addEventListener("change", render);

    els.btnReset?.addEventListener("click", resetFilters);
    els.btnExport?.addEventListener("click", exportCSV);

    // Download do Excel (se você quiser apontar para um arquivo fixo)
    // - Se existir um link no HTML, setar o href nele.
    // - Caso tenha botão, pode abrir o link.
    if (els.linkBaixarExcel && !els.linkBaixarExcel.getAttribute("href")) {
      // ajuste aqui se você tiver um excel fixo
      // els.linkBaixarExcel.href = "/RELATORIO_PROVISAO_FERIAS.xlsx";
    }
    if (els.btnBaixarExcel && els.linkBaixarExcel) {
      els.btnBaixarExcel.addEventListener("click", () => {
        const href = els.linkBaixarExcel.getAttribute("href");
        if (href) window.location.href = href;
      });
    }

    // Ordenação: requer <th data-key="nomeCompleto|mesInicial|mesFinal|valorMes1|valorMes2">
    if (els.thead) {
      els.thead.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-key]");
        if (!th) return;
        const key = th.getAttribute("data-key");
        if (!key) return;

        if (sortKey === key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = key;
          sortDir = "asc";
        }
        render();
      });
    }
  }

  // ---------- Init ----------
  function init() {
    bindEvents();

    // Começa vazio (sem persistência)
    DATA = [];
    VIEW = [];
    populateMonthFilters();
    render();
    setStatus("Envie o Excel para carregar os dados.");
  }

  // DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
