#!/usr/bin/env python3
"""
Integra inventario SPED (0200 + Bloco H) em um arquivo EFD existente.

Entrada:
- Arquivo SPED original (TXT)
- Arquivo gerado pelo gerador_de_inventario.py (TXT com 0200 e Bloco H)

Saida:
- Novo SPED pronto para importacao no PVA, com totalizadores atualizados:
  - Bloco 0: 0990
  - Bloco H: H001/H990
  - Bloco 9: 9001/9900/9990/9999
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple
import unicodedata
from cod_item_refs import collect_cod_item_refs, load_icms_cod_item_field_map
RE_REG = re.compile(r"^[0-9A-Z]{4}$")
DEFAULT_COD_CTA = "11216001000"
REGS_0200_CHILDREN = {"0205", "0210", "0220", "0221"}
REGS_0200_BLOCK = {"0200"} | REGS_0200_CHILDREN


@dataclass
class IntegrationStats:
    source_lines: int
    integrated_lines: int
    inv_0190_count: int
    inv_0190_added: int
    inv_0190_skipped: int
    inv_0200_count: int
    inv_0200_used_count: int
    inv_0200_used_h010_count: int
    inv_0200_used_other_regs_count: int
    inv_0200_unused_skipped: int
    inv_h_count: int
    reg_0190_count: int
    reg_0200_count: int
    reg_h010_count: int
    qtd_lin_0: int
    qtd_lin_h: int
    qtd_lin_9: int
    qtd_lin_total: int
    cod_cta_h010: str
    cod_cta_source: str
    h010_cod_cta_updates: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Integra inventario (0200 + bloco H) em SPED e atualiza totalizadores."
    )
    parser.add_argument("sped_path", nargs="?", help="Arquivo SPED original")
    parser.add_argument("inventario_path", nargs="?", help="Arquivo de inventario gerado")
    parser.add_argument("--output", help="Arquivo de saida")
    parser.add_argument(
        "--default-cod-cta",
        default=DEFAULT_COD_CTA,
        help=f"COD_CTA padrao para H010 quando nao achar conta de estoque no 0500 (padrao: {DEFAULT_COD_CTA})",
    )
    parser.add_argument(
        "--skip-relationship-validation",
        action="store_true",
        help="Mantido por compatibilidade, sem efeito na integracao do inventario.",
    )
    return parser.parse_args()


def select_file_dialog(title: str, patterns: Sequence[Tuple[str, str]]) -> Path:
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        chosen = filedialog.askopenfilename(title=title, filetypes=list(patterns))
        if not chosen:
            raise SystemExit(f"Selecao cancelada: {title}")
        return Path(chosen)
    except Exception:
        user_val = input(f"{title}: ").strip().strip('"').strip("'")
        if not user_val:
            raise SystemExit("Caminho invalido.")
        return Path(user_val)


def get_reg(line: str) -> str:
    line = line.strip()
    if not line or not line.startswith("|"):
        return ""
    parts = line.split("|")
    if len(parts) < 3:
        return ""
    reg = parts[1].strip().upper()
    if RE_REG.fullmatch(reg):
        return reg
    return ""


def parse_record_parts(line: str) -> List[str]:
    parts = line.strip().split("|")
    if parts and parts[0] == "":
        parts = parts[1:]
    if parts and parts[-1] == "":
        parts = parts[:-1]
    return parts


def build_record(parts: Sequence[str]) -> str:
    cleaned = [str(p).replace("\r", " ").replace("\n", " ") for p in parts]
    return "|" + "|".join(cleaned) + "|"


def set_record_field(line: str, pos_1_based: int, value: str) -> str:
    parts = parse_record_parts(line)
    while len(parts) < pos_1_based:
        parts.append("")
    parts[pos_1_based - 1] = value
    return build_record(parts)


def normalize_text(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def read_sped_lines(path: Path) -> List[str]:
    raw = path.read_text(encoding="latin-1", errors="replace")
    lines_raw = [ln.strip() for ln in raw.splitlines() if ln.strip()]

    lines: List[str] = []
    found_0000 = False
    for ln in lines_raw:
        reg = get_reg(ln)
        if not reg:
            continue
        if reg == "0000":
            found_0000 = True
        if not found_0000:
            continue
        lines.append(ln)
        if reg == "9999":
            break
    if not lines:
        raise ValueError(f"Nenhuma linha SPED valida encontrada em: {path}")
    if get_reg(lines[0]) != "0000":
        raise ValueError("Arquivo SPED nao inicia com registro 0000.")
    if get_reg(lines[-1]) != "9999":
        raise ValueError("Arquivo SPED nao contem registro 9999 valido.")
    return lines


def read_inventory_lines(path: Path) -> Tuple[List[str], List[str], List[str]]:
    raw = path.read_text(encoding="latin-1", errors="replace")
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    valid = [ln for ln in lines if get_reg(ln)]
    inv_0190 = [ln for ln in valid if get_reg(ln) == "0190"]
    inv_0200 = [ln for ln in valid if get_reg(ln) in REGS_0200_BLOCK]
    inv_h = [ln for ln in valid if get_reg(ln).startswith("H")]

    if not inv_0200:
        raise ValueError("Arquivo de inventario nao contem registros 0200.")
    if not inv_h:
        raise ValueError("Arquivo de inventario nao contem bloco H.")
    if get_reg(inv_h[0]) != "H001":
        raise ValueError("Bloco H do inventario deve iniciar com H001.")
    if get_reg(inv_h[-1]) != "H990":
        raise ValueError("Bloco H do inventario deve encerrar com H990.")
    return inv_0190, inv_0200, inv_h


def get_0200_cod_item(line: str) -> str:
    if get_reg(line) != "0200":
        return ""
    p = parse_record_parts(line)
    return p[1].strip() if len(p) > 1 else ""


def get_h010_cod_item(line: str) -> str:
    if get_reg(line) != "H010":
        return ""
    p = parse_record_parts(line)
    return p[1].strip() if len(p) > 1 else ""


def collect_h010_cod_items(lines: Sequence[str]) -> Set[str]:
    out: Set[str] = set()
    for ln in lines:
        cod = get_h010_cod_item(ln)
        if cod:
            out.add(cod)
    return out


def group_0200_with_children(lines: Sequence[str]) -> List[List[str]]:
    groups: List[List[str]] = []
    current: List[str] = []
    for ln in lines:
        reg = get_reg(ln)
        if reg == "0200":
            if current:
                groups.append(current)
            current = [ln]
            continue
        if reg in REGS_0200_CHILDREN and current:
            current.append(ln)
            continue
    if current:
        groups.append(current)
    return groups


def next_cod_item_with_suffix_a(base_code: str, taken_codes: Set[str]) -> str:
    attempt = 1
    while True:
        suffix = "A" if attempt == 1 else f"A{attempt}"
        candidate = f"{base_code}{suffix}"
        if candidate not in taken_codes:
            return candidate
        attempt += 1


def prevalidate_cod_item_conflicts(
    sped_lines: Sequence[str],
    inv_0200: Sequence[str],
    inv_h: Sequence[str],
) -> Tuple[List[str], List[str], Dict[str, str]]:
    source_codes = {get_0200_cod_item(ln) for ln in sped_lines if get_reg(ln) == "0200"}
    source_codes.discard("")

    inv_codes_order: List[str] = []
    seen_inv_codes: Set[str] = set()
    for ln in inv_0200:
        cod = get_0200_cod_item(ln)
        if not cod or cod in seen_inv_codes:
            continue
        seen_inv_codes.add(cod)
        inv_codes_order.append(cod)

    taken_codes = set(source_codes)
    taken_codes.update(inv_codes_order)

    code_map: Dict[str, str] = {}
    for cod in inv_codes_order:
        if cod not in source_codes:
            continue
        new_cod = next_cod_item_with_suffix_a(cod, taken_codes)
        code_map[cod] = new_cod
        taken_codes.add(new_cod)

    if not code_map:
        return list(inv_0200), list(inv_h), {}

    remapped_0200: List[str] = []
    for ln in inv_0200:
        cod = get_0200_cod_item(ln)
        if cod in code_map:
            remapped_0200.append(set_record_field(ln, 2, code_map[cod]))
            continue
        remapped_0200.append(ln)

    remapped_h: List[str] = []
    for ln in inv_h:
        if get_reg(ln) != "H010":
            remapped_h.append(ln)
            continue
        cod = get_h010_cod_item(ln)
        if cod in code_map:
            remapped_h.append(set_record_field(ln, 2, code_map[cod]))
            continue
        remapped_h.append(ln)

    return remapped_0200, remapped_h, code_map


def write_prevalidated_inventory(
    inventory_path: Path,
    inv_0190: Sequence[str],
    inv_0200: Sequence[str],
    inv_h: Sequence[str],
) -> Path:
    out_path = inventory_path.parent / f"{inventory_path.stem}_PRE_VALIDADO_{datetime.now():%Y%m%d_%H%M%S}.txt"
    out_lines = list(inv_0190) + list(inv_0200) + list(inv_h)
    out_path.write_text("\n".join(out_lines) + "\n", encoding="latin-1", errors="replace")
    return out_path


def choose_cod_cta_h010(sped_lines: Sequence[str], default_cod_cta: str) -> Tuple[str, str]:
    default_cod_cta = default_cod_cta.strip() or DEFAULT_COD_CTA

    fallback_candidates: List[str] = []
    for ln in sped_lines:
        if get_reg(ln) != "0500":
            continue
        p = parse_record_parts(ln)
        # Estrutura 0500: REG, DT_ALT, COD_NAT_CC, IND_CTA, NIVEL, COD_CTA, NOME_CTA
        cod_nat_cc = p[2].strip() if len(p) > 2 else ""
        nivel = p[4].strip() if len(p) > 4 else ""
        cod_cta = p[5].strip() if len(p) > 5 else ""
        nome_cta = p[6].strip() if len(p) > 6 else ""
        if cod_nat_cc != "01" or nivel != "5" or not cod_cta:
            continue

        nome_norm = normalize_text(nome_cta)
        if "estoque de mercadorias" in nome_norm:
            return cod_cta, "0500_nat_01_nivel_5_estoque_de_mercadorias"
        if "estoque" in nome_norm and "mercador" in nome_norm:
            fallback_candidates.append(cod_cta)

    if fallback_candidates:
        return fallback_candidates[0], "0500_nat_01_nivel_5_estoque_mercador"
    return default_cod_cta, "padrao"


def apply_cod_cta_to_h010(inv_h: Sequence[str], cod_cta: str) -> Tuple[List[str], int]:
    out: List[str] = []
    updates = 0
    for ln in inv_h:
        if get_reg(ln) != "H010":
            out.append(ln)
            continue
        p = parse_record_parts(ln)
        current = p[9].strip() if len(p) > 9 else ""
        updated = set_record_field(ln, 10, cod_cta)
        out.append(updated)
        if current != cod_cta:
            updates += 1
    return out, updates


def find_index(lines: Sequence[str], reg: str) -> int:
    for i, ln in enumerate(lines):
        if get_reg(ln) == reg:
            return i
    return -1


def get_0190_unid(line: str) -> str:
    if get_reg(line) != "0190":
        return ""
    p = parse_record_parts(line)
    return p[1].strip().upper() if len(p) > 1 else ""


def merge_0190(lines: List[str], inv_0190: List[str]) -> Tuple[List[str], int, int]:
    if not inv_0190:
        return lines, 0, 0

    existing_units = {get_0190_unid(ln) for ln in lines if get_reg(ln) == "0190"}
    existing_units.discard("")

    unique_inv: List[Tuple[str, str]] = []
    seen_inv_units = set()
    for ln in inv_0190:
        unid = get_0190_unid(ln)
        if not unid or unid in seen_inv_units:
            continue
        seen_inv_units.add(unid)
        unique_inv.append((unid, ln))

    to_add: List[str] = []
    skipped = 0
    for unid, ln in unique_inv:
        if unid in existing_units:
            skipped += 1
            continue
        existing_units.add(unid)
        to_add.append(ln)

    if not to_add:
        return lines, 0, skipped

    idx_0000 = find_index(lines, "0000")
    idx_0990 = find_index(lines, "0990")
    if idx_0000 < 0 or idx_0990 < 0 or idx_0990 <= idx_0000:
        raise ValueError("Nao foi possivel localizar os limites do Bloco 0 (0000/0990).")

    head_regs = {"0001", "0005", "0015", "0100", "0150", "0175", "0190"}
    tail_regs = {"0200", "0205", "0210", "0220", "0221", "0300", "0305", "0400", "0450", "0460", "0500", "0600", "0990"}

    first_tail = idx_0990
    for i in range(idx_0000 + 1, idx_0990):
        if get_reg(lines[i]) in tail_regs:
            first_tail = i
            break

    last_head = idx_0000
    for i in range(idx_0000 + 1, first_tail):
        if get_reg(lines[i]) in head_regs:
            last_head = i

    insert_idx = min(last_head + 1, first_tail)
    merged = lines[:insert_idx] + to_add + lines[insert_idx:]
    return merged, len(to_add), skipped


def replace_0200(lines: List[str], inv_0200: List[str], used_cod_item_refs: Set[str]) -> List[str]:
    idx_0000 = find_index(lines, "0000")
    idx_0990 = find_index(lines, "0990")
    if idx_0000 < 0 or idx_0990 < 0 or idx_0990 <= idx_0000:
        raise ValueError("Nao foi possivel localizar os limites do Bloco 0 (0000/0990).")

    existing_codes = {get_0200_cod_item(ln) for ln in lines if get_reg(ln) == "0200"}
    existing_codes.discard("")

    to_add: List[str] = []
    seen_new_codes: Set[str] = set()
    inv_groups = group_0200_with_children(inv_0200)
    for group in inv_groups:
        cod = get_0200_cod_item(group[0])
        if not cod:
            continue
        if cod not in used_cod_item_refs:
            continue
        if cod in existing_codes:
            continue
        if cod in seen_new_codes:
            continue
        seen_new_codes.add(cod)
        to_add.extend(group)

    if not to_add:
        return lines

    head_regs = {
        "0001",
        "0005",
        "0015",
        "0100",
        "0150",
        "0175",
        "0190",
        "0200",
        "0205",
        "0210",
        "0220",
        "0221",
    }
    tail_regs = {"0300", "0305", "0400", "0450", "0460", "0500", "0600", "0990"}

    first_tail = idx_0990
    for i in range(idx_0000 + 1, idx_0990):
        if get_reg(lines[i]) in tail_regs:
            first_tail = i
            break

    last_head = idx_0000
    for i in range(idx_0000 + 1, first_tail):
        if get_reg(lines[i]) in head_regs:
            last_head = i

    insert_idx = min(last_head + 1, first_tail)
    return lines[:insert_idx] + to_add + lines[insert_idx:]


def replace_bloco_h(lines: List[str], inv_h: List[str]) -> List[str]:
    idx_h001 = find_index(lines, "H001")
    idx_h990 = find_index(lines, "H990")

    if idx_h001 >= 0 and idx_h990 >= 0 and idx_h001 < idx_h990:
        return lines[:idx_h001] + inv_h + lines[idx_h990 + 1 :]

    # fallback: remove quaisquer Hxxx soltos e injeta antes do proximo bloco.
    filtered = [ln for ln in lines if not get_reg(ln).startswith("H")]

    insert_idx = find_index(filtered, "K001")
    if insert_idx < 0:
        insert_idx = find_index(filtered, "1001")
    if insert_idx < 0:
        insert_idx = find_index(filtered, "9001")
    if insert_idx < 0:
        insert_idx = len(filtered)
    return filtered[:insert_idx] + inv_h + filtered[insert_idx:]


def update_0990(lines: List[str]) -> Tuple[List[str], int]:
    idx_0000 = find_index(lines, "0000")
    idx_0990 = find_index(lines, "0990")
    if idx_0000 < 0 or idx_0990 < 0 or idx_0990 < idx_0000:
        raise ValueError("Nao foi possivel localizar 0000/0990 para atualizar bloco 0.")
    qtd_lin_0 = idx_0990 - idx_0000 + 1
    lines[idx_0990] = set_record_field(lines[idx_0990], 2, str(qtd_lin_0))
    return lines, qtd_lin_0


def update_h_block(lines: List[str]) -> Tuple[List[str], int]:
    idx_h001 = find_index(lines, "H001")
    idx_h990 = find_index(lines, "H990")
    if idx_h001 < 0 or idx_h990 < 0 or idx_h990 < idx_h001:
        raise ValueError("Nao foi possivel localizar H001/H990 para atualizar bloco H.")

    h_regs = [get_reg(ln) for ln in lines[idx_h001 : idx_h990 + 1]]
    has_h_detail = any(r not in {"H001", "H990"} for r in h_regs)
    ind_mov = "0" if has_h_detail else "1"
    lines[idx_h001] = set_record_field(lines[idx_h001], 2, ind_mov)

    qtd_lin_h = idx_h990 - idx_h001 + 1
    lines[idx_h990] = set_record_field(lines[idx_h990], 2, str(qtd_lin_h))
    return lines, qtd_lin_h


def rebuild_bloco_9(lines: List[str]) -> Tuple[List[str], int, int]:
    idx_9001 = find_index(lines, "9001")
    prefix = lines[:idx_9001] if idx_9001 >= 0 else list(lines)

    # seguranca: remove eventuais registros do bloco 9 que tenham ficado no prefixo.
    prefix = [ln for ln in prefix if get_reg(ln) not in {"9001", "9900", "9990", "9999"}]

    base_counts = Counter(get_reg(ln) for ln in prefix if get_reg(ln))
    regs_for_9900 = sorted(set(base_counts.keys()) | {"9001", "9900", "9990", "9999"})
    qtd_9900 = len(regs_for_9900)

    def reg_count(reg: str) -> int:
        if reg == "9900":
            return qtd_9900
        if reg in {"9001", "9990", "9999"}:
            return 1
        return int(base_counts.get(reg, 0))

    bloco_9: List[str] = [build_record(["9001", "0"])]
    for reg in regs_for_9900:
        bloco_9.append(build_record(["9900", reg, str(reg_count(reg))]))

    # Na prática do PVA, o QTD_LIN_9 é validado considerando também o 9999.
    # Portanto: 9001 + N*9900 + 9990 + 9999.
    qtd_lin_9 = 3 + qtd_9900
    bloco_9.append(build_record(["9990", str(qtd_lin_9)]))

    full = prefix + bloco_9
    qtd_total = len(full) + 1  # + 9999
    full.append(build_record(["9999", str(qtd_total)]))
    return full, qtd_lin_9, qtd_total


def integrate(
    sped_lines: List[str],
    inv_0190: List[str],
    inv_0200: List[str],
    inv_h: List[str],
    source_cod_item_field_map: Dict[str, Tuple[int, ...]],
    cod_cta_h010: str,
    cod_cta_source: str,
    h010_cod_cta_updates: int,
) -> Tuple[List[str], IntegrationStats]:
    lines = list(sped_lines)
    lines, inv_0190_added, inv_0190_skipped = merge_0190(lines, inv_0190)

    inv_0200_codes = {get_0200_cod_item(ln) for ln in inv_0200 if get_reg(ln) == "0200"}
    inv_0200_codes.discard("")
    used_h010_codes = collect_h010_cod_items(inv_h)
    used_other_regs_codes = collect_cod_item_refs(
        sped_lines,
        source_cod_item_field_map,
        get_reg_fn=get_reg,
        parse_record_parts_fn=parse_record_parts,
        exclude_regs={"H010", "0200"},
    )
    used_cod_item_refs = used_h010_codes | used_other_regs_codes
    used_inv_0200_codes = inv_0200_codes & used_cod_item_refs
    used_inv_0200_h010 = inv_0200_codes & used_h010_codes
    used_inv_0200_other_regs = inv_0200_codes & used_other_regs_codes
    inv_0200_unused_skipped = len(inv_0200_codes - used_cod_item_refs)

    lines = replace_0200(lines, inv_0200, used_cod_item_refs)
    lines = replace_bloco_h(lines, inv_h)
    lines, qtd_lin_0 = update_0990(lines)
    lines, qtd_lin_h = update_h_block(lines)
    lines, qtd_lin_9, qtd_total = rebuild_bloco_9(lines)

    stats = IntegrationStats(
        source_lines=len(sped_lines),
        integrated_lines=len(lines),
        inv_0190_count=len(inv_0190),
        inv_0190_added=inv_0190_added,
        inv_0190_skipped=inv_0190_skipped,
        inv_0200_count=len(inv_0200_codes),
        inv_0200_used_count=len(used_inv_0200_codes),
        inv_0200_used_h010_count=len(used_inv_0200_h010),
        inv_0200_used_other_regs_count=len(used_inv_0200_other_regs),
        inv_0200_unused_skipped=inv_0200_unused_skipped,
        inv_h_count=len(inv_h),
        reg_0190_count=sum(1 for ln in lines if get_reg(ln) == "0190"),
        reg_0200_count=sum(1 for ln in lines if get_reg(ln) == "0200"),
        reg_h010_count=sum(1 for ln in lines if get_reg(ln) == "H010"),
        qtd_lin_0=qtd_lin_0,
        qtd_lin_h=qtd_lin_h,
        qtd_lin_9=qtd_lin_9,
        qtd_lin_total=qtd_total,
        cod_cta_h010=cod_cta_h010,
        cod_cta_source=cod_cta_source,
        h010_cod_cta_updates=h010_cod_cta_updates,
    )
    return lines, stats


def main() -> None:
    args = parse_args()

    sped_path = Path(args.sped_path) if args.sped_path else select_file_dialog(
        "Selecione o SPED original (TXT)",
        [("SPED TXT", "*.txt *.TXT"), ("Todos os arquivos", "*.*")],
    )
    inv_path = Path(args.inventario_path) if args.inventario_path else select_file_dialog(
        "Selecione o inventario gerado (TXT)",
        [("Inventario TXT", "*.txt *.TXT"), ("Todos os arquivos", "*.*")],
    )

    if not sped_path.exists():
        print(f"ERRO: SPED nao encontrado: {sped_path}")
        sys.exit(2)
    if not inv_path.exists():
        print(f"ERRO: inventario nao encontrado: {inv_path}")
        sys.exit(2)

    sped_lines = read_sped_lines(sped_path)
    inv_0190, inv_0200, inv_h = read_inventory_lines(inv_path)
    inv_0200, inv_h, cod_item_conflicts = prevalidate_cod_item_conflicts(sped_lines, inv_0200, inv_h)
    prevalidated_inventory_path: Optional[Path] = None
    if cod_item_conflicts:
        prevalidated_inventory_path = write_prevalidated_inventory(inv_path, inv_0190, inv_0200, inv_h)

    cod_cta_h010, cod_cta_source = choose_cod_cta_h010(sped_lines, args.default_cod_cta)
    inv_h, h010_cod_cta_updates = apply_cod_cta_to_h010(inv_h, cod_cta_h010)

    integrated, stats = integrate(
        sped_lines,
        inv_0190,
        inv_0200,
        inv_h,
        source_cod_item_field_map=load_icms_cod_item_field_map(),
        cod_cta_h010=cod_cta_h010,
        cod_cta_source=cod_cta_source,
        h010_cod_cta_updates=h010_cod_cta_updates,
    )

    output_path = (
        Path(args.output)
        if args.output
        else sped_path.parent / f"{sped_path.stem}_COM_INVENTARIO_{datetime.now():%Y%m%d_%H%M%S}.txt"
    )
    output_path.write_text("\n".join(integrated) + "\n", encoding="latin-1", errors="replace")

    print("\nIntegracao concluida.")
    print(f"- SPED origem: {sped_path}")
    print(f"- Inventario: {inv_path}")
    if prevalidated_inventory_path is not None:
        print(f"- Inventario pre-validado: {prevalidated_inventory_path}")
    print(f"- Saida: {output_path}")
    if cod_item_conflicts:
        print("\nPre-validacao (COD_ITEM 0200/H010):")
        print(f"- Colisoes tratadas: {len(cod_item_conflicts)}")
        for old_cod, new_cod in sorted(cod_item_conflicts.items())[:20]:
            print(f"  {old_cod} -> {new_cod}")
    print("\nResumo:")
    print(f"- Linhas no SPED de origem: {stats.source_lines}")
    print(f"- Linhas no SPED integrado: {stats.integrated_lines}")
    print(f"- 0190 no inventario: {stats.inv_0190_count} | adicionados: {stats.inv_0190_added} | ignorados (ja existiam): {stats.inv_0190_skipped}")
    print(f"- 0190 no SPED final: {stats.reg_0190_count}")
    print(
        f"- 0200 no inventario: {stats.inv_0200_count} "
        f"| usados totais (H010 + outros): {stats.inv_0200_used_count} "
        f"| ignorados (sem referencia): {stats.inv_0200_unused_skipped}"
    )
    print(
        f"- Detalhe uso de 0200: por H010={stats.inv_0200_used_h010_count} "
        f"| por outros registros (mapa COD_ITEM*): {stats.inv_0200_used_other_regs_count}"
    )
    print(f"- 0200 no SPED final: {stats.reg_0200_count}")
    print(f"- Linhas bloco H importadas: {stats.inv_h_count} (H010 no final: {stats.reg_h010_count})")
    print(f"- COD_CTA aplicado nos H010: {stats.cod_cta_h010} ({stats.cod_cta_source})")
    print(f"- H010 atualizados com COD_CTA: {stats.h010_cod_cta_updates}")
    print("\nTotalizadores atualizados:")
    print(f"- 0990 (QTD_LIN_0): {stats.qtd_lin_0}")
    print(f"- H990 (QTD_LIN_H): {stats.qtd_lin_h}")
    print(f"- 9990 (QTD_LIN_9): {stats.qtd_lin_9}")
    print(f"- 9999 (QTD_LIN): {stats.qtd_lin_total}")
    if args.skip_relationship_validation:
        print("\nAviso: a flag --skip-relationship-validation e apenas compatibilidade e nao altera a execucao.")


if __name__ == "__main__":
    main()
