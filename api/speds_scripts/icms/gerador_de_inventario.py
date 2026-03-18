#!/usr/bin/env python3
"""
Gerador de inventario SPED (0200 + Bloco H) a partir de relatorio Excel/PDF.

Uso:
  python gerador_de_inventario.py caminho/relatorio.xlsx --dt-inv 31/01/2026
  python gerador_de_inventario.py caminho/relatorio.pdf --dt-inv 2026-01-31 --mot-inv 01
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import pandas as pd

DEC_2 = Decimal("0.01")


DATE_PATTERNS: List[Tuple[str, re.Pattern[str]]] = [
    ("%d/%m/%Y", re.compile(r"^\d{2}/\d{2}/\d{4}$")),
    ("%Y-%m-%d", re.compile(r"^\d{4}-\d{2}-\d{2}$")),
    ("%d%m%Y", re.compile(r"^\d{8}$")),
]

HEADER_KEYWORDS = {
    "codigo",
    "cod",
    "item",
    "referencia",
    "descricao",
    "produto",
    "unidade",
    "qtd",
    "quantidade",
    "saldo",
    "unitario",
    "valor",
    "total",
    "ncm",
    "cest",
}

COLUMN_INTENTS: Dict[str, List[str]] = {
    "cod_item": ["codigo", "cod_item", "cod", "item", "referencia", "ref"],
    "descr_item": ["descricao", "descricao_item", "produto", "item_desc", "mercadoria"],
    "unid": ["unidade", "unid", "und", "um", "u_m"],
    "qtd": ["quantidade", "qtd", "qtde", "saldo", "estoque"],
    "vl_unit": ["unitario", "valor_unitario", "vl_unit", "custo_unitario", "preco", "custo"],
    "vl_item": ["total", "valor_total", "vl_total", "valor_item"],
    "ncm": ["ncm", "nbm"],
    "tipo_item": ["tipo_item", "tipo"],
    "cod_barra": ["cod_barra", "codigo_barra", "barra", "ean", "gtin"],
    "aliq_icms": ["aliq_icms", "aliquota_icms", "icms"],
    "cest": ["cest"],
}

UNID_DESCR_PADRAO: Dict[str, str] = {
    "UN": "UNIDADE",
    "KG": "QUILOGRAMA",
    "CX": "CAIXA",
    "PR": "PAR",
    "MT": "METRO",
    "M2": "METRO QUADRADO",
    "M3": "METRO CUBICO",
    "LT": "LITRO",
    "ML": "MILILITRO",
    "RL": "ROLO",
    "PC": "PECA",
    "FD": "FARDO",
    "SC": "SACO",
    "JG": "JOGO",
    "DZ": "DUZIA",
    "PCT": "PACOTE",
}


@dataclass
class AggregatedItem:
    cod_item: str
    descr_item: str
    unid: str
    tipo_item: str
    ncm: str
    cod_barra: str = ""
    aliq_icms: str = ""
    cest: str = ""
    qtd: Decimal = Decimal("0")
    vl_item: Decimal = Decimal("0")

    @property
    def vl_unit(self) -> Decimal:
        if self.qtd == 0:
            return Decimal("0")
        return self.vl_item / self.qtd


def parse_date_any(x: Any) -> Optional[date]:
    if x is None:
        return None
    s = str(x).strip()
    if not s:
        return None
    for fmt, rx in DATE_PATTERNS:
        if rx.match(s):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                return None
    return None


def to_decimal_ptbr(x: Any) -> Optional[Decimal]:
    if x is None:
        return None
    if isinstance(x, (int, float)):
        if pd.isna(x):
            return None
        return Decimal(str(x))

    s = str(x).strip()
    if not s:
        return None
    if s.lower() in {"nan", "none", "nat"}:
        return None

    s = s.replace("R$", "").replace("\xa0", "").replace(" ", "")
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1]

    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif s.count(".") > 1:
        s = s.replace(".", "")

    try:
        v = Decimal(s)
        return -v if neg else v
    except Exception:
        return None


def format_sped_decimal(value: Decimal | float | int, decimals: int) -> str:
    q = Decimal(str(value)).quantize(
        Decimal("1." + ("0" * decimals)),
        rounding=ROUND_HALF_UP,
    )
    if q == Decimal("-0." + ("0" * decimals)):
        q = Decimal("0." + ("0" * decimals))
    return f"{q:.{decimals}f}".replace(".", ",")


def round_decimal(value: Decimal | float | int, decimals: int = 2) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("1." + ("0" * decimals)), rounding=ROUND_HALF_UP)


def format_sped_cst(value: str, default: str = "000") -> str:
    s = clean_field_text(value)
    digits = "".join(ch for ch in s if ch.isdigit())
    if not digits:
        return default
    if len(digits) > 3:
        digits = digits[-3:]
    return digits.zfill(3)


def clean_field_text(x: Any) -> str:
    if x is None:
        return ""
    s = str(x)
    s = s.replace("|", " ")
    s = s.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_colname(s: Any) -> str:
    text = clean_field_text(s).lower()
    if not text:
        return ""
    trans = str.maketrans(
        {
            "á": "a",
            "à": "a",
            "â": "a",
            "ã": "a",
            "ä": "a",
            "é": "e",
            "è": "e",
            "ê": "e",
            "ë": "e",
            "í": "i",
            "ì": "i",
            "î": "i",
            "ï": "i",
            "ó": "o",
            "ò": "o",
            "ô": "o",
            "õ": "o",
            "ö": "o",
            "ú": "u",
            "ù": "u",
            "û": "u",
            "ü": "u",
            "ç": "c",
        }
    )
    text = text.translate(trans)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    text = re.sub(r"\s+", "_", text).strip("_")
    return text


def normalize_header_names(cols: Iterable[Any]) -> List[str]:
    normalized = [normalize_colname(c) for c in cols]
    normalized = [c if c else f"col_{i+1}" for i, c in enumerate(normalized)]
    seen: Dict[str, int] = {}
    out: List[str] = []
    for col in normalized:
        n = seen.get(col, 0) + 1
        seen[col] = n
        out.append(col if n == 1 else f"{col}_{n}")
    return out


def header_score(row: List[Any]) -> float:
    texts = [clean_field_text(v) for v in row]
    non_empty = [t for t in texts if t]
    if len(non_empty) < 3:
        return 0.0
    hits = 0
    for t in non_empty:
        lt = t.lower()
        if any(k in lt for k in HEADER_KEYWORDS):
            hits += 1
    return len(non_empty) * 1.0 + hits * 2.5


def promote_detected_header(df: pd.DataFrame, max_scan_rows: int = 30) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    scan_n = min(max_scan_rows, len(df))
    best_i = None
    best_s = 0.0
    for i in range(scan_n):
        s = header_score(df.iloc[i].tolist())
        if s > best_s:
            best_s = s
            best_i = i
    if best_i is None or best_s <= 0:
        out = df.copy()
        out.columns = normalize_header_names(list(out.columns))
        return out
    header = df.iloc[best_i].tolist()
    out = df.iloc[best_i + 1 :].copy()
    out.columns = normalize_header_names(header)
    out = out.dropna(how="all")
    return out


def read_excel_report(path: Path) -> pd.DataFrame:
    ext = path.suffix.lower()
    if ext == ".xlsx":
        raw = pd.read_excel(path, header=None, dtype=object)
    elif ext == ".xls":
        try:
            raw = pd.read_excel(path, header=None, dtype=object, engine="xlrd")
        except ImportError as exc:
            raise RuntimeError(
                "Para ler .xls, instale a dependencia: pip install xlrd"
            ) from exc
    else:
        raise ValueError(f"Extensao de Excel nao suportada: {ext}")

    df = promote_detected_header(raw)
    df.columns = normalize_header_names(list(df.columns))
    return df


def read_pdf_report(path: Path) -> pd.DataFrame:
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError(
            "Leitura de PDF requer 'pdfplumber'. Instale com: pip install pdfplumber"
        ) from exc

    table_groups: Dict[Tuple[str, ...], List[pd.DataFrame]] = {}

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for table in tables:
                if not table:
                    continue
                width = max(len(r) for r in table if r)
                rows: List[List[Any]] = []
                for row in table:
                    if row is None:
                        continue
                    vals = [clean_field_text(c) for c in row]
                    if len(vals) < width:
                        vals.extend([""] * (width - len(vals)))
                    rows.append(vals)

                if len(rows) < 2:
                    continue

                raw = pd.DataFrame(rows)
                df = promote_detected_header(raw)
                if df is None or df.empty:
                    continue
                df.columns = normalize_header_names(list(df.columns))
                key = tuple(df.columns)
                table_groups.setdefault(key, []).append(df)

    if not table_groups:
        raise ValueError(
            "Nao foi possivel extrair tabelas do PDF. Verifique se o PDF contem tabela legivel."
        )

    best_df: Optional[pd.DataFrame] = None
    best_score = -1.0

    for frames in table_groups.values():
        merged = pd.concat(frames, ignore_index=True)
        cands = detect_columns(merged)
        required_hits = 0
        for req in ("cod_item", "descr_item", "qtd"):
            if cands.get(req):
                required_hits += 1
        if cands.get("vl_item") or cands.get("vl_unit"):
            required_hits += 1
        score = required_hits * 100 + len(merged)
        if score > best_score:
            best_score = score
            best_df = merged

    if best_df is None or best_df.empty:
        raise ValueError("Nao foi possivel selecionar uma tabela valida no PDF.")
    return best_df


def read_report(path: Path) -> pd.DataFrame:
    ext = path.suffix.lower()
    if ext in {".xlsx", ".xls"}:
        return read_excel_report(path)
    if ext == ".pdf":
        return read_pdf_report(path)
    raise ValueError("Formato nao suportado. Use Excel (.xls/.xlsx) ou PDF.")


def column_name_matches_intent(col_norm: str, key_norm: str) -> bool:
    if not col_norm or not key_norm:
        return False
    if col_norm == key_norm:
        return True
    col_tokens = [t for t in col_norm.split("_") if t]
    key_tokens = [t for t in key_norm.split("_") if t]
    if key_tokens and all(t in col_tokens for t in key_tokens):
        return True
    if len(key_norm) <= 3:
        return key_norm in col_tokens
    return key_norm in col_norm


def detect_columns(df: pd.DataFrame) -> Dict[str, List[Tuple[str, float]]]:
    candidates: Dict[str, List[Tuple[str, float]]] = {k: [] for k in COLUMN_INTENTS}

    for col in df.columns:
        col_name = str(col)
        sample = df[col].dropna().head(200)

        for intent, keys in COLUMN_INTENTS.items():
            name_score = 0.0
            for key in keys:
                if column_name_matches_intent(col_name, normalize_colname(key)):
                    name_score += 1.0

            # Evita mapeamentos automaticos por conteudo em colunas com nome sem relacao.
            if name_score <= 0:
                continue

            content_score = 0.0
            sample_size = max(1, len(sample))

            if intent == "cod_item":
                hits = 0
                for v in sample.astype(str):
                    vv = normalize_item_code(v)
                    if vv and len(vv) <= 60:
                        hits += 1
                content_score = hits / sample_size

            elif intent == "descr_item":
                hits = 0
                for v in sample.astype(str):
                    txt = clean_field_text(v)
                    if txt and len(txt) >= 4 and not re.fullmatch(r"\d+([.,]\d+)?", txt):
                        hits += 1
                content_score = hits / sample_size

            elif intent == "unid":
                hits = 0
                for v in sample.astype(str):
                    u = normalize_unid(v)
                    if u and len(u) <= 6:
                        hits += 1
                content_score = hits / sample_size

            elif intent in {"qtd", "vl_unit", "vl_item"}:
                hits = sum(1 for v in sample if to_decimal_ptbr(v) is not None)
                content_score = hits / sample_size

            elif intent == "ncm":
                hits = 0
                for v in sample.astype(str):
                    if len(normalize_ncm(v)) == 8:
                        hits += 1
                content_score = hits / sample_size

            elif intent == "tipo_item":
                hits = 0
                for v in sample.astype(str):
                    vv = re.sub(r"\D", "", v)
                    if vv and 1 <= len(vv) <= 2:
                        hits += 1
                content_score = hits / sample_size

            score = 0.75 * name_score + 0.25 * content_score
            if score > 0:
                candidates[intent].append((col_name, score))

    for k in candidates:
        candidates[k].sort(key=lambda x: x[1], reverse=True)
    return candidates


def best_candidate(cands: Dict[str, List[Tuple[str, float]]], intent: str) -> str:
    return cands[intent][0][0] if cands.get(intent) else ""


def ask_column(prompt: str, columns: Sequence[str], default: str = "", allow_empty: bool = False) -> str:
    print(f"\n{prompt}")
    for i, c in enumerate(columns, 1):
        print(f"  {i}. {c}")
    hint = f"[{default}]" if default else ""
    while True:
        ans = input(f"Escolha numero ou nome da coluna {hint}: ").strip()
        if not ans:
            if default:
                return default
            if allow_empty:
                return ""
            continue
        if ans.isdigit():
            idx = int(ans)
            if 1 <= idx <= len(columns):
                return columns[idx - 1]
        if ans in columns:
            return ans
        if allow_empty and ans in {"0", "-", "nenhum", "none"}:
            return ""
        print("Valor invalido.")


def normalize_item_code(x: Any) -> str:
    if x is None:
        return ""
    if isinstance(x, float) and pd.isna(x):
        return ""
    s = clean_field_text(x)
    if not s:
        return ""
    if re.fullmatch(r"\d+\.0+", s):
        s = s.split(".", 1)[0]
    return s[:60]


def normalize_unid(x: Any, default_unid: str = "UN") -> str:
    s = clean_field_text(x).upper()
    if not s:
        s = default_unid
    s = re.sub(r"[^A-Z0-9]", "", s)
    return (s or default_unid)[:6]


def normalize_ncm(x: Any) -> str:
    s = clean_field_text(x)
    if not s:
        return ""
    if re.fullmatch(r"\d+\.0+", s):
        s = s.split(".", 1)[0]
    digits = re.sub(r"\D", "", s)
    if len(digits) >= 8:
        return digits[:8]
    return ""


def normalize_tipo_item(x: Any, default_tipo_item: str = "00") -> str:
    s = clean_field_text(x)
    if not s:
        return default_tipo_item
    d = re.sub(r"\D", "", s)
    if not d:
        return default_tipo_item
    if len(d) == 1:
        d = f"0{d}"
    return d[:2]


def normalize_aliq_icms(x: Any) -> str:
    v = to_decimal_ptbr(x)
    if v is None:
        return ""
    return format_sped_decimal(v, 2)


def normalize_cest(x: Any) -> str:
    d = re.sub(r"\D", "", clean_field_text(x))
    return d[:7]


def speed_sort_key(cod_item: str) -> Tuple[int, Any]:
    if re.fullmatch(r"\d+", cod_item):
        return (0, int(cod_item))
    return (1, cod_item)


def build_items(
    df: pd.DataFrame,
    mapping: Dict[str, str],
    default_unid: str,
    default_tipo_item: str,
) -> Tuple[List[AggregatedItem], List[str]]:
    col_cod = mapping["cod_item"]
    col_desc = mapping.get("descr_item", "")
    col_unid = mapping.get("unid", "")
    col_qtd = mapping.get("qtd", "")
    col_vl_unit = mapping.get("vl_unit", "")
    col_vl_item = mapping.get("vl_item", "")
    col_ncm = mapping.get("ncm", "")
    col_tipo = mapping.get("tipo_item", "")
    col_cod_barra = mapping.get("cod_barra", "")
    col_aliq = mapping.get("aliq_icms", "")
    col_cest = mapping.get("cest", "")

    buckets: Dict[str, AggregatedItem] = {}
    warnings: List[str] = []

    for _, row in df.iterrows():
        cod_item = normalize_item_code(row.get(col_cod))
        if not cod_item:
            continue

        descr = clean_field_text(row.get(col_desc)) if col_desc else ""
        if not descr:
            descr = f"ITEM {cod_item}"

        unid = normalize_unid(row.get(col_unid), default_unid=default_unid) if col_unid else default_unid
        qtd = to_decimal_ptbr(row.get(col_qtd)) if col_qtd else None
        vl_unit = to_decimal_ptbr(row.get(col_vl_unit)) if col_vl_unit else None
        vl_item = to_decimal_ptbr(row.get(col_vl_item)) if col_vl_item else None

        if qtd is None and vl_item is not None and vl_unit not in (None, 0):
            qtd = vl_item / vl_unit
        if vl_item is None and qtd is not None and vl_unit is not None:
            vl_item = qtd * vl_unit
        if qtd is None:
            qtd = Decimal("0")
        if vl_item is None:
            vl_item = Decimal("0")

        if qtd == 0 and vl_item == 0:
            continue

        ncm = normalize_ncm(row.get(col_ncm)) if col_ncm else ""
        tipo_item = normalize_tipo_item(row.get(col_tipo), default_tipo_item) if col_tipo else default_tipo_item
        cod_barra = clean_field_text(row.get(col_cod_barra)) if col_cod_barra else ""
        aliq_icms = normalize_aliq_icms(row.get(col_aliq)) if col_aliq else ""
        cest = normalize_cest(row.get(col_cest)) if col_cest else ""

        existing = buckets.get(cod_item)
        if existing is None:
            buckets[cod_item] = AggregatedItem(
                cod_item=cod_item,
                descr_item=descr[:255],
                unid=unid,
                tipo_item=tipo_item,
                ncm=ncm,
                cod_barra=cod_barra[:80],
                aliq_icms=aliq_icms,
                cest=cest,
                qtd=qtd,
                vl_item=vl_item,
            )
            continue

        existing.qtd += qtd
        existing.vl_item += vl_item
        if not existing.descr_item and descr:
            existing.descr_item = descr[:255]
        if not existing.ncm and ncm:
            existing.ncm = ncm
        if not existing.cod_barra and cod_barra:
            existing.cod_barra = cod_barra[:80]
        if not existing.aliq_icms and aliq_icms:
            existing.aliq_icms = aliq_icms
        if not existing.cest and cest:
            existing.cest = cest
        if existing.unid != unid:
            warnings.append(
                f"Codigo {cod_item} apareceu com unidade diferente ({existing.unid} x {unid}). Mantida {existing.unid}."
            )
        if existing.tipo_item != tipo_item:
            warnings.append(
                f"Codigo {cod_item} apareceu com tipo_item diferente ({existing.tipo_item} x {tipo_item}). Mantido {existing.tipo_item}."
            )

    items = sorted(buckets.values(), key=lambda it: speed_sort_key(it.cod_item))
    dedup_warn = sorted(set(warnings))
    return items, dedup_warn


def sped_line(parts: Sequence[str]) -> str:
    vals = [clean_field_text(p) for p in parts]
    return "|" + "|".join(vals) + "|"


def build_0200_lines(items: List[AggregatedItem]) -> List[str]:
    lines: List[str] = []
    for it in items:
        parts = [
            "0200",  # REG
            it.cod_item,  # COD_ITEM
            it.descr_item,  # DESCR_ITEM
            it.cod_barra,  # COD_BARRA
            "",  # COD_ANT_ITEM
            it.unid,  # UNID_INV
            it.tipo_item,  # TIPO_ITEM
            it.ncm,  # COD_NCM
            "",  # EX_IPI
            "",  # COD_GEN
            "",  # COD_LST
            it.aliq_icms,  # ALIQ_ICMS
            it.cest,  # CEST
        ]
        lines.append(sped_line(parts))
    return lines


def build_0190_lines(items: List[AggregatedItem]) -> List[str]:
    units = sorted({it.unid for it in items if it.unid})
    lines: List[str] = []
    for unid in units:
        descr = UNID_DESCR_PADRAO.get(unid, f"UNIDADE {unid}")
        lines.append(sped_line(["0190", unid, descr]))
    return lines


def build_bloco_h_lines(
    items: List[AggregatedItem],
    dt_inv: date,
    mot_inv: str,
    ind_prop: str,
    cod_part: str,
    txt_compl: str,
    cod_cta: str,
    preencher_vl_item_ir: bool,
    gerar_h020: bool,
    h020_cst_icms: str,
    h020_aliq_icms: Decimal,
) -> List[str]:
    lines: List[str] = []
    has_items = len(items) > 0
    lines.append(sped_line(["H001", "0" if has_items else "1"]))

    if has_items:
        vl_inv = Decimal("0")
        lines.append(
            sped_line(
                [
                    "H005",
                    dt_inv.strftime("%d%m%Y"),
                    "",  # Preenchido apos montar os H010, para bater com soma arredondada.
                    mot_inv,
                ]
            )
        )
        h005_idx = len(lines) - 1
        for it in items:
            vl_item_2 = round_decimal(it.vl_item, 2)
            vl_unit_6 = round_decimal(it.vl_unit, 6)
            vl_inv += vl_item_2
            vl_item_ir = format_sped_decimal(vl_item_2, 2) if preencher_vl_item_ir else ""
            lines.append(
                sped_line(
                    [
                        "H010",
                        it.cod_item,
                        it.unid,
                        format_sped_decimal(it.qtd, 3),
                        format_sped_decimal(vl_unit_6, 6),
                        format_sped_decimal(vl_item_2, 2),
                        ind_prop,
                        cod_part,
                        txt_compl,
                        cod_cta,
                        vl_item_ir,
                    ]
                )
            )
            if gerar_h020:
                bc_icms = vl_item_2
                vl_icms = bc_icms * (h020_aliq_icms / Decimal("100"))
                lines.append(
                    sped_line(
                        [
                            "H020",
                            h020_cst_icms,
                            format_sped_decimal(bc_icms, 2),
                            format_sped_decimal(vl_icms, 2),
                        ]
                    )
                )
        h005_parts = lines[h005_idx].split("|")
        if len(h005_parts) > 3:
            h005_parts[3] = format_sped_decimal(vl_inv, 2)
            lines[h005_idx] = "|".join(h005_parts)

    qtd_lin_h = len(lines) + 1
    lines.append(sped_line(["H990", str(qtd_lin_h)]))
    return lines


def select_report_file() -> Path:
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)

        selected = filedialog.askopenfilename(
            title="Selecione o relatorio de inventario (Excel ou PDF)",
            filetypes=[
                ("Relatorios", "*.xlsx *.xls *.pdf"),
                ("Todos os arquivos", "*.*"),
            ],
        )
        if not selected:
            raise SystemExit("Selecao cancelada.")
        return Path(selected)
    except Exception:
        inp = input("Caminho do relatorio (Excel/PDF): ").strip().strip('"').strip("'")
        if not inp:
            raise SystemExit("Caminho invalido.")
        return Path(inp)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gera registros 0200 e Bloco H (H001/H005/H010/H020/H990) a partir de relatorio Excel/PDF."
    )
    parser.add_argument("report_path", nargs="?", help="Arquivo do relatorio (.xls/.xlsx/.pdf)")
    parser.add_argument("--dt-inv", help="Data do inventario (dd/mm/aaaa, aaaammdd ou aaaa-mm-dd)")
    parser.add_argument("--mot-inv", default="01", help="Motivo do inventario para H005 (padrao: 01)")
    parser.add_argument("--tipo-item", default="00", help="Tipo do item para 0200 (padrao: 00)")
    parser.add_argument("--default-unid", default="UN", help="Unidade padrao quando nao houver coluna (padrao: UN)")
    parser.add_argument("--ind-prop", default="0", help="Indicador de propriedade no H010 (padrao: 0)")
    parser.add_argument("--cod-part", default="", help="COD_PART para H010 (opcional)")
    parser.add_argument("--txt-compl", default="", help="TXT_COMPL para H010 (opcional)")
    parser.add_argument("--cod-cta", default="11216001000", help="COD_CTA para H010 (padrao: 11216001000)")
    parser.add_argument(
        "--preencher-vl-item-ir",
        action="store_true",
        help="Preenche VL_ITEM_IR do H010 com o mesmo valor de VL_ITEM",
    )
    parser.add_argument(
        "--gerar-h020",
        action="store_true",
        help="Gera H020 apos cada H010 usando BC_ICMS = VL_ITEM do item",
    )
    parser.add_argument(
        "--h020-cst-icms",
        default="000",
        help="CST_ICMS fixo para H020 (padrao: 000)",
    )
    parser.add_argument(
        "--h020-aliq-icms",
        default="12",
        help="Aliquota do ICMS para H020 em percentual (padrao: 12)",
    )
    parser.add_argument("--output", help="Arquivo de saida .txt")
    parser.add_argument(
        "--sem-perguntas",
        action="store_true",
        help="Nao perguntar mapeamento manual; falha se faltar coluna obrigatoria.",
    )
    return parser.parse_args()


def resolve_dt_inv(cli_value: Optional[str]) -> date:
    if cli_value:
        dt = parse_date_any(cli_value)
        if not dt:
            raise ValueError("Data invalida em --dt-inv.")
        return dt

    default_date = date.today().strftime("%d/%m/%Y")
    ans = input(f"Data do inventario [{default_date}]: ").strip()
    if not ans:
        return parse_date_any(default_date) or date.today()
    dt = parse_date_any(ans)
    if not dt:
        raise ValueError("Data do inventario invalida.")
    return dt


def main() -> None:
    args = parse_args()

    report_path = Path(args.report_path) if args.report_path else select_report_file()
    if not report_path.exists():
        print(f"ERRO: arquivo nao encontrado: {report_path}")
        sys.exit(2)

    dt_inv = resolve_dt_inv(args.dt_inv)
    mot_inv = clean_field_text(args.mot_inv)[:2] or "01"
    tipo_item_default = normalize_tipo_item(args.tipo_item, "00")
    default_unid = normalize_unid(args.default_unid, "UN")
    ind_prop = clean_field_text(args.ind_prop)[:1] or "0"
    h020_cst_icms = format_sped_cst(args.h020_cst_icms, "000")
    h020_aliq_icms = to_decimal_ptbr(args.h020_aliq_icms)
    if h020_aliq_icms is None:
        raise ValueError("Valor invalido em --h020-aliq-icms.")
    if h020_aliq_icms < 0:
        raise ValueError("Aliquota de H020 nao pode ser negativa.")

    print(f"Relatorio: {report_path}")
    df = read_report(report_path)
    print(f"Linhas lidas: {len(df)} | Colunas: {len(df.columns)}")

    cands = detect_columns(df)

    print("\nColunas candidatas:")
    for intent, lst in cands.items():
        if not lst:
            continue
        top = ", ".join([f"{c} ({s:.2f})" for c, s in lst[:3]])
        print(f"- {intent}: {top}")

    mapping: Dict[str, str] = {
        "cod_item": best_candidate(cands, "cod_item"),
        "descr_item": best_candidate(cands, "descr_item"),
        "unid": best_candidate(cands, "unid"),
        "qtd": best_candidate(cands, "qtd"),
        "vl_unit": best_candidate(cands, "vl_unit"),
        "vl_item": best_candidate(cands, "vl_item"),
        "ncm": best_candidate(cands, "ncm"),
        "tipo_item": best_candidate(cands, "tipo_item"),
        "cod_barra": best_candidate(cands, "cod_barra"),
        "aliq_icms": best_candidate(cands, "aliq_icms"),
        "cest": best_candidate(cands, "cest"),
    }

    columns = [str(c) for c in df.columns]

    required = ["cod_item", "descr_item", "qtd"]
    for req in required:
        if mapping.get(req):
            continue
        if args.sem_perguntas:
            print(f"ERRO: coluna obrigatoria nao detectada automaticamente: {req}")
            sys.exit(3)
        mapping[req] = ask_column(
            f"Informe a coluna para '{req}'",
            columns,
            default=mapping.get(req, ""),
            allow_empty=False,
        )

    if not mapping.get("vl_item") and not mapping.get("vl_unit"):
        if args.sem_perguntas:
            print("ERRO: preciso de VL_ITEM ou VL_UNIT no relatorio.")
            sys.exit(3)
        mapping["vl_item"] = ask_column(
            "Nao detectei valor total. Escolha a coluna de valor total (ou vazio para usar valor unitario):",
            columns,
            default="",
            allow_empty=True,
        )
        if not mapping["vl_item"]:
            mapping["vl_unit"] = ask_column(
                "Escolha a coluna de valor unitario:",
                columns,
                default=mapping.get("vl_unit", ""),
                allow_empty=False,
            )

    print("\nMapeamento final:")
    for k in (
        "cod_item",
        "descr_item",
        "unid",
        "qtd",
        "vl_unit",
        "vl_item",
        "ncm",
        "tipo_item",
        "cod_barra",
        "aliq_icms",
        "cest",
    ):
        v = mapping.get(k, "")
        if v:
            print(f"  {k:10s} -> {v}")

    items, warnings = build_items(
        df=df,
        mapping=mapping,
        default_unid=default_unid,
        default_tipo_item=tipo_item_default,
    )
    if not items:
        print("ERRO: nenhum item valido foi montado a partir do relatorio.")
        sys.exit(4)

    lines_0190 = build_0190_lines(items)
    lines_0200 = build_0200_lines(items)
    lines_h = build_bloco_h_lines(
        items=items,
        dt_inv=dt_inv,
        mot_inv=mot_inv,
        ind_prop=ind_prop,
        cod_part=clean_field_text(args.cod_part),
        txt_compl=clean_field_text(args.txt_compl),
        cod_cta=clean_field_text(args.cod_cta),
        preencher_vl_item_ir=args.preencher_vl_item_ir,
        gerar_h020=args.gerar_h020,
        h020_cst_icms=h020_cst_icms,
        h020_aliq_icms=h020_aliq_icms,
    )

    output_path = (
        Path(args.output)
        if args.output
        else report_path.parent / f"inventario_sped_{datetime.now():%Y%m%d_%H%M%S}.txt"
    )

    all_lines = lines_0190 + lines_0200 + lines_h
    output_path.write_text("\n".join(all_lines) + "\n", encoding="latin-1", errors="replace")

    vl_total = sum(i.vl_item for i in items)
    print("\nResumo:")
    print(f"- Itens unicos (0200/H010): {len(items)}")
    print(f"- Valor total inventario (H005): {format_sped_decimal(vl_total, 2)}")
    print(f"- Linhas 0190 geradas: {len(lines_0190)}")
    print(f"- Linhas 0200 geradas: {len(lines_0200)}")
    print(f"- Linhas bloco H geradas: {len(lines_h)}")
    if args.gerar_h020:
        print(f"- H020 gerado com CST_ICMS={h020_cst_icms} e ALIQ_ICMS={format_sped_decimal(h020_aliq_icms, 2)}%")
    print(f"- Arquivo gerado: {output_path}")

    if warnings:
        print(f"\nAvisos ({len(warnings)}):")
        for w in warnings[:20]:
            print(f"  - {w}")
        if len(warnings) > 20:
            print(f"  - ... ({len(warnings) - 20} avisos adicionais)")


if __name__ == "__main__":
    main()
