# Runbook — Compressor de PDF

## Sintomas

- ❌ "PyMuPDF (fitz) não instalado" ou versão incompatível
- ❌ "Grayscale conversion falhou"
- ❌ "JPEG quality inválido (1-100)"
- ❌ PDF output corrompido ou páginas em branco
- ❌ "DPI scale fora do range (0.25-2.0)"
- ❌ Timeout processando PDF > 500 MB

## Checagens rápidas

```bash
# 1. Logs
tail -50 /var/log/central-utils/compressor_pdf.log | grep -i "error\|exception"

# 2. Verificar PyMuFDF instalado
python3 -c "import fitz; print(fitz.version)"

# 3. Input PDF
ls -lh /data/pdfa/uploads/ | tail -3
pdfinfo /data/pdfa/uploads/input.pdf | head -10

# 4. Output gerado?
ls -lh /data/pdfa/outputs/ | tail -3

# 5. Comparar tamanhos (validar compressão)
du -h /data/pdfa/uploads/input.pdf /data/pdfa/outputs/output.pdf
```

## Causas comuns

1. **PyMuPDF não instalado:** fitz module não encontrado
   - Solução: `pip install PyMuPDF>=1.23.0`

2. **JPEG quality inválido:** Valor < 1 ou > 100
   - Solução: Usar range 1-100, default 85

3. **DPI scale fora de range:** Parâmetro DPI < 0.25 ou > 2.0
   - Solução: Range adequado 0.5-1.5 (default: 1.0)

4. **Grayscale conversion issue:** PDF tem object stream ou features incompatíveis
   - Solução: Skip grayscale, usar compression_level apenas

5. **Memory leak:** PDF muito grande (>1 GB)
   - Solução: Split PDF antes (pdfsplitter), processar em chunks

6. **Output corrompido:** Rendering falhou, JPEG encoding errado
   - Solução: Validar PDF input com `pdfcheck`, aumentar timeout

## Passo a passo para resolver

### Cenário 1: PyMuFDF não instalado

```bash
# 1. Verificar versão Python
python3 --version

# 2. Instalar PyMuPDF
pip install --upgrade "PyMuPDF>=1.23.0"

# 3. Validar instalação
python3 << 'EOF'
import fitz
print(f"PyMuPDF version: {fitz.version}")
doc = fitz.open()  # Test basic
print("OK")
EOF

# 4. Se falhar, alternativa:
pip install --no-cache-dir PyMuPDF

# 5. Resubmeter request
curl -X POST http://localhost:8001/api/compressor-pdf/comprimir \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo": "input.pdf",
    "jpeg_quality": 85,
    "dpi_scale": 1.0,
    "grayscale": true
  }'
```

### Cenário 2: JPEG quality inválido

```bash
# 1. Validar parâmetro enviado
# Erro: jpeg_quality=150 ou -10

# 2. Usar range correto: 1-100
curl -X POST http://localhost:8001/api/compressor-pdf/comprimir \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo": "input.pdf",
    "jpeg_quality": 85,  # Valid: 1-100, lower=more compression
    "dpi_scale": 1.0
  }'

# 3. Referência de qualidade:
# 95-100: Alta qualidade, sem perda (default: 85)
# 70-90: Boa qualidade, compressão média
# 50-70: Qualidade aceitável, alta compressão
# <50: Baixa qualidade (não recomendado)
```

### Cenário 3: Output corrompido (páginas em branco)

```bash
# 1. Validar input PDF
pdfcheck -f /data/pdfa/uploads/input.pdf
pdfinfo /data/pdfa/uploads/input.pdf

# 2. Se input está OK, aumentar timeout
curl -X POST http://localhost:8001/api/compressor-pdf/comprimir \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo": "input.pdf",
    "timeout_segundos": 120,
    "maxt_threads": 4,
    "grayscale": false  # Desabilitar primeiro
  }'

# 3. Testar: Render manualmente
python3 << 'EOF'
import fitz
doc = fitz.open('/data/pdfa/uploads/input.pdf')
for page_num, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(1, 1))
    print(f"Page {page_num}: {pix.n} pixels")
    if page_num > 5:
        break
EOF

# 4. Se falhar, usar alternativa ghostscript
gs -sDEVICE=pdfwrite -dNOPAUSE -dBATCH -dSAFER \
  -dCompatibilityLevel=1.4 \
  -dQFactor=85 \
  -o /tmp/gs_output.pdf /data/pdfa/uploads/input.pdf

# 5. Usar ghostscript output ou resubmeter com comprimento = false
```

### Cenário 4: Timeout PDF muito grande

```bash
# 1. Verificar tamanho
ls -lh /data/pdfa/uploads/input.pdf

# 2. Se > 500 MB, split antes
pdfsplitter --pages 50 /data/pdfa/uploads/input.pdf -o /tmp/split_

# 3. Processar cada split
for file in /tmp/split_*.pdf; do
  curl -X POST http://localhost:8001/api/compressor-pdf/comprimir \
    -H "Content-Type: application/json" \
    -d "{\"arquivo\": \"$(basename $file)\", \"timeout_segundos\": 120}"
  sleep 10
done

# 4. Concatenar PDFs (opcional)
gs -sDEVICE=pdfwrite -dNOPAUSE -dBATCH \
  -sOutputFile=/data/pdfa/outputs/concatenado.pdf \
  /tmp/split_*.pdf
```

## Reprocesso/recuperação

_Idempotente se usar mesmo arquivo input._

```bash
# 1. Remover PDF incorreto
rm -f /data/pdfa/outputs/*.pdf

# 2. Resubmeter com mesmo parâmetros
curl -X POST http://localhost:8001/api/compressor-pdf/comprimir \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo": "input.pdf",
    "jpeg_quality": 85,
    "dpi_scale": 1.0,
    "grayscale": true
  }'

# 3. Aguardar processamento (30-120 seg)

# 4. Validar output
pdfinfo /data/pdfa/outputs/output.pdf
ls -lh /data/pdfa/outputs/output.pdf
```

## Rollback

```bash
# 1. Restaurar PDF original
cp /backup/pdfs/input.pdf /data/pdfa/outputs/input_backup.pdf

# 2. Limpar temp
rm -f /tmp/split_* /tmp/gs_output.pdf
```

## Contatos

- **Owner:** Squad Infraestrutura/PDF
- **Slack:** #squad-infra
- **On-call:** Verificar PagerDuty (Python/PDF SRE)
- **Bug report:** GitHub issues, tag: compressor-pdf

---

**Última atualização:** Fevereiro 2026 | **Versão runbook:** 1.0
