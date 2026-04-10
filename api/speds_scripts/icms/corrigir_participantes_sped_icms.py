#!/usr/bin/env python3
"""
Corrige cadastros de participantes do SPED ICMS/IPI a partir de XMLs NF-e.

Fluxo:
1. O usuario seleciona o arquivo SPED a corrigir.
2. O usuario seleciona um .zip ou .rar com XMLs.
3. O script valida se o CNPJ emissor do XML bate com o CNPJ do SPED.
4. Para cada participante 0150 com CPF/CNPJ, busca a nota emitida para ele
   e preenche apenas os campos de endereco vazios com os dados do XML:
   COD_MUN, END, NUM, COMPL e BAIRRO.

Observacao importante:
- O campo cMun do XML da NF-e e o COD_MUN do registro 0150 usam a tabela IBGE.
  O script copia o codigo exatamente como esta no XML, sem conversao.
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable
import xml.etree.ElementTree as ET

from tkinter import Tk, filedialog, messagebox

try:
    import rarfile  # type: ignore
except Exception:  # noqa: BLE001
    rarfile = None


BASE_DIR = Path(__file__).resolve().parent
ICMS_DIR = BASE_DIR / "icms"
NFE_NS = {"nfe": "http://www.portalfiscal.inf.br/nfe"}

DEFAULT_LAYOUT_0000 = [
    "REG",
    "COD_VER",
    "COD_FIN",
    "DT_INI",
    "DT_FIN",
    "NOME",
    "CNPJ",
    "CPF",
    "UF",
    "IE",
    "COD_MUN",
    "IM",
    "SUFRAMA",
    "IND_PERFIL",
    "IND_ATIV",
]

DEFAULT_LAYOUT_0150 = [
    "REG",
    "COD_PART",
    "NOME",
    "COD_PAIS",
    "CNPJ",
    "CPF",
    "IE",
    "COD_MUN",
    "SUFRAMA",
    "END",
    "NUM",
    "COMPL",
    "BAIRRO",
]


@dataclass
class ParticipantAddress:
    cod_mun: str = ""
    end: str = ""
    num: str = ""
    compl: str = ""
    bairro: str = ""
    xml_name: str = ""
    note_key: str = ""
    note_dt: datetime | None = None

    def score(self) -> int:
        return sum(
            1
            for value in (self.cod_mun, self.end, self.num, self.compl, self.bairro)
            if is_present(value)
        )


@dataclass
class XmlParseSummary:
    total: int = 0
    matched_company: int = 0
    skipped_not_xml: int = 0
    skipped_cnpj: int = 0
    skipped_missing_dest: int = 0
    skipped_missing_doc: int = 0
    parse_errors: int = 0


def load_layout_field_names(layout_file: str, fallback: list[str]) -> list[str]:
    path = ICMS_DIR / layout_file
    if not path.exists():
        return fallback
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return [campo["campo"] for campo in data["campos"]]
    except Exception:  # noqa: BLE001
        return fallback


LAYOUT_0000 = load_layout_field_names("0000.json", DEFAULT_LAYOUT_0000)
LAYOUT_0150 = load_layout_field_names("0150.json", DEFAULT_LAYOUT_0150)

INDEX_0000 = {name: idx + 1 for idx, name in enumerate(LAYOUT_0000)}
INDEX_0150 = {name: idx + 1 for idx, name in enumerate(LAYOUT_0150)}


def normalize_digits(value: str | None) -> str:
    if not value:
        return ""
    return "".join(ch for ch in value if ch.isdigit())


def is_present(value: str | None) -> bool:
    if value is None:
        return False
    text = str(value).strip()
    if not text:
        return False
    if text in {"-", "--", "N/A"}:
        return False
    return True


def is_missing(value: str | None, *, treat_zero_as_missing: bool = False) -> bool:
    if value is None:
        return True
    text = str(value).strip()
    if not text:
        return True
    if text in {"-", "--", "N/A"}:
        return True
    if treat_zero_as_missing and set(text) <= {"0"}:
        return True
    return False


def guess_encoding(path: Path) -> tuple[str, str]:
    candidates = ("utf-8-sig", "utf-8", "cp1252", "latin-1")
    last_error: Exception | None = None
    for encoding in candidates:
        try:
            text = path.read_text(encoding=encoding)
            return text, encoding
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    raise last_error or UnicodeError(f"Nao foi possivel ler o arquivo: {path}")


def choose_file_dialog(title: str, filetypes: list[tuple[str, str]]) -> Path | None:
    root = Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    selected = filedialog.askopenfilename(title=title, filetypes=filetypes)
    root.destroy()
    if not selected:
        return None
    return Path(selected)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Corrige o cadastro de participantes do SPED ICMS/IPI usando XMLs NF-e."
    )
    parser.add_argument("--sped", help="Caminho do arquivo SPED para corrigir.")
    parser.add_argument(
        "--xml-archive",
        help="Caminho do .zip ou .rar com os XMLs da empresa.",
    )
    parser.add_argument(
        "--output",
        help="Caminho do arquivo de saida. Se omitido, cria um _corrigido ao lado do SPED.",
    )
    return parser.parse_args()


def get_sped_company_doc(lines: list[str]) -> tuple[str, str]:
    for line in lines:
        line = line.lstrip("\ufeff")
        if not line.startswith("|0000|"):
            continue
        parts = split_sped_line(line)
        cnpj = normalize_digits(get_field(parts, INDEX_0000["CNPJ"]))
        cpf = normalize_digits(get_field(parts, INDEX_0000["CPF"]))
        return cnpj, cpf
    raise ValueError("Nao foi encontrado o registro 0000 no SPED.")


def split_sped_line(line: str) -> list[str]:
    return line.lstrip("\ufeff").rstrip("\r\n").split("|")


def get_field(parts: list[str], index: int) -> str:
    if index >= len(parts):
        return ""
    return parts[index]


def set_field(parts: list[str], index: int, value: str) -> None:
    while len(parts) <= index:
        parts.append("")
    parts[index] = value


def format_sped_line(parts: list[str]) -> str:
    return "|".join(parts)


def parse_dt_emi(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def parse_xml_document(xml_bytes: bytes, xml_name: str) -> dict[str, str] | None:
    root = ET.fromstring(xml_bytes)
    inf_nfe = root.find(".//nfe:infNFe", NFE_NS)
    if inf_nfe is None:
        return None

    emit = inf_nfe.find("nfe:emit", NFE_NS)
    dest = inf_nfe.find("nfe:dest", NFE_NS)
    ender_dest = dest.find("nfe:enderDest", NFE_NS) if dest is not None else None

    emit_cnpj = normalize_digits(_find_text(emit, "nfe:CNPJ"))
    dest_cnpj = normalize_digits(_find_text(dest, "nfe:CNPJ"))
    dest_cpf = normalize_digits(_find_text(dest, "nfe:CPF"))
    dest_doc = dest_cnpj or dest_cpf

    if not dest_doc:
        return None

    return {
        "xml_name": xml_name,
        "emit_cnpj": emit_cnpj,
        "dest_doc": dest_doc,
        "note_key": _find_text(inf_nfe, "nfe:ide/nfe:nNF"),
        "note_dt": _find_text(inf_nfe, "nfe:ide/nfe:dhEmi"),
        "cod_mun": _find_text(ender_dest, "nfe:cMun"),
        "end": _find_text(ender_dest, "nfe:xLgr"),
        "num": _find_text(ender_dest, "nfe:nro"),
        "compl": _find_text(ender_dest, "nfe:xCpl"),
        "bairro": _find_text(ender_dest, "nfe:xBairro"),
    }


def _find_text(node: ET.Element | None, xpath: str) -> str:
    if node is None:
        return ""
    found = node.find(xpath, NFE_NS)
    if found is None or found.text is None:
        return ""
    return found.text.strip()


def iter_xml_entries(archive_path: Path) -> Iterable[tuple[str, bytes]]:
    suffix = archive_path.suffix.lower()
    if suffix == ".zip":
        with zipfile.ZipFile(archive_path) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                if not info.filename.lower().endswith(".xml"):
                    continue
                yield info.filename, zf.read(info)
        return

    if suffix == ".rar":
        if rarfile is None:
            raise RuntimeError(
                "O pacote rarfile nao esta disponivel neste ambiente, entao nao foi possivel ler .rar."
            )
        try:
            with rarfile.RarFile(archive_path) as rf:  # type: ignore[attr-defined]
                for info in rf.infolist():
                    if info.isdir():
                        continue
                    if not info.filename.lower().endswith(".xml"):
                        continue
                    yield info.filename, rf.read(info)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "Nao consegui abrir o .rar. Se o arquivo exigir um backend externo, "
                "instale o 7-Zip/WinRAR ou converta o pacote para .zip."
            ) from exc
        return

    raise ValueError("O arquivo de XMLs precisa ser .zip ou .rar.")


def build_address_index(
    archive_path: Path,
    company_cnpj: str,
) -> tuple[dict[str, ParticipantAddress], XmlParseSummary]:
    candidates: dict[str, ParticipantAddress] = {}
    summary = XmlParseSummary()

    for xml_name, xml_bytes in iter_xml_entries(archive_path):
        summary.total += 1
        if not xml_name.lower().endswith(".xml"):
            summary.skipped_not_xml += 1
            continue

        try:
            data = parse_xml_document(xml_bytes, xml_name)
        except Exception:  # noqa: BLE001
            summary.parse_errors += 1
            continue

        if not data:
            summary.skipped_missing_dest += 1
            continue

        if company_cnpj and data["emit_cnpj"] and data["emit_cnpj"] != company_cnpj:
            summary.skipped_cnpj += 1
            continue

        summary.matched_company += 1

        dest_doc = data["dest_doc"]
        address = ParticipantAddress(
            cod_mun=data["cod_mun"],
            end=data["end"],
            num=data["num"],
            compl=data["compl"],
            bairro=data["bairro"],
            xml_name=data["xml_name"],
            note_key=data["note_key"],
            note_dt=parse_dt_emi(data["note_dt"]),
        )

        if not is_present(dest_doc):
            summary.skipped_missing_doc += 1
            continue

        if address.score() == 0:
            continue

        current = candidates.get(dest_doc)
        if current is None or address.score() > current.score():
            candidates[dest_doc] = address
            continue

        if address.score() == current.score():
            if current.note_dt is None and address.note_dt is not None:
                candidates[dest_doc] = address
                continue
            if current.note_dt and address.note_dt and address.note_dt > current.note_dt:
                candidates[dest_doc] = address

    return candidates, summary


def update_sped_text(sped_text: str, candidates: dict[str, ParticipantAddress]) -> tuple[str, dict[str, int]]:
    lines = sped_text.splitlines()
    newline = "\r\n" if "\r\n" in sped_text else "\n"

    updated_lines = 0
    updated_participants = 0
    skipped_without_doc = 0
    matched_participants = 0

    for idx, line in enumerate(lines):
        if not line.startswith("|0150|"):
            continue

        parts = split_sped_line(line)
        cpf = normalize_digits(get_field(parts, INDEX_0150["CPF"]))
        cnpj = normalize_digits(get_field(parts, INDEX_0150["CNPJ"]))
        doc = cnpj or cpf

        if not doc:
            skipped_without_doc += 1
            continue

        matched_participants += 1
        candidate = candidates.get(doc)
        if candidate is None:
            continue

        changed = False
        changed |= fill_if_missing(parts, INDEX_0150["COD_MUN"], candidate.cod_mun, treat_zero_as_missing=True)
        changed |= fill_if_missing(parts, INDEX_0150["END"], candidate.end)
        changed |= fill_if_missing(parts, INDEX_0150["NUM"], candidate.num)
        changed |= fill_if_missing(parts, INDEX_0150["COMPL"], candidate.compl)
        changed |= fill_if_missing(parts, INDEX_0150["BAIRRO"], candidate.bairro)

        if changed:
            lines[idx] = format_sped_line(parts)
            updated_lines += 1
            updated_participants += 1

    result = newline.join(lines)
    if sped_text.endswith(("\r\n", "\n", "\r")):
        result += newline

    stats = {
        "updated_lines": updated_lines,
        "updated_participants": updated_participants,
        "matched_participants": matched_participants,
        "skipped_without_doc": skipped_without_doc,
    }
    return result, stats


def fill_if_missing(
    parts: list[str],
    index: int,
    value: str,
    *,
    treat_zero_as_missing: bool = False,
) -> bool:
    if not is_present(value):
        return False

    current = get_field(parts, index)
    if not is_missing(current, treat_zero_as_missing=treat_zero_as_missing):
        return False

    set_field(parts, index, value)
    return True


def build_output_path(sped_path: Path, output_arg: str | None) -> Path:
    if output_arg:
        out = Path(output_arg)
        if out.suffix.lower() not in {".txt", ".sped"}:
            out = out.with_suffix(".txt")
        return out
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return sped_path.with_name(f"{sped_path.stem}_corrigido_{timestamp}{sped_path.suffix}")


def run(sped_path: Path, archive_path: Path, output_path: Path) -> int:
    sped_text, encoding = guess_encoding(sped_path)
    sped_text = sped_text.lstrip("\ufeff")
    sped_lines = sped_text.splitlines()
    company_cnpj, company_cpf = get_sped_company_doc(sped_lines)
    company_doc = company_cnpj or company_cpf
    if not company_doc:
        raise RuntimeError("Nao foi possivel identificar o CNPJ/CPF da empresa no registro 0000.")

    candidates, xml_summary = build_address_index(archive_path, company_doc)
    if not candidates:
        raise RuntimeError(
            "Nenhum XML valido foi encontrado para a empresa do SPED. "
            "Verifique se o arquivo compactado contem as NFe emitidas por esse CNPJ."
        )

    updated_text, stats = update_sped_text(sped_text, candidates)
    with output_path.open("w", encoding=encoding, newline="") as fh:
        fh.write(updated_text)

    print(f"SPED de entrada: {sped_path}")
    print(f"XMLs analisados: {xml_summary.total}")
    print(f"XMLs da empresa encontrados: {xml_summary.matched_company}")
    print(f"XMLs ignorados por CNPJ diferente: {xml_summary.skipped_cnpj}")
    print(f"Participantes com endereço disponivel: {len(candidates)}")
    print(f"Linhas 0150 atualizadas: {stats['updated_lines']}")
    print(f"Participantes 0150 atualizados: {stats['updated_participants']}")
    print(f"Arquivo gerado: {output_path}")

    if xml_summary.parse_errors or xml_summary.skipped_missing_dest or xml_summary.skipped_missing_doc:
        print(
            "Avisos: "
            f"parse_errors={xml_summary.parse_errors}, "
            f"sem_dest={xml_summary.skipped_missing_dest}, "
            f"sem_doc={xml_summary.skipped_missing_doc}"
        )

    return 0


def main() -> int:
    args = parse_args()
    use_gui = not (args.sped and args.xml_archive)

    if not use_gui:
        sped_path = Path(args.sped)
        archive_path = Path(args.xml_archive)
    else:
        sped_path = choose_file_dialog(
            "Selecione o arquivo SPED a corrigir",
            [
                ("Arquivos SPED/TXT", "*.txt"),
                ("Todos os arquivos", "*.*"),
            ],
        )
        if sped_path is None:
            return 0

        archive_path = choose_file_dialog(
            "Selecione o .zip ou .rar com os XMLs",
            [
                ("Arquivos compactados", ("*.zip", "*.rar")),
                ("ZIP", "*.zip"),
                ("RAR", "*.rar"),
                ("Todos os arquivos", "*.*"),
            ],
        )
        if archive_path is None:
            return 0

    if not sped_path.exists():
        raise SystemExit(f"Arquivo SPED nao encontrado: {sped_path}")
    if not archive_path.exists():
        raise SystemExit(f"Arquivo de XMLs nao encontrado: {archive_path}")

    output_path = build_output_path(sped_path, args.output)

    try:
        exit_code = run(sped_path, archive_path, output_path)
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        print(f"[ERRO] {message}", file=sys.stderr)
        if use_gui:
            try:
                root = Tk()
                root.withdraw()
                messagebox.showerror("Erro ao corrigir o SPED", message)
                root.destroy()
            except Exception:  # noqa: BLE001
                pass
        return 1

    if use_gui:
        try:
            root = Tk()
            root.withdraw()
            messagebox.showinfo(
                "Concluido",
                f"Arquivo corrigido com sucesso:\n{output_path}",
            )
            root.destroy()
        except Exception:  # noqa: BLE001
            pass

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
