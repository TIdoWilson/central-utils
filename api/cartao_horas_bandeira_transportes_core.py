from __future__ import annotations

import base64
import importlib.util
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


BASE_DIR = Path(__file__).resolve().parents[2]


def _normalizar_nome(valor: str) -> str:
    base = (valor or "").upper().strip()
    substituicoes = str.maketrans(
        {
            "Á": "A",
            "À": "A",
            "Â": "A",
            "Ã": "A",
            "Ä": "A",
            "É": "E",
            "È": "E",
            "Ê": "E",
            "Ë": "E",
            "Í": "I",
            "Ì": "I",
            "Î": "I",
            "Ï": "I",
            "Ó": "O",
            "Ò": "O",
            "Ô": "O",
            "Õ": "O",
            "Ö": "O",
            "Ú": "U",
            "Ù": "U",
            "Û": "U",
            "Ü": "U",
            "Ç": "C",
        }
    )
    base = base.translate(substituicoes)
    return re.sub(r"\s+", " ", base)


def _normalizar_cpf(valor: str) -> str:
    return re.sub(r"\D", "", valor or "")


def _formatar_codigo(valor: str) -> str:
    digitos = re.sub(r"\D", "", valor or "")
    return digitos.zfill(5)[-5:] if digitos else "00000"


def _formatar_cpf_visual(cpf: str) -> str:
    dig = _normalizar_cpf(cpf)
    if len(dig) != 11:
        return cpf or ""
    return f"{dig[:3]}.{dig[3:6]}.{dig[6:9]}-{dig[9:]}"


def montar_chave_funcionario(nome: str, cpf: str) -> str:
    return f"{_normalizar_nome(nome)}|{_normalizar_cpf(cpf)}"


def localizar_script_bandeira() -> Path:
    pasta_python = BASE_DIR / "python"

    candidatos = sorted(
        pasta_python.glob("Cart*o Horas Bandeira Transportes/extrair_remuneracao_motorista_ultima_pagina.py")
    )
    if candidatos:
        return candidatos[0]

    candidatos = sorted(pasta_python.rglob("extrair_remuneracao_motorista_ultima_pagina.py"))
    for item in candidatos:
        if "BANDEIRA" in _normalizar_nome(str(item.parent)):
            return item

    raise FileNotFoundError("Nao foi possivel localizar o script do Cartao Horas Bandeira Transportes.")


def localizar_lista_funcionarios() -> Path:
    pasta_python = BASE_DIR / "python"

    candidatos = sorted(
        pasta_python.glob("Cart*o Horas Bandeira Transportes/Lista funcion*rios.xlsx")
    )
    if candidatos:
        return candidatos[0]

    candidatos = sorted(pasta_python.rglob("Lista*funcion*rios*.xlsx"))
    for item in candidatos:
        if "BANDEIRA" in _normalizar_nome(str(item.parent)):
            return item

    raise FileNotFoundError("Nao foi possivel localizar a planilha Lista funcionarios.xlsx do Bandeira.")


SCRIPT_BANDEIRA = localizar_script_bandeira()
LISTA_FUNCIONARIOS = localizar_lista_funcionarios()


def carregar_modulo_bandeira():
    spec = importlib.util.spec_from_file_location("cartao_horas_bandeira_script", SCRIPT_BANDEIRA)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Nao foi possivel carregar o script: {SCRIPT_BANDEIRA}")
    modulo = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = modulo
    spec.loader.exec_module(modulo)
    return modulo


def processar_pdf_cartao_bandeira(
    pdf_bytes: bytes,
    nome_arquivo: str,
    ids_por_chave: dict[str, str] | None = None,
) -> dict[str, Any]:
    modulo = carregar_modulo_bandeira()

    sufixo = Path(nome_arquivo or "arquivo.pdf").suffix or ".pdf"
    with tempfile.TemporaryDirectory(prefix="cartao_bandeira_") as tmp_dir:
        caminho_pdf = Path(tmp_dir) / f"entrada{sufixo}"
        caminho_pdf.write_bytes(pdf_bytes)

        try:
            resultado = modulo.extrair_dados_ultima_pagina(caminho_pdf, matricula_forcada="")
        except Exception as exc:
            raise ValueError(
                f"Nao foi possivel ler o PDF no layout Bandeira (ultima pagina). Detalhe: {exc}"
            ) from exc
        chave = montar_chave_funcionario(resultado.empregado, resultado.cpf)
        matricula_manual = str((ids_por_chave or {}).get(chave, "") or "").strip()
        if matricula_manual:
            try:
                resultado = modulo.extrair_dados_ultima_pagina(caminho_pdf, matricula_forcada=matricula_manual)
            except Exception as exc:
                raise ValueError(
                    f"Nao foi possivel reprocesar o PDF com a matricula informada. Detalhe: {exc}"
                ) from exc

        linhas = modulo.montar_linhas_txt(resultado)
        preview = modulo.montar_preview(resultado, linhas)

    nome_saida = f"{Path(nome_arquivo or 'arquivo.pdf').stem}.txt"
    txt_bytes = "\n".join(linhas).encode("utf-8")

    funcionario = {
        "chave": montar_chave_funcionario(preview.get("empregado", ""), preview.get("cpf", "")),
        "nome": preview.get("empregado", ""),
        "cpf": preview.get("cpf", ""),
        "matricula": preview.get("matricula", ""),
        "origemMatricula": preview.get("origem_matricula", ""),
        "matriculaFoiHeuristica": bool(preview.get("matricula_foi_heuristica")),
        "matriculaCandidatas": preview.get("matricula_candidatas", []) or [],
        "requerPreenchimento": bool(preview.get("requer_matricula_usuario")),
        "mensagem": preview.get("mensagem_matricula", ""),
    }

    return {
        "nome_saida": nome_saida,
        "txt_base64": base64.b64encode(txt_bytes).decode("ascii"),
        "linhas": linhas,
        "preview": preview,
        "funcionarios": [funcionario],
        "lista_funcionarios_arquivo": str(LISTA_FUNCIONARIOS),
    }


def salvar_funcionario_lista(nome: str, cpf: str, matricula: str) -> dict[str, Any]:
    if not LISTA_FUNCIONARIOS.exists():
        raise FileNotFoundError("Planilha de funcionarios nao encontrada.")

    nome_limpo = str(nome or "").strip()
    cpf_limpo = _normalizar_cpf(cpf)
    codigo = _formatar_codigo(matricula)

    if not nome_limpo:
        raise ValueError("Nome do funcionario e obrigatorio.")
    if len(cpf_limpo) != 11:
        raise ValueError("CPF invalido. Informe 11 digitos.")
    if codigo == "00000":
        raise ValueError("Matricula invalida. Informe um codigo numerico valido.")

    workbook = load_workbook(LISTA_FUNCIONARIOS)

    encontrados: list[tuple[int, Any, int]] = []
    nome_norm = _normalizar_nome(nome_limpo)

    for idx, ws in enumerate(workbook.worksheets):
        if ws.max_row < 2 or ws.max_column < 4:
            continue

        col_codigo = 1
        col_nome = 2
        col_nome_completo = 3
        col_cpf = ws.max_column

        for row in range(2, ws.max_row + 1):
            cpf_row = _normalizar_cpf(str(ws.cell(row, col_cpf).value or ""))
            if cpf_row != cpf_limpo:
                continue

            nome_row = _normalizar_nome(str(ws.cell(row, col_nome).value or ""))
            nome_comp_row = _normalizar_nome(str(ws.cell(row, col_nome_completo).value or ""))
            if nome_norm and nome_norm not in {nome_row, nome_comp_row}:
                continue

            encontrados.append((idx, ws, row))

    if encontrados:
        _, ws_alvo, row_alvo = sorted(encontrados, key=lambda item: (item[0], item[2]))[-1]
        ws_alvo.cell(row_alvo, 1, codigo)
        if not str(ws_alvo.cell(row_alvo, 2).value or "").strip():
            ws_alvo.cell(row_alvo, 2, nome_limpo)
        if ws_alvo.max_column >= 3 and not str(ws_alvo.cell(row_alvo, 3).value or "").strip():
            ws_alvo.cell(row_alvo, 3, nome_limpo)
        ws_alvo.cell(row_alvo, ws_alvo.max_column, _formatar_cpf_visual(cpf_limpo))

        workbook.save(LISTA_FUNCIONARIOS)
        return {
            "acao": "atualizado",
            "aba": ws_alvo.title,
            "linha": row_alvo,
            "codigo": codigo,
            "arquivo": str(LISTA_FUNCIONARIOS),
        }

    ws = workbook.worksheets[0]
    nova_linha = ws.max_row + 1
    ws.cell(nova_linha, 1, codigo)
    ws.cell(nova_linha, 2, nome_limpo)
    if ws.max_column >= 3:
        ws.cell(nova_linha, 3, nome_limpo)
    ws.cell(nova_linha, ws.max_column, _formatar_cpf_visual(cpf_limpo))

    workbook.save(LISTA_FUNCIONARIOS)
    return {
        "acao": "criado",
        "aba": ws.title,
        "linha": nova_linha,
        "codigo": codigo,
        "arquivo": str(LISTA_FUNCIONARIOS),
    }
