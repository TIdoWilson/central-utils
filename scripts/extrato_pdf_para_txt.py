#!/usr/bin/env python3
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from decimal import Decimal
from typing import Iterable

import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from api.gfbr_gerador_txt_core import (
    ITAU_MOVIMENTACAO_HEADER_REGEX,
    ITAU_MOVIMENTACAO_ROW_REGEX,
    data_para_ddmmyyyy,
    extrair_ano_itau,
    build_h_line,
    build_l_line,
    decimal_to_cents_str,
    parse_data,
    parse_decimal,
    set_range,
    texto_ascii,
)


CAMPO_CONTAS = (
    ("conta_corrente", "Conta corrente"),
    ("conta_aplicacao", "Conta aplicação"),
    ("renda", "Renda"),
    ("irrf", "IRRF"),
    ("iof", "IOF"),
)


class DialogoContas(simpledialog.Dialog):
    def body(self, master: tk.Misc):
        self._entries: dict[str, tk.Entry] = {}

        tk.Label(
            master,
            text="Informe os 5 códigos contábeis usados no TXT:",
            anchor="w",
            justify="left",
        ).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 10))

        for row, (chave, rotulo) in enumerate(CAMPO_CONTAS, start=1):
            tk.Label(master, text=rotulo + ":").grid(row=row, column=0, sticky="w", padx=(0, 10), pady=4)
            entry = tk.Entry(master, width=42)
            entry.grid(row=row, column=1, sticky="ew", pady=4)
            self._entries[chave] = entry

        master.columnconfigure(1, weight=1)
        return self._entries["conta_corrente"]

    def validate(self) -> bool:
        valores = {chave: entry.get().strip() for chave, entry in self._entries.items()}
        faltantes = [rotulo for chave, rotulo in CAMPO_CONTAS if not valores[chave]]
        if faltantes:
            messagebox.showerror(
                "Campos obrigatórios",
                "Preencha todos os campos antes de continuar:\n\n- " + "\n- ".join(faltantes),
                parent=self,
            )
            return False
        self.result = valores
        return True


def montar_partida_itau(
    data_lancamento,
    debito_conta: str,
    credito_conta: str,
    valor,
    complemento: str,
    historico_h: str,
) -> dict:
    return {
        "data_ddmmyyyy": data_para_ddmmyyyy(data_lancamento),
        "debito_conta": debito_conta,
        "credito_conta": credito_conta,
        "valor": valor,
        "complemento": texto_ascii(complemento, 25),
        "historico_h": texto_ascii(historico_h, 50),
    }


def montar_historico_itau(descricao: str, data_lancamento) -> str:
    return texto_ascii(f"ITAU APLICACOES - {descricao}", 50)


def nome_lote_do_pdf(pdf_path: Path) -> str:
    return texto_ascii(pdf_path.stem, 25)


def build_c_line_nome_pdf(data_ddmmyyyy: str, total_debitos, nome_pdf: str) -> str:
    line = [" "] * 100
    line[0] = "C"
    line[1] = "M"
    set_range(line, 3, 10, data_ddmmyyyy)
    set_range(line, 11, 25, decimal_to_cents_str(total_debitos, width=15), align_right=True, fill="0")
    set_range(line, 26, 50, texto_ascii(nome_pdf, 25))
    set_range(line, 96, 100, "00002", align_right=True, fill="0")
    return "".join(line)


def gerar_txt_iob_nome_pdf(partidas: list[dict], caminho_saida: Path, nome_pdf: str) -> None:
    caminho_saida.parent.mkdir(parents=True, exist_ok=True)

    data_header = partidas[0]["data_ddmmyyyy"] if partidas else datetime.now().strftime("%d%m%Y")
    total_debitos = sum((p["valor"] for p in partidas), Decimal("0"))

    linhas: list[str] = [build_c_line_nome_pdf(data_header, total_debitos, nome_pdf)]
    seq = 3

    for partida in partidas:
        linhas.append(build_l_line(partida, seq))
        seq += 1
        linhas.append(build_h_line(partida.get("historico_h", ""), seq))
        seq += 1

    caminho_saida.write_text(("\n".join(linhas) + "\n").upper(), encoding="latin1", newline="\n")


def extrair_partidas_itau_aplicacao(
    pdf_path: Path,
    conta_corrente: str,
    conta_aplicacao: str,
    conta_renda: str,
    conta_irrf: str,
    conta_iof: str,
) -> list[dict]:
    partidas: list[dict] = []
    dentro_quadro = False
    ano_atual = str(datetime.now().year)

    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            texto = page.extract_text() or ""
            linhas = texto.split("\n")

            for linha in linhas:
                linha = linha.strip()
                if not linha:
                    continue

                ano_atual = extrair_ano_itau(linha, ano_atual)

                if ITAU_MOVIMENTACAO_HEADER_REGEX.search(linha):
                    dentro_quadro = True
                    continue

                if not dentro_quadro:
                    continue

                m = ITAU_MOVIMENTACAO_ROW_REGEX.match(linha)
                if not m:
                    continue

                data_bruta = m.group("data")
                data_str = f"{ano_atual}-{data_bruta[3:5]}-{data_bruta[:2]}"
                dt = parse_data(data_str)
                if not dt:
                    continue

                aplicacao = parse_decimal(m.group("aplicacao")) or 0
                resgate_principal = parse_decimal(m.group("resgate_principal")) or 0
                rend_bruto = parse_decimal(m.group("rend_bruto")) or 0
                iof = parse_decimal(m.group("iof")) or 0
                irrf = parse_decimal(m.group("irrf")) or 0

                if aplicacao > 0 or resgate_principal > 0 or rend_bruto > 0 or iof > 0 or irrf > 0:
                    if aplicacao > 0:
                        partidas.append(
                            montar_partida_itau(
                                dt,
                                conta_aplicacao,
                                conta_corrente,
                                aplicacao,
                                "APLICACAO ITAU",
                                montar_historico_itau("APLICACAO", dt),
                            )
                        )

                    if resgate_principal > 0:
                        partidas.append(
                            montar_partida_itau(
                                dt,
                                conta_corrente,
                                conta_aplicacao,
                                resgate_principal,
                                "RESGATE ITAU",
                                montar_historico_itau("RESGATE PRINCIPAL", dt),
                            )
                        )

                    if rend_bruto > 0:
                        partidas.append(
                            montar_partida_itau(
                                dt,
                                conta_aplicacao,
                                conta_renda,
                                rend_bruto,
                                "REND APLIC",
                                montar_historico_itau("RENDIMENTO BRUTO", dt),
                            )
                        )

                    if iof > 0:
                        partidas.append(
                            montar_partida_itau(
                                dt,
                                conta_iof,
                                conta_aplicacao,
                                iof,
                                "IOF RETIDO",
                                montar_historico_itau("IOF RETIDO", dt),
                            )
                        )

                    if irrf > 0:
                        partidas.append(
                            montar_partida_itau(
                                dt,
                                conta_irrf,
                                conta_aplicacao,
                                irrf,
                                "IRRF RETIDO",
                                montar_historico_itau("IRRF RETIDO", dt),
                            )
                        )

    try:
        partidas.sort(key=lambda x: datetime.strptime(x["data_ddmmyyyy"], "%d%m%Y"))
    except Exception:
        pass

    return partidas


def escolher_pdfs(root: tk.Tk) -> tuple[str, ...]:
    return filedialog.askopenfilenames(
        parent=root,
        title="Selecione os PDFs dos extratos",
        filetypes=[("Arquivos PDF", "*.pdf"), ("Todos os arquivos", "*.*")],
    )


def caminho_saida_txt(pdf_path: Path) -> Path:
    destino = pdf_path.with_name("LOTD0000.txt")
    if not destino.exists():
        return destino

    contador = 2
    while True:
        candidato = pdf_path.with_name(f"LOTD0000_{contador}.txt")
        if not candidato.exists():
            return candidato
        contador += 1


def gerar_txt_para_pdf(pdf_path: Path, contas: dict[str, str]) -> Path:
    partidas = extrair_partidas_itau_aplicacao(
        pdf_path=pdf_path,
        conta_corrente=contas["conta_corrente"],
        conta_aplicacao=contas["conta_aplicacao"],
        conta_renda=contas["renda"],
        conta_irrf=contas["irrf"],
        conta_iof=contas["iof"],
    )

    caminho_txt = caminho_saida_txt(pdf_path)
    gerar_txt_iob_nome_pdf(partidas, caminho_txt, nome_lote_do_pdf(pdf_path))
    return caminho_txt


def formatar_resumo(itens: list[tuple[Path, Path]], erros: list[tuple[Path, str]]) -> str:
    linhas: list[str] = []
    if itens:
        linhas.append("TXT gerados com sucesso:")
        for pdf, txt in itens:
            linhas.append(f"- {pdf.name} -> {txt.name}")
    if erros:
        if linhas:
            linhas.append("")
        linhas.append("Arquivos com erro:")
        for caminho, mensagem in erros:
            linhas.append(f"- {caminho.name}: {mensagem}")
    return "\n".join(linhas)


def main() -> int:
    root = tk.Tk()
    root.withdraw()

    try:
        dialogo = DialogoContas(root, title="Contas do extrato")
        contas = getattr(dialogo, "result", None)
        if not contas:
            return 0

        arquivos = escolher_pdfs(root)
        if not arquivos:
            return 0

        gerados: list[tuple[Path, Path]] = []
        erros: list[tuple[Path, str]] = []

        for arquivo in arquivos:
            caminho_pdf = Path(arquivo)
            try:
                caminho_txt = gerar_txt_para_pdf(caminho_pdf, contas)
                gerados.append((caminho_pdf, caminho_txt))
            except Exception as exc:  # pragma: no cover - depende do PDF selecionado
                erros.append((caminho_pdf, str(exc)))

        resumo = formatar_resumo(gerados, erros)
        if gerados and erros:
            messagebox.showwarning("Processamento concluído com alertas", resumo, parent=root)
        elif gerados:
            messagebox.showinfo("Processamento concluído", resumo, parent=root)
        else:
            messagebox.showerror("Nenhum arquivo gerado", resumo or "Nenhum TXT foi gerado.", parent=root)
        return 0 if not erros else 1
    finally:
        root.destroy()


if __name__ == "__main__":
    raise SystemExit(main())
