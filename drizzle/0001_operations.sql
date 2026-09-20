CREATE TABLE IF NOT EXISTS operations (
  project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  lease_id text NOT NULL,
  expires_at timestamptz NOT NULL
);
