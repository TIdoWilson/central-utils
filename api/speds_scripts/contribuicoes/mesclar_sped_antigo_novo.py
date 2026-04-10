#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Mescla 2 arquivos SPED EFD-Contribuicoes:
- arquivo "antigo" (base)
- arquivo "novo" (origem de notas/produtos faltantes)

O script reutiliza o motor oficial do projeto (`combinador_speds.py`), que:
- usa os JSONs de `api/layouts/speds/contribuicoes`
- ajusta totalizadores dos blocos e bloco 9 (9900/9990/9999)

Fluxo:
1) abre popup para selecionar o SPED antigo
2) abre popup para selecionar o SPED novo
3) abre popup para escolher o arquivo de saida
4) gera o TXT final
"""

from __future__ import annotations

import os
import shutil
import tempfile
import traceback
import tkinter as tk
from tkinter import filedialog, messagebox

from combinador_speds import combine_speds, detect_encoding


def _default_initial_dir() -> str:
    downloads = os.path.join(os.path.expanduser("~"), "Downloads")
    return downloads if os.path.isdir(downloads) else os.getcwd()


def _pick_file(title: str, initial_dir: str) -> str:
    return filedialog.askopenfilename(
        title=title,
        initialdir=initial_dir,
        filetypes=[("Arquivos TXT", "*.txt"), ("Todos os arquivos", "*.*")],
    )


def _pick_output_path(base_file: str, initial_dir: str) -> str:
    base_name = os.path.splitext(os.path.basename(base_file))[0]
    suggested = f"{base_name}_ATUALIZADO_COM_NOVO.txt"
    return filedialog.asksaveasfilename(
        title="Salvar SPED mesclado como",
        initialdir=initial_dir,
        initialfile=suggested,
        defaultextension=".txt",
        filetypes=[("Arquivos TXT", "*.txt"), ("Todos os arquivos", "*.*")],
    )


def main() -> None:
    root = tk.Tk()
    root.withdraw()
    root.update()

    initial_dir = _default_initial_dir()

    antigo_path = _pick_file("Selecione o SPED ANTIGO (base)", initial_dir)
    if not antigo_path:
        return

    new_initial_dir = os.path.dirname(antigo_path) or initial_dir
    novo_path = _pick_file("Selecione o SPED NOVO (com notas/produtos faltantes)", new_initial_dir)
    if not novo_path:
        return

    saida_path = _pick_output_path(antigo_path, new_initial_dir)
    if not saida_path:
        return

    if os.path.exists(saida_path):
        overwrite = messagebox.askyesno(
            "Arquivo ja existe",
            f"O arquivo abaixo ja existe e sera sobrescrito:\n\n{saida_path}\n\nDeseja continuar?",
        )
        if not overwrite:
            return

    try:
        target_encoding = detect_encoding(antigo_path)
        with tempfile.TemporaryDirectory(prefix="sped_merge_") as tmp_dir:
            out_tmp, logs = combine_speds(
                matriz_path=antigo_path,
                filiais_paths=[novo_path],
                out_dir=tmp_dir,
                overwrite=True,
            )
            os.makedirs(os.path.dirname(saida_path) or ".", exist_ok=True)
            if target_encoding.lower() == "utf-8":
                shutil.copy2(out_tmp, saida_path)
            else:
                with open(out_tmp, "r", encoding="utf-8", errors="strict", newline="") as src:
                    merged_text = src.read()
                with open(saida_path, "w", encoding=target_encoding, errors="strict", newline="") as dst:
                    dst.write(merged_text)

        resumo = [
            "SPED mesclado com sucesso.",
            "",
            f"Antigo: {antigo_path}",
            f"Novo:   {novo_path}",
            f"Saida:  {saida_path}",
            f"Codificacao de saida: {target_encoding}",
        ]
        if logs:
            resumo.append("")
            resumo.append("Ultimas linhas do log:")
            resumo.extend(logs[-8:])

        messagebox.showinfo("Concluido", "\n".join(resumo))
    except Exception as exc:
        details = traceback.format_exc()
        messagebox.showerror("Erro ao mesclar SPEDs", f"{exc}\n\n{details}")


if __name__ == "__main__":
    main()
