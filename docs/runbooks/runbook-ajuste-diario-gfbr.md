# Runbook — Ajuste Diário GFBR

## Sintomas

- ❌ "Débito ≠ Crédito no grupo" (validação falha)
- ❌ "Conta inválida no plano GFBR"
- ❌ "Grupo não detectado" (formatação Excel inconsistente)
- ❌ "Centro de custo inválido" ou não mapeado
- ❌ Arquivo saída não gerado ou vazio
- ❌ "Hash validação mismatch" (auditoria falha)

## Checagens rápidas

```bash
# 1. Logs auditoria
tail -50 /var/log/central-utils/ajuste_gfbr.log | grep -i "error\|balance\|hash"

# 2. Input Excel
ls -lh /data/ajustes-contabeis/uploads/ | tail -3
file /data/ajustes-contabeis/uploads/*.xlsx

# 3. Validar planilha integridade
python3 << 'EOF'
from openpyxl import load_workbook
wb = load_workbook('/data/ajustes-contabeis/uploads/ajustes.xlsx')
print(f"Sheets: {wb.sheetnames}")
for sheet in wb.sheetnames:
    ws = wb[sheet]
    print(f"{sheet}: rows={ws.max_row}, cols={ws.max_column}")
EOF

# 4. Output gerado?
ls -lh /data/ajustes-contabeis/outputs/ | tail -3

# 5. Audit log
tail -20 /var/log/central-utils/audit_gfbr.log

# 6. BD auditoria
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT * FROM auditoria_gfbr ORDER BY timestamp DESC LIMIT 5"
```

## Causas comuns

1. **Débito ≠ Crédito no grupo:** Lançamento desbalanceado
   - Solução: Revisar totalizadores, adicionar contrapartida, validar valores

2. **Conta inválida GFBR:** Código fora do plano de contas
   - Solução: Consultar cardápio GFBR, usar mapeamento correto, validar tabela contas

3. **Grupo não detectado:** Formatação Excel não segue padrão (linha título, valores, vazio)
   - Solução: Estruturar Excel exatamente conforme template, respeitar borders

4. **Centro de custo inválido:** Código não existe em tabela centros
   - Solução: Validar depto/centro de custo, usar cardápio oficial

5. **Hash mismatch (auditoria):** Arquivo TXT saída foi modificado
   - Solução: Regenerar, validar NOT alterado após geração, conferir assinatura

6. **Memory leak:** Arquivo Excel muito grande (>100k linhas, >50 MB)
   - Solução: Split em múltiplos arquivos, aumentar heap Java/Python

## Passo a passo para resolver

### Cenário 1: Débito ≠ Crédito em grupo

```bash
# 1. Debugar lógica detecção de grupos
python3 << 'EOF'
from openpyxl import load_workbook
wb = load_workbook('/data/ajustes-contabeis/uploads/ajustes.xlsx')
ws = wb.active

grupos = []
grupo_atual = None
total_debito = 0
total_credito = 0

for row in ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True):
    if row[0] and isinstance(row[0], str) and row[0].isupper():  # Título grupo
        if grupo_atual:
            print(f"Grupo '{grupo_atual}': D={total_debito}, C={total_credito}, OK={total_debito==total_credito}")
        grupo_atual = row[0]
        total_debito = 0
        total_credito = 0
    elif row[0] is None:  # Fim grupo
        if grupo_atual:
            print(f"Grupo '{grupo_atual}': D={total_debito}, C={total_credito}, OK={total_debito==total_credito}")
        grupo_atual = None
    else:  # Lançamento
        if row[3]:  # Coluna Débito
            total_debito += float(row[3])
        if row[4]:  # Coluna Crédito
            total_credito += float(row[4])
EOF

# 2. Se desbalanceado, revisar valores Excel
# Abrir no Excel e validar =SUM(D:D) vs =SUM(E:E)

# 3. Adicionar contrapartida se necessário
# Exemplo: se débito > crédito, adicionar crédito em conta complementar

# 4. Resubmeter
curl -X POST http://localhost:8001/api/ajuste-diario-gfbr/gerar \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo_excel": "ajustes.xlsx",
    "data_ajuste": "2025-02-28",
    "empresa": "00123456",
    "validar_completo": true
  }'
```

### Cenário 2: Conta inválida GFBR

```bash
# 1. Consultar plano de contas GFBR
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT codigo, descricao FROM plano_gfbr ORDER BY codigo" | head -20

# 2. Verificar código usado Excel vs. válido
# Exemplo: usou "11.2.1.01" mas válido é "11.2.1.1" (sem leading 0)

# 3. Buscar conta similar
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT * FROM plano_gfbr WHERE descricao LIKE '%palavra_chave%'"

# 4. Corrigir Excel com código válido

# 5. Resubmeter
```

### Cenário 3: Grupo não detectado (estrutura Excel)

```bash
# 1. Validar estrutura do Excel
# Padrão esperado:
# Linha 1: "AJUSTES FEVEREIRO 2025"
# Linha 2: em branco
# Linha 3: "Grupo 1"
# Linhas 4-10: Lançamentos
# Linha 11: em branco  (separa grupos)
# Linha 12: "Grupo 2"
# ...

# 2. Restruturar se necessário
# Abrir Excel, remover formatação extra, respeitar borders, testar

# 3. Validar pattern no código
grep -n "def.*detectar.*grupo\|PATTERN.*GROUP" /api/ajuste_diario_gfbr_core.py

# 4. Se padrão diferente da documentação, editar regex/parsing

# 5. Resubmeter
```

### Cenário 4: Hash mismatch (auditoria)

```bash
# 1. Verificar arquivo TXT gerado
cat /data/ajustes-contabeis/outputs/AJUSTES_20250228_GFBR.txt

# 2. Calcular hash
sha256sum /data/ajustes-contabeis/outputs/AJUSTES_20250228_GFBR.txt

# 3. Comparar com hash na auditoria BD
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'EOF'
SELECT arquivo_hash, arquivo_path FROM auditoria_gfbr 
WHERE timestamp > NOW() - INTERVAL 1 hour 
ORDER BY timestamp DESC LIMIT 1;
EOF

# 4. Se mismatch:
# - Arquivo foi alterado (detectado) → Rejeitado para auditoria
# - Regenerar com flag bypass (se autorizado)
# - Ou reimportar com dry-run

# 5. Resubmeter com novas credenciais auditoria
curl -X POST http://localhost:8001/api/ajuste-diario-gfbr/gerar \
  -H "Content-Type: application/json" \
  -H "X-Audit-User: contador@empresa.com" \
  -d '{
    "arquivo_excel": "ajustes.xlsx",
    "data_ajuste": "2025-02-28",
    "force_recalc_hash": true
  }'
```

### Cenário 5: Validação grupo formato inconsistente

```bash
# 1. Usar modo DRY_RUN para validação apenas
curl -X POST http://localhost:8001/api/ajuste-diario-gfbr/validar \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo_excel": "ajustes.xlsx"
  }'

# 2. Resposta indicará erros específicos de validação

# 3. Corrigir conforme feedback

# 4. Resubmeter para gerar
```

## Reprocesso/recuperação

_Verificar se período já processado (audit log)._

```bash
# 1. Verificar se já processado
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'EOF'
SELECT * FROM auditoria_gfbr 
WHERE data_ajuste = '2025-02-28' 
  AND empresa = '00123456'
  AND status='sucesso'
EOF

# 2. Se sim, revisar output anterior
ls -la /data/ajustes-contabeis/outputs/AJUSTES_20250228_GFBR*

# 3. Se precisa re-generate, deletar arquivo antigo
rm /data/ajustes-contabeis/outputs/AJUSTES_20250228_GFBR.txt

# 4. Limpar log auditoria se necessário (apenas se autorizado)
# psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "DELETE FROM auditoria_gfbr WHERE created_at > NOW() - INTERVAL 1 hour"

# 5. Resubmeter
curl -X POST http://localhost:8001/api/ajuste-diario-gfbr/gerar \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo_excel": "ajustes_new.xlsx",
    "data_ajuste": "2025-02-28",
    "empresa": "00123456"
  }'

# 6. Aguardar processamento (10-30 seg)

# 7. Validar arquivo gerado
ls -lh /data/ajustes-contabeis/outputs/AJUSTES_20250228_GFBR.txt
wc -l /data/ajustes-contabeis/outputs/AJUSTES_20250228_GFBR.txt
```

## Rollback

_Suporte via banco de dados apenas (NOT revertível sistema contábil)._

```bash
# 1. Se arquivo gerado ANTES de importar sistema contábil (SAP/ERP):
rm -f /data/ajustes-contabeis/outputs/AJUSTES_20250228_GFBR.txt

# 2. Limpar audit log (requer permissão DBA)
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -U dba_user << 'EOF'
DELETE FROM auditoria_gfbr 
WHERE created_at > NOW() - INTERVAL 1 hour 
  AND status='sucesso'
EOF

# 3. Se JÁ importado em SAP/ERP:
# DEVE fazer estorno contábil manual (processo controlador)
# - Criar novo ajuste com valores inversos
# - Registrar motivo em comentário
# - Não deletar original

# 4. Contatar Squad Controladoria para estorno
```

## Contatos

- **Owner:** Squad Controladoria
- **Slack:** #squad-controladoria
- **Contador responsável:** [nome/email do controller]
- **DBA BD:** [nome/email DBA]
- **SAP/ERP Admin:** [nome/email]
- **On-call:** Verificar PagerDuty (Controladoria SRE)
- **Escalação:** JIRA central-utils, tag: ajuste-gfbr, criticidade: HIGH

---

**Última atualização:** Fevereiro 2026 | **Versão runbook:** 1.0  
**⚠️ AVISO CRÍTICO:** Dados contábeis sensíveis (LGPD compliance requerida)  
**IMPORTANTE:** Todas modificações devem ser auditadas - NUNCA deletar arquivos sem aprovação controller
