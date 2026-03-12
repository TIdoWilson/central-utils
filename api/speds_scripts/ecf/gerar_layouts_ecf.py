from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parent
SOURCE_PDF = ROOT / "MANUAL ECF.pdf"
OUTPUT_DIR = ROOT / "layouts json"


@dataclass(frozen=True)
class RecordSpec:
    code: str
    start_page: int | None
    end_page: int | None


REQUESTED_RECORDS = [
    RecordSpec("0010", 46, 50),
    RecordSpec("0020", 51, 56),
    RecordSpec("J050", 80, 81),
    RecordSpec("K155", 87, 89),
    RecordSpec("K355", 91, 92),
    RecordSpec("L100", 96, 97),
    RecordSpec("L210", 98, 98),
    RecordSpec("L300", 99, 100),
    RecordSpec("M010", 103, 104),
    RecordSpec("M300", 105, 106),
    RecordSpec("M350", 110, 111),
    RecordSpec("M410", 115, 116),
    RecordSpec("M500", 117, 118),
    RecordSpec("M510", None, None),
    RecordSpec("N500", 121, 121),
    RecordSpec("N620", 125, 125),
    RecordSpec("N630", 126, 126),
    RecordSpec("N650", 127, 127),
    RecordSpec("N660", 128, 128),
    RecordSpec("N670", 129, 129),
    RecordSpec("Y570", 183, 183),
    RecordSpec("Y600", 186, 187),
    RecordSpec("Y720", None, None),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extrai layouts ECF do manual PDF e gera JSONs por registro."
    )
    parser.add_argument("--source-pdf", default=str(SOURCE_PDF), help="Manual ECF em PDF")
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR), help="Diretorio para arquivos JSON")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Permite sobrescrever arquivos JSON ja existentes no diretorio de saida.",
    )
    return parser.parse_args()


def source_reference(source_pdf: Path) -> str:
    try:
        return str(source_pdf.relative_to(ROOT))
    except ValueError:
        return str(source_pdf)


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\u200b", " ")
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_field_name(value: object) -> str | None:
    text = normalize_text(value)
    if not text:
        return None
    text = re.sub(r"\s+", "_", text)
    text = re.sub(r"_+", "_", text)
    text = re.sub(r"(?<=_)([A-Z])_([A-Z]{2,})(?=_|$)", r"\1\2", text)
    text = re.sub(r"[^A-Za-z0-9_]+", "_", text)
    text = re.sub(r"_+", "_", text)
    text = text.strip("_").upper()
    text = re.sub(r"^([A-Z])\1+", r"\1", text)
    return text or None


def normalize_values(value: object) -> str | None:
    text = normalize_text(value)
    return text or None


def to_int_if_numeric(value: str | None) -> int | None:
    if value is None:
        return None
    if value.isdigit():
        return int(value)
    return None


def block_of(record_code: str) -> str:
    return "0" if record_code[0].isdigit() else record_code[0]


def merge_rows(base: list[object], extra: list[object]) -> list[object]:
    size = max(len(base), len(extra))
    merged: list[object] = []
    for idx in range(size):
        left = "" if idx >= len(base) or base[idx] is None else str(base[idx])
        right = "" if idx >= len(extra) or extra[idx] is None else str(extra[idx])
        if left and right:
            merged.append(f"{left}\n{right}")
        else:
            merged.append(left or right)
    return merged


def extract_record_intro(text: str, record_code: str) -> tuple[str | None, str | None]:
    header = re.search(
        rf"Seção\s+[^\n]*Registro\s+{record_code}:\s*(.+)",
        text,
        re.IGNORECASE,
    )
    if not header:
        return None, None
    title = normalize_text(header.group(1)) or None
    tail = text[header.end() :]
    marker = re.search(rf"\n\s*REGISTRO\s+{record_code}:", tail, re.IGNORECASE)
    summary = normalize_text(tail[: marker.start()]) if marker else None
    return title, summary


def has_validation_header(table: list[list[object]]) -> bool:
    header = " ".join(normalize_text(cell) for row in table[:2] for cell in row if cell)
    return "Regras de Validação do Campo" in header or "Regras de validação do campo" in header


def has_record_header(table: list[list[object]]) -> bool:
    header = " ".join(normalize_text(cell) for row in table[:2] for cell in row if cell)
    return "REGISTRO " in header


def is_field_table(table: list[list[object]]) -> bool:
    if not table or has_validation_header(table):
        return False
    if any(normalize_text(row[0]).isdigit() for row in table if row):
        return True
    header = " ".join(normalize_text(cell) for row in table[:2] for cell in row if cell)
    return "Nº" in header and "Campo" in header and "Descrição" in header


def parse_field_row(row: list[object]) -> dict[str, object] | None:
    cells = [normalize_text(cell) for cell in row]
    pos = cells[0] if cells else ""
    if not pos.isdigit():
        return None

    mandatory_idx = max((idx for idx, cell in enumerate(cells) if cell), default=0)
    mandatory = cells[mandatory_idx] if mandatory_idx else ""

    type_idx = None
    for idx in range(4, len(cells)):
        if cells[idx] in {"C", "N", "NS"}:
            type_idx = idx
            break
    if type_idx is None:
        return None

    description = " ".join(cell for cell in cells[3:type_idx] if cell) or None
    tail = [cell for cell in cells[type_idx + 1 : mandatory_idx] if cell]
    tamanho_raw = tail[0] if len(tail) > 0 else None
    decimal_raw = tail[1] if len(tail) > 1 else None
    values = tail[2] if len(tail) > 2 else None

    return {
        "pos": int(pos),
        "nome": normalize_field_name(cells[1] if len(cells) > 1 else None),
        "rotulo": normalize_values(cells[2] if len(cells) > 2 else None),
        "descricao": description,
        "tipo": cells[type_idx] or None,
        "tamanho": tamanho_raw,
        "tamanho_int": to_int_if_numeric(tamanho_raw),
        "decimais": decimal_raw,
        "decimais_int": to_int_if_numeric(decimal_raw),
        "valores_validos": values or None,
        "obrigatorio": mandatory == "Sim",
        "obrigatorio_raw": mandatory or None,
    }


def extract_record(
    pdf: pdfplumber.PDF,
    spec: RecordSpec,
    full_text: str,
    source_pdf: Path,
) -> dict[str, object]:
    if spec.start_page is None or spec.end_page is None:
        exists_in_manual = spec.code in full_text
        return {
            "sped": "ECF",
            "registro": spec.code,
            "bloco": block_of(spec.code),
            "status": "nao_localizado_no_manual",
            "motivo": (
                "O registro nao aparece como secao do manual local e nao foi localizado no texto pesquisavel do PDF."
                if not exists_in_manual
                else "O codigo aparece no PDF apenas como referencia secundaria, sem layout proprio identificado."
            ),
            "fonte": {
                "arquivo": source_reference(source_pdf),
                "manual": source_pdf.name,
                "paginas": None,
            },
            "campos": [],
            "notas_extracao": [],
        }

    page_texts = []
    field_rows: list[list[object]] = []
    current_field: list[object] | None = None
    validation_rules: list[str] = []
    level = None
    occurrence = None
    key_fields = None
    started = False
    finished = False

    for page_number in range(spec.start_page, spec.end_page + 1):
        if finished:
            break
        page = pdf.pages[page_number - 1]
        page_text = page.extract_text() or ""
        page_texts.append(page_text)

        for table in page.extract_tables():
            if not table:
                continue

            joined = " ".join(normalize_text(cell) for row in table for cell in row if cell)

            if has_record_header(table):
                if f"REGISTRO {spec.code}:" in joined:
                    started = True
                    for row in table:
                        row_text = " ".join(normalize_text(cell) for cell in row if cell)
                        if not row_text:
                            continue
                        if row_text == "Regras de Validação do Registro":
                            continue
                        if row_text.startswith("REGISTRO "):
                            continue
                        if "Nível Hierárquico" in row_text:
                            level_match = re.search(r"Nível Hierárquico\s*[–-]\s*([0-9A-Z:]+)", row_text)
                            occurrence_match = re.search(r"Ocorrência\s*[–-]\s*([0-9A-Z:]+)", row_text)
                            if level_match:
                                level = level_match.group(1)
                            if occurrence_match:
                                occurrence = occurrence_match.group(1)
                            continue
                        if "Campo(s) chave:" in row_text:
                            key_fields = normalize_text(row_text.split(":", 1)[1])
                            continue
                        validation_rules.append(row_text)
                    continue

                if started:
                    finished = True
                    break

            if not started:
                continue

            if not is_field_table(table) or has_validation_header(table):
                continue

            for row in table:
                pos = normalize_text(row[0]) if row else ""
                if pos.isdigit():
                    if current_field is not None:
                        field_rows.append(current_field)
                    current_field = list(row)
                    continue

                if current_field is None:
                    continue

                row_text = " ".join(normalize_text(cell) for cell in row if cell)
                if not row_text:
                    continue
                if "Nº" in row_text and "Campo" in row_text:
                    continue
                if "Válidos" == row_text or "válidos" == row_text:
                    continue
                if has_record_header([row]):
                    continue
                current_field = merge_rows(current_field, row)

    if current_field is not None:
        field_rows.append(current_field)

    fields = [field for row in field_rows if (field := parse_field_row(row))]

    section_text = "\n".join(page_texts)
    title, description = extract_record_intro(section_text, spec.code)

    notes: list[str] = []
    if not fields:
        notes.append("Nenhum campo foi extraido automaticamente para esta secao; revisar o manual se necessario.")
    else:
        first_field = fields[0]
        constant = first_field.get("valores_validos")
        if first_field.get("nome") == "REG" and constant and spec.code not in constant:
            notes.append(
                f"O campo REG extraido na secao {spec.code} referencia {constant}, o que indica inconsistencia no manual."
            )
        positions = [field["pos"] for field in fields]
        expected_positions = list(range(min(positions), max(positions) + 1))
        if positions != expected_positions:
            missing = [str(pos) for pos in expected_positions if pos not in positions]
            if missing:
                notes.append(
                    "A numeracao dos campos no manual apresenta salto(s): "
                    + ", ".join(missing)
                    + "."
                )

    if spec.code == "L210":
        notes.append("O sumario do manual apresenta referencia inconsistente para este registro; a secao detalhada esta em 'Registro L210'.")
    if spec.code == "N630":
        notes.append("Na tabela extraida, o campo REG aparece com referencia a N620, possivel erro material do manual.")

    return {
        "sped": "ECF",
        "registro": spec.code,
        "bloco": block_of(spec.code),
        "status": "ok",
        "titulo": title,
        "descricao_registro": description,
        "nivel_hierarquico": level,
        "ocorrencia": occurrence,
        "campos_chave": [part.strip() for part in (key_fields or "").split("+") if part.strip()],
        "regras_validacao_registro": validation_rules,
        "fonte": {
            "arquivo": source_reference(source_pdf),
            "manual": source_pdf.name,
            "paginas": {
                "inicio": spec.start_page,
                "fim": spec.end_page,
            },
        },
        "campos": fields,
        "notas_extracao": notes,
    }


def main() -> None:
    args = parse_args()
    source_pdf = Path(args.source_pdf)
    output_dir = Path(args.output_dir)

    if not source_pdf.exists() or not source_pdf.is_file():
        raise SystemExit(f"Manual PDF nao encontrado: {source_pdf}")

    output_dir.mkdir(parents=True, exist_ok=True)
    if not args.overwrite:
        existing_json = [p for p in output_dir.glob("*.json")]
        if existing_json:
            raise SystemExit(
                "Diretorio de saida ja possui JSONs. Use --overwrite para sobrescrever."
            )

    with pdfplumber.open(source_pdf) as pdf:
        full_text = "\n".join((page.extract_text() or "") for page in pdf.pages)
        records_payload: list[dict[str, object]] = []

        for spec in REQUESTED_RECORDS:
            payload = extract_record(pdf, spec, full_text, source_pdf)
            records_payload.append(payload)
            output_path = output_dir / f"{spec.code}.json"
            output_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    index_payload = {
        "sped": "ECF",
        "manual": {
            "arquivo": source_reference(source_pdf),
            "nome": source_pdf.name,
            "atualizacao": "Dezembro de 2013",
        },
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "descricao": "Sumário dos layouts em JSON gerados a partir do manual local da ECF.",
        "registros": [
            {
                "registro": payload["registro"],
                "bloco": payload["bloco"],
                "status": payload["status"],
                "titulo": payload.get("titulo"),
                "descricao_resumida": payload.get("descricao_registro"),
                "ocorrencia": payload.get("ocorrencia"),
                "campos_chave": payload.get("campos_chave"),
                "quantidade_campos": len(payload.get("campos", [])),
                "arquivo": f"{payload['registro']}.json",
                "paginas": payload.get("fonte", {}).get("paginas"),
                "notas": payload.get("notas_extracao", []),
            }
            for payload in records_payload
        ],
    }

    (output_dir / "index.json").write_text(
        json.dumps(index_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
