# Runbook — Separador de Férias por Funcionário

## Sintomas

- ❌ "ZIP não criado" ou arquivo vazio
- ❌ "PDF pages não detectadas corretamente"
- ❌ Pasta de output com PDFs soltos em vez de ZIP
- ❌ "Company não identificado" — arquivos em pasta raiz
- ❌ Timeout ao processar PDF grande (>100 MB)
- ❌ "Arquivo corrompido" ao extrair ZIP

## Checagens rápidas

```bash
# 1. Logs de erro
tail -50 /var/log/central-utils/separador_ferias.log | grep -i "error\|exception"

# 2. Verificar arquivo input
ls -lh /data/ferias-funcionario/uploads/ | tail -5
file /data/ferias-funcionario/uploads/*.pdf

# 3. Output estrutura
find /data/ferias-funcionario/ -type d | head -20
ls -la /data/ferias-funcionario/outputs/

# 4. Validar PDF integrity
pdfinfo /data/ferias-funcionario/uploads/input.pdf | head -10

# 5. Testar unzip
unzip -t /data/ferias-funcionario/*.zip | tail -5
```

## Causas comuns

1. **PDF corrupted:** Arquivo PDF entrada já danificado
   - Solução: Regenerar PDF original, testar com `pdfinfo`

2. **Company não detectado:** Regex quebrado ou formato de página mudou
   - Solução: Verificar página 1 do PDF tem pattern "EMPRESA Página: N", atualizar regex em código

3. **Memory exhaustion:** PDF muito grande (>200 MB)
   - Solução: Split PDF em arquivos menores antes, aumentar container RAM

4. **Folder permission issue:** `/data/ferias-funcionario/` sem write access
   - Solução: `chmod 755 /data/ferias-funcionario/{outputs,uploads}`

5. **ZIP leftover:** Arquivo ZIP antigo não deletado
   - Solução: `rm -f /data/ferias-funcionario/*.zip` + resubmeter

## Passo a passo para resolver

### Cenário 1: Company não identificado (tudo em raiz)

```bash
# 1. Verificar página 1 do PDF
pdftotext /data/ferias-funcionario/uploads/input.pdf - | head -20

# 2. Procurar palavras-chave
grep -i "empresa\|company\|folha de pagamento" /tmp/page1.txt

# 3. Se pattern diferente, editar regex em código
nano /api/separador_ferias_funcionario_core.py
# Modificar: COMPANY_PATTERN = r"(?P<empresa>.*?) P[aá]gina"

# 4. Testar com dry-run (se suportado)
curl -X POST http://localhost:8001/api/separador-ferias/processar \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo": "input.pdf",
    "dry_run": true
  }'

# 5. Resubmeter com fix
```

### Cenário 2: ZIP vazio ou não criado

```bash
# 1. Verificar se output folder existe
ls -la /data/ferias-funcionario/outputs/

# 2. Se não existir, criar
mkdir -p /data/ferias-funcionario/outputs/
chmod 755 $_

# 3. Testar escrita
touch /data/ferias-funcionario/outputs/test.txt && rm $_

# 4. Verificar disk space
df -h /data/

# 5. Se cheio, limpar antigos
find /data/ferias-funcionario/ -name "*.pdf" -mtime +30 -delete

# 6. Resubmeter request
```

### Cenário 3: Timeout processando PDF grande

```bash
# 1. Verificar tamanho
ls -lh /data/ferias-funcionario/uploads/*.pdf

# 2. Se >150 MB, split antes
pdfsplitter --input input.pdf --pages 100 --output split_

# 3. Aumentar timeout em request
curl -X POST http://localhost:8001/api/separador-ferias/processar \
  -H "Content-Type: application/json" \
  -d '{"arquivo": "split_001.pdf", "timeout_segundos": 120}'

# 4. Processar sequencial cada split
# Concatenar ZIPs depois
```

## Reprocesso/recuperação

_Idempotente se usar mesmo arquivo input._

```bash
# 1. Remover output antigo
rm -rf /data/ferias-funcionario/outputs/FERIAS-*

# 2. Deletar ZIP se existir
rm -f /data/ferias-funcionario/*.zip

# 3. Resubmeter
curl -X POST http://localhost:8001/api/separador-ferias/processar \
  -H "Content-Type: application/json" \
  -d '{"arquivo": "input.pdf"}'

# 4. Aguardar 30-60 seg para PDF grande

# 5. Validar ZIP novo
unzip -l /data/ferias-funcionario/FERIAS_*.zip | grep -c "\.pdf$"
```

## Rollback

_Sem efeitos colaterais em BD._

```bash
# 1. Remover folder de output atual
rm -rf /data/ferias-funcionario/outputs/FERIAS-*

# 2. Recuperar version anterior se em Git
git checkout /data/ferias-funcionario/

# 3. Restaurar ZIP antigo se backupado
cp /backup/ferias/FERIAS_antigo_*.zip /data/ferias-funcionario/

# 4. Limpar temp
rm -rf /tmp/ferias_*
```

## Contatos

- **Owner:** Squad RH/Processos
- **Slack:** #squad-rh
- **Escalação:** JIRA ticket CENTRAL-UTILS, tag: separador-ferias
- **On-call:** Verificar PagerDuty

---

**Última atualização:** Fevereiro 2026 | **Versão runbook:** 1.0
