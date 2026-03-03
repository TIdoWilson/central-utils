CREATE TABLE IF NOT EXISTS auth_users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_user_permissions (
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  perm TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, perm)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL,
  email TEXT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  meta JSONB NULL,
  ip TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_change_requests (
  id BIGSERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  requester_full_name TEXT NOT NULL,
  requester_login TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  change_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  email_sent_at TIMESTAMPTZ NULL,
  email_error TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_change_requests_status_created_at
ON company_change_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS company_include_exclude_requests (
  id BIGSERIAL PRIMARY KEY,
  request_type TEXT NOT NULL,
  company_name TEXT NOT NULL,
  requester_full_name TEXT NOT NULL,
  requester_login TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  request_details TEXT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  completed_at TIMESTAMPTZ NULL,
  email_sent_at TIMESTAMPTZ NULL,
  email_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE company_include_exclude_requests
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE company_include_exclude_requests
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;
ALTER TABLE company_include_exclude_requests
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ NULL;
ALTER TABLE company_include_exclude_requests
  ADD COLUMN IF NOT EXISTS email_error TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_company_include_exclude_requests_type_created_at
ON company_include_exclude_requests (request_type, created_at DESC);

CREATE TABLE IF NOT EXISTS checklist_ti_user_creation_forms (
  id BIGSERIAL PRIMARY KEY,
  process_number TEXT NULL,
  process_seq BIGINT NULL,
  request_date DATE NULL,
  employee_name TEXT NOT NULL,
  cpf TEXT NULL,
  department TEXT NULL,
  it_responsible TEXT NULL,
  system_user_email TEXT NOT NULL,
  user_iob_login TEXT NULL,
  system_passwords JSONB NOT NULL DEFAULT '{}'::jsonb,
  provisional_password TEXT NULL,
  machine_name TEXT NULL,
  shared_folders_released BOOLEAN NOT NULL DEFAULT false,
  printers_configured BOOLEAN NOT NULL DEFAULT false,
  email_signature_standardized BOOLEAN NOT NULL DEFAULT false,
  observations TEXT NULL,
  is_final BOOLEAN NOT NULL DEFAULT false,
  finalized_at TIMESTAMPTZ NULL,
  pdf_bytes BYTEA NOT NULL,
  pdf_filename TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE checklist_ti_user_creation_forms
  ADD COLUMN IF NOT EXISTS process_seq BIGINT NULL;
ALTER TABLE checklist_ti_user_creation_forms
  ADD COLUMN IF NOT EXISTS system_passwords JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE checklist_ti_user_creation_forms
  ADD COLUMN IF NOT EXISTS user_iob_login TEXT NULL;
ALTER TABLE checklist_ti_user_creation_forms
  ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE checklist_ti_user_creation_forms
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_ti_user_creation_forms_updated_at
ON checklist_ti_user_creation_forms (updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_ti_user_creation_forms_process_seq
ON checklist_ti_user_creation_forms (process_seq)
WHERE process_seq IS NOT NULL;
