import re
import unicodedata
from pathlib import Path

import pandas as pd

PDF_LIVRO = Path("LIVRO REGISTRO DE ENTRADAS.pdf")
PDF_TIPO50 = Path("RELATORIO TIPO 50 ENTRADAS FINAL.PDF")

# ----------------------------
# Helpers de normalização
# ----------------------------
def strip_accents(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(ch for ch in s if not unicodedata.combining(ch))

def to_decimal_br(v):
    """Converte '3.151,42' ou '3151,42' ou '3151.42' em float."""
    if v is None:
        return None
    s = str(v).strip()
    if s == "" or s.upper() == "EX":
        return None
    # remove separador de milhar provável
    # caso brasileiro: '.' milhar e ',' decimal
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    else:
        # se só tiver vírgula, assume decimal
        if "," in s:
            s = s.replace(",", ".")
    # remove lixo
    s = re.sub(r"[^\d\.\-]", "", s)
    try:
        return float(s)
    except:
        return None

def norm_int(s):
    s = "" if s is None else str(s)
    s = re.sub(r"\D", "", s)
    return s if s else None

def norm_date_ddmmyyyy(s):
    s = "" if s is None else str(s).strip()
    m = re.search(r"(\d{2}/\d{2}/\d{4})", s)
    return m.group(1) if m else None

def clean_spaces(s: str) -> str:
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s

# ----------------------------
# Extração com Camelot
# ----------------------------
def read_tables_camelot(pdf_path: Path):
    try:
        import camelot
        tables = camelot.read_pdf(str(pdf_path), pages="all", flavor="stream")  # stream costuma funcionar bem em livros fiscais
        dfs = []
        for t in tables:
            df = t.df.copy()
            # remove linhas vazias
            df = df.dropna(how="all")
            if df.shape[0] >= 2 and df.shape[1] >= 6:
                dfs.append(df)
        return dfs
    except Exception:
        return []

# ----------------------------
# Parse: LIVRO (Registro de Entradas)
#   Campos que vamos tentar capturar:
#   data_entrada, especie, serie, numero, cfop (cód fiscal), valor_contabil
# ----------------------------
def parse_livro(pdf_path: Path) -> pd.DataFrame:
    # 1) tentar Camelot
    dfs = read_tables_camelot(pdf_path)
    rows = []
    if dfs:
        # Heurística: procurar colunas com "Data de Entrada" e "Número"
        for df in dfs:
            # concatena linha 0 para achar cabeçalho
            head = " ".join(df.iloc[0].astype(str).tolist())
            head = strip_accents(clean_spaces(head)).lower()
            # Muitas vezes o cabeçalho vem quebrado; seguimos mesmo assim.
            for i in range(1, len(df)):
                line = " ".join(df.iloc[i].astype(str).tolist())
                line = clean_spaces(line)
                if re.search(r"\d{2}/\d{2}/\d{4}", line) and re.search(r"\bNFe\b|\bNF\b|\bCTe\b", line):
                    # Exemplo de linha (pode variar):
                    # 05/01/2026 NFe 6 2159 02/01/2026 0035190 PR ... 3.151,42 1.653 ...
                    m = re.search(
                        r"(?P<data>\d{2}/\d{2}/\d{4})\s+(?P<esp>NFe|NF|CTe)\s+(?P<serie>\d+)\s+(?P<num>\d+).*?\s+(?P<valor>[\d\.,]+)\s+(?P<cfop>\d\.\d{3})",
                        line
                    )
                    if m:
                        rows.append({
                            "data": m.group("data"),
                            "especie": m.group("esp"),
                            "serie": norm_int(m.group("serie")),
                            "numero": norm_int(m.group("num")),
                            "cfop": m.group("cfop"),
                            "valor_total": to_decimal_br(m.group("valor")),
                            "fonte": "livro_camelot"
                        })

    # 2) fallback por texto (pdfplumber)
    if not rows:
        import pdfplumber
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                txt = txt.replace("\n", " ")
                txt = clean_spaces(txt)
                # varre todas as ocorrências de linhas que pareçam um lançamento
                for m in re.finditer(
                    r"(\d{2}/\d{2}/\d{4})\s+(NFe|NF|CTe)\s+(\d+)\s+(\d+)\s+.*?\s+([\d\.,]+)\s+(\d\.\d{3})",
                    txt
                ):
                    rows.append({
                        "data": m.group(1),
                        "especie": m.group(2),
                        "serie": norm_int(m.group(3)),
                        "numero": norm_int(m.group(4)),
                        "valor_total": to_decimal_br(m.group(5)),
                        "cfop": m.group(6),
                        "fonte": "livro_texto"
                    })

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # Normalizações finais
    df["chave_nf"] = df["data"].fillna("") + "|" + df["serie"].fillna("") + "|" + df["numero"].fillna("")
    # em livro, às vezes repete a NF em múltiplas linhas por imposto; aqui agregamos por NF+CFOP
    df = (df.groupby(["data", "serie", "numero", "cfop"], as_index=False)
            .agg(valor_total=("valor_total", "sum")))
    df["chave"] = df["data"] + "|" + df["serie"].astype(str) + "|" + df["numero"].astype(str) + "|" + df["cfop"].astype(str)
    return df

# ----------------------------
# Parse: TIPO 50
#   Campos típicos:
#   Data, Nro, Tip, CNPJ, UF, CFOP, Aliq ICMS, Total, Base, Vlr ICMS, Vlr IPI, ...
#   Uma mesma NF pode aparecer em várias linhas (CFOPs diferentes).
# ----------------------------
def parse_tipo50(pdf_path: Path) -> pd.DataFrame:
    dfs = read_tables_camelot(pdf_path)
    rows = []

    # 1) Camelot
    if dfs:
        for df in dfs:
            for i in range(len(df)):
                line = " ".join(df.iloc[i].astype(str).tolist())
                line = clean_spaces(line)

                # Exemplo: 05/01/202 2159 T 29299004000102 PR 1.653 0 3.151,42 ...
                m = re.search(
                    r"(?P<data>\d{2}/\d{2}/\d{4}|\d{2}/\d{2}/\d{3})\s+(?P<num>\d+)\s+(?P<tip>[TP])\s+(?P<cnpj>[A-Z0-9\.]+)\s+(?P<uf>[A-Z]{2})\s+(?P<cfop>\d\.\d{3})\s+(?P<aliq>[\d\.,]+)\s+(?P<total>[\d\.,]+)",
                    line
                )
                if m:
                    data = m.group("data")
                    # Corrige ano truncado tipo '05/01/202'
                    if re.fullmatch(r"\d{2}/\d{2}/\d{3}", data):
                        data = data + "6"  # heurística para 2026 (ajuste se precisar)
                    rows.append({
                        "data": norm_date_ddmmyyyy(data),
                        "numero": norm_int(m.group("num")),
                        "tip": m.group("tip"),
                        "cnpj": m.group("cnpj"),
                        "uf": m.group("uf"),
                        "cfop": m.group("cfop"),
                        "aliq_icms": to_decimal_br(m.group("aliq")),
                        "valor_total": to_decimal_br(m.group("total")),
                        "fonte": "tipo50_camelot"
                    })

    # 2) fallback texto
    if not rows:
        import pdfplumber
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                txt = txt.replace("\n", " ")
                txt = clean_spaces(txt)
                for m in re.finditer(
                    r"(\d{2}/\d{2}/\d{3,4})\s+(\d+)\s+([TP])\s+([A-Z0-9\.]+)\s+([A-Z]{2})\s+(\d\.\d{3})\s+([\d\.,]+)\s+([\d\.,]+)",
                    txt
                ):
                    data = m.group(1)
                    if re.fullmatch(r"\d{2}/\d{2}/\d{3}", data):
                        data = data + "6"
                    rows.append({
                        "data": norm_date_ddmmyyyy(data),
                        "numero": norm_int(m.group(2)),
                        "tip": m.group(3),
                        "cnpj": m.group(4),
                        "uf": m.group(5),
                        "cfop": m.group(6),
                        "aliq_icms": to_decimal_br(m.group(7)),
                        "valor_total": to_decimal_br(m.group(8)),
                        "fonte": "tipo50_texto"
                    })

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # agrega por NF+CFOP (porque pode haver múltiplas linhas por CFOP)
    df = (df.groupby(["data", "numero", "cfop"], as_index=False)
            .agg(valor_total=("valor_total", "sum")))
    # no Tipo 50 não temos série; conciliamos por data+numero+cfop
    df["chave"] = df["data"].fillna("") + "|" + df["numero"].astype(str) + "|" + df["cfop"].astype(str)
    return df

# ----------------------------
# Conciliação
# ----------------------------
def conciliar(df_livro: pd.DataFrame, df_tipo50: pd.DataFrame) -> dict:
    # Ajuste: livro tem série; para conciliar com Tipo50 (sem série) usamos data+numero+cfop
    df_l = df_livro.copy()
    df_l["chave_sem_serie"] = df_l["data"].fillna("") + "|" + df_l["numero"].astype(str) + "|" + df_l["cfop"].astype(str)

    df_t = df_tipo50.copy()
    df_t["chave_sem_serie"] = df_t["chave"]

    merge = df_l.merge(
        df_t[["chave_sem_serie", "valor_total"]].rename(columns={"valor_total": "valor_tipo50"}),
        on="chave_sem_serie",
        how="outer"
    )

    merge = merge.rename(columns={"valor_total": "valor_livro"})
    merge["valor_livro"] = merge["valor_livro"].fillna(0.0)
    merge["valor_tipo50"] = merge["valor_tipo50"].fillna(0.0)
    merge["diferenca"] = merge["valor_livro"] - merge["valor_tipo50"]

    bateu = merge[(merge["valor_livro"] != 0) & (merge["valor_tipo50"] != 0) & (merge["diferenca"].abs() < 0.01)].copy()
    so_livro = merge[(merge["valor_livro"] != 0) & (merge["valor_tipo50"] == 0)].copy()
    so_tipo50 = merge[(merge["valor_livro"] == 0) & (merge["valor_tipo50"] != 0)].copy()
    divergente = merge[(merge["valor_livro"] != 0) & (merge["valor_tipo50"] != 0) & (merge["diferenca"].abs() >= 0.01)].copy()

    return {
        "merge": merge,
        "bateu": bateu,
        "so_livro": so_livro,
        "so_tipo50": so_tipo50,
        "divergente": divergente
    }

def main():
    df_livro = parse_livro(PDF_LIVRO)
    df_tipo50 = parse_tipo50(PDF_TIPO50)

    if df_livro.empty:
        raise RuntimeError("Não consegui extrair dados do LIVRO (Registro de Entradas).")
    if df_tipo50.empty:
        raise RuntimeError("Não consegui extrair dados do Tipo 50.")

    out = conciliar(df_livro, df_tipo50)

    # Saídas
    df_livro.to_csv("livro_extraido.csv", index=False, encoding="utf-8-sig")
    df_tipo50.to_csv("tipo50_extraido.csv", index=False, encoding="utf-8-sig")
    out["merge"].to_csv("conciliacao_merge.csv", index=False, encoding="utf-8-sig")
    out["divergente"].to_csv("conciliacao_divergencias.csv", index=False, encoding="utf-8-sig")
    out["so_livro"].to_csv("conciliacao_so_livro.csv", index=False, encoding="utf-8-sig")
    out["so_tipo50"].to_csv("conciliacao_so_tipo50.csv", index=False, encoding="utf-8-sig")

    with pd.ExcelWriter("conciliacao.xlsx", engine="openpyxl") as xw:
        df_livro.to_excel(xw, sheet_name="livro_extraido", index=False)
        df_tipo50.to_excel(xw, sheet_name="tipo50_extraido", index=False)
        out["merge"].to_excel(xw, sheet_name="merge", index=False)
        out["bateu"].to_excel(xw, sheet_name="bateu", index=False)
        out["divergente"].to_excel(xw, sheet_name="divergente", index=False)
        out["so_livro"].to_excel(xw, sheet_name="so_livro", index=False)
        out["so_tipo50"].to_excel(xw, sheet_name="so_tipo50", index=False)

    print("OK. Arquivos gerados: conciliacao.xlsx e CSVs auxiliares.")

if __name__ == "__main__":
    main()
