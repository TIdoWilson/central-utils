# src/python/tareffa_empresas_lote_job.py
import argparse
import json
import os
import sys
from typing import Any, Dict

from tareffa_empresas_lote_core import run_lote


def emit_event(event_type: str, **data: Any):
    # Uma linha JSON por evento, fácil do Node parsear
    payload: Dict[str, Any] = {"type": event_type, **data}
    sys.stdout.write("__EVENT__" + json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Caminho do JSON de entrada")
    ap.add_argument("--outdir", required=True, help="Diretório de saída do job")
    ap.add_argument("--headless", action="store_true", help="Executa headless")
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)

    with open(args.input, "r", encoding="utf-8") as f:
      body = json.load(f)

    empresas = body.get("companies", [])
    options = body.get("options", {}) or {}
    headless = bool(options.get("headless", args.headless))

    try:
        emit_event("log", message="Iniciando job de cadastro em lote...")
        res = run_lote(empresas=empresas, out_dir=args.outdir, headless=headless, emit=emit_event)
        emit_event("done", result=res)
        return 0
    except Exception as ex:
        emit_event("error", message=str(ex))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
