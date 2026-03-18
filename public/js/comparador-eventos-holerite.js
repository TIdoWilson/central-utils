document.addEventListener('DOMContentLoaded', () => {
  if (typeof inicializarSidebar === 'function') inicializarSidebar('comparador-eventos-holerite');

  const form = document.getElementById('comparadorEventosForm');
  const arquivoInput = document.getElementById('arquivoInput');
  const arquivoNome = document.getElementById('arquivoNome');
  const statusEl = document.getElementById('comparadorStatus');
  const btnProcessar = document.getElementById('btnProcessarComparador');
  const btnBaixar = document.getElementById('btnBaixarComparador');
  const resumoFuncionarios = document.getElementById('resumoFuncionarios');
  const resumoCompetenciaAnterior = document.getElementById('resumoCompetenciaAnterior');
  const resumoCompetenciaAtual = document.getElementById('resumoCompetenciaAtual');
  const filtroMenu = document.getElementById('filtroMenu');
  const filtroToggle = document.getElementById('filtroToggle');
  const marcarTodosFiltros = document.getElementById('marcarTodosFiltros');
  const desmarcarTodosFiltros = document.getElementById('desmarcarTodosFiltros');
  const filtrosWrap = document.getElementById('filtrosWrap');
  const previewHead = document.getElementById('previewHead');
  const previewBody = document.getElementById('previewBody');

  let ultimoArquivoBase64 = null;
  let ultimoArquivoNome = null;
  let ultimoPreview = [];
  let eventosVisiveis = new Set();
  let ultimoArquivoSelecionado = null;
  let ultimaCompetenciaAnteriorExtenso = '-';
  let ultimaCompetenciaAtualExtenso = '-';

  arquivoInput.addEventListener('change', () => {
    const arquivo = arquivoInput.files && arquivoInput.files[0];
    ultimoArquivoSelecionado = arquivo || null;
    arquivoNome.textContent = arquivo ? arquivo.name : 'Selecionar arquivo SLK...';
  });

  function setLoading(flag) {
    btnProcessar.disabled = flag;
    btnProcessar.textContent = flag ? 'Processando...' : 'Processar';
  }

  function escapeHtml(valor) {
    return String(valor || '')
      .replace(/&/g, '&')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function situacaoClasse(situacao) {
    const valor = String(situacao || '').trim();
    if (valor === 'Confere') return 'rh-status rh-status-confere';
    if (valor === 'Alterado') return 'rh-status rh-status-alterado';
    if (valor === 'Nao existe') return 'rh-status rh-status-nao-existe';
    return 'rh-status';
  }

  function situacaoStyle(situacao) {
    const valor = String(situacao || '').trim();
    if (valor === 'Confere') return 'background:#dcfce7;color:#166534;font-weight:700;';
    if (valor === 'Alterado') return 'background:#fef3c7;color:#92400e;font-weight:700;';
    if (valor === 'Nao existe') return 'background:#fee2e2;color:#991b1b;font-weight:700;';
    return 'font-weight:700;';
  }

  function situacaoExibicao(situacao) {
    const valor = String(situacao || '').trim();
    if (valor === 'Nao existe') return 'Não existe';
    return valor;
  }

  function limparPreview(texto) {
    previewHead.innerHTML = '';
    previewBody.innerHTML = `<tr><td>${escapeHtml(texto)}</td></tr>`;
    filtrosWrap.innerHTML = '';
    filtroMenu.classList.remove('open');
    filtroMenu.style.display = 'none';
  }

  function montarIdentificacaoFuncionario(item) {
    const codigo = String(item?.codigo_funcionario || item?.codigoFuncionario || '').trim();
    const nome = String(item?.nome_funcionario || item?.nomeFuncionario || item?.funcionario || '').trim();
    if (codigo && nome && !nome.startsWith(`${codigo} - `)) {
      return `${codigo} - ${nome}`;
    }
    return nome || codigo;
  }

  function normalizarPreview(preview) {
    if (!Array.isArray(preview)) return [];

    return preview.flatMap((item) => {
      const funcionario = montarIdentificacaoFuncionario(item);
      const codigoFuncionario = String(item?.codigo_funcionario || item?.codigoFuncionario || '').trim();
      const nomeFuncionario = String(item?.nome_funcionario || item?.nomeFuncionario || '').trim();

      if (item?.evento) {
        return [{
          funcionario,
          codigo_funcionario: codigoFuncionario,
          nome_funcionario: nomeFuncionario,
          evento: String(item.evento || ''),
          referencia: String(item?.referencia || ''),
          valor_anterior: String(item?.valor_anterior || item?.valorAnterior || ''),
          valor_atual: String(item?.valor_atual || item?.valorAtual || ''),
          situacao: String(item?.situacao || ''),
        }];
      }

      if (Array.isArray(item?.eventos)) {
        return item.eventos
          .filter(Boolean)
          .map((evento) => ({
            funcionario,
            codigo_funcionario: codigoFuncionario,
            nome_funcionario: nomeFuncionario,
            evento: String(evento || ''),
            referencia: '',
            valor_anterior: '',
            valor_atual: '',
            situacao: '',
          }));
      }

      return [];
    });
  }

  function renderFiltros(preview) {
    const previewNormalizado = normalizarPreview(preview);
    const eventos = [...new Set(
      previewNormalizado.map((item) => item?.evento || '').filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    if (!eventos.length) {
      filtrosWrap.innerHTML = '';
      filtroMenu.classList.remove('open');
      filtroMenu.style.display = 'none';
      return;
    }

    filtrosWrap.innerHTML = eventos.map((evento, indice) => `
      <label class="rh-check">
        <input type="checkbox" data-evento="${escapeHtml(evento)}" id="filtroEvento${indice}" checked>
        <span>${escapeHtml(evento)}</span>
      </label>
    `).join('');
    filtrosWrap.style.display = 'grid';
    eventosVisiveis = new Set(eventos);

    filtrosWrap.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', () => {
        const valor = input.getAttribute('data-evento') || '';
        if (input.checked) eventosVisiveis.add(valor);
        else eventosVisiveis.delete(valor);
        renderPreview(ultimoPreview);
      });
    });
    filtroMenu.style.display = 'inline-block';
  }

  function renderPreview(preview) {
    const previewNormalizado = normalizarPreview(preview);

    if (!previewNormalizado.length) {
      limparPreview('Nenhum evento encontrado para comparacao no periodo informado.');
      return;
    }

    const previewFiltrado = previewNormalizado
      .filter((item) => eventosVisiveis.has(item?.evento || ''))
      .map((item) => ({
        funcionario: item.funcionario,
        evento: item?.evento || '',
        referencia: item?.referencia || '',
        valorAnterior: item?.valor_anterior || item?.valorAnterior || '',
        valorAtual: item?.valor_atual || item?.valorAtual || '',
        situacao: item?.situacao || '',
      }));

    if (!previewFiltrado.length) {
      previewHead.innerHTML = '';
      previewBody.innerHTML = '<tr><td>Nenhum funcionario permanece visivel com os filtros atuais.</td></tr>';
      return;
    }

    previewHead.innerHTML = `
      <tr>
        <th>Funcionario</th>
        <th>Evento</th>
        <th>Referencia</th>
        <th>${escapeHtml(ultimaCompetenciaAnteriorExtenso)}</th>
        <th>${escapeHtml(ultimaCompetenciaAtualExtenso)}</th>
        <th>Situa&ccedil;&atilde;o</th>
      </tr>
    `;

    let funcionarioAnterior = null;
    previewBody.innerHTML = previewFiltrado.map((item) => {
      const funcionarioExibido = item.funcionario === funcionarioAnterior ? '' : item.funcionario;
      funcionarioAnterior = item.funcionario;
      return `
        <tr>
          <td>${escapeHtml(funcionarioExibido)}</td>
          <td>${escapeHtml(item.evento)}</td>
          <td>${escapeHtml(item.referencia)}</td>
          <td>${escapeHtml(item.valorAnterior)}</td>
          <td>${escapeHtml(item.valorAtual)}</td>
          <td class="${situacaoClasse(item.situacao)}" style="${situacaoStyle(item.situacao)}">${escapeHtml(situacaoExibicao(item.situacao))}</td>
        </tr>
      `;
    }).join('');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const arquivo = arquivoInput.files && arquivoInput.files[0];
    ultimoArquivoSelecionado = arquivo || null;

    if (!arquivo) {
      statusEl.textContent = 'Selecione um arquivo .slk.';
      return;
    }

    statusEl.textContent = '';
    ultimoArquivoBase64 = null;
    ultimoArquivoNome = null;
    ultimoPreview = [];
    eventosVisiveis = new Set();
    btnBaixar.disabled = true;
    limparPreview('Processando...');

    const formData = new FormData();
    formData.append('arquivo', arquivo);

    try {
      setLoading(true);
      const response = await AuthClient.authFetch('/api/comparador-eventos-holerite/processar', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.ok) throw new Error((data && data.error) || 'Falha ao processar o arquivo.');

      resumoFuncionarios.textContent = String(data.totalFuncionariosComDiferenca || 0);
      resumoCompetenciaAnterior.textContent = data.competenciaAnteriorExtenso || '-';
      resumoCompetenciaAtual.textContent = data.competenciaAtualExtenso || '-';
      ultimaCompetenciaAnteriorExtenso = data.competenciaAnteriorExtenso || '-';
      ultimaCompetenciaAtualExtenso = data.competenciaAtualExtenso || '-';
      ultimoPreview = normalizarPreview(Array.isArray(data.preview) ? data.preview : []);
      renderFiltros(ultimoPreview);
      renderPreview(ultimoPreview);

      ultimoArquivoBase64 = data.xlsxBase64 || null;
      ultimoArquivoNome = data.arquivoSaida || 'comparador_eventos_holerite.xlsx';
      btnBaixar.disabled = !ultimoArquivoBase64;

      const competencias = Array.isArray(data.competenciasEncontradas) ? data.competenciasEncontradas.join(', ') : '-';
      statusEl.textContent = `Processamento concluido. Competencias encontradas no arquivo: ${competencias}.`;
    } catch (error) {
      console.error(error);
      statusEl.textContent = error.message || 'Erro ao processar o arquivo.';
      resumoFuncionarios.textContent = '0';
      resumoCompetenciaAnterior.textContent = '-';
      resumoCompetenciaAtual.textContent = '-';
      limparPreview('Falha ao gerar o preview.');
    } finally {
      setLoading(false);
    }
  });

  btnBaixar.addEventListener('click', () => {
    if (!ultimoArquivoSelecionado) return;

    const baixarFiltrado = async () => {
      try {
        btnBaixar.disabled = true;
        btnBaixar.textContent = 'Gerando...';

        const formData = new FormData();
        formData.append('arquivo', ultimoArquivoSelecionado);
        const todosEventos = [...new Set(
          normalizarPreview(ultimoPreview).map((item) => item?.evento || '').filter(Boolean)
        )];
        const ocultarEventos = todosEventos.filter((evento) => !eventosVisiveis.has(evento));
        formData.append('ocultarEventosJson', JSON.stringify(ocultarEventos));

        const response = await AuthClient.authFetch('/api/comparador-eventos-holerite/processar', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || !data.ok) throw new Error((data && data.error) || 'Falha ao gerar o Excel filtrado.');

        ultimoArquivoBase64 = data.xlsxBase64 || null;
        ultimoArquivoNome = data.arquivoSaida || 'comparador_eventos_holerite.xlsx';

        const bytes = Uint8Array.from(atob(ultimoArquivoBase64), (char) => char.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = ultimoArquivoNome;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error(error);
        statusEl.textContent = error.message || 'Erro ao gerar o Excel filtrado.';
      } finally {
        btnBaixar.disabled = false;
        btnBaixar.textContent = 'Baixar Excel';
      }
    };

    baixarFiltrado();
  });

  filtroToggle.addEventListener('click', () => {
    filtroMenu.classList.toggle('open');
  });

  marcarTodosFiltros.addEventListener('click', () => {
    filtrosWrap.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = true;
      const valor = input.getAttribute('data-evento') || '';
      if (valor) eventosVisiveis.add(valor);
    });
    renderPreview(ultimoPreview);
  });

  desmarcarTodosFiltros.addEventListener('click', () => {
    filtrosWrap.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = false;
    });
    eventosVisiveis = new Set();
    renderPreview(ultimoPreview);
  });

  document.addEventListener('click', (event) => {
    if (!filtroMenu.contains(event.target)) {
      filtroMenu.classList.remove('open');
    }
  });
});
