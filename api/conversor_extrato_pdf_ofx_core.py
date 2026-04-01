from __future__ import annotations

import io
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

import cv2
import pypdfium2 as pdfium
from pypdf import PdfReader
from rapidocr_onnxruntime import RapidOCR

CURDEF = "BRL"
ACCTTYPE = "CHECKING"
ACCTID_PADRAO = "0000"
OFX_HEADER = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE
"""


@dataclass
class Lancamento:
    data: datetime
    valor: float
    memo: str
    documento: str

    @property
    def trntype(self) -> str:
        return "CREDIT" if self.valor >= 0 else "DEBIT"

    @property
    def dtposted(self) -> str:
        return self.data.strftime("%Y%m%d") + "120000"


def parse_valor_br(texto: str) -> float:
    texto = texto.strip()
    texto = texto.replace("\xa0", " ").replace("'", ",")
    texto = re.sub(r"\s+", "", texto)
    negativo = texto.startswith("-") or texto.endswith("-") or (texto.startswith("(") and texto.endswith(")"))
    if texto.startswith("-"):
        texto = texto[1:]
    if texto.endswith("-"):
        texto = texto[:-1]
    if texto.startswith("(") and texto.endswith(")"):
        texto = texto[1:-1]
    texto = texto.replace(".", "").replace(",", ".")
    valor = float(texto)
    return -valor if negativo else valor


def formatar_valor_br(valor: float) -> str:
    sinal = "-" if valor < 0 else ""
    numero = f"{abs(valor):.2f}".replace(".", ",")
    return f"{sinal}{numero}"


def ler_texto_pdf_bytes(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    partes: list[str] = []
    for pagina in reader.pages:
        partes.append(pagina.extract_text() or "")
    return "\n".join(partes)


_OCR_ENGINE: RapidOCR | None = None


def obter_ocr_engine() -> RapidOCR:
    global _OCR_ENGINE
    if _OCR_ENGINE is None:
        _OCR_ENGINE = RapidOCR()
    return _OCR_ENGINE


def normalizar_texto_ocr(texto: str) -> str:
    texto = texto.replace("\xa0", " ")
    texto = texto.replace("\r", " ").replace("\n", " ")
    return re.sub(r"\s+", " ", texto).strip()


def corrigir_data_ocr(data_txt: str, month_hint: int | None = None) -> str:
    data_txt = data_txt.strip()
    try:
        data_valida = datetime.strptime(data_txt, "%d/%m/%Y")
        if 2000 <= data_valida.year <= 2100:
            return data_txt
    except ValueError:
        pass

    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", data_txt)
    if not m:
        return data_txt

    dia, mes, ano = m.groups()
    if len(dia) == 1:
        dia = f"0{dia}"
    elif int(dia) > 31:
        dia = f"0{dia[-1]}"

    mes_num = int(mes)
    if month_hint is not None and (len(mes) == 1 or mes_num < 1 or mes_num > 12):
        mes_num = month_hint
    elif mes_num > 12:
        return data_txt

    if len(ano) == 2:
        ano = f"20{ano}"
    elif ano.startswith("2") and len(ano) in (3, 4):
        ano = f"20{ano[-2:]}"

    candidato = f"{dia}/{mes_num:02d}/{ano}"
    try:
        datetime.strptime(candidato, "%d/%m/%Y")
        return candidato
    except ValueError:
        return data_txt


def extrair_valor_ocr(texto: str) -> str | None:
    texto = texto.replace("\xa0", " ").replace("'", ",")
    texto = re.sub(r",\s+(?=\d)", ",", texto)
    candidatos: list[tuple[int, str]] = []
    for m in re.finditer(r"-?[\d][\d\.\,']*", texto):
        candidato = m.group(0).replace("'", ",").replace("\xa0", " ").strip()
        if re.search(r"[A-Za-z]", candidato):
            continue
        if not re.search(r"[\d\.,]", candidato):
            continue
        candidatos.append((m.start(), candidato))

    if not candidatos:
        return None

    candidatos.sort(key=lambda item: item[0])
    return candidatos[-1][1]


def ocr_clusters_doc(doc: pdfium.PdfDocument, numero_pagina: int, scale: float = 1.25) -> list[list[tuple[float, str]]]:
    pagina = doc[numero_pagina]
    arr = pagina.render(scale=scale).to_numpy()

    if arr.ndim == 3 and arr.shape[2] == 3:
        imagem = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    elif arr.ndim == 3 and arr.shape[2] == 4:
        imagem = cv2.cvtColor(arr, cv2.COLOR_RGBA2BGR)
    else:
        imagem = arr

    resultados, _ = obter_ocr_engine()(imagem)
    itens: list[tuple[float, float, str]] = []
    for box, texto, _score in resultados or []:
        top = min(pt[1] for pt in box)
        left = min(pt[0] for pt in box)
        itens.append((top, left, normalizar_texto_ocr(texto)))

    itens.sort(key=lambda item: (item[0], item[1]))
    clusters: list[list[tuple[float, str]]] = []
    atual: list[tuple[float, str]] = []
    topo_atual: float | None = None
    for top, left, texto in itens:
        if topo_atual is None or abs(top - topo_atual) <= 12:
            atual.append((left, texto))
            topo_atual = top if topo_atual is None else (topo_atual + top) / 2
        else:
            clusters.append(sorted(atual, key=lambda item: item[0]))
            atual = [(left, texto)]
            topo_atual = top
    if atual:
        clusters.append(sorted(atual, key=lambda item: item[0]))
    return clusters


def ocr_clusters_pagina(pdf_bytes: bytes, numero_pagina: int, scale: float = 1.25) -> list[list[tuple[float, str]]]:
    doc = pdfium.PdfDocument(pdf_bytes)
    try:
        return ocr_clusters_doc(doc, numero_pagina, scale=scale)
    finally:
        doc.close()


def ocr_texto_primeira_pagina(pdf_bytes: bytes) -> str:
    linhas = []
    for cluster in ocr_clusters_pagina(pdf_bytes, 0, scale=1.8):
        linha = " ".join(texto for _left, texto in cluster).strip()
        if linha:
            linhas.append(linha)
    return "\n".join(linhas)


def detectar_banco(texto_pdf: str, texto_ocr: str | None = None) -> str:
    texto_maiusculo = texto_pdf.upper()
    if "EVOLUA" in texto_maiusculo and "EXTRATO ESPECIAL" in texto_maiusculo:
        return "evolua"
    if "SICREDI" in texto_maiusculo and "EXTRATO DE CONTA CORRENTE" in texto_maiusculo:
        return "sicredi"
    if "STONE" in texto_maiusculo and "EXTRATO DE CONTA" in texto_maiusculo:
        return "stone"
    if texto_ocr:
        texto_maiusculo = texto_ocr.upper()
        if "EVOLUA" in texto_maiusculo and "EXTRATO" in texto_maiusculo:
            return "evolua"
        if "COOPERATIVA" in texto_maiusculo and "BANCO: 085" in texto_maiusculo:
            return "evolua"
        if "SICREDI" in texto_maiusculo and "EXTRATO DE CONTA CORRENTE" in texto_maiusculo:
            return "sicredi"
        if "STONE" in texto_maiusculo and "EXTRATO DE CONTA" in texto_maiusculo:
            return "stone"
    raise ValueError("Nao foi possivel identificar o banco neste PDF.")


def extrair_conta(texto_pdf: str, banco: str, texto_ocr: str | None = None) -> str:
    if banco == "evolua":
        m = re.search(r"CONTA/DV:\s*([0-9\.\-]+)", texto_pdf, flags=re.IGNORECASE)
        if m:
            return re.sub(r"\D", "", m.group(1))
    if banco == "sicredi":
        m = re.search(r"\b(\d{6,}-\d)\b", texto_pdf)
        if m:
            return m.group(1).replace("-", "")
    if banco == "stone":
        m = re.search(r"Conta\s*:?\s*([0-9\.\/\-]+)", texto_pdf, flags=re.IGNORECASE)
        if m:
            return re.sub(r"\D", "", m.group(1))
    if texto_ocr:
        if banco == "evolua":
            m = re.search(r"Conta\s*:?\s*([0-9\.\/\-]+)", texto_ocr, flags=re.IGNORECASE)
            if m:
                return re.sub(r"\D", "", m.group(1))
        if banco == "sicredi":
            m = re.search(r"\b(\d{6,}-\d)\b", texto_ocr)
            if m:
                return m.group(1).replace("-", "")
        if banco == "stone":
            m = re.search(r"Conta\s*:?\s*([0-9\.\/\-]+)", texto_ocr, flags=re.IGNORECASE)
            if m:
                return re.sub(r"\D", "", m.group(1))
    return ACCTID_PADRAO


def parse_evolua(texto_pdf: str) -> tuple[list[Lancamento], float | None]:
    regex_linha = re.compile(
        r"^\s*(\d{2}/\d{2}/\d{2})\s+(.+?)\s{2,}([0-9 .:/-]+?)\s{2,}([\d\.,-]+)\s+([CD])(?:\s{2,}([\d\.,-]+))?\s*$"
    )
    lancamentos: list[Lancamento] = []
    saldo_final: float | None = None

    for linha in texto_pdf.splitlines():
        m = regex_linha.match(linha)
        if not m:
            continue
        data_txt, historico, documento, valor_txt, dc, saldo_txt = m.groups()
        data = datetime.strptime(data_txt, "%d/%m/%y")
        valor = parse_valor_br(valor_txt)
        if dc == "D":
            valor = -abs(valor)
        else:
            valor = abs(valor)
        if saldo_txt:
            saldo_final = parse_valor_br(saldo_txt)
        lancamentos.append(
            Lancamento(
                data=data,
                valor=valor,
                memo=historico.strip()[:80],
                documento=documento.strip()[:30],
            )
        )
    return lancamentos, saldo_final


def parse_evolua_ocr(pdf_bytes: bytes) -> tuple[list[Lancamento], float | None]:
    regex_data = re.compile(r"(\d{1,2}/\d{1,2}/\d{2,4})")
    regex_valor = re.compile(r"-?\d[\d\.]*,\d{1,2}")
    regex_doc = re.compile(r"([0-9][0-9\./-]{2,})\s*$")

    lancamentos: list[Lancamento] = []
    saldo_anterior: float | None = None
    saldo_final: float | None = None
    ultima_data_valida: datetime | None = None

    def normalizar_memo_evolua(memo: str) -> str:
        memo = re.sub(r"\s+", " ", memo).strip()
        memo = re.sub(r"\bCR\.\s*INTERNET\b", "CR.INTERNET", memo, flags=re.IGNORECASE)
        memo = re.sub(r"\bPG\.\s*P/INTERNET\b", "PG.P/INTERNET", memo, flags=re.IGNORECASE)
        memo = re.sub(r"\bDEBITO PIX\s*-\s*", "DEBITO PIX -", memo, flags=re.IGNORECASE)
        memo = re.sub(r"\bCREDITO PIX\s*-\s*", "CREDITO PIX -", memo, flags=re.IGNORECASE)
        memo = re.sub(r"\bPG\.P/INTERNET\s*-\s*", "PG.P/INTERNET - ", memo, flags=re.IGNORECASE)
        memo = re.sub(r"\bCREDITO TED\s*-\s*", "CREDITO TED - ", memo, flags=re.IGNORECASE)
        memo = re.sub(r"\bCR\.INTERNET\s*-\s*", "CR.INTERNET - ", memo, flags=re.IGNORECASE)
        memo = re.sub(r"^(PREST\.EMPREST|CRED\.PARC\.EMPRESTIMO)\b.*$", r"\1", memo, flags=re.IGNORECASE)
        memo = re.sub(r"^(TAXA C/C NEG\.)\b.*$", r"\1", memo, flags=re.IGNORECASE)
        memo = re.sub(r"\s*-\s*$", "", memo)
        return memo.strip()

    def token_curto_faz_parte_do_historico(memo_raw: str, documento_txt: str) -> bool:
        if not documento_txt or not documento_txt.isdigit() or len(documento_txt) > 2:
            return False
        memo_maiusculo = memo_raw.upper()
        marcadores = (
            "PREST.EMPREST",
            "CRED.PARC.EMPRESTIMO",
            "CRED .PARC.EMPRESTIMO",
            "MULTA ",
            "JUROS DE MORA",
        )
        return any(marcador in memo_maiusculo for marcador in marcadores)

    def inferir_mes_pagina(clusters: list[list[tuple[float, str]]]) -> int | None:
        for cluster in clusters:
            linha = normalizar_texto_ocr(" ".join(texto for _left, texto in cluster))
            if "SALDO ANTERIOR" in linha.upper():
                continue
            for m_data in regex_data.finditer(linha):
                data_corrigida = corrigir_data_ocr(m_data.group(1))
                try:
                    data = datetime.strptime(data_corrigida, "%d/%m/%Y")
                except ValueError:
                    continue
                return data.month
        return None

    def quebrar_por_datas(linha: str) -> list[str]:
        matches = list(regex_data.finditer(linha))
        if not matches:
            return []
        segmentos: list[str] = []
        for idx, match in enumerate(matches):
            inicio = match.start()
            fim = matches[idx + 1].start() if idx + 1 < len(matches) else len(linha)
            segmento = linha[inicio:fim].strip()
            if segmento:
                segmentos.append(segmento)
        return segmentos

    doc = pdfium.PdfDocument(pdf_bytes)
    try:
        if len(doc) > 0:
            for cluster in ocr_clusters_doc(doc, 0, scale=1.8):
                linha = " ".join(texto for _left, texto in cluster).strip()
                if "SALDO ANTERIOR" not in linha.upper():
                    continue
                m_saldo = re.search(r"SALDO ANTERIOR\s+(.+)$", linha, flags=re.IGNORECASE)
                if m_saldo:
                    saldo_txt = extrair_valor_ocr(m_saldo.group(1))
                    if saldo_txt is not None:
                        try:
                            saldo_anterior = parse_valor_br(saldo_txt)
                        except ValueError:
                            pass
                break

        for numero_pagina in range(len(doc)):
            clusters = ocr_clusters_doc(doc, numero_pagina, scale=1.8)
            page_month_hint = inferir_mes_pagina(clusters)

            for cluster in clusters:
                if not cluster:
                    continue

                linha = normalizar_texto_ocr(" ".join(texto for _left, texto in cluster))
                linha_maiuscula = linha.upper()
                if "SALDO ANTERIOR" in linha_maiuscula:
                    if saldo_anterior is not None:
                        continue
                    m_saldo = re.search(r"SALDO ANTERIOR\s+(.+)$", linha, flags=re.IGNORECASE)
                    if m_saldo:
                        saldo_txt = extrair_valor_ocr(m_saldo.group(1))
                        if saldo_txt is not None:
                            try:
                                saldo_anterior = parse_valor_br(saldo_txt)
                            except ValueError:
                                pass
                    continue

                for segmento in quebrar_por_datas(linha):
                    m_data = regex_data.match(segmento)
                    if not m_data or saldo_anterior is None:
                        continue

                    data_txt = m_data.group(1)
                    segmento_num = segmento.replace("'", ",")
                    segmento_num = re.sub(r",\s+(?=\d)", ",", segmento_num)
                    resto = segmento_num[m_data.end():].strip()
                    valores = list(regex_valor.finditer(resto))
                    if not valores:
                        continue

                    saldo_txt = valores[-1].group(0)
                    try:
                        saldo_atual = parse_valor_br(saldo_txt)
                    except ValueError:
                        continue

                    valor_coluna: float | None = None
                    if len(valores) >= 2:
                        try:
                            valor_coluna = parse_valor_br(valores[-2].group(0))
                        except ValueError:
                            valor_coluna = None
                    elif len(valores) == 1:
                        try:
                            valor_coluna = parse_valor_br(valores[0].group(0))
                            saldo_atual = saldo_anterior + valor_coluna
                        except ValueError:
                            valor_coluna = None

                    memo_raw = resto[: valores[0].start()].strip()
                    documento_txt = ""
                    m_doc = regex_doc.search(memo_raw)
                    if m_doc:
                        documento_txt = m_doc.group(1)
                        memo_raw = memo_raw[: m_doc.start()].strip()
                        if token_curto_faz_parte_do_historico(memo_raw, documento_txt):
                            memo_raw = f"{memo_raw} {documento_txt}".strip()
                            documento_txt = ""

                    memo = normalizar_texto_ocr(memo_raw)
                    memo = normalizar_memo_evolua(memo)

                    data_corrigida = corrigir_data_ocr(data_txt, month_hint=page_month_hint)
                    try:
                        data = datetime.strptime(data_corrigida, "%d/%m/%Y")
                        ultima_data_valida = data
                    except ValueError:
                        if ultima_data_valida is None:
                            continue
                        data = ultima_data_valida

                    valor_delta = saldo_atual - saldo_anterior
                    if valor_coluna is None:
                        valor = valor_delta
                    elif abs(valor_coluna) < 1 and abs(valor_delta) > 1:
                        valor = valor_delta
                    else:
                        valor = valor_coluna

                    lancamentos.append(
                        Lancamento(
                            data=data,
                            valor=valor,
                            memo=memo[:80],
                            documento=documento_txt[:30],
                        )
                    )
                    saldo_anterior = saldo_atual
                    saldo_final = saldo_atual
    finally:
        doc.close()

    return lancamentos, saldo_final


def parse_sicredi_ccpi_iguacu(texto_pdf: str) -> tuple[list[Lancamento], float | None]:
    regex_data = re.compile(r"(\d{2}/\d{2}/\d{4})")
    regex_valor = re.compile(r"-?\d{1,3}(?:\.\d{3})*,\d{2}")

    def limpar_segmento(segmento: str) -> str:
        segmento = segmento.split("Continua na pagina")[0]
        segmento = segmento.split("SALDO ATUAL......:")[0]
        segmento = segmento.split("SALDO ATUAL")[0]
        segmento = segmento.split("====================================================================")[0]
        return segmento.strip()

    def token_parece_documento(token: str) -> bool:
        token = token.strip()
        if not token:
            return False
        token_maiusculo = token.upper()
        if token_maiusculo in {
            "RECEBIMENTO",
            "PAGAMENTO",
            "RENOVACAO",
            "LIQUIDACAO",
            "SEGURO",
            "JUROS",
            "IOF",
            "DEBITO",
            "CREDITO",
            "SALDO",
            "DEP",
            "SAQUE",
            "ENC",
            "SICREDI",
            "TARIFA",
        }:
            return False
        return bool(re.search(r"\d", token) or any(ch in token for ch in "._-/|"))

    def classificar_sinal(texto: str) -> int:
        texto = texto.upper()
        positivos = (
            "RECEBIMENTO PIX",
            "SICREDI CREDITO MASTER",
            "SICREDI DEBITO MASTER",
            "SICREDI CREDITO VISA",
            "SICREDI DEBITO VISA",
            "TED ",
            "TED",
            "DEP DINHEIRO",
            "CREDITO PIX",
            "CREDITO VISA",
            "CREDITO MASTER",
        )
        negativos = (
            "PAGAMENTO PIX",
            "PIX_DEB",
            "DEBITO PIX",
            "DEBITO ARRECADACAO",
            "LIQUIDACAO BOLETO",
            "LIQUIDACAO DE PARCELA",
            "IOF ",
            "IOF",
            "JUROS",
            "RENOVACAO",
            "SEGURO",
            "SAQUE",
            "ENC",
            "TARIFA",
            "CH. ESP",
            "CH ESP",
        )
        if any(marcador in texto for marcador in positivos):
            return 1
        if any(marcador in texto for marcador in negativos):
            return -1
        return 0

    saldo_anterior: float | None = None
    m_saldo_inicial = re.search(
        r"S\s*A\s*L\s*D\s*O\s+A\s*N\s*T\s*E\s*R\s*I\s*O\s*R\s+(-?\d[\d\.]*,\d{2})",
        texto_pdf,
        flags=re.IGNORECASE,
    )
    if m_saldo_inicial:
        try:
            saldo_anterior = parse_valor_br(m_saldo_inicial.group(1))
        except ValueError:
            saldo_anterior = None

    lancamentos: list[Lancamento] = []
    saldo_final: float | None = saldo_anterior
    matches = list(regex_data.finditer(texto_pdf))

    for idx in range(1, len(matches)):
        inicio = matches[idx].start()
        fim = matches[idx + 1].start() if idx + 1 < len(matches) else len(texto_pdf)
        segmento = limpar_segmento(texto_pdf[inicio:fim])
        if not segmento:
            continue

        segmento_maiusculo = segmento.upper()
        if "PERIODO:" in segmento_maiusculo or "EXTRATO DE CONTA CORRENTE" in segmento_maiusculo:
            continue
        if not regex_data.match(segmento):
            continue

        m_data = regex_data.match(segmento)
        if not m_data:
            continue

        resto = segmento[m_data.end():].strip()
        valores = list(regex_valor.finditer(resto))
        if not valores:
            continue

        data_txt = m_data.group(1)
        trecho_historico = resto[: valores[0].start()].strip()
        documento_txt = ""
        if trecho_historico:
            partes = trecho_historico.split(maxsplit=1)
            if partes and token_parece_documento(partes[0]):
                documento_txt = partes[0]
                trecho_historico = partes[1] if len(partes) > 1 else ""

        if len(valores) >= 2 and saldo_anterior is not None:
            saldo_lido = parse_valor_br(valores[-1].group(0))
            valor = saldo_lido - saldo_anterior
            saldo_anterior = saldo_lido
            saldo_final = saldo_lido
        else:
            valor_base = parse_valor_br(valores[0].group(0))
            sentido = classificar_sinal(f"{documento_txt} {trecho_historico}")
            if sentido == 0:
                sentido = 1
            valor = valor_base * sentido
            if saldo_anterior is not None:
                saldo_anterior += valor

        lancamentos.append(
            Lancamento(
                data=datetime.strptime(data_txt, "%d/%m/%Y"),
                valor=valor,
                memo=trecho_historico[:80],
                documento=documento_txt[:30],
            )
        )

    return lancamentos, saldo_final


def parse_sicredi(texto_pdf: str) -> tuple[list[Lancamento], float | None]:
    if "CCPI IGUACU" in texto_pdf.upper():
        return parse_sicredi_ccpi_iguacu(texto_pdf)

    regex_base = re.compile(r"^\s*(\d{2}/\d{2}/\d{4})\s+(\S+)\s+(.+)$")
    regex_valor = re.compile(r"-?\d{1,3}(?:\.\d{3})*,\d{2}-?")

    lancamentos: list[Lancamento] = []
    saldo_final: float | None = None

    for linha in texto_pdf.splitlines():
        m = regex_base.match(linha)
        if not m:
            continue
        data_txt, documento, resto = m.groups()
        valores = list(regex_valor.finditer(resto))
        if not valores:
            continue

        # Em alguns historicos pode existir valor textual (ex.: "... ARMARINHOS 1,99")
        # antes da coluna real de debito/credito. Prioriza valores com "cara de coluna":
        # precedidos por 2+ espacos.
        valores_coluna: list[re.Match[str]] = []
        for m_valor in valores:
            i = m_valor.start() - 1
            espacos_antes = 0
            while i >= 0 and resto[i] == " ":
                espacos_antes += 1
                i -= 1
            if espacos_antes >= 2:
                valores_coluna.append(m_valor)

        valores_escolhidos = valores_coluna if valores_coluna else valores
        primeiro = valores_escolhidos[0]
        historico = resto[: primeiro.start()].strip()
        valor = parse_valor_br(primeiro.group())

        # Mantem a heuristica atual baseada em coluna no texto extraido.
        eh_credito = primeiro.start() >= 72
        valor = abs(valor) if eh_credito else -abs(valor)

        if len(valores_escolhidos) >= 2:
            saldo_final = parse_valor_br(valores_escolhidos[-1].group())
        elif len(valores) >= 2:
            saldo_final = parse_valor_br(valores[-1].group())

        lancamentos.append(
            Lancamento(
                data=datetime.strptime(data_txt, "%d/%m/%Y"),
                valor=valor,
                memo=historico[:80],
                documento=documento[:30],
            )
        )

    return lancamentos, saldo_final


def parse_stone(texto_pdf: str) -> tuple[list[Lancamento], float | None]:
    """Parser para extratos Stone em blocos multiline e linhas unicas."""

    regex_inicio = re.compile(r"^(\d{2}/\d{2}/\d{2})\s+(Entrada|Sa\S*da)\b", re.IGNORECASE)
    regex_valores = re.compile(r"(-?\s*R\$\s*[\d\.,]+)\s+(R\$\s*[\d\.,]+)(?:\s+(.*))?$", re.IGNORECASE)
    cabecalhos_ignorados = (
        "EXTRATO DE CONTA CORRENTE",
        "EMITIDO EM ",
        "PAGINA ",
        "PÁGINA ",
        "PERIODO:",
        "PERÍODO:",
        "DADOS DA CONTA",
        "DATA TIPO DESCRICAO VALOR SALDO CONTRAPARTE",
        "DATA TIPO DESCRIÇÃO VALOR SALDO CONTRAPARTE",
        "NOME",
        "DOCUMENTO",
        "INSTITUICAO",
        "INSTITUIÇÃO",
        "AGENCIA",
        "AGÊNCIA",
        "CONTA",
        "INFORMAÇÕES DO COMPROVANTE",
        "CODIGO DE AUTENTICACAO",
        "CÓDIGO DE AUTENTICAÇÃO",
        "OUVIDORIA",
        "DÚVIDAS?",
        "DUVIDAS?",
        "CNPJ:",
        "REGIÕES METROPOLITANAS",
        "OUTRAS REGIÕES",
        "ENVIE UM WHATSAPP",
    )

    def limpar_valor_stone(texto: str) -> str:
        return texto.replace("R$", "").replace(" ", "").strip()

    def normalizar_tipo(tipo: str) -> str:
        return "saida" if tipo.lower().startswith("sa") else "entrada"

    def eh_linha_ignorada(linha: str) -> bool:
        texto = linha.strip()
        if not texto:
            return True
        texto_maiusculo = texto.upper()
        return any(texto_maiusculo.startswith(prefixo) for prefixo in cabecalhos_ignorados)

    def montar_lancamento(
        data_txt: str,
        tipo_txt: str,
        valor_txt: str,
        saldo_txt: str,
        descricao: list[str],
        contraparte: list[str],
    ) -> tuple[Lancamento, float]:
        data = datetime.strptime(data_txt, "%d/%m/%y")
        valor = parse_valor_br(limpar_valor_stone(valor_txt))
        if normalizar_tipo(tipo_txt) == "saida":
            valor = -abs(valor)
        else:
            valor = abs(valor)

        saldo_atual = parse_valor_br(limpar_valor_stone(saldo_txt))
        memo = " ".join(parte for parte in descricao if parte).strip()
        memo = re.sub(r"\s+-\s*$", "", memo).strip()
        documento = " ".join(parte for parte in contraparte if parte).strip()

        return (
            Lancamento(
                data=data,
                valor=valor,
                memo=memo[:100],
                documento=documento[:30],
            ),
            saldo_atual,
        )

    linhas = texto_pdf.splitlines()
    lancamentos: list[Lancamento] = []
    saldo_final: float | None = None

    i = 0
    while i < len(linhas):
        linha_limpa = linhas[i].strip()
        m_inicio = regex_inicio.match(linha_limpa)

        if not m_inicio:
            i += 1
            continue

        data_txt = m_inicio.group(1)
        tipo_txt = m_inicio.group(2)
        resto_mesma_linha = linha_limpa[m_inicio.end():].strip()
        descricao_acumulada: list[str] = []
        contraparte_acumulada: list[str] = []
        linha_com_valores: tuple[str, str, str] | None = None

        if resto_mesma_linha:
            m_val_mesma_linha = regex_valores.search(resto_mesma_linha)
            if m_val_mesma_linha:
                antes_dos_valores = resto_mesma_linha[:m_val_mesma_linha.start()].strip()
                if antes_dos_valores:
                    descricao_acumulada.append(antes_dos_valores)
                linha_com_valores = (
                    m_val_mesma_linha.group(1),
                    m_val_mesma_linha.group(2),
                    (m_val_mesma_linha.group(3) or "").strip(),
                )
                i += 1
            else:
                descricao_acumulada.append(resto_mesma_linha)
                i += 1
        else:
            i += 1

        if linha_com_valores is None:
            while i < len(linhas):
                proxima_linha = linhas[i].strip()
                if regex_inicio.match(proxima_linha):
                    break

                m_val = regex_valores.search(proxima_linha)
                if m_val:
                    antes_dos_valores = proxima_linha[:m_val.start()].strip()
                    if antes_dos_valores:
                        descricao_acumulada.append(antes_dos_valores)
                    linha_com_valores = (
                        m_val.group(1),
                        m_val.group(2),
                        (m_val.group(3) or "").strip(),
                    )
                    i += 1
                    break

                if proxima_linha and not eh_linha_ignorada(proxima_linha):
                    descricao_acumulada.append(proxima_linha)
                i += 1

        if linha_com_valores is None:
            continue

        valor_txt, saldo_txt, contraparte_inline = linha_com_valores
        if contraparte_inline:
            contraparte_acumulada.append(contraparte_inline)

        while i < len(linhas):
            proxima_linha = linhas[i].strip()
            if regex_inicio.match(proxima_linha):
                break
            if not eh_linha_ignorada(proxima_linha):
                contraparte_acumulada.append(proxima_linha)
            i += 1

        try:
            lancamento, saldo_atual = montar_lancamento(
                data_txt=data_txt,
                tipo_txt=tipo_txt,
                valor_txt=valor_txt,
                saldo_txt=saldo_txt,
                descricao=descricao_acumulada,
                contraparte=contraparte_acumulada,
            )
            lancamentos.append(lancamento)
            # O extrato Stone vem em ordem decrescente; o primeiro saldo lido e o saldo final.
            if saldo_final is None:
                saldo_final = saldo_atual
        except Exception as e:
            print(f"Erro ao processar linha Stone: {e}")
            continue

    return lancamentos, saldo_final


def montar_ofx(
    lancamentos: Iterable[Lancamento],
    bankid: str,
    acctid: str,
    saldo_final: float | None,
) -> str:
    itens = sorted(lancamentos, key=lambda x: x.data)
    if not itens:
        raise ValueError("Nenhum lancamento foi identificado para gerar OFX.")

    dtstart = itens[0].dtposted
    dtend = itens[-1].dtposted
    if saldo_final is None:
        saldo_final = sum(item.valor for item in itens)

    linhas: list[str] = [OFX_HEADER.rstrip(), "", "<OFX>"]
    linhas.extend(
        [
            "<SIGNONMSGSRSV1>",
            "<SONRS>",
            "<STATUS>",
            "<CODE>0",
            "<SEVERITY>INFO",
            "</STATUS>",
            f"<DTSERVER>{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "<LANGUAGE>POR",
            "</SONRS>",
            "</SIGNONMSGSRSV1>",
            "<BANKMSGSRSV1>",
            "<STMTTRNRS>",
            "<TRNUID>1001",
            "<STATUS>",
            "<CODE>0",
            "<SEVERITY>INFO",
            "</STATUS>",
            "<STMTRS>",
            f"<CURDEF>{CURDEF}",
            "<BANKACCTFROM>",
            f"<BANKID>{bankid}",
            f"<ACCTID>{acctid}",
            f"<ACCTTYPE>{ACCTTYPE}",
            "</BANKACCTFROM>",
            "<BANKTRANLIST>",
            f"<DTSTART>{dtstart}",
            f"<DTEND>{dtend}",
        ]
    )

    for idx, item in enumerate(itens, start=1):
        linhas.extend(
            [
                "<STMTTRN>",
                f"<TRNTYPE>{item.trntype}",
                f"<DTPOSTED>{item.dtposted}",
                f"<TRNAMT>{formatar_valor_br(item.valor)}",
                f"<FITID>N{idx:05d}",
                f"<CHECKNUM>{item.documento or idx}",
                f"<MEMO>{item.memo}",
                "</STMTTRN>",
            ]
        )

    linhas.extend(
        [
            "</BANKTRANLIST>",
            "<LEDGERBAL>",
            f"<BALAMT>{formatar_valor_br(saldo_final)}",
            "<DTASOF>00000000",
            "</LEDGERBAL>",
            "</STMTRS>",
            "</STMTTRNRS>",
            "</BANKMSGSRSV1>",
            "</OFX>",
        ]
    )
    return "\n".join(linhas) + "\n"


def converter_pdf_para_ofx_bytes(
    pdf_bytes: bytes,
    nome_arquivo_origem: str,
    bankid: str,
    acctid: str | None,
) -> dict:
    texto = ler_texto_pdf_bytes(pdf_bytes)
    texto_ocr = None
    try:
        banco = detectar_banco(texto)
    except ValueError:
        texto_ocr = ocr_texto_primeira_pagina(pdf_bytes)
        banco = detectar_banco(texto, texto_ocr)

    conta_detectada = extrair_conta(texto, banco, texto_ocr)
    conta = acctid if acctid else conta_detectada

    if banco == "evolua":
        if texto_ocr:
            lancamentos, saldo_final = parse_evolua_ocr(pdf_bytes)
        else:
            lancamentos, saldo_final = parse_evolua(texto)
    elif banco == "stone":
        lancamentos, saldo_final = parse_stone(texto)
    else:
        lancamentos, saldo_final = parse_sicredi(texto)

    ofx_texto = montar_ofx(lancamentos, bankid=bankid, acctid=conta, saldo_final=saldo_final)
    base = nome_arquivo_origem.rsplit(".", 1)[0] if nome_arquivo_origem else "extrato"
    nome_saida = f"{base}.ofx"

    return {
        "nome_saida": nome_saida,
        "ofx_bytes": ofx_texto.encode("utf-8"),
        "banco": banco,
        "conta_detectada": conta_detectada,
        "conta_final": conta,
        "total_lancamentos": len(lancamentos),
        "saldo_final": saldo_final,
    }
