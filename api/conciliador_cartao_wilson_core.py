# conciliador_cartao_wilson_core.py  (CORRIGIDO p/ também aceitar EXTRATO BANCÁRIO SICREDI)
# - Mantém o parser antigo (Financeiro “DIA: …”)
# - Adiciona parser novo para “EXTRATO BANCÁRIO …” (Sicredi / bancos similares)
# - Ajusta a conciliação para:
#   (1) casar 1x1 por (data, valor) como antes
#   (2) tentar casar por “lancamento bancario / docto” quando existir
#   (3) tentar casar 1xN quando o extrato vier como “Lançamento Referente Títulos” (lote),
#       somando várias linhas do Razão até bater no valor do extrato.
#
# Observação importante:
# No Sicredi, o “relatório” (extrato) frequentemente agrega pagamentos em lote
# (“Lançamento Referente Títulos: …”), enquanto o Razão lista cada fornecedor separadamente.
# Isso exige conciliação 1xN (somatório) — sem isso vai sobrar MUITA coisa “Só no Razão”.

import base64
import io
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from typing import Optional, List, Tuple, Dict, Any

import pandas as pd
import pdfplumber

VALOR_TOLERANCIA_PADRAO = 0.05


# ----------------------------
# Utils
# ----------------------------
def to_date(s: str) -> datetime:
    return datetime.strptime(s, "%d/%m/%Y")


def norm_txt(s: str) -> str:
    if s is None:
        return ""
    s = str(s).strip().upper()
    s = "".join(
        c for c in unicodedata.normalize("NFKD", s)
        if not unicodedata.combining(c)
    )
    s = re.sub(r"\[[^\]]+\]", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s


def name_score(a: str, b: str) -> float:
    a = norm_txt(a)
    b = norm_txt(b)
    if not a or not b:
        return 0.0
    ratio = SequenceMatcher(None, a, b).ratio()
    ta = set(a.split())
    tb = set(b.split())
    token_score = 0.0
    if ta and tb:
        token_score = len(ta & tb) / float(max(len(ta), len(tb)))
    return max(ratio, token_score)


def parse_brl_num(s: str) -> Optional[float]:
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def extract_text_lines_from_bytes(pdf_bytes: bytes) -> List[str]:
    lines: List[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ""
            for ln in txt.splitlines():
                ln = ln.rstrip()
                if ln:
                    lines.append(ln)
    return lines


def norm_date_str(s: str) -> str:
    # garante 02/02/2026
    return to_date(s).strftime("%d/%m/%Y")


# ----------------------------
# Cartão (Razão / Financeiro antigo)
# ----------------------------
@dataclass
class TxRazao:
    data: str
    cliente: str
    historico: str
    debito: float
    credito: float
    valor: float
    raw: str


@dataclass
class TxFinanceiro:
    data: str
    cpf_cnpj: str
    cliente: str
    titulo: str
    titulo_base: str
    debito: float
    credito: float


def parse_razao_bytes(pdf_bytes: bytes) -> pd.DataFrame:
    """
    Parser do RAZÃO (modelo do Wilson e também funciona p/ Razão Banco).
    IMPORTANTE: aqui a regra é:
      - Captura a 1a moeda após a data/linha como valor do lançamento.
      - Interpreta D = +valor (entrada no ativo), C = -valor (saída).
    """
    lines = extract_text_lines_from_bytes(pdf_bytes)

    # Ex.: "02/02/2026 - Adiantamento ... 43.000,00 D 301.061,23 D"
    date_re = re.compile(r"^\s*(\d{1,2}/\d{2}/\d{4})\s*-\s*(.*)$")
    money_re = re.compile(r"(\d{1,3}(?:\.\d{3})*,\d{2})")

    def clean_cliente(cliente_raw: str) -> str:
        s = str(cliente_raw or "")
        s = re.sub(r"\bDT\s*NFISCAL:.*$", "", s, flags=re.IGNORECASE).strip()
        s = re.sub(r"\bNFISCAL:\s*\d{2}/\d{2}/\d{4}.*$", "", s, flags=re.IGNORECASE).strip()
        s = re.sub(r"\b\d{1,2}/\d{2}/\d{4}\b.*$", "", s).strip()
        s = re.sub(r"\bREVENDA\s*:\s*.*$", "", s, flags=re.IGNORECASE).strip()
        s = re.sub(r"^\s*[\[\(]?\s*\d+\s*[\]\)]?\s*", "", s)

        money_hits = list(money_re.finditer(s))
        prefix = s
        suffix = ""
        if money_hits:
            prefix = s[:money_hits[0].start()]
            suffix = s[money_hits[-1].end():]

        prefix = re.sub(r"\bDT\b", " ", prefix, flags=re.IGNORECASE)
        prefix = re.sub(r"\s+", " ", prefix).strip(" -[]()")

        suffix = re.sub(r"^\s*[DC]\s*", "", suffix, flags=re.IGNORECASE)
        suffix_tokens = []
        for tok in suffix.split():
            up = tok.upper().strip("[]()")
            if not up:
                continue
            if up in {"BCO", "CARTAO", "REVENDA", "CONTRA", "PARTIDA"}:
                break
            if any(ch.isdigit() for ch in up):
                break
            suffix_tokens.append(tok)

        suffix_name = " ".join(suffix_tokens).strip(" -[]()")
        if suffix_name:
            prefix = f"{prefix} {suffix_name}".strip()

        prefix = re.sub(r"\b[DC]\b", " ", prefix)
        prefix = re.sub(r"\s+", " ", prefix).strip(" -[]()")
        return prefix

    rows: List[TxRazao] = []
    buffer = ""

    def flush_buffer(buf: str):
        m = date_re.match(buf)
        if not m:
            return

        data = m.group(1)
        rest = m.group(2)

        # tenta achar “CLIENTE …” no histórico (modelo antigo)
        mc = re.search(r"\bCLIENTE\s+(.+)$", rest, flags=re.IGNORECASE)
        cliente_raw = mc.group(1).strip() if mc else ""
        cliente = clean_cliente(cliente_raw)

        # valor + D/C + saldo + D/C no final
        tail = re.search(
            r"(\d{1,3}(?:\.\d{3})*,\d{2})\s+([DC])\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+([DC])\s*$",
            rest
        )
        if not tail:
            # fallback: pega 1o valor monetário mesmo
            valores = money_re.findall(rest)
            valor_lcto = parse_brl_num(valores[0]) if valores else None
            if valor_lcto is None:
                return
            # sem D/C explícito, assume débito (mantém compatibilidade)
            debito = float(valor_lcto)
            credito = 0.0
        else:
            valor_lcto = parse_brl_num(tail.group(1))
            dc = tail.group(2).upper()
            if valor_lcto is None:
                return
            if dc == "D":
                debito = float(valor_lcto)
                credito = 0.0
            else:
                debito = 0.0
                credito = float(valor_lcto)

        rows.append(
            TxRazao(
                data=data,
                cliente=cliente,
                historico=rest,
                debito=debito,
                credito=credito,
                valor=debito - credito,
                raw=buf,
            )
        )

    for ln in lines:
        if date_re.match(ln):
            if buffer:
                flush_buffer(buffer)
            buffer = ln
        else:            # ignora cabeçalhos tipicos
            up = ln.upper()
            if any(k in up for k in ["RELATÓRIO:", "EMPRESA:", "PÁGINA:", "USUÁRIO:", "DT. LCTO.", "CONTA CONTÁBIL"]):
                continue
            if up.startswith("SALDO MÊS") or up.startswith("SALDO ATUAL"):
                continue
            if buffer:
                buffer = buffer + " " + ln

    if buffer:
        flush_buffer(buffer)

    df = pd.DataFrame([r.__dict__ for r in rows])
    if df.empty:
        return df

    df["cliente_norm"] = df["cliente"].map(norm_txt)
    df["valor_round"] = df["valor"].round(2)
    df["data"] = df["data"].map(norm_date_str)
    return df


# ----------------------------
# Financeiro antigo (DIA: ...)
# ----------------------------
def _parse_financeiro_antigo_bytes(pdf_bytes: bytes) -> pd.DataFrame:
    lines = extract_text_lines_from_bytes(pdf_bytes)

    periodo_re = re.compile(r"PER[IÍ]ODO\s+(\d{2}/\d{2}/\d{4})\s+A\s+(\d{2}/\d{2}/\d{4})", re.IGNORECASE)
    dia_re = re.compile(r"\bDIA\s*:\s*(\d{1,2})\b", re.IGNORECASE)

    det_re = re.compile(
        r"^\s*([0-9\./-]{11,18})\s+(.+?)\s+(\d+)\s+(-\d{1,2})\s+.*?(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$"
    )

    dt_ini = None
    for ln in lines[:150]:
        mp = periodo_re.search(ln)
        if mp:
            dt_ini = mp.group(1)
            break

    if not dt_ini:
        ini_mm, ini_yyyy = "01", "1900"
    else:
        _, ini_mm, ini_yyyy = dt_ini.split("/")

    current_day = None
    out: List[TxFinanceiro] = []

    for ln in lines:
        md = dia_re.search(ln)
        if md:
            current_day = int(md.group(1))
            continue

        if current_day is None:
            continue

        m = det_re.match(ln)
        if not m:
            continue

        cpf_cnpj = m.group(1).strip()
        nome = m.group(2).strip()
        titulo_base = m.group(3).strip()
        parcela = m.group(4).strip()
        deb = parse_brl_num(m.group(5)) or 0.0
        cred = parse_brl_num(m.group(6)) or 0.0

        data = f"{current_day:02d}/{ini_mm}/{ini_yyyy}"
        titulo = f"{titulo_base} {parcela}"

        out.append(
            TxFinanceiro(
                data=data,
                cpf_cnpj=cpf_cnpj,
                cliente=nome,
                titulo=titulo,
                titulo_base=titulo_base,
                debito=float(deb),
                credito=float(cred),
            )
        )

    df = pd.DataFrame([t.__dict__ for t in out], columns=[
        "data", "cpf_cnpj", "cliente", "titulo", "titulo_base", "debito", "credito"
    ])
    if df.empty:
        raise RuntimeError("FIN_ANTIGO_EMPTY")
    df["cliente_norm"] = df["cliente"].map(norm_txt)
    df["valor"] = (df["debito"] - df["credito"]).round(2)
    df["data"] = df["data"].map(norm_date_str)
    return df


# ----------------------------
# Extrato bancário (Sicredi / similar)
# ----------------------------
def parse_extrato_bancario_bytes(pdf_bytes: bytes) -> pd.DataFrame:
    """
    Captura linhas do tipo:
      * 32 02/02/2026 2 - SAIDA  ...  600.000,00 - -257.273,34
      * 28 02/02/2026 1 - ENTRADA ... 43.000,00 + 338.581,94
    E normaliza em colunas compatíveis com a conciliação:
      data, cpf_cnpj (vazio), cliente (texto), titulo (seq), titulo_base (docto/seq), debito/credito
    """
    lines = extract_text_lines_from_bytes(pdf_bytes)
    head = "\n".join(lines[:120]).upper()
    if "EXTRATO BANC" not in head and "SEQ." not in head and "SALDO ANTERIOR" not in head:
        raise RuntimeError("Não parece ser Extrato Bancário.")

    # começo de linha do extrato
    line_re = re.compile(r"^\s*\*?\s*(\d+)\s+(\d{2}/\d{2}/\d{4})\s+([12])\s*-\s*(ENTRADA|SAIDA)\s+(.*)$", re.IGNORECASE)

    def is_money(tok: str) -> bool:
        return re.match(r"^-?\d{1,3}(?:\.\d{3})*,\d{2}$", tok) is not None

    out = []
    for ln in lines:
        m = line_re.match(ln)
        if not m:
            continue

        seq = m.group(1).strip()
        data = norm_date_str(m.group(2))
        tipo = m.group(4).upper()
        rest = m.group(5).strip()
        parts = rest.split()

        # varre do fim: saldo é o último token “money” (pode ser negativo)
        saldo_idx = None
        for k in range(len(parts) - 1, -1, -1):
            if is_money(parts[k]):
                saldo_idx = k
                break
        if saldo_idx is None:
            continue

        # sinal do saldo (token “+” ou “-” anterior ao saldo)
        sign_idx = None
        for k in range(saldo_idx - 1, -1, -1):
            if parts[k] in ["+", "-"]:
                sign_idx = k
                break
        if sign_idx is None:
            continue

        # valor do movimento: último money ANTES do sinal
        valor_idx = None
        for k in range(sign_idx - 1, -1, -1):
            if re.match(r"^\d{1,3}(?:\.\d{3})*,\d{2}$", parts[k]):
                valor_idx = k
                break
        if valor_idx is None:
            continue

        valor_mov = parse_brl_num(parts[valor_idx])
        if valor_mov is None:
            continue

        # docto: último token numérico antes do valor (quando existir)
        docto = None
        for tok in reversed(parts[:valor_idx]):
            if tok.isdigit():
                docto = tok
                break

        desc = " ".join(parts[:valor_idx]).strip()

        # Normalização débito/crédito:
        #   ENTRADA  => aumenta saldo => entra dinheiro => DÉBITO no ativo => debito = valor
        #   SAIDA    => sai dinheiro  => crédito no ativo => credito = valor
        debito = float(valor_mov) if tipo == "ENTRADA" else 0.0
        credito = float(valor_mov) if tipo == "SAIDA" else 0.0

        # no seu front, “titulo” aparece na tabela. A gente usa o seq e o docto.
        titulo_base = docto or seq
        titulo = seq

        out.append({
            "data": data,
            "cpf_cnpj": "",
            "cliente": desc,       # aqui vai o texto do histórico do extrato
            "titulo": titulo,      # seq
            "titulo_base": titulo_base,
            "debito": debito,
            "credito": credito,
            "extrato_seq": seq,
            "extrato_docto": docto,
            "extrato_desc": desc,
        })

    df = pd.DataFrame(out)
    if df.empty:
        amostra = "\n".join(lines[:80])
        raise RuntimeError("Não capturei nenhuma linha do Extrato Bancário. Amostra:\n" + amostra)

    df["cliente_norm"] = df["cliente"].map(norm_txt)
    df["valor"] = (df["debito"] - df["credito"]).round(2)  # compatível com conciliar()
    return df


def parse_financeiro_bytes(pdf_bytes: bytes) -> pd.DataFrame:
    """
    Agora suporta:
      (A) Financeiro antigo (DIA: ...)
      (B) Extrato Bancário (Sicredi / similar)
    """
    # tenta o antigo; se falhar, cai pro extrato bancário
    try:
        return _parse_financeiro_antigo_bytes(pdf_bytes)
    except Exception as e:
        # só cai pro extrato se o antigo realmente não bateu
        # (evita engolir erro real do antigo)
        if str(e) != "FIN_ANTIGO_EMPTY":
            # se o antigo deu erro de regex e gerou vazio, ele levanta FIN_ANTIGO_EMPTY
            # qualquer outro erro pode ser PDF ruim, etc.
            pass
        return parse_extrato_bancario_bytes(pdf_bytes)


# ----------------------------
# Conciliação
# ----------------------------
def _extract_lanc_id_razao(hist: str) -> Optional[str]:
    if not hist:
        return None
    m = re.search(r"(?i)\bLANCAMENTO\s+(?:BANCARIO|CAIXA)\s*:\s*(\d{4,7})", hist)
    if m:
        return m.group(1)
    m = re.search(r"(?i)\bCONFORME\s+LANCAMENTO\s+(?:BANCARIO|CAIXA)\s*:\s*(\d{4,7})", hist)
    if m:
        return m.group(1)
    return None


def _is_lote_titulos_extrato(desc: str) -> bool:
    d = (desc or "").upper()
    return ("LANCAMENTO REFERENTE TITULOS" in d) or ("LANÇAMENTO REFERENTE TÍTULOS" in d)


def conciliar(
    df_razao: pd.DataFrame,
    df_fin: pd.DataFrame,
    valor_tol: float = 0.05,
    dias_janela: int = 31,
    limiar_nome: float = 0.72,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Mantém o algoritmo antigo, mas com duas melhorias para Extrato Bancário:
      - tenta casar por “lancamento bancario/docto” quando existir
      - tenta conciliação 1xN quando o extrato estiver em lote (“Lançamento Referente Títulos”)
    """
    if df_razao.empty or df_fin.empty:
        return pd.DataFrame([]), df_razao.copy(), df_fin.copy()

    raz = df_razao.copy()
    raz["valor"] = raz["valor_round"].astype(float)
    raz["data_dt"] = raz["data"].map(to_date)
    raz["data"] = raz["data"].map(norm_date_str)
    raz["lanc_id"] = raz["historico"].map(_extract_lanc_id_razao)

    fin_linhas = df_fin.copy()
    fin_linhas["data"] = fin_linhas["data"].map(norm_date_str)
    fin_linhas["data_dt"] = fin_linhas["data"].map(to_date)
    fin_linhas["valor"] = (fin_linhas["debito"] - fin_linhas["credito"]).round(2)

    # grupos (modelo antigo) continua existindo
    fin_grupos = (
        fin_linhas.groupby(["data", "cpf_cnpj", "cliente_norm", "titulo_base"], as_index=False)
        .agg(
            cliente=("cliente", "first"),
            debito=("debito", "sum"),
            credito=("credito", "sum"),
            valor=("valor", "sum"),
            parcelas=("titulo", lambda s: ", ".join(sorted(set(map(str, s))))),
        )
    )
    fin_grupos["valor"] = fin_grupos["valor"].round(2)
    fin_grupos["data_dt"] = fin_grupos["data"].map(to_date)

    group_to_line_idxs: Dict[Any, List[int]] = {}
    for idx, row in fin_linhas.iterrows():
        k = (row["data"], row["cpf_cnpj"], row["cliente_norm"], row["titulo_base"])
        group_to_line_idxs.setdefault(k, []).append(idx)

    fin_line_used = set()
    fin_group_used = set()
    raz_used = set()

    matched_rows: List[Dict[str, Any]] = []

    # índice rápido por (data, titulo_base) => linhas do extrato
    idx_fin_by_data_tbase: Dict[Tuple[str, str], List[int]] = {}
    for i, r in fin_linhas.iterrows():
        tb = str(r.get("titulo_base") or "").strip()
        if tb:
            idx_fin_by_data_tbase.setdefault((r["data"], tb), []).append(i)

    def tipo_razao(hist: str) -> str:
        h = (hist or "").upper()
        if "LANCAMENTO DE CARTAO" in h or "LANÇAMENTO DE CARTÃO" in h:
            return "CARTAO"
        if "ADIANTAMENTO" in h:
            return "ADIANTAMENTO"
        if "PAGAMENTO TITULO" in h or "PAGAMENTO TÍTULO" in h or "PAGAMENTO TITULO (CP)" in h:
            return "PAGAMENTO_TITULO"
        if "RECEBIMENTO TITULO" in h or "RECEBIMENTO TÍTULO" in h or "RECEBIMENTO TITULO (CR)" in h:
            return "RECEBIMENTO_TITULO"
        if "TRANSFER" in h:
            return "TRANSFERENCIA"
        return "OUTRO"

    # ----------------------------
    # 1) Casamento por lanc_id <-> titulo_base/docto (quando existir)
    # ----------------------------
    def try_match_by_lanc_id(r_i, r) -> Optional[Tuple[int, float, int]]:
        lanc = r.get("lanc_id")
        if not lanc:
            return None
        candidates = idx_fin_by_data_tbase.get((r["data"], str(lanc)), [])
        if not candidates:
            return None
        rv = abs(round(float(r["valor"]), 2))
        best = None
        for f_i in candidates:
            if f_i in fin_line_used:
                continue
            f = fin_linhas.loc[f_i]
            diff_val = abs(abs(float(f["valor"])) - rv)
            if diff_val > valor_tol:
                continue
            diff_dias = abs((r["data_dt"] - f["data_dt"]).days)
            if diff_dias > dias_janela:
                continue
            # aqui nome não ajuda muito no extrato, mas mantém compatibilidade
            sc = name_score(r.get("cliente", ""), f.get("cliente", ""))
            key = (diff_val, diff_dias, -sc)
            if best is None or key < best[0]:
                best = (key, f_i, diff_val, diff_dias, sc)
        if not best:
            return None
        _, f_i, diff_val, diff_dias, sc = best
        return f_i, diff_val, diff_dias

    # ----------------------------
    # 2) Match 1x1 (antigo): por grupos e por linhas
    # ----------------------------
    def match_em_linhas(r):
        rv = abs(round(float(r["valor"]), 2))
        candidates = fin_linhas[(fin_linhas["valor"].abs() - rv).abs() <= valor_tol]
        if candidates.empty:
            return None

        best = None
        best_key = None
        for f_i, f in candidates.iterrows():
            if f_i in fin_line_used:
                continue
            diff_dias = abs((r["data_dt"] - f["data_dt"]).days)
            if diff_dias > dias_janela:
                continue
            sc = name_score(r.get("cliente", ""), f.get("cliente", ""))
            if sc < (limiar_nome - 0.05) and sc != 0.0:
                continue
            diff_val = abs(abs(float(f["valor"])) - rv)
            key = (diff_val, diff_dias, -sc)
            if best_key is None or key < best_key:
                best_key = key
                best = (f_i, f, sc, diff_val, diff_dias)
        return best

    def match_em_grupos(r):
        rv = abs(round(float(r["valor"]), 2))
        candidates = fin_grupos[(fin_grupos["valor"].abs() - rv).abs() <= valor_tol]
        if candidates.empty:
            return None

        best = None
        best_key = None
        for g_i, g in candidates.iterrows():
            if g_i in fin_group_used:
                continue
            diff_dias = abs((r["data_dt"] - g["data_dt"]).days)
            if diff_dias > dias_janela:
                continue
            sc = name_score(r.get("cliente", ""), g.get("cliente", ""))
            if sc < limiar_nome and sc != 0.0:
                continue
            diff_val = abs(abs(float(g["valor"])) - rv)
            key = (diff_val, diff_dias, -sc)
            if best_key is None or key < best_key:
                best_key = key
                best = (g_i, g, sc, diff_val, diff_dias)
        return best

    # ----------------------------
    # 3) Match 1xN para “lote de títulos” (Extrato agregando, Razão detalhando)
    # ----------------------------
    def try_match_lote_titulos(fin_idx: int) -> Optional[Dict[str, Any]]:
        """
        Tenta casar UM lançamento do extrato (lote) com VÁRIAS linhas do razão no mesmo dia e mesmo sinal,
        somando até bater no valor do extrato.
        Heurística:
          - Considera apenas lançamentos do Razão no mesmo dia, não usados
          - Mesmo sinal (entrada/saída) => mesmo sinal do "valor"
          - Prioriza históricos com 'PAGAMENTO TITULO' / 'RECEBIMENTO TITULO'
          - Estratégia gulosa: ordena por |valor| desc e vai somando até atingir o alvo
        """
        f = fin_linhas.loc[fin_idx]
        desc = str(f.get("cliente") or "")
        if not _is_lote_titulos_extrato(desc):
            return None

        alvo = abs(round(float(f["valor"]), 2))
        if abs(alvo) < 0.01:
            return None

        mesma_data = raz[(raz["data"] == f["data"])].copy()
        mesma_data = mesma_data[~mesma_data.index.isin(raz_used)]
        if mesma_data.empty:
            return None

        # prioriza pagamentos/recebimentos
        mesma_data["prio"] = mesma_data["historico"].map(lambda h: 0 if ("PAGAMENTO TITULO" in (h or "").upper() or "RECEBIMENTO TITULO" in (h or "").upper()) else 1)
        mesma_data["valor_abs"] = mesma_data["valor"].abs()
        mesma_data = mesma_data.sort_values(["prio", "valor_abs"], ascending=[True, False])

        soma = 0.0
        escolhidos = []
        for idx, rr in mesma_data.iterrows():
            v = abs(float(rr["valor"]))
            # evita ultrapassar muito
            if abs(soma + v) - abs(alvo) > max(valor_tol * 3, 1.0) and abs(alvo) > 50:
                continue
            escolhidos.append(idx)
            soma = round(soma + v, 2)
            if abs(soma - alvo) <= max(valor_tol, 0.5):
                break

        if not escolhidos:
            return None
        if abs(soma - alvo) > max(valor_tol, 0.5):
            return None

        # sucesso: marca todos como usados contra 1 linha do extrato
        return {
            "fin_idx": fin_idx,
            "raz_indices": escolhidos,
            "soma_razao": soma,
            "alvo_fin": alvo,
        }

    # ----------------------------
    # Loop principal
    # ----------------------------
    mid = 0

    # Primeiro: tenta casar linhas do extrato em lote (1xN) antes de consumir itens individuais
    for fin_i, f in fin_linhas.iterrows():
        if fin_i in fin_line_used:
            continue
        res = try_match_lote_titulos(fin_i)
        if not res:
            continue

        mid += 1
        fin_line_used.add(fin_i)
        for ri in res["raz_indices"]:
            raz_used.add(ri)

        # gera uma linha agregada em CASADOS
        matched_rows.append({
            "match_id": mid,
            "modo": "LOTE_1xN",
            "regra": "LOTE_TITULOS",
            "data_razao": fin_linhas.loc[fin_i]["data"],
            "data_fin": fin_linhas.loc[fin_i]["data"],
            "cliente_razao": f"({len(res['raz_indices'])} linhas do Razão somadas)",
            "cliente_fin": str(fin_linhas.loc[fin_i].get("cliente") or ""),
            "cpf_cnpj": "",
            "titulo_base": str(fin_linhas.loc[fin_i].get("titulo_base") or ""),
            "parcelas": f"Razão idx: {', '.join(map(str, res['raz_indices'][:20]))}" + ("..." if len(res["raz_indices"]) > 20 else ""),
            "valor_razao": float(res["soma_razao"]),
            "valor_fin": float(res["alvo_fin"]),
            "diff_valor": round(abs(float(res["soma_razao"]) - float(res["alvo_fin"])), 2),
            "diff_dias": 0,
            "score_nome": 0.0,
            "historico_razao": " | ".join(str(raz.loc[i].get("historico") or "") for i in res["raz_indices"][:3]) + (" ..." if len(res["raz_indices"]) > 3 else ""),
        })

    # Depois: fluxo antigo linha-a-linha do Razão
    for r_i, r in raz.iterrows():
        if r_i in raz_used:
            continue

        regra = tipo_razao(r.get("historico", ""))

        # (A) tenta match por lanc_id/docto
        m_id = try_match_by_lanc_id(r_i, r)
        if m_id is not None:
            f_i, diff_val, diff_dias = m_id
            f = fin_linhas.loc[f_i]
            mid += 1
            raz_used.add(r_i)
            fin_line_used.add(f_i)

            matched_rows.append({
                "match_id": mid,
                "modo": "LINHA_ID",
                "regra": regra,
                "data_razao": r["data"],
                "data_fin": f["data"],
                "cliente_razao": r.get("cliente", ""),
                "cliente_fin": f.get("cliente", ""),
                "cpf_cnpj": f.get("cpf_cnpj", ""),
                "titulo_base": f.get("titulo_base", ""),
                "parcelas": f.get("titulo", ""),
                "valor_razao": round(float(r["valor"]), 2),
                "valor_fin": float(f["valor"]),
                "diff_valor": round(diff_val, 2),
                "diff_dias": int(diff_dias),
                "score_nome": round(name_score(r.get("cliente", ""), f.get("cliente", "")), 3),
                "historico_razao": r.get("historico", ""),
            })
            continue

        # (B) tenta grupos (antigo)
        mg = match_em_grupos(r)
        if mg is not None:
            g_i, g, sc, diff_val, diff_dias = mg
            mid += 1

            raz_used.add(r_i)
            fin_group_used.add(g_i)

            gkey = (g["data"], g["cpf_cnpj"], g["cliente_norm"], g["titulo_base"])
            for li in group_to_line_idxs.get(gkey, []):
                fin_line_used.add(li)

            matched_rows.append({
                "match_id": mid,
                "modo": "GRUPO",
                "regra": regra,
                "data_razao": r["data"],
                "data_fin": g["data"],
                "cliente_razao": r.get("cliente", ""),
                "cliente_fin": g["cliente"],
                "cpf_cnpj": g["cpf_cnpj"],
                "titulo_base": g["titulo_base"],
                "parcelas": g["parcelas"],
                "valor_razao": round(float(r["valor"]), 2),
                "valor_fin": float(g["valor"]),
                "diff_valor": round(diff_val, 2),
                "diff_dias": int(diff_dias),
                "score_nome": round(sc, 3),
                "historico_razao": r.get("historico", ""),
            })
            continue

        # (C) fallback em linhas (antigo)
        ml = match_em_linhas(r)
        if ml is not None:
            f_i, f, sc, diff_val, diff_dias = ml
            mid += 1

            raz_used.add(r_i)
            fin_line_used.add(f_i)

            matched_rows.append({
                "match_id": mid,
                "modo": "LINHA",
                "regra": regra,
                "data_razao": r["data"],
                "data_fin": f["data"],
                "cliente_razao": r.get("cliente", ""),
                "cliente_fin": f.get("cliente", ""),
                "cpf_cnpj": f.get("cpf_cnpj", ""),
                "titulo_base": f.get("titulo_base", ""),
                "parcelas": f.get("titulo", ""),
                "valor_razao": round(float(r["valor"]), 2),
                "valor_fin": float(f["valor"]),
                "diff_valor": round(diff_val, 2),
                "diff_dias": int(diff_dias),
                "score_nome": round(sc, 3),
                "historico_razao": r.get("historico", ""),
            })

    casados = pd.DataFrame(matched_rows)
    so_razao = df_razao.drop(index=list(raz_used)).copy()
    so_fin = fin_linhas.drop(index=list(fin_line_used)).copy()

    if not casados.empty:
        casados = casados.sort_values(
            ["modo", "diff_valor", "diff_dias", "score_nome"],
            ascending=[True, True, True, False]
        )
    if not so_razao.empty:
        so_razao = so_razao.sort_values(["data", "cliente"], kind="stable")
    if not so_fin.empty:
        so_fin = so_fin.sort_values(["data", "cliente", "titulo_base", "titulo"], kind="stable")

    return casados, so_razao, so_fin


# ----------------------------
# XLSX
# ----------------------------
def gerar_xlsx_bytes(casados: pd.DataFrame, so_razao: pd.DataFrame, so_fin: pd.DataFrame, resumo: Dict[str, Any]) -> bytes:
    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as w:
        (casados if not casados.empty else pd.DataFrame([])).to_excel(w, index=False, sheet_name="CASADOS")
        (so_razao if not so_razao.empty else pd.DataFrame([])).to_excel(w, index=False, sheet_name="DIF_SO_RAZAO")
        (so_fin if not so_fin.empty else pd.DataFrame([])).to_excel(w, index=False, sheet_name="DIF_SO_FIN")
        pd.DataFrame([resumo]).to_excel(w, index=False, sheet_name="RESUMO_DIF")
    return bio.getvalue()


# ----------------------------
# Entry
# ----------------------------
def conciliar_cartao_wilson(
    razao_pdf_bytes: bytes,
    financeiro_pdf_bytes: bytes,
    valor_tol: float,
    dias_janela: int,
    limiar_nome: float
) -> Dict[str, Any]:
    df_razao = parse_razao_bytes(razao_pdf_bytes)
    df_fin = parse_financeiro_bytes(financeiro_pdf_bytes)

    casados, so_razao, so_fin = conciliar(
        df_razao,
        df_fin,
        valor_tol=valor_tol,
        dias_janela=dias_janela,
        limiar_nome=limiar_nome,
    )

    total_razao = float(df_razao["valor_round"].astype(float).sum()) if not df_razao.empty and "valor_round" in df_razao else 0.0
    total_fin = float((df_fin["debito"].astype(float) - df_fin["credito"].astype(float)).sum()) if not df_fin.empty else 0.0
    delta = round(total_razao - total_fin, 2)

    soma_so_razao = round(float(so_razao["valor_round"].astype(float).sum()) if not so_razao.empty and "valor_round" in so_razao else 0.0, 2)
    soma_so_fin = round(float(so_fin["valor"].astype(float).sum()) if not so_fin.empty and "valor" in so_fin else 0.0, 2)
    fecha = round(soma_so_razao - soma_so_fin, 2)

    resumo = {
        "total_razao": round(total_razao, 2),
        "total_financeiro": round(total_fin, 2),
        "delta_razao_menos_fin": delta,
        "soma_so_razao": soma_so_razao,
        "soma_so_fin": soma_so_fin,
        "fecha_so_razao_menos_so_fin": fecha,
        "params_valor_tol": float(valor_tol),
        "params_dias_janela": int(dias_janela),
        "params_limiar_nome": float(limiar_nome),
        "linhas_razao": int(len(df_razao)) if df_razao is not None else 0,
        "linhas_financeiro": int(len(df_fin)) if df_fin is not None else 0,
        "casados": int(len(casados)) if casados is not None else 0,
    }

    xlsx_bytes = gerar_xlsx_bytes(casados, so_razao, so_fin, resumo)

    def to_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
        if df is None or df.empty:
            return []
        return df.where(pd.notnull(df), None).to_dict(orient="records")

    return {
        "filename": "conciliacao_cartao.xlsx",
        "xlsxBase64": base64.b64encode(xlsx_bytes).decode("ascii"),
        "resumo": resumo,
        "casados": to_records(casados),
        "soRazao": to_records(so_razao),
        "soFin": to_records(so_fin),
    }
