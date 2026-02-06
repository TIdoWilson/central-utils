# Runbook — Importador de Recebimentos MADRE SCP

## Sintomas

- ❌ "Autenticação MADRE falhou" ou token inválido
- ❌ "PDF parsing falhou" ou regex não encontrou valores
- ❌ "Erro de integridade BD" (FK inválida, duplicata)
- ❌ "Timeout conectando MADRE API"
- ❌ "Valores importados incorretos" (encoding brasileiro)

## Checagens rápidas

```bash
# 1. Logs
tail -50 /var/log/central-utils/madre_importer.log | grep -i "error\|auth\|timeout"

# 2. Verificar conectividade MADRE
curl -X GET https://api.madre-scp.com/health \
  -H "Authorization: Bearer $MADRE_API_KEY" \
  -H "User: $MADRE_USER"

# 3. Env vars configurados?
echo $MADRE_API_URL
echo $MADRE_TIMEOUT

# 4. BD conectado?
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) FROM recebimentos_madre"

# 5. Último import
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT MAX(created_at) FROM recebimentos_madre"
```

## Causas comuns

1. **Token MADRE expirado:** Credenciais antigas ou renovação falhada
   - Solução: Regenerar token, atualizar MADRE_API_KEY

2. **PDF parsing falhou:** Regex patterns não encontraram datas/valores
   - Solução: Validar PDF sample, atualizar regex em código

3. **Erro integridade BD:** Empresa_id inválida ou duplicata
   - Solução: Validar empresa existe em BD, usar UNIQUE constraint em importação

4. **Timeout MADRE:** Rede lenta ou API indisponível
   - Solução: Aumentar MADRE_TIMEOUT (default: 30s → 60s), retry logic

5. **Encoding brasileiro:** Caracteres especiais (ç, ã) parseados errado
   - Solução: Garantir UTF-8 encoding em PDF extraction e BD

6. **Valores com vírgula:** br_money_to_float() não convertendo corretamente
   - Solução: Validar função converte "1.234,56" → 1234.56

## Passo a passo para resolver

### Cenário 1: Autenticação MADRE falhou

```bash
# 1. Verificar credenciais
echo "API URL: $MADRE_API_URL"
echo "USER: $MADRE_USER"
# NÃO printar KEY (segurança)

# 2. Testar auth manualmente
curl -X GET "$MADRE_API_URL/auth/validate" \
  -H "Authorization: Bearer $MADRE_API_KEY" \
  -H "User: $MADRE_USER" \
  -v

# 3. Se erro 401, regenerar token
# Usar portal MADRE ou CLI
madre-cli auth generate --user=$MADRE_USER --pass=<senha>

# 4. Atualizar env var
export MADRE_API_KEY="novo_token_aqui"

# 5. Resubmeter import
curl -X POST http://localhost:8001/api/importador-recebimentos-madre-scp/processar \
  -H "Content-Type: application/json" \
  -d '{
    "data_inicio": "2025-02-01",
    "data_fim": "2025-02-28",
    "empresa": "EMPRESA_A"
  }'
```

### Cenário 2: PDF parsing falhou

```bash
# 1. Baixar PDF de sample da MADRE
wget "$MADRE_API_URL/recebimentos/export?format=pdf&empresa=EMPRESA_A" \
  -O /tmp/sample_madre.pdf

# 2. Extrair com pdfplumber
python3 << 'EOF'
import pdfplumber
with pdfplumber.open('/tmp/sample_madre.pdf') as pdf:
    for i, page in enumerate(pdf.pages[:2]):
        print(f"Page {i}:")
        print(page.extract_text())
        print("---")
EOF

# 3. Validar regex patterns
python3 << 'EOF'
import re
text = "Data: 15/02/2025, Valor: R$ 1.234,56"
# Testar patterns
DATE_REGEX = r'(\d{2}/\d{2}/\d{4})'
MONEY_REGEX = r'R\$\s*([\d.]+,\d{2})'
print("Dates:", re.findall(DATE_REGEX, text))
print("Money:", re.findall(MONEY_REGEX, text))
EOF

# 4. Se patterns não encontrarém, atualizar regex
nano /api/importador_recebimentos_madre_scp_core.py
# Editar: DATE_REGEX, MONEY_REGEX, ACCOUNT_REGEX

# 5. Resubmeter
```

### Cenário 3: Erro integridade BD (FK inválida)

```bash
# 1. Ver erro exato
tail -n 50 /var/log/central-utils/madre_importer.log | grep -A 5 "FOREIGN KEY"

# 2. Validar empresa existe
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT id FROM empresas WHERE codigo='EMPRESA_A'"

# 3. Se não existir, criar ou usar empresa correta
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'EOF'
INSERT INTO empresas (codigo, nome) VALUES ('EMPRESA_A', 'Empresa A Ltda')
ON CONFLICT (codigo) DO NOTHING;
EOF

# 4. Validar duplicatas
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT data_recebimento, COUNT(*) FROM recebimentos_madre GROUP BY data_recebimento HAVING COUNT(*) > 1"

# 5. Limpar duplicatas se necessário
DELETE FROM recebimentos_madre WHERE created_at < NOW() - INTERVAL 1 hour;

# 6. Resubmeter
curl -X POST http://localhost:8001/api/importador-recebimentos-madre-scp/processar \
  -H "Content-Type: application/json" \
  -d '{
    "data_inicio": "2025-02-01",
    "data_fim": "2025-02-28",
    "empresa": "EMPRESA_A",
    "importar_duplicatas": false
  }'
```

### Cenário 4: Timeout MADRE API

```bash
# 1. Aumentar timeout
export MADRE_TIMEOUT=120

# 2. Ou via request
curl -X POST http://localhost:8001/api/importador-recebimentos-madre-scp/processar \
  -H "Content-Type: application/json" \
  -d '{
    "data_inicio": "2025-02-01",
    "data_fim": "2025-02-28",
    "empresa": "EMPRESA_A",
    "timeout_segundos": 120
  }'

# 3. Se MADRE API indisponível, testar conectividade
ping api.madre-scp.com
curl -w "\n%{http_code}\n" -o /dev/null -s "$MADRE_API_URL/health"

# 4. Verificar status MADRE
# Portal: https://status.madre-scp.com/

# 5. Se persistente, aguardar e resubmeter depois
```

## Reprocesso/recuperação

_Verificar se já importado (checa duplicatas)._

```bash
# 1. Validar se período já importado
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'EOF'
SELECT COUNT(*) FROM recebimentos_madre 
WHERE created_at >= '2025-02-01' AND created_at <= '2025-02-28'
  AND empresa_id = (SELECT id FROM empresas WHERE codigo='EMPRESA_A')
EOF

# 2. Se já importado, pular ou deletar antigos
DELETE FROM recebimentos_madre 
WHERE data_recebimento >= '2025-02-01' AND data_recebimento <= '2025-02-28'

# 3. Resubmeter
curl -X POST http://localhost:8001/api/importador-recebimentos-madre-scp/processar \
  -H "Content-Type: application/json" \
  -d '{
    "data_inicio": "2025-02-01",
    "data_fim": "2025-02-28",
    "empresa": "EMPRESA_A"
  }'

# 4. Aguardar 30-120 seg (depende do período)

# 5. Validar import
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'EOF'
SELECT COUNT(*), SUM(valor) FROM recebimentos_madre 
WHERE data_recebimento >= '2025-02-01' AND data_recebimento <= '2025-02-28'
EOF
```

## Rollback

```bash
# 1. Deletar entradas importadas (últimos N registros)
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'EOF'
DELETE FROM recebimentos_madre WHERE created_at > NOW() - INTERVAL 1 hour;
EOF

# 2. Ou rollback transaction especifica
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ROLLBACK;"

# 3. Limpar temp files
rm -f /tmp/madre_*.pdf
```

## Contatos

- **Owner:** Squad Financeiro
- **Slack:** #squad-financeiro
- **MADRE Support:** suporte@madre-scp.com ou #canal-madre (Slack)
- **On-call:** PagerDuty (Financeiro SRE)
- **Escalação:** JIRA central-utils, tag: madre-import

---

**Última atualização:** Fevereiro 2026 | **Versão runbook:** 1.0  
**IMPORTANTE:** Dados sensíveis (credenciais MADRE) - Manter seguro em vault
