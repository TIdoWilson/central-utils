from __future__ import annotations

import importlib.util
import sys
import tempfile
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[2]


def localizar_script_conversor() -> Path:
    pasta_python = BASE_DIR / "python"
    candidatos = sorted(
        pasta_python.glob("Conversor de PDF Cart* de Horas para TXT + Conversor para IOB/extrair_cartoes_para_excel.py")
    )
    if candidatos:
        return candidatos[0]
    raise FileNotFoundError("Nao foi possivel localizar o script de conversao do cartao de horas para IOB.")


SCRIPT_CONVERSOR = localizar_script_conversor()


def carregar_modulo_conversor():
    spec = importlib.util.spec_from_file_location("cartao_horas_iob_script", SCRIPT_CONVERSOR)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Nao foi possivel carregar o script: {SCRIPT_CONVERSOR}")
    modulo = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = modulo
    spec.loader.exec_module(modulo)
    return modulo


def processar_pdf_cartao_iob(pdf_bytes: bytes, nome_arquivo: str, eventos_config: dict[str, int]) -> dict[str, Any]:
    modulo = carregar_modulo_conversor()

    sufixo = Path(nome_arquivo or "arquivo.pdf").suffix or ".pdf"
    with tempfile.TemporaryDirectory(prefix="cartao_iob_") as tmp_dir:
        caminho_pdf = Path(tmp_dir) / f"entrada{sufixo}"
        caminho_pdf.write_bytes(pdf_bytes)

        resumos, lancamentos = modulo.processar_pdf(caminho_pdf)
        linhas = modulo.gerar_linhas_iob(resumos, lancamentos, eventos_config)
        totais_evento = modulo.resumir_totais_eventos_iob(resumos, lancamentos)
        nome_saida = modulo.montar_nome_saida(resumos, Path(nome_arquivo or "arquivo.pdf")) + ".txt"

    return {
        "nome_saida": nome_saida,
        "linhas": linhas,
        "resumos": resumos,
        "total_funcionarios": len(resumos),
        "total_lancamentos": len(lancamentos),
        "total_registros_txt": len(linhas),
        "tipos_evento": getattr(modulo, "TIPOS_EVENTO_IOB", {}),
        "totais_evento": totais_evento,
        "eventos_padrao": getattr(modulo, "EVENTOS_IOB", {}),
    }
