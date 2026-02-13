# 04 - Contribuindo para o Projeto

## 🤝 Código de Conduta

Ao contribuir, você concorda em:

- Ser respeitoso com outros contribuidores
- Aceitar críticas construtivas
- Reportar bugs e problemas de forma clara
- Testar suas mudanças antes de submeter

---

## 🐛 Reportar Bugs

### Formato de Issue

```
Título: [BUG] Descrição breve do problema

Descrição:
- O que você estava fazendo?
- O que esperava que acontecesse?
- O que realmente aconteceu?

Passos para reproduzir:
1. ...
2. ...
3. ...

Logs/Erro:
(copie mensagem de erro aqui)

Ambiente:
- Windows 10 / Linux / macOS
- Node.js 18.x
- Python 3.10
```

---

## 💡 Sugerir Melhorias

```
Título: [FEATURE] Sua sugestão

Descrição:
Por que seria útil?

Exemplo de uso:
Como deveria funcionar?

Alternativas consideradas:
Você pensou em outra abordagem?
```

---

## 📝 Padrões de Código

### JavaScript (Node.js / Frontend)

**Estilo:**
```javascript
// ✅ Bom
const processFile = async (filePath) => {
  try {
    const data = await readFile(filePath);
    return { success: true, data };
  } catch (error) {
    console.error('Erro ao processar:', error);
    return { success: false, error };
  }
};

// ❌ Evitar
function ProcessFile(filePath) {
  var data = readFile(filePath);
  return data;
}
```

**Convenções:**
- Use `camelCase` para variáveis/funções
- Use `const` por padrão, `let` se necessário
- Adicione comentários em lógica complexa
- Use `async/await` em vez de callbacks
- Trate erros sempre

**Nomes de Variáveis:**
```javascript
// ✅ Claro
const uploadedFilePath = req.file.path;
const isProcessing = job.status === 'processing';

// ❌ Ambíguo
const f = req.file.path;
const p = job.status === 'processing';
```

**Exemplo de Função Bem Estruturada:**
```javascript
/**
 * Valida e processa upload de arquivo
 * @param {Express.Multer.File} file - Arquivo uploaded
 * @param {string} toolName - Nome da ferramenta
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
const processUpload = async (file, toolName) => {
  // Validações
  if (!file) {
    return { success: false, error: 'Arquivo não fornecido' };
  }

  // Processamento
  try {
    const savePath = path.join(UPLOADS_DIR, toolName, file.filename);
    // ... mais lógica
    return { success: true, path: savePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
```

---

### Python (API / Cores)

**Estilo PEP 8:**
```python
# ✅ Bom
from pathlib import Path
from typing import Optional, List

def processar_pdf_arquivo(
    file_path: str,
    output_dir: Optional[str] = None
) -> dict:
    """
    Processa PDF e retorna resultado.
    
    Args:
        file_path: Caminho do arquivo PDF
        output_dir: Diretório de saída (opcional)
    
    Returns:
        dict: {
            'success': bool,
            'output_path': str,
            'page_count': int,
            'error': str (se erro)
        }
    """
    try:
        # Implementação
        return {
            'success': True,
            'output_path': str(output_path),
            'page_count': num_pages
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

# ❌ Evitar
def ProcessPdf(fp, od=None):
    data = process(fp)
    return data
```

**Convenções:**
- Use `snake_case` para funções/variáveis
- Adicione type hints
- Documente com docstrings
- Use `logging` para debug
- Trate exceções apropriadamente

**Tipos Padrão para Retorno:**
```python
from typing import Dict, Any

# Sempre retornar dicts estruturados
result: Dict[str, Any] = {
    'success': bool,
    'output': str,  # Caminho ou dados
    'pages': int,   # Se aplicável
    'error': str    # Se houver erro
}
```

---

## 🏗️ Adicionar Nova Ferramenta

### Passo 1: Criar Core Python

Arquivo: `api/nova_ferramenta_core.py`

```python
# api/nova_ferramenta_core.py
"""
Processador de Nova Ferramenta.

Responsabb: Fazer algo específico.
Entrada: arquivo ou parâmetros
Saída: arquivo processado
"""

from pathlib import Path
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

def processar_nova_ferramenta(
    input_path: str,
    param1: str,
    output_dir: Optional[str] = None
) -> Dict[str, Any]:
    """
    Processa conforme lógica da ferramenta.
    
    Args:
        input_path: Arquivo de entrada
        param1: Parâmetro necessário
        output_dir: Diretório de saída
    
    Returns:
        dict com resultado ou erro
    """
    input_file = Path(input_path)
    if not input_file.exists():
        return {
            'success': False,
            'error': 'Arquivo não encontrado'
        }
    
    try:
        # Sua lógica aqui
        output_path = Path(output_dir) / 'resultado.pdf'
        
        logger.info(f'Processamento concluído: {output_path}')
        
        return {
            'success': True,
            'output_path': str(output_path),
            'output_filename': output_path.name
        }
    except Exception as e:
        logger.error(f'Erro: {e}')
        return {
            'success': False,
            'error': str(e)
        }
```

### Passo 2: Adicionar Endpoint FastAPI

Editar: `api/integra_api.py`

```python
# Adicione no topo
from api.nova_ferramenta_core import processar_nova_ferramenta

# Adicione modelo Pydantic
from pydantic import BaseModel

class NovaFerramenta Request(BaseModel):
    input_path: str
    param1: str
    output_dir: Optional[str] = None

# Adicione endpoint
@app.post("/api/nova-ferramenta/processar")
async def nova_ferramenta_endpoint(params: NovaFerramenta Request):
    """Endpoint da nova ferramenta"""
    result = processar_nova_ferramenta(
        input_path=params.input_path,
        param1=params.param1,
        output_dir=params.output_dir
    )
    
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error'))
    
    return result
```

### Passo 3: Criar Frontend HTML

Arquivo: `public/nova-ferramenta.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width">
    <title>Nova Ferramenta</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <h1>Nova Ferramenta</h1>
        <p>Descrição breve do que faz</p>
        
        <form id="form-nova-ferramenta">
            <div class="form-group">
                <label>Arquivo de Entrada</label>
                <input type="file" id="input-file" required>
            </div>
            
            <div class="form-group">
                <label>Parâmetro 1</label>
                <input type="text" id="param1" placeholder="Valor" required>
            </div>
            
            <button type="submit" class="btn-submit">Processar</button>
        </form>
        
        <div id="resultado" class="resultado" style="display:none;">
            <p id="status"></p>
            <button id="btn-download" class="btn-download">Baixar Resultado</button>
        </div>
    </div>
    
    <script src="js/nova-ferramenta.js"></script>
</body>
</html>
```

### Passo 4: Criar JavaScript Frontend

Arquivo: `public/js/nova-ferramenta.js`

```javascript
// public/js/nova-ferramenta.js

document.getElementById('form-nova-ferramenta').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const file = document.getElementById('input-file').files[0];
    const param1 = document.getElementById('param1').value;
    
    // Validar
    if (!file) {
        alert('Escolha um arquivo');
        return;
    }
    
    // Fazer upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('param1', param1);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            alert(`Erro: ${data.error}`);
            return;
        }
        
        // Processar
        const result = await fetch('/api/nova-ferramenta/processar', {
            method: 'POST',
            body: JSON.stringify({
                input_path: data.file_path,
                param1: param1
            }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const processResult = await result.json();
        
        if (!processResult.success) {
            alert(`Erro: ${processResult.error}`);
            return;
        }
        
        // Exibir resultado
        document.getElementById('resultado').style.display = 'block';
        document.getElementById('status').innerHTML = '✅ Processamento concluído!';
        document.getElementById('btn-download').onclick = () => {
            // Link para baixar
            window.location.href = `/download/${processResult.output_path}`;
        };
        
    } catch (error) {
        alert(`Erro: ${error.message}`)
    }
});

function getToken() {
    return localStorage.getItem('auth_token') || '';
}
```

### Passo 5: Adicionar Menu

Editar: `public/home.html` (ou sidebar)

```html
<!-- Adicione novo item no menu -->
<li><a href="nova-ferramenta.html">Nova Ferramenta</a></li>
```

### Passo 6: Documentar

Criar: `docs/tools/<slug>.md`

```markdown
# Nova Ferramenta

## Objetivo
Descrição breve

## Entrada
- Arquivo (tipo)
- Parâmetro 1 (descrição)

## Saída
- Arquivo processado

## Exemplo

### API REST
\`\`\`bash
curl -X POST http://localhost:8001/api/nova-ferramenta/processar \
  -H "Content-Type: application/json" \
  -d '{
    "input_path": "/path/to/file.pdf",
    "param1": "valor"
  }'
\`\`\`

### Frontend
1. Vá em "Nova Ferramenta"
2. Escolha arquivo
3. Preencha parâmetro
4. Clique em "Processar"
5. Baixe resultado
```

---

## ✅ Checklist para Submeter PR

- [ ] Código segue padrões de estilo
- [ ] Adicionou/atualizou documentação
- [ ] Testou localmente
- [ ] Sem erros no console
- [ ] Sem bibliotecas não utilizadas
- [ ] Atualizou `requirements.txt` ou `package.json`
- [ ] Escreveu comentários para lógica complexa
- [ ] Tratamento de erros apropriado

---

## 📚 Estrutura de Pastas para Nova Ferramenta

```
central-utils/
├── api/
│   ├── nova_ferramenta_core.py      ← Core Python
│   └── integra_api.py               ← Adiciona endpoint
├── public/
│   ├── nova-ferramenta.html        ← Página HTML
│   └── js/
│       └── nova-ferramenta.js      ← Lógica JS
├── data/
│   └── nova-ferramenta/            ← Dados da ferramenta
├── docs/
│   ├── api/
│   │   └── XX-nova-ferramenta.md   ← Documentação
│   └── exemplos/
│       └── nova-ferramenta.md      ← Exemplos
└── ...
```

---

## 🔄 Processo de Contribuição

1. **Faça Fork** (se em GitHub)
2. **Crie Branch:** `git checkout -b feature/nova-ferramenta`
3. **Faça Commits:** `git commit -m "Adiciona Nova Ferramenta"`
4. **Teste Tudo:** `npm run dev` + testar ferramenta
5. **Atualize Docs:** Adicione documentação
6. **Push:** `git push origin feature/nova-ferramenta`
7. **Abra PR:** Com descrição clara da mudança

---

## 📋 Template de PR

```
## Descrição
Breve descrição do que foi adicionado/mudado

## Tipo de Mudança
- [ ] 🐛 Bug fix
- [ ] ✨ Nova ferramenta
- [ ] 📝 Documentação
- [ ] ⚡ Performance
- [ ] 🔒 Segurança

## Changes Made
- Mudança 1
- Mudança 2
- Mudança 3

## Testing
- [ ] Testado em Windows
- [ ] Testado em Linux
- [ ] Sem erros em console

## Screenshots (se UI)
[Se aplicável, adicione prints]

## Checklist
- [ ] Código segue o style guide
- [ ] Documentação atualizada
- [ ] Testes passando
- [ ] Sem quebra de compatibilidade
```

---

## 🎓 Aprender Mais

### Arquitetura
- [01-ARQUITETURA.md](./01-ARQUITETURA.md)

### Detalhes Técnicos
- Python: [Documentação FastAPI](https://fastapi.tiangolo.com/)
- Node.js: [Documentação Express](https://expressjs.com/)
- Bancos: [PostgreSQL Docs](https://www.postgresql.org/docs/)

---

## ❓ Dúvidas?

1. Veja documentação em `docs/`
2. Verifique exemplos em `docs/exemplos/`
3. Abra issue com dúvida etiquetada como `question`

---

**Última atualização:** Fevereiro 2026
