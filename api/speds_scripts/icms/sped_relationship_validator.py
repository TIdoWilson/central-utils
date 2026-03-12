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
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set, Tuple


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


@dataclass(frozen=True)
class LayoutFieldMeta:
    index: int
    name: str
    required: bool
    field_type: str
    size: Optional[int]
    decimals: Optional[int]


@dataclass(frozen=True)
class PvaIssue:
    line_number: int
    record: str
    field: str
    value: str
    error_code: str
    message: str
    fix_hint: str

    def signature(self) -> str:
        norm_value = str(self.value or "").strip() or "-"
        return f"PVA::{self.error_code}|{self.record}|{self.field}|{norm_value}"


def safe_load_json(path: Path) -> Dict[str, object]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return json.loads(path.read_text(encoding="latin-1", errors="replace"))


def parse_int_from_text(raw: object) -> Optional[int]:
    text = str(raw or "").strip()
    match = re.search(r"\d+", text)
    if not match:
        return None
    try:
        return int(match.group(0))
    except Exception:
        return None


def parse_decimals_from_text(raw: object) -> Optional[int]:
    text = str(raw or "").strip()
    if not text:
        return None
    if text in {"-", "--"}:
        return 0
    if text.isdigit():
        return int(text)
    return None


def normalize_field_type(raw: object) -> str:
    text = str(raw or "").strip().upper()
    if not text:
        return ""
    if text[0] in {"N", "C", "D"}:
        return text[0]
    return ""


def normalize_decimal_text(value: str) -> str:
    text = str(value or "").strip().replace(" ", "")
    if not text:
        return ""
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    return text


def parse_decimal(value: str) -> Optional[Decimal]:
    text = normalize_decimal_text(value)
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def parse_int(value: str) -> Optional[int]:
    text = str(value or "").strip()
    if not text:
        return None
    if not re.fullmatch(r"[+-]?\d+", text):
        return None
    try:
        return int(text)
    except Exception:
        return None


def is_valid_numeric(value: str, decimals: Optional[int]) -> bool:
    parsed = parse_decimal(value)
    if parsed is None:
        return False
    if decimals is None:
        return True
    if decimals == 0:
        return parsed == parsed.to_integral_value()
    norm = normalize_decimal_text(value)
    if "." not in norm:
        return True
    frac = norm.split(".", 1)[1]
    return len(frac) <= decimals


def is_valid_date_ddmmyyyy(value: str) -> bool:
    text = str(value or "").strip()
    if len(text) != 8 or not text.isdigit():
        return False
    try:
        datetime.strptime(text, "%d%m%Y")
        return True
    except ValueError:
        return False


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
    parser.add_argument(
        "--pva-like-mode",
        default="auto",
        choices=["auto", "on", "off"],
        help="Ativa validacoes PVA-like (auto: liga para layouts de contribuicoes).",
    )
    parser.add_argument(
        "--hierarchy-file",
        default="",
        help="Arquivo de hierarquia pai/filho para validacoes estruturais (opcional).",
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


def load_layout_field_metadata(layouts_dir: Path) -> Dict[str, List[LayoutFieldMeta]]:
    out: Dict[str, List[LayoutFieldMeta]] = {}
    for path in sorted(layouts_dir.glob("*.json")):
        name = path.name.lower()
        if name == "index_registros.json" or name.endswith("_index.json"):
            continue
        try:
            data = safe_load_json(path)
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

        fields: List[LayoutFieldMeta] = []
        for idx, field in enumerate(campos):
            if not isinstance(field, dict):
                continue
            field_name = normalize_field_name(field.get("campo", ""))
            if not field_name:
                continue
            required = str(field.get("obrigatorio", "")).strip().upper() == "S"
            field_type = normalize_field_type(field.get("tipo"))
            size = parse_int_from_text(field.get("tamanho"))
            decimals = parse_decimals_from_text(field.get("decimais"))
            fields.append(
                LayoutFieldMeta(
                    index=idx,
                    name=field_name,
                    required=required,
                    field_type=field_type,
                    size=size,
                    decimals=decimals,
                )
            )
        if fields:
            out[reg] = fields
    return out


def get_field_index(layout_meta: Dict[str, List[LayoutFieldMeta]], reg: str, field_name: str) -> Optional[int]:
    for field in layout_meta.get(reg, []):
        if field.name == field_name:
            return field.index
    return None


def get_part(parts: Sequence[str], idx: Optional[int]) -> str:
    if idx is None:
        return ""
    if idx < 0 or idx >= len(parts):
        return ""
    return str(parts[idx] or "").strip()


def decimal_or_zero(value: str) -> Decimal:
    parsed = parse_decimal(value)
    if parsed is None:
        return Decimal("0")
    return parsed


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
    pva_like_mode: str = "auto",
    hierarchy_path: Optional[Path] = None,
) -> Dict[str, object]:
    domains, definitions_by_domain, matcher_by_domain = load_rules(rules_path)
    layout_fields = load_layout_field_positions(layouts_dir)
    layout_meta = load_layout_field_metadata(layouts_dir)
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
    result: Dict[str, object] = {
        "ok": invalid_total == 0,
        "total_lines": len(lines),
        "total_checks": checks,
        "invalid_refs": invalid_total,
        "definitions_count": {k: len(v) for k, v in defs.items()},
        "domains_without_definitions": [k for k, v in missing_definitions.items() if v > 0],
        "issue_signature_counts": dict(issue_signature_counts),
        "issue_signature_labels": {},
        "issues": issues,
    }
    if not should_enable_pva_like(layouts_dir, pva_like_mode):
        return result

    resolved_hierarchy = hierarchy_path
    if resolved_hierarchy is None:
        resolved_hierarchy = layouts_dir / "relationships" / "hierarchy.parent_child.json"

    struct_issues, struct_checks = validate_structure_and_types(lines, layout_meta, max_issues)
    hierarchy_issues, hierarchy_checks = validate_hierarchy_contiguous(lines, resolved_hierarchy, max_issues)
    totalizer_issues, totalizer_checks = validate_totalizers(lines, layout_meta, max_issues)
    fiscal_issues, fiscal_checks = validate_fiscal_pva_like(lines, layout_meta, max_issues)
    pva_issues = list(struct_issues) + list(hierarchy_issues) + list(totalizer_issues) + list(fiscal_issues)
    pva_checks = struct_checks + hierarchy_checks + totalizer_checks + fiscal_checks
    return merge_pva_like_issues(result, pva_issues, pva_checks, max_issues)


def block_of_reg(reg: str) -> str:
    code = normalize_reg(reg)
    return code[:1] if code else ""


def should_enable_pva_like(layouts_dir: Path, mode: str) -> bool:
    mode_norm = str(mode or "").strip().lower()
    if mode_norm == "on":
        return True
    if mode_norm == "off":
        return False
    path_norm = str(layouts_dir).replace("\\", "/").lower()
    return "/contribuicoes" in path_norm


def build_pva_issue(
    line_number: int,
    record: str,
    field: str,
    value: str,
    error_code: str,
    message: str,
    fix_hint: str,
) -> PvaIssue:
    return PvaIssue(
        line_number=line_number,
        record=record,
        field=field,
        value=value,
        error_code=error_code,
        message=message,
        fix_hint=fix_hint,
    )


def validate_structure_and_types(
    lines: Sequence[str],
    layout_meta: Dict[str, List[LayoutFieldMeta]],
    max_issues: int,
) -> Tuple[List[PvaIssue], int]:
    issues: List[PvaIssue] = []
    checks = 0
    for line_idx, line in enumerate(lines, start=1):
        reg = get_reg(line)
        if not reg:
            continue
        parts = split_parts(line)
        meta = layout_meta.get(reg)
        checks += 1
        if not meta:
            if len(issues) < max_issues:
                issues.append(
                    build_pva_issue(
                        line_number=line_idx,
                        record=reg,
                        field="REG",
                        value=reg,
                        error_code="MSG_REGISTRO_DESCONHECIDO",
                        message=f"Registro {reg} nao encontrado no layout carregado.",
                        fix_hint="Revisar versao do layout ou ajustar o codigo do registro.",
                    )
                )
            continue

        if len(parts) != len(meta) and len(issues) < max_issues:
            issues.append(
                build_pva_issue(
                    line_number=line_idx,
                    record=reg,
                    field="REG",
                    value=str(len(parts)),
                    error_code="MSG_QTD_CAMPOS_INVALIDA",
                    message=f"Registro {reg} possui {len(parts)} campos, esperado {len(meta)}.",
                    fix_hint="Regerar o registro conforme layout oficial e validar separadores '|'.",
                )
            )

        for field in meta:
            if field.name == "REG":
                continue
            checks += 1
            value = get_part(parts, field.index)
            if field.required and not value:
                if len(issues) < max_issues:
                    issues.append(
                        build_pva_issue(
                            line_number=line_idx,
                            record=reg,
                            field=field.name,
                            value="",
                            error_code="MSG_CAMPO_OBRIGATORIO",
                            message=f"Campo obrigatorio {field.name} sem preenchimento.",
                            fix_hint="Preencher o campo com valor valido conforme layout.",
                        )
                    )
                continue
            if not value:
                continue

            if field.field_type == "N" and not is_valid_numeric(value, field.decimals):
                if len(issues) < max_issues:
                    issues.append(
                        build_pva_issue(
                            line_number=line_idx,
                            record=reg,
                            field=field.name,
                            value=value,
                            error_code="MSG_FORMATO_NUMERICO_INVALIDO",
                            message=f"Campo {field.name} em formato numerico invalido.",
                            fix_hint="Usar numero valido sem caracteres extras.",
                        )
                    )

            if field.name.startswith("DT_") and value and not is_valid_date_ddmmyyyy(value):
                if len(issues) < max_issues:
                    issues.append(
                        build_pva_issue(
                            line_number=line_idx,
                            record=reg,
                            field=field.name,
                            value=value,
                            error_code="MSG_DATA_INVALIDA",
                            message=f"Campo {field.name} com data invalida (esperado DDMMAAAA).",
                            fix_hint="Corrigir a data para formato DDMMAAAA com dia/mes validos.",
                        )
                    )
    return issues, checks


def load_contiguous_parent_rules(hierarchy_path: Optional[Path]) -> Dict[str, Dict[str, Set[str]]]:
    if not hierarchy_path or not hierarchy_path.exists():
        return {}
    try:
        data = safe_load_json(hierarchy_path)
    except Exception:
        return {}
    edges = data.get("parent_child_edges", [])
    if not isinstance(edges, list):
        return {}

    out: Dict[str, Dict[str, Set[str]]] = {}
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        if str(edge.get("child_scope", "")).strip().lower() != "contiguous_after_parent":
            continue
        parent = normalize_reg(edge.get("parent", ""))
        children = [normalize_reg(item) for item in edge.get("children", []) if normalize_reg(item)]
        if not parent or not children:
            continue
        siblings = set(children)
        for child in children:
            out[child] = {
                "parent": {parent},
                "siblings": siblings,
            }
    return out


def validate_hierarchy_contiguous(
    lines: Sequence[str],
    hierarchy_path: Optional[Path],
    max_issues: int,
) -> Tuple[List[PvaIssue], int]:
    rules = load_contiguous_parent_rules(hierarchy_path)
    if not rules:
        return [], 0
    issues: List[PvaIssue] = []
    checks = 0
    prev_reg = ""
    for line_idx, line in enumerate(lines, start=1):
        reg = get_reg(line)
        if not reg:
            continue
        checks += 1
        rule = rules.get(reg)
        if rule:
            allowed_prev = set(rule["siblings"]) | set(rule["parent"])
            if prev_reg not in allowed_prev and len(issues) < max_issues:
                issues.append(
                    build_pva_issue(
                        line_number=line_idx,
                        record=reg,
                        field="REG",
                        value=reg,
                        error_code="MSG_HIERARQUIA_ORFA",
                        message=f"Registro filho {reg} fora da sequencia contigua esperada.",
                        fix_hint="Reposicionar o filho imediatamente apos o pai e irmaos validos.",
                    )
                )
        prev_reg = reg
    return issues, checks


def validate_totalizers(
    lines: Sequence[str],
    layout_meta: Dict[str, List[LayoutFieldMeta]],
    max_issues: int,
) -> Tuple[List[PvaIssue], int]:
    issues: List[PvaIssue] = []
    checks = 0

    records: List[Tuple[int, str, List[str]]] = []
    counts_by_reg: Counter[str] = Counter()
    counts_by_block: Counter[str] = Counter()
    for line_idx, line in enumerate(lines, start=1):
        reg = get_reg(line)
        if not reg:
            continue
        parts = split_parts(line)
        records.append((line_idx, reg, parts))
        counts_by_reg[reg] += 1
        counts_by_block[block_of_reg(reg)] += 1

    idx_9900_reg = get_field_index(layout_meta, "9900", "REG_BLC")
    idx_9900_qtd = get_field_index(layout_meta, "9900", "QTD_REG_BLC")
    found_9900: Dict[str, int] = {}
    for line_idx, reg, parts in records:
        if reg != "9900":
            continue
        checks += 1
        reg_blc = get_part(parts, idx_9900_reg)
        qtd_txt = get_part(parts, idx_9900_qtd)
        qtd = parse_int(qtd_txt) or 0
        found_9900[reg_blc] = qtd
        expected = counts_by_reg.get(reg_blc, 0)
        if qtd != expected and len(issues) < max_issues:
            issues.append(
                build_pva_issue(
                    line_number=line_idx,
                    record="9900",
                    field="QTD_REG_BLC",
                    value=qtd_txt,
                    error_code="MSG_QTD_REG_9900",
                    message=f"9900 para {reg_blc} informa {qtd}, esperado {expected}.",
                    fix_hint="Recalcular o bloco 9 para refletir contagens reais por registro.",
                )
            )

    for reg, expected in counts_by_reg.items():
        if reg == "9999":
            continue
        checks += 1
        if reg not in found_9900 and len(issues) < max_issues:
            issues.append(
                build_pva_issue(
                    line_number=records[-1][0] if records else 1,
                    record="9900",
                    field="REG_BLC",
                    value=reg,
                    error_code="MSG_9900_AUSENTE",
                    message=f"Registro 9900 ausente para {reg}.",
                    fix_hint="Incluir 9900 correspondente com quantidade correta.",
                )
            )

    idx_9990 = get_field_index(layout_meta, "9990", "QTD_LIN_9")
    idx_9999 = get_field_index(layout_meta, "9999", "QTD_LIN")
    total_block9 = counts_by_block.get("9", 0)
    total_lines = len(records)

    for line_idx, reg, parts in records:
        if reg == "9990":
            checks += 1
            got = parse_int(get_part(parts, idx_9990)) or 0
            if got != total_block9 and len(issues) < max_issues:
                issues.append(
                    build_pva_issue(
                        line_number=line_idx,
                        record="9990",
                        field="QTD_LIN_9",
                        value=str(got),
                        error_code="MSG_QTD_LIN_BLOCO_9",
                        message=f"9990 informa {got}, esperado {total_block9} linhas no bloco 9.",
                        fix_hint="Recalcular os totalizadores do bloco 9.",
                    )
                )
        elif reg == "9999":
            checks += 1
            got = parse_int(get_part(parts, idx_9999)) or 0
            if got != total_lines and len(issues) < max_issues:
                issues.append(
                    build_pva_issue(
                        line_number=line_idx,
                        record="9999",
                        field="QTD_LIN",
                        value=str(got),
                        error_code="MSG_QTD_LIN_ARQUIVO",
                        message=f"9999 informa {got}, esperado {total_lines} linhas no arquivo.",
                        fix_hint="Recalcular QTD_LIN no encerramento 9999.",
                    )
                )
    return issues, checks


def has_cst_range_01_05(
    lines: Sequence[str],
    layout_meta: Dict[str, List[LayoutFieldMeta]],
    field_name: str,
) -> bool:
    target = normalize_field_name(field_name)
    for line in lines:
        reg = get_reg(line)
        if not reg:
            continue
        idx = get_field_index(layout_meta, reg, target)
        if idx is None:
            continue
        value = get_part(split_parts(line), idx)
        if value in {"01", "02", "03", "04", "05"}:
            return True
    return False


def validate_fiscal_pva_like(
    lines: Sequence[str],
    layout_meta: Dict[str, List[LayoutFieldMeta]],
    max_issues: int,
) -> Tuple[List[PvaIssue], int]:
    issues: List[PvaIssue] = []
    checks = 0
    tolerance = Decimal("0.01")

    by_reg: Dict[str, List[Tuple[int, List[str]]]] = defaultdict(list)
    for line_idx, line in enumerate(lines, start=1):
        reg = get_reg(line)
        if not reg:
            continue
        by_reg[reg].append((line_idx, split_parts(line)))

    def add(issue: PvaIssue) -> None:
        if len(issues) < max_issues:
            issues.append(issue)

    for reg in ("M200", "M600"):
        idx_9 = get_field_index(layout_meta, reg, "VL_TOT_CONT_CUM_PER")
        idx_10 = get_field_index(layout_meta, reg, "VL_RET_CUM")
        idx_11 = get_field_index(layout_meta, reg, "VL_OUT_DED_CUM")
        idx_12 = get_field_index(layout_meta, reg, "VL_CONT_CUM_REC")
        idx_8 = get_field_index(layout_meta, reg, "VL_CONT_NC_REC")
        idx_13 = get_field_index(layout_meta, reg, "VL_TOT_CONT_REC")
        for line_idx, parts in by_reg.get(reg, []):
            checks += 2
            expected_12 = decimal_or_zero(get_part(parts, idx_9)) - decimal_or_zero(get_part(parts, idx_10)) - decimal_or_zero(get_part(parts, idx_11))
            actual_12 = decimal_or_zero(get_part(parts, idx_12))
            if abs(actual_12 - expected_12) > tolerance:
                add(
                    build_pva_issue(
                        line_number=line_idx,
                        record=reg,
                        field="VL_CONT_CUM_REC",
                        value=get_part(parts, idx_12),
                        error_code="MSG_VALIDA_VL_CONT_CUM_REC",
                        message="VL_CONT_CUM_REC deve ser igual a VL_TOT_CONT_CUM_PER - VL_RET_CUM - VL_OUT_DED_CUM.",
                        fix_hint="Recalcular campos 09, 10, 11 e 12 do registro de consolidacao.",
                    )
                )
            expected_13 = decimal_or_zero(get_part(parts, idx_8)) + decimal_or_zero(get_part(parts, idx_12))
            actual_13 = decimal_or_zero(get_part(parts, idx_13))
            if abs(actual_13 - expected_13) > tolerance:
                add(
                    build_pva_issue(
                        line_number=line_idx,
                        record=reg,
                        field="VL_TOT_CONT_REC",
                        value=get_part(parts, idx_13),
                        error_code="MSG_VALIDA_VL_TOT_CONT_REC",
                        message="VL_TOT_CONT_REC deve ser igual a VL_CONT_NC_REC + VL_CONT_CUM_REC.",
                        fix_hint="Recalcular campos 08, 12 e 13 do registro de consolidacao.",
                    )
                )

    parent_child = [("M200", "M205"), ("M600", "M605")]
    for parent, child in parent_child:
        idx_nc = get_field_index(layout_meta, parent, "VL_CONT_NC_REC")
        idx_cum = get_field_index(layout_meta, parent, "VL_CONT_CUM_REC")
        parent_rows = by_reg.get(parent, [])
        child_rows = by_reg.get(child, [])
        for _, p_parts in parent_rows:
            checks += 1
            if abs(decimal_or_zero(get_part(p_parts, idx_nc))) <= tolerance and abs(decimal_or_zero(get_part(p_parts, idx_cum))) <= tolerance and child_rows:
                for c_line, _ in child_rows:
                    add(
                        build_pva_issue(
                            line_number=c_line,
                            record=child,
                            field="REG",
                            value=child,
                            error_code="MSG_OBRIGATORIO_M205_M605_NAO_DEVE_EXISTIR",
                            message=f"{child} nao deve existir quando os valores a recolher do {parent} forem zero.",
                            fix_hint=f"Remover {child} ou ajustar os valores de consolidacao no {parent}.",
                        )
                    )

        idx_deb = get_field_index(layout_meta, child, "VL_DEBITO")
        total_deb = Decimal("0")
        for _, c_parts in child_rows:
            checks += 1
            total_deb += decimal_or_zero(get_part(c_parts, idx_deb))
        for p_line, p_parts in parent_rows:
            expected = decimal_or_zero(get_part(p_parts, idx_nc)) + decimal_or_zero(get_part(p_parts, idx_cum))
            if abs(total_deb - expected) > tolerance:
                add(
                    build_pva_issue(
                        line_number=p_line,
                        record=parent,
                        field="VL_TOT_CONT_REC",
                        value=str(expected),
                        error_code="MSG_VALIDA_DET_RECEITA_DCTF",
                        message=f"Soma de {child}.VL_DEBITO deve bater com contribuicao a recolher do {parent}.",
                        fix_hint=f"Conferir detalhamento em {child} e consolidacao no {parent}.",
                    )
                )

    has_cst_pis = has_cst_range_01_05(lines, layout_meta, "CST_PIS")
    has_cst_cofins = has_cst_range_01_05(lines, layout_meta, "CST_COFINS")
    if has_cst_pis and not by_reg.get("M210"):
        line_ref = by_reg.get("M200", [(1, [])])[0][0]
        add(
            build_pva_issue(
                line_number=line_ref,
                record="M210",
                field="REG",
                value="M210",
                error_code="MSG_CALCULAR_CONTRIBUICAO",
                message="Existem CST_PIS de 01 a 05 sem detalhamento M210.",
                fix_hint="Gerar registros M210 para os codigos/aliquotas apurados.",
            )
        )
    if has_cst_cofins and not by_reg.get("M610"):
        line_ref = by_reg.get("M600", [(1, [])])[0][0]
        add(
            build_pva_issue(
                line_number=line_ref,
                record="M610",
                field="REG",
                value="M610",
                error_code="MSG_CALCULAR_CONTRIBUICAO",
                message="Existem CST_COFINS de 01 a 05 sem detalhamento M610.",
                fix_hint="Gerar registros M610 para os codigos/aliquotas apurados.",
            )
        )

    return issues, checks


def merge_pva_like_issues(
    base_result: Dict[str, object],
    pva_issues: Sequence[PvaIssue],
    extra_checks: int,
    max_issues: int,
) -> Dict[str, object]:
    issue_signature_counts: Counter[str] = Counter()
    issue_signature_counts.update(base_result.get("issue_signature_counts", {}) or {})
    issue_signature_labels: Dict[str, Dict[str, str]] = dict(base_result.get("issue_signature_labels", {}) or {})
    issues: List[Dict[str, object]] = list(base_result.get("issues", []) or [])
    by_code: Counter[str] = Counter()

    for issue in pva_issues:
        by_code[issue.error_code] += 1
        signature = issue.signature()
        issue_signature_counts[signature] += 1
        if signature not in issue_signature_labels:
            issue_signature_labels[signature] = {
                "error_code": issue.error_code,
                "message": issue.message,
                "fix_hint": issue.fix_hint,
            }
        if len(issues) < max_issues:
            issues.append(
                {
                    "line_number": issue.line_number,
                    "record": issue.record,
                    "field": issue.field,
                    "value": issue.value,
                    "normalized_value": issue.value,
                    "domain": f"PVA::{issue.error_code}",
                    "error_code": issue.error_code,
                    "message": issue.message,
                    "fix_hint": issue.fix_hint,
                    "severity": "E",
                }
            )

    base_invalid = int(base_result.get("invalid_refs", 0) or 0)
    total_invalid = base_invalid + len(pva_issues)
    base_checks = int(base_result.get("total_checks", 0) or 0)
    total_checks = base_checks + int(extra_checks)

    merged = dict(base_result)
    merged.update(
        {
            "ok": total_invalid == 0,
            "total_checks": total_checks,
            "invalid_refs": total_invalid,
            "issue_signature_counts": dict(issue_signature_counts),
            "issue_signature_labels": issue_signature_labels,
            "issues": issues,
            "pva_like_summary": {
                "total_errors": len(pva_issues),
                "errors_by_code": dict(by_code),
            },
        }
    )
    return merged


def validate_sped_relationships_file(
    sped_path: Path,
    layouts_dir: Path,
    rules_path: Path,
    max_issues: int = 200,
    pva_like_mode: str = "auto",
    hierarchy_path: Optional[Path] = None,
) -> Dict[str, object]:
    lines = read_sped_lines(sped_path)
    return validate_sped_relationships_lines(
        lines=lines,
        layouts_dir=layouts_dir,
        rules_path=rules_path,
        max_issues=max_issues,
        pva_like_mode=pva_like_mode,
        hierarchy_path=hierarchy_path,
    )


def main() -> None:
    args = parse_args()
    sped_path = Path(args.sped_path)
    layouts_dir = Path(args.layouts_dir)
    rules_path = Path(args.rules_file)
    hierarchy_path = Path(args.hierarchy_file) if str(args.hierarchy_file or "").strip() else None

    if not layouts_dir.exists():
        raise SystemExit(f"Pasta de layouts nao encontrada: {layouts_dir}")
    if not rules_path.exists():
        raise SystemExit(f"Arquivo de regras nao encontrado: {rules_path}")

    result = validate_sped_relationships_file(
        sped_path=sped_path,
        layouts_dir=layouts_dir,
        rules_path=rules_path,
        max_issues=max(1, int(args.max_issues)),
        pva_like_mode=args.pva_like_mode,
        hierarchy_path=hierarchy_path,
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
    pva_summary = result.get("pva_like_summary")
    if isinstance(pva_summary, dict):
        by_code = pva_summary.get("errors_by_code", {})
        if isinstance(by_code, dict) and by_code:
            print("- Pendencias PVA-like por codigo:")
            for code, qty in sorted(by_code.items(), key=lambda item: (-int(item[1]), item[0])):
                print(f"  {code}: {qty}")

    if args.output_json:
        output_path = Path(args.output_json)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"- Relatorio JSON: {output_path}")

    if result["issues"]:
        print("\nPrimeiras inconsistencias:")
        for issue in result["issues"][:20]:
            code = str(issue.get("error_code", "")).strip()
            label = f" | {code}" if code else ""
            print(
                f"  linha {issue['line_number']} | {issue['record']}.{issue['field']} "
                f"=> '{issue['value']}' (dominio {issue['domain']}){label}"
            )
        raise SystemExit(4)

    print("\nOK: nenhuma referencia invalida encontrada.")


if __name__ == "__main__":
    main()
