// public/js/upload-helper.js

(function () {
  const enhancedInputs = [];
  let pageDnDInitialized = false;

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function assignFilesToInput(input, droppedFiles) {
    if (!input || !droppedFiles || !droppedFiles.length) return false;

    if (window.DataTransfer) {
      const dataTransfer = new DataTransfer();
      const max = input.multiple ? droppedFiles.length : 1;
      for (let i = 0; i < max; i += 1) {
        dataTransfer.items.add(droppedFiles[i]);
      }
      input.files = dataTransfer.files;
      return true;
    }

    try {
      input.files = droppedFiles;
      return true;
    } catch (err) {
      console.warn('Nao foi possivel atribuir files via drop:', err);
      return false;
    }
  }

  function notifyInputChanged(input) {
    if (!input) return;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function enhanceFileInput(input) {
    if (!input || input.dataset.wlUploadEnhanced === '1') return;
    input.dataset.wlUploadEnhanced = '1';

    enhancedInputs.push(input);

    // Area de drop local: tenta usar o label estilizado; se nao achar, usa o pai.
    const area =
      input.closest('.nfe-input-file-label') ||
      input.closest('.wl-upload-area') ||
      input.parentElement;

    if (!area) return;

    // Tenta encontrar um alvo ja existente para o sumario (para estabilidade de layout)
    let summaryEl = area.parentElement.querySelector('.wl-upload-summary-target');
    
    if (!summaryEl) {
      summaryEl = area.nextElementSibling;
    }

    if (!summaryEl || !summaryEl.classList.contains('wl-upload-summary')) {
      const newEl = document.createElement('div');
      newEl.className = 'wl-upload-summary';
      newEl.textContent = 'Nenhum arquivo selecionado.';
      
      if (summaryEl && summaryEl.classList.contains('wl-upload-summary-target')) {
         summaryEl.appendChild(newEl);
         summaryEl = newEl;
      } else {
         area.insertAdjacentElement('afterend', newEl);
         summaryEl = newEl;
      }
    }

    function formatFiles(files) {
      if (!files || files.length === 0) {
        return 'Nenhum arquivo selecionado.';
      }
      if (files.length === 1) {
        return files[0].name;
      }
      if (files.length <= 5) {
        const names = Array.from(files).map((f) => f.name).join(', ');
        return `${files.length} arquivos: ${names}`;
      }
      const names = Array.from(files)
        .slice(0, 5)
        .map((f) => f.name)
        .join(', ');
      return `${files.length} arquivos selecionados (mostrando 5): ${names}`;
    }

    function updateSummary() {
      summaryEl.textContent = formatFiles(input.files);
    }

    // Mantido para compatibilidade com possiveis chamadas externas.
    input.__wlUpdateSummary = updateSummary;

    input.addEventListener('change', updateSummary);

    // -----------------------
    // Drag & Drop LOCAL (no botao/label)
    // -----------------------
    ['dragenter', 'dragover'].forEach((eventName) => {
      area.addEventListener(eventName, (e) => {
        preventDefaults(e);
        area.classList.add('wl-upload-area--dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      area.addEventListener(eventName, (e) => {
        preventDefaults(e);
        if (eventName === 'drop') {
          const dt = e.dataTransfer;
          if (dt && dt.files && dt.files.length) {
            const applied = assignFilesToInput(input, dt.files);
            if (applied) {
              notifyInputChanged(input);
            }
          }
        }
        area.classList.remove('wl-upload-area--dragover');
      });
    });

    // Estado inicial
    updateSummary();
  }

  function getPrimaryFileInput() {
    if (!enhancedInputs.length) return null;

    // Se algum input estiver marcado como "primario", usa ele.
    const preferred = enhancedInputs.find(
      (inp) => inp.dataset.wlPrimaryUpload === '1'
    );
    if (preferred) return preferred;

    // Senao, usa o primeiro da pagina (na maioria das telas so existe um).
    return enhancedInputs[0];
  }

  // -----------------------
  // Drag & Drop GLOBAL (qualquer lugar da pagina)
  // -----------------------
  function initGlobalPageDragDrop() {
    if (pageDnDInitialized) return;
    pageDnDInitialized = true;

    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
      preventDefaults(e);
      dragCounter += 1;
      document.body.classList.add('wl-page-dragover');
    });

    document.addEventListener('dragover', (e) => {
      preventDefaults(e);
    });

    document.addEventListener('dragleave', (e) => {
      preventDefaults(e);
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) {
        document.body.classList.remove('wl-page-dragover');
      }
    });

    document.addEventListener('drop', (e) => {
      preventDefaults(e);
      dragCounter = 0;
      document.body.classList.remove('wl-page-dragover');

      // Se o drop foi dentro de uma area de upload especifica,
      // ela ja tratou o evento (por causa do stopPropagation).
      // Aqui tratamos o drop no resto da pagina.
      const dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;

      const input = getPrimaryFileInput();
      if (!input) return;

      const applied = assignFilesToInput(input, dt.files);
      if (applied) {
        notifyInputChanged(input);
      }
    });
  }

  function initAllFileUploads() {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(enhanceFileInput);

    if (fileInputs.length > 0) {
      initGlobalPageDragDrop();
    }
  }

  document.addEventListener('DOMContentLoaded', initAllFileUploads);
})();
