# Runbook — Separador CSV Baixa Automática

## Sintomas

- ❌ "Arquivo Excel saída não foi gerado"
- ❌ "Ano não detectado" ou separação por ano errada
- ❌ Números com ponto em vez de vírgula (formatação errada)
- ❌ "Limite de linhas por arquivo excedido" ou arquivo muito grande
- ❌ Colunas de data aparecem como número serial (ex: 45350)
- ❌ Import falha em sistema contábil (formato não aceito)

## Checagens rápidas

```bash
# 1. Logs
tail -50 /var/log/central-utils/separador_csv_baixa.log | grep -E "ERROR|WARN"

# 2. Verificar input file
ls -lh /data/separador-csv-baixa-automatica/uploads/ | tail -3
file /data/separador-csv-baixa-automatica/uploads/*

# 3. Output foi gerado?
ls -lh /data/separador-csv-baixa-automatica/outputs/ | tail -10

# 4. Validar formato Excel
python3 -c "import pandas as pd; df=pd.read_excel('/path/to/output.xlsx'); print(df.dtypes)"

# 5. Verificar encoding
file -b --mime-encoding /data/separador-csv-baixa-automatica/uploads/*
```

## Causas comuns

1. **Coluna DATA EMISSÃO não existe:** Arquivo com estrutura diferente
   - Solução: Validar nomes de coluna exatos, verificar case-sensitivity

2. **Formatação de número quebrada:** Ponto em vez de vírgula em valores
   - Solução: Excel formato regional "Português (Brasil)" + decimal locale config

3. **Arquivo muito grande:** Excede limite padrão (50 linhas/arquivo)
   - Solução: Aumentar `max_linhas_por_arquivo` parameter, usar split antes

4. **Year detection falha:** Data em formato não reconhecido
   - Solução: Validar coluna "DATA EMISSÃO", formato esperado: DD/MM/YYYY

5. **Memory leak:** Pandas + openpyxl com arquivo muito grande
   - Solução: Processar em chunks, liberar memory após cada escrita

## Passo a passo para resolver

### Cenário 1: Formatação de números (ponto vs virgula)

```bash
# 1. Verificar locale do container
locale

# 2. Se não for pt_BR, configurar
export LC_NUMERIC="pt_BR.UTF-8"
export LANG="pt_BR.UTF-8"

# 3. Validar entrada tem vírgula
head -5 /data/separador-csv-baixa-automatica/uploads/*.csv | grep -o "[0-9],.*"

# 4. Resubmeter com locale correto
LC_NUMERIC="pt_BR.UTF-8" curl -X POST http://localhost:8001/api/separador-csv-baixa/processar \
  -H "Content-Type: application/json" \
  -d '{"arquivo_input": "baixa.csv", "locale": "pt_BR"}'

# 5. Validar output Excel
python3 << 'EOF'
import pandas as pd
df = pd.read_excel('/path/to/output.xlsx')
print(df[['DATA EMISSÃO', 'VALOR']].head())
# Verificar se valores têm ",00" (vírgula)
EOF
```

### Cenário 2: Ano não detectado (coluna DATA EMISSÃO não encontrada)

```bash
# 1. Listar colunas do arquivo
python3 << 'EOF'
import pandas as pd
df = pd.read_csv('/data/separador-csv-baixa-automatica/uploads/baixa.csv', encoding='utf-8')
print("Colunas encontradas:")
print(df.columns.tolist())
EOF

# 2. Se coluna diferente (ex: "Data Emissão" vs "DATA EMISSÃO")
# Editar código ou passar like:
curl -X POST http://localhost:8001/api/separador-csv-baixa/processar \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo_input": "baixa.csv",
    "coluna_data": "Data Emissão"
  }'

# 3. Se não houver coluna de data, criar antes
python3 << 'EOF'
df = pd.read_csv('/data/separador-csv-baixa-automatica/uploads/baixa.csv')
# Assumir coluna 0 é data
df.columns = ['DATA EMISSÃO', 'DESCRICAO', 'VALOR', ...]
df.to_csv('/tmp/baixa_fixed.csv', index=False)
EOF

# 4. Resubmeter com arquivo corrigido
```

### Cenário 3: Arquivo muito grande (limite linhas)

```bash
# 1. Contar linhas
wc -l /data/separador-csv-baixa-automatica/uploads/baixa.csv

# 2. Se > 5000, aumentar limite
curl -X POST http://localhost:8001/api/separador-csv-baixa/processar \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo_input": "baixa.csv",
    "max_linhas_por_arquivo": 200
  }'

# 3. Ou pre-split em chunks
python3 << 'EOF'
import pandas as pd
df = pd.read_csv('/data/separador-csv-baixa-automatica/uploads/baixa.csv')
chunk_size = 1000
for i in range(0, len(df), chunk_size):
    chunk = df.iloc[i:i+chunk_size]
    chunk.to_csv(f'/tmp/chunk_{i//1000}.csv', index=False)
EOF

# 4. Processar cada chunk
for file in /tmp/chunk_*.csv; do
  curl -X POST http://localhost:8001/api/separador-csv-baixa/processar \
    -H "Content-Type: application/json" \
    -d "{\"arquivo_input\": \"$(basename $file)\"}"
  sleep 5
done
```

## Reprocesso/recuperação

_Idempotente se usar mesmo arquivo input (checa por checksum)._

```bash
# 1. Limpar output antigo
rm -f /data/separador-csv-baixa-automatica/outputs/*.xlsx

# 2. Resubmeter
curl -X POST http://localhost:8001/api/separador-csv-baixa/processar \
  -H "Content-Type: application/json" \
  -d '{"arquivo_input": "baixa.csv"}'

# 3. Aguardar 10-30 seg

# 4. Validar novo output
ls -lh /data/separador-csv-baixa-automatica/outputs/
unzip -t /data/separador-csv-baixa-automatica/outputs/separador_*.zip
```

## Rollback

_Sem efeitos em BD, apenas output files._

```bash
# 1. Remover arquivos saída incorretos
rm -f /data/separador-csv-baixa-automatica/outputs/*.xlsx

# 2. Restaurar version anterior do código se necessário
git checkout /api/separador_csv_baixa_automatica_core.py

# 3. Limpar temp
rm -rf /tmp/chunk_* /tmp/baixa_*
```

## Contatos

- **Owner:** Squad Financeiro/Controlador
- **Slack:** #squad-financeiro
- **On-call:** Verificar PagerDuty
- **Escalação:** JIRA, projeto CENTRAL-UTILS

---

**Última atualização:** Fevereiro 2026 | **Versão runbook:** 1.0
