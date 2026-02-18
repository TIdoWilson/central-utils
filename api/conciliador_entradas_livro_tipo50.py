from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from pathlib import Path
from tkinter import Tk, filedialog, messagebox

import pandas as pd

PASTA_SAIDA = Path(r"W:\DOCUMENTOS ESCRITORIO\INSTALACAO SISTEMA\python\Conciliador Cartão Tipo 50\Arquivos")


def strip_accents(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(ch for ch in s if not unicodedata.combining(ch))


def clean_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", str(s)).strip()


def to_decimal_br(v: str | None) -> float | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    s = re.sub(r"[^\d\.\-]", "", s)
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def ler_linhas_pdf(pdf_path: Path) -> list[str]:
    try:
        from pypdf import PdfReader

        leitor = PdfReader(str(pdf_path))
        texto = "\n".join((p.extract_text() or "") for p in leitor.pages)
    except Exception:
        import pdfplumber

        partes = []
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                partes.append(page.extract_text() or "")
        texto = "\n".join(partes)

    return [ln.strip() for ln in texto.splitlines() if ln.strip()]


def detectar_tipo_pdf(pdf_path: Path) -> str | None:
    txt = "\n".join(ler_linhas_pdf(pdf_path)[:300])
    txt = strip_accents(txt).upper()

    if "REGISTRO DE ENTRADAS - MODELO P1" in txt or "TOTAL GERAL" in txt:
        return "livro"
    if "TIPO 50" in txt and ("ARQUIVO MAGN" in txt or "REGISTROS.:" in txt):
        return "tipo50"
    return None


def selecionar_pdfs() -> tuple[Path, Path]:
    root = Tk()
    root.withdraw()

    messagebox.showinfo(
        "Conciliador Livro x Tipo 50",
        "Selecione exatamente 2 PDFs:\n"
        "1 Livro de Registros IOB e 1 Balancete/Relatorio Tipo 50.",
    )

    arquivos = filedialog.askopenfilenames(
        title="Selecione 2 PDFs para conciliacao",
        filetypes=[("Arquivos PDF", "*.pdf *.PDF"), ("Todos os arquivos", "*.*")],
    )
    root.destroy()

    if len(arquivos) != 2:
        raise RuntimeError("Selecione exatamente 2 arquivos PDF.")

    return Path(arquivos[0]), Path(arquivos[1])


def identificar_livro_tipo50(pdf_a: Path, pdf_b: Path) -> tuple[Path, Path]:
    tipo_a = detectar_tipo_pdf(pdf_a)
    tipo_b = detectar_tipo_pdf(pdf_b)

    if tipo_a is None or tipo_b is None:
        raise RuntimeError("Nao foi possivel identificar um dos arquivos. Selecione 1 Livro e 1 Tipo 50.")
    if tipo_a == tipo_b:
        raise RuntimeError("Os dois arquivos parecem ser do mesmo tipo.")

    return (pdf_a, pdf_b) if tipo_a == "livro" else (pdf_b, pdf_a)


def gerar_arquivo_saida() -> Path:
    agora = datetime.now()
    nome = f"Conciliação_{agora.strftime('%H-%M-%S')}_{agora.strftime('%d-%m-%Y')}.xlsx"
    PASTA_SAIDA.mkdir(parents=True, exist_ok=True)
    return PASTA_SAIDA / nome


def anular_pares_opostos(df: pd.DataFrame) -> pd.DataFrame:
    # Remove pares +X / -X (mesmo valor absoluto em centavos) para nao contaminar a conta final.
    if df.empty:
        return df

    cents = (df["diferenca"].round(2) * 100).astype(int)
    idx_por_valor: dict[int, list[int]] = {}
    for idx, v in cents.items():
        idx_por_valor.setdefault(v, []).append(idx)

    remover: set[int] = set()
    for v in sorted([k for k in idx_por_valor.keys() if k > 0]):
        if -v not in idx_por_valor:
            continue
        qtd_pares = min(len(idx_por_valor[v]), len(idx_por_valor[-v]))
        if qtd_pares <= 0:
            continue
        remover.update(idx_por_valor[v][:qtd_pares])
        remover.update(idx_por_valor[-v][:qtd_pares])

    if not remover:
        return df
    return df.loc[~df.index.isin(remover)].copy()


def parse_livro(pdf_path: Path) -> pd.DataFrame:
    linhas = ler_linhas_pdf(pdf_path)
    rows: list[dict] = []

    re_inicio = re.compile(
        r"^(\d{2}/\d{2}/\d{4})\s+(NFe|NF|CTe)\s+\d+\s+(\d+)\s+\d{2}/\d{2}/\d{4}\s+\d+\s+[A-Z]{2}\s+00\s*/\s*00\s+([\d\.,]+)\s+(\d\.\d{3})"
    )
    re_cont = re.compile(r"^([\d\.,]+)\s+(\d\.\d{3})(?:\s|$)")
    re_moeda = re.compile(r"^(\d{1,3}(?:\.\d{3})*,\d{2})")

    data_atual = None
    nota_atual = None

    for linha in linhas:
        m = re_inicio.match(linha)
        if m:
            data_atual, _esp, nota, token_valor, cfop = m.groups()
            nota_atual = re.sub(r"\D", "", nota)
            mv = re_moeda.match(token_valor)
            if mv:
                rows.append(
                    {
                        "data": data_atual,
                        "numero": nota_atual,
                        "cfop": cfop,
                        "valor_livro": to_decimal_br(mv.group(1)),
                    }
                )
            continue

        m = re_cont.match(linha)
        if m and nota_atual:
            token_valor, cfop = m.groups()
            mv = re_moeda.match(token_valor)
            if mv:
                rows.append(
                    {
                        "data": data_atual,
                        "numero": nota_atual,
                        "cfop": cfop,
                        "valor_livro": to_decimal_br(mv.group(1)),
                    }
                )

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df = (
        df.groupby(["data", "numero", "cfop"], as_index=False)
        .agg(valor_livro=("valor_livro", "sum"))
    )
    df["chave"] = df["data"].astype(str) + "|" + df["numero"].astype(str) + "|" + df["cfop"].astype(str)
    return df


def parse_tipo50(pdf_path: Path) -> pd.DataFrame:
    linhas = ler_linhas_pdf(pdf_path)
    rows: list[dict] = []

    re_inicio = re.compile(r"^(\d{2}/\d{2}/\d{3,4})(.*)$")
    re_nota_cfop_resto = re.compile(r"^\s*(\d+)\s+(\d\.\d{3})\s+(.+)$")
    re_moeda = re.compile(r"^(\d{1,3}(?:\.\d{3})*,\d{2})")

    for linha in linhas:
        m = re_inicio.match(linha)
        if not m:
            continue

        data, resto = m.groups()
        m2 = re_nota_cfop_resto.match(resto)
        if not m2:
            continue

        nota, cfop, sufixo = m2.groups()
        token = sufixo.split()[0] if sufixo.split() else ""
        mv = re_moeda.match(token)
        if not mv:
            continue

        if re.fullmatch(r"\d{2}/\d{2}/\d{3}", data):
            data = data + "6"

        rows.append(
            {
                "data": data,
                "numero": re.sub(r"\D", "", nota),
                "cfop": cfop,
                "valor_tipo50": to_decimal_br(mv.group(1)),
            }
        )

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df = (
        df.groupby(["data", "numero", "cfop"], as_index=False)
        .agg(valor_tipo50=("valor_tipo50", "sum"))
    )
    df["chave"] = df["data"].astype(str) + "|" + df["numero"].astype(str) + "|" + df["cfop"].astype(str)
    return df


def conciliar(df_livro: pd.DataFrame, df_tipo50: pd.DataFrame) -> pd.DataFrame:
    # Regra de negocio: conciliar pelo valor final da NF (ignora quebra por CFOP).
    livro_nf = df_livro.groupby("numero", as_index=False).agg(valor_livro=("valor_livro", "sum"))
    tipo50_nf = df_tipo50.groupby("numero", as_index=False).agg(valor_tipo50=("valor_tipo50", "sum"))

    merge = livro_nf.merge(
        tipo50_nf,
        on="numero",
        how="outer",
    )

    merge["codigo_nf"] = merge["numero"]
    merge["valor_livro"] = merge["valor_livro"].fillna(0.0)
    merge["valor_tipo50"] = merge["valor_tipo50"].fillna(0.0)
    merge["diferenca"] = merge["valor_livro"] - merge["valor_tipo50"]

    discrep = merge[(merge["valor_livro"] == 0.0) | (merge["valor_tipo50"] == 0.0) | (merge["diferenca"].abs() >= 0.01)].copy()
    discrep = discrep[["codigo_nf", "valor_livro", "valor_tipo50", "diferenca"]]
    discrep = anular_pares_opostos(discrep)
    # Residuo pequeno de arredondamento nao entra na conta final.
    discrep = discrep[discrep["diferenca"].abs() > 0.10].copy()
    discrep["diferenca"] = discrep["diferenca"].round(2)
    discrep = discrep.sort_values(by=["codigo_nf"], kind="stable")

    if discrep.empty:
        discrep = pd.DataFrame([
            {
                "codigo_nf": "SEM_DIVERGENCIAS",
                "valor_livro": 0.0,
                "valor_tipo50": 0.0,
                "diferenca": 0.0,
            }
        ])

    return discrep


def tabela_codificacao_diferente(df_livro: pd.DataFrame, df_tipo50: pd.DataFrame) -> pd.DataFrame:
    # Compara valor por NF+CFOP (ex.: NF 106868 deve bater em 1.102 e 1.403 separadamente).
    l = (
        df_livro.groupby(["numero", "cfop"], as_index=False)
        .agg(valor_livro=("valor_livro", "sum"))
    )
    t = (
        df_tipo50.groupby(["numero", "cfop"], as_index=False)
        .agg(valor_tipo50=("valor_tipo50", "sum"))
    )

    m = l.merge(t, on=["numero", "cfop"], how="outer")
    m["valor_livro"] = m["valor_livro"].fillna(0.0)
    m["valor_tipo50"] = m["valor_tipo50"].fillna(0.0)
    m["diferenca"] = (m["valor_livro"] - m["valor_tipo50"]).round(2)

    dif = m[m["diferenca"].abs() >= 0.01].copy()
    if dif.empty:
        return pd.DataFrame(
            [
                {
                    "numero_nota": "SEM_DIFERENCA_CFOP",
                    "cfop": "",
                    "valor_livro": 0.0,
                    "valor_tipo50": 0.0,
                    "diferenca": 0.0,
                }
            ]
        )

    # Anula pares opostos (+X / -X) apenas dentro do mesmo CFOP.
    cents = (dif["diferenca"].round(2) * 100).astype(int)
    idx_por_chave: dict[tuple[str, int], list[int]] = {}
    for idx, v in cents.items():
        cfop = str(dif.loc[idx, "cfop"])
        idx_por_chave.setdefault((cfop, v), []).append(idx)

    remover: set[int] = set()
    cfops = sorted(set(str(c) for c in dif["cfop"].astype(str)))
    for cfop in cfops:
        positivos = [k for (c, k) in idx_por_chave.keys() if c == cfop and k > 0]
        for v in sorted(positivos):
            chave_pos = (cfop, v)
            chave_neg = (cfop, -v)
            if chave_neg not in idx_por_chave:
                continue
            qtd_pares = min(len(idx_por_chave[chave_pos]), len(idx_por_chave[chave_neg]))
            if qtd_pares <= 0:
                continue
            remover.update(idx_por_chave[chave_pos][:qtd_pares])
            remover.update(idx_por_chave[chave_neg][:qtd_pares])

    if remover:
        dif = dif.loc[~dif.index.isin(remover)].copy()

    # Ignora residuo pequeno de arredondamento.
    dif = dif[dif["diferenca"].abs() > 0.10].copy()

    dif = dif.rename(columns={"numero": "numero_nota"})
    dif = dif[["numero_nota", "cfop", "valor_livro", "valor_tipo50", "diferenca"]]
    dif = dif.sort_values(by=["numero_nota", "cfop"], kind="stable")
    return dif


def main() -> None:
    pdf_a, pdf_b = selecionar_pdfs()
    pdf_livro, pdf_tipo50 = identificar_livro_tipo50(pdf_a, pdf_b)

    df_livro = parse_livro(pdf_livro)
    df_tipo50 = parse_tipo50(pdf_tipo50)

    if df_livro.empty:
        raise RuntimeError("Nao consegui extrair dados do LIVRO (Registro de Entradas).")
    if df_tipo50.empty:
        raise RuntimeError("Nao consegui extrair dados do Tipo 50.")

    discrepancias = conciliar(df_livro, df_tipo50)
    codif_diferente = tabela_codificacao_diferente(df_livro, df_tipo50)
    arquivo_saida = gerar_arquivo_saida()

    with pd.ExcelWriter(arquivo_saida, engine="openpyxl") as xw:
        discrepancias.to_excel(xw, sheet_name="discrepancias", index=False)
        codif_diferente.to_excel(xw, sheet_name="codificacao_diferente", index=False)

    print(f"Livro identificado: {pdf_livro}")
    print(f"Tipo 50 identificado: {pdf_tipo50}")
    print(f"OK. Arquivo gerado: {arquivo_saida}")


if __name__ == "__main__":
    main()
