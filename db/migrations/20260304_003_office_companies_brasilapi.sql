CREATE TABLE IF NOT EXISTS office_companies (
  id BIGSERIAL PRIMARY KEY,
  cnpj CHAR(14) NOT NULL UNIQUE,
  razao_social TEXT NULL,
  nome_fantasia TEXT NULL,
  situacao_cadastral TEXT NULL,
  data_inicio_atividade DATE NULL,
  natureza_juridica TEXT NULL,
  porte TEXT NULL,
  capital_social NUMERIC(18,2) NULL,
  email TEXT NULL,
  ddd_telefone_1 TEXT NULL,
  ddd_telefone_2 TEXT NULL,
  logradouro TEXT NULL,
  numero TEXT NULL,
  complemento TEXT NULL,
  bairro TEXT NULL,
  municipio TEXT NULL,
  uf VARCHAR(4) NULL,
  cep TEXT NULL,
  atividade_principal_codigo VARCHAR(10) NULL,
  atividade_principal_descricao TEXT NULL,
  raw_response JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS office_company_partners (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES office_companies(id) ON DELETE CASCADE,
  partner_name TEXT NOT NULL,
  qualification TEXT NULL,
  country TEXT NULL,
  legal_representative TEXT NULL,
  age_range TEXT NULL,
  update_date DATE NULL
);

CREATE TABLE IF NOT EXISTS office_company_cnaes (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES office_companies(id) ON DELETE CASCADE,
  code VARCHAR(10) NOT NULL,
  description TEXT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_office_companies_razao_social
ON office_companies (LOWER(razao_social));

CREATE INDEX IF NOT EXISTS idx_office_companies_nome_fantasia
ON office_companies (LOWER(nome_fantasia));

CREATE INDEX IF NOT EXISTS idx_office_companies_situacao
ON office_companies (situacao_cadastral);

CREATE INDEX IF NOT EXISTS idx_office_companies_uf
ON office_companies (uf);

CREATE INDEX IF NOT EXISTS idx_office_companies_updated_at
ON office_companies (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_company_partners_company_id
ON office_company_partners (company_id);

CREATE INDEX IF NOT EXISTS idx_office_company_partners_partner_name
ON office_company_partners (LOWER(partner_name));

CREATE INDEX IF NOT EXISTS idx_office_company_cnaes_company_id
ON office_company_cnaes (company_id);

CREATE INDEX IF NOT EXISTS idx_office_company_cnaes_code
ON office_company_cnaes (code);
