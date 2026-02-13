# 03 - Guia de Uso

## 🎯 Começar a Usar a Plataforma

### Acesso Inicial

1. **Abrir o navegador:** http://localhost:3000
2. **Página de Login:** Será exibida a tela de autenticação
3. **Inserir credenciais:** Username e password
4. **Autenticação:** Sistema valida com SERPRO (se configurado)

### Fluxo Geral de Uso

```
1. Login (autenticação)
   ↓
2. Ver Painel Principal (home.html)
   ↓
3. Selecionar Ferramenta desejada
   ↓
4. Fazer Upload de arquivo(s)
   ↓
5. Configurar parâmetros (se necessário)
   ↓
6. Clicar em "Processar"
   ↓
7. Monitorar progresso (em tempo real com Socket.io)
   ↓
8. Baixar resultado
```

### Resposta de acesso negado (RBAC)

Se o usuário estiver autenticado, mas sem permissão para a ferramenta, o portal retorna **HTTP 403** e exibe a página visual **Acesso negado**.

Valide:
- Permissão `tool:<slug>` ou `tool:*`
- Perfil `ADMIN` para `/admin-usuarios` e `/logs`
- `RBAC_STRICT` do ambiente

---

## 🛠️ Como Usar Cada Ferramenta

### 1. Gerador de Atas

**Objetivo:** Gerar automaticamente atas de reunião em Word/PDF

**Arquivo HTML:** `public/gerador-atas.html`  
**Lógica JavaScript:** `public/js/gerador-atas.js`  
**Core Python:** `api/gerador_atas_core.py`

**Passo a Passo:**

1. Clique em **"Gerador de Atas"** no menu lateral
2. Selecione um **modelo de ata** (templates em `data/atas_modelos/`)
3. Preencha os campos obrigatórios:
   - Data da reunião
   - Participantes
   - Assuntos discutidos
   - Decisões tomadas
4. Clique em **"Gerar Ata"**
5. A ata será gerada em `.docx` e `.pdf`
6. Baixe o resultado

**Resultado:** Arquivo `.zip` contendo:
- `ata.docx` - Documento Word
- `ata.pdf` - Documento PDF

---

### 2. Separador PDF - Relatório de Férias

**Objetivo:** Dividir um PDF de relatório de férias em páginas individuais

**Arquivo HTML:** `public/separador-pdf-relatorio-de-ferias.html`  
**Lógica JavaScript:** `public/js/separador-pdf-relatorio-de-ferias.js`  
**Core Python:** `api/relatorio_ferias_core.py`

**Passo a Passo:**

1. Clique em **"Separador - Relatório de Férias"**
2. Faça upload do **PDF com múltiplas páginas**
3. Especifique a **competência (mês/ano)** (ex: 2025-02)
4. Clique em **"Processar"**
5. Sistema dividirá o PDF em folhas individuais
6. Baixe o `.zip` com todos os PDFs

**Resultado:** Arquivo `.zip` com:
- `funcionario_001.pdf`
- `funcionario_002.pdf`
- etc...

---

### 3. Separador - Holerites por Empresa

**Objetivo:** Extrair holerites de um PDF consolidado e separar por empresa

**Arquivo HTML:** `public/separador-holerites-por-empresa.html`  
**Lógica JavaScript:** `public/js/separador-holerites-por-empresa.js`  
**Core Python:** `api/holerites_core.py`

**Passo a Passo:**

1. Clique em **"Separador - Holerites"**
2. Faça upload do **PDF com holerites consolidados**
3. Especifique a **competência**
4. Clique em **"Separar"**
5. Sistema detectará empresas e criará pasta para cada

**Resultado:** Estrutura de pastas:
```
empresas_holerites/
├── EMPRESA_A/
│   ├── holerite_001.pdf
│   └── holerite_002.pdf
└── EMPRESA_B/
    └── holerite_003.pdf
```

---

### 4. Separador - Férias por Funcionário

**Objetivo:** Organizar dados de férias por funcionário

**Arquivo HTML:** `public/separador-ferias-funcionario.html`  
**Lógica JavaScript:** `public/js/separador-ferias-funcionario.js`  
**Core Python:** `api/separador_ferias_funcionario_core.py`

**Uso:**
1. Upload de arquivo com dados de férias (Excel ou CSV)
2. Sistema organiza por funcionário
3. Gera relatório estruturado

---

### 5. Separador CSV - Baixa Automática

**Objetivo:** Processar planilhas de baixa automática de cheques

**Arquivo HTML:** `public/separador-csv-baixa-automatica.html`  
**Lógica JavaScript:** `public/js/separador-csv-baixa-automatica.js`  
**Core Python:** `api/separador_csv_baixa_automatica_core.py`

**Passo a Passo:**

1. Clique em **"Separador CSV - Baixa Automática"**
2. Faça upload do **CSV com dados de cheques**
3. Selecione **delimitador** (vírgula, ponto-vírgula, etc)
4. Clique em **"Processar"**
5. Sistema separa por lote/empresa
6. Baixe resultado estruturado

---

### 6. Excel para PDF em Abas

**Objetivo:** Converter Excel em PDF estruturado com abas/seções

**Arquivo HTML:** `public/excel-abas-pdf.html`  
**Lógica JavaScript:** `public/js/excel-abas-pdf.js`  
**Core Python:** `api/excel_abas_pdf_core.py`

**Uso:**
1. Upload de **arquivo Excel (.xlsx)**
2. Sistema detecta abas automaticamente
3. Converte para PDF com bookmarks
4. Cada aba vira uma seção no PDF

**Resultado:** `arquivo_convertido.pdf` com índice e bookmarks

---

### 7. Compressor de PDF

**Objetivo:** Reduzir tamanho de arquivos PDF

**Arquivo HTML:** `public/comprimir-pdf.html`  
**Lógica JavaScript:** `public/js/comprimir-pdf.js`  
**Core Python:** `api/comprimir_pdf_core.py`

**Passo a Passo:**

1. Clique em **"Compressor de PDF"**
2. Faça upload do **PDF grande**
3. Selecione **nível de compressão:**
   - Baixa - Melhor qualidade
   - Média - Balanço
   - Alta - Menor tamanho
4. Clique em **"Comprimir"**
5. Baixe PDF comprimido

**Uso Típico:** PDFs de 50MB → 5-10MB

---

### 8. Extrator ZIP/RAR

**Objetivo:** Extrair arquivos compactados

**Arquivo HTML:** `public/extrator-zip-rar.html`  
**Lógica JavaScript:** `public/js/extrator-zip-rar.js`  
**Core Python:** `api/extrator_zip_rar_core.py`

**Uso:**
1. Upload de **.zip** ou **.rar**
2. Sistema extrai automaticamente
3. Resultado em pasta estruturada
4. Baixe conteúdo extraído

---

### 9. Importador de Recebimentos MADRE SCP

**Objetivo:** Importar dados de recebimentos do sistema MADRE

**Arquivo HTML:** `public/importador-recebimentos-madre-scp.html`  
**Lógica JavaScript:** `public/js/importador-recebimentos-madre-scp.js`  
**Core Python:** `api/importador_recebimentos_madre_scp_core.py`

**Pré-requisitos:**
- Acesso ao sistema MADRE
- Credenciais configuradas no `.env`

**Uso:**
1. Clique em **"Importador MADRE SCP"**
2. Selecione **período de importação**
3. Selecione **filtros** (empresa, tipo, etc)
4. Clique em **"Importar"**
5. Sistema integra dados com MADRE
6. Resultado salvo no banco de dados

---

### 10. Ajuste Diário GFBR

**Objetivo:** Realizar ajustes contábeis automáticos (GFBR - GFP)

**Arquivo HTML:** `public/ajuste-diario-gfbr.html`  
**Lógica JavaScript:** `public/js/ajuste-diario-gfbr.js`  
**Core Python:** `api/ajuste_diario_gfbr_core.py`

**Uso:**
1. Clique em **"Ajuste Diário GFBR"**
2. Especifique **data de ajuste**
3. Selecione **contas** (se necessário filtrar)
4. Clique em **"Gerar Ajuste"**
5. Sistema cria lançamentos contábeis
6. Resultado pode ser exportado para contabilidade

---

## 📊 Monitoramento de Processamento

### Status em Tempo Real

Durante o processamento, você verá:

```
┌─────────────────────────────────┐
│  Processando...  [████████░░░░]  │
│  65% - Etapa 2 de 3             │
│                                 │
│  ⏱️ Tempo decorrido: 1:23       │
│  ⚡ Velocidade: 2.5 MB/s       │
└─────────────────────────────────┘
```

Eventos em tempo real via **Socket.io**:
- `job:started` - Processamento iniciado
- `job:progress` - Atualização de progresso
- `job:completed` - Processamento concluído
- `job:error` - Erro encontrado

### Logs de Processamento

Veja detalhes em **"Logs"** no menu:

```
[2025-02-06 14:30:12] INFO  - Processamento iniciado
[2025-02-06 14:30:15] DEBUG - Arquivo validado
[2025-02-06 14:30:18] DEBUG - PDF processado (145 KB)
[2025-02-06 14:30:22] INFO  - Processamento concluído
[2025-02-06 14:30:23] INFO  - Arquivo salvo em: /data/outputs/
```

---

## 👥 Gerenciamento de Usuários (Admin)

**Acesso:** Admin Only

### Criar Novo Usuário

1. Vá em **"Administração"** → **"Usuários"**
2. Clique em **"Novo Usuário"**
3. Preencha dados:
   - Usuário (login)
   - Senha (será gerado hash com bcryptjs)
   - Nome Completo
   - Email
   - Permissões
4. Clique em **"Salvar"**

### Alterar Permissões

1. Busque usuário na lista
2. Clique em **"Editar"**
3. Selecione ferramentas que pode usar
4. Salve

```
Permissões disponíveis:
[ ] Gerador de Atas
[ ] Separador PDF - Férias
[ ] Separador Holerites
[ ] Compressor PDF
[ ] Extrator ZIP/RAR
[ ] Admin (todos acessos)
```

---

## 📥 Upload de Arquivos

### Tipos Aceitos

| Ferramenta | Tipos |
|-----------|-------|
| Separador PDF | `.pdf` |
| Separador Excel | `.xlsx`, `.xls` |
| Separador CSV | `.csv` |
| Extrator | `.zip`, `.rar` |
| Gerador Atas | Formulário (sem upload) |

### Limite de Tamanho

- **Padrão:** 100 MB por arquivo
- **Configurável em:** `.env` → `MAX_FILE_SIZE`

### Como Fazer Upload

1. Clique em **"Escolher Arquivo"**
2. Selecione arquivo do seu PC
3. Clique em **"Abrir"**
4. Arquivo aparecerá na lista
5. Clique em **"Processar"**

---

## 💾 Baixar Resultados

### Onde Encontrar

Resultados são salvos em:

```
data/
├── outputs/           ← Resultados gerais
├── atas_geradas/      ← Atas geradas
├── excel-abas-pdf/    ← Excel→PDF
├── extrator-zip-rar/  ← Arquivos extraídos
└── ...
```

### Baixar via Interface

1. Clique em **"Meus Resultados"** ou após conclusão
2. Localize arquivo desejado
3. Clique em **"Baixar"** ou ícone de download

### Baixar via API (Command Line)

```bash
# Exemplo: descobrir ID do job
curl http://localhost:3000/api/jobs \
  -H "Authorization: Bearer seu_token"

# Baixar resultado específico
curl http://localhost:3000/api/download/job_id_123 \
  -H "Authorization: Bearer seu_token" \
  -o resultado.zip
```

---

## ⚙️ Configurações de Usuário

Acesse em **"Perfil"** no canto superior direito:

```
Meu Perfil
├── Dados Pessoais
│   ├── Nome
│   ├── Email
│   └── Organização
├── Segurança
│   ├── Alterar Senha
│   └── Sessões Ativas
├── Notificações
│   ├── Email ao completar
│   ├── Som de alerta
│   └── Histórico
└── Sair
```

---

## 🔐 Resetar Senha

Se esquecer a senha:

1. Clique em **"Esqueci a Senha"** na tela de login
2. Insira seu **email**
3. Verifique **email** (link válido por 1 hora)
4. Clique no link
5. Crie nova senha
6. Faça login com nova senha

---

## 🔍 Troubleshooting de Uso

### "Arquivo recusado - tipo não permitido"

**Causa:** Extensão de arquivo não suportada  
**Solução:** Use o formato correto (PDF, XLSX, CSV, ZIP, etc)

### "Arquivo muito grande"

**Causa:** Arquivo exceeds limit (100 MB padrão)  
**Solução:** Comprima arquivo ou divida em partes

### "Processamento demorado"

**Causa:** Arquivo grande ou servidor sobrecarregado  
**Solução:** Aguarde. Veja tempo estimado em "Logs"

### "Erro ao processar"

**Causa:** Diversas (arquivo corrompido, permissões, etc)  
**Solução:**
1. Verifique logs em **"Logs"**
2. Tente arquivo menor primeiro
3. Crie issue com detalhes

### "Resultado não aparece"

**Causa:** Arquivo não findado ou permissões  
**Solução:**
1. Verifique pasta `data/outputs/`
2. Limpe cache do navegador (Ctrl+Shift+Del)
3. Reinicie aplicação

---

## 📱 Acessar de Dispositivos Diferentes

```bash
# De outro computador na mesma rede:
http://IP_DO_SERVIDOR:3000

# Exemplo:
http://192.168.1.100:3000
```

Verifique seu IP:

```bash
# Windows
ipconfig

# Linux
ifconfig

# macOS
ifconfig | grep inet
```

---

## 📚 Próximas Seções

- [Documentação de Ferramentas](./tools/index.md) - Detalhes de cada ferramenta
- [Documentação Frontend](../frontend/) - Estrutura HTML/JS
- [Deployment](../deployment/) - Deploy em produção

---

**Última atualização:** Fevereiro 2026
