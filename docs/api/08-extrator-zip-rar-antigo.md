# 08 - Extrator ZIP/RAR

## 🎯 Objetivo

Extrair arquivos compactados (ZIP ou RAR) mantendo estrutura de pastas.

---

## 📥 Entrada
- ZIP ou RAR (.zip, .rar)
- Tamanho máximo: 500 MB

---

## 📤 Saída
- Arquivos extraídos em pasta estruturada
- ZIP com conteúdo extraído

---

## 🌐 Endpoint

```
POST /api/extrator-zip-rar/processar
```

### Body
```json
{
  "input_archive_path": "/data/uploads/arquivos.zip",
  "extract_to": "/data/outputs/extraidos"
}
```

---

**Arquivo Core:** `api/extrator_zip_rar_core.py`

**Última atualização:** Fevereiro 2026
