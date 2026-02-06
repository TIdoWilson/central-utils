# Runbook — Separador de Holerites

## Sintomas

- ❌ "Company não detectado da primeira linha"
- ❌ Files em pasta raiz em vez de por empresa
- ❌ "pdfplumber não extraiu texto"
- ❌ ZIP não criado
- ❌ Páginas faltando ou duplicadas

## Checagens rápidas

```bash
# 1. Logs
tail -50 /var/log/central-utils/separador_holerites.log

# 2. Input check
ls -lh /data/separador-holerites-por-empresa/uploads/

# 3. Output estrutura
find /data/separador-holerites-por-empresa/outputs/ -type d | head -10

# 4. Testar extract primeira linha
python3 << 'EOF'
import pdfplumber
pdf = pdfplumber.open('/data/separador-holerites-por-empresa/uploads/input.pdf')
page = pdf.pages[0]
text = page.extract_text()
print("Primeira linha:")
print(text.split('\n')[0])
EOF

# 5. Verificar ZIP
ls -lh /data/separador-holerites-por-empresa/*.zip
```

## Causas comuns

1. **pdfplumber não conseguiu extrair primeira linha:** PDF com imagem ou OCR needed
   - Solução: Usar tesseract OCR ou regenerar PDF em texto

2. **Company não identificado:** Primeira linha não tem pattern esperado
   - Solução: Usar `simplify_name()` função, verificar regex pattern

3. **ZIP vazio:** Output folder sem files
   - Solução: Validar write access, disk space, debug flag

4. **Memory issue:** PDF > 300 páginas
   - Solução: Processar em chunks, aumentar container RAM

## Passo a passo para resolver

### Cenário 1: Primeira linha não extraída

```bash
# 1. Testar extract com pdfplumber
python3 << 'EOF'
import pdfplumber
with pdfplumber.open('/data/separador-holerites-por-empresa/uploads/input.pdf') as pdf:
    if len(pdf.pages) > 0:
        text = pdf.pages[0].extract_text()
        print("Extraído:")
        print(text[:200])
    else:
        print("PDF vazio")
EOF

# 2. Se vazio, tentar OCR
tesseract /data/separador-holerites-por-empresa/uploads/input.pdf /tmp/ocr
head -5 /tmp/ocr.txt

# 3. Se falhar, usar alternativa (PDFBox)
pdftotext -layout /data/separador-holerites-por-empresa/uploads/input.pdf /tmp/text.txt
head -5 /tmp/text.txt

# 4. Resubmeter
```

### Cenário 2: Company não identificado (todos em raiz)

```bash
# 1. Verificar output
ls -la /data/separador-holerites-por-empresa/outputs/

# 2. Debugar simplify_name()
python3 << 'EOF'
from api.holerites_core import simplify_name
names = ["EMPRESA XYZ LTDA", "empresa abc", "ABC Corporation"]
for name in names:
    print(f"{name} -> {simplify_name(name)}")
EOF

# 3. Se simplify_name falhar, editar função em core
nano /api/holerites_core.py
# Adicionar mais patterns se necessário

# 4. Resubmeter
```

## Reprocesso/recuperação

```bash
# 1. Limpar output
rm -rf /data/separador-holerites-por-empresa/outputs/*/
rm -f /data/separador-holerites-por-empresa/*.zip

# 2. Resubmeter
curl -X POST http://localhost:8001/api/separador-holerites/processar \
  -d '{"arquivo": "input.pdf"}'
```

## Rollback

```bash
# 1. Remover outputs
rm -rf /data/separador-holerites-por-empresa/outputs/
```

## Contatos

- **Owner:** Squad Payroll/RH
- **Slack:** #squad-rh
- **Escalação:** JIRA central-utils

---

**Última atualização:** Fevereiro 2026 | **Versão runbook:** 1.0
