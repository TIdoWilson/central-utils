#!/usr/bin/env python3
"""
Corrige o cadastro de participantes do SPED EFD-Contribuicoes a partir de
notas fiscais em XML.

Fluxo:
1. O usuario seleciona o arquivo SPED a corrigir.
2. O usuario seleciona um arquivo .zip, .rar ou .xml com as notas.
3. O script identifica o CNPJ da empresa no registro 0000.
4. Para cada participante 0150 com CPF/CNPJ, busca a nota correspondente e
   preenche apenas os campos de endereco vazios com os dados da nota.

Suporte de entrada:
- XMLs de NF-e em .zip ou .rar
- XML unico de NFS-e com varias notas dentro do mesmo arquivo

Observacao:
- O campo COD_MUN do 0150 e o codigo IBGE da nota.
"""

from __future__ import annotations

import argparse
import io
import os
import json
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import shutil
from typing import Iterable
import xml.etree.ElementTree as ET

from tkinter import Tk, filedialog, messagebox

try:
    import rarfile  # type: ignore
except Exception:  # noqa: BLE001
    rarfile = None


BASE_DIR = Path(__file__).resolve().parent
CONTRIBUICOES_DIR = BASE_DIR / "contribuicoes"
NFE_NS = {"nfe": "http://www.portalfiscal.inf.br/nfe"}
NFSE_NS = {"nfs": "https://www.esnfs.com.br/xsd"}
ARCHIVE_SUFFIXES = {".zip", ".rar"}
MAX_ARCHIVE_DEPTH = 8

DEFAULT_LAYOUT_0000 = [
    "REG",
    "COD_VER",
    "TIPO_ESCRIT",
    "IND_SIT_ESP",
    "NUM_REC_ANTERIOR",
    "DT_INI",
    "DT_FIN",
    "NOME",
    "CNPJ",
    "UF",
    "COD_MUN",
    "SUFRAMA",
    "IND_NAT_PJ",
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
    source_kind: str = ""

    def score(self) -> int:
        return sum(
            1
            for value in (self.cod_mun, self.end, self.num, self.compl, self.bairro)
            if is_present(value)
        )


@dataclass
class XmlParseSummary:
    total_files: int = 0
    total_notes: int = 0
    matched_company: int = 0
    skipped_not_xml: int = 0
    skipped_cnpj: int = 0
    skipped_missing_dest: int = 0
    skipped_missing_doc: int = 0
    parse_errors: int = 0


@dataclass
class XmlNote:
    company_doc: str = ""
    dest_doc: str = ""
    note_key: str = ""
    note_dt: datetime | None = None
    cod_mun: str = ""
    end: str = ""
    num: str = ""
    compl: str = ""
    bairro: str = ""
    xml_name: str = ""
    source_kind: str = ""

    def score(self) -> int:
        return sum(
            1
            for value in (self.cod_mun, self.end, self.num, self.compl, self.bairro)
            if is_present(value)
        )


def load_layout_field_names(layout_file: str, fallback: list[str]) -> list[str]:
    path = CONTRIBUICOES_DIR / layout_file
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


def cnpj_root(value: str | None) -> str:
    digits = normalize_digits(value)
    if len(digits) < 8:
        return ""
    return digits[:8]


def same_company_cnpj(sped_cnpj: str, xml_cnpj: str) -> bool:
    sped_root = cnpj_root(sped_cnpj)
    xml_root = cnpj_root(xml_cnpj)
    if not sped_root or not xml_root:
        return False
    return sped_root == xml_root


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


def make_root() -> Tk:
    root = Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    return root


def choose_file_dialog(title: str, filetypes: list[tuple[str, str]]) -> Path | None:
    root = make_root()
    selected = filedialog.askopenfilename(title=title, filetypes=filetypes)
    root.destroy()
    if not selected:
        return None
    return Path(selected)


def choose_save_dialog(
    title: str,
    default_path: Path,
    filetypes: list[tuple[str, str]],
) -> Path | None:
    root = make_root()
    selected = filedialog.asksaveasfilename(
        title=title,
        initialdir=str(default_path.parent),
        initialfile=default_path.name,
        defaultextension=default_path.suffix or ".txt",
        filetypes=filetypes,
    )
    root.destroy()
    if not selected:
        return None
    path = Path(selected)
    if path.suffix.lower() not in {".txt", ".sped"}:
        path = path.with_suffix(".txt")
    return path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Corrige participantes do SPED EFD-Contribuicoes usando notas XML."
    )
    parser.add_argument("--sped", help="Caminho do arquivo SPED para corrigir.")
    parser.add_argument(
        "--notas",
        "--notes-source",
        "--xml-archive",
        dest="notes_source",
        help="Arquivo .zip, .rar ou .xml com as notas.",
    )
    parser.add_argument(
        "--output",
        help="Caminho do arquivo de saida. Se omitido, sera criado ao lado do SPED.",
    )
    return parser.parse_args()


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


def _find_text(node: ET.Element | None, xpath: str, ns: dict[str, str]) -> str:
    if node is None:
        return ""
    found = node.find(xpath, ns)
    if found is None or found.text is None:
        return ""
    return found.text.strip()


def parse_nfe_notes(xml_bytes: bytes, xml_name: str) -> list[XmlNote]:
    root = ET.fromstring(xml_bytes)
    inf_nodes = root.findall(".//nfe:infNFe", NFE_NS)
    if not inf_nodes:
        return []

    notes: list[XmlNote] = []
    for inf_nfe in inf_nodes:
        emit = inf_nfe.find("nfe:emit", NFE_NS)
        dest = inf_nfe.find("nfe:dest", NFE_NS)
        ender_dest = dest.find("nfe:enderDest", NFE_NS) if dest is not None else None

        company_doc = normalize_digits(
            _find_text(emit, "nfe:CNPJ", NFE_NS) or _find_text(emit, "nfe:CPF", NFE_NS)
        )
        dest_doc = normalize_digits(
            _find_text(dest, "nfe:CNPJ", NFE_NS) or _find_text(dest, "nfe:CPF", NFE_NS)
        )

        if not dest_doc:
            continue

        notes.append(
            XmlNote(
                company_doc=company_doc,
                dest_doc=dest_doc,
                note_key=_find_text(inf_nfe, "nfe:ide/nfe:nNF", NFE_NS),
                note_dt=parse_dt_emi(_find_text(inf_nfe, "nfe:ide/nfe:dhEmi", NFE_NS)),
                cod_mun=_find_text(ender_dest, "nfe:cMun", NFE_NS),
                end=_find_text(ender_dest, "nfe:xLgr", NFE_NS),
                num=_find_text(ender_dest, "nfe:nro", NFE_NS),
                compl=_find_text(ender_dest, "nfe:xCpl", NFE_NS),
                bairro=_find_text(ender_dest, "nfe:xBairro", NFE_NS),
                xml_name=xml_name,
                source_kind="nfe",
            )
        )

    return notes


def parse_nfse_notes(xml_bytes: bytes, xml_name: str) -> list[XmlNote]:
    root = ET.fromstring(xml_bytes)
    note_nodes = root.findall(".//nfs:nfs", NFSE_NS)
    if not note_nodes and root.tag.split("}")[-1] == "nfs":
        note_nodes = [root]
    if not note_nodes:
        return []

    notes: list[XmlNote] = []
    for note in note_nodes:
        prestador = note.find("nfs:prestadorServico", NFSE_NS)
        tomador = note.find("nfs:tomadorServico", NFSE_NS)

        dest_doc = normalize_digits(_find_text(tomador, "nfs:nrDocumento", NFSE_NS))
        if not dest_doc:
            continue

        notes.append(
            XmlNote(
                company_doc=normalize_digits(_find_text(prestador, "nfs:nrDocumento", NFSE_NS)),
                dest_doc=dest_doc,
                note_key=_find_text(note, "nfs:nrNfs", NFSE_NS),
                note_dt=parse_dt_emi(_find_text(note, "nfs:dtEmissaoNfs", NFSE_NS)),
                cod_mun=_find_text(tomador, "nfs:cdIbge", NFSE_NS),
                end=_find_text(tomador, "nfs:dsEndereco", NFSE_NS),
                num=_find_text(tomador, "nfs:nrEndereco", NFSE_NS),
                compl="",
                bairro=_find_text(tomador, "nfs:nmBairro", NFSE_NS),
                xml_name=xml_name,
                source_kind="nfse",
            )
        )

    return notes


def parse_xml_notes(xml_bytes: bytes, xml_name: str) -> list[XmlNote]:
    try:
        notes = parse_nfe_notes(xml_bytes, xml_name)
        if notes:
            return notes
        return parse_nfse_notes(xml_bytes, xml_name)
    except ET.ParseError:
        raise


def _entry_suffix(name: str) -> str:
    return Path(name).suffix.lower()


def _iter_xml_entries_from_zip(
    archive_name: str,
    archive_bytes: bytes,
    *,
    depth: int,
    max_depth: int,
) -> Iterable[tuple[str, bytes]]:
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            entry_name = info.filename
            entry_bytes = zf.read(info)
            yield from _iter_xml_entries_from_bytes(
                f"{archive_name}::{entry_name}",
                entry_bytes,
                depth=depth + 1,
                max_depth=max_depth,
            )


def _iter_xml_entries_from_rar(
    archive_name: str,
    archive_bytes: bytes,
    *,
    depth: int,
    max_depth: int,
) -> Iterable[tuple[str, bytes]]:
    if rarfile is None:
        raise RuntimeError(
            "O pacote rarfile nao esta disponivel neste ambiente, entao nao foi possivel ler .rar."
        )

    _configure_rarfile_backend()
    try:
        with rarfile.RarFile(io.BytesIO(archive_bytes)) as rf:  # type: ignore[attr-defined]
            for info in rf.infolist():
                if info.isdir():
                    continue
                entry_name = info.filename
                entry_bytes = rf.read(info)
                yield from _iter_xml_entries_from_bytes(
                    f"{archive_name}::{entry_name}",
                    entry_bytes,
                    depth=depth + 1,
                    max_depth=max_depth,
                )
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Nao consegui abrir um .rar dentro do pacote. Se o arquivo exigir um backend externo, "
            "instale o WinRAR, 7-Zip ou outro descompactador compativel, ou converta o pacote para .zip."
        ) from exc


def _iter_xml_entries_from_bytes(
    source_name: str,
    source_bytes: bytes,
    *,
    depth: int = 0,
    max_depth: int = MAX_ARCHIVE_DEPTH,
) -> Iterable[tuple[str, bytes]]:
    if depth > max_depth:
        raise RuntimeError(
            f"O limite de profundidade de arquivos compactados foi atingido ao ler {source_name}."
        )

    suffix = _entry_suffix(source_name)

    if suffix == ".xml":
        yield source_name, source_bytes
        return

    if suffix == ".zip":
        yield from _iter_xml_entries_from_zip(
            source_name,
            source_bytes,
            depth=depth,
            max_depth=max_depth,
        )
        return

    if suffix == ".rar":
        yield from _iter_xml_entries_from_rar(
            source_name,
            source_bytes,
            depth=depth,
            max_depth=max_depth,
        )
        return


def _iter_tool_locations(executable_names: Iterable[str]) -> Iterable[str]:
    seen: set[str] = set()
    for name in executable_names:
        if not name:
            continue
        resolved = shutil.which(name)
        if resolved and resolved not in seen:
            seen.add(resolved)
            yield resolved

    common_roots = [
        os.environ.get("ProgramFiles"),
        os.environ.get("ProgramFiles(x86)"),
        os.environ.get("ProgramW6432"),
        os.environ.get("LOCALAPPDATA"),
    ]
    common_subdirs = [
        ("WinRAR",),
        ("7-Zip",),
        ("Git", "usr", "bin"),
    ]

    for root in common_roots:
        if not root:
            continue
        root_path = Path(root)
        for subdir in common_subdirs:
            candidate_dir = root_path.joinpath(*subdir)
            for name in executable_names:
                candidate = candidate_dir / name
                candidate_str = str(candidate)
                if candidate.exists() and candidate_str not in seen:
                    seen.add(candidate_str)
                    yield candidate_str


def _configure_rarfile_backend() -> None:
    if rarfile is None:
        return

    current_setup = getattr(rarfile, "CURRENT_SETUP", None)
    if current_setup is not None:
        return

    tool_candidates = {
        "UNRAR_TOOL": ("unrar.exe", "unrar", "rar.exe", "rar"),
        "UNAR_TOOL": ("unar.exe", "unar"),
        "SEVENZIP_TOOL": ("7z.exe", "7z", "7za.exe", "7za"),
        "SEVENZIP2_TOOL": ("7z.exe", "7z", "7za.exe", "7za"),
        "BSDTAR_TOOL": ("bsdtar.exe", "bsdtar"),
    }

    for attr_name, executable_names in tool_candidates.items():
        current_value = getattr(rarfile, attr_name, None)
        if current_value:
            current_path = Path(str(current_value))
            resolved = shutil.which(str(current_value)) or (
                str(current_path) if current_path.exists() else None
            )
            if resolved:
                setattr(rarfile, attr_name, resolved)
                continue

        for candidate in _iter_tool_locations(executable_names):
            setattr(rarfile, attr_name, candidate)
            break

    try:
        rarfile.tool_setup(force=True)
    except Exception:
        # Keep going; we will raise a clearer error if a .rar is actually used.
        pass


def iter_xml_entries(source_path: Path) -> Iterable[tuple[str, bytes]]:
    suffix = source_path.suffix.lower()

    if suffix == ".xml":
        yield source_path.name, source_path.read_bytes()
        return

    if suffix == ".zip":
        yield from _iter_xml_entries_from_bytes(
            source_path.name,
            source_path.read_bytes(),
        )
        return

    if suffix == ".rar":
        if rarfile is None:
            raise RuntimeError(
                "O pacote rarfile nao esta disponivel neste ambiente, entao nao foi possivel ler .rar."
            )
        _configure_rarfile_backend()
        try:
            with rarfile.RarFile(source_path) as rf:  # type: ignore[attr-defined]
                for info in rf.infolist():
                    if info.isdir():
                        continue
                    entry_name = info.filename
                    entry_bytes = rf.read(info)
                    yield from _iter_xml_entries_from_bytes(
                        f"{source_path.name}::{entry_name}",
                        entry_bytes,
                    )
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "Nao consegui abrir o .rar. Se o arquivo exigir um backend externo, "
                "instale o WinRAR, 7-Zip ou outro descompactador compativel, ou converta o pacote para .zip."
            ) from exc
        return

    raise ValueError("O arquivo de notas precisa ser .zip, .rar ou .xml.")


def build_address_index(
    source_path: Path,
    company_cnpj: str,
) -> tuple[dict[str, ParticipantAddress], XmlParseSummary]:
    candidates: dict[str, ParticipantAddress] = {}
    summary = XmlParseSummary()

    for xml_name, xml_bytes in iter_xml_entries(source_path):
        summary.total_files += 1
        if not xml_name.lower().endswith(".xml"):
            summary.skipped_not_xml += 1
            continue

        try:
            notes = parse_xml_notes(xml_bytes, xml_name)
        except ET.ParseError:
            summary.parse_errors += 1
            continue
        except Exception:
            summary.parse_errors += 1
            continue

        if not notes:
            summary.skipped_missing_dest += 1
            continue

        for note in notes:
            summary.total_notes += 1

            if company_cnpj and note.company_doc and not same_company_cnpj(company_cnpj, note.company_doc):
                summary.skipped_cnpj += 1
                continue

            if not is_present(note.dest_doc):
                summary.skipped_missing_doc += 1
                continue

            summary.matched_company += 1

            address = ParticipantAddress(
                cod_mun=note.cod_mun,
                end=note.end,
                num=note.num,
                compl=note.compl,
                bairro=note.bairro,
                xml_name=note.xml_name,
                note_key=note.note_key,
                note_dt=note.note_dt,
                source_kind=note.source_kind,
            )

            if address.score() == 0:
                continue

            current = candidates.get(note.dest_doc)
            if current is None or address.score() > current.score():
                candidates[note.dest_doc] = address
                continue

            if address.score() == current.score():
                if current.note_dt is None and address.note_dt is not None:
                    candidates[note.dest_doc] = address
                    continue
                if current.note_dt and address.note_dt and address.note_dt > current.note_dt:
                    candidates[note.dest_doc] = address

    return candidates, summary


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


def update_sped_text(
    sped_text: str,
    candidates: dict[str, ParticipantAddress],
) -> tuple[str, dict[str, int]]:
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
        cpf_index = INDEX_0150.get("CPF")
        cpf = normalize_digits(get_field(parts, cpf_index)) if cpf_index is not None else ""
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


def build_output_path(sped_path: Path, output_arg: str | None) -> Path:
    if output_arg:
        out = Path(output_arg)
        if out.suffix.lower() not in {".txt", ".sped"}:
            out = out.with_suffix(".txt")
        return out
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return sped_path.with_name(f"{sped_path.stem}_corrigido_{timestamp}{sped_path.suffix}")


def get_sped_company_cnpj(lines: list[str]) -> str:
    for line in lines:
        line = line.lstrip("\ufeff")
        if not line.startswith("|0000|"):
            continue
        parts = split_sped_line(line)
        cnpj = normalize_digits(get_field(parts, INDEX_0000["CNPJ"]))
        return cnpj
    raise ValueError("Nao foi encontrado o registro 0000 no SPED.")


def run(sped_path: Path, notes_path: Path, output_path: Path) -> int:
    sped_text, encoding = guess_encoding(sped_path)
    sped_text = sped_text.lstrip("\ufeff")
    sped_lines = sped_text.splitlines()
    company_cnpj = get_sped_company_cnpj(sped_lines)
    if not company_cnpj:
        raise RuntimeError("Nao foi possivel identificar o CNPJ da empresa no registro 0000.")

    missing_cod_mun = 0
    participants_with_doc = 0
    for line in sped_lines:
        if not line.startswith("|0150|"):
            continue
        parts = split_sped_line(line)
        cod_mun_index = INDEX_0150.get("COD_MUN")
        cod_mun = get_field(parts, cod_mun_index) if cod_mun_index is not None else ""
        if is_missing(cod_mun, treat_zero_as_missing=True):
            missing_cod_mun += 1
        cpf_index = INDEX_0150.get("CPF")
        cpf = normalize_digits(get_field(parts, cpf_index)) if cpf_index is not None else ""
        cnpj = normalize_digits(get_field(parts, INDEX_0150["CNPJ"]))
        if cpf or cnpj:
            participants_with_doc += 1

    candidates, xml_summary = build_address_index(notes_path, company_cnpj)
    if not candidates:
        raise RuntimeError(
            "Nenhuma nota valida foi encontrada para a empresa do SPED. "
            "Verifique se o XML, ZIP ou RAR contem as notas emitidas pelo CNPJ do 0000."
        )

    updated_text, stats = update_sped_text(sped_text, candidates)
    with output_path.open("w", encoding=encoding, newline="") as fh:
        fh.write(updated_text)

    print(f"SPED de entrada: {sped_path}")
    print(f"Fonte das notas: {notes_path}")
    print(f"Arquivos XML analisados: {xml_summary.total_files}")
    print(f"Notas analisadas: {xml_summary.total_notes}")
    print(f"Notas da empresa encontradas: {xml_summary.matched_company}")
    print(f"Notas ignoradas por raiz de CNPJ diferente: {xml_summary.skipped_cnpj}")
    print(f"Participantes 0150 sem COD_MUN no SPED: {missing_cod_mun}")
    print(f"Participantes 0150 com CPF/CNPJ no SPED: {participants_with_doc}")
    print(f"Participantes com endereco disponivel: {len(candidates)}")
    print(f"Linhas 0150 atualizadas: {stats['updated_lines']}")
    print(f"Participantes 0150 atualizados: {stats['updated_participants']}")
    print(f"Participantes 0150 sem correspondencia no XML: {max(missing_cod_mun - stats['updated_participants'], 0)}")
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
    use_gui = not (args.sped and args.notes_source)

    if not use_gui:
        sped_path = Path(args.sped)
        notes_path = Path(args.notes_source)
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

        notes_path = choose_file_dialog(
            "Selecione o arquivo de notas (.xml, .zip ou .rar)",
            [
                ("Notas XML/ZIP/RAR", ("*.xml", "*.zip", "*.rar")),
                ("XML", "*.xml"),
                ("ZIP", "*.zip"),
                ("RAR", "*.rar"),
                ("Todos os arquivos", "*.*"),
            ],
        )
        if notes_path is None:
            return 0

    if not sped_path.exists():
        raise SystemExit(f"Arquivo SPED nao encontrado: {sped_path}")
    if not notes_path.exists():
        raise SystemExit(f"Arquivo de notas nao encontrado: {notes_path}")

    default_output = build_output_path(sped_path, args.output)

    if use_gui:
        save_path = choose_save_dialog(
            "Salvar SPED corrigido",
            default_output,
            [
                ("Arquivo TXT", "*.txt"),
                ("Arquivo SPED", "*.sped"),
                ("Todos os arquivos", "*.*"),
            ],
        )
        output_path = save_path or default_output
    else:
        output_path = default_output

    try:
        exit_code = run(sped_path, notes_path, output_path)
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        print(f"[ERRO] {message}", file=sys.stderr)
        if use_gui:
            try:
                root = make_root()
                messagebox.showerror("Erro ao corrigir o SPED", message)
                root.destroy()
            except Exception:  # noqa: BLE001
                pass
        return 1

    if use_gui:
        try:
            root = make_root()
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
