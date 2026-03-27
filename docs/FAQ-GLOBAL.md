# FAQ Global — Central Utils (Todas as Ferramentas)

> **Versão:** 2026-03 | **Último Update:** Março 2026 | **Cobertura:** 10+ ferramentas | **Total Categorias:** 12

---

## 📋 Índice Rápido

1. [Problemas de Autenticação & Integrações](#autenticação--integrações)
2. [Problemas com Arquivos (PDF, Excel, CSV)](#problemas-com-arquivos)
3. [Problemas de Formatação & Encoding](#problemas-de-formatação--encoding)
4. [Problemas de Performance & Memory](#problemas-de-performance--memory)
5. [Problemas de Permissões & Segurança](#problemas-de-permissões--segurança)
6. [Problemas de Validação & Dados](#problemas-de-validação--dados)
7. [Problemas COM (Windows)](#problemas-com-windows)
8. [Problemas de Arquivos Comprimidos](#problemas-de-arquivos-comprimidos)
9. [Problemas de Banco de Dados](#problemas-de-banco-de-dados)
10. [Problemas de Conversão & Output](#problemas-de-conversão--output)
11. [Troubleshooting Geral](#troubleshooting-geral)
12. [Escalação & Contatos](#escalação--contatos)

---

## 🔐 Autenticação & Integrações

### P: Erro "Autenticação MADRE falhou" ou "Token inválido"

**Ferramentas afetadas:** Importador de Recebimentos MADRE SCP

**Causas:**
- Token expirado (validade ~24h)
- Credenciais incorretas (USER/PASS)
- API MADRE indisponível

**Soluções:**
```bash
# 1. Regenerar token MADRE
madre-cli auth generate --user=$MADRE_USER --pass=<senha>

# 2. Atualizar env var
export MADRE_API_KEY="novo_token"

# 3. Testar conectividade
curl -X GET "$MADRE_API_URL/health" \
  -H "Authorization: Bearer $MADRE_API_KEY" \
  -H "User: $MADRE_USER"

# 4. Se erro 503, verificar status MADRE
# https://status.madre-scp.com/
```

### P: "DCOM / COM object connection failed"

**Ferramentas afetadas:** Excel para PDF (Windows-only)

**Causas:**
- DCOM desabilitado em Windows Firewall
- Excel não instalado ou versão < 2010
- RPC timeout

**Soluções:**
```bash
# Windows: Habilitar DCOM
dcomcnfg
# My Computer > COM Security > Access Permissions > Edit
# Adicionar "INTERACTIVE" com permissão

# Reiniciar DCOM service
net stop dcomlaunch
net start dcomlaunch

# Testar
powershell << 'EOF'
$excel = New-Object -ComObject Excel.Application
$excel.Quit()
"OK"
EOF
```

---

## 📄 Problemas com Arquivos

### P: "Arquivo não encontrado" ou "Permission denied"

**Ferramentas afetadas:** Todas (PDF, Excel, CSV, ZIP, etc.)

**Causas:**
- Caminho incorreto ou relativo
- Permissões inadequadas (read/write)
- Arquivo deletado/movido

**Soluções:**
```bash
# 1. Validar arquivo existe
ls -la /caminho/completo/arquivo.pdf

# 2. Verificar permissões
chmod 644 /caminho/arquivo  # read acesso
chmod 755 /caminho/pasta/   # write acesso

# 3. Se em container, mount correto?
docker inspect <container> | grep Mounts

# 4. Path necessário ser ABSOLUTO (não relativo)
# x /data/ferias-funcionario/  ✓ CORRETO
# x uploads/                    ✗ ERRADO
```

### P: "Arquivo corrompido" ou "CRC error" (ZIP/RAR)

**Ferramentas afetadas:** Extrator ZIP/RAR, Separador de Férias

**Causas:**
- Download incompleto
- Corrupção em trânsito
- Arquivo já danificado na origem

**Soluções:**
```bash
# 1. Testar integridade
unzip -t arquivo.zip
# ou
urar t arquivo.rar

# 2. Redownload original
wget https://url/arquivo.zip -O /tmp/novo_arquivo.zip

# 3. Validar checksum se disponível
sha256sum arquivo.zip
# verificar vs. hash publicado

# 4. Se persistir, solicitar reenvio
```

### P: "PDF não gerado" ou "Arquivo vazio"

**Ferramentas afetadas:** Gerador de Atas, Excel para PDF, Compressor PDF

**Causas:**
- Permissões de escrita
- Disk space insuficiente
- Process timeout/crash
- Template danificado

**Soluções:**
```bash
# 1. Verificar disk space
df -h /data/

# 2. Validar permissões output folder
chmod 755 /data/atas_geradas/
touch /data/atas_geradas/test.txt && rm $_

# 3. Aumentar timeout
curl -X POST http://localhost:8001/api/.../processar \
  -d '{"timeout_segundos": 120}'

# 4. Checar logs
tail -50 /var/log/central-utils/*.log | grep -i "error\|exception"

# 5. Se template danificado, restaurar backup
cp /backup/templates/template.docx /data/atas_modelos/
```

---

## 🔤 Problemas de Formatação & Encoding

### P: Números com ponto em vez de vírgula (ou vice-versa)

**Ferramentas afetadas:** Separador CSV Baixa, Ajuste GFBR

**Causas:**
- Locale incorreto (pt_BR vs. en_US)
- Excel formato regional diferente
- Encoding UTF-8 vs. Latin-1

**Soluções:**
```bash
# 1. Configurar locale
export LC_NUMERIC="pt_BR.UTF-8"
export LANG="pt_BR.UTF-8"

# 2. No Excel, definir formato:
# Format Cells > Number > Category: Accounting
# Decimal places: 2, Decimal separator: ","

# 3. Validar CSV encoding
file -b --mime-encoding arquivo.csv
# Esperado: UTF-8 ou ISO-8859-1 + BOM

# 4. Reencoding se necessário
iconv -f ISO-8859-1 -t UTF-8 arquivo.csv > arquivo_utf8.csv

# 5. Resubmeter com locale correto
```

### P: Caracteres especiais errados (ç, ã, é, etc.)

**Ferramentas afetadas:** PDF parsing (pdfplumber), BDs

**Causas:**
- Encoding PDF não UTF-8
- Terminal/Python encoding incorreto
- BD collation incompatível

**Soluções:**
```bash
# 1. Forçar Python UTF-8
export PYTHONIOENCODING=UTF-8

# 2. Verificar encoding PDF
pdftotext -enc UTF-8 arquivo.pdf /tmp/out.txt

# 3. BD PostgreSQL
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SET CLIENT_ENCODING TO 'UTF8'; SELECT * FROM tabela;"

# 4. Testar parsing
python3 << 'EOF'
import pdfplumber
with pdfplumber.open('arquivo.pdf') as pdf:
    text = pdf.pages[0].extract_text()
    print(repr(text[:100]))  # Mostrar com encoding visível
EOF
```

### P: Datas aparecendo como número (ex: 45350)

**Ferramentas afetadas:** Separador CSV, Ajuste GFBR

**Causas:**
- Excel armazenado como número serial
- Formato não reconhecido

**Soluções:**
```bash
# Excel: Format Cells como Data
# Format: dd/mm/yyyy

# Python validação
python3 << 'EOF'
from openpyxl import load_workbook
wb = load_workbook('arquivo.xlsx')
ws = wb.active
for row in ws.iter_rows(min_row=1, max_row=5):
    for cell in row:
        if cell.number_format:
            print(f"{cell.value} -> {cell.number_format}")
EOF

# Converter número para data (Excel serial)
from datetime import datetime, timedelta
serial = 45350
excel_epoch = datetime(1900, 1, 1)
real_date = excel_epoch + timedelta(days=serial-2)  # Excel bug 1900
```

---

## ⚡ Problemas de Performance & Memory

### P: "Timeout" ou "Conexão aguardando"

**Ferramentas afetadas:** Todas (especialmente com arquivos grandes)

**Causas:**
- Timeout padrão muito curto (default: 30s)
- Arquivo muito grande
- Servidor lento/overloaded

**Soluções:**
```bash
# 1. Aumentar timeout
curl -X POST http://localhost:8001/api/.../processar \
  -H "Content-Type: application/json" \
  --max-time 300 \  # 5 minutos
  -d '{"timeout_segundos": 180}'

# 2. Verificar recursos servidor
top -b -n1 | grep "PID\|python"
docker stats

# 3. Split arquivo grande
# PDF > 1000 páginas?
pdfsplit arquivo.pdf --pages 500

# 4. Processar em background
curl -X POST http://localhost:8001/api/.../processar \
  -d '{"async": true}'
```

### P: "Memory exhausted" ou "Out of memory"

**Ferramentas afetadas:** Todas (especialmente: PDF grande, ZIP com muitos files)

**Causas:**
- Arquivo muito grande (>500 MB PDF, >100k linhas Excel)
- Memory leak em processamento
- Container RAM insuficiente

**Soluções:**
```bash
# 1. Aumentar container RAM
docker run --memory 2g central-utils

# 2. Split arquivo antes
# PDF > 200 MB: por seções
pdfsplitter --pages 100 grande.pdf -o split_

# 3. Limpar memory entre jobs
docker restart central-utils-api

# 4. Monitorar memory
watch -n 1 'docker stats --no-stream'

# 5. Aumentar heap (se Java/Python)
export JAVA_OPTS="-Xmx2g"
export PYTHONHEAP=2G
```

---

## 🔒 Problemas de Permissões & Segurança

### P: "Permission denied" ao escrever arquivo

**Ferramentas afetadas:** Todas

**Causas:**
- User app não tem write permission em folder
- Arquivo read-only
- Mount em read-only

**Soluções:**
```bash
# Linux
chmod 755 /data/ferias-funcionario/
chown app:app /data/atas_geradas/

# Windows (PowerShell)
icacls "C:\data\uploads" /grant:r "USERS:F"

# Docker mount
# volume: /data:/data:rw  <-- :rw é necessário

# Se arquivo read-only
chmod 644 arquivo.xlsx
```

### P: "Dados sensíveis" expostos em logs/arquivos

**Ferramentas afetadas:** Importador MADRE (dados financeiros), Ajuste GFBR (dados contábeis)

**Causas:**
- Credenciais em plaintext em arquivos
- Debug logs expondo dados
- LGPD não conformidade

**Soluções:**
```bash
# 1. NUNCA commitar secrets
# .gitignore:
*.env
.env.local
credentials.txt

# 2. Usar secrets management
export MADRE_API_KEY=$(vault kv get -field=password secret/madre/api)

# 3. Redactar logs
# NO LOGS: Usuario, Senha, CNPJ, CPF, Valores

# 4. Audit compliance
ls -la /var/log/central-utils/audit_gfbr.log
# Backup: cp /var/log/central-utils/. /backup/audit/

# 5. Criptografia em repouso
# BD: encrypted columns
# Files: gpg encrypt, FIPS-compliant
```

---

## ✓ Problemas de Validação & Dados

### P: "Duplicata detectada" (BDs)

**Ferramentas afetadas:** Importador MADRE, Separador (ZIP)

**Causas:**
- Importação rodou 2x
- Resubmissão do mesmo lote
- Constraint BD única violado

**Soluções:**
```bash
# 1. Verificar registros duplicados
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'EOF'
SELECT data_recebimento, COUNT(*) FROM recebimentos_madre 
GROUP BY data_recebimento HAVING COUNT(*) > 1;
EOF

# 2. Se OK deletar (após backup)
DELETE FROM recebimentos_madre 
WHERE created_at > NOW() - INTERVAL 1 hour;

# 3. Usar flag prevent duplicates
curl -X POST http://localhost:8001/api/importador-recebimentos-madre-scp/processar \
  -d '{"check_duplicates": true, "skip_if_exists": true}'

# 4. Resubmeter
```

---

## 🪟 Problemas COM (Windows)

### P: Excel.exe trava ou não responde

**Ferramentas afetadas:** Excel para PDF (Windows-only)

**Causas:**
- Arquivo Excel corrompido
- Falta de recursos (RAM/CPU)
- Lock file antigo

**Soluções:**
```bash
# 1. Matar Excel process
taskkill /IM excel.exe /F

# 2. Remover lock files
rmdir /s /q C:\Users\<user>\AppData\Local\Microsoft\Office\UnsavedFiles

# 3. Testar arquivo Excel
# Abrir manualmente no Excel, salvar

# 4. Resubmeter com flag
curl -X POST http://localhost:8001/api/excel-abas-pdf/exportar \
  -d '{"arquivo_excel": "input.xlsx", "force_release": true}'
```

### P: "Print Area inválida A1:I32"

**Ferramentas afetadas:** Excel para PDF

**Causas:**
- Worksheet tem menos linhas/colunas que A1:I32
- Range vazio

**Soluções:**
```bash
# 1. Validar worksheet tem dados até I32
python3 << 'EOF'
from openpyxl import load_workbook
wb = load_workbook('input.xlsx')
ws = wb.active
print(f"Rows: {ws.max_row}, Cols: {ws.max_column}")
# Deve ser >= 32 linhas e >= 9 colunas (A-I)

# Se não, add dados/dummy
for r in range(1, 33):
    for c in range(1, 10):
        if ws.cell(r, c).value is None:
            ws.cell(r, c).value = " "
wb.save('input_fixed.xlsx')
EOF

# 2. Testar print preview no Excel
# File > Print Preview > com área A1:I32
```

---

## 📦 Problemas de Arquivos Comprimidos

### P: "ZIP vazio" ou não criado

**Ferramentas afetadas:** Separador de Férias, Separador Holerites, Extrator ZIP/RAR

**Causas:**
- Nenhum arquivo para zipar (separação vazia)
- Folder output sem permissão
- Disk space

**Soluções:**
```bash
# 1. Validar folder existe
mkdir -p /data/ferias-funcionario/outputs/
chmod 755 /data/ferias-funcionario/outputs/

# 2. Validar disk space
df -h /data/ | grep /data

# 3. Checar output tem arquivos
ls -la /data/ferias-funcionario/outputs/ | wc -l

# 4. Se vazio, debug parsing
# Verificar se company foi detectado
grep -E "EMPRESA|Folha de Pagamento" /tmp/pdf_extract.txt

# 5. Resubmeter
```

### P: "Arquivo já existe" ou conflito de nome

**Ferramentas afetadas:** Extrator ZIP/RAR, Separador PDFs

**Causas:**
- Extração anterior não completou
- Múltiplos arquivos mesmo nome

**Soluções:**
```bash
# 1. Remover output antigo
rm -rf /data/extrator-zip-rar/outputs/*

# 2. Usar rename automático (flag)
curl -X POST http://localhost:8001/api/extrator-zip-rar/extrair \
  -d '{"arquivo": "input.zip", "handle_conflicts": true}'

# 3. Ou pré-rename antes
find /data/extrator-zip-rar/outputs/ -type f -name "file.txt" \
  -exec sh -c 'mv "$1" "${1%.*}_old.${1##*.}"' _ {} \;
```

---

## 🗄️ Problemas de Banco de Dados

### P: "Foreign Key error" ou referência inválida

**Ferramentas afetadas:** Importador MADRE, Ajuste GFBR

**Causas:**
- Empresa não existe em tabela
- Centro de custo inválido
- Plano de contas vêio

**Soluções:**
```bash
# 1. Validar empresa existe
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT id FROM empresas WHERE codigo='EMPRESA_A'"

# 2. Se não, criar
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'EOF'
INSERT INTO empresas (codigo, nome) VALUES ('EMPRESA_A', 'Empresa A')
ON CONFLICT (codigo) DO NOTHING;
EOF

# 3. Validar plano GFBR tem conta
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT * FROM plano_gfbr WHERE codigo='11.1.1.1'"

# 4. Se não, importar plano
# psql -f /backup/plano_gfbr_20260101.sql

# 5. Resubmeter
```

### P: "BD indisponível" ou timeout

**Ferramentas afetadas:** Importador MADRE, Ajuste GFBR

**Causas:**
- PostgreSQL down
- Conexão limite atingido
- Rede lentidão

**Soluções:**
```bash
# 1. Verificar BD está UP
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1"
# Se erro, BD está down

# 2. Reiniciar BD
systemctl restart postgresql  # Linux
docker restart postgres-container  # Docker

# 3. Verificar conexões
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'EOF'
SELECT COUNT(*) FROM pg_stat_activity;
-- Se > max_connections, mattar idle
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE state = 'idle' AND query_start < NOW() - INTERVAL 10 minute;
EOF

# 4. Aumentar timeout conexão
export DB_CONNECT_TIMEOUT=30

# 5. Resubmeter
```

---

## 🎯 Problemas de Conversão & Output

### P: "OFX não gerado" ou "Banco não identificado"

**Ferramentas afetadas:** Conversor Extrato PDF para OFX (Evolua, Sicredi, Stone)

**Causas:**
- PDF não corresponde aos padrões suportados
- Banco não reconhecido (detecção falhou)
- Nenhuma transação parseada

**Soluções:**
```bash
# 1. Verificar padrão do PDF (extrair texto)
pdftotext extrato.pdf -
# Procure por:
# - "EVOLUA" + "EXTRATO ESPECIAL"
# - "SICREDI" + "EXTRATO DE CONTA CORRENTE"
# - "STONE" + "EXTRATO DE CONTA"

# 2. Validar Python localmente
python3 << 'EOF'
from api.conversor_extrato_pdf_ofx_core import ler_texto_pdf_bytes, detectar_banco
with open("extrato.pdf", "rb") as f:
    texto = ler_texto_pdf_bytes(f.read())
    print("=== Primeiras 500 chars ===")
    print(texto[:500])
    print("=== Tentando detectar ===")
    try:
        banco = detectar_banco(texto)
        print(f"Banco detectado: {banco}")
    except ValueError as e:
        print(f"Erro detecção: {e}")
EOF

# 3. Se Stone, verificar data e valores
# Stone espera: DD/MM/YY e "R$" nos valores
# Exemplo linha válida:
# 02/07/25 Saída DESCRICAO -R$ 44,20 R$ 0,00 CONTRAPARTE

# 4. Resubmeter com bankid/acctid manualmente
curl -X POST http://localhost:3000/api/conversor-extrato-pdf-ofx/processar \
  -F "files=@extrato.pdf" \
  -F "bankid=0000" \
  -F "acctid=53505159" \
  -H "x-csrf-token: seu_token"
```

### P: "Conversão PDF/DOCX falhou"

**Ferramentas afetadas:** Gerador Atas, Excel para PDF

**Causas:**
- LibreOffice/unoconv não instalado
- Formato incompatível
- Recursos insuficientes

**Soluções:**
```bash
# 1. Verificar LibreOffice
libreoffice --version

# 2. Se não instalado
sudo apt-get install libreoffice ghostscript unoconv

# 3. Testar conversão manual
libreoffice --headless --convert-to pdf input.docx

# 4. Se falhar, usar Ghostscript alternativo
gs -sDEVICE=pdfwrite -o output.pdf input.pdf

# 5. Resubmeter com timeout aumentado
```

### P: PDF com formatação quebrada (fontes, layout)

**Ferramentas afetadas:** Gerador Atas, Compressor PDF, Excel para PDF

**Causas:**
- LibreOffice renderização diferente
- Fontes não disponíveis
- Dpi/zoom incorreto

**Soluções:**
```bash
# 1. Instalar fontes Microsoft
sudo apt-get install fonts-liberation fonts-noto

# 2. Validar DPI
# Teste com DPI 72 vs. 96 vs. 300

# 3. Re-renderizar com quality maior
curl -X POST http://localhost:8001/api/compressor-pdf/comprimir \
  -d '{"dpi_scale": 2.0, "jpeg_quality": 95}'

# 4. Se template DOCX, editar no Word
# Verificar formatação, salvar como .docx puro

# 5. Resubmeter
```

---

## 🔧 Troubleshooting Geral

### P: Como debugar erro genérico?

**Passo a passo universal:**

```bash
# 1. Coletar logs
tail -100 /var/log/central-utils/*.log > /tmp/debug.log

# 2. Coletar request/response
curl -v -X POST http://localhost:8001/api/.../processar \
  -d '...' 2>&1 | tee /tmp/request.log

# 3. Verificar input file
file -b /data/.../input.*
ls -lh /data/.../input.*

# 4. Testar componente isolado (Python)
python3 << 'EOF'
import sys; sys.path.insert(0, '/api')
from separador_ferias_funcionario_core import processar
try:
    result = processar("/data/.../input.pdf")
    print("OK:", result)
except Exception as e:
    print("ERROR:", type(e), str(e))
    import traceback; traceback.print_exc()
EOF

# 5. Validar data/sintaxe
python3 -m py_compile /api/separador_ferias_funcionario_core.py

# 6. Check dependencies
pip list | grep -E "PyPDF2|pdfplumber|openpyxl"
```

### P: Container/serviço recusando conexão

**Causas:** Container down, port incorreto, firewall

**Soluções:**
```bash
# 1. Verificar container up
docker ps | grep central-utils

# 2. Se down, iniciar
docker start central-utils-api

# 3. Verificar logs
docker logs central-utils-api | tail -50

# 4. Port correto?
docker port central-utils-api | grep 8001

# 5. Firewall
sudo ufw allow 8001
```

### P: Mudanças no código não refletem

**Causas:** Cache, container antigo, código não reloaded

**Soluções:**
```bash
# 1. Limpar cache Python
rm -rf /api/__pycache__
find /api -name "*.pyc" -delete

# 2. Reiniciar container
docker restart central-utils-api

# 3. Ou resubmeter verifying código
curl -X POST http://localhost:8001/api/.../version
# Deve mostrar versão atualizada
```

---

## 📞 Escalação & Contatos

### Estrutura de Suporte

| Período | Squadron | Slack | On-Call |
|---------|----------|-------|---------|
| Seg-Sex 8h-17h | Squad Responsável | [link] | PagerDuty |
| Seg-Sex 17h-22h | DevOps SRE | #sre-general | PagerDuty |
| Sab-Dom & Feriados | On-Call Rotation | #emergencias | PagerDuty |

### Contatos por Ferramenta

**Gerador Atas**
- Owner: Squad Jurídico | Slack: #squad-juridico | PagerDuty: …

**Separador Férias & Holerites**
- Owner: Squad RH | Slack: #squad-rh | PagerDuty: …

**Separador CSV Baixa**
- Owner: Squad Financeiro | Slack: #squad-financeiro | PagerDuty: …

**Excel para PDF**
- Owner: Squad Windows/BI | Slack: #squad-bi | PagerDuty: … | **Windows-only, escalação para DevOps Windows**

**Compressor PDF**
- Owner: Squad Infraestrutura | Slack: #squad-infra | PagerDuty: …

**Extrator ZIP/RAR**
- Owner: Squad DevOps | Slack: #squad-devops | PagerDuty: …

**Importador MADRE**
- Owner: Squad Financeiro | MADRE Support: suporte@madre-scp.com | Slack: #madre-integration | PagerDuty: …

**Ajuste GFBR**
- Owner: Squad Controladoria | **CRÍTICO** | Slack: #squad-controladoria | PagerDuty: … | **Requer aprovação contador**

### Como Abrir Ticket de Escalação

1. **Severidade 1 (Critical):** Ajuste GFBR falha, Importador MADRE BD down
   - Slack: @on-call-devops
   - PagerDuty: Trigger immediately

2. **Severidade 2 (High):** Múltiplas ferramentas down, timeout recorrente
   - JIRA: Projeto CENTRAL-UTILS, Label: escalation-high
   - Slack: #central-utils-escalation

3. **Severidade 3 (Medium):** Formatação incorreta, lentidão
   - JIRA: CENTRAL-UTILS, Label: bug-report
   - Slack: #squad-<responsavel>

4. **Severidade 4 (Low):** Questionário, melhoria
   - JIRA: CENTRAL-UTILS, Type: Task/Enhancement
   - Slack: #central-utils-general

---

## 📚 Referências Rápidas

- **Docs principais:** [docs/tools/index.md](./tools/index.md)
- **Runbooks operacionais:** [/docs/runbooks/](../runbooks/)
- **GitHub Issues:** [central-utils/issues](https://github.com/empresa/central-utils/issues)
- **Wikis:** [central-utils Wiki - Troubleshooting](https://wiki.empresa.com/central-utils)

---

**Atualizado:** Fevereiro 2026 | **Revisor:** Squad Infraestrutura | **Próxima revisão:** Maio 2026
