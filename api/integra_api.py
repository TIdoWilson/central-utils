# api/integra_api.py

from pathlib import Path
import tempfile
import shutil
import json
import io
import zipfile
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from api.gerador_atas_core import (
    listar_modelos,
    obter_campos_modelo,
    gerar_ata as gerar_ata_core,
)

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse

# Importações dos módulos internos (sem circular)
from api.relatorio_ferias_core import split_pdf_relatorio_ferias
from api.holerites_core import split_pdf_holerites
from api.separador_ferias_funcionario_core import processar_ferias_por_funcionario

import base64

from api.comprimir_pdf_core import comprimir_pdf_bytes

from api.extrator_zip_rar_core import processar_pasta_zip_rar

from api.excel_abas_pdf_core import exportar_abas_para_pdf

from api.separador_csv_baixa_automatica_core import processar_baixa_automatica_arquivo
from api.comparador_eventos_holerite_core import processar_comparador_eventos_holerite
from api.comparador_entradas_bandeira_core import processar_comparador_entradas_bandeira

app = FastAPI(title="Integracao Python API")

from api.importador_recebimentos_madre_scp_core import (
    processar_importador_recebimentos_madre_scp,
)

from api.gfbr_gerador_txt_core import processar_gfbr_gerador_txt

from api.conciliador_cartao_wilson_core import conciliar_cartao_wilson, VALOR_TOLERANCIA_PADRAO
from api.conciliador_cartao_tipo50_core import conciliar_cartao_tipo50
from api.conciliador_pis_cofins_core import conciliar_pis_cofins
from api.giast_core import gerar_giast_txt
try:
    from api.conversor_extrato_pdf_ofx_core import converter_pdf_para_ofx_bytes
except ModuleNotFoundError:
    converter_pdf_para_ofx_bytes = None

try:
    from api.lotes_renasul_core import processar_lotes_renasul
except Exception:
    processar_lotes_renasul = None


@app.post("/api/comparador-eventos-holerite/processar")
async def processar_comparador_eventos_holerite_endpoint(
    arquivo: UploadFile = File(...),
    competencia_anterior: str | None = Form(None),
    competencia_atual: str | None = Form(None),
    ocultar_eventos_json: str | None = Form(None),
):
    try:
        conteudo = await arquivo.read()
        eventos_ocultos = []
        if ocultar_eventos_json:
            try:
                eventos_ocultos = json.loads(ocultar_eventos_json)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Lista de filtros invalida.") from exc
        resultado = processar_comparador_eventos_holerite(
            arquivo_bytes=conteudo,
            nome_arquivo=arquivo.filename or "arquivo.slk",
            competencia_anterior=competencia_anterior,
            competencia_atual=competencia_atual,
            eventos_ocultos=eventos_ocultos,
        )
        return {
            "ok": True,
            "competenciasEncontradas": resultado["competencias_encontradas"],
            "competenciaAnterior": resultado["competencia_anterior"],
            "competenciaAtual": resultado["competencia_atual"],
            "competenciaAnteriorExtenso": resultado["competencia_anterior_extenso"],
            "competenciaAtualExtenso": resultado["competencia_atual_extenso"],
            "preview": resultado["preview"],
            "totalFuncionariosComDiferenca": resultado["total_funcionarios_com_diferenca"],
            "arquivoSaida": resultado["arquivo_saida"],
            "xlsxBase64": base64.b64encode(resultado["xlsx_bytes"]).decode("ascii"),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        print("Erro ao processar comparador de eventos de holerite:", exc)
        raise HTTPException(status_code=500, detail="Erro interno ao processar o arquivo SLK.")


@app.post("/api/comparador-entradas-bandeira/processar")
async def processar_comparador_entradas_bandeira_endpoint(
    arquivo_fsist: UploadFile = File(...),
    arquivo_entradas: UploadFile = File(...),
):
    try:
        fsist_bytes = await arquivo_fsist.read()
        entradas_bytes = await arquivo_entradas.read()
        resultado = processar_comparador_entradas_bandeira(
            arquivo_fsist_bytes=fsist_bytes,
            arquivo_fsist_nome=arquivo_fsist.filename or "fsist.xlsx",
            arquivo_entradas_bytes=entradas_bytes,
            arquivo_entradas_nome=arquivo_entradas.filename or "entradas.xlsx",
        )
        return {
            "ok": True,
            "arquivoSaida": resultado["arquivo_saida"],
            "xlsxBase64": base64.b64encode(resultado["xlsx_bytes"]).decode("ascii"),
            "preview": resultado["preview"],
            "totalLinhas": resultado["total_linhas"],
            "totalDivergenteEntreArquivos": resultado[
                "total_divergente_entre_arquivos"
            ],
            "totalSoNoFsist": resultado["total_so_no_fsist"],
            "statusValidos": resultado["status_validos"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        print("Erro ao processar comparador de entradas Bandeira:", exc)
        raise HTTPException(
            status_code=500,
            detail=(
                "Erro interno ao processar os arquivos. "
                "Verifique se os arquivos estao inteiros e tente novamente."
            ),
        )


@app.post("/api/cartao-horas-iob/processar")
async def processar_cartao_horas_iob_endpoint(
    arquivo: UploadFile = File(...),
    eventos_json: str = Form("{}"),
    ids_json: str = Form("{}"),
):
    try:
        from api.cartao_horas_iob_core import processar_pdf_cartao_iob

        pdf_bytes = await arquivo.read()
        try:
            eventos_config = json.loads(eventos_json or "{}")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Configuracao de eventos invalida.") from exc
        try:
            ids_por_chave = json.loads(ids_json or "{}")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Configuracao de IDs invalida.") from exc

        resultado = processar_pdf_cartao_iob(
            pdf_bytes=pdf_bytes,
            nome_arquivo=arquivo.filename or "cartao.pdf",
            eventos_config=eventos_config,
            ids_por_chave=ids_por_chave,
        )
        txt_bytes = "\n".join(resultado["linhas"]).encode("utf-8")
        return {
            "ok": True,
            "nomeArquivo": resultado["nome_saida"],
            "txtBase64": base64.b64encode(txt_bytes).decode("ascii"),
            "totalFuncionarios": resultado["total_funcionarios"],
            "totalLancamentos": resultado["total_lancamentos"],
            "totalRegistrosTxt": resultado["total_registros_txt"],
            "empresa": (resultado["resumos"][0].get("empresa") if resultado["resumos"] else ""),
            "periodoInicial": (resultado["resumos"][0].get("periodo_inicial") if resultado["resumos"] else ""),
            "periodoFinal": (resultado["resumos"][0].get("periodo_final") if resultado["resumos"] else ""),
            "layoutOrigem": (resultado["resumos"][0].get("layout_origem") if resultado["resumos"] else ""),
            "tiposEvento": resultado["tipos_evento"],
            "totaisEvento": resultado["totais_evento"],
            "funcionariosSemId": resultado["funcionarios_sem_id"],
            "eventosPadrao": resultado["eventos_padrao"],
            "previewLinhas": resultado["linhas"][:20],
        }
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Ferramenta indisponivel neste ambiente: script de conversao do cartao de horas nao localizado.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print("Erro ao processar cartao horas IOB:", exc)
        raise HTTPException(status_code=500, detail="Erro interno ao processar o PDF do cartao.")


@app.post("/api/cartao-horas-bandeira-transportes/processar")
async def processar_cartao_horas_bandeira_transportes_endpoint(
    arquivo: UploadFile = File(...),
    ids_json: str = Form("{}"),
    confirmados_json: str = Form("[]"),
    removidos_json: str = Form("[]"),
    overrides_json: str = Form("{}"),
):
    try:
        from api.cartao_horas_bandeira_transportes_core import processar_pdf_cartao_bandeira

        pdf_bytes = await arquivo.read()
        try:
            ids_por_chave = json.loads(ids_json or "{}")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Configuracao de IDs invalida.") from exc

        try:
            confirmados = json.loads(confirmados_json or "[]")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Configuracao de confirmacoes invalida.") from exc

        try:
            removidos = json.loads(removidos_json or "[]")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Configuracao de remocoes invalida.") from exc

        try:
            overrides = json.loads(overrides_json or "{}")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Configuracao de ajustes de valores invalida.") from exc

        resultado = processar_pdf_cartao_bandeira(
            pdf_bytes=pdf_bytes,
            nome_arquivo=arquivo.filename or "arquivo.pdf",
            ids_por_chave=ids_por_chave,
            confirmados=confirmados if isinstance(confirmados, list) else [],
            removidos=removidos if isinstance(removidos, list) else [],
            overrides_por_registro=overrides if isinstance(overrides, dict) else {},
        )

        return {
            "ok": True,
            "nomeArquivo": resultado.get("nome_saida", "arquivo.zip"),
            "zipBase64": resultado.get("zip_base64", ""),
            "totalRegistrosTxt": len(resultado.get("linhas", [])),
            "previewLinhas": (resultado.get("linhas") or [])[:30],
            "funcionarios": resultado.get("funcionarios", []),
            "pendencias": resultado.get("pendencias", []),
            "podeGerarTxt": bool(resultado.get("pode_gerar_txt", False)),
            "bloqueadoGeracao": bool(resultado.get("bloqueado_geracao", True)),
            "mensagemBloqueio": resultado.get("mensagem_bloqueio", ""),
            "totalPaginas": int(resultado.get("total_paginas", 0) or 0),
            "totalFuncionarios": int(resultado.get("total_funcionarios", 0) or 0),
            "totalPendencias": int(resultado.get("total_pendencias", 0) or 0),
            "totalDuplicadosIgnorados": int(resultado.get("total_duplicados_ignorados", 0) or 0),
            "totalArquivosTxt": int(resultado.get("total_arquivos_txt", 0) or 0),
            "listaFuncionariosArquivo": resultado.get("lista_funcionarios_arquivo", ""),
        }
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Ferramenta indisponivel neste ambiente: script/planilha do Bandeira nao localizados.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        print("Erro ao processar cartao horas Bandeira Transportes:", exc)
        raise HTTPException(status_code=500, detail="Erro interno ao processar o PDF.")


class SalvarFuncionarioBandeiraPayload(BaseModel):
    nome: str
    cpf: str
    matricula: str


@app.post("/api/cartao-horas-bandeira-transportes/salvar-funcionario")
def salvar_funcionario_bandeira_endpoint(payload: SalvarFuncionarioBandeiraPayload):
    try:
        from api.cartao_horas_bandeira_transportes_core import salvar_funcionario_lista

        resultado = salvar_funcionario_lista(
            nome=payload.nome,
            cpf=payload.cpf,
            matricula=payload.matricula,
        )
        return {"ok": True, **resultado}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        print("Erro ao salvar funcionario na lista Bandeira:", exc)
        raise HTTPException(status_code=500, detail="Erro interno ao salvar funcionario na lista.")


@app.post("/api/lotes-renasul/processar")
def processar_lotes_renasul_endpoint(payload: dict[str, Any]):
    try:
        if processar_lotes_renasul is None:
            raise HTTPException(
                status_code=503,
                detail="Ferramenta indisponivel neste ambiente: parser do lotes Renasul nao localizado.",
            )
        resultado = processar_lotes_renasul(payload or {})
        return resultado
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        print("Erro ao processar lotes Renasul:", exc)
        raise HTTPException(status_code=500, detail=f"Erro ao processar lotes Renasul: {exc}")
# =========================
# MODELO DE ENTRADA (FÉRIAS)
# =========================

class SeparadorParams(BaseModel):
    input_pdf_path: str
    competencia: str
    output_dir: Optional[str] = None

# =========================
# ENDPOINT: RELATÓRIO DE FÉRIAS
# =========================

@app.post("/api/separador-pdf-relatorio-de-ferias/processar")
def processar_separador(params: SeparadorParams):

    input_pdf = Path(params.input_pdf_path)
    if not input_pdf.is_file():
        raise HTTPException(status_code=400, detail="Arquivo PDF de entrada nao encontrado.")

    competencia = params.competencia.strip()
    if not competencia:
        raise HTTPException(status_code=400, detail="Competencia nao informada.")

    out_dir = Path(params.output_dir) if params.output_dir else input_pdf.parent / "output"

    try:
        zip_path = split_pdf_relatorio_ferias(input_pdf, out_dir, competencia)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar PDF: {e}")

    return {"ok": True, "zip_path": str(zip_path)}

# =========================
# ENDPOINT: HOLERITES (UPLOAD)
# =========================

@app.post("/processar-holerites-por-empresa")
async def processar_holerites_por_empresa(
    pdf: UploadFile = File(...),
    competencia: str = Form(...),
    background_tasks: BackgroundTasks = None,
):

    competencia = competencia.strip()
    if not competencia:
        raise HTTPException(status_code=400, detail="Competência obrigatória.")

    try:
        tmpdir = tempfile.mkdtemp()
        tmpdir_path = Path(tmpdir)

        pdf_filename = pdf.filename or "holerites.pdf"
        pdf_path = tmpdir_path / pdf_filename
        with open(pdf_path, "wb") as f:
            f.write(await pdf.read())

        out_dir = tmpdir_path / "output"
        zip_path = split_pdf_holerites(pdf_path, out_dir, competencia)

        zip_file = open(zip_path, "rb")

        if background_tasks:
            background_tasks.add_task(shutil.rmtree, tmpdir_path, ignore_errors=True)

        return StreamingResponse(
            zip_file,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename=\"{zip_path.name}\"'},
        )

    except Exception as e:
        print("Erro ao processar holerites:", e)
        raise HTTPException(status_code=500, detail="Erro interno ao processar o PDF.")

class FeriasFuncionarioRequest(BaseModel):
  pdf_path: str  # caminho absoluto do PDF salvo pelo Node (multer)

class FeriasFuncionarioResponse(BaseModel):
  ok: bool
  empresa: str
  total_paginas: int
  total_funcionarios: int
  pasta_saida: str
  zip_path: str
  arquivos: list[str]

@app.post("/api/ferias-funcionario/processar", response_model=FeriasFuncionarioResponse)
def ferias_funcionario_processar(payload: FeriasFuncionarioRequest):
  """
  Endpoint chamado pelo Node.js para processar o PDF de férias por funcionário.
  """
  result = processar_ferias_por_funcionario(Path(payload.pdf_path))
  return {
    "ok": True,
    **result,
  }

# PARA RODAR:
# uvicorn api.integra_api:app --host 127.0.0.1 --port 8001

class LucroItem(BaseModel):
    ano: int
    valor: str

class SocioPF(BaseModel):
    nome: str = ""
    cpf: str = ""
    qualificacao: str = ""

class SocioPJ(BaseModel):
    pj: str = ""
    representante: str = ""
    cpf: str = ""
    qualificacao: str = ""

class GerarAtaParams(BaseModel):
    modelo_id: str
    campos: Dict[str, str]
    lucros: List[LucroItem] = []
    assinaturasPF: List[SocioPF] = []
    assinaturasPJ: List[SocioPJ] = []

@app.get("/api/gerador-atas/modelos")
def api_gerador_atas_modelos():
    modelos = listar_modelos()
    return {"ok": True, "modelos": modelos}


@app.get("/api/gerador-atas/modelos/{modelo_id}")
def api_gerador_atas_campos(modelo_id: str):
    campos = obter_campos_modelo(modelo_id)
    return {"ok": True, **campos}


@app.post("/api/gerador-atas/gerar")
def api_gerador_atas_gerar(params: GerarAtaParams):
    file_name = gerar_ata_core(
        modelo_id=params.modelo_id,
        campos=params.campos,
        lucros=[l.dict() for l in params.lucros],
        assinaturas_pf=[s.dict() for s in params.assinaturasPF],
        assinaturas_pj=[s.dict() for s in params.assinaturasPJ],
    )
    return {
        "ok": True,
        "fileName": file_name,
    }

# modelo Pydantic
class ComprimirPdfParams(BaseModel):
  file_name: str
  file_base64: str
  jpeg_quality: int = 50
  dpi_scale: float = 1.0

# endpoint FastAPI
@app.post("/api/comprimir-pdf/processar")
def processar_comprimir_pdf(params: ComprimirPdfParams):
  pdf_bytes = base64.b64decode(params.file_base64)

  resultado = comprimir_pdf_bytes(
      pdf_bytes=pdf_bytes,
      jpeg_quality=params.jpeg_quality,
      dpi_scale=params.dpi_scale,
  )

  compressed_base64 = base64.b64encode(resultado["compressed_bytes"]).decode("ascii")

  return {
      "ok": True,
      "file_name": params.file_name,
      "original_size": resultado["original_size"],
      "compressed_size": resultado["compressed_size"],
      "reduction_percent": resultado["reduction_percent"],
      "compressed_base64": compressed_base64,
  }

class ExtratorZipRarParams(BaseModel):
    base_dir: str
    max_depth: int = 5

@app.post("/api/extrator-zip-rar/process")
def api_extrator_zip_rar(params: ExtratorZipRarParams):
    base_dir = Path(params.base_dir)

    if not base_dir.exists() or not base_dir.is_dir():
        raise HTTPException(status_code=400, detail="Diretório base inválido.")

    resultado = processar_pasta_zip_rar(base_dir=base_dir, max_depth=params.max_depth)

    return {
        "ok": True,
        "resultado": resultado,
    }
    
class ExcelAbasPdfParams(BaseModel):
    arquivos: List[str]
    pasta_destino: str

class ExcelAbasPdfResultado(BaseModel):
    arquivo_excel: str
    aba: Optional[str] = None
    nome_pdf: Optional[str] = None
    pdf: Optional[str] = None
    sucesso: bool
    erro: Optional[str] = None

class ExcelAbasPdfResponse(BaseModel):
    ok: bool
    resultados: List[ExcelAbasPdfResultado]

@app.post("/api/excel-abas-pdf/processar", response_model=ExcelAbasPdfResponse)
def processar_excel_abas_pdf(params: ExcelAbasPdfParams):
    """
    Endpoint que recebe caminhos de arquivos Excel e uma pasta de destino,
    chama o core e devolve os resultados de cada aba gerada.
    """
    resultados = exportar_abas_para_pdf(
        caminhos_arquivos=params.arquivos,
        pasta_destino=params.pasta_destino,
    )
    return ExcelAbasPdfResponse(ok=True, resultados=resultados)

class ParametrosImportadorRecebimentosMadreScp(BaseModel):
    pdf_path: str
    output_dir: Optional[str] = None

@app.post("/api/importador-recebimentos-madre-scp/processar")
def processar_importador_recebimentos_madre_scp_endpoint(
    params: ParametrosImportadorRecebimentosMadreScp,
):
    resultado = processar_importador_recebimentos_madre_scp(
        pdf_path=params.pdf_path,
        output_dir=params.output_dir,
    )
    return {
        "ok": True,
        "resultado": resultado,
    }
    
class ParametrosGfbrGeradorTxt(BaseModel):
    input_path: Optional[str] = None
    aba_origem: Optional[str] = None
    pdf_itau_1_path: Optional[str] = None
    conta_aplicacao_1: Optional[str] = None
    conta_corrente_1: Optional[str] = None
    pdf_itau_2_path: Optional[str] = None
    conta_aplicacao_2: Optional[str] = None
    conta_corrente_2: Optional[str] = None
    output_dir: Optional[str] = None


@app.post("/api/gfbr-gerador-txt/processar")
def processar_gfbr_gerador_txt_endpoint(params: ParametrosGfbrGeradorTxt):
  resumo = processar_gfbr_gerador_txt(
        input_path=params.input_path,
        aba_origem=params.aba_origem,
        pdf_itau_1_path=params.pdf_itau_1_path,
        conta_aplicacao_1=params.conta_aplicacao_1,
        conta_corrente_1=params.conta_corrente_1,
        pdf_itau_2_path=params.pdf_itau_2_path,
        conta_aplicacao_2=params.conta_aplicacao_2,
        conta_corrente_2=params.conta_corrente_2,
        output_dir=params.output_dir,
    )
  return {
      "ok": True,
      "resumo": resumo,
  }

class ParametrosSeparadorCSVBaixaAutomatica(BaseModel):
  input_path: str
  output_dir: str
  sheet_name: str = "BAIXAS"
  year_source_column: str = "DATA EMISSAO"
  max_linhas_por_arquivo: int = 50
  csv_sep: str = ";"

@app.post("/api/separador-csv-baixa-automatica/processar")
def processar_separador_csv_baixa_automatica(params: ParametrosSeparadorCSVBaixaAutomatica):
  resultado = processar_baixa_automatica_arquivo(
    input_path=params.input_path,
    output_dir=params.output_dir,
    sheet_name=params.sheet_name,
    year_source_column=params.year_source_column,
    max_linhas_por_arquivo=params.max_linhas_por_arquivo,
    csv_sep=params.csv_sep,
  )
  return {
    "ok": resultado.get("ok", False),
    "resultado": resultado,
  }
  
@app.post("/api/conciliador/cartao-wilson")
async def api_conciliador_cartao_wilson(
    razaoPdf: UploadFile = File(...),
    financeiroPdf: UploadFile = File(...),
    valorTol: float = Form(VALOR_TOLERANCIA_PADRAO),
    diasJanela: int = Form(31),
    limiarNome: float = Form(0.72),
):
    try:
        razao_bytes = await razaoPdf.read()
        fin_bytes = await financeiroPdf.read()

        # limites simples anti-bomba (ajuste se precisar)
        if len(razao_bytes) > 25 * 1024 * 1024 or len(fin_bytes) > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="PDF muito grande (limite 25MB por arquivo).")

        return conciliar_cartao_wilson(
            razao_bytes,
            fin_bytes,
            valor_tol=float(valorTol),
            dias_janela=int(diasJanela),
            limiar_nome=float(limiarNome),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/conciliador/cartao-tipo50")
async def api_conciliador_cartao_tipo50(
    arquivoA: UploadFile = File(...),
    arquivoB: UploadFile = File(...),
):
    try:
        arquivo_a_bytes = await arquivoA.read()
        arquivo_b_bytes = await arquivoB.read()

        if len(arquivo_a_bytes) > 25 * 1024 * 1024 or len(arquivo_b_bytes) > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="PDF muito grande (limite 25MB por arquivo).")

        return conciliar_cartao_tipo50(
            arquivo_a_bytes,
            arquivoA.filename or "arquivo_a.pdf",
            arquivo_b_bytes,
            arquivoB.filename or "arquivo_b.pdf",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/conciliador/pis-cofins")
async def api_conciliador_pis_cofins(
    arquivos: List[UploadFile] = File(...),
    modo: str = Form("AUTO"),
):
    try:
        if not arquivos or len(arquivos) < 3:
            raise HTTPException(status_code=400, detail="Envie no minimo 3 PDFs.")

        payload: list[tuple[str, bytes]] = []
        for arq in arquivos:
            conteudo = await arq.read()
            if len(conteudo) > 25 * 1024 * 1024:
                raise HTTPException(status_code=413, detail=f"PDF muito grande: {arq.filename}")
            payload.append((arq.filename or "arquivo.pdf", conteudo))

        return conciliar_pis_cofins(payload, modo=modo)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class GiastEntry(BaseModel):
    uf: str
    dueDate: str
    valueIcms: float | str
    valueFcp: float | str
    valueDevolutions: float | str = 0
    valuePrepayments: float | str = 0


class GiastDeclarant(BaseModel):
    cnpj: str
    name: str
    cpf: str = ""
    role: str = ""
    phoneDdd: str = ""
    phoneNumber: str = ""
    faxDdd: str = ""
    faxNumber: str = ""
    email: str = ""
    location: str = ""
    signatureDate: str = ""
    stateRegistrations: Dict[str, str] = {}


class GiastGenerateParams(BaseModel):
    periodRef: str
    fileName: Optional[str] = None
    declarant: GiastDeclarant
    entries: List[GiastEntry]


@app.post("/api/giast/gerar")
def api_giast_gerar(params: GiastGenerateParams):
    try:
        result = gerar_giast_txt(
            {
                "periodRef": params.periodRef,
                "fileName": params.fileName,
                "declarant": params.declarant.model_dump(),
                "entries": [entry.model_dump() for entry in params.entries],
            }
        )

        txt_bytes = result["text"].encode("latin1", errors="ignore")
        return {
            "ok": True,
            "fileName": result["file_name"],
            "lineCount": result["line_count"],
            "blockCount": result["block_count"],
            "txtBase64": base64.b64encode(txt_bytes).decode("ascii"),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        print("Erro ao gerar GIAST:", exc)
        raise HTTPException(status_code=500, detail="Erro interno ao gerar arquivo GIAST.")


@app.post("/api/conversor-extrato-pdf-ofx/processar")
async def api_conversor_extrato_pdf_ofx(
    arquivos: List[UploadFile] = File(...),
    bankid: str = Form("0000"),
    acctid: str | None = Form(None),
):
    if converter_pdf_para_ofx_bytes is None:
        raise HTTPException(
            status_code=503,
            detail="Conversor PDF/OFX indisponivel neste ambiente.",
        )
    try:
        if not arquivos:
            raise HTTPException(status_code=400, detail="Envie pelo menos um PDF.")

        resultados: list[dict] = []
        ofx_gerados: list[tuple[str, bytes]] = []

        for arquivo in arquivos:
            nome = arquivo.filename or "extrato.pdf"
            conteudo = await arquivo.read()
            if not conteudo:
                resultados.append(
                    {
                        "ok": False,
                        "arquivoEntrada": nome,
                        "erro": "Arquivo vazio.",
                    }
                )
                continue
            if len(conteudo) > 25 * 1024 * 1024:
                resultados.append(
                    {
                        "ok": False,
                        "arquivoEntrada": nome,
                        "erro": "Arquivo muito grande (limite 25MB).",
                    }
                )
                continue

            try:
                convertido = converter_pdf_para_ofx_bytes(
                    pdf_bytes=conteudo,
                    nome_arquivo_origem=nome,
                    bankid=bankid,
                    acctid=(acctid or None),
                )
                ofx_bytes = convertido["ofx_bytes"]
                ofx_nome = convertido["nome_saida"]
                ofx_gerados.append((ofx_nome, ofx_bytes))
                resultados.append(
                    {
                        "ok": True,
                        "arquivoEntrada": nome,
                        "arquivoSaida": ofx_nome,
                        "banco": convertido["banco"],
                        "contaDetectada": convertido["conta_detectada"],
                        "contaFinal": convertido["conta_final"],
                        "totalLancamentos": convertido["total_lancamentos"],
                        "saldoFinal": convertido["saldo_final"],
                        "ofxBase64": base64.b64encode(ofx_bytes).decode("ascii"),
                    }
                )
            except Exception as exc:
                resultados.append(
                    {
                        "ok": False,
                        "arquivoEntrada": nome,
                        "erro": str(exc),
                    }
                )

        if not ofx_gerados:
            return {
                "ok": False,
                "totalArquivos": len(arquivos),
                "totalConvertidos": 0,
                "resultados": resultados,
                "error": "Nenhum OFX foi gerado. Verifique os erros individuais abaixo.",
            }

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for nome_ofx, ofx_bytes in ofx_gerados:
                zf.writestr(nome_ofx, ofx_bytes)

        zip_nome = "extratos_convertidos_ofx.zip"
        return {
            "ok": True,
            "totalArquivos": len(arquivos),
            "totalConvertidos": len(ofx_gerados),
            "resultados": resultados,
            "zipFileName": zip_nome,
            "zipBase64": base64.b64encode(zip_buffer.getvalue()).decode("ascii"),
        }
    except HTTPException:
        raise
    except Exception as exc:
        print("Erro no conversor de extrato PDF para OFX:", exc)
        raise HTTPException(status_code=500, detail="Erro interno ao converter extratos para OFX.")
