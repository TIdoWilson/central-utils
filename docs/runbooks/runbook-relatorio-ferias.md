# Runbook — Separador PDF Relatório de Férias

## Sintomas

- ❌ "Company não identificado" ou todos em pasta raiz
- ❌ "ZIP não foi criado" ou vazio
- ❌ "Regex pattern não encontrou empresa"
- ❌ Files não deletados após zipping
- ❌ Memória insuficiente processando PDF grande

## Checagens rápidas

```bash
# 1. Logs
tail -50 /var/log/central-utils/separador_relatorio_ferias.log | grep -E "ERROR|WARN"

# 2. Input PDF
ls -lh /data/ferias-funcionario/uploads/ | grep relatorio

# 3. Output folders
ls -la /data/ferias-funcionario/outputs/ | grep "FOLHA\|EMPRESA"

# 4. Validar PDF primeira página (company detection)
pdftotext /data/ferias-funcionario/uploads/relatorio.pdf - | head -30

# 5. Check ZIP criado
ls -lh /data/ferias-funcionario/*.zip 2>/dev/null || echo "Nenhum ZIP encontrado"
```

## Causas comuns

1. **Company pattern não encontrado:** Texto "EMPRESA Página: N" ou "Folha de Pagamento" não existe
   - Solução: Verificar primeira linha, atualizar regex pattern em código

2. **ZIP não criado:** Folder de output vazia ou permissão negada
   - Solução: `chmod 755 /data/ferias-funcionario/`, validar write access

3. **Memory exhaustion:** PDF > 200 MB
   - Solução: Split PDF antes (pdfsplitter), processar sequencial

4. **Files não deletados:** PDFs individuais ainda em output após ZIP
   - Solução: Aumentar timeout de limpeza, debug flag `SKIP_CLEANUP=false`

## Passo a passo para resolver

### Cenário 1: Company não identificado

```bash
# 1. Ver primeira linha do PDF
pdftotext /data/ferias-funcionario/uploads/relatorio.pdf /tmp/page1.txt
head -20 /tmp/page1.txt

# 2. Se padrão diferente, update regex
grep "EMPRESA\|Folha\|Página" /tmp/page1.txt

# 3. Se não encontrar, editar core
nano /api/relatorio_ferias_core.py
# Modificar pattern: r"(?P<empresa>.*?)\s*Página\s*:\s*\d+"

# 4. Resubmeter
curl -X POST http://localhost:8001/api/separador-relatorio-ferias/processar \
  -d '{"arquivo": "relatorio.pdf"}'
```

### Cenário 2: ZIP vazio ou não criado

```bash
# 1. Validar output folder
ls -la /data/ferias-funcionario/outputs/

# 2. Se vazio, checar disk space
df -h /data/

# 3. Criar folder se não existir
mkdir -p /data/ferias-funcionario/outputs/
chmod 755 $_

# 4. Resubmeter
```

## Reprocesso/recuperação

```bash
# 1. Remover output antigo
rm -rf /data/ferias-funcionario/outputs/FOLHA*

# 2. Deletar ZIP
rm -f /data/ferias-funcionario/*.zip

# 3. Resubmeter
curl -X POST http://localhost:8001/api/separador-relatorio-ferias/processar \
  -d '{"arquivo": "relatorio.pdf"}'
```

## Rollback

```bash
# 1. Remover folder output
rm -rf /data/ferias-funcionario/outputs/FOLHA*

# 2. Restaurar backup
cp -r /backup/ferias/outputs_antigo/* /data/ferias-funcionario/outputs/
```

## Contatos

- **Owner:** Squad RH
- **Slack:** #squad-rh
- **Escalação:** JIRA, tag: separador-relatorio-ferias

---

**Última atualização:** Fevereiro 2026 | **Versão runbook:** 1.0
