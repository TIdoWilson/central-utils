from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, List
import json
import re

DEFAULT_LAYOUT_PATH = Path(__file__).resolve().parent / "layouts" / "giast-layout.json"
A0_MIN_VALID_LENGTH = 865
A0_WITH_EC87_VALID_LENGTH = 1031


def load_giast_layout(layout_path: Path | None = None) -> Dict[str, Any]:
    path = layout_path or DEFAULT_LAYOUT_PATH
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def _field_len(field_def: Dict[str, Any], fallback: int) -> int:
    return int(field_def.get("tamanho", fallback))


def _fmt_alpha(value: Any, size: int) -> str:
    text = str(value or "")
    if len(text) > size:
        return text[:size]
    return text.ljust(size, " ")


def _fmt_numeric(value: Any, size: int) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) > size:
        digits = digits[-size:]
    return digits.zfill(size)


def _fmt_yes_no(value: Any) -> str:
    raw = str(value or "").strip().upper()
    return "S" if raw == "S" else "N"


def _parse_iso_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "00000000"

    try:
        if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
            dt = datetime.strptime(raw, "%Y-%m-%d")
            return dt.strftime("%Y%m%d")
        if re.match(r"^\d{2}/\d{2}/\d{4}$", raw):
            dt = datetime.strptime(raw, "%d/%m/%Y")
            return dt.strftime("%Y%m%d")
        if re.match(r"^\d{8}$", raw):
            dt = datetime.strptime(raw, "%Y%m%d")
            return dt.strftime("%Y%m%d")
    except ValueError:
        return "00000000"

    return "00000000"


def _fmt_money(value: Any, size: int) -> str:
    if value is None:
        return "0" * size

    try:
        if isinstance(value, str):
            normalized = value.strip().replace(" ", "")
            if "," in normalized and "." in normalized:
                normalized = normalized.replace(".", "").replace(",", ".")
            elif "," in normalized:
                normalized = normalized.replace(",", ".")
            dec = Decimal(normalized)
        else:
            dec = Decimal(str(value))
    except (InvalidOperation, ValueError):
        dec = Decimal("0")

    if dec < 0:
        dec = Decimal("0")

    cents = (dec * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return _fmt_numeric(str(int(cents)), size)


def _fit_line_size(text: str, target_size: int) -> str:
    if target_size <= 0:
        return text
    if len(text) >= target_size:
        return text[:target_size]
    return text.ljust(target_size, " ")


def _as_decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    try:
        if isinstance(value, str):
            normalized = value.strip().replace(" ", "")
            if "," in normalized and "." in normalized:
                normalized = normalized.replace(".", "").replace(",", ".")
            elif "," in normalized:
                normalized = normalized.replace(",", ".")
            return Decimal(normalized)
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _normalize_period_ref(period_ref: Any) -> str:
    digits = re.sub(r"\D", "", str(period_ref or ""))
    if len(digits) != 6:
        raise ValueError("Periodo de referencia invalido. Use MMAAAA.")

    month = int(digits[:2])
    year = int(digits[2:])
    if month < 1 or month > 12:
        raise ValueError("Periodo de referencia invalido. Mes fora do intervalo.")
    if year < 2000 or year > 2199:
        raise ValueError("Periodo de referencia invalido. Ano fora do intervalo.")

    return digits


def _build_a0_line(a0_def: Dict[str, Any], declarant: Dict[str, Any], entry: Dict[str, Any], period_ref: str) -> str:
    parts: List[str] = []

    ie = str(entry.get("stateRegistration") or "")
    uf = str(entry.get("uf") or "").strip().upper()[:2]

    parts.append(_fmt_alpha(a0_def["id_registro"].get("valor", "A0"), _field_len(a0_def["id_registro"], 2)))
    parts.append(_fmt_alpha(a0_def["fixo"].get("valor", "GST"), _field_len(a0_def["fixo"], 3)))
    parts.append(_fmt_alpha(a0_def["versao"].get("valor", "03"), _field_len(a0_def["versao"], 2)))
    parts.append(_fmt_numeric(period_ref, _field_len(a0_def["periodo_referencia"], 6)))
    parts.append(_fmt_alpha(ie, _field_len(a0_def["inscricao_estadual"], 14)))
    parts.append(_fmt_yes_no("S"))
    parts.append(_fmt_yes_no("N"))

    for venc in a0_def.get("vencimentos_icms_st", []):
        parts.append(_parse_iso_date(""))
        value_def = venc.get("valor", {})
        parts.append(_fmt_numeric("0", _field_len(value_def, 15)))

    parts.append(_fmt_alpha(uf, _field_len(a0_def["uf_favorecida"], 2)))

    for _, val_def in a0_def.get("valores", {}).items():
        parts.append(_fmt_numeric("0", _field_len(val_def, 15)))

    decl = a0_def.get("declarante", {})
    phone = decl.get("telefone", {})
    fax = decl.get("fax", {})

    parts.append(_fmt_numeric(declarant.get("cnpj"), _field_len(decl.get("cnpj", {}), 14)))
    parts.append(_fmt_alpha(declarant.get("name"), _field_len(decl.get("nome", {}), 46)))
    parts.append(_fmt_numeric(declarant.get("cpf"), _field_len(decl.get("cpf", {}), 11)))
    parts.append(_fmt_alpha(declarant.get("role"), _field_len(decl.get("cargo", {}), 30)))
    parts.append(_fmt_numeric(declarant.get("phoneDdd"), _field_len(phone.get("ddd", {}), 4)))
    parts.append(_fmt_numeric(declarant.get("phoneNumber"), _field_len(phone.get("numero", {}), 9)))
    parts.append(_fmt_numeric(declarant.get("faxDdd"), _field_len(fax.get("ddd", {}), 4)))
    parts.append(_fmt_numeric(declarant.get("faxNumber"), _field_len(fax.get("numero", {}), 9)))
    parts.append(_fmt_alpha(declarant.get("email"), _field_len(decl.get("email", {}), 80)))
    parts.append(_fmt_alpha(declarant.get("location"), _field_len(decl.get("local", {}), 30)))
    parts.append(_parse_iso_date(declarant.get("signatureDate")))

    for info_def in a0_def.get("informacoes_complementares", []):
        parts.append(_fmt_alpha("", int(info_def.get("tamanho", 60))))

    parts.append(_fmt_yes_no("N"))
    parts.append(_fmt_yes_no("N"))

    reserved_delivery = a0_def.get("codigo_entrega_reservado", {})
    parts.append(_fmt_alpha("", _field_len(reserved_delivery, 6)))

    counters = a0_def.get("contadores_anexos", {})
    total_a1_def = counters.get("total_linhas_anexo_I", counters.get("total_anexo_I", {}))
    total_a2_def = counters.get("total_linhas_anexo_II", counters.get("total_anexo_II", {}))
    total_a3_def = counters.get("total_linhas_anexo_III", counters.get("total_anexo_III", {}))

    # Nesta implementacao geramos apenas A0 e A4.
    parts.append(_fmt_numeric("0", _field_len(total_a1_def, 6)))
    parts.append(_fmt_numeric("0", _field_len(total_a2_def, 6)))
    parts.append(_fmt_numeric("0", _field_len(total_a3_def, 6)))

    repasse_others_def = a0_def.get("repasse_outros_contribuintes", {})
    parts.append(_fmt_numeric("0", _field_len(repasse_others_def, 15)))

    ec87_def = a0_def.get("ec_87_15_registro_principal", {})
    has_ec87_def = isinstance(ec87_def, dict) and bool(ec87_def)

    value_icms_destino = _as_decimal(entry.get("valueIcms"))
    value_fcp_total = _as_decimal(entry.get("valueFcp"))
    value_devolutions = _as_decimal(
        entry.get("valueDevolutions")
        or entry.get("valueDevolution")
        or entry.get("devolucoesAnulacoes")
        or entry.get("valorDevolucoes")
    )
    value_prepayments = _as_decimal(
        entry.get("valuePrepayments")
        or entry.get("pagamentosAntecipados")
        or entry.get("valorPagamentosAntecipados")
    )
    if value_icms_destino < 0:
        value_icms_destino = Decimal("0")
    if value_fcp_total < 0:
        value_fcp_total = Decimal("0")
    if value_devolutions < 0:
        value_devolutions = Decimal("0")
    if value_prepayments < 0:
        value_prepayments = Decimal("0")

    if has_ec87_def:
        has_ec87_movement = (
            value_icms_destino > 0
            or value_fcp_total > 0
            or value_devolutions > 0
            or value_prepayments > 0
        )
        parts.append(_fmt_yes_no("S" if has_ec87_movement else "N"))

        # Manual v3.1: bloco EC 87/15 no A0 totaliza valores do anexo A4.
        # Mantemos vencimentos 2..6 zerados e concentramos o FCP no 1o vencimento.
        fcp_venc_1_def = ec87_def.get("fcp_vencimento_1", {})
        parts.append(_fmt_money(value_fcp_total, _field_len(fcp_venc_1_def, 15)))
        for idx in range(2, 7):
            fcp_venc_def = ec87_def.get(f"fcp_vencimento_{idx}", {})
            parts.append(_fmt_money(Decimal("0"), _field_len(fcp_venc_def, 15)))

        # Regra de validacao do importador GIA-ST 3:
        # "Total do ICMS Devido a UF de Destino" no A0 deve bater com a soma
        # dos valores de ICMS dos registros A4.
        total_icms_destino = value_icms_destino

        parts.append(_fmt_money(value_icms_destino, _field_len(ec87_def.get("icms_destino", {}), 15)))
        parts.append(_fmt_money(value_devolutions, _field_len(ec87_def.get("devolucoes_anulacoes", {}), 15)))
        parts.append(_fmt_money(value_prepayments, _field_len(ec87_def.get("pagamentos_antecipados_destino", {}), 15)))
        parts.append(_fmt_money(total_icms_destino, _field_len(ec87_def.get("total_icms_destino", {}), 15)))
        parts.append(_fmt_money(value_fcp_total, _field_len(ec87_def.get("total_icms_fcp", {}), 15)))

    line = "".join(parts)

    # Manual v3.1: A0 com 865 sem EC 87/15, ou 1031 quando EC 87/15 presente.
    default_target_len = A0_WITH_EC87_VALID_LENGTH if has_ec87_def else A0_MIN_VALID_LENGTH
    target_len = int(a0_def.get("tamanho_total", default_target_len))
    if target_len < A0_MIN_VALID_LENGTH:
        target_len = A0_MIN_VALID_LENGTH
    if has_ec87_def and target_len < A0_WITH_EC87_VALID_LENGTH:
        target_len = A0_WITH_EC87_VALID_LENGTH

    return _fit_line_size(line, target_len)


def _build_a1_line(a1_def: Dict[str, Any], ie: str) -> str:
    return "".join([
        _fmt_alpha(a1_def.get("id_registro", "A1"), 2),
        _fmt_numeric("0", _field_len(a1_def.get("numero_nota_fiscal", {}), 13)),
        _fmt_alpha("", _field_len(a1_def.get("serie_nota_fiscal", {}), 3)),
        _fmt_alpha(ie, _field_len(a1_def.get("inscricao_estadual", {}), 14)),
        _parse_iso_date(""),
        _fmt_numeric("0", _field_len(a1_def.get("valor_icms_st_devolucao", {}), 15)),
    ])


def _build_a2_line(a2_def: Dict[str, Any], ie: str) -> str:
    return "".join([
        _fmt_alpha(a2_def.get("id_registro", "A2"), 2),
        _fmt_numeric("0", _field_len(a2_def.get("numero_nota_fiscal", {}), 13)),
        _fmt_alpha("", _field_len(a2_def.get("serie_nota_fiscal", {}), 3)),
        _fmt_alpha(ie, _field_len(a2_def.get("inscricao_estadual", {}), 14)),
        _parse_iso_date(""),
        _fmt_numeric("0", _field_len(a2_def.get("valor_icms_st_ressarcimento", {}), 15)),
    ])


def _build_a3_line(a3_def: Dict[str, Any], ie: str) -> str:
    return "".join([
        _fmt_alpha(a3_def.get("id_registro", "A3"), 2),
        _fmt_alpha(ie, _field_len(a3_def.get("inscricao_estadual", {}), 14)),
        _fmt_numeric("0", _field_len(a3_def.get("base_calculo", {}), 15)),
        _fmt_numeric("0", _field_len(a3_def.get("valor_icms_destacado", {}), 15)),
    ])


def _build_a4_line(a4_def: Dict[str, Any], entry: Dict[str, Any]) -> str:
    due_icms = entry.get("dueDateIcms") or entry.get("dueDate")
    due_fcp = entry.get("dueDateFcp") or entry.get("dueDate")

    return "".join([
        _fmt_alpha(a4_def.get("id_registro", "A4"), 2),
        _parse_iso_date(due_icms),
        _fmt_money(entry.get("valueIcms"), _field_len(a4_def.get("valor_icms", {}), 15)),
        _parse_iso_date(due_fcp),
        _fmt_money(entry.get("valueFcp"), _field_len(a4_def.get("valor_icms_fcp", {}), 15)),
    ])


def gerar_giast_txt(payload: Dict[str, Any], layout: Dict[str, Any] | None = None) -> Dict[str, Any]:
    data = layout or load_giast_layout()
    giast = data.get("GIA_ST") or {}

    a0_def = giast.get("registro_principal_A0")
    a4_def = giast.get("registro_anexo_EC_87_15_A4")

    if not all([a0_def, a4_def]):
        raise ValueError("Layout GIAST incompleto no arquivo JSON.")

    period_ref = _normalize_period_ref(payload.get("periodRef"))
    declarant = dict(payload.get("declarant") or {})
    entries = list(payload.get("entries") or [])

    if not entries:
        raise ValueError("Inclua ao menos uma UF para gerar o arquivo.")

    cnpj = _fmt_numeric(declarant.get("cnpj"), 14)
    state_regs = declarant.get("stateRegistrations") or {}

    lines: List[str] = []
    for entry in entries:
        uf = str(entry.get("uf") or "").strip().upper()
        if not re.match(r"^[A-Z]{2}$", uf):
            raise ValueError("UF invalida no payload de geracao.")

        ie = str(entry.get("stateRegistration") or state_regs.get(uf) or "")
        block_entry = {
            **entry,
            "uf": uf,
            "stateRegistration": ie,
        }

        lines.append(_build_a0_line(a0_def, declarant, block_entry, period_ref))
        lines.append(_build_a4_line(a4_def, block_entry))

    text = "\r\n".join(lines) + "\r\n"
    file_name = payload.get("fileName") or f"GIAST_{cnpj}_{period_ref}.txt"

    return {
        "file_name": file_name,
        "text": text,
        "line_count": len(lines),
        "block_count": len(entries),
    }
