#!/usr/bin/env python3
"""
Copia o Bloco K de um SPED origem para um SPED destino.

Regras principais:
- Copia K001..K990 completo da origem.
- Substitui o Bloco K existente no destino.
- Ajusta totalizadores: K001, K990, 0990 e Bloco 9 (9001/9900/9990/9999).
- Verifica COD_ITEM usados no Bloco K e confere se existem no 0200 do destino.
- Quando configurado, inclui no destino os 0200 faltantes vindos da origem
  preservando a hierarquia pai/filho (0200 + 0205/0210/0220/0221).
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set, Tuple
from collections import Counter


REGS_0200_CHILDREN = {"0205", "0210", "0220", "0221"}
REGS_0200_BLOCK = {"0200"} | REGS_0200_CHILDREN


@dataclass(frozen=True)
class CopyStats:
    source_k_lines: int
    source_k_products: int
    missing_products: int
    inserted_0200: int
    qtd_lin_0: int
    qtd_lin_9: int
    qtd_lin_total: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copia o Bloco K da origem para o destino, com validacao de produtos e totalizadores."
    )
    parser.add_argument("sped_destino", nargs="?", help="Arquivo SPED destino (.txt)")
    parser.add_argument("sped_origem_k", nargs="?", help="Arquivo SPED origem com Bloco K (.txt)")
    parser.add_argument("--output", help="Arquivo de saida")
    parser.add_argument(
        "--modo-produto-faltante",
        choices=["incluir", "erro"],
        default="incluir",
        help="Como tratar produto do Bloco K ausente no 0200 do destino",
    )
    return parser.parse_args()


def get_reg(line: str) -> str:
    if not line.startswith("|"):
        return ""
    parts = line.split("|")
    if len(parts) < 3:
        return ""
    reg = parts[1].strip().upper()
    return reg if len(reg) == 4 and reg[0].isalnum() else ""


def parse_record_parts(line: str) -> List[str]:
    parts = line.rstrip("\r\n").split("|")
    if parts and parts[0] == "":
        parts = parts[1:]
    if parts and parts[-1] == "":
        parts = parts[:-1]
    return parts


def build_record(parts: Sequence[str]) -> str:
    return "|" + "|".join(parts) + "|"


def set_record_field(line: str, field_no_1_based: int, value: str) -> str:
    parts = parse_record_parts(line)
    idx = field_no_1_based - 1
    while len(parts) <= idx:
        parts.append("")
    parts[idx] = value
    return build_record(parts)


def read_sped_lines(path: Path) -> List[str]:
    content = path.read_text(encoding="latin-1", errors="replace")
    lines: List[str] = []
    found_0000 = False
    for raw in content.splitlines():
        ln = raw.strip()
        if not ln:
            continue
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


def find_index(lines: Sequence[str], reg: str) -> int:
    for i, ln in enumerate(lines):
        if get_reg(ln) == reg:
            return i
    return -1


def get_0200_cod_item(line: str) -> str:
    if get_reg(line) != "0200":
        return ""
    parts = parse_record_parts(line)
    return parts[1].strip() if len(parts) > 1 else ""


def collect_0200_groups(lines: Sequence[str]) -> List[Tuple[str, List[str]]]:
    groups: List[Tuple[str, List[str]]] = []
    current_group: List[str] = []
    current_code = ""

    for ln in lines:
        reg = get_reg(ln)
        if reg == "0200":
            if current_group and current_code:
                groups.append((current_code, current_group))
            current_group = [ln]
            current_code = get_0200_cod_item(ln)
            continue

        if reg in REGS_0200_CHILDREN and current_group:
            current_group.append(ln)
            continue

        if current_group and current_code:
            groups.append((current_code, current_group))
            current_group = []
            current_code = ""

    if current_group and current_code:
        groups.append((current_code, current_group))
    return groups


def collect_0200_codes(lines: Sequence[str]) -> Set[str]:
    out: Set[str] = set()
    for ln in lines:
        if get_reg(ln) != "0200":
            continue
        cod = get_0200_cod_item(ln)
        if cod:
            out.add(cod)
    return out


def extract_k_block(lines: Sequence[str]) -> List[str]:
    idx_k001 = find_index(lines, "K001")
    idx_k990 = find_index(lines, "K990")
    if idx_k001 < 0 or idx_k990 < 0 or idx_k990 < idx_k001:
        raise ValueError("Nao foi possivel localizar K001/K990 no arquivo origem.")
    return list(lines[idx_k001 : idx_k990 + 1])


def normalize_k_block(k_block: List[str]) -> List[str]:
    if not k_block:
        raise ValueError("Bloco K vazio.")
    if get_reg(k_block[0]) != "K001" or get_reg(k_block[-1]) != "K990":
        raise ValueError("Bloco K invalido (deve iniciar em K001 e finalizar em K990).")
    has_details = any(get_reg(ln) not in {"K001", "K990"} for ln in k_block)
    k_block[0] = set_record_field(k_block[0], 2, "0" if has_details else "1")
    k_block[-1] = set_record_field(k_block[-1], 2, str(len(k_block)))
    return k_block


def collect_k_product_codes(k_block: Sequence[str], source_codes: Set[str]) -> Set[str]:
    used: Set[str] = set()
    for ln in k_block:
        reg = get_reg(ln)
        if not reg.startswith("K"):
            continue
        parts = parse_record_parts(ln)
        for token in parts[1:]:
            value = token.strip()
            if value and value in source_codes:
                used.add(value)
    return used


def build_missing_0200_lines(
    source_groups: Sequence[Tuple[str, List[str]]],
    missing_codes: Set[str],
) -> Tuple[List[str], List[str], List[str]]:
    to_add: List[str] = []
    included_codes: List[str] = []
    pending = set(missing_codes)
    for cod, group in source_groups:
        if cod not in pending:
            continue
        to_add.extend(group)
        included_codes.append(cod)
        pending.discard(cod)
    unresolved = sorted(pending)
    return to_add, included_codes, unresolved


def insert_0200_groups(lines: List[str], groups_lines: List[str]) -> List[str]:
    if not groups_lines:
        return lines

    idx_0000 = find_index(lines, "0000")
    idx_0990 = find_index(lines, "0990")
    if idx_0000 < 0 or idx_0990 < 0 or idx_0990 <= idx_0000:
        raise ValueError("Nao foi possivel localizar os limites do Bloco 0 (0000/0990).")

    tail_regs = {"0300", "0305", "0400", "0450", "0460", "0500", "0600", "0990"}
    first_tail = idx_0990
    for i in range(idx_0000 + 1, idx_0990):
        if get_reg(lines[i]) in tail_regs:
            first_tail = i
            break

    last_0200_block_idx = -1
    for i in range(idx_0000 + 1, first_tail):
        if get_reg(lines[i]) in REGS_0200_BLOCK:
            last_0200_block_idx = i

    insert_idx = first_tail if last_0200_block_idx < 0 else min(last_0200_block_idx + 1, first_tail)
    return lines[:insert_idx] + groups_lines + lines[insert_idx:]


def replace_k_block(lines: List[str], source_k: List[str]) -> List[str]:
    idx_k001 = find_index(lines, "K001")
    idx_k990 = find_index(lines, "K990")

    if idx_k001 >= 0 and idx_k990 >= 0 and idx_k990 >= idx_k001:
        base = lines[:idx_k001] + lines[idx_k990 + 1 :]
    else:
        base = [ln for ln in lines if not get_reg(ln).startswith("K")]

    insert_idx = find_index(base, "1001")
    if insert_idx < 0:
        insert_idx = find_index(base, "9001")
    if insert_idx < 0:
        insert_idx = len(base)
    return base[:insert_idx] + source_k + base[insert_idx:]


def update_0990(lines: List[str]) -> Tuple[List[str], int]:
    idx_0000 = find_index(lines, "0000")
    idx_0990 = find_index(lines, "0990")
    if idx_0000 < 0 or idx_0990 < 0 or idx_0990 < idx_0000:
        raise ValueError("Nao foi possivel localizar 0000/0990 para atualizar bloco 0.")
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

    qtd_lin_9 = 3 + qtd_9900
    bloco_9.append(build_record(["9990", str(qtd_lin_9)]))

    full = prefix + bloco_9
    qtd_total = len(full) + 1
    full.append(build_record(["9999", str(qtd_total)]))
    return full, qtd_lin_9, qtd_total


def integrate_k_block(
    destino_lines: List[str],
    origem_lines: List[str],
    modo_produto_faltante: str,
) -> Tuple[List[str], CopyStats]:
    origem_0200_groups = collect_0200_groups(origem_lines)
    origem_0200_codes = {cod for cod, _ in origem_0200_groups if cod}

    source_k = normalize_k_block(extract_k_block(origem_lines))
    k_product_codes = collect_k_product_codes(source_k, origem_0200_codes)

    destino_codes = collect_0200_codes(destino_lines)
    missing_codes = set(sorted(k_product_codes - destino_codes))

    inserted_0200 = 0
    if missing_codes:
        if modo_produto_faltante == "erro":
            sample = ", ".join(sorted(missing_codes)[:20])
            raise ValueError(
                "Produtos do Bloco K ausentes no 0200 do destino. "
                f"Total faltante: {len(missing_codes)}. Exemplo: {sample}"
            )
        to_add, included_codes, unresolved = build_missing_0200_lines(origem_0200_groups, missing_codes)
        if unresolved:
            sample = ", ".join(unresolved[:20])
            raise ValueError(
                "Nao foi possivel incluir todos os produtos faltantes do Bloco K. "
                f"Sem 0200 na origem para: {sample}"
            )
        destino_lines = insert_0200_groups(destino_lines, to_add)
        inserted_0200 = len(included_codes)

    merged = replace_k_block(destino_lines, source_k)
    merged, qtd_lin_0 = update_0990(merged)
    merged, qtd_lin_9, qtd_total = rebuild_bloco_9(merged)

    stats = CopyStats(
        source_k_lines=len(source_k),
        source_k_products=len(k_product_codes),
        missing_products=len(missing_codes),
        inserted_0200=inserted_0200,
        qtd_lin_0=qtd_lin_0,
        qtd_lin_9=qtd_lin_9,
        qtd_lin_total=qtd_total,
    )
    return merged, stats


def main() -> None:
    args = parse_args()
    if not args.sped_destino or not args.sped_origem_k:
        print("ERRO: informe SPED destino e SPED origem com Bloco K.")
        print("Uso: copiar_bloco_k_sped.py <sped_destino.txt> <sped_origem_k.txt> [--output arquivo.txt]")
        sys.exit(2)

    destino_path = Path(args.sped_destino)
    origem_path = Path(args.sped_origem_k)

    if not destino_path.exists():
        print(f"ERRO: SPED destino nao encontrado: {destino_path}")
        sys.exit(2)
    if not origem_path.exists():
        print(f"ERRO: SPED origem nao encontrado: {origem_path}")
        sys.exit(2)

    try:
        destino_lines = read_sped_lines(destino_path)
        origem_lines = read_sped_lines(origem_path)
        integrated, stats = integrate_k_block(
            destino_lines=destino_lines,
            origem_lines=origem_lines,
            modo_produto_faltante=args.modo_produto_faltante,
        )
    except Exception as exc:
        print(f"ERRO: {exc}")
        sys.exit(3)

    output_path = (
        Path(args.output)
        if args.output
        else destino_path.parent / f"{destino_path.stem}_COM_BLOCO_K_{datetime.now():%Y%m%d_%H%M%S}.txt"
    )
    output_path.write_text("\n".join(integrated) + "\n", encoding="latin-1", errors="replace")

    print("\nCopia do Bloco K concluida.")
    print(f"- SPED destino: {destino_path}")
    print(f"- SPED origem K: {origem_path}")
    print(f"- Saida: {output_path}")
    print("\nResumo:")
    print(f"- Linhas copiadas do Bloco K: {stats.source_k_lines}")
    print(f"- Produtos usados no Bloco K: {stats.source_k_products}")
    print(f"- Produtos faltantes no destino: {stats.missing_products}")
    print(f"- 0200 inseridos no destino: {stats.inserted_0200}")
    print("\nTotalizadores atualizados:")
    print(f"- 0990 (QTD_LIN_0): {stats.qtd_lin_0}")
    print(f"- 9990 (QTD_LIN_9): {stats.qtd_lin_9}")
    print(f"- 9999 (QTD_LIN): {stats.qtd_lin_total}")


if __name__ == "__main__":
    main()
