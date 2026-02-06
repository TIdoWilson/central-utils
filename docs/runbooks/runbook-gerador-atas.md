# Runbook — Gerador de Atas

## Sintomas

- ❌ Documento Word não abre após geração
- ❌ "Erro ao gerar PDF: conversão falhou"
- ❌ Placeholders `{{campo}}` aparecem no documento final
- ❌ Tabelas vazias ou formatação quebrada
- ❌ PDF com páginas em branco ou truncado

## Checagens rápidas

```bash
# 1. Logs
tail -20 /var/log/central-utils/gerador_atas.log

# 2. Template existe?
ls -la /data/atas_modelos/ | grep -i "\.xlsm\|\.docx"

# 3. Saída foi gerada?
ls -la /data/atas_geradas/ | tail -5

# 4. Verificar permissões
chmod 755 /data/atas_geradas/

# 5. Testar conversão LibreOffice
libreoffice --headless --convert-to pdf /tmp/test.docx
```

## Causas comuns

1. **Template danificado ou versionado:** Arquivo .xlsm/.docx corrompido ou formatação incompatível
   - Solução: Redownload template original, validar via MS Office

2. **Placeholders malformados:** JSON enviado com chaves `{{campo}}` que não existem no template
   - Solução: Listar placeholders do template, mapear corretamente em request

3. **LibreOffice/Ghostscript não instalados:** PDF conversion falha no Linux
   - Solução: `sudo apt-get install libreoffice ghostscript`

4. **Permissões de escrita:** Diretório `/data/atas_geradas/` sem permissão
   - Solução: `sudo chown app:app /data/atas_geradas/ && chmod 755`

5. **Memory leak DOCX processing:** Arquivos grandes causam timeout
   - Solução: Split em múltiplos pedidos, aumentar timeout (default: 30s → 60s)

## Passo a passo para resolver

### Cenário 1: PDF conversion falha (Linux)

```bash
# 1. Verificar LibreOffice instalado
libreoffice --version

# 2. Se não: instalar + rebuild cache
sudo apt-get update && sudo apt-get install -y libreoffice ghostscript

# 3. Teste manual
cd /data/atas_geradas/
libreoffice --headless --convert-to pdf test.docx

# 4. Resubmeter request pela API
curl -X POST http://localhost:8001/api/gerador-atas/gerar \
  -H "Content-Type: application/json" \
  -d '{"template": "template.docx", "placeholders": {...}}'
```

### Cenário 2: Placeholders não substituem

```bash
# 1. Validar template tem placeholders
grep -o "{{[^}]*}}" /data/atas_modelos/template.docx | sort -u

# 2. Verificar payload JSON
# Exemplo correto:
{
  "template_nome": "Template Bernadina.xlsm",
  "campos": {
    "EMPRESA": "XYZ LTDA",
    "CNPJ": "00123456789012",
    "CEP": "12345-678"
  }
}

# 3. Testar com minimal payload
curl -X POST http://localhost:8001/api/gerador-atas/processar \
  -H "Content-Type: application/json" \
  -d '{"template_nome": "Template Bernadina.xlsm", "campos": {"EMPRESA": "TEST"}}'
```

### Cenário 3: Tabelas vazias após processamento

```bash
# 1. Verificar lógica de limpeza
grep -A 5 "removeEmptyRows" /api/gerador_atas_core.py

# 2. Validar dados antes de enviar
# Confirmar que dados não são vazios no payload

# 3. Desabilitar limpeza temporariamente
POST /api/gerador-atas/gerar?skip_cleanup=true

# 4. Resubmeter com dados
```

## Reprocesso/recuperação

_Gerador de atas é idempotente para o mesmo template+campos._

```bash
# 1. Verificar último arquivo gerado
ls -lt /data/atas_geradas/*.pdf | head -1

# 2. Se for incorreto, deletar e reprocessar
rm /data/atas_geradas/ata_ANTIGA_20250206_*.pdf

# 3. Resubmeter request
curl -X POST http://localhost:8001/api/gerador-atas/processar \
  -H "Content-Type: application/json" \
  -d '{...}'

# 4. Aguardar ~5-10 seg por PDF

# 5. Validar novo arquivo
file /data/atas_geradas/ata_*.pdf
```

## Rollback

_Não há dados reversíveis (apenas output files)._

```bash
# 1. Remover PDFs incorretos
rm -f /data/atas_geradas/ata_*_YYYY-MM-DD_*.pdf

# 2. Revert template se versionado
git checkout /data/atas_modelos/Template\ Bernadina.xlsm

# 3. Limpar temp files
rm -rf /tmp/docx_* /tmp/pdf_*

# 4. Reiniciar container (se houver memory leak)
docker restart central-utils-api
```

## Contatos

- **Owner:** Squad Jurídico/Administrativo
- **Slack:** #squad-juridico
- **On-call:** Verificar PagerDuty (tag: gerador-atas)
- **Escalação:** Abrir ticket no Jira (projeto: CENTRAL-UTILS)

---

**Última atualização:** Fevereiro 2026 | **Versão runbook:** 1.0
