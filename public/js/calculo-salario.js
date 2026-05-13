/* =============================================================
   Cálculo de Salário / Pró-labore  —  AGENTS.md vps-compatible
   Replica a planilha SALARIO 4.xlsx
   ============================================================= */

'use strict';

// ---------------------------------------------------------------------------
// Configuração por aba
// ---------------------------------------------------------------------------
const SHEET_CONFIG = {
  'FOLHA 2024': {
    type: 'clt', label: 'Folha de Pagamento — 2024',
    subtitle: 'Tabela INSS 2024 progressiva · Tabela IRRF 2024',
    inss: { flat: false, bands: [
      { ate: 1412.00, aliquota: 0.075 }, { ate: 2666.68, aliquota: 0.09 },
      { ate: 4000.03, aliquota: 0.12  }, { ate: 7786.02, aliquota: 0.14 },
    ], max: null },
    irrf: { bands: [
      { ate: 2259.20,  aliquota: 0,     deducao: 0      },
      { ate: 2826.65,  aliquota: 0.075, deducao: 169.44 },
      { ate: 3751.05,  aliquota: 0.15,  deducao: 381.44 },
      { ate: 4664.68,  aliquota: 0.225, deducao: 662.77 },
      { ate: Infinity, aliquota: 0.275, deducao: 896.00 },
    ], specialRule: null },
    dsr: { diasUteis: 23, domingosFer: 7 },
    params: { fgtsRate: 0.08, valorPorDep: 189.59, deducaoSimplificada: 564.8 },
    defaults: { salBase: 2017.35 },
  },

  'FOLHA 2025': {
    type: 'clt', label: 'Folha de Pagamento — 2025',
    subtitle: 'Tabela INSS 2025 progressiva · Tabela IRRF 2025',
    inss: { flat: false, bands: [
      { ate: 1518.00, aliquota: 0.075 }, { ate: 2793.88, aliquota: 0.09 },
      { ate: 4190.83, aliquota: 0.12  }, { ate: 8157.41, aliquota: 0.14 },
    ], max: null },
    irrf: { bands: [
      { ate: 2259.20,  aliquota: 0,     deducao: 0      },
      { ate: 2826.65,  aliquota: 0.075, deducao: 169.44 },
      { ate: 3751.05,  aliquota: 0.15,  deducao: 381.44 },
      { ate: 4664.68,  aliquota: 0.225, deducao: 662.77 },
      { ate: Infinity, aliquota: 0.275, deducao: 896.00 },
    ], specialRule: null },
    dsr: { diasUteis: 24, domingosFer: 6 },
    params: { fgtsRate: 0.08, valorPorDep: 189.59, deducaoSimplificada: 564.8 },
    defaults: { salBase: 3090.77 },
  },

  'FOLHA 2025 (2)': {
    type: 'clt', label: 'Folha de Pagamento — 2025 (2)',
    subtitle: 'Tabela INSS 2025 · Tabela IRRF 2026 (1ª faixa: R$ 2.428,80)',
    inss: { flat: false, bands: [
      { ate: 1518.00, aliquota: 0.075 }, { ate: 2793.88, aliquota: 0.09 },
      { ate: 4190.83, aliquota: 0.12  }, { ate: 8157.41, aliquota: 0.14 },
    ], max: null },
    irrf: { bands: [
      { ate: 2428.80,  aliquota: 0,     deducao: 0      },
      { ate: 2826.65,  aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05,  aliquota: 0.15,  deducao: 394.16 },
      { ate: 4664.68,  aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ], specialRule: 'folha2025_2' },
    dsr: { diasUteis: 23, domingosFer: 7 },
    params: { fgtsRate: 0.08, valorPorDep: 189.59, deducaoSimplificada: 607.2 },
    defaults: { salBase: 5182.03 },
  },

  'FOLHA 2026': {
    type: 'clt', label: 'Folha de Pagamento — 2026',
    subtitle: 'Tabela INSS 2026 progressiva · Tabela IRRF 2026 (1ª faixa: R$ 2.428,80)',
    inss: { flat: false, bands: [
      { ate: 1621.00, aliquota: 0.075 }, { ate: 2902.84, aliquota: 0.09 },
      { ate: 4354.27, aliquota: 0.12  }, { ate: 8475.55, aliquota: 0.14 },
    ], max: 988.09 },
    irrf: { bands: [
      { ate: 2428.80,  aliquota: 0,     deducao: 0      },
      { ate: 2826.65,  aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05,  aliquota: 0.15,  deducao: 394.16 },
      { ate: 4664.68,  aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ], specialRule: 'folha2026' },
    dsr: { diasUteis: 24, domingosFer: 6 },
    params: { fgtsRate: 0.08, valorPorDep: 189.59, deducaoSimplificada: 607.2, r10: 0.133145, r11: 978.62, limiteQ22: 7350 },
    defaults: { salBase: 3395.00 },
  },

  'PROLABORE': {
    type: 'prolabore', label: 'Pró-labore — 2024/2025',
    subtitle: 'INSS: alíquota única 11% (progressivo) · Tabela IRRF 2025',
    inss: { flat: false, bands: [
      { ate: 1518.00, aliquota: 0.11 }, { ate: 2793.88, aliquota: 0.11 },
      { ate: 4190.83, aliquota: 0.11 }, { ate: 8157.41, aliquota: 0.11 },
    ], max: 897.3151 },
    irrf: { bands: [
      { ate: 2259.20,  aliquota: 0,     deducao: 0      },
      { ate: 2826.65,  aliquota: 0.075, deducao: 169.44 },
      { ate: 3751.05,  aliquota: 0.15,  deducao: 381.44 },
      { ate: 4664.68,  aliquota: 0.225, deducao: 662.77 },
      { ate: Infinity, aliquota: 0.275, deducao: 896.00 },
    ], specialRule: null },
    dsr: { diasUteis: 26, domingosFer: 5 },
    params: { fgtsRate: 0.08, valorPorDep: 189.59, deducaoSimplificada: 564.8 },
    defaults: { salBase: 5287.50 },
  },

  'PROLABORE 25': {
    type: 'prolabore', label: 'Pró-labore — 2025',
    subtitle: 'INSS: alíquota única 11% (progressivo) · Tabela IRRF 2026',
    inss: { flat: false, bands: [
      { ate: 1518.00, aliquota: 0.11 }, { ate: 2793.88, aliquota: 0.11 },
      { ate: 4190.83, aliquota: 0.11 }, { ate: 8157.41, aliquota: 0.11 },
    ], max: 897.3151 },
    irrf: { bands: [
      { ate: 2428.80,  aliquota: 0,     deducao: 0      },
      { ate: 2826.65,  aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05,  aliquota: 0.15,  deducao: 394.16 },
      { ate: 4664.68,  aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ], specialRule: null },
    dsr: { diasUteis: 26, domingosFer: 5 },
    params: { fgtsRate: 0.08, valorPorDep: 189.59, deducaoSimplificada: 607.2 },
    defaults: { salBase: 5740.28 },
  },

  'PROLABORE 26': {
    type: 'prolabore', label: 'Pró-labore — 2026',
    subtitle: 'INSS: 11% plano (cap R$ 988,09) · Tabela IRRF 2026',
    inss: { flat: true, aliquotaFlat: 0.11, max: 988.09, bands: [] },
    irrf: { bands: [
      { ate: 2428.80,  aliquota: 0,     deducao: 0      },
      { ate: 2826.65,  aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05,  aliquota: 0.15,  deducao: 394.16 },
      { ate: 4664.68,  aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ], specialRule: null },
    dsr: { diasUteis: 26, domingosFer: 5 },
    params: { fgtsRate: 0.08, valorPorDep: 189.59, deducaoSimplificada: 564.8 },
    defaults: { salBase: 8157.41 },
  },

  'FOLHA 2026 open': { type: 'open', label: 'FOLHA 2026 open', ref: 'FOLHA 2026' },
  'MULTA FGTS':       { type: 'multa_fgts', label: 'Multa FGTS — Rescisão' },
};

// ---------------------------------------------------------------------------
// localStorage — persistência entre recarregamentos
// ---------------------------------------------------------------------------
const SK_OVERRIDES = 'cs-overrides-v2';
const SK_DYNAMIC   = 'cs-dynamic-tabs-v1';
const SK_HIDDEN    = 'cs-hidden-tabs-v1';
const SK_ACKED     = 'cs-ack-warnings-v1';
const SK_ADMINS    = 'cs-param-admins-v1';
const SK_DELETED   = 'cs-deleted-tabs-v1';
const SK_PRESETS   = 'cs-presets-v1';

let userOverrides        = {};
let hiddenTabs           = new Set();
let deletedTabs          = new Set();
let acknowledgedWarnings = new Set();
let paramAdmins          = [];
let currentUser          = null;
let csrfToken            = null;
// Presets customizados/sobrescritos pelo admin (global, não por aba)
let customPresets        = { earning: [], deduction: [] };

// Estado do modal de parâmetros — pending state (não salva até clicar Salvar)
const _pm = { dirty: false, pending: {}, pendingPresets: null, tab: null };

function toJson(v)  { return JSON.stringify(v, (k, x) => (x === Infinity ? '__INF__' : x)); }
function fromJson(s){ return JSON.parse(s,    (k, x) => (x === '__INF__' ? Infinity  : x)); }
function deepCloneOv(ov) { return fromJson(toJson(ov)); }

// ---------------------------------------------------------------------------
// Persistência — localStorage (cache local) + servidor (estado compartilhado)
// ---------------------------------------------------------------------------
// Retorna cópia de userOverrides sem extraEarnings/extraDeductions (ephemeral por sessão)
function _ovForSave() {
  const clean = {};
  for (const [tab, ov] of Object.entries(userOverrides)) {
    const { extraEarnings, extraDeductions, ...rest } = ov;
    clean[tab] = rest;
  }
  return clean;
}
function saveOverrides()    { try { localStorage.setItem(SK_OVERRIDES, toJson(_ovForSave())); } catch(e){} }
function saveHiddenTabs()   { try { localStorage.setItem(SK_HIDDEN,    JSON.stringify([...hiddenTabs])); } catch(e){} }
function saveDeletedTabs()  { try { localStorage.setItem(SK_DELETED,   JSON.stringify([...deletedTabs])); } catch(e){} }
function saveAckedWarnings(){ try { localStorage.setItem(SK_ACKED,     JSON.stringify([...acknowledgedWarnings])); } catch(e){} }
function saveParamAdmins()  { try { localStorage.setItem(SK_ADMINS,    JSON.stringify(paramAdmins)); } catch(e){} }
function saveCustomPresets(){ try { localStorage.setItem(SK_PRESETS,   toJson(customPresets)); } catch(e){} }
function saveDynamicTabs() {
  const dyn = Object.entries(SHEET_CONFIG).filter(([,c]) => c.isDynamic).map(([name,cfg]) => ({name,cfg}));
  try { localStorage.setItem(SK_DYNAMIC, toJson(dyn)); } catch(e){}
}

// Remove abas excluídas do SHEET_CONFIG e do DOM (chamada após carregar estado)
function applyDeletedTabs() {
  for (const name of deletedTabs) {
    if (SHEET_CONFIG[name]) delete SHEET_CONFIG[name];
    [...document.querySelectorAll('.sal-tab[data-tab]')]
      .filter(b => b.dataset.tab === name)
      .forEach(b => b.remove());
  }
}

// Debounce para evitar muitas chamadas ao servidor durante edição
let _serverSaveTimer = null;
let _authReady        = false;
let _pendingServerSave= false;

function scheduleServerSave() {
  clearTimeout(_serverSaveTimer);
  _serverSaveTimer = setTimeout(() => {
    if (!_authReady) { _pendingServerSave = true; return; } // aguarda auth
    postSharedStateToServer();
  }, 800);
}

async function postSharedStateToServer() {
  if (!csrfToken) return;
  try {
    const state = {
      overrides: _ovForSave(),
      hiddenTabs: [...hiddenTabs],
      deletedTabs: [...deletedTabs],
      dynamicTabs: Object.entries(SHEET_CONFIG).filter(([,c])=>c.isDynamic).map(([name,cfg])=>({name,cfg})),
      paramAdmins,
      customPresets,
    };
    await fetch('/api/calculo-salario/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: toJson(state),
    });
  } catch(e) { /* melhor esforço */ }
}

// Carrega estado compartilhado do servidor (sobrescreve localStorage)
async function loadSharedStateFromServer() {
  try {
    const resp = await fetch('/api/calculo-salario/state');
    if (!resp.ok) return;
    const text = await resp.text();
    if (!text || text.trim() === '{}' || text.trim() === '') return;
    const state = fromJson(text);
    if (state.overrides)      { userOverrides = state.overrides;                                           saveOverrides(); }
    if (state.hiddenTabs)     { hiddenTabs = new Set(state.hiddenTabs);                                   saveHiddenTabs(); }
    if (state.deletedTabs)    { deletedTabs = new Set([...deletedTabs, ...state.deletedTabs]);            saveDeletedTabs(); }
    if (state.paramAdmins)    { paramAdmins = state.paramAdmins;                                          saveParamAdmins(); }
    if (state.customPresets)  { customPresets = state.customPresets;                                      saveCustomPresets(); }
    if (state.dynamicTabs) {
      // Adiciona abas que não existem localmente
      for (const {name,cfg} of state.dynamicTabs) {
        if (!SHEET_CONFIG[name]) { SHEET_CONFIG[name]=cfg; addTabButton(name,true); }
      }
      // Remove abas dinâmicas que foram excluídas no servidor
      const serverDynNames = new Set(state.dynamicTabs.map(({name}) => name));
      for (const [tabName, cfg] of Object.entries(SHEET_CONFIG)) {
        if (cfg.isDynamic && !serverDynNames.has(tabName)) {
          delete SHEET_CONFIG[tabName];
          document.querySelectorAll('.sal-tab[data-tab]').forEach(b => { if (b.dataset.tab === tabName) b.remove(); });
        }
      }
      try { localStorage.setItem(SK_DYNAMIC, toJson(state.dynamicTabs)); } catch(e){}
    }
  } catch(e) { /* fallback para localStorage */ }
}

// Salva estado compartilhado: localStorage imediato + servidor assíncrono
function saveSharedState() {
  saveOverrides(); saveHiddenTabs(); saveDeletedTabs(); saveDynamicTabs(); saveParamAdmins(); saveCustomPresets();
  scheduleServerSave();
}

function loadFromStorage() {
  try { const r=localStorage.getItem(SK_OVERRIDES); if(r) userOverrides=fromJson(r); } catch(e){ userOverrides={}; }
  try { const r=localStorage.getItem(SK_HIDDEN);    if(r) hiddenTabs=new Set(JSON.parse(r)); } catch(e){}
  try { const r=localStorage.getItem(SK_DELETED);   if(r) deletedTabs=new Set(JSON.parse(r)); } catch(e){}
  try { const r=localStorage.getItem(SK_ACKED);     if(r) acknowledgedWarnings=new Set(JSON.parse(r)); } catch(e){}
  try { const r=localStorage.getItem(SK_ADMINS);    if(r) paramAdmins=JSON.parse(r); } catch(e){}
  try { const r=localStorage.getItem(SK_PRESETS);   if(r) customPresets=fromJson(r); } catch(e){}
}

function loadDynamicTabs() {
  try {
    const raw = localStorage.getItem(SK_DYNAMIC); if(!raw) return;
    for (const {name,cfg} of fromJson(raw)) {
      if (!SHEET_CONFIG[name]) { SHEET_CONFIG[name]=cfg; addTabButton(name,true); }
    }
  } catch(e){}
}

// ---------------------------------------------------------------------------
// Controle de acesso — parâmetros avançados
// ---------------------------------------------------------------------------
function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isParamAdmin() {
  if (String(currentUser?.role || '').toUpperCase() === 'ADMIN') return true;
  const currentEmail = normalizeEmail(currentUser?.email);
  if (!currentEmail) return false;
  return paramAdmins.map(normalizeEmail).includes(currentEmail);
}

async function initUser() {
  try {
    const ctx = await AuthClient.getAuthContext();
    currentUser = ctx?.user ?? null;
    csrfToken   = ctx?.csrfToken ?? null;
  } catch(e) { currentUser = null; csrfToken = null; }
  _authReady = true;
  if (_pendingServerSave) { _pendingServerSave = false; postSharedStateToServer(); }
  updateAdminUI();
}

function updateAdminUI() {
  const cfg   = SHEET_CONFIG[currentTab];
  const isCLT = cfg?.type === 'clt' || cfg?.type === 'prolabore';
  const btnP  = document.getElementById('btnParams');
  if (btnP) {
    btnP.style.display = isCLT ? '' : 'none';
    btnP.title = isParamAdmin()
      ? 'Parâmetros avançados (edição liberada)'
      : 'Parâmetros avançados (somente visualização)';
  }
}

// ---------------------------------------------------------------------------
// Overrides — clone e merge
// ---------------------------------------------------------------------------
function deepCloneCfg(cfg) {
  const c = { ...cfg };
  if (cfg.inss)     { c.inss     = { ...cfg.inss };   if(cfg.inss.bands)  c.inss.bands  = cfg.inss.bands.map(b=>({...b})); }
  if (cfg.irrf)     { c.irrf     = { ...cfg.irrf };   if(cfg.irrf.bands)  c.irrf.bands  = cfg.irrf.bands.map(b=>({...b})); }
  if (cfg.params)   c.params   = { ...cfg.params };
  if (cfg.dsr)      c.dsr      = { ...cfg.dsr };
  if (cfg.defaults) c.defaults = { ...cfg.defaults };
  return c;
}

function getEffectiveCfg(tab) {
  const base = SHEET_CONFIG[tab]; if(!base) return null;
  const cfg  = deepCloneCfg(base);
  const ov   = userOverrides[tab] || {};
  if (ov.params    && cfg.params) Object.assign(cfg.params, ov.params);
  if (ov.inssBands && cfg.inss)   cfg.inss.bands = ov.inssBands.map(b=>({...b}));
  if (ov.inssMax   !== undefined && cfg.inss) cfg.inss.max          = ov.inssMax;
  if (ov.inssFlat  !== undefined && cfg.inss) cfg.inss.aliquotaFlat = ov.inssFlat;
  if (ov.irrfBands && cfg.irrf)   cfg.irrf.bands = ov.irrfBands.map(b=>({...b}));
  if (ov.dsr && cfg.dsr) Object.assign(cfg.dsr, ov.dsr);
  return cfg;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function r2(v)     { return Math.round(v*100)/100; }
function fmtBRL(v) { return (!isFinite(v)||isNaN(v))?'R$ —':v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function fmtPct(v) { return (!isFinite(v)||isNaN(v))?'—%':v.toFixed(1).replace('.',',')+('%'); }
function getNum(id){ const el=document.getElementById(id); if(!el) return 0; const v=parseFloat(String(el.value).replace(',','.')); return isFinite(v)?v:0; }
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function parseHHMM(str) {
  const s = String(str||'').trim(); if(!s) return {h:0,m:0};
  if (s.includes(':')) { const [l,r]=s.split(':',2); return {h:Math.max(0,parseInt(l,10)||0),m:Math.max(0,Math.min(59,parseInt(r,10)||0))}; }
  const n=s.replace(/\D/g,''); if(!n) return {h:0,m:0};
  if (n.length<=2) return {h:parseInt(n,10),m:0};
  const mc=parseInt(n.slice(-2),10);
  return mc>=60?{h:parseInt(n,10),m:0}:{h:parseInt(n.slice(0,-2),10),m:mc};
}
function formatHHMM(h,m){ return `${h}:${String(m).padStart(2,'0')}`; }
function getHHMM(id){ return parseHHMM(document.getElementById(id)?.value??''); }

const INPUT_BOUNDS = {
  numDep:{min:0,max:99},
  diasUteis:{min:1,max:31}, domingosFer:{min:0,max:31},
  diasTrab:{min:0,max:31}, diasMes:{min:1,max:31}, faltas:{min:0,max:31},
  o_diasTrab1:{min:0,max:31}, o_diasMes1:{min:1,max:31}, o_numDep1:{min:0,max:99},
  o_diasUteis1:{min:1,max:31}, o_domingosFer1:{min:0,max:31},
  o_diasTrab2:{min:0,max:31}, o_diasMes2:{min:1,max:31}, o_numDep2:{min:0,max:99},
};
function clampInput(id) {
  const el=document.getElementById(id),b=el&&INPUT_BOUNDS[id]; if(!b) return;
  const v=parseFloat(el.value); if(!isFinite(v)) return;
  if(v<b.min){el.value=b.min;flashError(el);}else if(v>b.max){el.value=b.max;flashError(el);}
}
function flashError(el){ el.classList.add('sal-input-error'); setTimeout(()=>el.classList.remove('sal-input-error'),1400); }

// ---------------------------------------------------------------------------
// INSS / IRRF engines
// ---------------------------------------------------------------------------
function calcINSS(base, cfg) {
  if (base<=0) return 0;
  const ic=cfg.inss; let inss;
  if (ic.flat) { inss=base*ic.aliquotaFlat; }
  else { inss=0; let prev=0; for(const b of ic.bands){if(base<=prev)break; inss+=(Math.min(base,b.ate)-prev)*b.aliquota; prev=b.ate; if(base<=b.ate)break;} }
  const mx=(ic.max!==null&&ic.max!==undefined)?ic.max:calcINSSMax(ic.bands);
  return r2(Math.min(inss,mx));
}
function calcINSSMax(bands){ let max=0,prev=0; for(const b of bands){const top=isFinite(b.ate)?b.ate:prev;max+=(top-prev)*b.aliquota;prev=b.ate;if(!isFinite(b.ate))break;} return r2(max); }
function calcIRRFBracket(base, bands) {
  if (base<=0) return 0;
  for (let i=bands.length-1;i>=0;i--) { const pa=i===0?0:bands[i-1].ate; if(base>pa){return bands[i].aliquota===0?0:Math.max(0,r2(base*bands[i].aliquota-bands[i].deducao));} }
  return 0;
}

// ---------------------------------------------------------------------------
// Cálculo principal
// ---------------------------------------------------------------------------
function calcFolha(cfg, inputs) {
  const {salBase,diasTrab,diasMes,he50h,he50m,he100h,he100m,adcNoth,adcNotm,numDep,diasUteis,domingosFer,extraEarnings=[],extraDeductions=[],faltas=0,faltasDSR=true,adcNotDSR=false}=inputs;
  const valorDep=cfg.params?.valorPorDep??189.59, deducaoSimp=cfg.params?.deducaoSimplificada??564.8;
  const I3=salBase,I8=I3/220;
  const Q29=I8*1.5,Q30=I8*2.0,Q32=I8*0.2;
  const P29=Q29*(he50h+he50m/60),P30=Q30*(he100h+he100m/60),P32=Q32*(adcNoth+adcNotm/60);
  const H14=diasUteis!==undefined?diasUteis:cfg.dsr.diasUteis;
  const H15=domingosFer!==undefined?domingosFer:cfg.dsr.domingosFer;
  // adcNotDSR=false (padrão planilha): DSR apenas sobre HE; true: inclui Adic. Noturno (Súm. 60 TST)
  const P31=H14>0?((P29+P30+(adcNotDSR?P32:0))/H14)*H15:0;
  const I4=P29+P30+P31+P32;
  const I5=I3+I4;
  const E3=diasMes||30;
  // diasTrab = dias do período (proporcionalidade por contratação mid-month)
  // faltas = faltas injustificadas (reduzem a base antes de INSS/IRRF/FGTS)
  const diasTrabBase=diasTrab!==undefined?Math.min(Math.max(0,diasTrab),E3):E3;
  const faltasReflexo=faltasDSR&&H14>0?faltas*(1+H15/H14):faltas;
  const D3prop=Math.max(0,diasTrabBase-faltasReflexo);
  const F3=E3>0?(I5/E3)*D3prop:I5;
  // Desconto de faltas para exibição (já embutido em F3)
  const descontoFaltaDia=E3>0?(I5/E3)*faltas:0;
  const descontoFaltaDSR=faltasDSR&&H14>0?(I5/E3)*faltas*(H15/H14):0;
  // Proventos extras: separa os que entram nas bases dos que só somam ao líquido
  // affectsBase=true → entra em INSS/FGTS/IRRF; affectsDSR=true → gera DSR (ex: comissão)
  let extrasBase=0, dsrExtras=0, extrasNoBase=0;
  const extrasDetail=extraEarnings.map(e=>{
    const val=+e.value||0;
    const dsr=(e.flags?.affectsDSR&&H14>0)?val*(H15/H14):0;
    if(e.flags?.affectsBase){ extrasBase+=val; dsrExtras+=dsr; }
    else { extrasNoBase+=val; }
    return {...e, dsr};
  });
  const baseCalc=F3+extrasBase+dsrExtras;
  const P23=calcINSS(baseCalc,cfg),F5=P23;
  const P24=numDep*valorDep;
  const deducoesIRRF=extraDeductions.filter(d=>d.flags?.deductsIRRFBase).reduce((s,d)=>s+(+d.value||0),0);
  const Q22=baseCalc-P23-P24-deducoesIRRF;
  const O34=baseCalc-deducaoSimp;
  const Q34=calcIRRFBracket(O34,cfg.irrf.bands),Q35=calcIRRFBracket(Q22,cfg.irrf.bands);
  let F6=Math.min(Q34,Q35);
  if (cfg.irrf.specialRule==='folha2026') {
    const R10=cfg.params?.r10??0.133145,R11=cfg.params?.r11??978.62,limQ22=cfg.params?.limiteQ22??7350;
    const R14=Q22<limQ22?r2(R11-baseCalc*R10):0,R15=Math.min(Q34,Q35),R16=r2(R15-R14);
    F6=r2(R16>R15?R15:R16<10?0:R16);
  } else if (cfg.irrf.specialRule==='folha2025_2') {
    F6=F6<10?0:r2(F6);
  }
  const F8=F3-F5-F6;
  const I10=baseCalc*(cfg.params?.fgtsRate??0.08);
  const totalExtraE=extrasBase+dsrExtras+extrasNoBase;
  const totalExtraD=extraDeductions.reduce((s,d)=>s+(+d.value||0),0);
  return {I8,F3,I4,I5,P23,F5,F6:r2(F6),P24,F8,I10,P29,P30,P31,P32,Q34:r2(Q34),Q35:r2(Q35),O34,Q22,totalExtraE,totalExtraD,extrasDetail,extraDeductions,baseCalc,faltas,descontoFaltaDia,descontoFaltaDSR,adcNotDSR};
}

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------
function setText(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }

function renderCLT(res) {
  setText('rValorHora',  fmtBRL(res.I8));  setText('rSalProp',    fmtBRL(res.F3));
  setText('rHorasTotal', fmtBRL(res.I4));  setText('rBaseINSS',   fmtBRL(res.baseCalc||res.F3));
  setText('rINSS',       fmtBRL(res.F5));  setText('rIRRF',       fmtBRL(res.F6));
  setText('rDeducaoDep', fmtBRL(res.P24)); setText('rFGTS',       fmtBRL(res.I10));

  // Faixa de valores por hora
  setText('rHoraCard', fmtBRL(res.I8));
  function showHoraCard(cardId, valId, rateId, total, rate) {
    const el = document.getElementById(cardId);
    if (!el) return;
    if (total > 0) {
      el.style.display = '';
      setText(valId, fmtBRL(r2(total)));
      if (rateId) setText(rateId, fmtBRL(r2(rate)) + '/h');
    } else { el.style.display = 'none'; }
  }
  showHoraCard('rHE50Card',  'rHE50CardVal',  'rHE50CardRate',  res.P29, res.I8*1.5);
  showHoraCard('rHE100Card', 'rHE100CardVal', 'rHE100CardRate', res.P30, res.I8*2.0);
  showHoraCard('rNotCard',   'rNotCardVal',   'rNotCardRate',   res.P32, res.I8*0.2);
  showHoraCard('rDSRCard',   'rDSRCardVal',   null,             res.P31, 0);
  // Faltas (informativo — já embutido no Sal. Proporcional via D3prop)
  const fRow=document.getElementById('rFaltasRow');
  if(fRow){
    if(res.faltas>0){
      fRow.style.display='';
      setText('rFaltasValor',fmtBRL(r2(res.descontoFaltaDia+res.descontoFaltaDSR)));
      const dsrLabel=res.descontoFaltaDSR>0?` + DSR: ${fmtBRL(r2(res.descontoFaltaDSR))}`:'';
      setText('rFaltasDetalhe',`${res.faltas} dia(s) — dia: ${fmtBRL(r2(res.descontoFaltaDia))}${dsrLabel} (incluso no Sal. Prop.)`);
    } else { fRow.style.display='none'; }
  }
  // Líquido = F8 (faltas já em F3) + proventos extras − descontos
  const liquido=r2(res.F8+res.totalExtraE-res.totalExtraD);
  setText('rLiquido',fmtBRL(liquido));
  const dsrHELabel=res.adcNotDSR?'DSR(HE+Not)':'DSR(HE)';
  setText('rINSSDetalhe', res.I4>0?`HE50%: ${fmtBRL(res.P29)} · HE100%: ${fmtBRL(res.P30)} · Not%: ${fmtBRL(res.P32)} · ${dsrHELabel}: ${fmtBRL(res.P31)}`:'');
  setText('rIRRFDetalhe', `Q34: base ${fmtBRL(res.O34)} → ${fmtBRL(res.Q34)} · Q35: base ${fmtBRL(res.Q22)} → ${fmtBRL(res.Q35)}`);
  // KPI bar
  const bruto=r2(res.F3+res.totalExtraE);
  const totalDesc=r2(res.F5+res.F6+res.totalExtraD);
  const pct=bruto>0?(totalDesc/bruto)*100:0;
  setText('kpiBruto',    fmtBRL(bruto));
  setText('kpiDescontos', fmtBRL(totalDesc));
  setText('kpiPctDesc',   bruto>0?fmtPct(pct)+' do bruto':'—');
  setText('kpiLiquido',   fmtBRL(liquido));
  renderExtraInDetail(res.extrasDetail||[], res.extraDeductions);
}

function renderExtraInDetail(earnings, deductions) {
  const grid=document.getElementById('detalhamentoGrid'); if(!grid) return;
  // Remove previously injected extra items
  grid.querySelectorAll('[data-extra]').forEach(el=>el.remove());
  const eItems=earnings.filter(e=>+e.value>0);
  const dItems=deductions.filter(d=>+d.value>0);
  if(!eItems.length&&!dItems.length) return;
  function makeItem(label, value, cls) {
    const d=document.createElement('div');
    d.className='sal-result-item'; d.dataset.extra='1';
    d.innerHTML=`<span class="sal-result-label">${escHtml(label)}</span><span class="sal-result-value ${cls}">${fmtBRL(value)}</span>`;
    return d;
  }
  for(const e of eItems){
    grid.appendChild(makeItem(`(+) ${e.label||'Provento'}`, +e.value, 'positivo'));
    if(e.dsr>0) grid.appendChild(makeItem(`(+) DSR ${e.label||'Provento'}`, r2(e.dsr), 'positivo'));
  }
  for(const d of dItems){
    grid.appendChild(makeItem(`(−) ${d.label||'Desconto'}`, +d.value, 'desconto'));
  }
}

// ---------------------------------------------------------------------------
// Eventos adicionais (proventos / descontos)
// ---------------------------------------------------------------------------

// Presets padrão (builtins) — não são deletáveis, apenas editáveis/sobrescrevíveis pelo admin
const PRESET_DEFAULTS_EARNING = [
  {key:'comissao',  label:'Comissão',               flags:{affectsBase:true,  affectsDSR:true}},
  {key:'insalub',   label:'Insalubridade',           flags:{affectsBase:true,  affectsDSR:false}},
  {key:'pericul',   label:'Periculosidade',          flags:{affectsBase:true,  affectsDSR:false}},
  {key:'gratif',    label:'Gratificação',             flags:{affectsBase:true,  affectsDSR:false}},
  {key:'adicional', label:'Adicional (sem imposto)', flags:{affectsBase:false, affectsDSR:false}},
  {key:'ajuda',     label:'Ajuda de Custo',          flags:{affectsBase:false, affectsDSR:false}},
];
const PRESET_DEFAULTS_DEDUCTION = [
  {key:'pensao',     label:'Pensão Alimentícia',  flags:{deductsIRRFBase:true}},
  {key:'planosaude', label:'Plano de Saúde',       flags:{deductsIRRFBase:true}},
  {key:'vt',         label:'Vale Transporte',      flags:{deductsIRRFBase:false}},
  {key:'va',         label:'Vale Alimentação',     flags:{deductsIRRFBase:false}},
  {key:'farmacia',   label:'Farmácia',             flags:{deductsIRRFBase:false}},
  {key:'adiant',     label:'Adiantamento',         flags:{deductsIRRFBase:false}},
  {key:'emprest',    label:'Empréstimo',           flags:{deductsIRRFBase:false}},
  {key:'sindical',   label:'Sind./Assistencial',   flags:{deductsIRRFBase:false}},
  {key:'desconto',   label:'Desconto',             flags:{deductsIRRFBase:false}},
];

function presetTag(type, flags) {
  if (type === 'earning') {
    if (flags?.affectsBase && flags?.affectsDSR) return 'INSS/FGTS+DSR';
    if (flags?.affectsBase) return 'INSS/FGTS';
    return 'só líquido';
  }
  return flags?.deductsIRRFBase ? 'deduz IRRF' : '';
}

function mergePresets(type, custom) {
  const defaults = type === 'earning' ? PRESET_DEFAULTS_EARNING : PRESET_DEFAULTS_DEDUCTION;
  const customList = (custom && custom[type]) || [];
  const merged = defaults.map(d => {
    const ov = customList.find(c => c.key === d.key);
    return ov ? { ...d, ...ov, _builtin: true } : { ...d, _builtin: true };
  });
  const defaultKeys = new Set(defaults.map(d => d.key));
  for (const cp of customList) {
    if (!defaultKeys.has(cp.key)) merged.push({ ...cp, _builtin: false });
  }
  return merged;
}

function getEffectivePresets(type) { return mergePresets(type, customPresets); }

let _extraDropdown = null;

function getExtraArray(tab, type) {
  if(!userOverrides[tab]) userOverrides[tab]={};
  const key = type==='earning' ? 'extraEarnings' : 'extraDeductions';
  if(!userOverrides[tab][key]) userOverrides[tab][key]=[];
  return userOverrides[tab][key];
}

function addExtraItem(tab, type, presetKey) {
  const presets = getEffectivePresets(type);
  const preset  = presets.find(p=>p.key===presetKey) || presets[0];
  getExtraArray(tab,type).push({label:preset.label, value:0, preset:presetKey, flags:{...(preset.flags||{})}});
  saveSharedState(); renderExtraEvents(tab); recalcCLT();
}

function openExtraDropdown(tab, type, anchorEl) {
  closeExtraDropdown();
  const presets = getEffectivePresets(type);
  const drop = document.createElement('div');
  drop.className = 'sal-extra-dropdown';
  drop.style.cssText = 'position:fixed;z-index:9999;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);padding:6px 0;min-width:190px';
  presets.forEach(p => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:7px 14px;cursor:pointer;font-size:12px;color:#334155;display:flex;justify-content:space-between;align-items:center;gap:8px';
    const tag = presetTag(type, p.flags);
    item.innerHTML = `<span>${p.label}</span>${tag?`<span style="font-size:10px;color:#94a3b8">${tag}</span>`:''}`;
    item.onmouseenter = () => item.style.background = '#f1f5f9';
    item.onmouseleave = () => item.style.background = '';
    item.onmousedown  = e => { e.preventDefault(); closeExtraDropdown(); addExtraItem(tab, type, p.key); };
    drop.appendChild(item);
  });
  const rect = anchorEl.getBoundingClientRect();
  drop.style.top  = (rect.bottom + 4) + 'px';
  drop.style.left = rect.left + 'px';
  document.body.appendChild(drop);
  _extraDropdown = drop;
}

function closeExtraDropdown() {
  if (_extraDropdown) { _extraDropdown.remove(); _extraDropdown = null; }
}

function renderExtraEvents(tab) {
  const list = document.getElementById('salExtraList'); if (!list) return;
  const earns = (userOverrides[tab]?.extraEarnings  ?? []);
  const deds  = (userOverrides[tab]?.extraDeductions ?? []);
  let html = '';

  const effEarning = getEffectivePresets('earning');
  const effDeduction = getEffectivePresets('deduction');

  earns.forEach((e, i) => {
    const effFlags = e.preset ? (effEarning.find(p=>p.key===e.preset)?.flags ?? e.flags) : e.flags;
    const tag = presetTag('earning', effFlags);
    html += `<div class="sal-extra-item">
      <span class="sal-extra-badge earning">+</span>
      <input type="text" class="auth-input sal-extra-label" data-et="earning" data-ei="${i}" placeholder="Descrição" value="${escHtml(e.label||'')}" style="min-width:0" />
      <input type="number" step="0.01" min="0" class="auth-input sal-extra-value" data-et="earning" data-ei="${i}" placeholder="0,00" value="${e.value||''}" style="width:74px" />
      <span style="font-size:10px;color:#94a3b8;white-space:nowrap">${tag}</span>
      <button type="button" class="sal-extra-remove" data-et="earning" data-ei="${i}" title="Remover">✕</button>
    </div>`;
  });

  deds.forEach((d, i) => {
    const effFlags = d.preset ? (effDeduction.find(p=>p.key===d.preset)?.flags ?? d.flags) : d.flags;
    const tag = presetTag('deduction', effFlags);
    html += `<div class="sal-extra-item">
      <span class="sal-extra-badge deduction">−</span>
      <input type="text" class="auth-input sal-extra-label" data-et="deduction" data-ei="${i}" placeholder="Descrição" value="${escHtml(d.label||'')}" style="min-width:0" />
      <input type="number" step="0.01" min="0" class="auth-input sal-extra-value" data-et="deduction" data-ei="${i}" placeholder="0,00" value="${d.value||''}" style="width:74px" />
      ${tag?`<span style="font-size:10px;color:#94a3b8;white-space:nowrap">${tag}</span>`:''}
      <button type="button" class="sal-extra-remove" data-et="deduction" data-ei="${i}" title="Remover">✕</button>
    </div>`;
  });

  list.innerHTML = html;

  list.querySelectorAll('.sal-extra-label').forEach(el => {
    el.addEventListener('input', () => {
      const arr = getExtraArray(tab, el.dataset.et);
      if (arr[+el.dataset.ei]) arr[+el.dataset.ei].label = el.value;
      saveSharedState(); recalcCLT();
    });
  });
  list.querySelectorAll('.sal-extra-value').forEach(el => {
    el.addEventListener('input', () => {
      const arr = getExtraArray(tab, el.dataset.et);
      if (arr[+el.dataset.ei]) arr[+el.dataset.ei].value = parseFloat(el.value) || 0;
      saveSharedState(); recalcCLT();
    });
  });
  list.querySelectorAll('.sal-extra-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      getExtraArray(tab, btn.dataset.et).splice(+btn.dataset.ei, 1);
      saveSharedState(); renderExtraEvents(tab); recalcCLT();
    });
  });
}

// ---------------------------------------------------------------------------
// Modal — Parâmetros avançados (acesso restrito a admins)
// ---------------------------------------------------------------------------
const PARAM_META = {
  fgtsRate:            {label:'Taxa FGTS (ex: 0.08 = 8%)',     step:'0.001',    min:0},
  valorPorDep:         {label:'Valor por dependente (R$)',      step:'0.01',     min:0},
  deducaoSimplificada: {label:'Dedução simplificada IRRF (R$)', step:'0.01',     min:0},
  r10:                 {label:'Coeficiente R10 (FOLHA 2026)',   step:'0.000001', min:0},
  r11:                 {label:'Limite R11 — R$ (FOLHA 2026)',   step:'0.01',     min:0},
  limiteQ22:           {label:'Limite Q22 — R$ (FOLHA 2026)',   step:'1',        min:0},
};

function openParamsModal(tab) {
  const cfg=getEffectiveCfg(tab); if(!cfg?.params) return;
  const canEdit = isParamAdmin();
  _pm.tab   = tab;
  _pm.dirty = false;
  _pm.pending = deepCloneOv(userOverrides[tab] || {});
  _pm.pendingPresets = deepCloneOv(customPresets);
  document.getElementById('paramsModalTitle').textContent = canEdit
    ? `Parâmetros avançados — ${tab}`
    : `Parâmetros avançados — ${tab} (somente visualização)`;
  const saveBtn = document.getElementById('btnSaveParamsModal');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.style.display = canEdit ? '' : 'none';
  }
  setText('paramsSaveStatus', canEdit ? '' : 'Visualização somente leitura.');
  buildParamsModalContent(tab, cfg, canEdit);
  document.getElementById('paramsModal').showModal();
}

function getProlaboreInssRate(cfg, pending) {
  if (pending.inssFlat !== undefined) return pending.inssFlat;
  if (cfg.inss?.flat) return cfg.inss.aliquotaFlat ?? 0.11;
  const bands = pending.inssBands || cfg.inss?.bands || [];
  if (!bands.length) return 0.11;
  return bands[0]?.aliquota ?? 0.11;
}

function buildParamsModalContent(tab, cfg, canEdit = isParamAdmin()) {
  const body=document.getElementById('paramsModalBody'); if(!body) return;
  const pov=_pm.pending;
  let html='';
  const isProlabore = cfg.type === 'prolabore';

  if (!canEdit) {
    html += '<div class="sal-tabmgr-note" style="margin-bottom:14px;color:#475569;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px">Seu usuário pode visualizar os parâmetros avançados, mas não pode alterá-los.</div>';
  }

  // Dias trabalhados / Dias do mês
  const diasTrab = pov.diasTrab ?? 30;
  const diasMes  = pov.diasMes  ?? 30;
  html+=`<div class="sal-section-title" style="margin-top:0">Proporcionalidade</div>
  <div class="sal-advanced-grid">
    <label class="auth-label">Dias Trabalhados
      <input class="auth-input" type="number" step="1" min="0" max="31" id="pmDiasTrab" value="${diasTrab}" /></label>
    <label class="auth-label">Dias do Mês
      <input class="auth-input" type="number" step="1" min="1" max="31" id="pmDiasMes" value="${diasMes}" /></label>
  </div>`;

  // DSR padrão
  const dsrUteis = (pov.dsr?.diasUteis  ?? cfg.dsr?.diasUteis  ?? 24);
  const dsrDom   = (pov.dsr?.domingosFer?? cfg.dsr?.domingosFer??  6);
  html+=`<div class="sal-section-title">DSR — Dias Úteis / Domingos Padrão</div>
  <div class="sal-advanced-grid">
    <label class="auth-label">Dias Úteis padrão
      <input class="auth-input" type="number" step="1" min="1" max="31" id="pmDiasUteis" value="${dsrUteis}" /></label>
    <label class="auth-label">Domingos/Feriados padrão
      <input class="auth-input" type="number" step="1" min="0" max="15" id="pmDomingosFer" value="${dsrDom}" /></label>
  </div>`;

  // Parâmetros gerais
  html+=`<div class="sal-section-title">Parâmetros Gerais</div><div class="sal-advanced-grid">`;
  const pKeys=['fgtsRate','valorPorDep','deducaoSimplificada'];
  if (cfg.irrf?.specialRule==='folha2026') pKeys.push('r10','r11','limiteQ22');
  for(const key of pKeys){
    const meta=PARAM_META[key]; if(!meta) continue;
    const val=(pov.params?.[key] ?? cfg.params?.[key] ?? '');
    const mod=(pov.params?.[key]!==undefined);
    html+=`<label class="auth-label${mod?' sal-param-modified':''}">
      ${meta.label}${mod?' <span class="sal-param-badge">editado</span>':''}
      <input class="auth-input" type="number" data-param-key="${key}" step="${meta.step}" min="${meta.min}" value="${val}" /></label>`;
  }
  html+='</div>';

  // Tabela INSS (faixas progressivas — CLT)
  if (cfg.inss?.bands?.length>0 && !isProlabore) {
    const modINSS=(pov.inssBands!==undefined);
    html+=`<div class="sal-section-title">Tabela INSS${modINSS?' <span class="sal-param-badge">editada</span>':''}</div>`;
    html+='<table class="sal-band-table"><thead><tr><th>#</th><th>Limite (até R$)</th><th>Alíquota (%)</th></tr></thead><tbody>';
    cfg.inss.bands.forEach((band,i)=>{
      const av=isFinite(band.ate)?band.ate:'', dis=!isFinite(band.ate)?'disabled':'';
      html+=`<tr><td class="sal-band-idx">${i+1}</td>
        <td><input type="number" step="0.01" min="0" data-inss-ate="${i}" value="${av}" placeholder="∞" ${dis} /></td>
        <td><input type="number" step="0.0001" min="0" max="100" data-inss-aliq="${i}" value="${(band.aliquota*100).toFixed(4)}" /></td></tr>`;
    });
    html+='</tbody></table>';
  }
  // Pró-labore: exibe sempre a alíquota única e o teto do INSS.
  if (isProlabore && cfg.inss) {
    const modRate=(pov.inssFlat!==undefined || pov.inssBands!==undefined);
    const rateVal=getProlaboreInssRate(cfg, pov);
    html+=`<div class="sal-section-title">INSS do Pró-labore${modRate?' <span class="sal-param-badge">editado</span>':''}</div>`;
    html+=`<div class="sal-advanced-grid">
      <label class="auth-label${modRate?' sal-param-modified':''}">
        Percentual INSS (ex: 0.11 = 11%)${modRate?' <span class="sal-param-badge">editado</span>':''}
        <input class="auth-input" type="number" step="0.0001" min="0" max="1" id="inssRateInput" value="${rateVal}" /></label>`;
    if (cfg.inss.max!==null&&cfg.inss.max!==undefined) {
      const modMax=(pov.inssMax!==undefined);
      html+=`<label class="auth-label${modMax?' sal-param-modified':''}">
        Teto INSS (R$)${modMax?' <span class="sal-param-badge">editado</span>':''}
        <input class="auth-input" type="number" step="0.01" min="0" id="inssMaxInput" value="${pov.inssMax ?? cfg.inss.max}" /></label>`;
    }
    html+='</div>';
  } else if (cfg.inss?.flat) {
    const modFlat=(pov.inssFlat!==undefined);
    const flatVal=(pov.inssFlat ?? cfg.inss.aliquotaFlat ?? 0.11);
    html+=`<div class="sal-advanced-grid" style="margin-top:8px">
      <label class="auth-label${modFlat?' sal-param-modified':''}">
        Alíquota INSS (ex: 0.11 = 11%)${modFlat?' <span class="sal-param-badge">editado</span>':''}
        <input class="auth-input" type="number" step="0.0001" min="0" max="1" id="inssRateInput" value="${flatVal}" /></label>`;
    if (cfg.inss.max!==null&&cfg.inss.max!==undefined) {
      const modMax=(pov.inssMax!==undefined);
      html+=`<label class="auth-label${modMax?' sal-param-modified':''}">
        Teto INSS (R$)${modMax?' <span class="sal-param-badge">editado</span>':''}
        <input class="auth-input" type="number" step="0.01" min="0" id="inssMaxInput" value="${pov.inssMax ?? cfg.inss.max}" /></label>`;
    }
    html+='</div>';
  } else if (cfg.inss?.max!==null&&cfg.inss?.max!==undefined) {
    const modMax=(pov.inssMax!==undefined);
    html+=`<label class="auth-label${modMax?' sal-param-modified':''}" style="margin-top:8px;max-width:240px">
      Teto INSS (R$)${modMax?' <span class="sal-param-badge">editado</span>':''}
      <input class="auth-input" type="number" step="0.01" min="0" id="inssMaxInput" value="${pov.inssMax ?? cfg.inss.max}" /></label>`;
  }

  // Tabela IRRF
  if (cfg.irrf?.bands?.length>0) {
    const modIRRF=(pov.irrfBands!==undefined);
    html+=`<div class="sal-section-title">Tabela IRRF${modIRRF?' <span class="sal-param-badge">editada</span>':''}</div>`;
    html+='<table class="sal-band-table"><thead><tr><th>#</th><th>Limite (até R$)</th><th>Alíquota (%)</th><th>Dedução (R$)</th></tr></thead><tbody>';
    cfg.irrf.bands.forEach((band,i)=>{
      const av=isFinite(band.ate)?band.ate:'', dis=!isFinite(band.ate)?'disabled':'';
      html+=`<tr><td class="sal-band-idx">${i+1}</td>
        <td><input type="number" step="0.01" min="0" data-irrf-ate="${i}" value="${av}" placeholder="∞" ${dis} /></td>
        <td><input type="number" step="0.0001" min="0" max="100" data-irrf-aliq="${i}" value="${(band.aliquota*100).toFixed(4)}" /></td>
        <td><input type="number" step="0.01" min="0" data-irrf-ded="${i}" value="${band.deducao}" /></td></tr>`;
    });
    html+='</tbody></table>';
  }

  html+=`<div style="margin-top:18px"><button class="btn btn-secondary" type="button" id="btnRestaurarParamsModal">Restaurar padrões da planilha</button></div>`;

  if (canEdit) {
    html+=`
    <hr style="margin:20px 0 14px;border:none;border-top:1px solid #e2e8f0">
    <div class="sal-section-title" style="margin-top:0">Presets de Proventos / Descontos</div>
    <div style="font-size:11px;color:#64748b;margin-bottom:10px">Estes presets aparecem no dropdown &quot;+ Provento&quot; / &quot;+ Desconto&quot; e definem quais bases (INSS, FGTS, IRRF) cada item afeta.</div>

    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Proventos</div>
      <div id="pmPresetsEarning"></div>
      <button class="btn btn-secondary" style="font-size:11px;padding:4px 12px;margin-top:6px" type="button" id="pmAddEarningPreset">+ Novo provento</button>
    </div>

    <div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Descontos</div>
      <div id="pmPresetsDeduction"></div>
      <button class="btn btn-secondary" style="font-size:11px;padding:4px 12px;margin-top:6px" type="button" id="pmAddDeductionPreset">+ Novo desconto</button>
    </div>

    <div><button class="btn btn-secondary" style="font-size:11px;padding:4px 12px" type="button" id="pmRestorePresets">↩ Restaurar presets padrão</button></div>`;
  }

  body.innerHTML=html;

  if (!canEdit) {
    body.querySelectorAll('input, button').forEach(el => {
      el.disabled = true;
    });
    return;
  }

  function setDirty() {
    _pm.dirty=true;
    const btn=document.getElementById('btnSaveParamsModal');
    if(btn) btn.disabled=false;
    setText('paramsSaveStatus','');
  }

  // Proporcionalidade
  body.querySelector('#pmDiasTrab')?.addEventListener('input',e=>{
    const v=parseInt(e.target.value); if(!isFinite(v)) return;
    _pm.pending.diasTrab=v; setDirty();
  });
  body.querySelector('#pmDiasMes')?.addEventListener('input',e=>{
    const v=parseInt(e.target.value); if(!isFinite(v)) return;
    _pm.pending.diasMes=v; setDirty();
  });

  // DSR padrão
  body.querySelector('#pmDiasUteis')?.addEventListener('input',e=>{
    const v=parseFloat(e.target.value); if(!isFinite(v)) return;
    if(!_pm.pending.dsr) _pm.pending.dsr={};
    _pm.pending.dsr.diasUteis=v; setDirty();
  });
  body.querySelector('#pmDomingosFer')?.addEventListener('input',e=>{
    const v=parseFloat(e.target.value); if(!isFinite(v)) return;
    if(!_pm.pending.dsr) _pm.pending.dsr={};
    _pm.pending.dsr.domingosFer=v; setDirty();
  });

  // Parâmetros gerais
  body.querySelectorAll('[data-param-key]').forEach(el=>{
    el.addEventListener('input',()=>{
      const v=parseFloat(el.value); if(!isFinite(v)) return;
      if(!_pm.pending.params) _pm.pending.params={};
      _pm.pending.params[el.dataset.paramKey]=v;
      el.closest('label')?.classList.add('sal-param-modified');
      setDirty();
    });
  });

  // INSS bands
  const colINSS=()=>cfg.inss.bands.map((ob,i)=>{
    const ae=body.querySelector(`[data-inss-ate="${i}"]`),aq=body.querySelector(`[data-inss-aliq="${i}"]`);
    return {ate:(!ae||ae.disabled)?Infinity:(parseFloat(ae.value)||ob.ate),aliquota:aq?(parseFloat(aq.value)||0)/100:ob.aliquota};
  });
  body.querySelectorAll('[data-inss-ate],[data-inss-aliq]').forEach(el=>{
    el.addEventListener('input',()=>{ _pm.pending.inssBands=colINSS(); setDirty(); });
  });
  body.querySelector('#inssRateInput')?.addEventListener('input',e=>{
    const v=parseFloat(e.target.value); if(!isFinite(v)) return;
    if (cfg.inss?.flat) {
      _pm.pending.inssFlat=v;
    } else if (cfg.inss?.bands?.length) {
      const sourceBands=_pm.pending.inssBands || cfg.inss.bands;
      _pm.pending.inssBands=sourceBands.map(b=>({ ...b, aliquota: v }));
    }
    setDirty();
  });
  body.querySelector('#inssMaxInput')?.addEventListener('input',e=>{
    const v=parseFloat(e.target.value); if(!isFinite(v)) return;
    _pm.pending.inssMax=v; setDirty();
  });

  // IRRF bands
  const colIRRF=()=>cfg.irrf.bands.map((ob,i)=>{
    const ae=body.querySelector(`[data-irrf-ate="${i}"]`),aq=body.querySelector(`[data-irrf-aliq="${i}"]`),de=body.querySelector(`[data-irrf-ded="${i}"]`);
    return {ate:(!ae||ae.disabled)?Infinity:(parseFloat(ae.value)||ob.ate),aliquota:aq?(parseFloat(aq.value)||0)/100:ob.aliquota,deducao:de?(parseFloat(de.value)||0):ob.deducao};
  });
  body.querySelectorAll('[data-irrf-ate],[data-irrf-aliq],[data-irrf-ded]').forEach(el=>{
    el.addEventListener('input',()=>{ _pm.pending.irrfBands=colIRRF(); setDirty(); });
  });

  // Restaurar padrões (parâmetros de aba)
  body.querySelector('#btnRestaurarParamsModal')?.addEventListener('click',()=>{
    const baseCfg = SHEET_CONFIG[tab] || cfg;
    _pm.pending = {};
    if (baseCfg?.dsr) _pm.pending.dsr = { diasUteis: baseCfg.dsr.diasUteis, domingosFer: baseCfg.dsr.domingosFer };
    setDirty();
    buildParamsModalContent(tab, baseCfg, true);
  });

  // ── Gerenciador de Presets ─────────────────────────────────────────────────
  function renderPresetRows(type) {
    const container = body.querySelector(type==='earning' ? '#pmPresetsEarning' : '#pmPresetsDeduction');
    if (!container) return;
    const presets = mergePresets(type, _pm.pendingPresets);
    const flagKeys = type==='earning' ? ['affectsBase','affectsDSR'] : ['deductsIRRFBase'];
    const flagLabels = { affectsBase:'INSS/FGTS', affectsDSR:'DSR', deductsIRRFBase:'Deduz IRRF' };

    container.innerHTML = presets.map((p, idx) => {
      const isBuiltin = p._builtin;
      const defaultP = (type==='earning' ? PRESET_DEFAULTS_EARNING : PRESET_DEFAULTS_DEDUCTION).find(d=>d.key===p.key);
      const isModified = isBuiltin && defaultP && (p.label !== defaultP.label || JSON.stringify(p.flags) !== JSON.stringify(defaultP.flags));
      const flagsHtml = flagKeys.map(f =>
        `<label style="font-size:11px;color:#475569;white-space:nowrap;display:flex;align-items:center;gap:3px;cursor:pointer">
          <input type="checkbox" data-pflag="${f}" data-pidx="${idx}" data-ptype="${type}" ${p.flags?.[f]?'checked':''}>
          ${flagLabels[f]}
        </label>`
      ).join('');
      const resetBtn = isModified
        ? `<button type="button" data-preset-reset="${idx}" data-ptype="${type}" title="Restaurar padrão" style="border:none;background:none;cursor:pointer;color:#f59e0b;font-size:14px;padding:2px 3px;line-height:1" tabindex="-1">↩</button>`
        : '';
      const delBtn = !isBuiltin
        ? `<button type="button" data-preset-del="${idx}" data-ptype="${type}" title="Excluir" style="border:none;background:none;cursor:pointer;color:#dc2626;font-size:13px;padding:2px 4px;line-height:1" tabindex="-1">✕</button>`
        : '';
      const builtinDot = isBuiltin
        ? `<span title="Preset padrão" style="font-size:9px;color:#94a3b8;margin-left:2px">●</span>`
        : '';
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #f1f5f9">
        <input type="text" class="auth-input" value="${escHtml(p.label)}" data-plabel="${idx}" data-ptype="${type}" style="flex:1;min-width:80px;font-size:12px;padding:3px 7px">
        ${flagsHtml}
        ${builtinDot}
        ${resetBtn}${delBtn}
      </div>`;
    }).join('');

    // Event listeners
    container.querySelectorAll('[data-plabel]').forEach(el => {
      el.addEventListener('input', () => {
        const idx = +el.dataset.plabel, t = el.dataset.ptype;
        _updatePendingPreset(t, idx, { label: el.value });
        // não re-renderiza durante digitação (perderia o cursor); só marca dirty
      });
      el.addEventListener('blur', () => {
        renderPresetRows(el.dataset.ptype); // re-render quando sair do campo
      });
    });
    container.querySelectorAll('[data-pflag]').forEach(el => {
      el.addEventListener('change', () => {
        const idx = +el.dataset.pidx, t = el.dataset.ptype, f = el.dataset.pflag;
        const current = mergePresets(t, _pm.pendingPresets)[idx];
        const newFlags = { ...(current.flags||{}), [f]: el.checked };
        _updatePendingPreset(t, idx, { flags: newFlags });
        renderPresetRows(t);
      });
    });
    container.querySelectorAll('[data-preset-reset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.presetReset, t = btn.dataset.ptype;
        const preset = mergePresets(t, _pm.pendingPresets)[idx];
        if (!preset._builtin) return;
        // Remove override from pendingPresets (restores to default)
        if (_pm.pendingPresets[t]) {
          _pm.pendingPresets[t] = _pm.pendingPresets[t].filter(c => c.key !== preset.key);
        }
        setDirty(); renderPresetRows(t);
      });
    });
    container.querySelectorAll('[data-preset-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.presetDel, t = btn.dataset.ptype;
        const preset = mergePresets(t, _pm.pendingPresets)[idx];
        if (preset._builtin) return;
        if (_pm.pendingPresets[t]) {
          _pm.pendingPresets[t] = _pm.pendingPresets[t].filter(c => c.key !== preset.key);
        }
        setDirty(); renderPresetRows(t);
      });
    });
  }

  function _updatePendingPreset(type, idx, changes) {
    if (!_pm.pendingPresets[type]) _pm.pendingPresets[type] = [];
    const preset = mergePresets(type, _pm.pendingPresets)[idx];
    const existing = _pm.pendingPresets[type].findIndex(c => c.key === preset.key);
    const updated = { ...preset, ...changes, key: preset.key };
    delete updated._builtin;
    if (existing >= 0) _pm.pendingPresets[type][existing] = updated;
    else _pm.pendingPresets[type].push(updated);
    setDirty();
  }

  renderPresetRows('earning');
  renderPresetRows('deduction');

  body.querySelector('#pmAddEarningPreset')?.addEventListener('click', () => {
    if (!_pm.pendingPresets.earning) _pm.pendingPresets.earning = [];
    _pm.pendingPresets.earning.push({ key: 'custom_' + Date.now(), label: 'Novo Provento', flags: { affectsBase: false, affectsDSR: false } });
    setDirty(); renderPresetRows('earning');
  });
  body.querySelector('#pmAddDeductionPreset')?.addEventListener('click', () => {
    if (!_pm.pendingPresets.deduction) _pm.pendingPresets.deduction = [];
    _pm.pendingPresets.deduction.push({ key: 'custom_' + Date.now(), label: 'Novo Desconto', flags: { deductsIRRFBase: false } });
    setDirty(); renderPresetRows('deduction');
  });
  body.querySelector('#pmRestorePresets')?.addEventListener('click', () => {
    if (!confirm('Restaurar todos os presets para os valores padrão?')) return;
    _pm.pendingPresets = { earning: [], deduction: [] };
    setDirty(); renderPresetRows('earning'); renderPresetRows('deduction');
  });
}

function tryCloseParamsModal() {
  if (_pm.dirty) {
    if (!confirm('Fechar sem salvar as alterações nos parâmetros?')) return;
  }
  _pm.dirty=false;
  document.getElementById('paramsModal').close();
}

// Mapeamento de abas que compartilham parâmetros por ano (Folha ↔ Pró-labore)
const YEAR_LINKED_TABS = {
  'FOLHA 2026':    ['PROLABORE 26'],
  'FOLHA 2025 (2)':['PROLABORE 25'],
  'FOLHA 2025':    ['PROLABORE'],
  'FOLHA 2024':    ['PROLABORE'],
  'PROLABORE 26':  ['FOLHA 2026'],
  'PROLABORE 25':  ['FOLHA 2025 (2)'],
  'PROLABORE':     ['FOLHA 2024', 'FOLHA 2025'],
};

function ensureTabOverride(tab) {
  if (!userOverrides[tab]) userOverrides[tab] = {};
  return userOverrides[tab];
}

function syncOverrideValue(target, key, value, clone = (v) => v) {
  if (value === undefined) {
    delete target[key];
    return;
  }
  target[key] = clone(value);
}

function syncNestedOverrideValue(target, key, nestedKeys, sourceValue) {
  if (!sourceValue || typeof sourceValue !== 'object') {
    delete target[key];
    return;
  }
  const next = {};
  for (const nestedKey of nestedKeys) {
    if (sourceValue[nestedKey] !== undefined) next[nestedKey] = sourceValue[nestedKey];
  }
  if (Object.keys(next).length === 0) delete target[key];
  else target[key] = next;
}

function syncLinkedYearFields(sourceTab) {
  const linkedTabs = YEAR_LINKED_TABS[sourceTab] || [];
  if (!linkedTabs.length) return;
  const source = userOverrides[sourceTab] || {};

  for (const linkedTab of linkedTabs) {
    if (!SHEET_CONFIG[linkedTab] || linkedTab === sourceTab) continue;
    const target = ensureTabOverride(linkedTab);

    syncOverrideValue(target, 'diasTrab', source.diasTrab);
    syncOverrideValue(target, 'diasMes', source.diasMes);
    syncOverrideValue(target, 'faltas', source.faltas);
    syncOverrideValue(target, 'faltasDSR', source.faltasDSR);
    syncOverrideValue(target, 'adcNotDSR', source.adcNotDSR);
    syncNestedOverrideValue(target, 'dsr', ['diasUteis', 'domingosFer'], source.dsr);

    const sourceParams = source.params && typeof source.params === 'object' ? source.params : null;
    const nextParams = {};
    for (const paramKey of ['fgtsRate', 'valorPorDep', 'deducaoSimplificada']) {
      if (sourceParams?.[paramKey] !== undefined) nextParams[paramKey] = sourceParams[paramKey];
    }
    if (Object.keys(nextParams).length === 0) delete target.params;
    else target.params = { ...(target.params || {}), ...nextParams };

    if (target.params) {
      for (const paramKey of ['fgtsRate', 'valorPorDep', 'deducaoSimplificada']) {
        if (sourceParams?.[paramKey] === undefined) delete target.params[paramKey];
      }
      if (Object.keys(target.params).length === 0) delete target.params;
    }

    syncOverrideValue(target, 'inssMax', source.inssMax);
    syncOverrideValue(target, 'irrfBands', source.irrfBands, (bands) => bands.map((band) => ({ ...band })));

    if (Object.keys(target).length === 0) delete userOverrides[linkedTab];
  }
}

function saveParamsModal() {
  if (!_pm.dirty) return;
  userOverrides[_pm.tab]=_pm.pending;
  if (_pm.pendingPresets) { customPresets = _pm.pendingPresets; }
  syncLinkedYearFields(_pm.tab);
  saveSharedState();
  // Atualiza DSR visível na aba apenas se o usuário alterou explicitamente no modal
  // (não sobrescreve valores vindos de applyPeriodo ou _linkDiasUteis)
  if (_pm.tab===currentTab) {
    const dsrOv=(_pm.pending.dsr||{});
    const dU=document.getElementById('diasUteis'),dF=document.getElementById('domingosFer');
    if(dU && dsrOv.diasUteis   !== undefined) dU.value = dsrOv.diasUteis;
    if(dF && dsrOv.domingosFer !== undefined) dF.value = dsrOv.domingosFer;
  }
  renderExtraEvents(currentTab);
  recalcCLT();
  _pm.dirty=false;
  document.getElementById('btnSaveParamsModal').disabled=true;
  setText('paramsSaveStatus','✓ Salvo!');
  setTimeout(()=>{
    document.getElementById('paramsModal').close();
    setText('paramsSaveStatus','');
  }, 600);
}

// ---------------------------------------------------------------------------
// Gerenciamento de abas
// ---------------------------------------------------------------------------
function addTabButton(name, isDynamic) {
  const tabBar=document.getElementById('salTabs');
  const btn=document.createElement('button');
  btn.className='sal-tab'; btn.dataset.tab=name;
  btn.appendChild(document.createTextNode(name));
  tabBar.insertBefore(btn, tabBar.firstChild); // insere na primeira posição
}

function createNewTab(name, sourceTab) {
  if(SHEET_CONFIG[name]){alert(`Aba "${name}" já existe.`);return false;}
  const src=getEffectiveCfg(sourceTab); if(!src) return false;
  const cfg=deepCloneCfg(src); cfg.isDynamic=true; cfg.label=name; cfg.subtitle=sourceTab;
  SHEET_CONFIG[name]=cfg; addTabButton(name,true); saveSharedState();
  acknowledgedWarnings.delete(name); switchTab(name);
  return true;
}

function deleteTab(name) {
  if (!isParamAdmin()) return;
  const remaining = [...document.querySelectorAll('.sal-tab[data-tab]')]
    .filter(b => b.id !== 'btnNovaAba' && b.dataset.tab !== name);
  if (remaining.length === 0) { alert('Não é possível excluir a última aba.'); return; }

  // Abas dinâmicas: removidas totalmente. Abas estáticas: marcadas como excluídas para sobreviver ao reload.
  if (!SHEET_CONFIG[name]?.isDynamic) deletedTabs.add(name);
  else deletedTabs.delete(name);

  delete SHEET_CONFIG[name];
  delete userOverrides[name];
  hiddenTabs.delete(name);
  [...document.querySelectorAll('.sal-tab[data-tab]')].find(b=>b.dataset.tab===name)?.remove();
  saveSharedState();
  if (currentTab === name) {
    const fallback = remaining[0]?.dataset.tab ?? 'FOLHA 2026';
    switchTab(SHEET_CONFIG[fallback] ? fallback : Object.keys(SHEET_CONFIG)[0]);
  }
}

function toggleHideTab(name) {
  if(hiddenTabs.has(name)) hiddenTabs.delete(name); else hiddenTabs.add(name);
  saveSharedState(); applyHiddenTabs();
}

function applyHiddenTabs() {
  document.querySelectorAll('.sal-tab[data-tab]').forEach(btn=>{
    if(btn.id==='btnNovaAba') return;
    btn.style.display=hiddenTabs.has(btn.dataset.tab)?'none':'';
  });
  if(hiddenTabs.has(currentTab)){
    const first=[...document.querySelectorAll('.sal-tab[data-tab]')].find(b=>b.id!=='btnNovaAba'&&!hiddenTabs.has(b.dataset.tab));
    if(first) switchTab(first.dataset.tab);
  }
}

function openManageTabsModal(){ buildManageTabsList(); document.getElementById('manageTabsModal').showModal(); }

function buildManageTabsList() {
  const body=document.getElementById('manageTabsBody'); if(!body) return;
  const admin=isParamAdmin();
  const tabs=[...document.querySelectorAll('.sal-tab[data-tab]')]
    .filter(b=>b.id!=='btnNovaAba')
    .map(b=>({name:b.dataset.tab,isDynamic:!!SHEET_CONFIG[b.dataset.tab]?.isDynamic,hidden:hiddenTabs.has(b.dataset.tab)}));

  let html='<div class="sal-tabmgr-list">';
  for(const t of tabs){
    const badges=(t.isDynamic?' <span class="sal-param-badge">dinâmica</span>':'')+(t.hidden?' <span class="sal-param-badge" style="background:#e2e8f0;color:#64748b">oculta</span>':'');
    html+=`<div class="sal-tabmgr-item">
      <span class="sal-tabmgr-name${t.hidden?' sal-tabmgr-dimmed':''}">${t.name}${badges}</span>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px" type="button" data-mgr-hide="${t.name}">${t.hidden?'Mostrar':'Ocultar'}</button>
        ${admin?`<button class="btn sal-btn-danger" style="font-size:12px;padding:4px 12px" type="button" data-mgr-del="${t.name}">Excluir</button>`:''}
      </div>
    </div>`;
  }
  html+='</div>';

  if (admin) {
    const emptyMsg = paramAdmins.length===0
      ? '<p class="sal-tabmgr-note" style="color:#b45309;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:8px 12px;margin-bottom:10px">⚠ Nenhum e-mail liberado no momento. Apenas usuários com papel ADMIN conseguem editar os parâmetros avançados até que a lista seja preenchida.</p>'
      : '';
    html+=`<div class="sal-section-title" style="margin-top:20px">Controle de Acesso — Parâmetros Avançados</div>
    <p class="sal-tabmgr-note">Somente usuários ADMIN ou os e-mails listados poderão editar parâmetros avançados e excluir abas. Use o e-mail de login.</p>
    ${emptyMsg}
    <div class="sal-tabmgr-list" id="adminList">`;
    for(const email of paramAdmins){
      html+=`<div class="sal-tabmgr-item">
        <span class="sal-tabmgr-name">${escHtml(email)}</span>
        <button class="btn sal-btn-danger" style="font-size:12px;padding:4px 12px" type="button" data-mgr-rmadmin="${escHtml(email)}">Remover</button>
      </div>`;
    }
    html+=`</div>
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
      <input id="newAdminEmail" class="auth-input" type="email" placeholder="email@usuario.com" style="flex:1;margin:0" />
      <button class="btn btn-primary" style="font-size:12px;padding:6px 14px;white-space:nowrap" type="button" id="btnAddAdmin">Adicionar</button>
    </div>`;
    if(currentUser?.email){
      html+=`<p class="sal-tabmgr-note">Seu usuário atual: <strong>${escHtml(currentUser.email)}</strong></p>`;
    }
  }
  html+='<p class="sal-tabmgr-note">Abas ocultas não aparecem na barra, mas não perdem os dados. Apenas abas dinâmicas podem ser excluídas.</p>';
  body.innerHTML=html;

  body.querySelectorAll('[data-mgr-hide]').forEach(btn=>btn.addEventListener('click',()=>{toggleHideTab(btn.dataset.mgrHide);buildManageTabsList();}));
  body.querySelectorAll('[data-mgr-del]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(!confirm(`Excluir a aba "${btn.dataset.mgrDel}"?\nEsta ação não pode ser desfeita.`)) return;
      deleteTab(btn.dataset.mgrDel); buildManageTabsList();
    });
  });
  if(admin){
    body.querySelectorAll('[data-mgr-rmadmin]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        paramAdmins=paramAdmins.filter(e=>e!==btn.dataset.mgrRmadmin);
        saveSharedState(); buildManageTabsList(); updateAdminUI();
      });
    });
    body.querySelector('#btnAddAdmin')?.addEventListener('click',()=>{
      const inp=body.querySelector('#newAdminEmail'), em=normalizeEmail(inp?.value);
      if(!em||!em.includes('@')){flashError(inp);return;}
      if(!paramAdmins.map(normalizeEmail).includes(em)) paramAdmins.push(em);
      saveSharedState(); buildManageTabsList(); updateAdminUI();
      if(inp) inp.value='';
    });
  }
}

// ---------------------------------------------------------------------------
// Banner de aviso — nova aba
// ---------------------------------------------------------------------------
function updateNewTabWarning(tabName) {
  const el=document.getElementById('newTabWarning'); if(!el) return;
  const cfg=SHEET_CONFIG[tabName];
  if(cfg?.isDynamic&&!acknowledgedWarnings.has(tabName)){
    setText('newTabWarningSource', cfg.subtitle||'');
    el.style.display='';
  } else { el.style.display='none'; }
}

// ---------------------------------------------------------------------------
// Recalcular
// ---------------------------------------------------------------------------
let currentTab='FOLHA 2026';

function recalcCLT() {
  const cfg=getEffectiveCfg(currentTab);
  if(!cfg||(cfg.type!=='clt'&&cfg.type!=='prolabore')) return;
  const he50=getHHMM('he50'),he100=getHHMM('he100'),adcNot=getHHMM('adcNot');
  const ov=userOverrides[currentTab]||{};
  const diasTrabUI=getNum('diasTrab'); const diasMesUI=getNum('diasMes');
  const faltasDSREl=document.getElementById('faltasDSRCheckbox');
  const adcNotDSREl=document.getElementById('adcNotDSRCheckbox');
  const inputs={
    salBase:getNum('salBase'),
    diasTrab:diasTrabUI>0?diasTrabUI:(ov.diasTrab??30),
    diasMes:diasMesUI>0?diasMesUI:(ov.diasMes??30),
    he50h:he50.h,he50m:he50.m,
    he100h:he100.h,he100m:he100.m,
    adcNoth:adcNot.h,adcNotm:adcNot.m,
    numDep:getNum('numDep'),
    diasUteis:getNum('diasUteis'),
    domingosFer:getNum('domingosFer'),
    // Flags sempre resolvidas do preset corrente — mudanças de preset afetam imediatamente itens existentes
    extraEarnings:(ov.extraEarnings??[]).map(e=>{
      const pFlags=e.preset?getEffectivePresets('earning').find(p=>p.key===e.preset)?.flags:null;
      return pFlags?{...e,flags:{...pFlags}}:e;
    }),
    extraDeductions:(ov.extraDeductions??[]).map(d=>{
      const pFlags=d.preset?getEffectivePresets('deduction').find(p=>p.key===d.preset)?.flags:null;
      return pFlags?{...d,flags:{...pFlags}}:d;
    }),
    faltas:getNum('faltas'),
    faltasDSR:faltasDSREl?faltasDSREl.checked:true,
    adcNotDSR:adcNotDSREl?adcNotDSREl.checked:false,
  };
  const zero={I8:0,F3:0,I4:0,I5:0,F5:0,F6:0,P24:0,F8:0,I10:0,P29:0,P30:0,P31:0,P32:0,Q34:0,Q35:0,O34:0,Q22:0,totalExtraE:0,totalExtraD:0,extrasDetail:[],extraDeductions:[],baseCalc:0,faltas:0,descontoFaltaDia:0,descontoFaltaDSR:0,adcNotDSR:false};
  if(inputs.salBase<=0){renderCLT(zero);return;}
  renderCLT(calcFolha(cfg,inputs));
}

function recalcOpen() {
  const cfg=getEffectiveCfg('FOLHA 2026');
  const in1={salBase:getNum('o_salBase1'),diasTrab:getNum('o_diasTrab1'),diasMes:getNum('o_diasMes1'),he50h:0,he50m:0,he100h:0,he100m:0,adcNoth:0,adcNotm:0,numDep:getNum('o_numDep1'),diasUteis:getNum('o_diasUteis1'),domingosFer:getNum('o_domingosFer1'),extraEarnings:[],extraDeductions:[]};
  const in2={salBase:getNum('o_salBase2'),diasTrab:getNum('o_diasTrab2'),diasMes:getNum('o_diasMes2'),he50h:0,he50m:0,he100h:0,he100m:0,adcNoth:0,adcNotm:0,numDep:getNum('o_numDep2'),diasUteis:23,domingosFer:7,extraEarnings:[],extraDeductions:[]};
  const r1=in1.salBase>0?calcFolha(cfg,in1):null,r2v=in2.salBase>0?calcFolha(cfg,in2):null;
  setText('o_rBase1',r1?fmtBRL(r1.I5):'R$ —');  setText('o_rINSS1',r1?fmtBRL(r1.F5):'R$ —');
  setText('o_rIRRF1',r1?fmtBRL(r1.F6):'R$ —');  setText('o_rFGTS1',r1?fmtBRL(r1.I10):'R$ —');
  setText('o_rLiq1', r1?fmtBRL(r1.F8):'R$ —');
  setText('o_rBase2',r2v?fmtBRL(r2v.I5):'R$ —'); setText('o_rINSS2',r2v?fmtBRL(r2v.F5):'R$ —');
  setText('o_rIRRF2',r2v?fmtBRL(r2v.F6):'R$ —'); setText('o_rFGTS2',r2v?fmtBRL(r2v.I10):'R$ —');
  setText('o_rLiq2', r2v?fmtBRL(r2v.F8):'R$ —');
}

function recalcMulta() {
  const G11=r2(getNum('mBaseUltimoMes')*0.08),D8=r2(getNum('mSaldoFGTS')+G11),D9=r2(D8*(getNum('mTaxaMulta')/100)),D10=r2(D9+G11);
  setText('mFGTSMes',fmtBRL(G11)); setText('mTotalFGTS',fmtBRL(D8)); setText('mMulta',fmtBRL(D9)); setText('mGRRF',fmtBRL(D10));
}

// ---------------------------------------------------------------------------
// Controle de abas
// ---------------------------------------------------------------------------
function switchTab(tabName) {
  currentTab=tabName;
  const cfg=getEffectiveCfg(tabName)||SHEET_CONFIG[tabName];
  document.querySelectorAll('.sal-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tabName));
  ['sec-clt','sec-open','sec-multa'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  if(!cfg) return;

  if(cfg.type==='clt'||cfg.type==='prolabore'){
    document.getElementById('sec-clt').classList.add('active');
    setText('cltTitle', cfg.label);
    // subtitle removed from UI
    const isProlabore = cfg.type === 'prolabore';
    document.querySelectorAll('.sal-he-row').forEach(el => { el.style.display = isProlabore ? 'none' : ''; });
    const horaStrip = document.getElementById('horaStrip');
    if (horaStrip) horaStrip.style.display = isProlabore ? 'none' : '';
    const ov2=userOverrides[tabName]||{};
    const dsrOv=ov2.dsr||{};
    const dU=document.getElementById('diasUteis'),dF=document.getElementById('domingosFer');
    if(dU) dU.value=dsrOv.diasUteis!==undefined?dsrOv.diasUteis:(cfg.dsr?.diasUteis??24);
    if(dF) dF.value=dsrOv.domingosFer!==undefined?dsrOv.domingosFer:(cfg.dsr?.domingosFer??6);
    // Popula campos visíveis
    const dtEl=document.getElementById('diasTrab'),dmEl=document.getElementById('diasMes');
    const ftEl=document.getElementById('faltas'),pfEl=document.getElementById('pontosFacCheckbox');
    const fDSREl=document.getElementById('faltasDSRCheckbox'),aDSREl=document.getElementById('adcNotDSRCheckbox');
    if(dtEl) dtEl.value=ov2.diasTrab??30;
    if(dmEl) dmEl.value=ov2.diasMes??30;
    if(ftEl) ftEl.value=ov2.faltas??0;
    if(pfEl) pfEl.checked=!!(ov2.pontosFac);
    if(fDSREl) fDSREl.checked=ov2.faltasDSR!==false;
    if(aDSREl) aDSREl.checked=ov2.adcNotDSR===true;
    // Se período ativo, sobrescreve DSR com valores calculados do calendário
    if (_periodo.mes && _periodo.ano) {
      const pf = _feriadosCache[_periodo.ano];
      if (pf) {
        const cC = _selectedCidade?.code||null, sC = _selectedCidade?.stateCode||null;
        let fm = getFeriadosDoMes(_periodo.ano, _periodo.mes, pf, cC, sC);
        if(!ov2.pontosFac) fm = fm.filter(f=>(f.type||'').toLowerCase()!=='optional');
        const { diasUteis: pu, domingosFer: pd } = calcDiasDoMes(_periodo.ano, _periodo.mes, fm);
        if(dU) dU.value = pu; if(dF) dF.value = pd;
        const daysInMonth=new Date(_periodo.ano,_periodo.mes,0).getDate();
        if(dmEl) dmEl.value=daysInMonth;
        if(!userOverrides[tabName]) userOverrides[tabName]={};
        if(dtEl){dtEl.value=daysInMonth; userOverrides[tabName].diasTrab=daysInMonth;}
      }
    }
    updateAdminUI();
    updateNewTabWarning(tabName);
    renderExtraEvents(tabName);
    recalcCLT();
  } else if(cfg.type==='open'){
    document.getElementById('sec-open').classList.add('active');
    document.getElementById('btnParams').style.display='none';
    document.getElementById('newTabWarning').style.display='none';
    recalcOpen();
  } else if(cfg.type==='multa_fgts'){
    document.getElementById('sec-multa').classList.add('active');
    document.getElementById('btnParams').style.display='none';
    document.getElementById('newTabWarning').style.display='none';
    recalcMulta();
  }
}

// ---------------------------------------------------------------------------
// Limpar / Exemplos
// ---------------------------------------------------------------------------
function preencherExemploCLT() {
  const cfg=getEffectiveCfg(currentTab); if(!cfg) return;
  document.getElementById('salBase').value=cfg.defaults?.salBase??3000;
  document.getElementById('numDep').value=0;
  document.getElementById('he50').value=document.getElementById('he100').value=document.getElementById('adcNot').value='';
  const dsrOv=(userOverrides[currentTab]||{}).dsr||{};
  const dU=document.getElementById('diasUteis'),dF=document.getElementById('domingosFer');
  if(dU&&cfg.dsr) dU.value=dsrOv.diasUteis!==undefined?dsrOv.diasUteis:cfg.dsr.diasUteis;
  if(dF&&cfg.dsr) dF.value=dsrOv.domingosFer!==undefined?dsrOv.domingosFer:cfg.dsr.domingosFer;
  recalcCLT();
}
function limparCLT() {
  ['salBase','he50','he100','adcNot'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('numDep').value=0;
  const ftEl=document.getElementById('faltas'); if(ftEl) ftEl.value=0;
  const dtEl=document.getElementById('diasTrab'); const dmEl=document.getElementById('diasMes');
  if(dtEl&&dmEl) dtEl.value=dmEl.value||30;
  const cfg=getEffectiveCfg(currentTab);
  const dsrOv=(userOverrides[currentTab]||{}).dsr||{};
  const dU=document.getElementById('diasUteis'),dF=document.getElementById('domingosFer');
  if(dU&&cfg?.dsr) dU.value=dsrOv.diasUteis!==undefined?dsrOv.diasUteis:cfg.dsr.diasUteis;
  if(dF&&cfg?.dsr) dF.value=dsrOv.domingosFer!==undefined?dsrOv.domingosFer:cfg.dsr.domingosFer;
  recalcCLT();
}
function preencherExemploOpen(){document.getElementById('o_salBase1').value=8475.55;document.getElementById('o_diasTrab1').value=30;document.getElementById('o_diasMes1').value=30;document.getElementById('o_numDep1').value=1;document.getElementById('o_diasUteis1').value=23;document.getElementById('o_domingosFer1').value=7;document.getElementById('o_salBase2').value=10518.89;document.getElementById('o_diasTrab2').value=30;document.getElementById('o_diasMes2').value=30;document.getElementById('o_numDep2').value=1;recalcOpen();}
function limparOpen(){['o_salBase1','o_salBase2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});recalcOpen();}
function preencherExemploMulta(){document.getElementById('mSaldoFGTS').value=29862.45;document.getElementById('mBaseUltimoMes').value=10905.26;document.getElementById('mTaxaMulta').value=40;recalcMulta();}
function limparMulta(){document.getElementById('mSaldoFGTS').value='';document.getElementById('mBaseUltimoMes').value='';document.getElementById('mTaxaMulta').value=40;recalcMulta();}

// ---------------------------------------------------------------------------
// Período / Feriados
// ---------------------------------------------------------------------------
const _feriadosCache = {};
const _periodo       = { mes: 0, ano: 0 };
let   _selectedCidade = null;
let   _allCidades     = [];

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function normalizeHolidayDate(value) {
  return String(value || '').slice(0, 10);
}

function normalizeHolidayText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function getHolidayLocationKey(loc) {
  return [
    String(loc?.type || '').toLowerCase(),
    String(loc?.stateCode || '').toUpperCase(),
    String(loc?.code || '').toUpperCase(),
    normalizeHolidayText(loc?.name || ''),
  ].join('|');
}

function dedupeFeriados(feriados) {
  const map = new Map();
  for (const item of feriados || []) {
    const locations = Array.isArray(item?.locations) ? item.locations : [];
    const locKey = JSON.stringify(locations.map(getHolidayLocationKey).sort());
    const key = [
      normalizeHolidayDate(item?.date),
      String(item?.type || '').toLowerCase(),
      normalizeHolidayText(item?.name || item?.localName || ''),
      locKey,
    ].join('||');
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

async function loadFeriados(year) {
  if (_feriadosCache[year]) return _feriadosCache[year];
  // Tenta arquivo local
  try {
    const r = await fetch(`/api/calculo-salario/feriados/${year}`);
    if (r.ok) {
      const data = await r.json();
      const arr = dedupeFeriados(Array.isArray(data) ? data : (data.data || []));
      _feriadosCache[year] = arr; return arr;
    }
  } catch(e) {}
  // Fallback BrasilAPI (apenas nacionais)
  try {
    const r = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
    if (r.ok) {
      const arr = dedupeFeriados(await r.json());
      _feriadosCache[year] = arr; return arr;
    }
  } catch(e) {}
  return (_feriadosCache[year] = []);
}

function isHolidayApplicable(f, cidadeCode, stateCode) {
  const type = (f.type || '').toLowerCase();
  if (type === 'national' || type === 'optional') return true;
  if (!cidadeCode) return false;
  if (f.locations) {
    for (const loc of f.locations) {
      if (loc.type === 'state' && stateCode && (loc.code === stateCode || loc.stateCode === stateCode)) return true;
      if (loc.type === 'municipality' && loc.code === cidadeCode) return true;
    }
  }
  return false;
}

function getFeriadosDoMes(year, month, feriados, cidadeCode, stateCode) {
  return feriados.filter(f => {
    const d = new Date(f.date);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) return false;
    return isHolidayApplicable(f, cidadeCode, stateCode);
  });
}

function calcDiasDoMes(year, month, feriadosDoMes) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const feriadoDates = new Set(feriadosDoMes.map(f => new Date(f.date).getUTCDate()));
  let diasUteis = 0, domingosFer = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day).getDay();
    const isFeriado = feriadoDates.has(day);
    if (dow === 0) { domingosFer++; }                           // Domingo sempre domingosFer
    else if (!isFeriado) { diasUteis++; }                       // Seg–Sáb sem feriado = útil
    else { domingosFer++; }                                     // Seg–Sáb com feriado = domingosFer
  }
  return { diasUteis, domingosFer };
}

function applyPeriodo(ano, mes, feriados) {
  const cC = _selectedCidade?.code || null, sC = _selectedCidade?.stateCode || null;
  let feriadosDoMes = getFeriadosDoMes(ano, mes, feriados, cC, sC);
  // Filtra pontos facultativos se não marcados para contabilizar
  const pontosFac = !!(userOverrides[currentTab]?.pontosFac);
  if (!pontosFac) feriadosDoMes = feriadosDoMes.filter(f => (f.type||'').toLowerCase() !== 'optional');
  const { diasUteis, domingosFer } = calcDiasDoMes(ano, mes, feriadosDoMes);
  const dU = document.getElementById('diasUteis'), dF = document.getElementById('domingosFer');
  if (dU) dU.value = diasUteis;
  if (dF) dF.value = domingosFer;
  const daysInMonth = new Date(ano, mes, 0).getDate();
  const dmEl = document.getElementById('diasMes');
  if(!userOverrides[currentTab]) userOverrides[currentTab]={};
  if (dmEl) { dmEl.value = daysInMonth; userOverrides[currentTab].diasMes = daysInMonth; }
  const dtEl = document.getElementById('diasTrab');
  if (dtEl) { dtEl.value=daysInMonth; userOverrides[currentTab].diasTrab=daysInMonth; }
  recalcCLT();
}

function clearPeriodo() {
  const card = document.getElementById('feriadosCard');
  if (card) card.style.display = 'none';
  const cal = document.getElementById('calendarioInline');
  if (cal) cal.style.display = 'none';
  const cfg = getEffectiveCfg(currentTab);
  const ov  = (userOverrides[currentTab] || {}).dsr || {};
  const dU  = document.getElementById('diasUteis'), dF = document.getElementById('domingosFer');
  if (dU) dU.value = ov.diasUteis   !== undefined ? ov.diasUteis   : (cfg?.dsr?.diasUteis  ?? 24);
  if (dF) dF.value = ov.domingosFer !== undefined ? ov.domingosFer : (cfg?.dsr?.domingosFer ?? 6);
  recalcCLT();
}

async function onPeriodoChange() {
  const mes = parseInt(document.getElementById('periodoMes')?.value || '0');
  const ano = parseInt(document.getElementById('periodoAno')?.value  || '0');
  _periodo.mes = mes; _periodo.ano = ano;
  const cidadeInput = document.getElementById('cidadeInput');
  if (!mes || !ano || ano < 2020 || ano > 2040) {
    if (cidadeInput) { cidadeInput.disabled = true; cidadeInput.placeholder = 'Selecione o período primeiro'; cidadeInput.value = ''; }
    _selectedCidade = null; _allCidades = [];
    clearPeriodo();
    return;
  }
  const feriados = await loadFeriados(ano);
  setupCidadeAutocomplete(feriados);
  applyPeriodo(ano, mes, feriados);
  renderFeriadosCard(ano, mes, feriados);
  renderCalendarioInline(ano, mes, feriados);
}

function getDefaultPeriodo() {
  const now = new Date(), m = now.getMonth() + 1, y = now.getFullYear();
  return m === 1 ? { mes: 12, ano: y - 1 } : { mes: m - 1, ano: y };
}

async function initDefaultPeriodo() {
  const { mes, ano } = getDefaultPeriodo();
  const selMes = document.getElementById('periodoMes');
  const inpAno = document.getElementById('periodoAno');
  if (selMes) selMes.value = String(mes);
  if (inpAno) inpAno.value = String(ano);
  await onPeriodoChange();
}

function extractCidades(feriados) {
  const map = new Map();
  for (const f of feriados) {
    if (!f.locations) continue;
    for (const loc of f.locations) {
      if (loc.type === 'municipality' && loc.code && !map.has(loc.code))
        map.set(loc.code, { code: loc.code, name: loc.name, stateCode: loc.stateCode || '' });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function setupCidadeAutocomplete(feriados) {
  _allCidades = extractCidades(feriados);
  const input    = document.getElementById('cidadeInput');
  const dropdown = document.getElementById('cidadeDropdown');
  if (!input || !dropdown) return;
  if (!_allCidades.length) {
    input.placeholder = 'Cidades não disponíveis'; input.disabled = true; return;
  }
  input.disabled = false; input.placeholder = 'Digite para filtrar...';
  if (_selectedCidade) input.value = `${_selectedCidade.name} (${_selectedCidade.stateCode})`;

  // Clone node to remove previous listeners
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  const ni = document.getElementById('cidadeInput');
  if (_selectedCidade) ni.value = `${_selectedCidade.name} (${_selectedCidade.stateCode})`;

  function showDropdown(q) {
    const hits = _allCidades.filter(c =>
      c.name.toLowerCase().includes(q.toLowerCase()) || c.stateCode.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 25);
    if (!hits.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = hits.map(c =>
      `<div class="sal-city-option" data-code="${escHtml(c.code)}" data-name="${escHtml(c.name)}" data-state="${escHtml(c.stateCode)}">
        ${escHtml(c.name)} <span class="sal-city-state">(${escHtml(c.stateCode)})</span></div>`
    ).join('');
    dropdown.style.display = '';
    dropdown.querySelectorAll('.sal-city-option').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault();
        _selectedCidade = { code: opt.dataset.code, name: opt.dataset.name, stateCode: opt.dataset.state };
        ni.value = `${_selectedCidade.name} (${_selectedCidade.stateCode})`;
        dropdown.style.display = 'none';
        onCidadeChange();
      });
    });
  }
  ni.addEventListener('input', () => {
    const q = ni.value.trim();
    if (!q) { dropdown.style.display = 'none'; if(_selectedCidade){ _selectedCidade=null; onCidadeChange(); } return; }
    showDropdown(q);
  });
  ni.addEventListener('focus', () => { if (ni.value.trim()) showDropdown(ni.value.trim()); });
  ni.addEventListener('blur',  () => { setTimeout(() => { dropdown.style.display = 'none'; }, 150); });
}

function onCidadeChange() {
  const { mes, ano } = _periodo;
  if (!mes || !ano) return;
  const feriados = _feriadosCache[ano]; if (!feriados) return;
  applyPeriodo(ano, mes, feriados);
  renderFeriadosCard(ano, mes, feriados);
  renderCalendarioInline(ano, mes, feriados);
}

function renderFeriadosCard(ano, mes, feriados) {
  const card = document.getElementById('feriadosCard'); if (!card) return;
  const cC = _selectedCidade?.code || null, sC = _selectedCidade?.stateCode || null;
  const fm = getFeriadosDoMes(ano, mes, feriados, cC, sC);

  const comemorativas = feriados.filter(f => {
    if ((f.type||'').toLowerCase() !== 'commemorative') return false;
    const d = new Date(f.date);
    return d.getUTCFullYear() === ano && d.getUTCMonth() + 1 === mes;
  });

  const grupos = [
    { label: 'Nacionais',           cls: 'nacional',     items: fm.filter(f => (f.type||'').toLowerCase() === 'national') },
    { label: 'Estaduais',           cls: 'estadual',     items: fm.filter(f => (f.type||'').toLowerCase() === 'state') },
    { label: 'Municipais',          cls: 'municipal',    items: fm.filter(f => (f.type||'').toLowerCase() === 'municipal') },
    { label: 'Ponto Facultativo',   cls: 'fac',          items: fm.filter(f => (f.type||'').toLowerCase() === 'optional') },
    { label: 'Datas Comemorativas', cls: 'comemorativa', items: comemorativas },
  ];

  function renderGroup({ label, cls, items }) {
    if (!items.length) return '';
    let g = `<div class="sal-feriados-group ${cls}"><div class="sal-feriados-group-title">${escHtml(label)} <span class="sal-feriados-group-count">${items.length}</span></div><div class="sal-feriados-group-items">`;
    for (const f of items) {
      const day = String(new Date(f.date).getUTCDate()).padStart(2, '0');
      g += `<div class="sal-feriados-item">
        <span class="sal-feriados-date">${day}/${String(mes).padStart(2,'0')}</span>
        <span>${escHtml(f.name || f.localName || '')}</span>
      </div>`;
    }
    return g + '</div></div>';
  }

  let html = `<div class="sal-feriados-card-title">${MESES_PT[mes-1]} ${ano}</div>`;
  if (!fm.length && !comemorativas.length) { html += '<p style="font-size:12px;color:#94a3b8;margin:0">Nenhum feriado neste período.</p>'; }
  else { html += grupos.map(renderGroup).join(''); }
  card.innerHTML = html; card.style.display = '';
}

function renderCalendarioInline(ano, mes, feriados) {
  const container = document.getElementById('calendarioInline'); if (!container) return;
  const cC = _selectedCidade?.code || null, sC = _selectedCidade?.stateCode || null;
  const fm = getFeriadosDoMes(ano, mes, feriados, cC, sC);
  const feriadoMap = {};
  for (const f of fm) {
    const day = new Date(f.date).getUTCDate();
    if (!feriadoMap[day]) feriadoMap[day] = [];
    feriadoMap[day].push(f);
  }
  const comemorativaMap = {};
  for (const f of feriados) {
    if ((f.type||'').toLowerCase() !== 'commemorative') continue;
    const d = new Date(f.date);
    if (d.getUTCFullYear() !== ano || d.getUTCMonth() + 1 !== mes) continue;
    const day = d.getUTCDate();
    if (!comemorativaMap[day]) comemorativaMap[day] = [];
    comemorativaMap[day].push(f);
  }
  const daysInMonth = new Date(ano, mes, 0).getDate();
  const firstDow    = new Date(ano, mes - 1, 1).getDay();
  const today       = new Date();

  let html = `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px">
  <div class="sal-cal-header">
    <div class="sal-cal-dayname">Dom</div><div class="sal-cal-dayname">Seg</div>
    <div class="sal-cal-dayname">Ter</div><div class="sal-cal-dayname">Qua</div>
    <div class="sal-cal-dayname">Qui</div><div class="sal-cal-dayname">Sex</div>
    <div class="sal-cal-dayname">Sáb</div>
  </div><div class="sal-cal-grid">`;
  for (let i = 0; i < firstDow; i++) html += '<div class="sal-cal-day empty"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const dow       = new Date(ano, mes - 1, day).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayHols   = feriadoMap[day] || [];
    const dayComem  = comemorativaMap[day] || [];
    const isToday   = today.getFullYear()===ano && today.getMonth()===mes-1 && today.getDate()===day;
    let cls = 'sal-cal-day';
    if (dayHols.length) {
      const types = dayHols.map(f => (f.type||'').toLowerCase());
      if (types.includes('national'))       cls += ' feriado-nacional';
      else if (types.includes('state'))     cls += ' feriado-estadual';
      else if (types.includes('municipal')) cls += ' feriado-municipal';
      else if (types.includes('optional'))  cls += ' fac';
    } else if (dayComem.length) { cls += ' comemorativa'; }
    else if (isWeekend) { cls += ' weekend'; }
    if (isToday) cls += ' today';
    const labelEntry = dayHols[0] || dayComem[0];
    const nameHtml = labelEntry
      ? `<span class="sal-cal-day-name">${escHtml(labelEntry.name||labelEntry.localName||'')}</span>`
      : '';
    html += `<div class="${cls}" data-day="${day}"><span class="sal-cal-day-num">${day}</span>${nameHtml}</div>`;
  }
  html += `</div><div class="sal-cal-legend">
    <div class="sal-cal-legend-item"><div class="sal-cal-legend-dot" style="background:#fee2e2;border:1px solid #fca5a5"></div>Nacional</div>
    <div class="sal-cal-legend-item"><div class="sal-cal-legend-dot" style="background:#fef3c7;border:1px solid #fcd34d"></div>Estadual</div>
    <div class="sal-cal-legend-item"><div class="sal-cal-legend-dot" style="background:#d1fae5;border:1px solid #6ee7b7"></div>Municipal</div>
    <div class="sal-cal-legend-item"><div class="sal-cal-legend-dot" style="background:#f3e8ff;border:1px solid #d8b4fe"></div>Fac.</div>
    <div class="sal-cal-legend-item"><div class="sal-cal-legend-dot" style="background:#e0f2fe;border:1px solid #bae6fd"></div>Comemorativa</div>
    <div class="sal-cal-legend-item"><div class="sal-cal-legend-dot" style="background:#f1f5f9;border:1px solid #e2e8f0"></div>Fim de sem.</div>
  </div></div>`;
  container.innerHTML = html;
  container.style.display = '';
  // Clique em cada dia: abre popover de add/delete
  container.querySelectorAll('.sal-cal-day[data-day]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const d = parseInt(el.dataset.day);
      showDayPopover(_periodo.ano, _periodo.mes, d, feriadoMap[d]||[], comemorativaMap[d]||[], feriados);
    });
  });
}

// ---------------------------------------------------------------------------
// CRUD de Feriados
// ---------------------------------------------------------------------------
const ESTADOS_BR = [
  {c:'AC',n:'Acre'},{c:'AL',n:'Alagoas'},{c:'AM',n:'Amazonas'},{c:'AP',n:'Amapá'},
  {c:'BA',n:'Bahia'},{c:'CE',n:'Ceará'},{c:'DF',n:'Distrito Federal'},{c:'ES',n:'Espírito Santo'},
  {c:'GO',n:'Goiás'},{c:'MA',n:'Maranhão'},{c:'MG',n:'Minas Gerais'},{c:'MS',n:'Mato Grosso do Sul'},
  {c:'MT',n:'Mato Grosso'},{c:'PA',n:'Pará'},{c:'PB',n:'Paraíba'},{c:'PE',n:'Pernambuco'},
  {c:'PI',n:'Piauí'},{c:'PR',n:'Paraná'},{c:'RJ',n:'Rio de Janeiro'},{c:'RN',n:'Rio Grande do Norte'},
  {c:'RO',n:'Rondônia'},{c:'RR',n:'Roraima'},{c:'RS',n:'Rio Grande do Sul'},{c:'SC',n:'Santa Catarina'},
  {c:'SE',n:'Sergipe'},{c:'SP',n:'São Paulo'},{c:'TO',n:'Tocantins'},
];

let _calPopDay = null;

function showDayPopover(ano, mes, day, dayHols, dayComem, feriados) {
  const pop = document.getElementById('calDayPopover'); if (!pop) return;
  _calPopDay = { ano, mes, day, feriados };
  const dateStr = `${String(day).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${ano}`;
  const allEvents = [...dayHols, ...dayComem];
  const typeLabel = { national:'Nacional', state:'Estadual', municipal:'Municipal', optional:'Ponto Fac.', commemorative:'Comemorativa' };
  const typeColor = { national:'#fee2e2', state:'#fef3c7', municipal:'#d1fae5', optional:'#f3e8ff', commemorative:'#e0f2fe' };
  const estadosOpts = ESTADOS_BR.map(e=>`<option value="${e.c}">${e.c} — ${e.n}</option>`).join('');

  let evHtml = allEvents.map(f => {
    const tl = typeLabel[(f.type||'').toLowerCase()] || f.type;
    const tc = typeColor[(f.type||'').toLowerCase()] || '#f1f5f9';
    return `<div class="sal-cal-pop-event">
      <span style="background:${tc};border-radius:3px;padding:1px 5px;font-size:10px;flex-shrink:0">${escHtml(tl)}</span>
      <span class="sal-cal-pop-event-name">${escHtml(f.name||f.localName||'')}</span>
      ${f.id?`<button class="sal-cal-pop-del" data-del="${escHtml(f.id)}" title="Excluir">✕</button>`:''}
    </div>`;
  }).join('');

  pop.innerHTML = `
    <div class="sal-cal-pop-header">
      <span class="sal-cal-pop-date">${dateStr}</span>
      <button class="sal-cal-pop-close" id="calPopX">×</button>
    </div>
    ${allEvents.length ? `<div style="margin-bottom:8px">${evHtml}</div>` : ''}
    <div class="sal-cal-pop-add">
      <div class="sal-cal-pop-add-title">Adicionar feriado</div>
      <div class="sal-cal-pop-form">
        <input id="calPopName" class="auth-input" type="text" placeholder="Nome do feriado" autocomplete="off" />
        <select id="calPopType" class="auth-input">
          <option value="national">Nacional</option>
          <option value="state">Estadual</option>
          <option value="municipal">Municipal</option>
          <option value="optional">Ponto Facultativo</option>
          <option value="commemorative">Data Comemorativa</option>
        </select>
        <select id="calPopState" class="auth-input" style="display:none"><option value="">— Estado —</option>${estadosOpts}</select>
        <select id="calPopMun" class="auth-input" style="display:none"><option value="">— Município —</option></select>
        <div class="sal-cal-pop-actions">
          <button class="btn btn-primary" id="calPopSave" style="font-size:12px;padding:5px 14px">Salvar</button>
          <button class="btn btn-secondary" id="calPopCancel" style="font-size:12px;padding:5px 12px">Cancelar</button>
        </div>
      </div>
    </div>`;
  pop.style.display = '';

  pop.querySelector('#calPopX').onclick = hideDayPopover;
  pop.querySelector('#calPopCancel').onclick = hideDayPopover;
  function populateMunSelect(sc) {
    const sel=pop.querySelector('#calPopMun'); if(!sel) return;
    const cities=_allCidades.filter(c=>c.stateCode===sc).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    sel.innerHTML='<option value="">— Município —</option>'+cities.map(c=>`<option value="${escHtml(c.code)}">${escHtml(c.name)}</option>`).join('');
  }
  pop.querySelector('#calPopType').onchange = function() {
    const sc=pop.querySelector('#calPopState')?.value||'';
    pop.querySelector('#calPopState').style.display = (this.value==='state'||this.value==='municipal') ? '' : 'none';
    const munSel=pop.querySelector('#calPopMun');
    munSel.style.display = this.value==='municipal' ? '' : 'none';
    if(this.value==='municipal'&&sc) populateMunSelect(sc);
  };
  pop.querySelector('#calPopState').onchange = function() {
    if(pop.querySelector('#calPopType')?.value==='municipal') populateMunSelect(this.value);
  };
  pop.querySelector('#calPopSave').onclick = () => _saveDayFeriado(ano, mes, day);
  pop.querySelectorAll('.sal-cal-pop-del').forEach(btn => {
    btn.onclick = () => _deleteFeriado(ano, mes, btn.dataset.del);
  });
}

function hideDayPopover() {
  const pop = document.getElementById('calDayPopover'); if (pop) pop.style.display = 'none';
  _calPopDay = null;
}

async function _saveDayFeriado(ano, mes, day) {
  const name = document.getElementById('calPopName')?.value.trim();
  const type = document.getElementById('calPopType')?.value;
  const sc   = document.getElementById('calPopState')?.value;
  const munCode = document.getElementById('calPopMun')?.value;
  if (!name) { document.getElementById('calPopName').classList.add('sal-input-error'); return; }
  const dateStr = `${ano}-${String(mes).padStart(2,'0')}-${String(day).padStart(2,'0')}T00:00:00.000Z`;
  let locations = [];
  if (type==='national'||type==='optional'||type==='commemorative') {
    locations = [{type:'country',code:'BR',name:'Brasil',stateCode:null}];
  } else if (type==='state') {
    if (!sc) { alert('Selecione o estado.'); return; }
    const est = ESTADOS_BR.find(e=>e.c===sc);
    locations = [{type:'state',code:sc,name:est?.n||sc,stateCode:sc}];
  } else if (type==='municipal') {
    if (!sc||!munCode) { alert('Selecione estado e município.'); return; }
    const est = ESTADOS_BR.find(e=>e.c===sc);
    const city = _allCidades.find(c=>c.code===munCode&&c.stateCode===sc);
    const munName = city?.name||munCode;
    locations = [
      {type:'state',code:sc,name:est?.n||sc,stateCode:sc},
      {type:'municipality',code:munCode,name:munName,stateCode:sc},
    ];
  }
  const btn = document.getElementById('calPopSave');
  if(btn) btn.disabled=true;
  try {
    const r = await fetch(`/api/calculo-salario/feriados/${ano}/entry`,{
      method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},
      body:JSON.stringify({name,date:dateStr,type,description:name,locations}),
    });
    if (!r.ok) {
      let msg='Erro ao salvar.';
      try { const e=await r.json(); msg=e.error||msg; } catch(_){}
      alert(msg); if(btn) btn.disabled=false; return;
    }
    delete _feriadosCache[ano];
    const fresh = await loadFeriados(ano);
    applyPeriodo(ano, mes, fresh); renderFeriadosCard(ano, mes, fresh); renderCalendarioInline(ano, mes, fresh);
    hideDayPopover();
  } catch(e) {
    console.error('[calculo-salario] Erro ao salvar feriado:', e);
    alert('Erro de rede ao salvar. Verifique a conexão e tente novamente.');
    if(btn) btn.disabled=false;
  }
}

async function _deleteFeriado(ano, mes, id) {
  if (!confirm('Excluir este feriado?')) return;
  try {
    const r = await fetch(`/api/calculo-salario/feriados/${ano}/entry/${id}`,{
      method:'DELETE',headers:{'X-CSRF-Token':csrfToken},
    });
    if (!r.ok) {
      let msg='Erro ao excluir.';
      try { const e=await r.json(); msg=e.error||msg; } catch(_){}
      alert(msg); return;
    }
    delete _feriadosCache[ano];
    const fresh = await loadFeriados(ano);
    applyPeriodo(ano, mes, fresh); renderFeriadosCard(ano, mes, fresh); renderCalendarioInline(ano, mes, fresh);
    hideDayPopover();
  } catch(e) {
    console.error('[calculo-salario] Erro ao excluir feriado:', e);
    alert('Erro de rede ao excluir. Verifique a conexão e tente novamente.');
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  inicializarSidebar('calculo-salario');

  // Configura listeners antes do render assíncrono

  // Tabs
  document.getElementById('salTabs').addEventListener('click', e=>{
    const btn=e.target.closest('.sal-tab[data-tab]'); if(!btn||btn.id==='btnNovaAba') return;
    switchTab(btn.dataset.tab);
  });

  // CLT inputs — básicos
  ['salBase','numDep','he50','he100','adcNot'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.addEventListener('input',()=>recalcCLT());
    el.addEventListener('blur',()=>{
      if(id==='he50'||id==='he100'||id==='adcNot'){if(el.value.trim()) el.value=formatHHMM(...Object.values(parseHHMM(el.value)));}
      else clampInput(id);
      recalcCLT();
    });
  });

  // diasUteis / domingosFer — com linking automático (sum = diasMes)
  function _linkDiasUteis() {
    const v=parseFloat(document.getElementById('diasUteis')?.value)||0;
    if(!userOverrides[currentTab]) userOverrides[currentTab]={};
    if(!userOverrides[currentTab].dsr) userOverrides[currentTab].dsr={};
    userOverrides[currentTab].dsr.diasUteis=v;
    const diasMes=parseInt(document.getElementById('diasMes')?.value)||30;
    const dfEl=document.getElementById('domingosFer');
    if(dfEl){const dfv=Math.max(0,diasMes-v);dfEl.value=dfv;userOverrides[currentTab].dsr.domingosFer=dfv;}
    saveSharedState(); recalcCLT();
  }
  function _linkDomingosFer() {
    const v=parseFloat(document.getElementById('domingosFer')?.value)||0;
    if(!userOverrides[currentTab]) userOverrides[currentTab]={};
    if(!userOverrides[currentTab].dsr) userOverrides[currentTab].dsr={};
    userOverrides[currentTab].dsr.domingosFer=v;
    const diasMes=parseInt(document.getElementById('diasMes')?.value)||30;
    const duEl=document.getElementById('diasUteis');
    if(duEl){const duv=Math.max(1,diasMes-v);duEl.value=duv;userOverrides[currentTab].dsr.diasUteis=duv;}
    saveSharedState(); recalcCLT();
  }
  document.getElementById('diasUteis')?.addEventListener('input',_linkDiasUteis);
  document.getElementById('diasUteis')?.addEventListener('blur',()=>{clampInput('diasUteis');_linkDiasUteis();});
  document.getElementById('domingosFer')?.addEventListener('input',_linkDomingosFer);
  document.getElementById('domingosFer')?.addEventListener('blur',()=>{clampInput('domingosFer');_linkDomingosFer();});

  function _linkDiasTrab() {
    const v=parseInt(document.getElementById('diasTrab')?.value)||0;
    if(!userOverrides[currentTab]) userOverrides[currentTab]={};
    userOverrides[currentTab].diasTrab=v;
    saveSharedState(); recalcCLT();
  }
  function _linkFaltas() {
    const v=parseInt(document.getElementById('faltas')?.value)||0;
    if(!userOverrides[currentTab]) userOverrides[currentTab]={};
    userOverrides[currentTab].faltas=v;
    saveSharedState(); recalcCLT();
  }
  function _linkFaltasDSR() {
    const v=document.getElementById('faltasDSRCheckbox')?.checked??true;
    if(!userOverrides[currentTab]) userOverrides[currentTab]={};
    userOverrides[currentTab].faltasDSR=v;
    saveSharedState(); recalcCLT();
  }
  function _linkAdcNotDSR() {
    const v=document.getElementById('adcNotDSRCheckbox')?.checked??false;
    if(!userOverrides[currentTab]) userOverrides[currentTab]={};
    userOverrides[currentTab].adcNotDSR=v;
    saveSharedState(); recalcCLT();
  }
  document.getElementById('diasTrab')?.addEventListener('input',_linkDiasTrab);
  document.getElementById('diasTrab')?.addEventListener('blur',()=>{clampInput('diasTrab');_linkDiasTrab();});
  document.getElementById('faltas')?.addEventListener('input',_linkFaltas);
  document.getElementById('faltas')?.addEventListener('blur',()=>{clampInput('faltas');_linkFaltas();});
  document.getElementById('faltasDSRCheckbox')?.addEventListener('change',_linkFaltasDSR);
  document.getElementById('adcNotDSRCheckbox')?.addEventListener('change',_linkAdcNotDSR);

  // Pontos facultativos
  document.getElementById('pontosFacCheckbox')?.addEventListener('change',e=>{
    if(!userOverrides[currentTab]) userOverrides[currentTab]={};
    userOverrides[currentTab].pontosFac=e.target.checked;
    saveSharedState();
    if(_periodo.mes&&_periodo.ano){
      const pf=_feriadosCache[_periodo.ano];
      if(pf){applyPeriodo(_periodo.ano,_periodo.mes,pf);renderFeriadosCard(_periodo.ano,_periodo.mes,pf);}
    } else { recalcCLT(); }
  });

  // Open inputs
  ['o_salBase1','o_diasTrab1','o_diasMes1','o_numDep1','o_diasUteis1','o_domingosFer1','o_salBase2','o_diasTrab2','o_diasMes2','o_numDep2'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.addEventListener('input',recalcOpen);
    el.addEventListener('blur',()=>{clampInput(id);recalcOpen();});
  });

  // Multa inputs
  ['mSaldoFGTS','mBaseUltimoMes','mTaxaMulta'].forEach(id=>document.getElementById(id)?.addEventListener('input',recalcMulta));

  // Botões de ação
  document.getElementById('btnExemplo').addEventListener('click',preencherExemploCLT);
  document.getElementById('btnLimpar').addEventListener('click',limparCLT);
  document.getElementById('btnExemploOpen').addEventListener('click',preencherExemploOpen);
  document.getElementById('btnLimparOpen').addEventListener('click',limparOpen);
  document.getElementById('btnExemploMulta').addEventListener('click',preencherExemploMulta);
  document.getElementById('btnLimparMulta').addEventListener('click',limparMulta);

  // Botões de proventos/descontos — stopPropagation evita que o click feche o dropdown imediatamente
  document.getElementById('btnAddEarning')?.addEventListener('click',e=>{e.stopPropagation();openExtraDropdown(currentTab,'earning',e.currentTarget);});
  document.getElementById('btnAddDeduction')?.addEventListener('click',e=>{e.stopPropagation();openExtraDropdown(currentTab,'deduction',e.currentTarget);});
  document.addEventListener('click',e=>{if(!e.target.closest('.sal-extra-dropdown'))closeExtraDropdown();});

  // Gear — params modal
  document.getElementById('btnParams')?.addEventListener('click',()=>{openParamsModal(currentTab);});
  const paramsModal=document.getElementById('paramsModal');
  paramsModal?.addEventListener('click',e=>{if(e.target===paramsModal) tryCloseParamsModal();});
  document.getElementById('btnCloseParamsModal')?.addEventListener('click',tryCloseParamsModal);
  document.getElementById('btnCloseParamsModalFooter')?.addEventListener('click',tryCloseParamsModal);
  document.getElementById('btnSaveParamsModal')?.addEventListener('click',saveParamsModal);

  // + Nova aba
  document.getElementById('btnNovaAba')?.addEventListener('click',()=>{
    const sel=document.getElementById('newTabSource'); if(sel){
      sel.innerHTML='';
      Object.entries(SHEET_CONFIG).filter(([,c])=>c.type==='clt'||c.type==='prolabore').forEach(([name])=>{
        const opt=document.createElement('option'); opt.value=opt.textContent=name;
        if(name===currentTab) opt.selected=true; sel.appendChild(opt);
      });
    }
    document.getElementById('newTabModal').showModal();
  });
  document.getElementById('btnConfirmNewTab')?.addEventListener('click',()=>{
    const ni=document.getElementById('newTabName'),name=(ni?.value??'').trim();
    if(!name){flashError(ni);return;}
    if(createNewTab(name,document.getElementById('newTabSource')?.value??'FOLHA 2026')){document.getElementById('newTabModal').close();if(ni)ni.value='';}
  });
  ['btnCancelNewTab','btnCancelNewTabX'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>document.getElementById('newTabModal').close()));
  const ntm=document.getElementById('newTabModal');
  ntm?.addEventListener('click',e=>{if(e.target===ntm) ntm.close();});

  // Dispensar aviso nova aba
  document.getElementById('btnDismissWarning')?.addEventListener('click',()=>{
    acknowledgedWarnings.add(currentTab); saveAckedWarnings();
    document.getElementById('newTabWarning').style.display='none';
  });

  // Período / Feriados
  document.getElementById('periodoMes')?.addEventListener('change', onPeriodoChange);
  document.getElementById('periodoAno')?.addEventListener('change', onPeriodoChange);
  document.getElementById('periodoAno')?.addEventListener('keydown', e => { if(e.key==='Enter') e.target.blur(); });

  // Enter move foco para o próximo input visível
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const active = document.activeElement;
    if (!active) return;
    const tag = active.tagName;
    if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (active.type === 'checkbox' || active.type === 'button' || active.type === 'submit') return;
    const inputs = [...document.querySelectorAll(
      'input:not([type=checkbox]):not([type=button]):not([type=submit]):not([type=radio]):not([disabled])'
    )].filter(el => el.offsetParent !== null && !el.closest('[style*="display: none"]'));
    const idx = inputs.indexOf(active);
    if (idx >= 0 && idx < inputs.length - 1) {
      e.preventDefault();
      inputs[idx + 1].focus();
      inputs[idx + 1].select?.();
    }
  });

  // Gerenciar abas
  document.getElementById('btnManageTabs')?.addEventListener('click',openManageTabsModal);
  const mm=document.getElementById('manageTabsModal');
  mm?.addEventListener('click',e=>{if(e.target===mm) mm.close();});
  ['btnCloseManageTabs','btnCloseManageTabsFooter'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>mm?.close()));

  // Carrega localStorage imediatamente (cache), depois sincroniza com servidor
  loadFromStorage();
  applyDeletedTabs();
  loadDynamicTabs();
  applyHiddenTabs();

  // Async: autentica → carrega estado compartilhado do servidor → renderiza
  (async () => {
    await initUser();
    await loadSharedStateFromServer();
    // Aplica exclusões e visibilidade vindas do servidor
    applyDeletedTabs();
    loadDynamicTabs();
    applyHiddenTabs();
    updateAdminUI();
    // Garante que o estado local seja persistido no servidor (cria o arquivo se não existir)
    scheduleServerSave();
    // Determina aba inicial (pode ter sido excluída)
    const firstVisible = [...document.querySelectorAll('.sal-tab[data-tab]')]
      .find(b => b.id !== 'btnNovaAba' && b.style.display !== 'none');
    switchTab(firstVisible?.dataset.tab ?? Object.keys(SHEET_CONFIG)[0] ?? 'FOLHA 2026');
    // Preenche período automaticamente (mês anterior)
    await initDefaultPeriodo();
  })();
});
