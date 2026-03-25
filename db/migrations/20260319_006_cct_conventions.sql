CREATE TABLE IF NOT EXISTS cct_conventions (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  arquivo_origem TEXT NULL,
  nome TEXT NOT NULL,
  prefixo TEXT NULL,
  numero_registro TEXT NULL,
  numero_solicitacao TEXT NULL,
  data_registro_mte TEXT NULL,
  data_base TEXT NULL,
  data_base_mes TEXT NULL,
  data_base_mes_numero INTEGER NULL,
  data_base_mes_valor TEXT NULL,
  vigencia TEXT NULL,
  vigencia_status TEXT NULL,
  abrangencia TEXT NULL,
  abrangencia_normalized TEXT NULL,
  abrangencia_territorial TEXT NULL,
  abrangencia_territorial_normalized TEXT NULL,
  prazo_oposicao_data TEXT NULL,
  prazo_oposicao_clausula TEXT NULL,
  quantidade_clausulas INTEGER NOT NULL DEFAULT 0,
  quantidade_sindicatos INTEGER NOT NULL DEFAULT 0,
  sindicatos_celebrantes JSONB NOT NULL DEFAULT '[]'::jsonb,
  search_text TEXT NOT NULL DEFAULT '',
  search_digits TEXT NOT NULL DEFAULT '',
  search_cnpj_digits TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sort_timestamp BIGINT NOT NULL DEFAULT 0,
  raw JSONB NOT NULL,
  source_mtime_ms BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cct_conventions_sort
ON cct_conventions (sort_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_cct_conventions_vigencia
ON cct_conventions (vigencia_status);

CREATE INDEX IF NOT EXISTS idx_cct_conventions_data_base_mes
ON cct_conventions (data_base_mes_valor);

CREATE INDEX IF NOT EXISTS idx_cct_conventions_numero_registro
ON cct_conventions (numero_registro);

CREATE INDEX IF NOT EXISTS idx_cct_conventions_numero_solicitacao
ON cct_conventions (numero_solicitacao);

CREATE INDEX IF NOT EXISTS idx_cct_conventions_search_cnpj_digits
ON cct_conventions USING GIN (search_cnpj_digits);
