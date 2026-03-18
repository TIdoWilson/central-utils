document.addEventListener("DOMContentLoaded", () => {
  inicializarSidebar("conversor-extrato-pdf-ofx");

  const form = document.getElementById("formConversorOfx");
  const arquivosPdf = document.getElementById("arquivosPdf");
  const bankid = document.getElementById("bankid");
  const acctid = document.getElementById("acctid");
  const statusMsg = document.getElementById("statusMsg");
  const resumoBox = document.getElementById("resumoBox");
  const tblResultados = document.getElementById("tblResultados");
  const btnBaixarZip = document.getElementById("btnBaixarZip");
  const btnLimpar = document.getElementById("btnLimpar");
  const btnConverter = document.getElementById("btnConverter");

  let ultimoResultado = null;

  function setStatus(texto, erro = false) {
    statusMsg.textContent = texto || "";
    statusMsg.style.color = erro ? "#b91c1c" : "";
  }

  function limparTabela() {
    tblResultados.innerHTML = "";
  }

  function resetarTela() {
    ultimoResultado = null;
    form.reset();
    bankid.value = "0000";
    btnBaixarZip.disabled = true;
    resumoBox.innerHTML = "<p>Nenhum processamento realizado.</p>";
    limparTabela();
    setStatus("");
  }

  function base64ParaBlob(base64, mime) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i += 1) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mime });
  }

  function baixarBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderResumo(data) {
    if (!data) {
      resumoBox.innerHTML = "<p>Nenhum processamento realizado.</p>";
      return;
    }

    resumoBox.innerHTML = `
      <div class="nfe-card-subtitle">
        <div><strong>Arquivos enviados:</strong> ${Number(data.totalArquivos || 0)}</div>
        <div><strong>Convertidos com sucesso:</strong> ${Number(data.totalConvertidos || 0)}</div>
      </div>
    `;
  }

  function renderResultados(resultados) {
    limparTabela();
    (resultados || []).forEach((item) => {
      const tr = document.createElement("tr");

      const acao = document.createElement("td");
      if (item.ok && item.ofxBase64 && item.arquivoSaida) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-secondary";
        btn.textContent = "Baixar OFX";
        btn.addEventListener("click", () => {
          const blob = base64ParaBlob(item.ofxBase64, "application/ofx");
          baixarBlob(blob, item.arquivoSaida);
        });
        acao.appendChild(btn);
      } else {
        acao.textContent = "-";
      }

      tr.innerHTML = `
        <td>${item.arquivoEntrada || ""}</td>
        <td>${item.arquivoSaida || "-"}</td>
        <td>${item.banco || "-"}</td>
        <td>${item.totalLancamentos - "-"}</td>
        <td>${item.ok ? "OK" : (item.erro || "Erro")}</td>
      `;
      tr.appendChild(acao);
      tblResultados.appendChild(tr);
    });
  }

  function setProcessando(ativo) {
    btnConverter.disabled = ativo;
    arquivosPdf.disabled = ativo;
    bankid.disabled = ativo;
    acctid.disabled = ativo;
  }

  btnBaixarZip.addEventListener("click", () => {
    if (!ultimoResultado?.zipBase64) return;
    const blob = base64ParaBlob(ultimoResultado.zipBase64, "application/zip");
    baixarBlob(blob, ultimoResultado.zipFileName || "extratos_convertidos_ofx.zip");
  });

  btnLimpar.addEventListener("click", resetarTela);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!arquivosPdf.files?.length) {
      setStatus("Selecione pelo menos um PDF.", true);
      return;
    }

    setProcessando(true);
    setStatus("Convertendo arquivos...");
    btnBaixarZip.disabled = true;
    limparTabela();
    renderResumo(null);

    try {
      const formData = new FormData();
      for (const arquivo of arquivosPdf.files) {
        formData.append("arquivos", arquivo);
      }
      formData.append("bankid", String(bankid.value || "0000").trim() || "0000");
      if (String(acctid.value || "").trim()) {
        formData.append("acctid", String(acctid.value || "").trim());
      }

      const resp = await AuthClient.authFetch("/api/conversor-extrato-pdf-ofx/processar", {
        method: "POST",
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || data.detail || `Erro HTTP ${resp.status}`);
      }

      ultimoResultado = data;
      renderResumo(data);
      renderResultados(data.resultados || []);
      btnBaixarZip.disabled = !data.zipBase64;
      setStatus("Conversão concluída.");
    } catch (err) {
      setStatus(`Falha na conversão: ${err.message}`, true);
      ultimoResultado = null;
      renderResumo(null);
    } finally {
      setProcessando(false);
    }
  });
});
