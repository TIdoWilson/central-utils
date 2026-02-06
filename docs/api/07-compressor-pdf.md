# Compressor de PDF

> **Tipo:** API  
> **Status:** Ativa  
> **Owner:** Squad Operacional  
> **Local no repo:** `/api/comprimir_pdf_core.py`  
> **Ambientes:** dev/stg/prod  

## Objetivo

Reduz tamanho de PDFs automaticamente convertendo para tons de cinza, aplicando compressão JPEG. Reduz de 50-90% sem qualidade visível. Beneficia: operações, armazenamento, transmissão.

## Quando usar

- Otimização de PDFs para email/compartilhamento
- Redução de espaço em disco
- Quando tamanho excede limites de sistema
- Arquivamento long-term

## Como acessar

- **API:** `POST http://localhost:8001/api/compressor-pdf/processar`
- **Core:** `api/comprimir_pdf_core.py`

## Fluxo principal

1. **Upload PDF:** Máx 200 MB
2. **Configuração:** DPI scale (resolução) + JPEG quality (1-100)
3. **Conversão:** Renderiza cada página em tons de cinza
4. **Compressão JPEG:** Reduz com qualidade configurável
5. **Reconstrução PDF:** Insere imagens no novo PDF
6. **Resultado:** PDF reduzido + métricas de compressão

## Entradas e saídas

### Entrada
```json
{
  "input_pdf_path": "/data/uploads/grande.pdf",
  "compression_level": "medium",
  "dpi_scale": 1.0,
  "jpeg_quality": 50
}
```

### Saída
```json
{
  "success": true,
  "original_size_mb": 15.5,
  "compressed_size_mb": 2.3,
  "reduction_percent": 85.2,
  "output_path": "/data/outputs/grande_compressed.pdf"
}
```

## Dependências

- **Libs:** fitz/PyMuPDF>=1.23.0
- **Serviços:** Nenhum

## Permissões e segurança

- **RBAC:** Todos autenticados podem usar
- **LGPD:** Dados sensíveis perdem qualidade (t/v de negó)
- **Auditoria:** `/var/log/central-utils/compressor.log`

## Configurações

- **Env vars:** COMPRESSOR_MAX_MB (default: 200), COMPRESSOR_DEFAULT_QUALITY (default: 50)
- **Flags:** KEEP_COLOR (default: false - converte p/ cinza)

## Observabilidade

- **Logs:** `/var/log/central-utils/compressor.log`
- **Métricas:** compressor_processamentos_total, _reducao_percent_media, _tempo_segundos

## Runbook

```bash
curl -X POST http://localhost:8001/api/compressor-pdf/processar \
  -H "Content-Type: application/json" \
  -d '{
    "input_pdf_path": "/data/uploads/grande.pdf",
    "compression_level": "medium"
  }'
```

## Troubleshooting

| Sintoma | Causa | Solução |
|--------|-------|--------|
| "PDF vazio após compressão" | JPEG quality muito baixo | Aumentar quality (ex: 70 vs 30) |
| "Timeout" | Arquivo muito grande | Reduzir dpi_scale (ex: 0.75) |
| "Comprensão mínima" | PDF já comprimido | Tentar outra ferramenta |

## Referências

- [api/comprimir_pdf_core.py](../../api/comprimir_pdf_core.py)
- Relacionado: [07-compressor-pdf.md](07-compressor-pdf.md)

---

**Atualização:** Fevereiro 2026 | **Squad:** Operacional
