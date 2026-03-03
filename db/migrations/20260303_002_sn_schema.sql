CREATE TABLE IF NOT EXISTS sn_companies (
  id BIGSERIAL PRIMARY KEY,
  cnpj TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sn_companies_cnpj
ON sn_companies (cnpj);

CREATE TABLE IF NOT EXISTS sn_receipts (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES sn_companies(id) ON DELETE CASCADE,
  pa INTEGER NOT NULL,
  pdf BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sn_receipts_company_pa
ON sn_receipts (company_id, pa);

CREATE INDEX IF NOT EXISTS idx_sn_receipts_pa
ON sn_receipts (pa);
