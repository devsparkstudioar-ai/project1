-- METRO Courier & Logistics — database schema
-- Run automatically by `npm run migrate` (server/src/migrate.js)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- app_storage
--
-- The React app keeps every business record (bookings, branches, service
-- places, ID counters, etc.) as one JSON document per logical "key" — the
-- same shape it used to save to browser localStorage. Rather than force a
-- second, riskier rewrite of the whole booking/dispatch/report engine, this
-- table gives that exact same get/set/delete/list contract a real,
-- multi-user, durable home in PostgreSQL. Every branch counter, every
-- booking list, every service-place list is a row here — inspectable with
-- plain SQL any time you want to query it directly.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_storage (
  storage_key   TEXT NOT NULL,
  scope         TEXT NOT NULL DEFAULT 'shared',   -- 'shared' (company-wide) or 'personal'
  value         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (storage_key, scope)
);

CREATE INDEX IF NOT EXISTS idx_app_storage_prefix ON app_storage (scope, storage_key text_pattern_ops);

-- ---------------------------------------------------------------------------
-- app_files
--
-- Binary/file storage in the database (logos, POD photos, signed waybills,
-- ID proofs, etc.) so uploads aren't scattered on disk and travel with the
-- rest of the data if the server ever moves host.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  data          BYTEA NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
