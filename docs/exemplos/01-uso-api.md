# Exemplos de Uso da API

## 📚 Índice de Exemplos

- [Autenticação](#autenticação)
- [Upload de Arquivo](#upload-de-arquivo)
- [Gerador de Atas](#gerador-de-atas)
- [Separador PDF](#separador-pdf)
- [Compressor PDF](#compressor-pdf)
- [Tratamento de Erros](#tratamento-de-erros)

---

## 🔐 Autenticação

### 1. Login

**cURL:**

```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "seu_usuario",
    "password": "sua_senha"
  }' \
  -c cookies.txt
```

**Resposta:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "seu_usuario",
    "full_name": "Seu Nome",
    "is_admin": false
  }
}
```

### 2. Usar Token em Requisições

**cURL com header:**

```bash
curl -X POST http://localhost:8001/api/gerar-atas/processar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{ ... }'
```

**Python:**

```python
import requests

token = "seu_token_aqui"
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

response = requests.post(
    "http://localhost:8001/api/gerar-atas/processar",
    json={...},
    headers=headers
)
```

**JavaScript:**

```javascript
const token = localStorage.getItem('auth_token');

fetch('http://localhost:8001/api/gerar-atas/processar', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({...})
})
.then(r => r.json())
.then(data => console.log(data));
```

---

## 📤 Upload de Arquivo

### Upload de PDF

**cURL:**

```bash
curl -X POST http://localhost:3000/api/upload \
  -H "Authorization: Bearer SEU_TOKEN" \
  -F "file=@/caminho/arquivo.pdf" \
  -F "tool=separador-pdf"
```

**Resposta:**

```json
{
  "success": true,
  "file_path": "/data/uploads/separador-pdf/arquivo_12345.pdf",
  "filename": "arquivo.pdf",
  "size": 2048000,
  "mimetype": "application/pdf"
}
```

**Python:**

```python
import requests

token = "seu_token_aqui"

with open('arquivo.pdf', 'rb') as f:
    files = {'file': f}
    data = {'tool': 'separador-pdf'}
    headers = {'Authorization': f'Bearer {token}'}
    
    response = requests.post(
        'http://localhost:3000/api/upload',
        files=files,
        data=data,
        headers=headers
    )
    
    result = response.json()
    print(f"Arquivo salvo em: {result['file_path']}")
```

---

## ✍️ Gerador de Atas

### Exemplo Completo

**cURL:**

```bash
curl -X POST http://localhost:8001/api/gerador-atas/gerar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "modelo": "Template Bernadina.xlsm",
    "data_reuniao": "2025-02-06",
    "hora_inicio": "14:30",
    "hora_fim": "16:00",
    "local": "Sala de Conferências",
    "responsavel": "João Silva",
    "departamento": "Administração",
    "titulo": "Reunião de Planejamento",
    "presentes": [
      "João Silva",
      "Maria Santos",
      "Carlos Costa"
    ],
    "ausentes": [],
    "assuntos": [
      {
        "numero": 1,
        "titulo": "Revisão de Orçamento",
        "discussao": "Análise dos gastos do primeiro mês. Necessário redução em IT."
      },
      {
        "numero": 2,
        "titulo": "Cronograma de Projetos",
        "discussao": "Todos os projetos estão no prazo. Datas foram mantidas."
      }
    ],
    "decisoes": [
      "Aprovar orçamento com redução de 5% em IT",
      "Manter cronograma vigente"
    ],
    "proxima_reuniao": "2025-03-06"
  }' \
  -v
```

**Python (Completo):**

```python
import requests
import json
from datetime import date, timedelta

def gerar_ata_exemplo():
    """Gera ata de exemplo via API"""
    
    token = "seu_token_aqui"
    
    # Dados da ata
    ata = {
        "modelo": "Template Bernadina.xlsm",
        "data_reuniao": date.today().isoformat(),
        "hora_inicio": "14:30",
        "hora_fim": "16:00",
        "local": "Sala Executive",
        "responsavel": "Diretor Geral",
        "departamento": "Diretoria",
        "titulo": "Reunião Executiva",
        "presentes": [
            "Diretor Geral",
            "Gerente Financeiro",
            "Gerente Operacional",
            "Gerente RH"
        ],
        "ausentes": ["Consultor Externo"],
        "assuntos": [
            {
                "numero": 1,
                "titulo": "Q1 2025 Goals",
                "discussao": "Apresentação das metas do primeiro trimestre. Todos alinhados com diretoria."
            },
            {
                "numero": 2,
                "titulo": "Orçamento IT",
                "discussao": "Aprovação de investimento em nova infraestrutura. ROI estimado em 12 meses."
            },
            {
                "numero": 3,
                "titulo": "Contratações",
                "discussao": "Autorização para 3 novas posições. Processo seletivo deve iniciar em fevereiro."
            }
        ],
        "decisoes": [
            "Metas Q1 aprovadas por unanimidade",
            "Orçamento IT aumentado em 20%",
            "Autorizar 3 contratações imediatas"
        ],
        "proxima_reuniao": (date.today() + timedelta(days=30)).isoformat()
    }
    
    # Fazer requisição
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            "http://localhost:8001/api/gerador-atas/gerar",
            json=ata,
            headers=headers,
            timeout=60
        )
        
        # Verificar resposta
        if response.status_code != 200:
            print(f"❌ Erro HTTP: {response.status_code}")
            print(response.text)
            return None
        
        result = response.json()
        
        if not result.get('success'):
            print(f"❌ Erro: {result.get('error')}")
            return None
        
        # Sucesso
        print(f"✅ Ata gerada com sucesso!")
        print(f"📁 Caminho: {result['output_path']}")
        print(f"📦 Tamanho: {result.get('size_bytes', 'N/A')} bytes")
        print(f"📄 Arquivos: {', '.join(result.get('files_generated', []))}")
        
        return result['output_path']
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Erro de conexão: {e}")
        return None

if __name__ == "__main__":
    gerar_ata_exemplo()
```

---

## ✂️ Separador PDF

### Separar Relatório de Férias

**cURL:**

```bash
curl -X POST http://localhost:8001/api/separador-pdf-relatorio-de-ferias/processar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "input_pdf_path": "/data/uploads/separador-pdf/relatorio_ferias.pdf",
    "competencia": "2025-02"
  }'
```

**Python:**

```python
import requests

def separar_pdf_ferias(pdf_path, competencia):
    token = "seu_token_aqui"
    
    payload = {
        "input_pdf_path": pdf_path,
        "competencia": competencia
    }
    
    Headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    response = requests.post(
        "http://localhost:8001/api/separador-pdf-relatorio-de-ferias/processar",
        json=payload,
        headers=Headers
    )
    
    result = response.json()
    if result.get('success'):
        print(f"✅ {result['funcionarios_separados']} funcionários separados")
    else:
        print(f"❌ {result.get('error')}")

# Usar
separar_pdf_ferias("/data/uploads/relatorio.pdf", "2025-02")
```

---

## 🗜️ Compressor PDF

**JavaScript (Browser):**

```javascript
async function comprimirPDF(filePath, compressionLevel = 'media') {
    const token = localStorage.getItem('auth_token');
    
    try {
        const response = await fetch(
            'http://localhost:8001/api/compressor-pdf/processar',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    input_pdf_path: filePath,
                    compression_level: compressionLevel
                })
            }
        );
        
        const result = await response.json();
        
        if (result.success) {
            // Criar link de download
            const a = document.createElement('a');
            a.href = `/download/${result.output_path}`;
            a.download = result.output_filename;
            a.click();
        } else {
            alert(`Erro: ${result.error}`);
        }
        
    } catch (error) {
        alert(`Erro: ${error}`);
    }
}

// Usar
document.getElementById('compress-btn').addEventListener('click', () => {
    comprimirPDF('/data/uploads/grande.pdf', 'media');
});
```

---

## 🔴 Tratamento de Erros

### Padrão de Resposta de Erro

```json
{
  "success": false,
  "error": "Arquivo PDF corrompido ou inválido",
  "detail": "PDF header inválido",
  "error_code": "INVALID_PDF_FORMAT",
  "timestamp": "2025-02-06T14:30:45Z"
}
```

### Tratamento em Python

```python
import requests

def processar_com_retry(url, payload, max_retries=3):
    """Processa com retry automático"""
    
    token = "seu_token"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    for attempt in range(max_retries):
        try:
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=60
            )
            
            result = response.json()
            
            if result.get('success'):
                return result
            
            # Erro de negócio
            error = result.get('error', 'Erro desconhecido')
            error_code = result.get('error_code', '')
            
            # Alguns erros são retentáveis
            if error_code in ['TIMEOUT', 'SERVICE_UNAVAILABLE']:
                if attempt < max_retries - 1:
                    print(f"⚠️ Tentativa {attempt + 1} falhou, retentando...")
                    continue
            
            # Erro não retentável
            raise ValueError(f"{error_code}: {error}")
            
        except requests.exceptions.Timeout:
            if attempt < max_retries - 1:
                print(f"⏱️ Timeout - tentativa {attempt + 1} / {max_retries}")
                continue
            raise
        
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                print(f"🔄 Erro de conexão - tentativa {attempt + 1} / {max_retries}")
                continue
            raise
    
    raise RuntimeError("Máximo de tentativas atingido")

# Usar
try:
    result = processar_com_retry(
        'http://localhost:8001/api/compressor-pdf/processar',
        {
            'input_pdf_path': '/data/uploads/grande.pdf',
            'compression_level': 'media'
        }
    )
    print(f"✅ Sucesso: {result['output_path']}")
except Exception as e:
    print(f"❌ Erro final: {e}")
```

### Tratamento em JavaScript

```javascript
async function fazerRequisicaoSegura(url, options) {
    try {
        const response = await fetch(url, options);
        
        // Verificar status HTTP
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Verificar sucesso da negócio
        if (!data.success) {
            throw new Error(data.error || 'Erro desconhecido');
        }
        
        return data;
        
    } catch (error) {
        console.error('Erro:', error);
        throw error;
    }
}

// Usar
try {
    const result = await fazerRequisicaoSegura(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    console.log('Sucesso:', result);
} catch (error) {
    console.error('Falha:', error.message);
}
```

---

## 🧪 Script de Teste Completo

**test_api.py:**

```python
#!/usr/bin/env python3

import requests
import json
from datetime import date

BASE_URL = "http://localhost:8001"
TOKEN = "seu_token_aqui"

def test_login():
    """Testar login"""
    response = requests.post(
        f"{BASE_URL.replace(':8001', ':3000')}/api/login",
        json={
            "username": "admin",
            "password": "admin"
        }
    )
    print(f"Login: {'✅' if response.status_code == 200 else '❌'}")
    return response.json().get('token')

def test_gerador_atas():
    """Testar gerador de atas"""
    payload = {
        "modelo": "Template Bernadina.xlsm",
        "data_reuniao": date.today().isoformat(),
        "hora_inicio": "14:00",
        "hora_fim": "16:00",
        "local": "Teste",
        "responsavel": "Teste",
        "departamento": "TI",
        "titulo": "Reunião de Teste",
        "presentes": ["pessoa1"],
        "ausentes": [],
        "assuntos": [{"numero": 1, "titulo": "Teste", "discussao": "Teste"}],
        "decisoes": ["Aprovado"],
        "proxima_reuniao": "2025-03-06"
    }
    
    response = requests.post(
        f"{BASE_URL}/api/gerador-atas/gerar",
        json=payload,
        headers={"Authorization": f"Bearer {TOKEN}"}
    )
    print(f"Gerador Atas: {'✅' if response.status_code == 200 else '❌'}")

def main():
    print("=== Testando API Central Utils ===")
    test_login()
    test_gerador_atas()
    print("=== Testes Completos ===")

if __name__ == "__main__":
    main()
```

---

**Última atualização:** Fevereiro 2026
