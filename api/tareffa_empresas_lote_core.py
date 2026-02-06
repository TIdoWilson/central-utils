# src/python/tareffa_empresas_lote_core.py
from logging import log
import os
import re
import json
import time
import csv
import unicodedata
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

import requests
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
from urllib.parse import urlparse

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

URL_EMPRESAS = "https://web.tareffa.com.br/empresas"
URL_EMPRESAS_NOVA = "https://web.tareffa.com.br/empresas/nova"

EXPORT_URL = "https://prd-api-oauth-tareffa.ottimizza.dev/services/empresas/export/csv/simples"

DATE_SERVICO_RE = re.compile(
    r"Data\s*In[ií]cio\s+da\s+Presta[çc][ãa]o\s+de\s+Servi[çc]o",
    re.I
)

# =========================
# DEBUG / LOG HELPERS
# =========================
DEBUG = os.getenv("TAREFFA_DEBUG", "1").strip() not in ("0", "false", "False", "")

def _now():
    return time.strftime("%H:%M:%S")

def _mask_email(email: str) -> str:
    email = (email or "").strip()
    if "@" not in email:
        return "***"
    u, d = email.split("@", 1)
    if len(u) <= 2:
        u2 = u[:1] + "***"
    else:
        u2 = u[:2] + "***"
    return f"{u2}@{d}"

def _mask_pwd(pwd: str) -> str:
    if not pwd:
        return ""
    return "*" * min(len(pwd), 10)

def _safe(fn, default=""):
    try:
        return fn()
    except Exception:
        return default

def dbg(log, msg: str):
    if not DEBUG:
        return
    if log:
        log(f"{_now()} {msg}")
    else:
        print(f"{_now()} {msg}", flush=True)

def _loc_count(page, sel: str) -> int:
    try:
        return page.locator(sel).count()
    except Exception:
        return -1

def debug_state(page, log=None, tag: str = "state"):
    """
    Snapshot rápido do que existe na tela (sem printar HTML).
    """
    url = (page.url or "")
    host = _safe(lambda: (urlparse(url).hostname or ""), "")
    path = _safe(lambda: (urlparse(url).path or ""), "")
    title = _safe(lambda: page.title(), "")

    oauth_forms = _safe(lambda: page.locator("form.oauthuser").count(), -1)
    email_inputs = _safe(lambda: page.locator(
        'input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i], input[placeholder*="e-mail" i]'
    ).count(), -1)
    pass_inputs = _safe(lambda: page.locator(
        'input[type="password"], input[name*="senha" i], input[placeholder*="senha" i], input[autocomplete="current-password"]'
    ).count(), -1)
    submit_btns = _safe(lambda: page.locator('button[type="submit"]').count(), -1)
    entrar_btns = _safe(lambda: page.get_by_role("button", name=re.compile(r"entrar", re.I)).count(), -1)

    dbg(log, f"[{tag}] url={url}")
    dbg(log, f"[{tag}] host={host} path={path} title={title!r}")
    dbg(log, f"[{tag}] counts: oauthuser_forms={oauth_forms} email_inputs={email_inputs} pass_inputs={pass_inputs} submit_btns={submit_btns} entrar_btns={entrar_btns}")

def attach_page_debug(page, log=None):
    """
    Loga eventos de navegação/erros/request-failed e responses importantes.
    """
    def _log(msg):
        dbg(log, msg)

    def on_framenav(frame):
        try:
            if frame == page.main_frame:
                _log(f"[event] main_frame navigated -> {frame.url}")
        except Exception:
            pass

    def on_console(msg):
        try:
            t = msg.type
            text = msg.text
            if t in ("error", "warning"):
                _log(f"[console:{t}] {text}")
        except Exception:
            pass

    def on_pageerror(err):
        _log(f"[pageerror] {err}")

    def on_request_failed(req):
        try:
            _log(f"[requestfailed] {req.method} {req.url} -> {req.failure}")
        except Exception:
            pass

    def on_response(resp):
        try:
            u = resp.url or ""
            st = resp.status

            critical = (
                "/services/oauth/callback" in u
                or "/services/empresas" in u
                or "oauth.ottimizza.com.br/login" in u
                or "oauthchooseaccount" in u
            )

            is_asset = re.search(r"\.(js|css|png|jpg|jpeg|svg|woff|woff2|ttf)(\?|$)", u, re.I) is not None

            if st >= 400 or critical:
                _log(f"[response] {st} {resp.request.method} {u}")
            elif not is_asset and ("oauth.ottimizza.com.br" in u or "prd-api-oauth-tareffa" in u):
                _log(f"[response] {st} {resp.request.method} {u}")

        except Exception:
            pass


    page.on("framenavigated", on_framenav)
    page.on("console", on_console)
    page.on("pageerror", on_pageerror)
    page.on("requestfailed", on_request_failed)
    page.on("response", on_response)

def _norm(s: str) -> str:
    s = str(s or "")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return s.strip().lower()

def only_digits(v: str) -> str:
    return re.sub(r"\D", "", str(v or "")).strip()

def br_date_or_empty(v: str) -> str:
    """
    Espera dd/mm/yyyy; se vier vazio, retorna "".
    """
    s = str(v or "").strip()
    if not s:
        return ""
    if re.match(r"^\d{2}/\d{2}/\d{4}$", s):
        return s
    return ""

def first_jan_of_year(ddmmyyyy: str) -> str:
    """
    dd/mm/yyyy -> 01/01/yyyy
    """
    m = re.match(r"^\d{2}/\d{2}/(\d{4})$", ddmmyyyy or "")
    if not m:
        y = time.localtime().tm_year
        return f"01/01/{y}"
    return f"01/01/{m.group(1)}"

@dataclass
class EmpresaLote:
    cnpj: str
    razaoSocial: str = ""
    inicioAtividade: str = ""  # dd/mm/yyyy
    inscricaoEstadual: str = ""
    regimeTributario: str = ""
    cnaePrimario: str = ""
    atividades: List[str] = None
    cep: str = ""
    uf: str = ""
    municipio: str = ""

    def normalize(self) -> "EmpresaLote":
        self.cnpj = only_digits(self.cnpj)[:14]
        self.cep = only_digits(self.cep)[:8]
        self.uf = (self.uf or "").strip().upper()[:2]
        self.municipio = (self.municipio or "").strip()
        self.razaoSocial = (self.razaoSocial or "").strip()
        self.inscricaoEstadual = (self.inscricaoEstadual or "").strip()
        self.regimeTributario = (self.regimeTributario or "").strip()
        self.cnaePrimario = (self.cnaePrimario or "").strip()
        self.inicioAtividade = br_date_or_empty(self.inicioAtividade)
        self.atividades = list(self.atividades or [])
        return self

def wait_dom(page):
    page.wait_for_load_state("domcontentloaded")

def wait_new_empresa_form_ready_simple(page, timeout=45000):
    # mais estável do que CPF/CNPJ
    selector = (
        'input[placeholder*="Código ERP" i], '
        'input[placeholder*="Nome Fantasia" i], '
        'input[placeholder*="Razão Social" i], '
        'mat-form-field:has(mat-label:has-text("Código ERP")) input, '
        'mat-form-field:has(mat-label:has-text("Nome Fantasia")) input, '
        'mat-form-field:has(mat-label:has-text("Razão Social")) input'
    )
    page.wait_for_selector(selector, timeout=timeout, state="visible")
    
def is_login_like(page) -> bool:
    # heurística simples: se tem email+senha, provavelmente voltou pro login
    return _count_safe(page.locator('input[type="email"]')) and _count_safe(page.locator('input[type="password"]'))

def open_nova_empresa(page, email: str, password: str, log=None, retries: int = 8):
    def _log(m): dbg(log, m)

    for attempt in range(1, retries + 1):
        _log(f"[nav] Abrindo /empresas/nova (tentativa {attempt}/{retries})...")
        debug_state(page, log, tag="nav:before")

        # 1) sempre tente ir para serviços primeiro
        _log(f"[nav] goto SERVICOS_URL -> {SERVICOS_URL}")
        page.goto(SERVICOS_URL, wait_until="domcontentloaded")
        wait_dom(page)
        debug_state(page, log, tag="nav:after_servicos")

        if is_oauth_url(page.url):
            _log("[auth] Caiu no OAuth ao ir para serviços. Iniciando oauth_login_and_land_on_servicos...")
            oauth_login_and_land_on_servicos(page, email, password, log=log)

        _log("[auth] Esperando aterrissar em /servicos_programados...")
        wait_until_servicos_programados(page, timeout=120000, log=log)
        debug_state(page, log, tag="nav:on_servicos_ok")

        # 2) só então abre /empresas/nova
        _log(f"[nav] goto URL_EMPRESAS_NOVA -> {URL_EMPRESAS_NOVA}")
        page.goto(URL_EMPRESAS_NOVA, wait_until="domcontentloaded")
        wait_dom(page)
        debug_state(page, log, tag="nav:after_empresas_nova_goto")

        if is_oauth_url(page.url):
            _log("[auth] Caiu no OAuth ao abrir /empresas/nova. Repetindo fluxo OAuth...")
            oauth_login_and_land_on_servicos(page, email, password, log=log)
            continue

        try:
            _log("[nav] Aguardando form de Nova Empresa (Campos ERP/Nome/Razão)...")
            wait_new_empresa_form_ready_simple(page, timeout=45000)
            _log("[nav] ✅ Form de Nova Empresa detectado.")
            return
        except PWTimeout:
            debug_state(page, log, tag="nav:timeout_wait_form")
            if is_oauth_url(page.url):
                _log("[auth] Timeout esperando form e estamos no OAuth. Repetindo OAuth...")
                oauth_login_and_land_on_servicos(page, email, password, log=log)
                continue
            raise

    raise RuntimeError(f"Não consegui abrir /empresas/nova. URL final: {page.url}")

def _count_safe(locator) -> int:
    try:
        return locator.count()
    except Exception:
        return 0

def _fill_first(page, locator, value) -> bool:
    if _count_safe(locator):
        el = locator.first
        try:
            el.scroll_into_view_if_needed()
        except Exception:
            pass
        el.wait_for(state="visible", timeout=8000)
        el.fill(value)
        return True
    return False

def fill_email(page, value: str):
    candidates = [
        page.get_by_label(re.compile(r"e-?mail", re.I)),
        page.get_by_placeholder(re.compile(r"e-?mail", re.I)),
        page.locator('input[type="email"]'),
        page.locator('input[name="email"]'),
        page.locator('input[formcontrolname="email"]'),
        page.locator('input[autocomplete="username"]'),
    ]
    for loc in candidates:
        if _count_safe(loc):
            try:
                loc.first.wait_for(state="visible")
                loc.first.fill(value)
                return
            except Exception:
                continue
    raise RuntimeError("Campo de e-mail não encontrado.")

def fill_password(page, value: str):
    candidates = [
        page.get_by_label(re.compile(r"senha|password", re.I)),
        page.get_by_placeholder(re.compile(r"senha|password", re.I)),
        page.locator('input[type="password"]'),
        page.locator('input[name="password"]'),
        page.locator('input[formcontrolname="password"]'),
        page.locator('input[autocomplete="current-password"]'),
    ]
    for loc in candidates:
        if _count_safe(loc):
            try:
                loc.first.wait_for(state="visible")
                loc.first.fill(value)
                return
            except Exception:
                continue
    raise RuntimeError("Campo de senha não encontrado.")

def click_entrar(page):
    candidates = [
        page.get_by_role("button", name=re.compile(r"^\s*entrar\s*$", re.I)),
        page.locator("button").filter(has_text=re.compile(r"\bentrar\b", re.I)),
        page.locator('button[type="submit"]'),
    ]
    for loc in candidates:
        if _count_safe(loc):
            try:
                loc.first.wait_for(state="visible")
                loc.first.click()
                return
            except Exception:
                continue
    raise RuntimeError("Botão 'ENTRAR' não encontrado.")

def click_overlay_submit(page):
    # Mesma ideia do seu script atual
    alvo = page.locator('button[type="submit"][style*="position: absolute"][style*="z-index: 10"]')
    if _count_safe(alvo):
        try:
            alvo.first.wait_for(state="visible")
            alvo.first.click()
            return
        except Exception:
            pass

    comum = page.locator('button[type="submit"]')
    if _count_safe(comum):
        comum.first.click()
        return

    # tolerante: não necessariamente existe sempre
    return

def fill_codigo_erp(page, value: str):
    candidates = [
        page.get_by_placeholder(re.compile(r"^\s*C[oó]digo\s*ERP\s*$", re.I)),
        page.locator('mat-form-field:has(mat-label:has-text("Código ERP")) input'),
    ]
    for c in candidates:
        if _fill_first(page, c, value):
            return
    raise RuntimeError("Campo 'Código ERP' não encontrado.")

def fill_nome_fantasia(page, value: str):
    candidates = [
        page.get_by_placeholder(re.compile(r"^\s*Nome\s*Fantasia\s*$", re.I)),
        page.locator('mat-form-field:has(mat-label:has-text("Nome Fantasia")) input'),
    ]
    for c in candidates:
        if _fill_first(page, c, value):
            return
    raise RuntimeError("Campo 'Nome Fantasia' não encontrado.")

def fill_razao_social(page, value: str):
    candidates = [
        page.get_by_placeholder(re.compile(r"Raz[aã]o\s*Social", re.I)),
        page.locator('mat-form-field:has(mat-label:has-text("Razão Social")) input'),
    ]
    for c in candidates:
        if _fill_first(page, c, value):
            return
    raise RuntimeError("Campo 'Razão Social' não encontrado.")

def fill_cpf_cnpj(page, cnpj: str):
    digits = only_digits(cnpj)
    candidates = [
        page.get_by_placeholder(re.compile(r"CPF\s*/\s*CNPJ\s*/\s*CNO\s*/\s*CAEPF", re.I)),
        page.locator('[placeholder="CPF/CNPJ/CNO/CAEPF"]'),
        page.get_by_label(re.compile(r"CPF|CNPJ|CNO|CAEPF", re.I)),
        page.get_by_role("textbox", name=re.compile(r"CPF|CNPJ|CNO|CAEPF", re.I)),
    ]
    for c in candidates:
        if _fill_first(page, c, digits):
            return
    raise RuntimeError("Campo 'CPF/CNPJ/CNO/CAEPF' não encontrado.")

def press_enter_on_cnpj(page):
    # tenta disparar a busca automática do Tareffa
    page.keyboard.press("Enter")

def fill_inscricao_estadual(page, value: str):
    if not value:
        return
    candidates = [
        page.get_by_placeholder(re.compile(r"Inscri[cç][aã]o\s+Estadual", re.I)),
        page.locator('mat-form-field:has(mat-label:has-text("Inscrição Estadual")) input'),
    ]
    for c in candidates:
        if _fill_first(page, c, value):
            return

def fill_inicio_servico(page, ddmmyyyy: str):
    if not ddmmyyyy:
        return

    # ✅ esse campo é dd/mm/aaaa
    if not re.match(r"^\d{2}/\d{2}/\d{4}$", ddmmyyyy.strip()):
        raise ValueError(f"fill_inicio_servico espera dd/mm/aaaa. Recebi: {ddmmyyyy!r}")
    
    dbg(None, f"[data] Tentando setar Data Início Prestação -> {ddmmyyyy}")  # se você preferir, passe log aqui

    candidates = [
        page.get_by_placeholder(DATE_SERVICO_RE),
        page.locator('input.mat-datepicker-input[placeholder="Data Início da Prestação de Serviço"]'),
        page.locator('input.mat-datepicker-input[placeholder*="Prestação de Serviço" i]'),
    ]

    campo = None
    for loc in candidates:
        try:
            if loc.count():
                campo = loc.first
                campo.wait_for(state="visible", timeout=15000)
                break
        except Exception:
            continue

    if not campo:
        raise RuntimeError("Campo 'Data Início da Prestação de Serviço' não encontrado.")
    
    # depois de achar `campo`, antes de preencher:
    try:
        before = (campo.input_value() or "").strip()
    except Exception:
        before = ""

    try:
        campo.scroll_into_view_if_needed()
    except Exception:
        pass

    def clear_field():
        try:
            campo.click()
        except Exception:
            pass
        for k in ("Control+A", "Meta+A"):
            try:
                campo.press(k)
                break
            except Exception:
                pass
        for k in ("Delete", "Backspace"):
            try:
                campo.press(k)
            except Exception:
                pass
        try:
            campo.fill("")  # garante limpar máscara
        except Exception:
            pass

    # 1) tentativa principal: fill direto
    clear_field()
    campo.fill(ddmmyyyy)
    try:
        campo.press("Tab")
    except Exception:
        pass

    # valida
    try:
        val = (campo.input_value() or "").strip()
    except Exception:
        try:
            val = (campo.evaluate("el => el.value") or "").strip()
        except Exception:
            val = ""

    if val == ddmmyyyy:
        return

    # 2) fallback: type lento (algumas máscaras só aceitam typing)
    clear_field()
    campo.type(ddmmyyyy, delay=80)
    try:
        campo.press("Tab")
    except Exception:
        pass

    # valida de novo
    try:
        val2 = (campo.input_value() or "").strip()
    except Exception:
        val2 = ""

    if val2 != ddmmyyyy:
        raise RuntimeError(f"Não consegui setar a data corretamente. Esperado={ddmmyyyy}, ficou={val2!r}")
    
    # depois de validar `val`/`val2`:
    dbg(None, f"[data] antes={before!r} depois={val2!r}")

def fill_cnae_primario(page, codigo: str):
    if not codigo:
        return

    loc = page.get_by_placeholder(re.compile(r"CNAE\s*Prim[aá]rio", re.I))
    if not _count_safe(loc):
        loc = page.locator('input[role="combobox"][placeholder*="CNAE"]')
    if not _count_safe(loc):
        return

    caixa = loc.first
    caixa.scroll_into_view_if_needed()
    caixa.click()
    caixa.fill(codigo)
    caixa.press("Enter")

    # tenta selecionar primeira opção
    try:
        listbox = page.get_by_role("listbox")
        if _count_safe(listbox):
            listbox.first.wait_for(state="visible", timeout=8000)
            caixa.press("Enter")
    except PWTimeout:
        pass

def click_salvar_empresa(page):
    candidates = [
        page.locator("#btnSaveEmpresa"),
        page.get_by_role("button", name=re.compile(r"^\s*Salvar\s*$", re.I)),
        page.locator('button[mat-raised-button][color="primary"]').filter(has_text=re.compile(r"\bSalvar\b", re.I)),
    ]
    for loc in candidates:
        try:
            if _count_safe(loc):
                btn = loc.first
                try:
                    btn.scroll_into_view_if_needed()
                except Exception:
                    pass
                btn.wait_for(state="visible", timeout=8000)

                for _ in range(20):
                    try:
                        if btn.is_enabled():
                            break
                    except Exception:
                        pass
                    time.sleep(0.2)

                btn.click()
                try:
                    page.wait_for_load_state("networkidle", timeout=8000)
                except PWTimeout:
                    pass
                return True
        except Exception:
            continue
    raise RuntimeError("Botão 'Salvar' não encontrado.")

def _try_close_popups_and_blur(page, overlay):
    # fecha datepicker/menus e solta foco de máscara
    try:
        page.keyboard.press("Escape")
    except Exception:
        pass
    try:
        overlay.locator("mat-dialog-title, [mat-dialog-title], h1, h2").first.click(force=True)
    except Exception:
        pass
    try:
        page.keyboard.press("Tab")
    except Exception:
        pass


def _click_primary_dialog_button_and_wait_close(page, overlay, name_re: re.Pattern, log=None, timeout_ms: int = 15000):
    def _log(m):
        if log:
            log(m)

    # pega botão visível/habilitado (evita pegar duplicado invisível)
    btns = overlay.locator("button:visible").filter(has_text=name_re)
    if btns.count() == 0:
        btns = overlay.get_by_role("button", name=name_re)

    if btns.count() == 0:
        raise RuntimeError(f"Botão do modal não encontrado: {name_re.pattern}")

    # preferir o último (normalmente o primário fica à direita)
    btn = btns.last

    # espera habilitar
    for _ in range(60):  # ~12s
        try:
            if btn.is_enabled():
                break
        except Exception:
            pass
        time.sleep(0.2)

    try:
        if not btn.is_enabled():
            errs = _dump_overlay_errors(overlay)
            _log(f"[modal] Botão {name_re.pattern} DESABILITADO. erros={errs}")
            raise RuntimeError(f"Modal inválido (botão desabilitado). erros={errs}")
    except Exception:
        # se is_enabled falhar, segue tentando clicar mesmo assim
        pass

    # múltiplas estratégias de clique + confirmação pelo fechamento do modal
    for attempt in range(1, 6):
        _log(f"[modal] Clique '{name_re.pattern}' tentativa {attempt}/5...")
        _try_close_popups_and_blur(page, overlay)

        try:
            btn.scroll_into_view_if_needed()
        except Exception:
            pass

        # 1) click normal / force
        try:
            btn.click(timeout=4000)
        except Exception:
            try:
                btn.click(force=True, timeout=4000)
            except Exception:
                pass

        # espera fechar rápido
        try:
            overlay.wait_for(state="hidden", timeout=1200)
            _log("[modal] ✅ Modal fechou.")
            return
        except Exception:
            pass

        # 2) dispatch_event
        try:
            btn.dispatch_event("click")
        except Exception:
            pass

        try:
            overlay.wait_for(state="hidden", timeout=1200)
            _log("[modal] ✅ Modal fechou (dispatch_event).")
            return
        except Exception:
            pass

        # 3) el.click() via evaluate
        try:
            h = btn.element_handle()
            if h:
                page.evaluate("(el) => el.click()", h)
        except Exception:
            pass

        try:
            overlay.wait_for(state="hidden", timeout=1200)
            _log("[modal] ✅ Modal fechou (evaluate el.click).")
            return
        except Exception:
            pass

        # 4) clique por coordenada (bem “humano”)
        try:
            box = btn.bounding_box()
            if box:
                page.mouse.click(box["x"] + box["width"]/2, box["y"] + box["height"]/2)
        except Exception:
            pass

        try:
            overlay.wait_for(state="hidden", timeout=1200)
            _log("[modal] ✅ Modal fechou (mouse click).")
            return
        except Exception:
            pass

    # última espera longa
    errs = _dump_overlay_errors(overlay)
    _log(f"[modal] ❌ Modal não fechou. erros={errs}")
    raise RuntimeError(f"Modal não fechou após clicar {name_re.pattern}. erros={errs}")

# ---------- Modal de Regime Tributário na criação ----------
def abrir_modal_regime(page):
    btn = page.locator('button[mattooltip*="Regime Tributário"]').first
    if not _count_safe(btn):
        btn = page.locator("button").filter(has_text=re.compile(r"Regime\s*Tribut", re.I)).first
    if not _count_safe(btn):
        raise RuntimeError("Botão do Regime Tributário não encontrado.")
    btn.scroll_into_view_if_needed()
    btn.click()

    overlay = page.locator(".cdk-overlay-pane .mat-mdc-dialog-container").first
    overlay.wait_for(state="visible", timeout=15000)
    return overlay

# ✅ NOVO helper: dd/mm/yyyy -> mm/yyyy (competência)
def competencia_mm_aaaa(ddmmyyyy: str) -> str:
    """
    Converte dd/mm/yyyy -> mm/yyyy.
    Se inválido/vazio, usa mês/ano atual.
    """
    s = str(ddmmyyyy or "").strip()
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", s)
    if not m:
        return mes_ano_execucao()
    mm = m.group(2)
    yyyy = m.group(3)
    return f"{mm}/{yyyy}"


def _get_input_value_safe(inp) -> str:
    try:
        return (inp.input_value() or "").strip()
    except Exception:
        try:
            return (inp.evaluate("el => el.value") or "").strip()
        except Exception:
            return ""


def _fill_masked_input(inp, value: str, desc: str = "", log=None):
    """
    Preenchimento robusto para inputs com máscara (Angular Material etc).
    Tenta fill -> valida -> fallback type.
    """
    def _log(m):
        if log:
            log(m)

    def clear():
        try:
            inp.click()
        except Exception:
            pass
        for k in ("Control+A", "Meta+A"):
            try:
                inp.press(k)
                break
            except Exception:
                pass
        for k in ("Delete", "Backspace"):
            try:
                inp.press(k)
            except Exception:
                pass
        try:
            inp.fill("")
        except Exception:
            pass

    _log(f"[modal] set {desc} -> {value!r}")
    clear()

    # 1) fill
    try:
        inp.fill(value)
        try:
            inp.press("Tab")
        except Exception:
            pass
        try:
            inp.evaluate("""(el) => {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }""")
        except Exception:
            pass

        v1 = _get_input_value_safe(inp)
        if v1 == value:
            return
        _log(f"[modal] {desc} pós-fill ficou {v1!r} (esperado {value!r})")
    except Exception as ex:
        _log(f"[modal] {desc} fill falhou: {ex}")

    # 2) type (máscara às vezes só aceita digitando)
    clear()
    inp.type(value, delay=60)
    try:
        inp.evaluate("""(el) => {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }""")
    except Exception:
        pass

    try:
        inp.press("Tab")
    except Exception:
        pass
    v2 = _get_input_value_safe(inp)
    if v2 != value:
        raise RuntimeError(f"{desc}: não consegui setar. Esperado={value!r}, ficou={v2!r}")


def _dump_overlay_errors(overlay) -> List[str]:
    out = []
    try:
        errs = overlay.locator("mat-error, .mat-mdc-form-field-error")
        if errs.count():
            out = [t.strip() for t in errs.all_inner_texts() if (t or "").strip()]
    except Exception:
        pass
    return out


def _cancel_overlay(overlay, log=None):
    def _log(m):
        if log:
            log(m)
    try:
        btn = overlay.get_by_role("button", name=re.compile(r"^\s*Cancelar\s*$", re.I))
        if btn.count():
            _log("[modal] Clicando 'Cancelar' para fechar modal...")
            btn.first.click(force=True)
            try:
                overlay.wait_for(state="hidden", timeout=8000)
            except Exception:
                pass
    except Exception:
        pass


# 🔧 ALTERE a assinatura para aceitar log
def set_regime_e_criar(page, overlay, regime: str, inicio_competencia: str, log=None):
    def _log(m):
        if log:
            log(m)

    # regime
    campo = overlay.get_by_label(re.compile(r"Regime\s*Tribut[aá]rio", re.I))
    if not _count_safe(campo):
        campo = overlay.locator("mat-form-field:has(mat-label:has-text('Regime Tributário')) input")
    if not _count_safe(campo):
        raise RuntimeError("Campo 'Regime Tributário' no overlay não encontrado.")

    caixa = campo.first
    caixa.scroll_into_view_if_needed()
    caixa.fill(regime)
    caixa.press("Enter")

    # início do serviço (MM/AAAA) — mês atual
    try:
        ini = overlay.locator("mat-form-field").filter(
            has_text=re.compile(r"In[ií]cio\s+do\s+servi", re.I)
        ).locator("input")
        if _count_safe(ini):
            inp = ini.first
            inp.scroll_into_view_if_needed()
            _fill_masked_input(inp, mes_ano_execucao(), desc="Início do serviço (MM/AAAA)", log=log)
    except Exception:
        pass

    # ✅ Data Início Competência (MM/AAAA)
    if inicio_competencia:
        if not re.match(r"^\d{2}/\d{4}$", inicio_competencia.strip()):
            raise ValueError(f"inicio_competencia deve ser MM/AAAA. Recebi: {inicio_competencia!r}")

        dt = overlay.get_by_label(re.compile(r"In[ií]cio\s+Compet|Data\s+In[ií]cio\s+Compet", re.I))
        if not _count_safe(dt):
            dt = overlay.locator("mat-form-field").filter(
                has_text=re.compile(r"In[ií]cio\s+Compet|Data\s+In[ií]cio\s+Compet", re.I)
            ).locator("input")

        if not _count_safe(dt):
            raise RuntimeError("Campo 'Data Início Competência' no overlay não encontrado.")

        inp = dt.first
        inp.scroll_into_view_if_needed()
        _fill_masked_input(inp, inicio_competencia, desc="Data Início Competência (MM/AAAA)", log=log)

    # botão criar/atualizar
    btn = overlay.get_by_role("button", name=re.compile(r"^\s*(Criar|Atualizar)\s*$", re.I))
    if not _count_safe(btn):
        btn = overlay.locator("button").filter(has_text=re.compile(r"^\s*(Criar|Atualizar)\s*$", re.I))
    if not _count_safe(btn):
        raise RuntimeError("Botão 'Criar/Atualizar' do overlay não encontrado.")

    b = btn.first
    b.scroll_into_view_if_needed()

    # espera habilitar (se estiver inválido por máscara, não habilita)
    for _ in range(40):  # ~8s
        try:
            if b.is_enabled():
                break
        except Exception:
            pass
        time.sleep(0.2)

    if not b.is_enabled():
        errs = _dump_overlay_errors(overlay)
        _log(f"[modal] Botão Criar/Atualizar está DESABILITADO. erros={errs}")
        raise RuntimeError(f"Modal inválido (Criar desabilitado). erros={errs}")

    _log("[modal] Clicando 'Criar/Atualizar'...")
    # botão criar/atualizar (robusto)
    _log("[modal] Clicando 'Criar/Atualizar' (robusto)...")
    _click_primary_dialog_button_and_wait_close(
        page,
        overlay,
        re.compile(r"^\s*(Criar|Atualizar)\s*$", re.I),
        log=log,
        timeout_ms=20000
    )

    # aguarda fechar
    try:
        overlay.wait_for(state="hidden", timeout=15000)
    except PWTimeout:
        errs = _dump_overlay_errors(overlay)
        _log(f"[modal] Modal NÃO fechou após clicar Criar. erros={errs}")
        raise RuntimeError(f"Modal não fechou após Criar. erros={errs}")
    
JWT_RE = re.compile(r'eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+')

# ---------- Token + export CSV ----------
def extract_jwt_from_storage(page) -> Optional[str]:
    def find_in_value(v: Any) -> Optional[str]:
        if not isinstance(v, str):
            return None
        m = JWT_RE.search(v)
        return m.group(0) if m else None

    for store in ("localStorage", "sessionStorage"):
        try:
            data = page.evaluate(
                """(storeName) => {
                  const s = storeName === 'localStorage' ? window.localStorage : window.sessionStorage;
                  const out = {};
                  for (let i=0; i<s.length; i++) {
                    const k = s.key(i);
                    out[k] = s.getItem(k);
                  }
                  return out;
                }""",
                store,
            )
            for _, v in (data or {}).items():
                token = find_in_value(v)
                if token:
                    return token
        except Exception:
            pass
    return None

def download_export_csv(jwt: str, out_csv_path: str) -> str:
    headers = {
        "Accept": "*/*",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {jwt}",
        "Origin": "https://web.tareffa.com.br",
        "Referer": "https://web.tareffa.com.br/",
    }

    payload = {
        "codigoERP": "",
        "codigosERP": [],
        "razaoSocial": "",
        "cnpj": "",
        "matriz": None,
        "situacao": None,
        "isAtivo": True,
        "classificacao": [],
        "regimeTributario": [],
        "cnaePrincipal": [],
        "departamento": {"id": None, "descricao": ""},
        "responsavel": {"id": None, "nome": "", "email": ""},
        "caracteristicas": [],
    }

    r = requests.post(EXPORT_URL, headers=headers, json=payload, timeout=90)
    if r.status_code == 401:
        raise RuntimeError(f"401 no export (token inválido). Body: {r.text[:300]}")
    r.raise_for_status()

    with open(out_csv_path, "wb") as f:
        f.write(r.content)
    return out_csv_path

def parse_export_csv_map_id_by_cnpj(csv_path: str) -> Dict[str, str]:
    """
    CSV normalmente vem com colunas tipo:
    Id, Código ERP, ..., CPF/CNPJ ...
    Faremos detecção:
      - id: primeira coluna
      - cnpj: primeira célula com 14 dígitos
    """
    out = {}
    with open(csv_path, "r", encoding="utf-8", errors="ignore", newline="") as f:
        reader = csv.reader(f, delimiter=",")
        rows = list(reader)

    for row in rows:
        if not row or len(row) < 2:
            continue

        first = only_digits(row[0])
        if not first:
            continue

        cnpj_found = None
        for cell in row:
            d = only_digits(cell)
            if len(d) == 14:
                cnpj_found = d
                break

        if cnpj_found:
            out[cnpj_found] = first

    return out

# ---------- Características / serviços ----------
def click_tab(page, label_regex: str):
    tab = page.get_by_role("tab", name=re.compile(label_regex, re.I))
    if _count_safe(tab):
        tab.first.click()
        return
    # fallback: texto
    page.locator("button, a, div").filter(has_text=re.compile(label_regex, re.I)).first.click()

def click_group(page, group_regex: str):
    # coluna da esquerda (lista)
    item = page.locator("mat-list-item, .mat-mdc-list-item, li, button").filter(
        has_text=re.compile(group_regex, re.I)
    )
    if _count_safe(item):
        item.first.scroll_into_view_if_needed()
        item.first.click()
        return
    # fallback geral
    page.get_by_text(re.compile(group_regex, re.I)).first.click()

def ensure_checkbox_checked(scope, label: str):
    """
    Marca checkbox Angular Material baseado no texto.
    """
    cand = scope.locator("mat-checkbox").filter(has_text=re.compile(re.escape(label), re.I))
    if not _count_safe(cand):
        # fallback genérico
        cand = scope.locator("label").filter(has_text=re.compile(re.escape(label), re.I))

    if not _count_safe(cand):
        raise RuntimeError(f"Checkbox '{label}' não encontrada.")

    el = cand.first
    try:
        # se mat-checkbox, checa aria-checked
        box = el.locator("input[type='checkbox']")
        if _count_safe(box):
            aria = box.first.get_attribute("aria-checked")
            if aria == "true":
                return
    except Exception:
        pass

    el.scroll_into_view_if_needed()
    el.click()

def scroll_and_select_checkbox(page, label: str, max_scrolls: int = 60):
    """
    Para listas longas (Município), tenta rolar até achar.
    """
    label_norm = _norm(label)

    # tenta achar em viewport primeiro
    def find():
        cand = page.locator("mat-checkbox").filter(has_text=re.compile(re.escape(label), re.I))
        if _count_safe(cand):
            return cand.first
        return None

    el = find()
    if el:
        el.scroll_into_view_if_needed()
        el.click()
        return

    # tenta rolar em virtual viewport
    viewport = page.locator("cdk-virtual-scroll-viewport").first
    if not _count_safe(viewport):
        viewport = page.locator(".cdk-virtual-scroll-viewport").first

    if _count_safe(viewport):
        for _ in range(max_scrolls):
            el = find()
            if el:
                el.scroll_into_view_if_needed()
                el.click()
                return
            # rola um pouco
            viewport.evaluate("(v) => { v.scrollTop = v.scrollTop + 450; }")
            time.sleep(0.12)

    # fallback: rolagem da página
    for _ in range(max_scrolls):
        el = find()
        if el:
            el.scroll_into_view_if_needed()
            el.click()
            return
        page.mouse.wheel(0, 600)
        time.sleep(0.12)

    raise RuntimeError(f"Não consegui localizar '{label}' (scroll).")

def map_regime_to_label_candidates(regime: str) -> List[str]:
    r = _norm(regime)
    if "simples" in r:
        return ["Simples Nacional"]
    if "imune" in r:
        return ["Imune"]
    if "presum" in r:
        return ["Lucro Presumido", "Lucro Presumido"]
    if "real" in r:
        return ["Lucro Real Mensal", "Lucro Real Trimestral", "Lucro Real"]
    if "mei" in r:
        return ["MEI"]
    if "isento" in r:
        return ["Isento"]
    if "autonom" in r:
        return ["Autônomo", "Autonomo"]
    return [regime]

def set_caracteristicas(page, empresa: EmpresaLote):
    # Aba Características
    click_tab(page, r"Caracter[ií]sticas")
    wait_dom(page)
    time.sleep(0.5)

    # 1) Regime Tributário
    click_group(page, r"Regime\s+Tribut")
    time.sleep(0.4)
    scope = page.locator("main, .nfe-main, body").first

    if empresa.regimeTributario:
        for cand in map_regime_to_label_candidates(empresa.regimeTributario):
            try:
                ensure_checkbox_checked(scope, cand)
                break
            except Exception:
                continue

    # 2) Atividade da Empresa
    click_group(page, r"Atividade\s+da\s+Empresa")
    time.sleep(0.4)
    if empresa.atividades:
        for a in empresa.atividades:
            try:
                ensure_checkbox_checked(scope, a)
            except Exception:
                pass

    # 3) Município
    if empresa.municipio:
        click_group(page, r"Munic[ií]pio")
        time.sleep(0.4)
        scroll_and_select_checkbox(page, empresa.municipio)

    # 4) Estado
    if empresa.uf:
        click_group(page, r"Estado")
        time.sleep(0.4)
        try:
            ensure_checkbox_checked(scope, empresa.uf)
        except Exception:
            # às vezes o label é o nome do estado; tenta por UF e por "PR" etc já é UF.
            pass

    # botão Atualizar
    btn = page.get_by_role("button", name=re.compile(r"Atualizar", re.I))
    if _count_safe(btn):
        btn.first.scroll_into_view_if_needed()
        btn.first.click()
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except PWTimeout:
            pass
    time.sleep(0.8)

def gerar_servicos(page, log=None):
    def _log(m):
        if log:
            log(m)

    click_tab(page, r"Servi[çc]os")
    wait_dom(page)
    time.sleep(0.8)

    # ✅ botão exato do seu HTML (label "Gerar Serviços")
    btn = page.get_by_role("button", name=re.compile(r"gerar\s+servi[çc]os", re.I))
    btn.first.wait_for(state="visible", timeout=20000)

    # espera habilitar
    for _ in range(60):
        try:
            if btn.first.is_enabled():
                break
        except Exception:
            pass
        time.sleep(0.25)

    _log("[servicos] Clicando em 'Gerar Serviços'...")
    btn.first.click()

    # Confirmação (pode ser dialog Angular)
    time.sleep(0.6)

    # tenta achar overlay/dialog
    try:
        overlay = page.locator(".cdk-overlay-pane .mat-mdc-dialog-container").first
        if _count_safe(overlay):
            overlay.wait_for(state="visible", timeout=10000)
    except Exception:
        overlay = None

    # botão confirmar pode variar
    confirm = page.get_by_role("button", name=re.compile(r"confirmar|gerar|sim|ok", re.I))
    if not _count_safe(confirm):
        confirm = page.locator("button").filter(has_text=re.compile(r"confirmar|gerar|sim|ok", re.I))

    if _count_safe(confirm):
        _log("[servicos] Confirmando...")
        confirm.first.click()
    else:
        _log("[servicos] Não achei botão de confirmação. Seguindo...")

    # ✅ espera processamento terminar (mais tempo)
    wait_processing_settle(page, timeout=120000)
    time.sleep(1.0)

    # snackbar de sucesso (se existir)
    try:
        snack = page.locator(".mat-mdc-snack-bar-container, .mat-snack-bar-container").first
        if _count_safe(snack):
            snack.wait_for(state="visible", timeout=10000)
    except Exception:
        pass

    # Atualizar (se existir)
    upd = page.get_by_role("button", name=re.compile(r"Atualizar", re.I))
    for _ in range(20):
        if _count_safe(upd):
            try:
                if upd.first.is_enabled():
                    upd.first.click()
                    break
            except Exception:
                pass
        time.sleep(0.5)

def extract_id_from_url(url: str) -> Optional[str]:
    m = re.search(r"/empresas/(\d+)", url or "")
    return m.group(1) if m else None

def inicio_servico_mes_atual():
    t = time.localtime()
    return f"01/{t.tm_mon:02d}/{t.tm_year}"

# ✅ Ajuste em criar_empresa_no_tareffa: não reabrir /empresas/nova sempre
def criar_empresa_no_tareffa(page, emp: EmpresaLote, email: str, password: str, log=None) -> Tuple[bool, Optional[str], str]:
    # só navega se necessário
    if is_oauth_url(page.url) or (URL_EMPRESAS_NOVA not in (page.url or "")):
        open_nova_empresa(page, email, password, log=log)

    # 1) CNPJ + Enter
    fill_cpf_cnpj(page, emp.cnpj)
    press_enter_on_cnpj(page)
    time.sleep(1.0)

    # 2) Campos
    if emp.razaoSocial:
        try:
            rs_loc = page.get_by_placeholder(re.compile(r"Raz[aã]o\s*Social", re.I))
            val = rs_loc.first.evaluate("el => el.value || ''") if _count_safe(rs_loc) else ""
            if not val.strip():
                fill_razao_social(page, emp.razaoSocial)
        except Exception:
            try:
                fill_razao_social(page, emp.razaoSocial)
            except Exception:
                pass

        try:
            fill_nome_fantasia(page, emp.razaoSocial)
        except Exception:
            pass

        try:
            fill_codigo_erp(page, f"(FALTA USUÁRIOS..............) {emp.razaoSocial}")
        except Exception:
            pass

    fill_inscricao_estadual(page, emp.inscricaoEstadual)

    # ✅ dd/mm/yyyy (dia 01 do mês atual)
    inicio_prestacao = inicio_servico_mes_atual()
    fill_inicio_servico(page, inicio_prestacao)

    fill_cnae_primario(page, emp.cnaePrimario)

    # modal regime
    if emp.regimeTributario:
        overlay = None
        try:
            overlay = abrir_modal_regime(page)

            # ✅ competência (MM/AAAA) baseada no mês/ano da PRESTAÇÃO
            inicio_comp = competencia_mm_aaaa(inicio_prestacao)

            set_regime_e_criar(page, overlay, emp.regimeTributario, inicio_comp, log=log)
        except Exception as ex:
            if log:
                log(f"[regime] Falha ao setar regime/competência: {ex}")
            if overlay is not None:
                _cancel_overlay(overlay, log=log)

    resp = click_salvar_and_wait_create_response(page, timeout=45000)
    kind, emp_id, payload = parse_create_result(resp)

    if kind == "created" and emp_id:
        page.goto(f"https://web.tareffa.com.br/empresas/{emp_id}", wait_until="domcontentloaded")
        wait_dom(page)

    time.sleep(1.0)

    if not emp_id:
        emp_id = extract_id_from_url(page.url)

    if kind == "created":
        return True, emp_id, "Criada"
    if kind == "duplicate":
        return False, emp_id, "Já existe (CNPJ duplicado)"
    return False, emp_id, f"Erro ao criar (API): {payload}"

def _pred_post_create_empresa(resp) -> bool:
    try:
        req = resp.request
        return (
            req.method == "POST"
            and "prd-api-oauth-tareffa.ottimizza.dev" in resp.url
            and "/services/empresas" in resp.url
        )
    except Exception:
        return False

def click_salvar_and_wait_create_response(page, timeout=45000):
    """
    Compatível com versões antigas:
    - Preferir expect_response (mais comum existir)
    - Fallback: wait_for_event("response")
    """
    # 1) Melhor: expect_response (abre o "gate" ANTES do click)
    if hasattr(page, "expect_response"):
        with page.expect_response(_pred_post_create_empresa, timeout=timeout) as info:
            click_salvar_empresa(page)
        return info.value

    # 2) Fallback: wait_for_event (se existir)
    if hasattr(page, "wait_for_event"):
        click_salvar_empresa(page)
        return page.wait_for_event("response", predicate=_pred_post_create_empresa, timeout=timeout)

    # 3) Último fallback: sem como esperar resposta
    click_salvar_empresa(page)
    return None

def _extract_url_id_from_create_response(data: Any) -> Optional[str]:
    """
    Retorna o ID que vira a URL /empresas/{id}.
    No seu exemplo: record.empresaContabilidade.id = 40835746
    """
    if not isinstance(data, dict):
        return None

    record = data.get("record") if isinstance(data.get("record"), dict) else None
    if not record:
        # fallback se algum ambiente devolver direto o objeto
        record = data

    if isinstance(record, dict):
        ec = record.get("empresaContabilidade")
        if isinstance(ec, dict):
            # ESTE é o ID da URL (no seu print: 40835746)
            if ec.get("id") is not None:
                return str(ec["id"])

        # fallback (às vezes pode ser esse)
        if record.get("id") is not None:
            return str(record["id"])

    return None

def parse_create_result(resp):
    """
    Retorna: (kind, url_id, payload)
      kind: 'created' | 'duplicate' | 'error'
      url_id: id que monta https://web.tareffa.com.br/empresas/{url_id}
    """
    if resp is None:
        return ("error", None, {"reason": "Sem response capturada"})

    status = getattr(resp, "status", None)

    # Created/OK
    if status in (200, 201):
        try:
            data = resp.json()
        except Exception:
            data = {}
        url_id = _extract_url_id_from_create_response(data)
        return ("created", url_id, data)

    # Duplicado / validação
    if status in (400, 409):
        try:
            data = resp.json()
        except Exception:
            data = resp.text()
        return ("duplicate", None, data)

    # Outros erros
    try:
        data = resp.json()
    except Exception:
        data = resp.text()
    return ("error", None, {"status": status, "body": data})

def mes_ano_execucao() -> str:
    t = time.localtime()
    return f"{t.tm_mon:02d}/{t.tm_year}"

def wait_processing_settle(page, timeout=45000):
    t0 = time.time()
    while time.time() - t0 < timeout / 1000:
        # espera sumir spinner/backdrop comuns do Angular Material
        busy = False
        for sel in [
            ".mat-mdc-progress-spinner",
            "mat-progress-spinner",
            ".cdk-overlay-backdrop",
            ".mat-mdc-dialog-container",
        ]:
            try:
                loc = page.locator(sel)
                if _count_safe(loc) and loc.first.is_visible():
                    busy = True
                    break
            except Exception:
                pass

        if not busy:
            return
        time.sleep(0.2)

WEB_HOST = "web.tareffa.com.br"
OAUTH_HOST = "oauth.ottimizza.com.br"

SERVICOS_URL = "https://web.tareffa.com.br/servicos_programados"
SERVICOS_RE = re.compile(r"^https://web\.tareffa\.com\.br/servicos_programados(?:/)?(?:\?.*)?(?:#.*)?$", re.I)

def _host(url: str) -> str:
    try:
        return (urlparse(url or "").hostname or "").lower()
    except Exception:
        return ""

def _path(url: str) -> str:
    try:
        return (urlparse(url or "").path or "")
    except Exception:
        return ""

def is_oauth_url(url: str) -> bool:
    return OAUTH_HOST in _host(url)

def is_web_url(url: str) -> bool:
    return WEB_HOST == _host(url)

def wait_until_servicos_programados(page, timeout: int = 120000, log=None):
    def _log(m):
        if log:
            log(m)

    t0 = time.time()
    last = ""

    while (time.time() - t0) * 1000 < timeout:
        url = page.url or ""
        if url != last:
            last = url
            _log(f"[auth] URL -> {url}")

        # ✅ se chegou no alvo, ok
        if SERVICOS_RE.match(url):
            try:
                page.wait_for_load_state("domcontentloaded", timeout=20000)
            except Exception:
                pass
            return

        # ✅ MUITO IMPORTANTE: se estiver em /auth/callback, NÃO force navegação.
        if is_web_url(url):
            p = _path(url)  # usa sua função _path()
            if p.startswith("/auth/callback"):
                _log("[auth] Em /auth/callback (trocando code por token). Aguardando redirecionar...")
                # dá tempo do POST finalizar e do front redirecionar
                try:
                    page.wait_for_load_state("networkidle", timeout=20000)
                except Exception:
                    pass
                time.sleep(0.35)
                continue

        # ✅ só empurra pra serviços se estiver no WEB e NÃO estiver no callback
        if is_web_url(url) and not SERVICOS_RE.match(url):
            try:
                page.goto(SERVICOS_URL, wait_until="domcontentloaded")
            except Exception:
                pass

        time.sleep(0.35)

    raise RuntimeError(f"Timeout esperando /servicos_programados. URL final: {page.url}")

def _url_path(url: str) -> str:
    try:
        return (urlparse(url or "").path or "").lower()
    except Exception:
        return ""

def _oauth_is_login_page(page, log=None) -> bool:
    # detector com logs
    try:
        email_tb = page.get_by_role("textbox", name=re.compile(r"^email$", re.I))
        senha_tb = page.get_by_role("textbox", name=re.compile(r"^senha$|password", re.I))
        ok = email_tb.count() > 0 and senha_tb.count() > 0
        dbg(log, f"[oauth][detect] role=textbox Email/Senha -> {ok} (email={email_tb.count()} senha={senha_tb.count()})")
        if ok:
            return True
    except Exception as ex:
        dbg(log, f"[oauth][detect] role=textbox exception: {ex}")

    try:
        email_in = page.locator('input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i], input[placeholder*="e-mail" i]')
        pass_in  = page.locator('input[type="password"], input[name*="senha" i], input[placeholder*="senha" i], input[autocomplete="current-password"]')
        ok2 = email_in.count() > 0 and pass_in.count() > 0
        dbg(log, f"[oauth][detect] inputs email/pass -> {ok2} (email={email_in.count()} pass={pass_in.count()})")
        return ok2
    except Exception as ex:
        dbg(log, f"[oauth][detect] inputs exception: {ex}")
        return False

def _oauth_fill_login(page, email: str, password: str, log=None) -> bool:
    dbg(log, f"[oauth][login] Tentando preencher credenciais email={_mask_email(email)} pass={_mask_pwd(password)}")
    debug_state(page, log, tag="oauth:before_fill_login")

    # tenta role/textbox
    try:
        email_tb = page.get_by_role("textbox", name=re.compile(r"^email$", re.I)).first
        senha_tb = page.get_by_role("textbox", name=re.compile(r"^senha$|password", re.I)).first
        email_tb.wait_for(state="visible", timeout=15000)
        email_tb.click()
        email_tb.fill(email)
        senha_tb.fill(password)

        btn = page.get_by_role("button", name=re.compile(r"entrar|login|continuar|acessar", re.I))
        dbg(log, f"[oauth][login] botão (role=button entrar/login/continuar) count={btn.count()}")
        if btn.count():
            btn.first.click()
        else:
            page.keyboard.press("Enter")

        dbg(log, "[oauth][login] ✅ Login enviado (role=textbox).")
        return True
    except Exception as ex:
        dbg(log, f"[oauth][login] role=textbox falhou: {ex}")

    # fallback inputs
    try:
        email_in = page.locator(
            'input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i], input[placeholder*="e-mail" i]'
        ).first
        pass_in  = page.locator(
            'input[type="password"], input[name*="senha" i], input[placeholder*="senha" i], input[autocomplete="current-password"]'
        ).first

        email_in.wait_for(state="visible", timeout=15000)
        email_in.click()
        email_in.fill(email)
        pass_in.fill(password)

        btn = page.get_by_role("button", name=re.compile(r"entrar|login|continuar|acessar", re.I))
        dbg(log, f"[oauth][login] botão fallback count={btn.count()}")
        if btn.count():
            btn.first.click()
        else:
            page.keyboard.press("Enter")

        dbg(log, "[oauth][login] ✅ Login enviado (fallback inputs).")
        return True
    except Exception as ex:
        dbg(log, f"[oauth][login] fallback inputs falhou: {ex}")
        debug_state(page, log, tag="oauth:login_fail_state")
        return False

def click_oauth_profile_button(page, email: str, log=None) -> bool:
    dbg(log, f"[oauth][perfil] Procurando form.oauthuser pelo email={_mask_email(email)}")

    try:
        total = page.locator("form.oauthuser").count()
        dbg(log, f"[oauth][perfil] form.oauthuser total={total}")
    except Exception as ex:
        dbg(log, f"[oauth][perfil] count form.oauthuser exception: {ex}")
        total = 0

    form = page.locator("form.oauthuser").filter(has_text=re.compile(re.escape(email), re.I)).first
    if form.count() == 0:
        dbg(log, "[oauth][perfil] Não achei form pelo email. Usando o primeiro form.oauthuser.")
        form = page.locator("form.oauthuser").first

    if form.count() == 0:
        dbg(log, "[oauth][perfil] ❌ Nenhum form.oauthuser encontrado na tela.")
        debug_state(page, log, tag="oauth:perfil_not_found")
        return False

    btn = form.locator('button[type="submit"]').first
    dbg(log, f"[oauth][perfil] submit btn exists={btn.count() > 0}")

    try:
        dbg(log, "[oauth][perfil] Clicando submit do form.oauthuser (force=True)...")
        btn.click(force=True)
        _safe(lambda: page.wait_for_load_state("domcontentloaded", timeout=30000), None)
        dbg(log, "[oauth][perfil] ✅ Click enviado.")
        return True
    except Exception as ex:
        dbg(log, f"[oauth][perfil] ❌ Falha ao clicar submit: {ex}")
        return False

def oauth_login_and_land_on_servicos(page, email: str, password: str, log=None, max_rounds: int = 30):
    def _log(m): dbg(log, m)

    for r in range(1, max_rounds + 1):
        url = page.url or ""
        if not is_oauth_url(url):
            _log("[oauth] Saí do OAuth. Confirmando /servicos_programados...")
            wait_until_servicos_programados(page, timeout=120000, log=log)
            return

        path = _url_path(url)
        _log(f"[oauth] round {r}/{max_rounds} — url={url} path={path}")
        debug_state(page, log, tag=f"oauth:round{r}")

        # 1) perfil se existe form.oauthuser
        try:
            forms = page.locator("form.oauthuser")
            fc = forms.count()
            _log(f"[oauth] detector perfil: form.oauthuser count={fc}")
            if fc > 0:
                _log("[oauth] Tela de perfil detectada (form.oauthuser). Tentando selecionar...")
                ok = click_oauth_profile_button(page, email, log=log)
                _log(f"[oauth] perfil click ok={ok}")
                if ok:
                    try:
                        wait_until_servicos_programados(page, timeout=120000, log=log)
                        _log("[oauth] ✅ Aterrissou em /servicos_programados após perfil.")
                        return
                    except Exception as ex:
                        _log(f"[oauth] Ainda não chegou em /servicos_programados após perfil: {ex}")
                time.sleep(0.6)
                continue
        except Exception as ex:
            _log(f"[oauth] detector form.oauthuser exception: {ex}")

        # 2) login se /login OU inputs detectados
        is_login = path.endswith("/login") or _oauth_is_login_page(page, log=log)
        _log(f"[oauth] detector login: path.endswith('/login')={path.endswith('/login')} is_login_page={is_login}")

        if is_login:
            _log("[oauth] Tela de login detectada. Preenchendo...")
            _oauth_fill_login(page, email, password, log=log)
            time.sleep(0.8)
            continue

        # 3) chooseaccount real via PATH (sem forms ainda)
        if "oauthchooseaccount" in path:
            _log("[oauth] PATH oauthchooseaccount detectado. Esperando forms oauthuser aparecerem...")
            _safe(lambda: page.locator("form.oauthuser").first.wait_for(state="visible", timeout=15000), None)
            time.sleep(0.5)
            continue

        # 4) consent/continuar
        try:
            btn = page.get_by_role("button", name=re.compile(r"autorizar|permitir|allow|continuar|prosseguir", re.I))
            _log(f"[oauth] detector consent btn count={btn.count()}")
            if btn.count():
                _log("[oauth] Clicando consent/continuar...")
                btn.first.click(force=True)
                time.sleep(0.8)
                continue
        except Exception as ex:
            _log(f"[oauth] consent exception: {ex}")

        time.sleep(0.8)

    raise RuntimeError(f"Não consegui concluir OAuth/login+perfil. URL final: {page.url}")

def wait_until_web(page, timeout=45000):
    t0 = time.time()
    while (time.time() - t0) * 1000 < timeout:
        if is_web_url(page.url):
            return
        time.sleep(0.2)
    raise RuntimeError(f"[auth] Não cheguei no WEB dentro do tempo. URL atual: {page.url}")

def _sleep(t=0.8):
    time.sleep(t)

def wait_until_not_oauth(page, timeout=45000):
    t0 = time.time()
    while (time.time() - t0) * 1000 < timeout:
        if not is_oauth_url(page.url):
            return
        time.sleep(0.2)
    raise RuntimeError(f"Ainda preso no OAuth. URL: {page.url}")

def _safe_inner_text(handle) -> str:
    try:
        return (handle.inner_text() or "").strip()
    except Exception:
        return ""

def _click_first_useful(handles, log=None) -> bool:
    """
    Clica no primeiro item que pareça ser um 'usuário', evitando botões tipo
    'Adicionar outro usuário' / 'Gerenciar usuários'.
    """
    deny = re.compile(r"adicionar|gerenciar|novo\s+usu[aá]rio|add|manage", re.I)
    for h in handles:
        txt = _safe_inner_text(h)
        if not txt:
            continue
        if deny.search(txt):
            continue
        try:
            h.click()
            return True
        except Exception:
            try:
                h.click(force=True)
                return True
            except Exception:
                continue
    return False

def oauth_choose_or_login(page, email: str, password: str, log=None, max_rounds: int = 16):
    def _log(m):
        if log:
            log(m)

    def click_email_card():
        """
        Encontra o texto do email e clica no ancestral clicável (button/a/div role=button).
        Isso é MUITO mais confiável do que clicar num 'div' qualquer.
        """
        email_text = page.get_by_text(re.compile(re.escape(email), re.I)).first
        if email_text.count() == 0:
            return False

        # sobe para o ancestral clicável mais próximo
        cand = email_text.locator(
            "xpath=ancestor::button[1] | ancestor::a[1] | ancestor::*[@role='button'][1]"
        ).first

        try:
            cand.click()
            return True
        except Exception:
            try:
                cand.click(force=True)
                return True
            except Exception:
                return False

    def try_click_consent_if_any():
        # alguns fluxos têm “Autorizar/Permitir/Continuar”
        btn = page.get_by_role("button", name=re.compile(r"autorizar|permitir|allow|continuar|prosseguir", re.I))
        if btn.count():
            try:
                btn.first.click(force=True)
                return True
            except Exception:
                pass
        return False

    for r in range(1, max_rounds + 1):
        if not is_oauth_url(page.url):
            return

        url = page.url or ""
        _log(f"[oauth] round {r}/{max_rounds} — {url}")

        # =========================
        # (A) CHOOSE ACCOUNT real
        # =========================
        if "oauthchooseaccount" in url.lower():
            _log("[oauth] Tela de escolha de usuário (oauthchooseaccount). Tentando clicar no usuário...")
            if click_email_card():
                time.sleep(0.8)
                try:
                    page.wait_for_load_state("domcontentloaded", timeout=20000)
                except Exception:
                    pass

                # pode ir para telas intermediárias ainda no oauth; tenta consent
                try_click_consent_if_any()
                time.sleep(0.6)

                # espera chegar no WEB
                try:
                    wait_until_web(page, timeout=30000)
                    return
                except Exception:
                    # se não chegou, continua loop (às vezes volta pro chooseaccount)
                    continue
            else:
                _log("[oauth] Não achei card pelo email. Tentando fallback: primeiro botão com '@' ...")
                any_user = page.locator("button, [role=button], a, mat-card, .mat-mdc-card, .mdc-card").filter(
                    has_text=re.compile(r"@", re.I)
                )
                if any_user.count():
                    try:
                        any_user.first.click(force=True)
                    except Exception:
                        pass
                    time.sleep(0.8)
                    try_click_consent_if_any()
                    try:
                        wait_until_web(page, timeout=30000)
                        return
                    except Exception:
                        continue

        # =========================
        # (B) LOGIN (Email/Senha)
        # =========================
        try:
            email_in = page.get_by_role("textbox", name=re.compile(r"email", re.I))
            pass_in  = page.get_by_role("textbox", name=re.compile(r"senha|password", re.I))

            if email_in.count() and pass_in.count():
                _log("[oauth] Tela de login detectada. Preenchendo credenciais...")
                email_in.first.fill(email)
                pass_in.first.fill(password)

                btn = page.get_by_role("button", name=re.compile(r"entrar|acessar|login|continuar", re.I))
                if btn.count():
                    btn.first.click()
                else:
                    page.keyboard.press("Enter")

                time.sleep(1.0)
                try:
                    page.wait_for_load_state("domcontentloaded", timeout=20000)
                except Exception:
                    pass

                # após login, normalmente cai no oauthchooseaccount
                continue
        except Exception:
            pass

        # =========================
        # (C) CONSENT/CONTINUAR
        # =========================
        if try_click_consent_if_any():
            time.sleep(0.8)
            try:
                page.wait_for_load_state("domcontentloaded", timeout=20000)
            except Exception:
                pass
            continue

        time.sleep(0.8)

    raise RuntimeError(f"Não consegui concluir o OAuth. URL final: {page.url}")

def ensure_profile_selected(page, log=None, max_tries: int = 8):
    """
    No web.tareffa.com.br pode existir uma tela/diálogo interno de "perfil".
    Também cobre o caso de aparecer um modal tipo "Escolha um usuário" já NO WEB.
    """
    def _log(m):
        if log:
            log(m)

    for attempt in range(1, max_tries + 1):
        if not is_web_url(page.url):
            return

        # Detecta por texto (mais confiável que URL)
        try:
            perfil_like = page.get_by_text(re.compile(r"selecion(e|ar)\s+perfil|perfil|escolha\s+um\s+usu[aá]rio", re.I))
            if not perfil_like.count():
                return
        except Exception:
            return

        _log(f"[perfil] Tela/modal detectado (tentativa {attempt}/{max_tries}). Tentando clicar em uma opção...")

        # Clica no primeiro card/opção com '@' (usuário)
        candidates = page.locator("button, [role=button], mat-card, .mat-mdc-card, .mdc-card").filter(
            has_text=re.compile(r"@", re.I)
        )

        if candidates.count():
            _click_first_useful(candidates.element_handles(), log=_log)
            time.sleep(1.0)
            try:
                page.wait_for_load_state("domcontentloaded", timeout=20000)
            except Exception:
                pass
            continue

        # Fallback: qualquer botão “Acessar/Continuar/Entrar”
        btn = page.get_by_role("button", name=re.compile(r"selecionar|acessar|continuar|entrar", re.I))
        if btn.count():
            btn.first.click()
            time.sleep(1.0)
            continue

        time.sleep(1.0)

    # se não conseguiu, não quebra o fluxo — mas loga
    _log("[perfil] Não consegui selecionar perfil automaticamente (seguindo mesmo assim).")

def run_lote(
    empresas: List[Dict[str, Any]],
    out_dir: str,
    headless: bool = False,
    emit=None,
) -> Dict[str, Any]:
    """
    Orquestra tudo.
    """
    os.makedirs(out_dir, exist_ok=True)

    lista = [EmpresaLote(**e).normalize() for e in (empresas or [])]
    lista = [e for e in lista if e.cnpj and len(e.cnpj) == 14]
    if not lista:
        raise ValueError("Nenhuma empresa válida (CNPJ 14 dígitos).")

    tareffa_email = os.getenv("TAREFFA_EMAIL", "")
    tareffa_password = os.getenv("TAREFFA_PASSWORD", "")
    if not tareffa_email or not tareffa_password:
        raise RuntimeError("Defina TAREFFA_EMAIL e TAREFFA_PASSWORD no .env do serviço.")

    results = {
        "created": [],
        "idByCnpj": {},
        "errors": [],
    }

    def log(msg):
        if emit:
            emit("log", message=msg)
        else:
            print(msg, flush=True)

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="chrome", headless=headless)
        except Exception:
            browser = p.chromium.launch(headless=headless)

        context = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.set_default_timeout(45000)
        
        attach_page_debug(page, log=log)
        dbg(log, f"[init] DEBUG={DEBUG} (TAREFFA_DEBUG env)")
        
        token_holder = {"jwt": None}

        def on_request(req):
            try:
                # queremos o token que o app usa de verdade
                auth = req.headers.get("authorization") or req.headers.get("Authorization")
                if auth and auth.lower().startswith("bearer "):
                    token_holder["jwt"] = auth.split(" ", 1)[1].strip()
            except Exception:
                pass

        page.on("request", on_request)

        # Login
        log("Abrindo Tareffa...")
        page.goto(URL_EMPRESAS, wait_until="domcontentloaded")
        wait_dom(page)
        time.sleep(1.0)

        log("Abrindo Tareffa...")
        page.goto("https://web.tareffa.com.br/", wait_until="domcontentloaded")
        wait_dom(page)
        time.sleep(1.0)

        # Agora quem resolve auth/perfil é o open_nova_empresa
        open_nova_empresa(page, tareffa_email, tareffa_password, log=log)

        # Cadastro em lote
        total = len(lista)
        for i, emp in enumerate(lista, start=1):
            if emit:
                emit("progress", current=i, total=total, cnpj=emp.cnpj)

            try:
                ok, emp_id, msg = criar_empresa_no_tareffa(page, emp, tareffa_email, tareffa_password, log=log)
                log(f"[{i}/{total}] {emp.cnpj} -> {msg}")

                if emp_id:
                    results["idByCnpj"][emp.cnpj] = emp_id

                results["created"].append({"cnpj": emp.cnpj, "id": emp_id, "ok": ok})
            except Exception as ex:
                err = f"[{i}/{total}] {emp.cnpj} -> ERRO: {ex}"
                log(err)
                results["errors"].append({"cnpj": emp.cnpj, "error": str(ex)})

        # Se não conseguiu ID de todos, tenta export CSV por API
        missing = [e.cnpj for e in lista if e.cnpj not in results["idByCnpj"]]
        if missing:
            log(f"IDs faltando para {len(missing)} empresa(s). Tentando export CSV...")
            jwt = token_holder.get("jwt") or extract_jwt_from_storage(page)
            if jwt:
                log(f"Token encontrado (len={len(jwt)})")
                csv_path = os.path.join(out_dir, "empresas_export.csv")
                try:
                    download_export_csv(jwt, csv_path)
                    m = parse_export_csv_map_id_by_cnpj(csv_path)
                    for cnpj in missing:
                        if cnpj in m:
                            results["idByCnpj"][cnpj] = m[cnpj]
                    log("Export CSV processado.")
                except Exception as ex:
                    log(f"Falha no export CSV: {ex}")
            else:
                log("Não encontrei JWT no storage para fazer export CSV.")

        # Pós: características + gerar serviços
        # Somente para empresas com ID
        ids_total = len(results["idByCnpj"])
        if ids_total:
            log(f"Marcando características e gerando serviços para {ids_total} empresa(s)...")

        for j, emp in enumerate(lista, start=1):
            emp_id = results["idByCnpj"].get(emp.cnpj)
            if not emp_id:
                continue

            if emit:
                emit("step", step="caracteristicas_servicos", current=j, total=total, cnpj=emp.cnpj, id=emp_id)

            try:
                def open_empresa_por_id(page, emp_id: str, retries: int = 3):
                    last_url = ""
                    for _ in range(retries):
                        page.goto(f"https://web.tareffa.com.br/empresas/{emp_id}", wait_until="domcontentloaded")
                        wait_dom(page)
                        last_url = page.url
                        if f"/empresas/{emp_id}" in last_url:
                            return
                        time.sleep(1.0)
                    raise RuntimeError(f"Não consegui abrir empresa {emp_id}. URL atual: {last_url}")

                open_empresa_por_id(page, emp_id)
                time.sleep(1.0) 
                set_caracteristicas(page, emp)
                gerar_servicos(page, log=log)

                log(f"[OK] Pós-processo: {emp.cnpj} (id={emp_id})")
            except Exception as ex:
                log(f"[ERRO] Pós-processo: {emp.cnpj} (id={emp_id}) -> {ex}")
                results["errors"].append({"cnpj": emp.cnpj, "id": emp_id, "error": str(ex)})

        browser.close()

    # salva resultado
    out_json = os.path.join(out_dir, "resultado.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    return results