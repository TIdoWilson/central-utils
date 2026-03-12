ALTER TABLE office_companies
  ADD COLUMN IF NOT EXISTS regime_tributario_atual TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_office_companies_regime_tributario_atual
ON office_companies (regime_tributario_atual);
