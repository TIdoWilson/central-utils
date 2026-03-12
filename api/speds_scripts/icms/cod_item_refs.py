#!/usr/bin/env python3
"""
Helpers para mapear e coletar referencias de COD_ITEM na EFD ICMS/IPI.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable, Dict, Optional, Sequence, Set, Tuple


# Fallback minimo caso os layouts JSON nao estejam disponiveis.
FALLBACK_REG_COD_ITEM_FIELDS: Dict[str, Tuple[int, ...]] = {
    "C170": (3,),
    "H010": (2,),
    "K200": (3,),
    "K210": (5,),
    "K215": (2,),
    "K220": (3, 4),
    "K230": (5,),
    "K235": (3,),
    "K250": (3,),
    "K255": (3,),
}


def default_icms_layouts_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "layouts" / "speds" / "icms"


def _parse_field_number(raw_number: str) -> Optional[int]:
    match = re.search(r"\d+", str(raw_number or ""))
    if not match:
        return None
    value = int(match.group(0))
    return value if value > 0 else None


def load_icms_cod_item_field_map(layouts_dir: Optional[Path] = None) -> Dict[str, Tuple[int, ...]]:
    reg_positions: Dict[str, Set[int]] = {
        reg: set(pos_list) for reg, pos_list in FALLBACK_REG_COD_ITEM_FIELDS.items()
    }

    base_dir = layouts_dir or default_icms_layouts_dir()
    if not base_dir.exists():
        return {reg: tuple(sorted(pos_set)) for reg, pos_set in reg_positions.items()}

    for path in sorted(base_dir.glob("*.json")):
        if path.name == "index_registros.json":
            continue

        data = None
        for enc in ("utf-8", "latin-1"):
            try:
                data = json.loads(path.read_text(encoding=enc))
                break
            except Exception:
                continue
        if not isinstance(data, dict):
            continue

        reg = str(data.get("registro", {}).get("codigo", "")).strip().upper()
        if not reg:
            reg = path.stem.split("_", 1)[0].strip().upper()
        if not reg:
            continue

        for campo in data.get("campos", []) or []:
            if not isinstance(campo, dict):
                continue
            campo_nome = str(campo.get("campo", "")).strip().upper()
            if not campo_nome.startswith("COD_ITEM"):
                continue
            pos = _parse_field_number(str(campo.get("numero", "")))
            if pos is None:
                continue
            reg_positions.setdefault(reg, set()).add(pos)

    return {reg: tuple(sorted(pos_set)) for reg, pos_set in reg_positions.items()}


def collect_cod_item_refs(
    lines: Sequence[str],
    reg_positions: Dict[str, Tuple[int, ...]],
    get_reg_fn: Callable[[str], str],
    parse_record_parts_fn: Callable[[str], Sequence[str]],
    exclude_regs: Optional[Set[str]] = None,
) -> Set[str]:
    excluded = {r.upper() for r in (exclude_regs or set())}
    out: Set[str] = set()

    for line in lines:
        reg = get_reg_fn(line).upper()
        if not reg or reg in excluded:
            continue

        positions = reg_positions.get(reg)
        if not positions:
            continue

        parts = list(parse_record_parts_fn(line))
        for pos_1_based in positions:
            idx = pos_1_based - 1
            if idx >= len(parts):
                continue
            cod_item = parts[idx].strip()
            if cod_item:
                out.add(cod_item)

    return out

