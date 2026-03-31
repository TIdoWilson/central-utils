from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parent
DEFAULT_LAYOUT_PATH = ROOT / "layouts json" / "L210.json"
FALLBACK_LAYOUT_PATH = ROOT.parent.parent / "layouts" / "speds" / "ecf" / "L210.json"
LAYOUT_PATH = DEFAULT_LAYOUT_PATH if DEFAULT_LAYOUT_PATH.exists() else FALLBACK_LAYOUT_PATH

CODIGOS_REVENDA = {
    "33": "ESTOQUE INICIAL REVENDA",
    "34": "COMPRAS REVENDA",
    "36": "ESTOQUE FINAL REVENDA",
    "37": "CUSTO REVENDA",
}

BOOL_CHOICES = {"sim", "s", "true", "1", "nao", "não", "n", "false", "0"}


@dataclass(frozen=True)
class LedgerEntry:
    movement_date: date
    history: str
    debit: float
    credit: float
    balance: float


@dataclass(frozen=True)
class LedgerData:
    path: Path
    account_code: str
    account_description: str
    opening_balance: float
    period_start: date | None
    period_end: date | None
    entries: list[LedgerEntry]


@dataclass(frozen=True)
class ManualL210Entry:
    label: str
    period_label: str
    opening_balance: float
    final_balance: float
    cost_value: float
    purchases_value: float


@dataclass(frozen=True)
class L210Row:
    period_key: str
    period_label: str
    registro: str
    codigo: str
    descricao: str
    valor: float
    origem: str

    def to_sped_line(self) -> str:
        return "|" + "|".join(
            [
                self.registro,
                self.codigo,
                clean_text(self.descricao),
                format_sped_decimal(self.valor, 2),
            ]
        ) + "|"


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).replace("|", " ")
    text = text.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_token(value: Any) -> str:
    text = clean_text(value).lower()
    translation = str.maketrans(
        {
            "á": "a",
            "à": "a",
            "â": "a",
            "ã": "a",
            "ä": "a",
            "é": "e",
            "è": "e",
            "ê": "e",
            "ë": "e",
            "í": "i",
            "ì": "i",
            "î": "i",
            "ï": "i",
            "ó": "o",
            "ò": "o",
            "ô": "o",
            "õ": "o",
            "ö": "o",
            "ú": "u",
            "ù": "u",
            "û": "u",
            "ü": "u",
            "ç": "c",
        }
    )
    return text.translate(translation)


def parse_date_any(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, pd.Timestamp):
        return value.date()

    text = clean_text(value)
    if not text:
        return None

    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d%m%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not pd.isna(value):
        return float(value)

    text = clean_text(value)
    if not text or text.lower() in {"nan", "none", "nat"}:
        return None

    text = text.replace("R$", "").replace("\xa0", "").replace(" ", "")
    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1]

    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    else:
        if not re.fullmatch(r"[+-]?\d+\.\d+", text):
            text = text.replace(".", "")

    try:
        number = float(text)
    except ValueError:
        return None
    return -number if negative else number


def format_sped_decimal(value: float, decimals: int) -> str:
    quantized = Decimal(str(value)).quantize(
        Decimal("1." + ("0" * decimals)),
        rounding=ROUND_HALF_UP,
    )
    if quantized == Decimal("-0." + ("0" * decimals)):
        quantized = Decimal("0." + ("0" * decimals))
    return f"{quantized:.{decimals}f}".replace(".", ",")


def load_l210_layout() -> dict[str, Any]:
    try:
        payload = json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"Layout nao encontrado: {LAYOUT_PATH}") from exc

    if payload.get("registro") != "L210":
        raise RuntimeError("O JSON carregado nao corresponde ao registro L210.")

    field_names = [field.get("nome") for field in payload.get("campos", [])]
    if field_names[:4] != ["REG", "CODIGO", "DESCRICAO", "VALOR"]:
        raise RuntimeError("Estrutura inesperada no layout L210.json.")
    return payload


def read_excel_matrix(path: Path) -> pd.DataFrame:
    try:
        return pd.read_excel(path, header=None, dtype=object)
    except Exception as exc:
        raise RuntimeError(f"Falha ao ler o arquivo '{path.name}'.") from exc


def parse_period_range(value: str) -> tuple[date | None, date | None]:
    match = re.search(r"Per[ií]odo:\s*(\d{2}/\d{2}/\d{4})\s*a\s*(\d{2}/\d{2}/\d{4})", value)
    if not match:
        return None, None
    return parse_date_any(match.group(1)), parse_date_any(match.group(2))


def extract_account_row(df: pd.DataFrame, header_row_index: int) -> tuple[str, str, float]:
    account_row = df.iloc[header_row_index + 1].tolist()
    account_cell = clean_text(account_row[0] if len(account_row) > 0 else "")
    description_cell = clean_text(account_row[1] if len(account_row) > 1 else "")
    previous_label = clean_text(account_row[6] if len(account_row) > 6 else "")
    opening_balance = to_float(account_row[7] if len(account_row) > 7 else None)

    account_match = re.search(r"Conta:\s*([0-9A-Za-z./-]+)", account_cell)
    description_match = re.search(r"Red\.\s*:\s*(.+)", description_cell)

    if previous_label.upper() != "SALDO ANTERIOR:" or opening_balance is None:
        raise RuntimeError("Nao foi possivel localizar o saldo anterior no razao.")

    return (
        account_match.group(1) if account_match else account_cell.replace("Conta:", "").strip(),
        description_match.group(1).strip() if description_match else description_cell,
        opening_balance,
    )


def read_ledger(path: Path) -> LedgerData:
    df = read_excel_matrix(path)
    header_row_index: int | None = None

    for idx in range(min(len(df), 30)):
        row = [normalize_token(value) for value in df.iloc[idx].tolist()]
        if len(row) >= 8 and row[0] == "data" and row[1] == "historico" and row[5] == "debito":
            header_row_index = idx
            break

    if header_row_index is None:
        raise RuntimeError(f"Nao foi encontrado o cabecalho do razao em '{path.name}'.")

    period_start, period_end = parse_period_range(clean_text(df.iloc[3, 7] if len(df.columns) > 7 else ""))
    account_code, account_description, opening_balance = extract_account_row(df, header_row_index)

    entries: list[LedgerEntry] = []
    for idx in range(header_row_index + 3, len(df)):
        row = df.iloc[idx].tolist()
        if len(row) < 8:
            continue
        movement_date = parse_date_any(row[0])
        if movement_date is None:
            continue

        debit = to_float(row[5]) or 0.0
        credit = to_float(row[6]) or 0.0
        balance = to_float(row[7])
        if balance is None:
            continue

        entries.append(
            LedgerEntry(
                movement_date=movement_date,
                history=clean_text(row[1]),
                debit=debit,
                credit=credit,
                balance=balance,
            )
        )

    if not entries:
        raise RuntimeError(f"Nenhum lancamento valido foi encontrado em '{path.name}'.")

    return LedgerData(
        path=path,
        account_code=account_code,
        account_description=account_description,
        opening_balance=opening_balance,
        period_start=period_start,
        period_end=period_end,
        entries=entries,
    )


def load_manual_entries(path: Path) -> list[ManualL210Entry]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"Falha ao ler as linhas manuais de L210 em '{path.name}'.") from exc

    if isinstance(payload, dict):
        apuracao = "trimestral" if clean_text(payload.get("apuracao")).lower() == "trimestral" else "mensal"
        ano_declaracao = clean_text(payload.get("ano_declaracao")) or str(date.today().year - 1)
        opening_from_header = to_float(payload.get("saldo_inicial_estoque"))
        rows = payload.get("rows")

        if not isinstance(rows, list):
            raise RuntimeError("O quadro manual do L210 deve conter a lista 'rows'.")

        expected_rows = 4 if apuracao == "trimestral" else 12
        if len(rows) != expected_rows:
            raise RuntimeError(
                f"O quadro manual do L210 precisa ter {expected_rows} linhas para a apuracao informada."
            )

        entries: list[ManualL210Entry] = []
        cumulative_cost = 0.0
        previous_final_balance = opening_from_header
        for index, item in enumerate(rows, start=1):
            if not isinstance(item, dict):
                raise RuntimeError(f"Linha manual invalida no quadro L210: item #{index}.")

            period_label = clean_text(item.get("periodo") or manual_period_label(apuracao, ano_declaracao, index))
            opening_balance = to_float(item.get("estoque_inicial"))
            if opening_balance is None:
                opening_balance = opening_from_header if apuracao == "mensal" or index == 1 else previous_final_balance
            final_balance = to_float(item.get("estoque_final"))
            cost_period = to_float(item.get("custo"))

            if opening_balance is None or final_balance is None or cost_period is None:
                raise RuntimeError(
                    f"Linha manual #{index} do L210 precisa de saldo inicial, saldo final e custo."
                )

            if apuracao == "mensal":
                cumulative_cost += cost_period
                cost_value = cumulative_cost
            else:
                cost_value = cost_period

            purchases_value = final_balance + cost_value - opening_balance
            previous_final_balance = final_balance
            entries.append(
                ManualL210Entry(
                    label=period_label,
                    period_label=period_label,
                    opening_balance=opening_balance,
                    final_balance=final_balance,
                    cost_value=cost_value,
                    purchases_value=purchases_value,
                )
            )

        if not entries:
            raise RuntimeError("Nenhuma linha manual foi informada para o L210.")

        return entries

    if not isinstance(payload, list):
        raise RuntimeError("O quadro manual do L210 deve ser uma lista de linhas.")

    entries: list[ManualL210Entry] = []
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            raise RuntimeError(f"Linha manual invalida no quadro L210: item #{index}.")

        label = clean_text(item.get("identificacao") or item.get("label") or item.get("periodo") or f"Linha {index}")
        period_label = clean_text(item.get("periodo") or label or f"Linha {index}")
        opening_balance = to_float(item.get("estoque_inicial"))
        final_balance = to_float(item.get("estoque_final"))
        cost_value = to_float(item.get("custo"))
        purchases_raw = to_float(item.get("compras"))

        if opening_balance is None or final_balance is None or cost_value is None:
            raise RuntimeError(
                f"Linha manual #{index} do L210 precisa de estoque inicial, estoque final e custo."
            )

        purchases_value = purchases_raw if purchases_raw is not None else (final_balance + cost_value - opening_balance)
        entries.append(
            ManualL210Entry(
                label=label,
                period_label=period_label,
                opening_balance=opening_balance,
                final_balance=final_balance,
                cost_value=cost_value,
                purchases_value=purchases_value,
            )
        )

    if not entries:
        raise RuntimeError("Nenhuma linha manual foi informada para o L210.")

    return entries


def month_key(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def month_label(key: str) -> str:
    year, month = key.split("-")
    return f"{month}/{year}"


def quarter_of_month(month: int) -> int:
    return ((month - 1) // 3) + 1


def quarter_key(value: date) -> str:
    return f"{value.year:04d}-T{quarter_of_month(value.month)}"


def quarter_label(key: str) -> str:
    year, quarter = key.split("-T")
    return f"{quarter}T/{year}"


def manual_period_label(apuracao: str, ano_declaracao: str, index: int) -> str:
    year = clean_text(ano_declaracao)[:4] or str(date.today().year - 1)
    if apuracao == "trimestral":
        return f"{index}T/{year}"
    return f"{index:02d}/{year}"


def period_key_for_date(value: date, apuracao: str) -> str:
    if apuracao == "mensal":
        return month_key(value)
    return quarter_key(value)


def period_label_from_key(key: str, apuracao: str) -> str:
    if apuracao == "mensal":
        return month_label(key)
    return quarter_label(key)


def period_sort_key(key: str, apuracao: str) -> tuple[int, int]:
    if apuracao == "mensal":
        year_str, month_str = key.split("-")
        return int(year_str), int(month_str)
    year_str, quarter_str = key.split("-T")
    return int(year_str), int(quarter_str)


def build_stock_periods(ledger: LedgerData, apuracao: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[LedgerEntry]] = {}
    for entry in ledger.entries:
        key = period_key_for_date(entry.movement_date, apuracao)
        grouped.setdefault(key, []).append(entry)

    periods: list[dict[str, Any]] = []
    previous_final = ledger.opening_balance

    for key in sorted(grouped, key=lambda item: period_sort_key(item, apuracao)):
        entries = sorted(grouped[key], key=lambda item: item.movement_date)
        if apuracao == "mensal":
            opening_balance = ledger.opening_balance
        else:
            opening_balance = previous_final

        final_balance = entries[-1].balance
        periods.append(
            {
                "period_key": key,
                "period_label": period_label_from_key(key, apuracao),
                "opening_balance": opening_balance,
                "final_balance": final_balance,
                "entries": entries,
            }
        )
        previous_final = final_balance

    return periods


def is_zeroing_entry(entry: LedgerEntry) -> bool:
    movement_value = max(abs(entry.debit), abs(entry.credit))
    if movement_value <= 0:
        return False
    if "ENCERRAMENTO" in entry.history.upper():
        return True
    return abs(entry.balance) <= 0.005


def build_cost_map(ledger: LedgerData, apuracao: str) -> dict[str, float]:
    grouped: dict[str, list[LedgerEntry]] = {}
    for entry in ledger.entries:
        key = period_key_for_date(entry.movement_date, apuracao)
        grouped.setdefault(key, []).append(entry)

    output: dict[str, float] = {}
    for key, entries in grouped.items():
        zeroing_entries = [entry for entry in entries if is_zeroing_entry(entry)]
        if not zeroing_entries:
            zeroing_entries = [entry for entry in entries if "ENCERRAMENTO" in entry.history.upper()]
        output[key] = sum(max(abs(entry.debit), abs(entry.credit)) for entry in zeroing_entries)
    return output


def build_revenda_rows(stock_ledger: LedgerData, cost_ledger: LedgerData, apuracao: str) -> list[L210Row]:
    stock_periods = build_stock_periods(stock_ledger, apuracao)
    cost_map = build_cost_map(cost_ledger, apuracao)
    rows: list[L210Row] = []
    cumulative_cost = 0.0

    for period in stock_periods:
        key = period["period_key"]
        period_label = period["period_label"]
        opening_balance = float(period["opening_balance"])
        final_balance = float(period["final_balance"])
        period_cost = float(cost_map.get(key, 0.0))

        if apuracao == "mensal":
            cumulative_cost += period_cost
            cost_value = cumulative_cost
        else:
            cost_value = period_cost

        purchases = final_balance + cost_value - opening_balance

        for codigo, valor in (
            ("33", opening_balance),
            ("34", purchases),
            ("36", final_balance),
            ("37", cost_value),
        ):
            rows.append(
                L210Row(
                    period_key=key,
                    period_label=period_label,
                    registro="L210",
                    codigo=codigo,
                    descricao=CODIGOS_REVENDA[codigo],
                    valor=valor,
                    origem="revenda",
                )
            )

    return rows


def build_manual_rows(manual_entries: list[ManualL210Entry]) -> list[L210Row]:
    rows: list[L210Row] = []

    for index, entry in enumerate(manual_entries, start=1):
        period_key = f"manual-{index:03d}"
        period_label = entry.label or entry.period_label or f"Linha {index}"
        for codigo, valor in (
            ("33", entry.opening_balance),
            ("34", entry.purchases_value),
            ("36", entry.final_balance),
            ("37", entry.cost_value),
        ):
            rows.append(
                L210Row(
                    period_key=period_key,
                    period_label=period_label,
                    registro="L210",
                    codigo=codigo,
                    descricao=CODIGOS_REVENDA[codigo],
                    valor=valor,
                    origem="manual",
                )
            )

    return rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gera bloco L210 a partir de razao de estoque/custo ou quadro manual."
    )
    parser.add_argument("--tem-fabricacao", default="", help="sim/nao")
    parser.add_argument("--tem-revenda", default="", help="sim/nao")
    parser.add_argument("--apuracao", choices=["mensal", "trimestral"], default="")
    parser.add_argument("--manual-rows-file", default="", help="Arquivo JSON com o quadro manual do L210")
    parser.add_argument("--razao-estoque", default="", help="Arquivo Excel do razao de estoque")
    parser.add_argument("--razao-custo", default="", help="Arquivo Excel do razao de custo")
    parser.add_argument("--output-txt", default="", help="Arquivo TXT de saida")
    parser.add_argument("--output-csv", default="", help="Arquivo CSV de conferencia")
    return parser.parse_args()


def parse_bool_choice(value: str, field_name: str) -> bool:
    normalized = clean_text(value).lower()
    if not normalized:
        raise ValueError(f"{field_name} vazio.")
    if normalized not in BOOL_CHOICES:
        raise ValueError(f"Valor invalido para {field_name}: {value}")
    return normalized in {"sim", "s", "true", "1"}


def ask_yes_no(title: str, message: str) -> bool:
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        answer = messagebox.askyesno(title, message, parent=root)
        root.destroy()
        return bool(answer)
    except Exception:
        while True:
            answer = input(f"{message} [s/n]: ").strip().lower()
            if answer in {"s", "sim", "y", "yes"}:
                return True
            if answer in {"n", "nao", "não", "no"}:
                return False


def ask_apuracao() -> str:
    try:
        import tkinter as tk

        root = tk.Tk()
        root.title("Periodicidade")
        root.attributes("-topmost", True)
        root.resizable(False, False)

        selected = {"value": None}

        def choose(value: str) -> None:
            selected["value"] = value
            root.destroy()

        def close_dialog() -> None:
            root.destroy()

        root.protocol("WM_DELETE_WINDOW", close_dialog)

        frame = tk.Frame(root, padx=20, pady=16)
        frame.pack(fill="both", expand=True)

        label = tk.Label(
            frame,
            text="A empresa lança custo mensal ou trimestral",
            wraplength=280,
            justify="left",
        )
        label.pack(anchor="w")

        buttons = tk.Frame(frame, pady=12)
        buttons.pack(fill="x")

        tk.Button(buttons, text="Mensal", width=12, command=lambda: choose("mensal")).pack(
            side="left", padx=(0, 8)
        )
        tk.Button(buttons, text="Trimestral", width=12, command=lambda: choose("trimestral")).pack(
            side="left"
        )

        root.update_idletasks()
        width = root.winfo_width()
        height = root.winfo_height()
        x = (root.winfo_screenwidth() // 2) - (width // 2)
        y = (root.winfo_screenheight() // 2) - (height // 2)
        root.geometry(f"{width}x{height}+{x}+{y}")

        root.mainloop()
        if selected["value"] in {"mensal", "trimestral"}:
            return selected["value"]
        raise SystemExit("Selecao cancelada.")
    except Exception:
        while True:
            answer = input("A empresa lança custo mensal ou trimestral? [m/t]: ").strip().lower()
            if answer in {"m", "mensal"}:
                return "mensal"
            if answer in {"t", "trimestral"}:
                return "trimestral"


def select_file(title: str) -> Path:
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askopenfilename(
            title=title,
            filetypes=[
                ("Planilhas Excel", "*.xlsx *.xls"),
                ("Todos os arquivos", "*.*"),
            ],
        )
        root.destroy()
        if not selected:
            raise SystemExit("Selecao cancelada pelo usuario.")
        return Path(selected)
    except Exception:
        path = input(f"{title}: ").strip().strip('"').strip("'")
        if not path:
            raise SystemExit("Caminho nao informado.")
        return Path(path)


def dataframe_from_rows(rows: list[L210Row]) -> pd.DataFrame:
    records = [
        {
            "periodo_chave": row.period_key,
            "periodo": row.period_label,
            "registro": row.registro,
            "codigo": row.codigo,
            "descricao": row.descricao,
            "valor": row.valor,
            "valor_formatado": format_sped_decimal(row.valor, 2),
            "origem": row.origem,
        }
        for row in rows
    ]
    return pd.DataFrame(records)


def save_outputs(
    rows: list[L210Row],
    apuracao: str,
    stock_ledger: LedgerData | None,
    cost_ledger: LedgerData | None,
    source_mode: str = "razao",
    output_txt: Path | None = None,
    output_csv: Path | None = None,
) -> tuple[Path, Path]:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    txt_path = output_txt or (ROOT / f"L210_{apuracao}_{timestamp}.txt")
    csv_path = output_csv or (ROOT / f"L210_{apuracao}_conferencia_{timestamp}.csv")
    txt_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    txt_lines = [row.to_sped_line() for row in rows]
    txt_path.write_text("\n".join(txt_lines) + "\n", encoding="latin-1", errors="replace")

    df = dataframe_from_rows(rows)
    metadata = pd.DataFrame(
        [
            {
                "campo": "modo_geracao",
                "valor": source_mode,
            },
            {
                "campo": "apuracao",
                "valor": apuracao,
            },
            {
                "campo": "arquivo_estoque",
                "valor": str(stock_ledger.path) if stock_ledger else "",
            },
            {
                "campo": "conta_estoque",
                "valor": stock_ledger.account_code if stock_ledger else "",
            },
            {
                "campo": "arquivo_custo",
                "valor": str(cost_ledger.path) if cost_ledger else "",
            },
            {
                "campo": "conta_custo",
                "valor": cost_ledger.account_code if cost_ledger else "",
            },
        ]
    )

    with csv_path.open("w", encoding="utf-8-sig", newline="") as handler:
        metadata.to_csv(handler, sep=";", index=False)
        handler.write("\n")
        df.to_csv(handler, sep=";", index=False)

    return txt_path, csv_path


def print_summary(
    rows: list[L210Row],
    apuracao: str,
    txt_path: Path,
    csv_path: Path,
    source_mode: str = "razao",
) -> None:
    df = dataframe_from_rows(rows)
    periodos = df["periodo"].nunique() if not df.empty else 0

    print("Resumo:")
    print(f"- Modo: {source_mode}")
    print(f"- Apuracao: {apuracao}")
    print(f"- Periodos gerados: {periodos}")
    print(f"- Linhas L210 geradas: {len(rows)}")
    print(f"- Arquivo SPED: {txt_path}")
    print(f"- Arquivo de conferencia: {csv_path}")

    if not df.empty:
        print("\nConferencia por periodo:")
        for periodo in df["periodo"].drop_duplicates().tolist():
            print(f"- {periodo}")
            subset = df[df["periodo"] == periodo]
            for _, row in subset.iterrows():
                print(f"  {row['codigo']} | {row['descricao']} | {row['valor_formatado']}")

        negative_purchases = df[(df["codigo"] == "34") & (df["valor"] < 0)]
        if not negative_purchases.empty:
            print("\nAvisos:")
            for _, row in negative_purchases.iterrows():
                print(
                    "  Compra negativa em "
                    f"{row['periodo']} ({row['valor_formatado']}). "
                    "Confira se a regra do estoque inicial fixo deve ser mantida para este periodo."
                )


def main() -> None:
    args = parse_args()
    load_l210_layout()

    apuracao = args.apuracao if args.apuracao else ask_apuracao()

    stock_ledger: LedgerData | None = None
    cost_ledger: LedgerData | None = None
    rows: list[L210Row] = []
    source_mode = "razao"

    manual_rows_path = Path(args.manual_rows_file) if args.manual_rows_file else None
    if manual_rows_path:
        if not manual_rows_path.exists():
            raise SystemExit(f"Arquivo nao encontrado: {manual_rows_path}")
        manual_entries = load_manual_entries(manual_rows_path)
        rows.extend(build_manual_rows(manual_entries))
        source_mode = "manual"
    else:
        tem_fabricacao = (
            parse_bool_choice(args.tem_fabricacao, "--tem-fabricacao")
            if args.tem_fabricacao
            else ask_yes_no(
                "Contas de custo",
                "A empresa possui conta de custo/estoque de fabricacao propria?",
            )
        )
        tem_revenda = (
            parse_bool_choice(args.tem_revenda, "--tem-revenda")
            if args.tem_revenda
            else ask_yes_no(
                "Contas de custo",
                "A empresa possui conta de custo/estoque de revenda?",
            )
        )
        if not tem_fabricacao and not tem_revenda:
            raise SystemExit("Nenhuma opcao selecionada.")

        if tem_fabricacao and not tem_revenda:
            raise SystemExit("A montagem de fabricacao propria ainda nao foi implementada neste script.")

        if tem_revenda:
            stock_path = Path(args.razao_estoque) if args.razao_estoque else select_file("Selecione o arquivo do razao de estoque")
            cost_path = Path(args.razao_custo) if args.razao_custo else select_file("Selecione o arquivo do razao de custo")

            if not stock_path.exists():
                raise SystemExit(f"Arquivo nao encontrado: {stock_path}")
            if not cost_path.exists():
                raise SystemExit(f"Arquivo nao encontrado: {cost_path}")

            stock_ledger = read_ledger(stock_path)
            cost_ledger = read_ledger(cost_path)
            rows.extend(build_revenda_rows(stock_ledger, cost_ledger, apuracao))

        if tem_fabricacao:
            print("Aviso: fabricacao propria foi selecionada, mas ainda nao ha regra de calculo implementada para ela.")

    if not rows:
        raise SystemExit("Nenhuma linha L210 foi gerada.")

    output_txt = Path(args.output_txt) if args.output_txt else None
    output_csv = Path(args.output_csv) if args.output_csv else None
    txt_path, csv_path = save_outputs(
        rows,
        apuracao,
        stock_ledger,
        cost_ledger,
        source_mode=source_mode,
        output_txt=output_txt,
        output_csv=output_csv,
    )
    print_summary(rows, apuracao, txt_path, csv_path, source_mode=source_mode)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nOperacao cancelada.")
        sys.exit(130)
    except Exception as exc:
        print(f"ERRO: {exc}")
        sys.exit(1)
