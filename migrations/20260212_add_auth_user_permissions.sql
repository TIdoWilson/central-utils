-- v3.1 RBAC por ferramenta
CREATE TABLE IF NOT EXISTS auth_user_permissions (
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  perm TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, perm)
);

CREATE INDEX IF NOT EXISTS idx_auth_user_permissions_perm
  ON auth_user_permissions (perm);
