CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  profile jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id);
CREATE TABLE IF NOT EXISTS chunks (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  start_line integer NOT NULL CHECK (start_line > 0),
  end_line integer NOT NULL CHECK (end_line >= start_line),
  content text NOT NULL,
  embedding vector(1536)
);
CREATE INDEX IF NOT EXISTS chunks_project_idx ON chunks(project_id);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE TABLE IF NOT EXISTS usage (
  id text PRIMARY KEY,
  count integer NOT NULL CHECK (count > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_expiry_idx ON usage(expires_at);
