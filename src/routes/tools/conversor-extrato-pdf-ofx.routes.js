const express = require("express");
const FormData = require("form-data");
const { spawn } = require("child_process");

module.exports = function createConversorExtratoPdfOfxRoutes(deps) {
  const { requireCsrf, upload, axios, PY_API_URL } = deps;

  const router = express.Router();

  function deveTentarFallbackLocal(err) {
    const status = err?.response?.status;
    if ([502, 503, 504].includes(status)) {
      return true;
    }

    const code = String(err?.code || "").toUpperCase();
    if (["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT"].includes(code)) {
      return true;
    }

    const detalhe = `${err?.message || ""} ${JSON.stringify(err?.response?.data || {})}`.toLowerCase();
    return detalhe.includes("connect econnrefused") || detalhe.includes("connection refused");
  }

  function executarFallbackLocal({ arquivos, bankid, acctid }) {
    return new Promise((resolve, reject) => {
      const pythonBin =
        process.env.PYTHON_BIN ||
        (process.platform === "win32" ? "py" : "python3");
      const pythonArgs = process.env.PYTHON_BIN
        ? ["-c"]
        : (process.platform === "win32" && pythonBin === "py" ? ["-3", "-c"] : ["-c"]);

      const script = `
import base64
import io
import json
import sys
import zipfile

from api.conversor_extrato_pdf_ofx_core import converter_pdf_para_ofx_bytes

payload = json.loads(sys.stdin.read() or '{}')
arquivos = payload.get('arquivos', [])
bankid = payload.get('bankid', '0000')
acctid = payload.get('acctid') or None

resultados = []
ofx_gerados = []

for item in arquivos:
    nome = item.get('nome') or 'extrato.pdf'
    conteudo_base64 = item.get('base64') or ''
    try:
        conteudo = base64.b64decode(conteudo_base64)
    except Exception as exc:
        resultados.append({
            'ok': False,
            'arquivoEntrada': nome,
            'erro': f'Base64 invalido: {exc}',
        })
        continue

    if not conteudo:
        resultados.append({
            'ok': False,
            'arquivoEntrada': nome,
            'erro': 'Arquivo vazio.',
        })
        continue

    try:
        convertido = converter_pdf_para_ofx_bytes(
            pdf_bytes=conteudo,
            nome_arquivo_origem=nome,
            bankid=bankid,
            acctid=acctid,
        )
        ofx_bytes = convertido['ofx_bytes']
        ofx_nome = convertido['nome_saida']
        ofx_gerados.append((ofx_nome, ofx_bytes))
        resultados.append({
            'ok': True,
            'arquivoEntrada': nome,
            'arquivoSaida': ofx_nome,
            'banco': convertido['banco'],
            'contaDetectada': convertido['conta_detectada'],
            'contaFinal': convertido['conta_final'],
            'totalLancamentos': convertido['total_lancamentos'],
            'saldoFinal': convertido['saldo_final'],
            'ofxBase64': base64.b64encode(ofx_bytes).decode('ascii'),
        })
    except Exception as exc:
        resultados.append({
            'ok': False,
            'arquivoEntrada': nome,
            'erro': str(exc),
        })

if not ofx_gerados:
    print(json.dumps({
        'ok': False,
        'totalArquivos': len(arquivos),
        'totalConvertidos': 0,
        'resultados': resultados,
        'error': 'Nenhum OFX foi gerado. Verifique os erros individuais abaixo.',
    }, ensure_ascii=False))
    sys.exit(0)

zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
    for nome_ofx, ofx_bytes in ofx_gerados:
        zf.writestr(nome_ofx, ofx_bytes)

print(json.dumps({
    'ok': True,
    'totalArquivos': len(arquivos),
    'totalConvertidos': len(ofx_gerados),
    'resultados': resultados,
    'zipFileName': 'extratos_convertidos_ofx.zip',
    'zipBase64': base64.b64encode(zip_buffer.getvalue()).decode('ascii'),
}, ensure_ascii=False))
`.trim();

      const child = spawn(pythonBin, [...pythonArgs, script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Fallback local do conversor expirou."));
      }, 300000);

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (buffer) => {
        stdout += buffer.toString("utf8");
      });

      child.stderr.on("data", (buffer) => {
        stderr += buffer.toString("utf8");
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (stderr.trim()) {
          console.warn("[conversor-extrato-pdf-ofx] fallback local stderr:", stderr.trim());
        }
        if (code !== 0) {
          reject(new Error(`Fallback local do conversor finalizou com codigo ${code}.`));
          return;
        }
        try {
          resolve(JSON.parse(stdout || "{}"));
        } catch (error) {
          reject(new Error(`Falha ao interpretar retorno do fallback local: ${error.message}`));
        }
      });

      const payload = {
        arquivos: arquivos.map((arquivo) => ({
          nome: arquivo.originalname || "extrato.pdf",
          base64: Buffer.isBuffer(arquivo.buffer) ? arquivo.buffer.toString("base64") : "",
        })),
        bankid: String(bankid || "0000").trim() || "0000",
        acctid: String(acctid || "").trim() || null,
      };
      child.stdin.end(JSON.stringify(payload));
    });
  }

  router.post("/processar", requireCsrf, upload.array("arquivos", 100), async (req, res) => {
    try {
      const arquivos = req.files || [];
      if (!arquivos.length) {
        return res.status(400).json({ ok: false, error: "Envie pelo menos um arquivo PDF." });
      }

      // Valida se os arquivos têm buffer
      for (const arquivo of arquivos) {
        if (!arquivo.buffer || !Buffer.isBuffer(arquivo.buffer)) {
          console.error("Arquivo sem buffer válido:", arquivo.originalname, "buffer:", !!arquivo.buffer);
          return res.status(400).json({ ok: false, error: `Arquivo ${arquivo.originalname} inválido ou não foi salvo corretamente.` });
        }
      }

      const form = new FormData();
      for (const arquivo of arquivos) {
        form.append("arquivos", arquivo.buffer, {
          filename: arquivo.originalname || "extrato.pdf",
          contentType: arquivo.mimetype || "application/pdf",
        });
      }

      const bankid = String(req.body?.bankid || "0000").trim() || "0000";
      const acctid = String(req.body?.acctid || "").trim();
      form.append("bankid", bankid);
      if (acctid) {
        form.append("acctid", acctid);
      }

      const pyResp = await axios.post(`${PY_API_URL}/api/conversor-extrato-pdf-ofx/processar`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 300000,
      });

      return res.json(pyResp.data);
    } catch (err) {
      if (deveTentarFallbackLocal(err)) {
        console.warn("FastAPI indisponivel em 127.0.0.1:8001; usando fallback local do conversor PDF/OFX.");
        try {
          const fallback = await executarFallbackLocal({
            arquivos,
            bankid,
            acctid: acctid || null,
          });
          return res.json(fallback);
        } catch (fallbackErr) {
          console.error("Erro no fallback local do conversor-extrato-pdf-ofx:", fallbackErr?.message || fallbackErr);
          return res.status(503).json({
            ok: false,
            error: fallbackErr?.message || "Conversor indisponivel neste ambiente.",
          });
        }
      }

      console.error("Erro em conversor-extrato-pdf-ofx:", err?.response?.data || err.message);
      const status = err.response?.status || 500;
      const detail = err.response?.data?.detail || err.response?.data || err.message || "Erro";
      return res.status(status).json({
        ok: false,
        error: typeof detail === "string" ? detail : JSON.stringify(detail),
      });
    }
  });

  return router;
};
