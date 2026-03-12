#!/usr/bin/env python3
"""
Gera relatorio de produtos/tributacao a partir de XMLs de NFe/NFCe.

Colunas de saida:
- numero da nota
- codigo do produto
- nome do produto
- ncm
- cst
- cfop
- valor da venda
- base de icms
- aliquota de icms
- valor de icms
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
import xml.etree.ElementTree as ET

from openpyxl import Workbook


NFE_NS = {"n": "http://www.portalfiscal.inf.br/nfe"}
DEFAULT_DIR = Path(
    r"W:\PASTA CLIENTES\COELLI & CIA LTDA\CONCILIACAO\2026\01\XMLJAN2026\XMLJAN2026\EmissaoPropria"
)

HEADERS = [
    "numero da nota",
    "codigo do produto",
    "nome do produto",
    "ncm",
    "cst",
    "cfop",
    "valor da venda",
    "base de icms",
    "aliquota de icms",
    "valor de icms",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gera Excel com itens e tributacao de XMLs de NFe/NFCe."
    )
    parser.add_argument(
        "--xml-dir",
        default=str(DEFAULT_DIR),
        help=f"Pasta com os XMLs (padrao: {DEFAULT_DIR})",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Caminho completo do xlsx de saida. Se vazio, gera na mesma pasta dos XMLs.",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=500,
        help="Mostra progresso a cada N arquivos (padrao: 500).",
    )
    return parser.parse_args()


def _find_text(node: ET.Element | None, xpath: str) -> str:
    if node is None:
        return ""
    found = node.find(xpath, NFE_NS)
    if found is None or found.text is None:
        return ""
    return found.text.strip()


def _to_float(value: str) -> float:
    if not value:
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def _icms_group(det: ET.Element) -> ET.Element | None:
    icms = det.find("n:imposto/n:ICMS", NFE_NS)
    if icms is None:
        return None
    for child in list(icms):
        return child
    return None


def parse_xml_file(xml_path: Path) -> list[list[object]]:
    tree = ET.parse(xml_path)
    root = tree.getroot()

    inf_nfe = root.find(".//n:infNFe", NFE_NS)
    if inf_nfe is None:
        return []

    numero_nota = _find_text(inf_nfe, "n:ide/n:nNF")
    rows: list[list[object]] = []

    for det in inf_nfe.findall("n:det", NFE_NS):
        cprod = _find_text(det, "n:prod/n:cProd")
        xprod = _find_text(det, "n:prod/n:xProd")
        ncm = _find_text(det, "n:prod/n:NCM")
        cfop = _find_text(det, "n:prod/n:CFOP")
        vprod = _to_float(_find_text(det, "n:prod/n:vProd"))

        icms_group = _icms_group(det)
        cst = _find_text(icms_group, "n:CST")
        if not cst:
            cst = _find_text(icms_group, "n:CSOSN")
        vbc = _to_float(_find_text(icms_group, "n:vBC"))
        picms = _to_float(_find_text(icms_group, "n:pICMS"))
        vicms = _to_float(_find_text(icms_group, "n:vICMS"))

        rows.append(
            [
                numero_nota,
                cprod,
                xprod,
                ncm,
                cst,
                cfop,
                vprod,
                vbc,
                picms,
                vicms,
            ]
        )

    return rows


def build_output_path(xml_dir: Path, output_arg: str) -> Path:
    if output_arg.strip():
        out = Path(output_arg)
        if out.suffix.lower() != ".xlsx":
            out = out.with_suffix(".xlsx")
        return out
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return xml_dir / f"relatorio_produtos_tributacao_{timestamp}.xlsx"


def list_xml_files(xml_dir: Path) -> list[Path]:
    files = [p for p in xml_dir.rglob("*") if p.is_file() and p.suffix.lower() == ".xml"]
    files.sort()
    return files


def generate_report(xml_dir: Path, output_xlsx: Path, progress_every: int = 500) -> tuple[int, int, int]:
    xml_files = list_xml_files(xml_dir)
    if not xml_files:
        raise FileNotFoundError(f"Nenhum XML encontrado em: {xml_dir}")

    wb = Workbook(write_only=True)
    ws = wb.create_sheet("Relatorio")
    ws.append(HEADERS)

    files_ok = 0
    item_rows = 0
    files_error = 0

    for idx, xml_file in enumerate(xml_files, start=1):
        try:
            rows = parse_xml_file(xml_file)
            for row in rows:
                ws.append(row)
            files_ok += 1
            item_rows += len(rows)
        except Exception as exc:  # noqa: BLE001
            files_error += 1
            print(f"[ERRO] {xml_file}: {exc}", file=sys.stderr)

        if progress_every > 0 and idx % progress_every == 0:
            print(
                f"Processados {idx}/{len(xml_files)} XMLs | "
                f"ok={files_ok} erro={files_error} itens={item_rows}"
            )

    wb.save(output_xlsx)
    return files_ok, files_error, item_rows


def main() -> None:
    args = parse_args()
    xml_dir = Path(args.xml_dir)
    if not xml_dir.exists() or not xml_dir.is_dir():
        raise SystemExit(f"Pasta invalida: {xml_dir}")

    output_xlsx = build_output_path(xml_dir, args.output)

    print(f"Pasta XML: {xml_dir}")
    print(f"Arquivo de saida: {output_xlsx}")
    files_ok, files_error, item_rows = generate_report(
        xml_dir=xml_dir,
        output_xlsx=output_xlsx,
        progress_every=args.progress_every,
    )
    print(
        "Concluido: "
        f"arquivos_ok={files_ok}, arquivos_erro={files_error}, itens={item_rows}"
    )


if __name__ == "__main__":
    main()
