#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_LAYOUTS_DIR = BASE_DIR / "layouts json"
FALLBACK_LAYOUTS_DIR = BASE_DIR.parent.parent / "layouts" / "speds" / "icms"
LAYOUTS_DIR = DEFAULT_LAYOUTS_DIR if DEFAULT_LAYOUTS_DIR.exists() else FALLBACK_LAYOUTS_DIR
INDEX_FILE_CANDIDATES = ("index_registros.json", "_index.json", "index.json")


def resolve_master_index(layouts_dir: Path) -> Path:
    for filename in INDEX_FILE_CANDIDATES:
        candidate = layouts_dir / filename
        if candidate.exists():
            return candidate
    return layouts_dir / INDEX_FILE_CANDIDATES[0]


MASTER_INDEX = resolve_master_index(LAYOUTS_DIR)


def set_layout_paths(layouts_dir: Path) -> None:
    global LAYOUTS_DIR, MASTER_INDEX
    LAYOUTS_DIR = layouts_dir
    MASTER_INDEX = resolve_master_index(layouts_dir)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compara SPED ICMS/IPI com relatorios de entradas/saidas e gera abas objetivas de diferencas."
    )
    parser.add_argument("sped_path", nargs="?", help="Arquivo SPED (.txt)")
    parser.add_argument("report_path", nargs="?", help="[legado] Relatorio unico (.csv/.xlsx/.slk/.pdf).")
    parser.add_argument("--relatorio-entradas", default="", help="Relatorio de entradas")
    parser.add_argument("--relatorio-saidas", default="", help="Relatorio de saidas")
    parser.add_argument("--modo", choices=["entradas", "saidas"], default="")
    parser.add_argument("--campos", default="")
    parser.add_argument("--output", default="", help="Arquivo .xlsx de saida")
    parser.add_argument("--layouts-dir", default="", help="Pasta com layouts JSON do ICMS")
    return parser.parse_args()


DATE_PATTERNS = [
    ("%d/%m/%Y", re.compile(r"^\d{2}/\d{2}/\d{4}$")),
    ("%Y-%m-%d", re.compile(r"^\d{4}-\d{2}-\d{2}$")),
    ("%d%m%Y", re.compile(r"^\d{8}$")),
]


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


def format_date_br(x: Any) -> str:
    dt = parse_date_any(x)
    return dt.strftime("%d/%m/%Y") if dt else ""


def to_decimal_ptbr(x: Any) -> Optional[float]:
    if x is None:
        return None
    if isinstance(x, (int, float)):
        if pd.isna(x):
            return None
        return float(x)
    s = str(x).strip()
    if not s or s.lower() in {"nan", "none", "nat"}:
        return None
    s = s.replace("R$", "").replace("\xa0", "").replace(" ", "")
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]

    # Resolve ambiguidades de separador decimal com heuristica:
    # - quando ha "," e ".", o ultimo separador tende a ser o decimal.
    # - quando ha apenas ",", assume formato pt-BR.
    # - quando ha varios ".", assume milhares e remove todos.
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
        v = float(s)
        return -v if neg else v
    except ValueError:
        return None


def parse_sylk_number(k: str) -> Optional[float]:
    s = k.strip()
    if not re.fullmatch(r"[+-]?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?", s):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def normalize_colname(s: Any) -> str:
    text = str(s or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def normalize_doc_key(x: Any) -> str:
    if x is None:
        return ""
    s = str(x).strip()
    if not s or s.lower() in {"nan", "none", "nat"}:
        return ""
    if re.fullmatch(r"\d+\.0+", s):
        s = s.split(".", 1)[0]
    if re.fullmatch(r"\d+", s):
        s = s.lstrip("0") or "0"
    return s


def normalize_cfop(x: Any) -> str:
    if x is None:
        return ""
    if isinstance(x, (int, float)):
        if pd.isna(x):
            return ""
        s = str(int(x)) if float(x).is_integer() else str(x)
    else:
        s = str(x).strip()
    if re.fullmatch(r"\d+\.0+", s):
        s = s.split(".", 1)[0]
    s = re.sub(r"\D", "", s)
    if len(s) == 4:
        return s
    if len(s) == 5 and s.endswith("0"):
        trimmed = s[:-1]
        if len(trimmed) == 4:
            return trimmed
    return ""


def normalize_emitente_text(x: Any) -> str:
    if x is None:
        return ""
    text = str(x).strip()
    if not text:
        return ""
    if text.lower() in {"nan", "none", "nat"}:
        return ""
    return re.sub(r"\s+", " ", text)


def normalize_emitente_key(x: Any) -> str:
    text = normalize_emitente_text(x)
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "", text)
    return text


def round2(value: Optional[float]) -> float:
    return round(float(value or 0.0), 2)


def _read_json(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except UnicodeDecodeError:
        return json.loads(p.read_text(encoding="latin-1"))


def load_reg_layout(registro: str) -> dict:
    reg_path = (LAYOUTS_DIR / f"{registro}.json").resolve()
    if not reg_path.exists():
        raise FileNotFoundError(f"Layout do registro {registro} nao encontrado em: {reg_path}")
    return _read_json(reg_path)


def build_pos_map(reg_layout: dict) -> Dict[str, int]:
    pos_map: Dict[str, int] = {}

    def _parse_pos(value: Any) -> Optional[int]:
        if isinstance(value, int):
            return value
        if value is None:
            return None
        s = str(value).strip()
        if not s:
            return None
        if s.isdigit():
            return int(s)
        mt = re.match(r"^(\d+)", s)
        return int(mt.group(1)) if mt else None

    for c in reg_layout.get("campos", []):
        nome = c.get("nome") or c.get("campo")
        pos = _parse_pos(c.get("pos"))
        if pos is None:
            pos = _parse_pos(c.get("numero"))
        if nome and pos is not None and pos >= 1:
            key = str(nome).strip()
            pos_map[key] = pos - 1
            pos_map[key.upper()] = pos - 1
            pos_map[key.lower()] = pos - 1
    return pos_map


_LAYOUT_POS_CACHE: Dict[str, Dict[str, int]] = {}


def get_pos_map(reg: str) -> Dict[str, int]:
    if reg not in _LAYOUT_POS_CACHE:
        _LAYOUT_POS_CACHE[reg] = build_pos_map(load_reg_layout(reg))
    return _LAYOUT_POS_CACHE[reg]


def get_field(parts: List[str], posmap: Dict[str, int], name: str) -> str:
    i = posmap.get(name)
    if i is None or i >= len(parts):
        return ""
    return str(parts[i])


def get_field_any(parts: List[str], posmap: Dict[str, int], names: List[str]) -> str:
    for name in names:
        value = get_field(parts, posmap, name)
        if str(value).strip() != "":
            return str(value)
    return ""


def iter_sped_parts(path: Path, encoding: str = "latin-1") -> Iterator[List[str]]:
    with path.open("r", encoding=encoding, errors="replace") as f:
        for raw in f:
            raw = raw.rstrip("\r\n")
            if not raw:
                continue
            parts = raw.split("|")
            if parts and parts[0] == "":
                parts = parts[1:]
            if parts and parts[-1] == "":
                parts = parts[:-1]
            if parts:
                yield parts


@dataclass(frozen=True)
class SpedHeader0000:
    dt_ini: date
    dt_fin: date
    nome: str
    cnpj: str


def read_sped_0000(sped_path: Path) -> SpedHeader0000:
    pos = get_pos_map("0000")
    for parts in iter_sped_parts(sped_path):
        if parts[0] != "0000":
            continue
        dt_ini = parse_date_any(get_field(parts, pos, "DT_INI"))
        dt_fin = parse_date_any(get_field(parts, pos, "DT_FIN"))
        nome = get_field(parts, pos, "NOME")
        cnpj = get_field(parts, pos, "CNPJ")
        if not dt_ini or not dt_fin:
            raise ValueError("Nao consegui interpretar DT_INI/DT_FIN do registro 0000.")
        return SpedHeader0000(dt_ini=dt_ini, dt_fin=dt_fin, nome=nome, cnpj=cnpj)
    raise ValueError("Registro 0000 nao encontrado no SPED.")

@dataclass
class NoteRow:
    data: str
    emitente: str
    numero_nota: str
    cfop: str
    serie: str
    valor: float
    operacao: str
    origem: str
    registro: str

    def compare_id(self) -> Tuple[str, str, str]:
        return (
            normalize_doc_key(self.numero_nota),
            normalize_doc_key(self.serie),
            normalize_cfop(self.cfop),
        )

    def export_row(self) -> Dict[str, Any]:
        return {
            "data": self.data,
            "emitente": self.emitente,
            "numero_nota": self.numero_nota,
            "cfop": self.cfop,
            "serie": self.serie,
            "valor": round2(self.valor),
        }


PARENT_SPECS: Dict[str, Dict[str, Any]] = {
    "C100": {
        "ind_oper_field": "IND_OPER",
        "default_oper": "",
        "participant_fields": ["COD_PART"],
        "participant_lookup_0150": True,
        "num_fields": ["NUM_DOC"],
        "serie_fields": ["SER"],
        "date_fields": ["DT_DOC", "DT_E_S"],
        "value_fields": ["VL_DOC"],
        "cfop_fields": ["CFOP"],
        "child_regs": {"C190": {"cfop_fields": ["CFOP"], "value_fields": ["VL_OPR"]}},
    },
    "C500": {
        "ind_oper_field": "IND_OPER",
        "default_oper": "",
        "participant_fields": ["COD_PART"],
        "participant_lookup_0150": True,
        "num_fields": ["NUM_DOC"],
        "serie_fields": ["SER", "SUB"],
        "date_fields": ["DT_DOC", "DT_E_S"],
        "value_fields": ["VL_DOC"],
        "cfop_fields": ["CFOP"],
        "child_regs": {"C590": {"cfop_fields": ["CFOP"], "value_fields": ["VL_OPR"]}},
    },
    "D100": {
        "ind_oper_field": "IND_OPER",
        "default_oper": "",
        "participant_fields": ["COD_PART"],
        "participant_lookup_0150": True,
        "num_fields": ["NUM_DOC"],
        "serie_fields": ["SER", "SUB"],
        "date_fields": ["DT_DOC", "DT_A_P"],
        "value_fields": ["VL_DOC", "VL_SERV"],
        "cfop_fields": ["CFOP"],
        "child_regs": {"D190": {"cfop_fields": ["CFOP"], "value_fields": ["VL_OPR"]}},
    },
    "D500": {
        "ind_oper_field": "IND_OPER",
        "default_oper": "",
        "participant_fields": ["COD_PART"],
        "participant_lookup_0150": True,
        "num_fields": ["NUM_DOC"],
        "serie_fields": ["SER", "SUB"],
        "date_fields": ["DT_DOC", "DT_A_P"],
        "value_fields": ["VL_DOC", "VL_SERV"],
        "cfop_fields": ["CFOP"],
        "child_regs": {"D590": {"cfop_fields": ["CFOP"], "value_fields": ["VL_OPR"]}},
    },
    "C800": {
        "ind_oper_field": "",
        "default_oper": "1",
        "participant_fields": ["CNPJ_CPF"],
        "participant_lookup_0150": False,
        "num_fields": ["NUM_CFE", "NUM_DOC"],
        "serie_fields": ["SER"],
        "date_fields": ["DT_DOC"],
        "value_fields": ["VL_CFE", "VL_DOC"],
        "cfop_fields": ["CFOP"],
        "child_regs": {"C850": {"cfop_fields": ["CFOP"], "value_fields": ["VL_OPR"]}},
    },
}


def infer_operacao(ind_oper: str, cfop: str, default_oper: str = "") -> Optional[str]:
    ind = str(ind_oper or "").strip()
    if ind == "0":
        return "entradas"
    if ind == "1":
        return "saidas"
    if default_oper == "0":
        return "entradas"
    if default_oper == "1":
        return "saidas"
    c = normalize_cfop(cfop)
    if not c:
        return None
    if c[0] in {"1", "2", "3"}:
        return "entradas"
    if c[0] in {"5", "6", "7"}:
        return "saidas"
    return None


def load_participantes_0150(sped_path: Path) -> Dict[str, str]:
    participantes: Dict[str, str] = {}
    try:
        pos = get_pos_map("0150")
    except Exception:
        return participantes

    for parts in iter_sped_parts(sped_path):
        if parts[0] != "0150":
            continue
        codigo = str(get_field(parts, pos, "COD_PART")).strip()
        if not codigo:
            continue
        nome = normalize_emitente_text(get_field(parts, pos, "NOME"))
        participantes[codigo] = nome or codigo
    return participantes


def start_parent_context(reg: str, parts: List[str], participantes_0150: Dict[str, str]) -> Dict[str, Any]:
    spec = PARENT_SPECS[reg]
    pos = get_pos_map(reg)
    data_raw = get_field_any(parts, pos, spec["date_fields"])
    numero = normalize_doc_key(get_field_any(parts, pos, spec["num_fields"]))
    serie = normalize_doc_key(get_field_any(parts, pos, spec["serie_fields"]))
    cfop = normalize_cfop(get_field_any(parts, pos, spec.get("cfop_fields", [])))
    valor_raw = get_field_any(parts, pos, spec["value_fields"])
    valor = to_decimal_ptbr(valor_raw)
    ind_oper = get_field(parts, pos, spec.get("ind_oper_field", "")) if spec.get("ind_oper_field") else ""
    participante_raw = str(get_field_any(parts, pos, spec.get("participant_fields", []))).strip()
    if spec.get("participant_lookup_0150"):
        emitente = normalize_emitente_text(participantes_0150.get(participante_raw, participante_raw))
    else:
        emitente = normalize_emitente_text(participante_raw)

    return {
        "reg": reg,
        "spec": spec,
        "data": format_date_br(data_raw),
        "emitente": emitente,
        "numero": numero,
        "serie": serie,
        "cfop": cfop,
        "valor": valor,
        "ind_oper": ind_oper,
        "children": [],
    }


def append_child_to_parent(parent_ctx: Dict[str, Any], reg: str, parts: List[str]) -> None:
    child_spec = parent_ctx["spec"]["child_regs"].get(reg)
    if not child_spec:
        return
    pos = get_pos_map(reg)
    cfop = normalize_cfop(get_field_any(parts, pos, child_spec.get("cfop_fields", ["CFOP"])))
    if not cfop:
        return
    raw_value = get_field_any(parts, pos, child_spec.get("value_fields", ["VL_OPR"]))
    value = to_decimal_ptbr(raw_value)
    parent_ctx["children"].append((cfop, value))


def finalize_parent_context(parent_ctx: Dict[str, Any], out_notes: List[NoteRow]) -> None:
    numero = parent_ctx.get("numero", "")
    if not numero:
        return

    child_rows: Dict[str, float] = {}
    if parent_ctx["children"]:
        for cfop, value in parent_ctx["children"]:
            if cfop:
                child_rows[cfop] = round2(child_rows.get(cfop, 0.0) + (value or 0.0))

    source_rows: List[Tuple[str, Optional[float]]] = []
    if child_rows:
        source_rows = list(child_rows.items())
    elif parent_ctx.get("cfop"):
        source_rows = [(parent_ctx.get("cfop", ""), parent_ctx.get("valor"))]

    for cfop, value in source_rows:
        operacao = infer_operacao(
            parent_ctx.get("ind_oper", ""), cfop, parent_ctx["spec"].get("default_oper", "")
        )
        if not operacao:
            continue
        resolved_value = parent_ctx.get("valor") if value is None else value
        out_notes.append(
            NoteRow(
                data=parent_ctx.get("data", ""),
                emitente=parent_ctx.get("emitente", ""),
                numero_nota=numero,
                cfop=cfop,
                serie=parent_ctx.get("serie", ""),
                valor=round2(resolved_value),
                operacao=operacao,
                origem="sped",
                registro=parent_ctx.get("reg", ""),
            )
        )


def extract_sped_notes(sped_path: Path) -> List[NoteRow]:
    notes: List[NoteRow] = []
    participantes_0150 = load_participantes_0150(sped_path)
    current_parent: Optional[Dict[str, Any]] = None
    for parts in iter_sped_parts(sped_path):
        reg = parts[0]
        if reg in PARENT_SPECS:
            if current_parent is not None:
                finalize_parent_context(current_parent, notes)
            current_parent = start_parent_context(reg, parts, participantes_0150)
            continue
        if current_parent is not None and reg in current_parent["spec"].get("child_regs", {}):
            append_child_to_parent(current_parent, reg, parts)
    if current_parent is not None:
        finalize_parent_context(current_parent, notes)
    return notes


def _sylk_decode_k(k: str) -> Any:
    k = k.strip()
    if k.startswith('"') and k.endswith('"'):
        return k[1:-1].replace('""', '"')
    v_sylk = parse_sylk_number(k)
    if v_sylk is not None:
        return v_sylk
    v = to_decimal_ptbr(k)
    if v is not None:
        return v
    try:
        return int(k)
    except Exception:
        return k


PDF_DATE_TOKEN_RE = re.compile(r"^\d{2}/\d{2}/\d{3,4}$")
PDF_NUMERIC_TOKEN_RE = re.compile(r"^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$")


def normalize_pdf_date_token(token: str, default_year: str) -> str:
    m = re.fullmatch(r"(\d{2}/\d{2}/)(\d{3,4})", token)
    if not m:
        return token
    prefix, yy = m.groups()
    if len(yy) == 4:
        return token
    if default_year and default_year.startswith(yy):
        return f"{prefix}{default_year}"
    return token


def parse_pdf_tipo50_line(line: str, default_year: str) -> Optional[Dict[str, Any]]:
    line = re.sub(r"\s+", " ", line).strip()
    if not line:
        return None

    toks = line.split(" ")
    if len(toks) < 10 or not PDF_DATE_TOKEN_RE.match(toks[0]):
        return None

    dt = normalize_pdf_date_token(toks[0], default_year)
    num_doc = normalize_doc_key(toks[1])
    if not num_doc:
        return None

    cfop_idx = next((i for i, t in enumerate(toks) if re.fullmatch(r"\d\.\d{3}", t)), -1)
    if cfop_idx < 0 or cfop_idx + 1 >= len(toks):
        return None

    nums_after_cfop = [t for t in toks[cfop_idx + 2 :] if PDF_NUMERIC_TOKEN_RE.match(t)]
    if len(nums_after_cfop) < 1:
        return None

    return {
        "data": dt,
        "nota_ini": num_doc,
        "cfop": re.sub(r"\D", "", toks[cfop_idx]),
        "valor": nums_after_cfop[0],
    }


def read_pdf_tipo50(path: Path) -> pd.DataFrame:
    try:
        import pdfplumber
    except ImportError as e:
        raise RuntimeError("Leitura de PDF requer 'pdfplumber'. Instale com: pip install pdfplumber") from e

    rows: List[Dict[str, Any]] = []
    default_year = ""
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if not text:
                continue
            if not default_year:
                m = re.search(r"\b\d{2}/\d{2}/(\d{4})\s*-\s*\d{2}/\d{2}/\d{4}\b", text)
                if m:
                    default_year = m.group(1)
            for line in text.splitlines():
                rec = parse_pdf_tipo50_line(line, default_year)
                if rec:
                    rows.append(rec)

    if not rows:
        raise ValueError("Nao foi possivel extrair linhas do PDF (formato nao reconhecido).")
    return pd.DataFrame(rows)


HEADER_KEYWORDS = {"data", "dt", "emissao", "nota", "nf", "numero", "serie", "cfop", "valor", "total"}


def clean_header_text(x: Any) -> str:
    s = "" if x is None else str(x)
    s = s.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    s = re.sub(r"[:;]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def make_unique(names: List[str]) -> List[str]:
    seen: Dict[str, int] = {}
    out: List[str] = []
    for n in names:
        key = n
        if key in seen:
            seen[key] += 1
            key = f"{key}_{seen[n]}"
        else:
            seen[key] = 1
        out.append(key)
    return out


def normalize_header_names(cols: List[Any]) -> List[str]:
    cleaned = [clean_header_text(c) for c in cols]
    normalized = [normalize_colname(c) if c else "" for c in cleaned]
    normalized = [c if c else f"col_{i + 1}" for i, c in enumerate(normalized)]
    return make_unique(normalized)


def header_score(row: List[Any]) -> float:
    texts = [clean_header_text(v) for v in row]
    non_empty = [t for t in texts if t]
    if len(non_empty) < 3:
        return 0.0
    hits = sum(1 for t in non_empty if any(k in normalize_colname(t) for k in HEADER_KEYWORDS))
    return (len(non_empty) * 1.0) + (hits * 2.5)


def promote_detected_header(df: pd.DataFrame, max_scan_rows: int = 30) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    scan_n = min(max_scan_rows, len(df))
    best_i: Optional[int] = None
    best_s = 0.0
    for i in range(scan_n):
        score = header_score(df.iloc[i].tolist())
        if score > best_s:
            best_s = score
            best_i = i
    if best_i is None or best_s <= 0:
        out = df.copy()
        out.columns = normalize_header_names(list(out.columns))
        return out
    out = df.iloc[best_i + 1 :].copy()
    out.columns = normalize_header_names(df.iloc[best_i].tolist())
    return out.dropna(how="all")


def read_sylk(path: Path) -> pd.DataFrame:
    cells: Dict[Tuple[int, int], Any] = {}
    maxr = 0
    maxc = 0
    current_r: Optional[int] = None
    current_c: Optional[int] = None
    with path.open("r", encoding="latin-1", errors="replace") as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("F;"):
                for p in line.split(";")[1:]:
                    if p.startswith("X"):
                        try:
                            current_c = int(p[1:])
                        except Exception:
                            pass
                    elif p.startswith("Y"):
                        try:
                            current_r = int(p[1:])
                        except Exception:
                            pass
                continue
            if not line.startswith("C;"):
                continue
            row: Optional[int] = None
            col: Optional[int] = None
            raw_val: Optional[str] = None
            for p in line.split(";")[1:]:
                if p.startswith("X"):
                    try:
                        col = int(p[1:])
                    except Exception:
                        pass
                elif p.startswith("Y"):
                    try:
                        row = int(p[1:])
                    except Exception:
                        pass
                elif p.startswith("K"):
                    raw_val = p[1:]
            if row is not None:
                current_r = row
            if col is not None:
                current_c = col
            rr = current_r if row is None else row
            cc = current_c if col is None else col
            if rr is None or cc is None or raw_val is None:
                continue
            cells[(rr, cc)] = _sylk_decode_k(raw_val)
            maxr = max(maxr, rr)
            maxc = max(maxc, cc)

    if not cells or maxc <= 1:
        raise ValueError("SLK nao reconhecido ou sem colunas suficientes.")

    best_row: Optional[int] = None
    best_score = -1.0
    for r in range(1, maxr + 1):
        vals = [str(cells.get((r, c), "")).strip() for c in range(1, maxc + 1)]
        if sum(1 for v in vals if v) < 3:
            continue
        score = header_score(vals)
        if score > best_score:
            best_score = score
            best_row = r
    if best_row is None:
        raise ValueError("SLK sem linha de cabecalho detectavel.")

    header = [str(cells.get((best_row, c), "")).strip() or f"col_{c}" for c in range(1, maxc + 1)]
    rows: List[List[Any]] = []
    for r in range(best_row + 1, maxr + 1):
        row_vals = [cells.get((r, c), None) for c in range(1, maxc + 1)]
        if all(v is None or str(v).strip() == "" for v in row_vals):
            continue
        rows.append(row_vals)
    return pd.DataFrame(rows, columns=header)


def read_report(path: Path) -> pd.DataFrame:
    ext = path.suffix.lower()
    if ext == ".csv":
        df = pd.read_csv(path, sep=None, engine="python", header=None)
    elif ext == ".xlsx":
        workbook = pd.ExcelFile(path)
        best_df: Optional[pd.DataFrame] = None
        best_score = -1.0

        for sheet_name in workbook.sheet_names:
            raw_df = pd.read_excel(workbook, sheet_name=sheet_name, header=None)
            candidate_df = promote_detected_header(raw_df)

            # Prioriza abas com mapeamento de nota/cfop/valor.
            score = 0.0
            try:
                cands = detect_columns(candidate_df)
                for intent in ("num_doc", "cfop", "vl_doc"):
                    if cands.get(intent):
                        score += cands[intent][0][1]
            except Exception:
                score = 0.0

            # Critério secundário: mais linhas utilitárias de dados.
            score += min(float(len(candidate_df)) / 10000.0, 1.0)
            if score > best_score:
                best_score = score
                best_df = candidate_df

        if best_df is not None:
            return best_df
        df = pd.read_excel(path, header=None)
    elif ext == ".slk":
        df = read_sylk(path)
        df.columns = normalize_header_names(list(df.columns))
        return df
    elif ext == ".pdf":
        df = read_pdf_tipo50(path)
        df.columns = normalize_header_names(list(df.columns))
        return df
    else:
        raise ValueError(f"Formato nao suportado: {ext}")
    return promote_detected_header(df)


COLUMN_INTENTS: Dict[str, List[str]] = {
    "dt_doc": ["data", "dt", "emissao"],
    "emitente": ["emitente", "fornecedor", "prestador", "participante", "razao", "nome"],
    "num_doc": ["nota", "nf", "num", "numero", "nota_ini", "nota_inicial"],
    "serie": ["serie"],
    "cfop": ["cfop"],
    "vl_doc": ["valor", "vl", "total", "vl_doc", "valor_total"],
}


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
        col_norm = normalize_colname(col)
        sample = df[col].dropna().head(80)
        for intent, keys in COLUMN_INTENTS.items():
            name_score = 0.0
            for key in keys:
                if column_name_matches_intent(col_norm, normalize_colname(key)):
                    name_score += 1.0
            if intent == "serie" and ("serie" in col_norm or "erie" in col_norm):
                name_score += 1.0
            if intent == "vl_doc" and "aliq" in col_norm:
                continue
            if name_score <= 0:
                continue

            content_score = 0.0
            if intent == "dt_doc":
                hits = sum(1 for v in sample.astype(str) if parse_date_any(v))
                content_score = hits / max(1, len(sample))
            elif intent == "vl_doc":
                hits = sum(1 for v in sample if to_decimal_ptbr(v) is not None)
                content_score = hits / max(1, len(sample))
            elif intent == "cfop":
                hits = sum(1 for v in sample.astype(str) if len(normalize_cfop(v)) == 4)
                content_score = hits / max(1, len(sample))
            elif intent == "emitente":
                hits = 0
                for v in sample.astype(str):
                    txt = normalize_emitente_text(v)
                    if txt and not normalize_cfop(txt) and len(normalize_doc_key(txt)) == 0:
                        hits += 1
                content_score = hits / max(1, len(sample))
            elif intent in {"num_doc", "serie"}:
                hits = 0
                for v in sample.astype(str):
                    vv = re.sub(r"\D", "", v)
                    if vv and len(vv) <= 12:
                        hits += 1
                content_score = hits / max(1, len(sample))

            score = 0.7 * name_score + 0.3 * content_score
            if score > 0:
                candidates[intent].append((str(col), score))

    for intent in candidates:
        candidates[intent].sort(key=lambda x: x[1], reverse=True)
    return candidates


def best_candidate(cands: Dict[str, List[Tuple[str, float]]], intent: str) -> str:
    return cands[intent][0][0] if cands.get(intent) else ""


def resolve_report_mapping(df: pd.DataFrame, report_label: str) -> Dict[str, str]:
    cands = detect_columns(df)
    mapping = {
        "dt_doc": best_candidate(cands, "dt_doc"),
        "emitente": best_candidate(cands, "emitente"),
        "num_doc": best_candidate(cands, "num_doc"),
        "serie": best_candidate(cands, "serie"),
        "cfop": best_candidate(cands, "cfop"),
        "vl_doc": best_candidate(cands, "vl_doc"),
    }

    missing = [k for k in ("num_doc", "cfop", "vl_doc") if not mapping.get(k)]
    if missing:
        cols = ", ".join(str(c) for c in df.columns)
        raise ValueError(
            f"{report_label}: nao consegui detectar coluna(s) obrigatoria(s): {', '.join(missing)}. "
            f"Colunas lidas: {cols}"
        )

    print(f"\nMapeamento detectado ({report_label}):")
    for key in ("dt_doc", "emitente", "num_doc", "serie", "cfop", "vl_doc"):
        value = mapping.get(key, "")
        if value:
            print(f"  {key:8s} -> {value}")

    return mapping


def extract_report_notes(
    report_df: pd.DataFrame,
    mapping: Dict[str, str],
    forced_operacao: Optional[str],
    source_label: str,
) -> List[NoteRow]:
    out: List[NoteRow] = []

    col_dt = mapping.get("dt_doc", "")
    col_emit = mapping.get("emitente", "")
    col_num = mapping.get("num_doc", "")
    col_serie = mapping.get("serie", "")
    col_cfop = mapping.get("cfop", "")
    col_val = mapping.get("vl_doc", "")

    for _, row in report_df.iterrows():
        numero = normalize_doc_key(row.get(col_num, ""))
        if not numero:
            continue
        cfop = normalize_cfop(row.get(col_cfop, ""))
        if not cfop:
            continue
        valor = to_decimal_ptbr(row.get(col_val))
        if valor is None:
            continue

        serie = normalize_doc_key(row.get(col_serie, "")) if col_serie else ""
        emitente = normalize_emitente_text(row.get(col_emit, "")) if col_emit else ""
        data = format_date_br(row.get(col_dt, "")) if col_dt else ""
        operacao = forced_operacao or infer_operacao("", cfop)
        if operacao not in {"entradas", "saidas"}:
            continue

        out.append(
            NoteRow(
                data=data,
                emitente=emitente,
                numero_nota=numero,
                cfop=cfop,
                serie=serie,
                valor=round2(valor),
                operacao=operacao,
                origem=source_label,
                registro="REL",
            )
        )

    return out


def aggregate_notes_for_compare(notes: List[NoteRow]) -> List[NoteRow]:
    groups: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    for note in notes:
        key = note.compare_id()
        bucket = groups.setdefault(
            key,
            {
                "operacao": note.operacao,
                "origem": note.origem,
                "registro": note.registro,
                "numero_nota": note.numero_nota,
                "emitentes": set(),
                "valor": 0.0,
                "datas": [],
                "series": set(),
                "cfops": set(),
            },
        )

        bucket["valor"] += note.valor
        if note.data:
            bucket["datas"].append(note.data)
        if note.serie:
            bucket["series"].add(note.serie)
        if note.cfop:
            bucket["cfops"].add(note.cfop)
        emit = normalize_emitente_text(note.emitente)
        if emit:
            bucket["emitentes"].add(emit)

    out: List[NoteRow] = []
    for _, bucket in groups.items():
        data_final = ""
        datas_validas = [parse_date_any(d) for d in bucket["datas"] if parse_date_any(d)]
        if datas_validas:
            data_final = min(datas_validas).strftime("%d/%m/%Y")

        serie_final = "; ".join(sorted(str(s) for s in bucket["series"])) if bucket["series"] else ""
        cfop_final = "; ".join(sorted(str(c) for c in bucket["cfops"])) if bucket["cfops"] else ""
        emitente_final = "; ".join(sorted(str(e) for e in bucket["emitentes"])) if bucket["emitentes"] else ""

        out.append(
            NoteRow(
                data=data_final,
                emitente=emitente_final,
                numero_nota=bucket["numero_nota"],
                cfop=cfop_final,
                serie=serie_final,
                valor=round2(bucket["valor"]),
                operacao=bucket["operacao"],
                origem=bucket["origem"],
                registro=bucket["registro"],
            )
        )

    return out


def split_only(left: List[NoteRow], right: List[NoteRow]) -> Tuple[List[NoteRow], List[NoteRow]]:
    left_agg = {note.compare_id(): note for note in aggregate_notes_for_compare(left)}
    right_agg = {note.compare_id(): note for note in aggregate_notes_for_compare(right)}

    left_only: List[NoteRow] = []
    right_only: List[NoteRow] = []
    for key in set(left_agg.keys()) | set(right_agg.keys()):
        l_note = left_agg.get(key)
        r_note = right_agg.get(key)

        if l_note is None and r_note is not None:
            right_only.append(r_note)
            continue
        if r_note is None and l_note is not None:
            left_only.append(l_note)
            continue
        if l_note is None or r_note is None:
            continue

        if abs(round2(l_note.valor) - round2(r_note.valor)) > 0.01:
            left_only.append(l_note)
            right_only.append(r_note)

    return left_only, right_only


def sort_notes(notes: List[NoteRow]) -> List[NoteRow]:
    return sorted(
        notes,
        key=lambda n: (
            parse_date_any(n.data) or date.min,
            normalize_emitente_key(n.emitente),
            normalize_doc_key(n.numero_nota),
            normalize_doc_key(n.serie),
            normalize_cfop(n.cfop),
            round2(n.valor),
        ),
    )


def notes_to_df(notes: List[NoteRow]) -> pd.DataFrame:
    ordered = sort_notes(notes)
    rows = [n.export_row() for n in ordered]
    return pd.DataFrame(rows, columns=["data", "emitente", "numero_nota", "cfop", "serie", "valor"])


def sum_values(notes: List[NoteRow]) -> float:
    return round2(sum(round2(n.valor) for n in notes))


def export_result(
    output_path: Path,
    somente_sped: List[NoteRow],
    somente_rel_entradas: List[NoteRow],
    somente_rel_saidas: List[NoteRow],
) -> Path:
    df_sped = notes_to_df(somente_sped)
    df_ent = notes_to_df(somente_rel_entradas)
    df_sai = notes_to_df(somente_rel_saidas)

    df_totais = pd.DataFrame(
        [
            {
                "referencia": "total_apenas_sped",
                "quantidade": len(somente_sped),
                "valor_total": sum_values(somente_sped),
            },
            {
                "referencia": "total_relatorio_entradas",
                "quantidade": len(somente_rel_entradas),
                "valor_total": sum_values(somente_rel_entradas),
            },
            {
                "referencia": "total_relatorio_saidas",
                "quantidade": len(somente_rel_saidas),
                "valor_total": sum_values(somente_rel_saidas),
            },
        ],
        columns=["referencia", "quantidade", "valor_total"],
    )

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df_sped.to_excel(writer, index=False, sheet_name="Somente no SPED")
        df_ent.to_excel(writer, index=False, sheet_name="Somente no Rel Entradas")
        df_sai.to_excel(writer, index=False, sheet_name="Somente no Rel Saidas")
        df_totais.to_excel(writer, index=False, sheet_name="Totais")

    return output_path


def ensure_file_exists(path: Optional[Path], label: str) -> Optional[Path]:
    if path is None:
        return None
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"{label} nao encontrado: {path}")
    return path


def resolve_input_paths(args: argparse.Namespace) -> Tuple[Path, Optional[Path], Optional[Path]]:
    sped_path = Path(args.sped_path).expanduser().resolve() if args.sped_path else None
    rel_entradas = Path(args.relatorio_entradas).expanduser().resolve() if args.relatorio_entradas else None
    rel_saidas = Path(args.relatorio_saidas).expanduser().resolve() if args.relatorio_saidas else None

    if args.report_path:
        legacy_report = Path(args.report_path).expanduser().resolve()
        if not rel_entradas and not rel_saidas:
            if args.modo == "entradas":
                rel_entradas = legacy_report
            else:
                rel_saidas = legacy_report
        elif not rel_entradas:
            rel_entradas = legacy_report
        elif not rel_saidas:
            rel_saidas = legacy_report

    if sped_path is None:
        raise ValueError("Informe o arquivo SPED.")
    if rel_entradas is None and rel_saidas is None:
        raise ValueError("Informe pelo menos um relatorio (entradas e/ou saidas).")

    ensure_file_exists(sped_path, "Arquivo SPED")
    ensure_file_exists(rel_entradas, "Relatorio de entradas")
    ensure_file_exists(rel_saidas, "Relatorio de saidas")
    return sped_path, rel_entradas, rel_saidas


def split_sped_by_operacao(sped_notes: List[NoteRow]) -> Tuple[List[NoteRow], List[NoteRow]]:
    entradas = [n for n in sped_notes if n.operacao == "entradas"]
    saidas = [n for n in sped_notes if n.operacao == "saidas"]
    return entradas, saidas


def main() -> None:
    args = parse_args()
    if args.layouts_dir:
        set_layout_paths(Path(args.layouts_dir))

    if not LAYOUTS_DIR.exists():
        print(f"ERRO: pasta de layouts nao encontrada: {LAYOUTS_DIR}")
        sys.exit(2)
    if not MASTER_INDEX.exists():
        expected = ", ".join(INDEX_FILE_CANDIDATES)
        print(f"ERRO: arquivo de indice nao encontrado em {LAYOUTS_DIR}. Esperado: {expected}")
        sys.exit(2)

    try:
        sped_path, rel_entradas_path, rel_saidas_path = resolve_input_paths(args)
    except Exception as exc:
        print(f"ERRO: {exc}")
        sys.exit(3)

    header = read_sped_0000(sped_path)
    print(f"SPED: {header.nome} ({header.cnpj})")
    print(f"Periodo (0000): {header.dt_ini:%d/%m/%Y} a {header.dt_fin:%d/%m/%Y}")

    sped_notes = extract_sped_notes(sped_path)
    sped_entradas, sped_saidas = split_sped_by_operacao(sped_notes)
    print(f"Notas SPED consideradas: {len(sped_notes)} (entradas={len(sped_entradas)} | saidas={len(sped_saidas)})")

    report_ent_notes: List[NoteRow] = []
    report_sai_notes: List[NoteRow] = []

    if rel_entradas_path is not None:
        df_ent = read_report(rel_entradas_path)
        print(f"\nRelatorio de entradas: {len(df_ent)} linhas | {len(df_ent.columns)} colunas")
        map_ent = resolve_report_mapping(df_ent, "relatorio_entradas")
        report_ent_notes = extract_report_notes(df_ent, map_ent, "entradas", "relatorio_entradas")
        print(f"Notas validas no relatorio de entradas: {len(report_ent_notes)}")

    if rel_saidas_path is not None:
        df_sai = read_report(rel_saidas_path)
        print(f"\nRelatorio de saidas: {len(df_sai)} linhas | {len(df_sai.columns)} colunas")
        map_sai = resolve_report_mapping(df_sai, "relatorio_saidas")
        report_sai_notes = extract_report_notes(df_sai, map_sai, "saidas", "relatorio_saidas")
        print(f"Notas validas no relatorio de saidas: {len(report_sai_notes)}")

    sped_only_entradas: List[NoteRow] = []
    sped_only_saidas: List[NoteRow] = []
    rel_only_entradas: List[NoteRow] = []
    rel_only_saidas: List[NoteRow] = []

    if rel_entradas_path is not None:
        sped_only_entradas, rel_only_entradas = split_only(sped_entradas, report_ent_notes)
    if rel_saidas_path is not None:
        sped_only_saidas, rel_only_saidas = split_only(sped_saidas, report_sai_notes)

    somente_sped = sped_only_entradas + sped_only_saidas
    print("\n=== RESUMO ===")
    print(f"Somente no SPED: {len(somente_sped)}")
    print(f"Somente no relatorio de entradas: {len(rel_only_entradas)}")
    print(f"Somente no relatorio de saidas: {len(rel_only_saidas)}")

    if args.output.strip():
        output_path = Path(args.output.strip())
        if output_path.suffix.lower() != ".xlsx":
            output_path = output_path.with_suffix(".xlsx")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path = output_path.resolve()
    else:
        base_dir = (
            rel_entradas_path.parent if rel_entradas_path is not None
            else rel_saidas_path.parent if rel_saidas_path is not None
            else sped_path.parent
        )
        output_path = (base_dir / f"diferencas_conferencia_{datetime.now():%Y%m%d_%H%M%S}.xlsx").resolve()

    export_result(output_path, somente_sped, rel_only_entradas, rel_only_saidas)
    print(f"\nPlanilha de diferencas exportada em: {output_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERRO: {exc}")
        sys.exit(3)
