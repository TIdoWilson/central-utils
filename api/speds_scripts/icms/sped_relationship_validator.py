#!/usr/bin/env python3
"""
Validador de relacionamentos internos do SPED ICMS/IPI.

Objetivo:
- Ler o arquivo inteiro e validar referencias em todos os registros, usando layouts JSON.
- Validar dominios internos (ex.: COD_ITEM, UNID, COD_PART, COD_CTA, COD_CCUS, COD_INF, COD_OBS).
- Funcionar como utilitario reutilizavel por outros scripts.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence, Set, Tuple


RE_REG = re.compile(r"^[0-9A-Z]{4}$")
DEFAULT_PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LAYOUTS_DIR = DEFAULT_PROJECT_ROOT / "layouts" / "speds" / "icms"
DEFAULT_RULES_PATH = DEFAULT_LAYOUTS_DIR / "relationships" / "reference_domains.validator.json"


def normalize_reg(value: str) -> str:
    return str(value or "").strip().upper()


def normalize_field_name(value: str) -> str:
    text = str(value or "").strip().upper()
    text = text.replace(" ", "")
    text = text.replace("-", "_")
    text = re.sub(r"[^A-Z0-9_]", "", text)
    text = re.sub(r"_+", "_", text)
    return text.strip("_")


def split_parts(line: str) -> List[str]:
    parts = line.rstrip("\r\n").split("|")
    if parts and parts[0] == "":
        parts = parts[1:]
    if parts and parts[-1] == "":
        parts = parts[:-1]
    return parts


def get_reg(line: str) -> str:
    if not line.startswith("|"):
        return ""
    parts = line.split("|")
    if len(parts) < 3:
        return ""
    reg = normalize_reg(parts[1])
    return reg if RE_REG.fullmatch(reg) else ""


def read_sped_lines(path: Path) -> List[str]:
    if not path.exists():
        raise FileNotFoundError(f"Arquivo SPED nao encontrado: {path}")
    raw = path.read_text(encoding="latin-1", errors="replace")
    lines: List[str] = []
    found_0000 = False
    for ln in raw.splitlines():
        line = ln.strip()
        if not line:
            continue
        reg = get_reg(line)
        if not reg:
            continue
        if reg == "0000":
            found_0000 = True
        if not found_0000:
            continue
        lines.append(line)
        if reg == "9999":
            break
    if not lines:
        raise ValueError("Nao encontrei linhas SPED validas no arquivo informado.")
    if get_reg(lines[0]) != "0000":
        raise ValueError("Arquivo SPED nao inicia com registro 0000.")
    if get_reg(lines[-1]) != "9999":
        raise ValueError("Arquivo SPED nao contem registro 9999 valido.")
    return lines


@dataclass(frozen=True)
class DomainMatcher:
    domain_id: str
    exact: Tuple[str, ...]
    prefix: Tuple[str, ...]
    value_normalization: str
    allowed_literals: Set[str]
    definition_fields: Set[Tuple[str, str]]

    def matches(self, field_name: str) -> bool:
        if field_name in self.exact:
            return True
        return any(field_name.startswith(prefix) for prefix in self.prefix)

    def normalize_value(self, value: str) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        if self.value_normalization == "upper":
            text = text.upper()
        elif self.value_normalization == "lower":
            text = text.lower()
        return text


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Valida relacionamentos internos do SPED ICMS/IPI usando layouts JSON."
    )
    parser.add_argument("sped_path", help="Arquivo SPED (.txt)")
    parser.add_argument(
        "--layouts-dir",
        default=str(DEFAULT_LAYOUTS_DIR),
        help=f"Pasta de layouts JSON (padrao: {DEFAULT_LAYOUTS_DIR})",
    )
    parser.add_argument(
        "--rules-file",
        default=str(DEFAULT_RULES_PATH),
        help=f"Arquivo de dominios de validacao (padrao: {DEFAULT_RULES_PATH})",
    )
    parser.add_argument(
        "--max-issues",
        type=int,
        default=200,
        help="Limite de erros detalhados no relatorio (padrao: 200).",
    )
    parser.add_argument(
        "--output-json",
        default="",
        help="Caminho para salvar relatorio JSON.",
    )
    return parser.parse_args()


def load_rules(path: Path) -> Tuple[List[DomainMatcher], Dict[str, List[Tuple[str, str]]], Dict[str, DomainMatcher]]:
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    domains = data.get("domains", [])
    if not isinstance(domains, list) or not domains:
        raise ValueError("Arquivo de regras sem dominios validos.")

    matchers: List[DomainMatcher] = []
    matcher_by_domain: Dict[str, DomainMatcher] = {}
    definitions_by_domain: Dict[str, List[Tuple[str, str]]] = {}
    for domain in domains:
        domain_id = normalize_field_name(domain.get("id", ""))
        if not domain_id:
            continue
        defs_raw = domain.get("definitions", [])
        defs_norm: List[Tuple[str, str]] = []
        for item in defs_raw:
            rec = normalize_reg(item.get("record", ""))
            field = normalize_field_name(item.get("field", ""))
            if rec and field:
                defs_norm.append((rec, field))
        refs = domain.get("references", {}) if isinstance(domain.get("references", {}), dict) else {}
        exact = tuple(normalize_field_name(v) for v in refs.get("exact", []) if normalize_field_name(v))
        prefix = tuple(normalize_field_name(v) for v in refs.get("prefix", []) if normalize_field_name(v))
        value_normalization = str(domain.get("value_normalization", "")).strip().lower()
        allowed_literals_raw = domain.get("allowed_literals", [])
        allowed_literals: Set[str] = set()
        if isinstance(allowed_literals_raw, list):
            for item in allowed_literals_raw:
                val = str(item).strip()
                if not val:
                    continue
                if value_normalization == "upper":
                    val = val.upper()
                elif value_normalization == "lower":
                    val = val.lower()
                allowed_literals.add(val)
        matcher = DomainMatcher(
            domain_id=domain_id,
            exact=exact,
            prefix=prefix,
            value_normalization=value_normalization,
            allowed_literals=allowed_literals,
            definition_fields=set(defs_norm),
        )
        matchers.append(matcher)
        matcher_by_domain[domain_id] = matcher
        definitions_by_domain[domain_id] = defs_norm
    if not matchers:
        raise ValueError("Nenhum dominio valido encontrado no arquivo de regras.")
    return matchers, definitions_by_domain, matcher_by_domain


def load_layout_field_positions(layouts_dir: Path) -> Dict[str, List[Tuple[str, int]]]:
    out: Dict[str, List[Tuple[str, int]]] = {}
    for path in sorted(layouts_dir.glob("*.json")):
        name = path.name.lower()
        if name == "index_registros.json" or name.endswith("_index.json"):
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            try:
                data = json.loads(path.read_text(encoding="latin-1"))
            except Exception:
                continue

        reg = normalize_reg(data.get("registro", {}).get("codigo", ""))
        if not reg:
            reg = normalize_reg(path.stem.split("_")[0])
        if not reg:
            continue

        campos = data.get("campos", [])
        if not isinstance(campos, list):
            continue
        field_positions: List[Tuple[str, int]] = []
        for idx, field in enumerate(campos):
            field_name = normalize_field_name(field.get("campo", ""))
            if not field_name:
                continue
            # idx no array de partes sem pipes de borda (REG = 0).
            field_positions.append((field_name, idx))
        if field_positions:
            out[reg] = field_positions
    if not out:
        raise ValueError(f"Nao foi possivel carregar layouts em: {layouts_dir}")
    return out


def build_domain_targets(
    layout_fields: Dict[str, List[Tuple[str, int]]],
    domains: Sequence[DomainMatcher],
) -> Dict[str, Dict[str, List[Tuple[str, int]]]]:
    targets: Dict[str, Dict[str, List[Tuple[str, int]]]] = {}
    for reg, fields in layout_fields.items():
        per_domain: Dict[str, List[Tuple[str, int]]] = {}
        for matcher in domains:
            matches: List[Tuple[str, int]] = []
            for field_name, idx in fields:
                if (reg, field_name) in matcher.definition_fields:
                    continue
                if matcher.matches(field_name):
                    matches.append((field_name, idx))
            if matches:
                per_domain[matcher.domain_id] = matches
        if per_domain:
            targets[reg] = per_domain
    return targets


def collect_definitions(
    lines: Sequence[str],
    layouts: Dict[str, List[Tuple[str, int]]],
    definitions_by_domain: Dict[str, List[Tuple[str, str]]],
    matcher_by_domain: Dict[str, DomainMatcher],
) -> Dict[str, Set[str]]:
    # indice rapido de posicao por campo.
    pos_map: Dict[str, Dict[str, int]] = {}
    for reg, fields in layouts.items():
        pos_map[reg] = {field: idx for field, idx in fields}

    defs: Dict[str, Set[str]] = {domain: set() for domain in definitions_by_domain.keys()}
    for ln in lines:
        reg = get_reg(ln)
        if not reg:
            continue
        parts = split_parts(ln)
        for domain_id, def_items in definitions_by_domain.items():
            matcher = matcher_by_domain.get(domain_id)
            if matcher is None:
                continue
            for def_reg, def_field in def_items:
                if reg != def_reg:
                    continue
                idx = pos_map.get(def_reg, {}).get(def_field)
                if idx is None or idx >= len(parts):
                    continue
                val = matcher.normalize_value(parts[idx])
                if val:
                    defs[domain_id].add(val)
    return defs


def validate_sped_relationships_lines(
    lines: Sequence[str],
    layouts_dir: Path,
    rules_path: Path,
    max_issues: int = 200,
) -> Dict[str, object]:
    domains, definitions_by_domain, matcher_by_domain = load_rules(rules_path)
    layout_fields = load_layout_field_positions(layouts_dir)
    targets = build_domain_targets(layout_fields, domains)
    defs = collect_definitions(
        lines=lines,
        layouts=layout_fields,
        definitions_by_domain=definitions_by_domain,
        matcher_by_domain=matcher_by_domain,
    )

    issues: List[Dict[str, object]] = []
    issue_signature_counts: Counter[str] = Counter()
    invalid_total = 0
    checks = 0
    for line_idx, ln in enumerate(lines):
        reg = get_reg(ln)
        if not reg:
            continue
        reg_targets = targets.get(reg, {})
        if not reg_targets:
            continue
        parts = split_parts(ln)
        for domain_id, fields in reg_targets.items():
            matcher = matcher_by_domain.get(domain_id)
            if matcher is None:
                continue
            valid_values = defs.get(domain_id, set())
            for field_name, idx in fields:
                if idx >= len(parts):
                    continue
                value = parts[idx].strip()
                if not value:
                    continue
                norm_value = matcher.normalize_value(value)
                if not norm_value:
                    continue
                checks += 1
                if norm_value in matcher.allowed_literals:
                    continue
                if norm_value in valid_values:
                    continue
                invalid_total += 1
                signature = f"{domain_id}|{reg}|{field_name}|{norm_value}"
                issue_signature_counts[signature] += 1
                if len(issues) < max_issues:
                    issues.append(
                        {
                            "line_number": line_idx + 1,
                            "record": reg,
                            "field": field_name,
                            "value": value,
                            "normalized_value": norm_value,
                            "domain": domain_id,
                        }
                    )

    missing_definitions = {
        domain_id: 0 if defs_set else 1
        for domain_id, defs_set in defs.items()
    }
    result = {
        "ok": invalid_total == 0,
        "total_lines": len(lines),
        "total_checks": checks,
        "invalid_refs": invalid_total,
        "definitions_count": {k: len(v) for k, v in defs.items()},
        "domains_without_definitions": [k for k, v in missing_definitions.items() if v > 0],
        "issue_signature_counts": dict(issue_signature_counts),
        "issues": issues,
    }
    return result


def validate_sped_relationships_file(
    sped_path: Path,
    layouts_dir: Path,
    rules_path: Path,
    max_issues: int = 200,
) -> Dict[str, object]:
    lines = read_sped_lines(sped_path)
    return validate_sped_relationships_lines(
        lines=lines,
        layouts_dir=layouts_dir,
        rules_path=rules_path,
        max_issues=max_issues,
    )


def main() -> None:
    args = parse_args()
    sped_path = Path(args.sped_path)
    layouts_dir = Path(args.layouts_dir)
    rules_path = Path(args.rules_file)

    if not layouts_dir.exists():
        raise SystemExit(f"Pasta de layouts nao encontrada: {layouts_dir}")
    if not rules_path.exists():
        raise SystemExit(f"Arquivo de regras nao encontrado: {rules_path}")

    result = validate_sped_relationships_file(
        sped_path=sped_path,
        layouts_dir=layouts_dir,
        rules_path=rules_path,
        max_issues=max(1, int(args.max_issues)),
    )

    print("\nValidacao de relacionamentos (SPED ICMS/IPI)")
    print(f"- Arquivo: {sped_path}")
    print(f"- Linhas lidas: {result['total_lines']}")
    print(f"- Checagens executadas: {result['total_checks']}")
    print(f"- Referencias invalidas: {result['invalid_refs']}")
    print("- Definicoes por dominio:")
    for domain_id, count in sorted(result["definitions_count"].items()):
        print(f"  {domain_id}: {count}")
    if result["domains_without_definitions"]:
        print("- Dominios sem definicoes no arquivo:")
        for domain_id in result["domains_without_definitions"]:
            print(f"  {domain_id}")

    if args.output_json:
        output_path = Path(args.output_json)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"- Relatorio JSON: {output_path}")

    if result["issues"]:
        print("\nPrimeiras inconsistencias:")
        for issue in result["issues"][:20]:
            print(
                f"  linha {issue['line_number']} | {issue['record']}.{issue['field']} "
                f"=> '{issue['value']}' (dominio {issue['domain']}) sem definicao"
            )
        raise SystemExit(4)

    print("\nOK: nenhuma referencia invalida encontrada.")


if __name__ == "__main__":
    main()
