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


def montar_chave_funcionario(resumo: dict[str, Any]) -> str:
    partes = [
        str(resumo.get("pagina_pdf", "")).strip(),
        str(resumo.get("funcionario", "")).strip(),
        str(resumo.get("pis", "")).strip(),
        str(resumo.get("cpf", "")).strip(),
    ]
    return "|".join(partes)


def aplicar_ids_informados(resumos: list[dict[str, Any]], ids_por_chave: dict[str, str]) -> list[dict[str, Any]]:
    resumos_ajustados = []
    for resumo in resumos:
        copia = dict(resumo)
        chave = montar_chave_funcionario(copia)
        id_informado = str(ids_por_chave.get(chave, "") or "").strip()
        if id_informado:
            copia["matricula"] = id_informado
        resumos_ajustados.append(copia)
    return resumos_ajustados


def listar_funcionarios_sem_id(modulo, resumos: list[dict[str, Any]], lancamentos: list[dict[str, Any]], eventos_normalizados: dict[str, int]) -> list[dict[str, Any]]:
    lancamentos_por_pagina = {}
    for linha in lancamentos:
        chave = (linha["arquivo_pdf"], linha["pagina_pdf"])
        lancamentos_por_pagina.setdefault(chave, []).append(linha)

    faltantes = []
    for resumo in resumos:
        chave_pagina = (resumo["arquivo_pdf"], resumo["pagina_pdf"])
        eventos = modulo.agregar_eventos_iob(resumo, lancamentos_por_pagina.get(chave_pagina, []), eventos_normalizados)
        if not eventos:
            continue
        if modulo.formatar_codigo_iob(resumo.get("matricula", "")) != "00000":
            continue
        faltantes.append(
            {
                "chave": montar_chave_funcionario(resumo),
                "nome": str(resumo.get("funcionario", "") or "").strip(),
                "pagina": int(resumo.get("pagina_pdf", 0) or 0),
            }
        )
    return faltantes


def processar_pdf_cartao_iob(
    pdf_bytes: bytes,
    nome_arquivo: str,
    eventos_config: dict[str, int],
    ids_por_chave: dict[str, str] | None = None,
) -> dict[str, Any]:
    modulo = carregar_modulo_conversor()

    sufixo = Path(nome_arquivo or "arquivo.pdf").suffix or ".pdf"
    with tempfile.TemporaryDirectory(prefix="cartao_iob_") as tmp_dir:
        caminho_pdf = Path(tmp_dir) / f"entrada{sufixo}"
        caminho_pdf.write_bytes(pdf_bytes)

        resumos, lancamentos = modulo.processar_pdf(caminho_pdf)
        eventos_normalizados = modulo.normalizar_eventos_iob(eventos_config)
        resumos_ajustados = aplicar_ids_informados(resumos, ids_por_chave or {})
        linhas = modulo.gerar_linhas_iob(resumos_ajustados, lancamentos, eventos_normalizados)
        totais_evento = modulo.resumir_totais_eventos_iob(resumos_ajustados, lancamentos)
        faltando_id = listar_funcionarios_sem_id(modulo, resumos_ajustados, lancamentos, eventos_normalizados)
        nome_saida = modulo.montar_nome_saida(resumos_ajustados, Path(nome_arquivo or "arquivo.pdf")) + ".txt"

    totais_evento_enriquecidos = []
    for item in totais_evento:
        chave = item.get("chave", "")
        codigo = int(eventos_normalizados.get(chave, 0) or 0)
        totais_evento_enriquecidos.append(
            {
                **item,
                "codigo_evento": codigo,
                "selecionado": codigo > 0,
                "entra_no_txt": codigo > 0 and bool(item.get("possui_valor")),
            }
        )

    return {
        "nome_saida": nome_saida,
        "linhas": linhas,
        "resumos": resumos_ajustados,
        "total_funcionarios": len(resumos_ajustados),
        "total_lancamentos": len(lancamentos),
        "total_registros_txt": len(linhas),
        "tipos_evento": getattr(modulo, "TIPOS_EVENTO_IOB", {}),
        "totais_evento": totais_evento_enriquecidos,
        "funcionarios_sem_id": faltando_id,
        "eventos_padrao": getattr(modulo, "EVENTOS_IOB", {}),
    }
