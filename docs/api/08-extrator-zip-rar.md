# Extrator ZIP/RAR

> **Tipo:** API  
> **Status:** Ativa  
> **Owner:** Squad Operacional  
> **Local no repo:** `/api/extrator_zip_rar_core.py`  
> **Ambientes:** dev/stg/prod  

## Objetivo

Extrai arquivos ZIP e RAR automaticamente, mantendo estrutura de pastas, evitando conflitos de nome com counter intelligente. Reduz manual drag-drop. Beneficia: operações, usuários, automações.

## Quando usar

- Extração automatizada de uploads
- Descompactação em batch
- Tratamento de ZIP/RAR com segurança
- Integração com workflows

## Como acessar

- **API:** `POST http://localhost:8001/api/extrator-zip-rar/processar`
- **Core:** `api/extrator_zip_rar_core.py`

## Fluxo principal

1. **Upload arquivo:** ZIP ou RAR, máx 500 MB
2. **Validação:** Verificar tipo e corrupção
3. **Extração:** Preserva estrutura de pastas
4. **Tratamento de conflitos:** Renomeia automático (arquivo, arquivo (2), arquivo (3))
5. **Compactação aninhada:** Até 5 níveis de profundidade
6. **Limpeza:** Remove .zip/.rar originais (opcional)
7. **Resultado:** Arquivos extraídos + mapeamento

## Entradas e saídas

### Entrada
```json
{
  "input_archive_path": "/data/uploads/arquivos.zip",
  "extract_to": "/data/outputs/extraidos",
  "remove_source": false
}
```

### Saída
```json
{
  "success": true,
  "files_extracted": 150,
  "folders_created": 25,
  "output_path": "/data/outputs/extraidos",
  "size_total_mb": 850.5
}
```

## Dependências

- **Libs:** zipfile (built-in), rarfile>=4.0.0 (RAR)
- **Serviços:** Nenhum

## Permissões e segurança

- **RBAC:** Ops (total)
- **LGPD:** Files sensíveis - auditar acesso
- **Auditoria:** `/var/log/central-utils/extrator.log`

## Configurações

- **Env vars:** EXTRATOR_MAX_MB (default: 500), MAX_DEPTH (default: 5)
- **Flags:** HANDLE_CONFLICTS (default: true)

## Observabilidade

- **Logs:** `/var/log/central-utils/extrator.log`
- **Métricas:** extrator_processamentos_total, _arquivos_extraidos_total, _tempo_segundos

## Runbook

```bash
curl -X POST http://localhost:8001/api/extrator-zip-rar/processar \
  -H "Content-Type: application/json" \
  -d '{
    "input_archive_path": "/data/uploads/arquivos.zip",
    "extract_to": "/data/outputs/extraidos"
  }'
```

## Troubleshooting

| Sintoma | Causa | Solução |
|--------|-------|--------|
| "Arquivo corrompido" | ZIP/RAR inválido | Tentar recriar arquivo |
| "Permissão negada" | Sem write em destino | Verificar chmod /data/outputs |
| "Caminho muito longo" | Windows MAX_PATH | Usar path mais curto |

## Referências

- [api/extrator_zip_rar_core.py](../../api/extrator_zip_rar_core.py)

---

**Atualização:** Fevereiro 2026 | **Squad:** Operacional
