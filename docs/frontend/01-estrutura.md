# Frontend - Estrutura e Componentes

## 📁 Organização

```
public/
├── *.html                    # Páginas de cada ferramenta
├── js/
│   ├── [ferramenta].js       # Lógica específica
│   ├── sidebar.js            # Menu lateral
│   ├── auth-client.js        # Autenticação
│   ├── upload-helper.js      # Upload de arquivos
│   ├── logs.js               # Visualização logs
│   └── municipios_dimob.json # Dados estáticos
├── css/
│   └── styles.css            # Estilos globais
└── img/
    └── *.png, *.jpg          # Imagens/logos
```

---

## 🏗️ Arquivos Principais

### 1. HTML (Páginas)

**Exemplo: `public/gerador-atas.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width">
    <title>Gerador de Atas - Central Utils</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="sidebar">
        <!-- Menu incluído via sidebar.js -->
    </div>
    
    <div class="main-content">
        <h1>Gerador de Atas</h1>
        <p>Descrição breve da ferramenta</p>
        
        <!-- Formulário específico -->
        <form id="form-ferramenta">
            <!-- Campos específicos -->
        </form>
        
        <!-- Resultado -->
        <div id="resultado" style="display:none;">
            <!-- Mostrado após processamento -->
        </div>
    </div>
    
    <script src="js/sidebar.js"></script>
    <script src="js/auth-client.js"></script>
    <script src="js/gerador-atas.js"></script>
</body>
</html>
```

### 2. JavaScript por Ferramenta

**Padrão: `public/js/[ferramenta].js`**

```javascript
// Inicializar quando página carrega
document.addEventListener('DOMContentLoaded', () => {
    setupForm();
    setupEventListeners();
});

function setupForm() {
    // Inicializar campos
}

function setupEventListeners() {
    // Listener do formulário
    document.getElementById('form-ferramenta')
        .addEventListener('submit', handleSubmit);
}

async function handleSubmit(e) {
    e.preventDefault();
    
    // Coletar dados
    const data = {
        campo1: document.getElementById('campo1').value,
        campo2: document.getElementById('campo2').value
    };
    
    // Validar
    if (!validarDados(data)) {
        alert('Dados inválidos');
        return;
    }
    
    // Enviar para API
    try {
        const response = await fetch('/api/[ferramenta]/processar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            exibirResultado(result);
        } else {
            alert(`Erro: ${result.error}`);
        }
    } catch (error) {
        alert(`Erro na requisição: ${error}`);
    }
}

function exibirResultado(result) {
    document.getElementById('resultado').style.display = 'block';
    document.getElementById('resultado').innerHTML = `
        <p>✅ ${result.message}</p>
        <a href="/download/${result.output_path}" download class="btn">
            Baixar Resultado
        </a>
    `;
}

function validarDados(data) {
    return data.campo1 && data.campo2;
}

function getToken() {
    return localStorage.getItem('auth_token') || '';
}
```

---

## 🔑 Componentes Reutilizáveis

### auth-client.js

Gerencia autenticação no lado cliente:

```javascript
// Login
async function login(username, password) {
    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    if (data.token) {
        localStorage.setItem('auth_token', data.token);
        window.location.href = '/public/home.html';
    }
}

// Logout
function logout() {
    localStorage.removeItem('auth_token');
    window.location.href = '/public/login.html';
}

// Verificar se autenticado
function isAuthenticated() {
    return !!localStorage.getItem('auth_token');
}

// Redirecionar se não autenticado
if (!isAuthenticated() && !window.location.pathname.includes('login')) {
    window.location.href = '/public/login.html';
}
```

### upload-helper.js

Facilita upload de arquivos:

```javascript
function setupFileUpload(inputId, displayId) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            display.textContent = `📄 ${file.name} (${formatBytes(file.size)})`;
        }
    });
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        headers: {
            'Authorization': `Bearer ${getToken()}`
        }
    });
    
    return response.json();
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
```

### sidebar.js

Menu lateral dinâmico:

```javascript
const MENU_ITEMS = [
    { label: 'Home', href: '/public/home.html' },
    { label: 'Gerador de Atas', href: '/public/gerador-atas.html' },
    { label: 'Separador PDF Férias', href: '/public/separador-pdf-relatorio-de-ferias.html' },
    // ... mais itens
    { label: 'Admin', href: '/public/admin-usuarios.html', admin: true },
    { label: 'Sair', action: logout }
];

function renderSidebar() {
    const sidebar = document.querySelector('.sidebar');
    let html = '<ul>';
    
    MENU_ITEMS.forEach(item => {
        // Skip admin items se não admin
        if (item.admin && !isAdmin()) return;
        
        if (item.action) {
            html += `<li><a href="javascript:${item.label.replace(' ', '')}()">${item.label}</a></li>`;
        } else {
            html += `<li><a href="${item.href}">${item.label}</a></li>`;
        }
    });
    
    html += '</ul>';
    sidebar.innerHTML = html;
}

function isAdmin() {
    // Verificar flag de admin do usuário
    return localStorage.getItem('is_admin') === 'true';
}
```

---

## 🎨 CSS Global (styles.css)

Principais estilos:

```css
/* Layout */
body {
    margin: 0;
    font-family: 'Lato', Arial, sans-serif;
    background: #f5f5f5;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

/* Sidebar */
.sidebar {
    position: fixed;
    left: 0;
    top: 0;
    width: 250px;
    height: 100vh;
    background: #1a3a4a;
    color: white;
    padding: 20px;
    overflow-y: auto;
}

.sidebar ul {
    list-style: none;
    padding: 0;
}

.sidebar li {
    margin: 10px 0;
}

.sidebar a {
    color: white;
    text-decoration: none;
    display: block;
    padding: 10px;
    border-radius: 4px;
    transition: background 0.3s;
}

.sidebar a:hover {
    background: #2c5aa0;
}

/* Main Content */
.main-content {
    margin-left: 250px;
    padding: 30px;
}

/* Forms */
.form-group {
    margin: 20px 0;
}

.form-group label {
    display: block;
    font-weight: bold;
    margin-bottom: 5px;
}

.form-group input,
.form-group select,
.form-group textarea {
    width: 100%;
    max-width: 500px;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: inherit;
}

/* Buttons */
.btn {
    background: #2c5aa0;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.3s;
}

.btn:hover {
    background: #1a3a4a;
}

/* Results */
.resultado {
    background: #e8f5e9;
    border-left: 4px solid #4caf50;
    padding: 15px;
    margin-top: 20px;
    border-radius: 4px;
}

/* Progress */
.progress-bar {
    width: 100%;
    height: 20px;
    background: #eee;
    border-radius: 10px;
    overflow: hidden;
}

.progress {
    height: 100%;
    background: #4caf50;
    transition: width 0.3s;
}
```

---

## 📡 Padrão de Integração com API

### Fluxo Típico

```javascript
// 1. Fazer upload (se arquivo)
const fileResult = await uploadFile(fileInput.files[0]);

// 2. Processar
const processResult = await fetch('/api/ferramenta/processar', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({
        input_path: fileResult.file_path,
        param1: formData.param1
    })
});

// 3. Exibir resultado
const result = await processResult.json();
if (result.success) {
    showDownloadLink(result.output_path);
} else {
    showError(result.error);
}
```

---

## 🔄 Comunicação com Socket.io (Tempo Real)

```javascript
// Conectar
const socket = io();

// Receber progresso
socket.on('job:progress', (data) => {
    updateProgressBar(data.percentage);
    updateStatusText(data.message);
});

// Job concluído
socket.on('job:completed', (data) => {
    showResult(data);
    enableDownloadButton();
});

// Erro
socket.on('job:error', (data) => {
    showError(data.error);
});
```

---

## 📋 Checklist para Nova Página

- [ ] Criar `public/[ferramenta].html`
- [ ] Criar `public/js/[ferramenta].js`
- [ ] Formulário com validação
- [ ] Upload se necessário
- [ ] Requisição à API
- [ ] Exibição de resultado
- [ ] Link de download
- [ ] Tratamento de erros
- [ ] Adicionar ao menu sidebar
- [ ] Testar responsividade

---

**Última atualização:** Fevereiro 2026
