# Checklist TI Criacao de Usuario

## 1. Visao Geral

- **Slug:** `checklist-ti-criacao-usuario`
- **Grupo:** Admin
- **Pagina (rota):** `/checklist-ti-criacao-usuario`
- **API base:** `/api/checklist-ti-criacao-usuario`
- **Acesso:** somente `ADMIN`

Ferramenta para preencher o checklist de criacao de usuario com fluxo de rascunho e finalizacao definitiva, gerando PDF e numero de processo sequencial.

## 2. Objetivo Operacional

- Substituir o checklist DOCX manual por um formulario web versionado no portal.
- Permitir salvar rascunho para nao perder preenchimento em interrupcoes.
- Finalizar definitivamente (sem edicao posterior), com PDF e numero sequencial automatico.
- Definir senha separada por sistema, com geracao aleatoria por campo.
- `Responsavel TI` e sempre preenchido pelo nome da conta logada (nao editavel manualmente).
- `Usuario IOB` e campo separado do e-mail de usuario.

## 3. Arquivos Relacionados

- **Pagina HTML:** `public/checklist-ti-criacao-usuario.html`
- **Script JS:** `public/js/checklist-ti-criacao-usuario.js`
- **Router Node:** `src/routes/tools/checklist-ti-criacao-usuario.routes.js`
- **Schema/Bootstrap DB:** `src/server.js` (tabela `checklist_ti_user_creation_forms`)

## 4. Endpoints

- `GET /api/checklist-ti-criacao-usuario`
- `GET /api/checklist-ti-criacao-usuario/:id`
- `GET /api/checklist-ti-criacao-usuario/next-process-number`
- `GET /api/checklist-ti-criacao-usuario/:id/pdf`
- `POST /api/checklist-ti-criacao-usuario/draft` (CSRF obrigatorio)
- `PUT /api/checklist-ti-criacao-usuario/:id/draft` (CSRF obrigatorio)
- `DELETE /api/checklist-ti-criacao-usuario/:id/draft` (CSRF obrigatorio)
- `POST /api/checklist-ti-criacao-usuario/:id/finalize` (CSRF obrigatorio)

## 5. Fluxo de Uso

1. Preencher os campos do checklist.
2. Informar um unico e-mail de usuario e senhas por sistema.
3. Salvar rascunho (manual e/ou local) para continuidade posterior.
4. Finalizar definitivamente para gerar numero de processo sequencial + PDF.
5. Depois de finalizado, o documento nao pode mais ser editado.

## 6. Troubleshooting Rapido

- **403 CSRF:** confirmar uso de `AuthClient.authFetch` nas mutacoes (`POST`/`PUT`).
- **403 acesso:** rota e API aceitam apenas perfil ADMIN.
- **409 ao editar:** documento ja finalizado; somente rascunhos podem ser alterados.
- **PDF nao baixa:** validar se o documento esta em status FINAL.
- **Sintoma:** responsavel TI diferente do usuario logado.
- **Causa provavel:** tentativa de preenchimento manual no frontend antigo.
- **Solucao:** backend ignora valor enviado e grava o nome do usuario autenticado.
- **Sintoma:** login IOB estava usando e-mail comum.
- **Causa provavel:** campo IOB nao separado no formulario.
- **Solucao:** usar o campo dedicado `Usuario IOB` (separado de `E-mail de usuario`).
