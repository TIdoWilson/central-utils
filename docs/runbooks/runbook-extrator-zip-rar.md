# Runbook — Extrator de ZIP/RAR

## Sintomas

- ❌ "Archive corrompido" ou "CRC error"
- ❌ "rarfile não instalado" ou versão desatualizada
- ❌ "Conflito de nome de arquivo detectado"
- ❌ Arquivos extraídos com nome `file (2).txt`, `file (3).txt` etc
- ❌ "Maximum extraction depth (5) exceeded"
- ❌ "Permission denied" ao extrair
- ❌ Path length excedido (Windows: 260 carac)

## Checagens rápidas

```bash
# 1. Logs
tail -50 /var/log/central-utils/extrator_zip_rar.log | grep -i "error\|crc\|corrupt"

# 2. Input archive
ls -lh /data/extrator-zip-rar/uploads/ | tail -3
file /data/extrator-zip-rar/uploads/*

# 3. Validar integrity
unzip -t /data/extrator-zip-rar/uploads/*.zip
urar t /data/extrator-zip-rar/uploads/*.rar  # RAR test

# 4. rarfile instalado?
python3 -c "import rarfile; print(rarfile.version_info)"

# 5. Output folder
ls -lh /data/extrator-zip-rar/outputs/ | head -20
```

## Causas comuns

1. **Archive corrompido (CRC error):** Arquivo ZIP/RAR danificado ou incompleto
   - Solução: Redownload arquivo, validar checksum, testar com `unzip -t`

2. **rarfile não instalado:** Module não encontrado
   - Solução: `pip install rarfile>=4.0.0`

3. **WinRAR não instalado (para .rar no Windows):** rar.exe não acessível
   - Solução: Instalar WinRAR, adicionar path ao PATH env var

4. **Conflito de nomes:** Múltiplos arquivos com mesmo nome em folders diferentes
   - Solução: Usar flag `handle_conflicts=true` para rename automático

5. **Max depth excedido:** Arquivos nested > 5 níveis
   - Solução: Aumentar `MAX_DEPTH` constant em código, ou pre-extract manualmente

6. **Path length (Windows):** Arquivo em path > 260 caracteres
   - Solução: Aumentar path length limit (Windows 10+: regedit AllowLongPaths), ou shorten paths

7. **Permission denied:** Arquivos read-only ou folder sem write
   - Solução: `chmod 755 /data/extrator-zip-rar/outputs/` Linux, ou permissões NTFS Windows

## Passo a passo para resolver

### Cenário 1: Archive corrompido (CRC error)

```bash
# 1. Testar integrity
unzip -t /data/extrator-zip-rar/uploads/archive.zip | tail -10
# Se "CRC error", arquivo está corrompido

# 2. Redownload original
wget https://url/archive.zip -O /data/extrator-zip-rar/uploads/archive_new.zip

# 3. Validar checksum (se disponível)
sha256sum /data/extrator-zip-rar/uploads/archive_new.zip

# 4. Resubmeter
curl -X POST http://localhost:8001/api/extrator-zip-rar/extrair \
  -H "Content-Type: application/json" \
  -d '{"arquivo": "archive_new.zip"}'
```

### Cenário 2: rarfile não instalado

```bash
# 1. Verificar instalação
python3 -c "import rarfile; print(rarfile.__version__)"

# 2. Se falhar, instalar
pip install --upgrade "rarfile>=4.0.0"

# 3. Para Windows .rar, instalar WinRAR
# Download: https://www.win-rar.com/
# Adicionar C:\Program Files\WinRAR ao PATH

# 4. No Linux, instalar unrar
sudo apt-get install unrar

# 5. Testar
python3 << 'EOF'
import rarfile
rar = rarfile.RarFile('/data/extrator-zip-rar/uploads/test.rar')
print(f"Files: {len(rar.namelist())}")
EOF

# 6. Resubmeter
```

### Cenário 3: Conflito de nomes (arquivos duplicados)

```bash
# 1. Listar output com conflitos
ls -la /data/extrator-zip-rar/outputs/ | grep "(2)\|(3)"

# 2. Verificar arquivo original
unzip -l /data/extrator-zip-rar/uploads/archive.zip | grep -c "file.txt"

# 3. Usar handle_conflicts flag
curl -X POST http://localhost:8001/api/extrator-zip-rar/extrair \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo": "archive.zip",
    "handle_conflicts": true,
    "rename_duplicates": true
  }'

# 4. Limpar output antigo
rm -rf /data/extrator-zip-rar/outputs/*

# 5. Resubmeter
```

### Cenário 4: Max depth excedido (nested archives)

```bash
# 1. Verificar profundidade
unzip -l /data/extrator-zip-rar/uploads/archive.zip | grep "\.zip\|\.rar" | wc -l

# 2. Se > 5 níveis aninhados, aumentar limit
nano /api/extrator_zip_rar_core.py
# Mudar: MAX_DEPTH = 5 → 10

# 3. Ou pre-extract manualmente nível por nível
unzip /data/extrator-zip-rar/uploads/archive.zip -d /tmp/level1/
unzip /tmp/level1/*.zip -d /tmp/level2/
# etc...

# 4. Resubmeter com profundidade maior
curl -X POST http://localhost:8001/api/extrator-zip-rar/extrair \
  -H "Content-Type: application/json" \
  -d '{
    "arquivo": "archive.zip",
    "max_depth": 10
  }'
```

### Cenário 5: Path length exceeded (Windows)

```bash
# 1. Detectar path comprido
python3 << 'EOF'
import os
for root, dirs, files in os.walk('/data/extrator-zip-rar/outputs/'):
    for file in files:
        path = os.path.join(root, file)
        if len(path) > 260:
            print(f"LONG: {len(path)} - {path}")
EOF

# 2. Opção A: Shorten output path
# Use shorter base path: `/data/out/` in lugar de `/data/extrator-zip-rar/outputs/`

# 3. Opção B: Enable long path support (Windows 10+)
reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1

# 4. Resubmeter com shorter names
```

## Reprocesso/recuperação

_Idempotente se usar mesmo arquivo input._

```bash
# 1. Remover output antigo
rm -rf /data/extrator-zip-rar/outputs/*

# 2. Resubmeter
curl -X POST http://localhost:8001/api/extrator-zip-rar/extrair \
  -H "Content-Type: application/json" \
  -d '{"arquivo": "archive.zip"}'

# 3. Aguardar processamento (depende do tamanho)

# 4. Validar files extraídos
find /data/extrator-zip-rar/outputs/ -type f | wc -l
```

## Rollback

```bash
# 1. Remover extracted files
rm -rf /data/extrator-zip-rar/outputs/*

# 2. Restaurar archive original
cp /backup/archives/archive.zip /data/extrator-zip-rar/uploads/

# 3. Limpar temp
rm -rf /tmp/level1 /tmp/level2
```

## Contatos

- **Owner:** Squad DevOps/Arquivos
- **Slack:** #squad-devops ou #plataforma
- **On-call:** PagerDuty (DevOps team)
- **Bug:** GitHub issues, tag: extrator-zip-rar

---

**Última atualização:** Fevereiro 2026 | **Versão runbook:** 1.0
