# Runbook — Excel para PDF (Abas Separadas)

## Sintomas

- ❌ "Fatal: Excel não abriu" ou processo Excel.exe travado
- ❌ "COM object connection failed" ou DCOM erro
- ❌ PDF não gerado, arquivo vazio
- ❌ "Permission denied: arquivo Excel aberto em outro processo"
- ❌ PDF com formatação quebrada (páginas em branco, texto cortado)
- ❌ Erro: "PrintArea inválida A1:I32"
- ❌ **Windows-only:** Erro em Linux/Docker

## Checagens rápidas

```bash
# 1. Logs
tail -50 /var/log/central-utils/excel_abas_pdf.log | grep -i "error\|com"

# 2. Verificar input Excel
ls -lh /data/excel-abas-pdf/uploads/ | tail -3
file /data/excel-abas-pdf/uploads/*.xlsx

# 3. Output PDFs gerados?
ls -lh /data/excel-abas-pdf/outputs/ | tail -10

# 4. Excel process check (Windows)
tasklist | grep -i "excel"
wmic process list | grep -i "excel"

# 5. DCOM availability (Windows)
dcomcnfg  # Verificar aplicação habilitada

# 6. Testar PDF validity
pdfinfo /data/excel-abas-pdf/outputs/*.pdf | head -5
```

## Causas comuns

1. **Excel application não disponível (Windows-only):** Office não instalado ou versão < 2010
   - Solução: Instalar Microsoft Office 2010+, verificar versão com `excel.exe /?`

2. **DCOM / COM object connection issue:** Acesso remoto desabilitado (RPC timeout)
   - Solução: Habilitar DCOM em Windows Firewall, reiniciar serviço `dcomcnfg.exe`

3. **Arquivo Excel aberto em outro processo:** Lock file `.~lock.xlsx#`
   - Solução: Fechar all Excel instances, deletar lock files, resubmeter

4. **PrintArea inválida:** Não encontrou range A1:I32 na worksheet
   - Solução: Validar worksheet tem dados até coluna I e linha 32, ajustar range

5. **Worksheet vazia:** Tab não tem dados, mas printarea definido
   - Solução: Validar cada worksheet do Excel tem conteúdo ou ignorar abas vazias

6. **Memory/timeout:** Arquivo Excel muito grande (>50 MB)
   - Solução: Split em múltiplos arquivos menores, aumentar timeout

## Passo a passo para resolver

### Cenário 1: COM object connection failed (Windows)

```bash
# 1. Verificar se Office instalado
"C:\Program Files\Microsoft Office\Office16\excel.exe" /?

# 2. Se não instalado, instalar
# Usar Windows Installer ou Office 365 online

# 3. Verificar DCOM habilitado
dcomcnfg
# Navigate: My Computer > COM Security > Access Permissions
# Ensure "INTERACTIVE" tem permissão

# 4. Reiniciar DCOM service
net stop dcomlaunch
net start dcomlaunch

# 5. Testar COM via PowerShell
powershell << 'EOF'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.Quit()
Write-Host "COM OK"
EOF

# 6. Resubmeter request
curl -X POST http://localhost:8001/api/excel-abas-pdf/exportar \
  -H "Content-Type: application/json" \
  -d '{"arquivo_excel": "input.xlsx"}'
```

### Cenário 2: Arquivo Excel aberto/travado

```bash
# 1. Matar todos Excel processes
taskkill /IM excel.exe /F

# 2. Deletar lock files
rmdir /s /q C:\Users\<user>\AppData\Local\Microsoft\Office\UnsavedFiles
rm -f /data/excel-abas-pdf/uploads/.~lock*

# 3. Aguardar 5 seg

# 4. Resubmeter
curl -X POST http://localhost:8001/api/excel-abas-pdf/exportar \
  -H "Content-Type: application/json" \
  -d '{"arquivo_excel": "input.xlsx", "force_release": true}'
```

### Cenário 3: PrintArea inválida A1:I32

```bash
# 1. Validar worksheet tem dados até I32
python3 << 'EOF'
from openpyxl import load_workbook
wb = load_workbook('/data/excel-abas-pdf/uploads/input.xlsx')
for sheet in wb.sheetnames:
    ws = wb[sheet]
    print(f"Sheet '{sheet}': max_row={ws.max_row}, max_col={ws.max_column}")
    # Se max_col < 9 (I=9) ou max_row < 32, PrintArea falha
EOF

# 2. Se necessário, expandir dados ou ajustar print area
# Opção A: Add dummy data até I32
python3 << 'EOF'
from openpyxl import load_workbook
wb = load_workbook('/data/excel-abas-pdf/uploads/input.xlsx')
ws = wb.active
# Force range ate I32
for row in range(1, 33):
    for col in range(1, 10):  # A-I
        if ws.cell(row, col).value is None:
            ws.cell(row, col).value = " "
wb.save('/tmp/input_fixed.xlsx')
EOF

# 3. Resubmeter com arquivo corrigido
curl -X POST http://localhost:8001/api/excel-abas-pdf/exportar \
  -H "Content-Type: application/json" \
  -d '{"arquivo_excel": "input_fixed.xlsx"}'
```

### Cenário 4: Linux/Docker não suportado

```bash
# Este tool é Windows-only (depende de win32com + Excel COM)

# Opção: Se em container, detectar SO
python3 << 'EOF'
import platform
print(platform.system())  # Windows, Linux, Darwin
EOF

# Se Linux: usar alternativa
# - LibreOffice: libreoffice --headless --convert-to pdf input.xlsx
# - Python: openpyxl + xlsxwriter (sem formatting)

# Para agora, migrar para Windows VM/container
docker pull windows/servercore:ltsc2022  # COM enabled
```

## Reprocesso/recuperação

_Idempotente se usar mesmo arquivo._

```bash
# 1. Remover PDFs antigos
rm -f /data/excel-abas-pdf/outputs/*.pdf

# 2. Fechar Excel procs
taskkill /IM excel.exe /F

# 3. Resubmeter
curl -X POST http://localhost:8001/api/excel-abas-pdf/exportar \
  -H "Content-Type: application/json" \
  -d '{"arquivo_excel": "input.xlsx"}'

# 4. Aguardar 30-60 seg

# 5. Validar PDFs
ls -lh /data/excel-abas-pdf/outputs/
```

## Rollback

_Sem efeitos BD._

```bash
# 1. Remover PDFs incorretos
rm -f /data/excel-abas-pdf/outputs/*.pdf

# 2. Revert código se necessário
git checkout /api/excel_abas_pdf_core.py

# 3. Limpar temp Excel files
rmdir /s /q %TEMP%\*.tmp
```

## Contatos

- **Owner:** Squad Windows/BI
- **Slack:** #squad-bi ou #plataforma
- **On-call:** Verificar PagerDuty (Windows SRE)
- **Nota:** Windows-only tool - escalação para DevOps Windows se deploy Linux

---

**Última atualização:** Fevereiro 2026 | **Versão runbook:** 1.0  
**⚠️ AVISO:** Este tool requer Windows + Microsoft Excel 2010+
