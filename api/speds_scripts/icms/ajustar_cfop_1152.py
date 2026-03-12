#!/usr/bin/env python3
"""
Ajusta notas com CFOP alvo no SPED EFD ICMS/IPI:
- Zera ALIQ_ICMS, VL_BC_ICMS e VL_ICMS no C170 (itens CFOP alvo).
- Zera ALIQ_ICMS, VL_BC_ICMS e VL_ICMS no C190 (linhas CFOP alvo).
- Recalcula VL_BC_ICMS e VL_ICMS do C100 da nota, com base nos C190 da mesma nota.

As posicoes de campos sao lidas dos JSON em "layouts json".
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple


RE_REG = re.compile(r"^[0-9A-Z]{4}$")
DEC_2 = Decimal("0.01")


@dataclass
class AffectedNote:
    line_idx_1_based: int
    serie: str
    num_doc: str
    chv_nfe: str
    c170_changed: int
    c190_changed: int
    c100_vl_bc_icms_old: str
    c100_vl_bc_icms_new: str
    c100_vl_icms_old: str
    c100_vl_icms_new: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ajusta C170/C190/C100 para notas com CFOP alvo (padrao: 1152)."
    )
    parser.add_argument("sped_path", help="Arquivo SPED de entrada (.txt)")
    parser.add_argument("--cfop", default="1152", help="CFOP alvo (padrao: 1152)")
    parser.add_argument(
        "--layouts-dir",
        default="layouts json",
        help='Pasta dos layouts JSON (padrao: "layouts json")',
    )
    parser.add_argument("--output", help="Arquivo de saida")
    return parser.parse_args()


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except UnicodeDecodeError:
        return json.loads(path.read_text(encoding="latin-1"))


def load_pos_map(layouts_dir: Path, reg: str) -> Dict[str, int]:
    p = layouts_dir / f"{reg}.json"
    if not p.exists():
        raise FileNotFoundError(f"Layout nao encontrado: {p}")
    data = read_json(p)
    pos_map: Dict[str, int] = {}
    for c in data.get("campos", []):
        nome = c.get("nome")
        pos = c.get("pos")
        if nome and isinstance(pos, int) and pos >= 1:
            # indice em parts sem pipes de borda
            pos_map[nome] = pos - 1
    return pos_map


def get_reg(line: str) -> str:
    if not line.startswith("|"):
        return ""
    parts = line.split("|")
    if len(parts) < 3:
        return ""
    reg = parts[1].strip().upper()
    return reg if RE_REG.fullmatch(reg) else ""


def split_parts(line: str) -> List[str]:
    parts = line.rstrip("\r\n").split("|")
    if parts and parts[0] == "":
        parts = parts[1:]
    if parts and parts[-1] == "":
        parts = parts[:-1]
    return parts


def build_line(parts: Sequence[str]) -> str:
    return "|" + "|".join(parts) + "|"


def ensure_idx(parts: List[str], idx: int) -> None:
    while len(parts) <= idx:
        parts.append("")


def get_field(parts: Sequence[str], pos_map: Dict[str, int], field: str) -> str:
    idx = pos_map.get(field)
    if idx is None or idx >= len(parts):
        return ""
    return parts[idx]


def set_field(parts: List[str], pos_map: Dict[str, int], field: str, value: str) -> None:
    idx = pos_map.get(field)
    if idx is None:
        raise KeyError(f"Campo {field} nao encontrado no layout.")
    ensure_idx(parts, idx)
    parts[idx] = value


def parse_decimal_ptbr(x: str) -> Decimal:
    s = str(x or "").strip()
    if not s:
        return Decimal("0")
    s = s.replace("R$", "").replace("\xa0", "").replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return Decimal("0")


def format_decimal_sped(x: Decimal) -> str:
    q = x.quantize(DEC_2, rounding=ROUND_HALF_UP)
    s = format(q, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    if s in {"-0", "-0.0", ""}:
        s = "0"
    return s.replace(".", ",")


def quantize2(x: Decimal) -> Decimal:
    return x.quantize(DEC_2, rounding=ROUND_HALF_UP)


def required_fields(pos_map: Dict[str, int], fields: Sequence[str], reg: str) -> None:
    missing = [f for f in fields if f not in pos_map]
    if missing:
        raise KeyError(f"Campos ausentes no layout {reg}: {', '.join(missing)}")


def finalize_note(
    lines: List[str],
    c100_idx: Optional[int],
    c170_idxs: List[int],
    c190_idxs: List[int],
    has_target_cfop: bool,
    c170_changed: int,
    c190_changed: int,
    pos_c100: Dict[str, int],
    pos_c170: Dict[str, int],
    pos_c190: Dict[str, int],
    affected: List[AffectedNote],
) -> None:
    if c100_idx is None or not has_target_cfop:
        return

    c100_parts = split_parts(lines[c100_idx])
    old_vl_bc_icms = get_field(c100_parts, pos_c100, "VL_BC_ICMS")
    old_vl_icms = get_field(c100_parts, pos_c100, "VL_ICMS")

    sum_bc_icms = Decimal("0")
    sum_icms = Decimal("0")

    if c190_idxs:
        for idx in c190_idxs:
            p = split_parts(lines[idx])
            sum_bc_icms += parse_decimal_ptbr(get_field(p, pos_c190, "VL_BC_ICMS"))
            sum_icms += parse_decimal_ptbr(get_field(p, pos_c190, "VL_ICMS"))
    elif c170_idxs:
        for idx in c170_idxs:
            p = split_parts(lines[idx])
            sum_bc_icms += parse_decimal_ptbr(get_field(p, pos_c170, "VL_BC_ICMS"))
            sum_icms += parse_decimal_ptbr(get_field(p, pos_c170, "VL_ICMS"))

    new_vl_bc_icms = format_decimal_sped(quantize2(sum_bc_icms))
    new_vl_icms = format_decimal_sped(quantize2(sum_icms))

    set_field(c100_parts, pos_c100, "VL_BC_ICMS", new_vl_bc_icms)
    set_field(c100_parts, pos_c100, "VL_ICMS", new_vl_icms)
    lines[c100_idx] = build_line(c100_parts)

    affected.append(
        AffectedNote(
            line_idx_1_based=c100_idx + 1,
            serie=get_field(c100_parts, pos_c100, "SER"),
            num_doc=get_field(c100_parts, pos_c100, "NUM_DOC"),
            chv_nfe=get_field(c100_parts, pos_c100, "CHV_NFE"),
            c170_changed=c170_changed,
            c190_changed=c190_changed,
            c100_vl_bc_icms_old=old_vl_bc_icms,
            c100_vl_bc_icms_new=new_vl_bc_icms,
            c100_vl_icms_old=old_vl_icms,
            c100_vl_icms_new=new_vl_icms,
        )
    )


def adjust_file(
    sped_path: Path,
    output_path: Path,
    layouts_dir: Path,
    cfop_target: str,
) -> Tuple[List[AffectedNote], int, int]:
    pos_c100 = load_pos_map(layouts_dir, "C100")
    pos_c170 = load_pos_map(layouts_dir, "C170")
    pos_c190 = load_pos_map(layouts_dir, "C190")

    required_fields(pos_c100, ("SER", "NUM_DOC", "CHV_NFE", "VL_BC_ICMS", "VL_ICMS"), "C100")
    required_fields(pos_c170, ("CFOP", "VL_BC_ICMS", "ALIQ_ICMS", "VL_ICMS"), "C170")
    required_fields(pos_c190, ("CFOP", "ALIQ_ICMS", "VL_BC_ICMS", "VL_ICMS"), "C190")

    content = sped_path.read_text(encoding="latin-1", errors="replace")
    lines = [ln.rstrip("\r\n") for ln in content.splitlines()]

    affected: List[AffectedNote] = []
    total_c170_changed = 0
    total_c190_changed = 0

    current_c100_idx: Optional[int] = None
    current_c170_idxs: List[int] = []
    current_c190_idxs: List[int] = []
    current_has_target = False
    current_c170_changed = 0
    current_c190_changed = 0

    for i, line in enumerate(lines):
        reg = get_reg(line)
        if not reg:
            continue

        # Encerra nota ao sair do Bloco C.
        if current_c100_idx is not None and reg[0] != "C":
            finalize_note(
                lines,
                current_c100_idx,
                current_c170_idxs,
                current_c190_idxs,
                current_has_target,
                current_c170_changed,
                current_c190_changed,
                pos_c100,
                pos_c170,
                pos_c190,
                affected,
            )
            current_c100_idx = None
            current_c170_idxs = []
            current_c190_idxs = []
            current_has_target = False
            current_c170_changed = 0
            current_c190_changed = 0

        if reg == "C100":
            # Fecha nota anterior.
            finalize_note(
                lines,
                current_c100_idx,
                current_c170_idxs,
                current_c190_idxs,
                current_has_target,
                current_c170_changed,
                current_c190_changed,
                pos_c100,
                pos_c170,
                pos_c190,
                affected,
            )
            current_c100_idx = i
            current_c170_idxs = []
            current_c190_idxs = []
            current_has_target = False
            current_c170_changed = 0
            current_c190_changed = 0
            continue

        if current_c100_idx is None:
            continue

        if reg == "C170":
            current_c170_idxs.append(i)
            parts = split_parts(line)
            if get_field(parts, pos_c170, "CFOP").strip() == cfop_target:
                set_field(parts, pos_c170, "ALIQ_ICMS", "0")
                set_field(parts, pos_c170, "VL_BC_ICMS", "0")
                set_field(parts, pos_c170, "VL_ICMS", "0")
                lines[i] = build_line(parts)
                current_has_target = True
                current_c170_changed += 1
                total_c170_changed += 1
            continue

        if reg == "C190":
            current_c190_idxs.append(i)
            parts = split_parts(line)
            if get_field(parts, pos_c190, "CFOP").strip() == cfop_target:
                set_field(parts, pos_c190, "ALIQ_ICMS", "0")
                set_field(parts, pos_c190, "VL_BC_ICMS", "0")
                set_field(parts, pos_c190, "VL_ICMS", "0")
                lines[i] = build_line(parts)
                current_has_target = True
                current_c190_changed += 1
                total_c190_changed += 1
            continue

    # Fecha ultima nota caso arquivo termine ainda no Bloco C.
    finalize_note(
        lines,
        current_c100_idx,
        current_c170_idxs,
        current_c190_idxs,
        current_has_target,
        current_c170_changed,
        current_c190_changed,
        pos_c100,
        pos_c170,
        pos_c190,
        affected,
    )

    output_path.write_text("\n".join(lines) + "\n", encoding="latin-1", errors="replace")
    return affected, total_c170_changed, total_c190_changed


def main() -> None:
    args = parse_args()
    sped_path = Path(args.sped_path)
    layouts_dir = Path(args.layouts_dir)
    if not sped_path.exists():
        raise SystemExit(f"ERRO: arquivo nao encontrado: {sped_path}")
    if not layouts_dir.exists():
        raise SystemExit(f"ERRO: pasta de layouts nao encontrada: {layouts_dir}")

    output_path = (
        Path(args.output)
        if args.output
        else sped_path.parent
        / f"{sped_path.stem}_CFOP_{args.cfop}_AJUSTADO_{datetime.now():%Y%m%d_%H%M%S}.txt"
    )

    affected, total_c170, total_c190 = adjust_file(
        sped_path=sped_path,
        output_path=output_path,
        layouts_dir=layouts_dir,
        cfop_target=args.cfop,
    )

    print("Ajuste concluido.")
    print(f"- Entrada: {sped_path}")
    print(f"- Saida: {output_path}")
    print(f"- CFOP alvo: {args.cfop}")
    print(f"- Notas afetadas (C100): {len(affected)}")
    print(f"- Registros C170 alterados: {total_c170}")
    print(f"- Registros C190 alterados: {total_c190}")
    if affected:
        print("- Primeiras notas afetadas:")
        for n in affected[:20]:
            ident = f"SER {n.serie} NUM {n.num_doc}"
            if n.chv_nfe:
                ident += f" CHV {n.chv_nfe}"
            print(
                f"  linha {n.line_idx_1_based}: {ident} | "
                f"C170={n.c170_changed} C190={n.c190_changed} | "
                f"BC {n.c100_vl_bc_icms_old}->{n.c100_vl_bc_icms_new} | "
                f"ICMS {n.c100_vl_icms_old}->{n.c100_vl_icms_new}"
            )


if __name__ == "__main__":
    main()
