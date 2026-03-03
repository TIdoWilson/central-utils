# api/integra_api.py

from pathlib import Path
import tempfile
import shutil
import json
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
from api.cartao_horas_iob_core import processar_pdf_cartao_iob

app = FastAPI(title="Integração Python API")

from api.importador_recebimentos_madre_scp_core import (
    processar_importador_recebimentos_madre_scp,
)

from api.ajuste_diario_gfbr_core import ajustar_diario_gfbr

from api.conciliador_cartao_wilson_core import conciliar_cartao_wilson, VALOR_TOLERANCIA_PADRAO
from api.conciliador_cartao_tipo50_core import conciliar_cartao_tipo50
from api.conciliador_pis_cofins_core import conciliar_pis_cofins


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

@app.post("/api/cartao-horas-iob/processar")
async def processar_cartao_horas_iob_endpoint(
    arquivo: UploadFile = File(...),
    eventos_json: str = Form("{}"),
):
    try:
        pdf_bytes = await arquivo.read()
        try:
            eventos_config = json.loads(eventos_json or "{}")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Configuracao de eventos invalida.") from exc

        resultado = processar_pdf_cartao_iob(
            pdf_bytes=pdf_bytes,
            nome_arquivo=arquivo.filename or "cartao.pdf",
            eventos_config=eventos_config,
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
            "eventosPadrao": resultado["eventos_padrao"],
            "previewLinhas": resultado["linhas"][:20],
        }
    except HTTPException:
        raise
    except Exception as exc:
        print("Erro ao processar cartao horas IOB:", exc)
        raise HTTPException(status_code=500, detail="Erro interno ao processar o PDF do cartao.")
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
        raise HTTPException(status_code=400, detail="Arquivo PDF de entrada não encontrado.")

    competencia = params.competencia.strip()
    if not competencia:
        raise HTTPException(status_code=400, detail="Competência não informada.")

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
    
class ParametrosAjusteDiarioGfbr(BaseModel):
  input_xlsx_path: str
  aba_origem: Optional[str] = None
  criar_backup: bool = True

@app.post("/api/ajuste-diario-gfbr/processar")
def processar_ajuste_diario_gfbr(params: ParametrosAjusteDiarioGfbr):
  resumo = ajustar_diario_gfbr(
      input_xlsx_path=params.input_xlsx_path,
      aba_origem=params.aba_origem,
      criar_backup=params.criar_backup,
  )
  return {
      "ok": True,
      "resumo": resumo,
  }

class ParametrosSeparadorCSVBaixaAutomatica(BaseModel):
  input_path: str
  output_dir: str
  sheet_name: str = "BAIXAS"
  year_source_column: str = "DATA EMISSÃO"
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
