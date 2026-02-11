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


def to_date(s: str) -> datetime:
    return datetime.strptime(s, "%d/%m/%Y")


def norm_txt(s: str) -> str:
    if s is None:
        return ""
    s = s.strip().upper()
    s = "".join(
        c for c in unicodedata.normalize("NFKD", s)
        if not unicodedata.combining(c)
    )
    s = re.sub(r"\s+", " ", s)
    return s


def name_score(a: str, b: str) -> float:
    a = norm_txt(a)
    b = norm_txt(b)
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def parse_brl_num(s: str) -> Optional[float]:
    if s is None:
        return None
    s = s.strip()
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
    lines = extract_text_lines_from_bytes(pdf_bytes)

    date_re = re.compile(r"^\s*(\d{1,2}/\d{2}/\d{4})\s*-\s*(.*)$")
    money_re = re.compile(r"(\d{1,3}(?:\.\d{3})*,\d{2})")

    def clean_cliente(cliente_raw: str) -> str:
        s = cliente_raw

        s = re.sub(r"\bDT\s*NFISCAL:.*$", "", s, flags=re.IGNORECASE).strip()
        s = re.sub(r"\bNFISCAL:\s*\d{2}/\d{2}/\d{4}.*$", "", s, flags=re.IGNORECASE).strip()
        s = re.sub(r"\b\d{1,2}/\d{2}/\d{4}\b.*$", "", s).strip()

        s = re.sub(r"\bREVENDA\s*:\s*.*$", "", s, flags=re.IGNORECASE).strip()

        s = money_re.sub(" ", s)

        s = re.sub(r"\b\d{6,}\b.*$", "", s).strip()

        s = re.sub(r"\b[DC]\b", " ", s)
        s = re.sub(r"\bDT\b", " ", s, flags=re.IGNORECASE)

        s = re.sub(r"\s+", " ", s).strip()
        return s

    rows: List[TxRazao] = []
    buffer = ""

    def flush_buffer(buf: str):
        m = date_re.match(buf)
        if not m:
            return

        data = m.group(1)
        rest = m.group(2)

        mc = re.search(r"\bCLIENTE\s+(.+)$", rest, flags=re.IGNORECASE)
        cliente_raw = mc.group(1).strip() if mc else ""
        cliente = clean_cliente(cliente_raw)

        valores = money_re.findall(rest)
        valor_lcto = parse_brl_num(valores[0]) if valores else None
        if valor_lcto is None:
            return

        debito = float(valor_lcto)
        credito = 0.0

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
        else:
            if any(k in ln.upper() for k in ["RELATÓRIO:", "EMPRESA:", "PÁGINA:", "USUÁRIO:", "DT. LCTO.", "CONTA CONTÁBIL"]):
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
    return df


def parse_financeiro_bytes(pdf_bytes: bytes) -> pd.DataFrame:
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
        amostra = "\n".join(lines[:40])
        raise RuntimeError(
            "Não capturei nenhuma linha do Financeiro. Regex não bateu.\nAmostra:\n" + amostra
        )

    df["cliente_norm"] = df["cliente"].map(norm_txt)
    df["valor"] = (df["debito"] - df["credito"]).round(2)
    return df


def conciliar(
    df_razao: pd.DataFrame,
    df_fin: pd.DataFrame,
    valor_tol: float = 0.05,
    dias_janela: int = 31,
    limiar_nome: float = 0.72,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if df_razao.empty or df_fin.empty:
        return pd.DataFrame([]), df_razao.copy(), df_fin.copy()

    raz = df_razao.copy()
    raz["valor"] = raz["valor_round"].astype(float)
    raz["data_dt"] = raz["data"].map(to_date)

    fin_linhas = df_fin.copy()
    fin_linhas["data_dt"] = fin_linhas["data"].map(to_date)
    fin_linhas["valor"] = (fin_linhas["debito"] - fin_linhas["credito"]).round(2)

    fin_grupos = (
        fin_linhas.groupby(["data", "cpf_cnpj", "cliente_norm", "titulo_base"], as_index=False)
        .agg(
            cliente=("cliente", "first"),
            debito=("debito", "sum"),
            credito=("credito", "sum"),
            valor=("valor", "sum"),
            parcelas=("titulo", lambda s: ", ".join(sorted(set(s)))),
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

    def tipo_razao(hist: str) -> str:
        h = (hist or "").upper()
        if "LANCAMENTO DE CARTAO" in h or "LANÇAMENTO DE CARTÃO" in h:
            return "CARTAO"
        if "ADIANTAMENTO" in h:
            return "ADIANTAMENTO"
        if "VENDA A PRAZO" in h or "NF" in h:
            return "VENDA"
        return "OUTRO"

    def match_em_linhas(r):
        rv = round(float(r["valor"]), 2)
        candidates = fin_linhas[(fin_linhas["valor"] - rv).abs() <= valor_tol]
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
            sc = name_score(r["cliente"], f["cliente"])
            if sc < (limiar_nome - 0.05):
                continue
            diff_val = abs(float(f["valor"]) - rv)
            key = (diff_val, diff_dias, -sc)
            if best_key is None or key < best_key:
                best_key = key
                best = (f_i, f, sc, diff_val, diff_dias)
        return best

    def match_em_grupos(r):
        rv = round(float(r["valor"]), 2)
        candidates = fin_grupos[(fin_grupos["valor"] - rv).abs() <= valor_tol]
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
            sc = name_score(r["cliente"], g["cliente"])
            if sc < limiar_nome:
                continue
            diff_val = abs(float(g["valor"]) - rv)
            key = (diff_val, diff_dias, -sc)
            if best_key is None or key < best_key:
                best_key = key
                best = (g_i, g, sc, diff_val, diff_dias)
        return best

    mid = 0
    for r_i, r in raz.iterrows():
        if r_i in raz_used:
            continue

        regra = tipo_razao(r.get("historico", ""))

        # tenta casar primeiro em grupos (melhor para parcelas)
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
                "cliente_razao": r["cliente"],
                "cliente_fin": g["cliente"],
                "cpf_cnpj": g["cpf_cnpj"],
                "titulo_base": g["titulo_base"],
                "parcelas": g["parcelas"],
                "valor_razao": round(float(r["valor"]), 2),
                "valor_fin": float(g["valor"]),
                "diff_valor": round(diff_val, 2),
                "diff_dias": int(diff_dias),
                "score_nome": round(sc, 3),
                "historico_razao": r["historico"],
            })
            continue

        # fallback: casa em linhas
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
                "cliente_razao": r["cliente"],
                "cliente_fin": f["cliente"],
                "cpf_cnpj": f["cpf_cnpj"],
                "titulo_base": f["titulo_base"],
                "parcelas": f["titulo"],
                "valor_razao": round(float(r["valor"]), 2),
                "valor_fin": float(f["valor"]),
                "diff_valor": round(diff_val, 2),
                "diff_dias": int(diff_dias),
                "score_nome": round(sc, 3),
                "historico_razao": r["historico"],
            })

    casados = pd.DataFrame(matched_rows)
    so_razao = df_razao.drop(index=list(raz_used)).copy()
    so_fin = fin_linhas.drop(index=list(fin_line_used)).copy()

    if not casados.empty:
        casados = casados.sort_values(["modo", "diff_valor", "diff_dias", "score_nome"], ascending=[True, True, True, False])
    if not so_razao.empty:
        so_razao = so_razao.sort_values(["data", "cliente"])
    if not so_fin.empty:
        so_fin = so_fin.sort_values(["data", "cliente", "titulo_base", "titulo"])

    return casados, so_razao, so_fin


def gerar_xlsx_bytes(casados: pd.DataFrame, so_razao: pd.DataFrame, so_fin: pd.DataFrame, resumo: Dict[str, Any]) -> bytes:
    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as w:
        (casados if not casados.empty else pd.DataFrame([])).to_excel(w, index=False, sheet_name="CASADOS")
        (so_razao if not so_razao.empty else pd.DataFrame([])).to_excel(w, index=False, sheet_name="DIF_SO_RAZAO")
        (so_fin if not so_fin.empty else pd.DataFrame([])).to_excel(w, index=False, sheet_name="DIF_SO_FIN")
        pd.DataFrame([resumo]).to_excel(w, index=False, sheet_name="RESUMO_DIF")
    return bio.getvalue()

def conciliar_cartao_wilson(razao_pdf_bytes: bytes, financeiro_pdf_bytes: bytes, valor_tol: float, dias_janela: int, limiar_nome: float) -> Dict[str, Any]:
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

    # prévias em JSON (tabelas podem ser grandes; o front limita a 50)
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
