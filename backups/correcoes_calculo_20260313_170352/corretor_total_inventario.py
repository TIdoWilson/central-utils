#!/usr/bin/env python3
"""
Corretor de total de inventario (Bloco H) para SPED EFD ICMS/IPI.

Regras:
- Ajusta apenas QTD do H010 para fechar o valor esperado.
- Recalcula VL_ITEM = VL_UNIT * QTD (arredondado em 2 casas).
- Tenta primeiro QTD inteira; se nao fechar, tenta QTD com 1 casa decimal.
- Em ultimo caso, pode excluir ate N itens (padrao 10) de 0200/H010,
  somente quando o COD_ITEM nao aparece em outros registros que referenciam o cadastro 0200.
- Atualiza H005, H001/H990, 0990 e bloco 9 (9001/9900/9990/9999).
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple
from cod_item_refs import collect_cod_item_refs, load_icms_cod_item_field_map
from sped_relationship_validator import validate_sped_relationships_lines


RE_REG = re.compile(r"^[0-9A-Z]{4}$")
DEC_0 = Decimal("1")
DEC_1 = Decimal("0.1")
DEC_2 = Decimal("0.01")
DEC_3 = Decimal("0.001")
ICMS_LAYOUTS_DIR = Path(__file__).resolve().parents[2] / "layouts" / "speds" / "icms"
REL_VALIDATOR_RULES = ICMS_LAYOUTS_DIR / "relationships" / "reference_domains.validator.json"


@dataclass
class H010Entry:
    line_idx: int
    cod_item: str
    parts: List[str]
    qtd: Decimal
    vl_unit: Decimal
    active: bool
    removable: bool


def compute_new_issue_signatures(
    baseline_counts: Dict[str, int],
    final_counts: Dict[str, int],
) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for sig, qty in final_counts.items():
        delta = int(qty) - int(baseline_counts.get(sig, 0))
        if delta > 0:
            out[sig] = delta
    return out


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Corrige o total do inventario no SPED ajustando quantidades do H010."
    )
    parser.add_argument("sped_path", nargs="?", help="Arquivo SPED com bloco H")
    parser.add_argument(
        "--valor-esperado",
        help="Valor esperado do inventario (ex.: 960758,73). Se omitido, pergunta no terminal.",
    )
    parser.add_argument(
        "--max-exclusoes",
        type=int,
        default=10,
        help="Maximo de itens que podem ser excluidos de 0200/H010 (padrao: 10)",
    )
    parser.add_argument(
        "--skip-relationship-validation",
        action="store_true",
        help="Nao executa a validacao global de relacionamentos antes de salvar o SPED final.",
    )
    parser.add_argument(
        "--relationship-max-issues",
        type=int,
        default=200,
        help="Maximo de inconsistencias detalhadas na validacao de relacionamentos (padrao: 200).",
    )
    parser.add_argument("--output", help="Arquivo de saida")
    return parser.parse_args()


def select_sped_file() -> Path:
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askopenfilename(
            title="Selecione o SPED (TXT)",
            filetypes=[("SPED TXT", "*.txt *.TXT"), ("Todos os arquivos", "*.*")],
        )
        if not selected:
            raise SystemExit("Selecao cancelada.")
        return Path(selected)
    except Exception:
        p = input("Caminho do SPED (TXT): ").strip().strip('"').strip("'")
        if not p:
            raise SystemExit("Caminho invalido.")
        return Path(p)


def get_reg(line: str) -> str:
    line = line.strip()
    if not line.startswith("|"):
        return ""
    parts = line.split("|")
    if len(parts) < 3:
        return ""
    reg = parts[1].strip().upper()
    return reg if RE_REG.fullmatch(reg) else ""


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


def parse_decimal_ptbr(x: str) -> Optional[Decimal]:
    s = str(x).strip()
    if not s:
        return None
    s = s.replace("R$", "").replace("\xa0", "").replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def format_decimal_ptbr(value: Decimal, decimals: int) -> str:
    q = value.quantize(Decimal("1." + ("0" * decimals)), rounding=ROUND_HALF_UP)
    if q == Decimal("-0." + ("0" * decimals)):
        q = Decimal("0." + ("0" * decimals))
    return f"{q:.{decimals}f}".replace(".", ",")


def round2(x: Decimal) -> Decimal:
    return x.quantize(DEC_2, rounding=ROUND_HALF_UP)


def round3(x: Decimal) -> Decimal:
    return x.quantize(DEC_3, rounding=ROUND_HALF_UP)


def read_sped_lines(path: Path) -> List[str]:
    raw = path.read_text(encoding="latin-1", errors="replace")
    raw_lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]

    lines: List[str] = []
    found_0000 = False
    for ln in raw_lines:
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
        raise ValueError("Nao encontrei linhas validas de SPED no arquivo.")
    if get_reg(lines[0]) != "0000" or get_reg(lines[-1]) != "9999":
        raise ValueError("Arquivo SPED invalido (faltando 0000/9999).")
    return lines


def find_index(lines: Sequence[str], reg: str) -> int:
    for i, ln in enumerate(lines):
        if get_reg(ln) == reg:
            return i
    return -1


def parse_h010_entries(lines: Sequence[str], locked_codes: Set[str]) -> List[H010Entry]:
    entries: List[H010Entry] = []
    for i, ln in enumerate(lines):
        if get_reg(ln) != "H010":
            continue
        p = parse_record_parts(ln)
        if len(p) < 6:
            continue
        cod_item = p[1].strip()
        qtd = parse_decimal_ptbr(p[3]) or Decimal("0")
        vl_unit = parse_decimal_ptbr(p[4]) or Decimal("0")
        entries.append(
            H010Entry(
                line_idx=i,
                cod_item=cod_item,
                parts=p,
                qtd=qtd,
                vl_unit=vl_unit,
                active=True,
                removable=(cod_item not in locked_codes),
            )
        )
    return entries


def parse_h005_target(lines: Sequence[str], explicit_target: Optional[str]) -> Decimal:
    if explicit_target:
        v = parse_decimal_ptbr(explicit_target)
        if v is None:
            raise ValueError("Valor invalido em --valor-esperado.")
        return round2(v)

    idx_h005 = find_index(lines, "H005")
    if idx_h005 < 0:
        raise ValueError("Registro H005 nao encontrado.")
    p = parse_record_parts(lines[idx_h005])
    if len(p) < 3:
        raise ValueError("Registro H005 invalido.")
    v = parse_decimal_ptbr(p[2])
    if v is None:
        raise ValueError("Nao consegui ler VL_INV do H005.")
    current = round2(v)
    default_txt = format_decimal_ptbr(current, 2)

    while True:
        ans = input(f"Valor final desejado do inventario [{default_txt}]: ").strip()
        if not ans:
            return current
        parsed = parse_decimal_ptbr(ans)
        if parsed is not None:
            return round2(parsed)
        print("Valor invalido. Informe no formato 960758,73.")


def item_value(qtd: Decimal, vl_unit: Decimal) -> Decimal:
    return round2(qtd * vl_unit)


def total_active(entries: Sequence[H010Entry], qty_map: Dict[int, Decimal]) -> Decimal:
    acc = Decimal("0")
    for e in entries:
        if not e.active:
            continue
        q = qty_map[e.line_idx]
        acc += item_value(q, e.vl_unit)
    return round2(acc)


def try_single_item_adjust(
    entries: Sequence[H010Entry],
    qty_map: Dict[int, Decimal],
    target_total: Decimal,
    decimals: int,
) -> Optional[Tuple[int, Decimal]]:
    step = DEC_0 if decimals == 0 else DEC_1
    span = 8 if decimals == 0 else 30
    current_total = total_active(entries, qty_map)

    best: Optional[Tuple[Decimal, int, Decimal]] = None

    for e in entries:
        if not e.active or e.vl_unit == 0:
            continue

        q_old = qty_map[e.line_idx]
        old_item_val = item_value(q_old, e.vl_unit)
        base_total = current_total - old_item_val
        needed_item_val = target_total - base_total

        est_q = needed_item_val / e.vl_unit
        try:
            q_center = est_q.quantize(step, rounding=ROUND_HALF_UP)
        except InvalidOperation:
            continue

        candidates: Set[Decimal] = set()
        candidates.add(q_old.quantize(step, rounding=ROUND_HALF_UP))
        for k in range(-span, span + 1):
            candidates.add(q_center + (step * Decimal(k)))

        for q_new in candidates:
            if q_new < 0:
                continue
            if decimals == 0:
                q_new = q_new.quantize(DEC_0, rounding=ROUND_HALF_UP)
            else:
                q_new = q_new.quantize(DEC_1, rounding=ROUND_HALF_UP)

            new_item_val = item_value(q_new, e.vl_unit)
            new_total = round2(base_total + new_item_val)
            if new_total != target_total:
                continue

            score = abs(q_new - q_old)
            cand = (score, e.line_idx, q_new)
            if best is None or cand < best:
                best = cand

    if best is None:
        return None
    return best[1], best[2]


def _q_candidates(center: Decimal, step: Decimal, span: int) -> List[Decimal]:
    vals: Set[Decimal] = set()
    for k in range(-span, span + 1):
        vals.add((center + (step * Decimal(k))).quantize(step, rounding=ROUND_HALF_UP))
    out = sorted(v for v in vals if v >= 0)
    return out


def _q_quantize(x: Decimal, step: Decimal) -> Decimal:
    return x.quantize(step, rounding=ROUND_HALF_UP)


def try_two_item_adjust(
    entries: Sequence[H010Entry],
    qty_map: Dict[int, Decimal],
    target_total: Decimal,
    decimals: int,
) -> Optional[Tuple[Tuple[int, Decimal], Tuple[int, Decimal]]]:
    step = DEC_0 if decimals == 0 else DEC_1
    span_i = 120 if decimals == 0 else 250
    span_j = 8 if decimals == 0 else 20

    active = [e for e in entries if e.active and e.vl_unit > 0]
    if len(active) < 2:
        return None

    current_total = total_active(entries, qty_map)

    # Itens de ajuste fino: menor valor unitario tende a permitir fechar os centavos.
    tune_candidates = sorted(active, key=lambda e: (e.vl_unit, e.line_idx))[:12]
    tune_ids = {e.line_idx for e in tune_candidates}

    # Itens "grossos": maior valor total atual tende a absorver diferencas maiores.
    coarse_candidates = sorted(
        active,
        key=lambda e: item_value(qty_map[e.line_idx], e.vl_unit),
        reverse=True,
    )[:300]

    # Garante que os itens de ajuste fino tambem participem como "grossos" se necessario.
    coarse_map = {e.line_idx: e for e in coarse_candidates}
    for e in tune_candidates:
        coarse_map[e.line_idx] = e
    coarse_candidates = list(coarse_map.values())

    best: Optional[Tuple[Decimal, int, Decimal, int, Decimal]] = None

    for ei in coarse_candidates:
        qi_old = qty_map[ei.line_idx]
        vi_old = item_value(qi_old, ei.vl_unit)

        # Estimativa central como no ajuste de 1 item.
        need_vi = target_total - (current_total - vi_old)
        qi_center = (need_vi / ei.vl_unit).quantize(step, rounding=ROUND_HALF_UP)

        qi_candidates = _q_candidates(qi_center, step, span_i)
        qi_candidates.extend([Decimal("0"), qi_old.quantize(step, rounding=ROUND_HALF_UP)])
        qi_candidates = sorted({q for q in qi_candidates if q >= 0})

        for qi_new in qi_candidates:
            vi_new = item_value(qi_new, ei.vl_unit)
            total_after_i = round2(current_total - vi_old + vi_new)

            for ej in tune_candidates:
                if ej.line_idx == ei.line_idx:
                    continue
                qj_old = qty_map[ej.line_idx]
                vj_old = item_value(qj_old, ej.vl_unit)

                need_vj = target_total - (total_after_i - vj_old)
                qj_center = (need_vj / ej.vl_unit).quantize(step, rounding=ROUND_HALF_UP)
                qj_candidates = _q_candidates(qj_center, step, span_j)
                qj_candidates.extend([Decimal("0"), qj_old.quantize(step, rounding=ROUND_HALF_UP)])
                qj_candidates = sorted({q for q in qj_candidates if q >= 0})

                for qj_new in qj_candidates:
                    vj_new = item_value(qj_new, ej.vl_unit)
                    new_total = round2(total_after_i - vj_old + vj_new)
                    if new_total != target_total:
                        continue

                    score = abs(qi_new - qi_old) + abs(qj_new - qj_old)
                    cand = (score, ei.line_idx, qi_new, ej.line_idx, qj_new)
                    if best is None or cand < best:
                        best = cand

    if best is None:
        return None
    return (best[1], best[2]), (best[3], best[4])


def try_multi_item_greedy_adjust(
    entries: Sequence[H010Entry],
    qty_map: Dict[int, Decimal],
    target_total: Decimal,
    decimals: int,
) -> bool:
    step = DEC_0 if decimals == 0 else DEC_1
    active = [e for e in entries if e.active and e.vl_unit > 0]
    if not active:
        return False

    current_total = total_active(entries, qty_map)
    delta = round2(target_total - current_total)
    if delta == 0:
        return True

    # Ajuste grosso: reduz ou aumenta em varios itens para aproximar do alvo.
    if delta < 0:
        # Precisa reduzir total: trabalha do maior valor de item para o menor.
        by_value = sorted(
            active,
            key=lambda e: item_value(qty_map[e.line_idx], e.vl_unit),
            reverse=True,
        )
        for e in by_value:
            if delta >= 0:
                break
            q_old = qty_map[e.line_idx]
            if q_old <= 0:
                continue
            old_val = item_value(q_old, e.vl_unit)
            if old_val <= 0:
                continue

            desired_reduction = min(-delta, old_val)
            desired_new_val = max(Decimal("0"), old_val - desired_reduction)
            q_new = _q_quantize(desired_new_val / e.vl_unit, step)
            q_old_q = _q_quantize(q_old, step)
            if q_new > q_old_q:
                q_new = q_old_q
            if q_new == q_old_q:
                q_new = q_old_q - step
            if q_new < 0:
                q_new = Decimal("0")
            q_new = _q_quantize(q_new, step)

            if q_new == q_old_q:
                continue

            new_val = item_value(q_new, e.vl_unit)
            qty_map[e.line_idx] = q_new
            current_total = round2(current_total - old_val + new_val)
            delta = round2(target_total - current_total)

    if delta > 0:
        # Precisa aumentar total: usa item com menor VL_UNIT para ajuste fino.
        tune = min(active, key=lambda e: (e.vl_unit, e.line_idx))
        q_old = qty_map[tune.line_idx]
        old_val = item_value(q_old, tune.vl_unit)
        desired_new_val = old_val + delta
        q_new = _q_quantize(desired_new_val / tune.vl_unit, step)
        if q_new < _q_quantize(q_old, step):
            q_new = _q_quantize(q_old, step)
        new_val = item_value(q_new, tune.vl_unit)
        qty_map[tune.line_idx] = q_new
        current_total = round2(current_total - old_val + new_val)
        delta = round2(target_total - current_total)

    if delta == 0:
        return True

    # Ajuste fino exato no mesmo regime de casas.
    res1 = try_single_item_adjust(entries, qty_map, target_total, decimals=decimals)
    if res1 is not None:
        idx, q = res1
        qty_map[idx] = q
        return total_active(entries, qty_map) == target_total

    res2 = try_two_item_adjust(entries, qty_map, target_total, decimals=decimals)
    if res2 is not None:
        (i1, q1), (i2, q2) = res2
        qty_map[i1] = q1
        qty_map[i2] = q2
        return total_active(entries, qty_map) == target_total

    return False


def choose_removal_code(
    entries: Sequence[H010Entry],
    qty_map: Dict[int, Decimal],
    target_total: Decimal,
    removed_codes: Set[str],
) -> Optional[str]:
    current_total = total_active(entries, qty_map)
    delta = target_total - current_total

    code_totals: Dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for e in entries:
        if not e.active or not e.removable or e.cod_item in removed_codes:
            continue
        code_totals[e.cod_item] += item_value(qty_map[e.line_idx], e.vl_unit)

    if not code_totals:
        return None

    best_code = None
    best_abs_after = None
    for cod, v in code_totals.items():
        after_delta = delta + v  # remove item => total diminui => delta aumenta
        metric = abs(after_delta)
        if best_abs_after is None or metric < best_abs_after:
            best_abs_after = metric
            best_code = cod
    return best_code


def update_h010_parts(parts: List[str], qtd: Decimal, vl_item: Decimal) -> List[str]:
    out = list(parts)
    while len(out) < 11:
        out.append("")
    out[3] = format_decimal_ptbr(round3(qtd), 3)
    out[5] = format_decimal_ptbr(vl_item, 2)
    if len(out) > 10 and out[10].strip():
        out[10] = format_decimal_ptbr(vl_item, 2)
    return out


def collect_0200_and_children_to_remove(lines: Sequence[str], removed_codes: Set[str]) -> Set[int]:
    if not removed_codes:
        return set()

    child_regs = {"0205", "0210", "0220", "0221"}
    idxs: Set[int] = set()
    i = 0
    n = len(lines)
    while i < n:
        if get_reg(lines[i]) != "0200":
            i += 1
            continue

        p = parse_record_parts(lines[i])
        cod = p[1].strip() if len(p) > 1 else ""
        if cod not in removed_codes:
            i += 1
            continue

        idxs.add(i)
        j = i + 1
        while j < n:
            reg_j = get_reg(lines[j])
            if reg_j in child_regs:
                idxs.add(j)
                j += 1
                continue
            break
        i = j
    return idxs


def update_h_block(lines: List[str]) -> Tuple[List[str], int]:
    idx_h001 = find_index(lines, "H001")
    idx_h990 = find_index(lines, "H990")
    if idx_h001 < 0 or idx_h990 < 0 or idx_h990 < idx_h001:
        raise ValueError("Nao foi possivel localizar H001/H990.")

    has_h010 = any(get_reg(ln) == "H010" for ln in lines[idx_h001 : idx_h990 + 1])
    lines[idx_h001] = set_record_field(lines[idx_h001], 2, "0" if has_h010 else "1")

    qtd_lin_h = idx_h990 - idx_h001 + 1
    lines[idx_h990] = set_record_field(lines[idx_h990], 2, str(qtd_lin_h))
    return lines, qtd_lin_h


def update_0990(lines: List[str]) -> Tuple[List[str], int]:
    idx_0000 = find_index(lines, "0000")
    idx_0990 = find_index(lines, "0990")
    if idx_0000 < 0 or idx_0990 < 0 or idx_0990 < idx_0000:
        raise ValueError("Nao foi possivel localizar 0000/0990.")
    qtd_lin_0 = idx_0990 - idx_0000 + 1
    lines[idx_0990] = set_record_field(lines[idx_0990], 2, str(qtd_lin_0))
    return lines, qtd_lin_0


def rebuild_bloco_9(lines: List[str]) -> Tuple[List[str], int, int]:
    idx_9001 = find_index(lines, "9001")
    prefix = lines[:idx_9001] if idx_9001 >= 0 else list(lines)
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

    # Compatibilidade pratica com validacao PVA.
    qtd_lin_9 = 3 + qtd_9900  # 9001 + N*9900 + 9990 + 9999
    bloco_9.append(build_record(["9990", str(qtd_lin_9)]))

    full = prefix + bloco_9
    qtd_total = len(full) + 1
    full.append(build_record(["9999", str(qtd_total)]))
    return full, qtd_lin_9, qtd_total


def main() -> None:
    args = parse_args()

    sped_path = Path(args.sped_path) if args.sped_path else select_sped_file()
    if not sped_path.exists():
        print(f"ERRO: arquivo nao encontrado: {sped_path}")
        sys.exit(2)

    if args.max_exclusoes < 0:
        print("ERRO: --max-exclusoes deve ser >= 0.")
        sys.exit(2)

    lines = read_sped_lines(sped_path)
    cod_item_field_map = load_icms_cod_item_field_map()
    locked_codes = collect_cod_item_refs(
        lines,
        cod_item_field_map,
        get_reg_fn=get_reg,
        parse_record_parts_fn=parse_record_parts,
        # H010 e 0200 sao tratados pela propria rotina de ajuste/exclusao.
        exclude_regs={"H010", "0200"},
    )
    entries = parse_h010_entries(lines, locked_codes)
    if not entries:
        print("ERRO: nenhum registro H010 encontrado.")
        sys.exit(3)

    target_total = parse_h005_target(lines, args.valor_esperado)
    qty_map: Dict[int, Decimal] = {e.line_idx: e.qtd for e in entries}
    initial_total = total_active(entries, qty_map)

    removed_codes: Set[str] = set()
    zero_qty_removed_codes: Set[str] = set()
    chosen_line_idx: Optional[int] = None
    chosen_qty: Optional[Decimal] = None
    chosen_line_idx_2: Optional[int] = None
    chosen_qty_2: Optional[Decimal] = None
    chosen_mode = "nenhum"
    base_qty_map = dict(qty_map)

    solved = False
    # 1) tenta fechar com inteiros (sem excluir itens)
    res_int = try_single_item_adjust(entries, qty_map, target_total, decimals=0)
    if res_int is not None:
        chosen_line_idx, chosen_qty = res_int
        qty_map[chosen_line_idx] = chosen_qty
        chosen_mode = "inteiro"
        solved = True
    if not solved:
        res_int2 = try_two_item_adjust(entries, qty_map, target_total, decimals=0)
        if res_int2 is not None:
            (chosen_line_idx, chosen_qty), (chosen_line_idx_2, chosen_qty_2) = res_int2
            qty_map[chosen_line_idx] = chosen_qty
            qty_map[chosen_line_idx_2] = chosen_qty_2
            chosen_mode = "inteiro_2_itens"
            solved = True
    if not solved:
        qty_try = dict(base_qty_map)
        if try_multi_item_greedy_adjust(entries, qty_try, target_total, decimals=0):
            qty_map = qty_try
            chosen_mode = "inteiro_multi"
            solved = True

    # 2) se nao fechou, tenta excluir itens (maximo configurado),
    # sempre tentando fechar novamente com inteiros apos cada exclusao.
    while not solved and len(removed_codes) < args.max_exclusoes:
        cod_remove = choose_removal_code(entries, qty_map, target_total, removed_codes)
        if not cod_remove:
            break
        removed_codes.add(cod_remove)
        for e in entries:
            if e.cod_item == cod_remove:
                e.active = False

        res_int = try_single_item_adjust(entries, qty_map, target_total, decimals=0)
        if res_int is not None:
            chosen_line_idx, chosen_qty = res_int
            qty_map[chosen_line_idx] = chosen_qty
            chosen_mode = "inteiro_pos_exclusao"
            solved = True
            break
        res_int2 = try_two_item_adjust(entries, qty_map, target_total, decimals=0)
        if res_int2 is not None:
            (chosen_line_idx, chosen_qty), (chosen_line_idx_2, chosen_qty_2) = res_int2
            qty_map[chosen_line_idx] = chosen_qty
            qty_map[chosen_line_idx_2] = chosen_qty_2
            chosen_mode = "inteiro_2_itens_pos_exclusao"
            solved = True
            break
        qty_try = dict(qty_map)
        if try_multi_item_greedy_adjust(entries, qty_try, target_total, decimals=0):
            qty_map = qty_try
            chosen_mode = "inteiro_multi_pos_exclusao"
            solved = True
            break

    # 3) por ultimo, tenta fechar com 1 casa decimal
    if not solved:
        res_dec = try_single_item_adjust(entries, qty_map, target_total, decimals=1)
        if res_dec is not None:
            chosen_line_idx, chosen_qty = res_dec
            qty_map[chosen_line_idx] = chosen_qty
            chosen_mode = "1_decimal"
            solved = True
    if not solved:
        res_dec2 = try_two_item_adjust(entries, qty_map, target_total, decimals=1)
        if res_dec2 is not None:
            (chosen_line_idx, chosen_qty), (chosen_line_idx_2, chosen_qty_2) = res_dec2
            qty_map[chosen_line_idx] = chosen_qty
            qty_map[chosen_line_idx_2] = chosen_qty_2
            chosen_mode = "1_decimal_2_itens"
            solved = True
    if not solved:
        if try_multi_item_greedy_adjust(entries, qty_map, target_total, decimals=1):
            chosen_mode = "1_decimal_multi"
            solved = True

    final_total = total_active(entries, qty_map)
    if final_total != target_total:
        print("ERRO: nao foi possivel fechar o valor esperado com as regras configuradas.")
        print(f"- Valor esperado: {format_decimal_ptbr(target_total, 2)}")
        print(f"- Valor alcançado: {format_decimal_ptbr(final_total, 2)}")
        print(f"- Itens removidos: {len(removed_codes)}")
        sys.exit(4)

    # Se a QTD final ficou zerada, remove H010/0200 do item quando o COD_ITEM
    # nao aparece em outros registros de referencia (item removivel).
    active_by_code: Dict[str, List[H010Entry]] = defaultdict(list)
    for e in entries:
        if e.active:
            active_by_code[e.cod_item].append(e)
    for cod, cod_entries in active_by_code.items():
        if not all(e.removable for e in cod_entries):
            continue
        if all(qty_map[e.line_idx] == Decimal("0") for e in cod_entries):
            zero_qty_removed_codes.add(cod)
    if zero_qty_removed_codes:
        removed_codes.update(zero_qty_removed_codes)
        for e in entries:
            if e.cod_item in zero_qty_removed_codes:
                e.active = False

    final_total = total_active(entries, qty_map)

    # aplica alteracoes de H010 / exclusoes
    entry_by_idx = {e.line_idx: e for e in entries}
    line_idxs_remove: Set[int] = set()
    for e in entries:
        if not e.active:
            line_idxs_remove.add(e.line_idx)

    # remove 0200 dos itens excluidos junto com registros filhos (ex.: 0221)
    if removed_codes:
        line_idxs_remove.update(collect_0200_and_children_to_remove(lines, removed_codes))

    new_lines: List[str] = []
    for i, ln in enumerate(lines):
        if i in line_idxs_remove:
            continue

        reg = get_reg(ln)
        if reg == "H010":
            e = entry_by_idx.get(i)
            if not e or not e.active:
                continue
            q = qty_map[e.line_idx]
            v_item = item_value(q, e.vl_unit)
            new_parts = update_h010_parts(e.parts, q, v_item)
            new_lines.append(build_record(new_parts))
            continue

        if reg == "H005":
            new_lines.append(set_record_field(ln, 3, format_decimal_ptbr(final_total, 2)))
            continue

        new_lines.append(ln)

    new_lines, qtd_lin_h = update_h_block(new_lines)
    new_lines, qtd_lin_0 = update_0990(new_lines)
    new_lines, qtd_lin_9, qtd_total = rebuild_bloco_9(new_lines)

    baseline_relationship_validation = None
    relationship_validation = None
    new_relationship_issues: Dict[str, int] = {}
    if not args.skip_relationship_validation:
        baseline_relationship_validation = validate_sped_relationships_lines(
            lines=lines,
            layouts_dir=ICMS_LAYOUTS_DIR,
            rules_path=REL_VALIDATOR_RULES,
            max_issues=max(1, int(args.relationship_max_issues)),
        )
        relationship_validation = validate_sped_relationships_lines(
            lines=new_lines,
            layouts_dir=ICMS_LAYOUTS_DIR,
            rules_path=REL_VALIDATOR_RULES,
            max_issues=max(1, int(args.relationship_max_issues)),
        )
        new_relationship_issues = compute_new_issue_signatures(
            baseline_counts={k: int(v) for k, v in baseline_relationship_validation.get("issue_signature_counts", {}).items()},
            final_counts={k: int(v) for k, v in relationship_validation.get("issue_signature_counts", {}).items()},
        )
        if new_relationship_issues:
            print("\nERRO: validacao global de relacionamentos detectou novas inconsistencias no arquivo final.")
            print(f"- Novas inconsistencias: {sum(new_relationship_issues.values())}")
            shown = 0
            for sig, qty in sorted(new_relationship_issues.items(), key=lambda item: item[0]):
                domain, reg, field, value = (sig.split("|", 3) + ["", "", "", ""])[:4]
                print(f"  +{qty} | {reg}.{field} => '{value}' (dominio {domain}) sem definicao")
                shown += 1
                if shown >= 20:
                    break
            sys.exit(5)

    output_path = (
        Path(args.output)
        if args.output
        else sped_path.parent / f"{sped_path.stem}_CORRIGIDO_INVENTARIO_{datetime.now():%Y%m%d_%H%M%S}.txt"
    )
    output_path.write_text("\n".join(new_lines) + "\n", encoding="latin-1", errors="replace")

    chosen_cod = ""
    chosen_cod_2 = ""
    if chosen_line_idx is not None:
        e = entry_by_idx.get(chosen_line_idx)
        if e:
            chosen_cod = e.cod_item
    if chosen_line_idx_2 is not None:
        e2 = entry_by_idx.get(chosen_line_idx_2)
        if e2:
            chosen_cod_2 = e2.cod_item

    print("\nCorrecao concluida.")
    print(f"- Arquivo entrada: {sped_path}")
    print(f"- Arquivo saida: {output_path}")
    print("\nInventario:")
    print(f"- Valor esperado: {format_decimal_ptbr(target_total, 2)}")
    print(f"- Valor inicial (recalculado): {format_decimal_ptbr(initial_total, 2)}")
    print(f"- Valor final: {format_decimal_ptbr(final_total, 2)}")
    print(f"- COD_ITEM bloqueados por referencia externa: {len(locked_codes)}")
    print(f"- Modo de ajuste: {chosen_mode}")
    if chosen_cod:
        print(f"- Item ajustado: {chosen_cod}")
    if chosen_cod_2:
        print(f"- Segundo item ajustado: {chosen_cod_2}")
    print(f"- Itens removidos: {len(removed_codes)}")
    if zero_qty_removed_codes:
        print(f"- Itens removidos por QTD zerada: {len(zero_qty_removed_codes)}")
    if removed_codes:
        sample = ", ".join(sorted(removed_codes)[:10])
        print(f"  Codigos removidos: {sample}")
    print("\nTotalizadores atualizados:")
    print(f"- 0990 (QTD_LIN_0): {qtd_lin_0}")
    print(f"- H990 (QTD_LIN_H): {qtd_lin_h}")
    print(f"- 9990 (QTD_LIN_9): {qtd_lin_9}")
    print(f"- 9999 (QTD_LIN): {qtd_total}")
    if relationship_validation is not None:
        print("\nValidacao de relacionamentos:")
        print(f"- Checagens executadas: {relationship_validation.get('total_checks', 0)}")
        print(f"- Referencias invalidas (origem): {baseline_relationship_validation.get('invalid_refs', 0)}")
        print(f"- Referencias invalidas (final): {relationship_validation.get('invalid_refs', 0)}")
        print(f"- Novas inconsistencias introduzidas: {sum(new_relationship_issues.values())}")


if __name__ == "__main__":
    main()
