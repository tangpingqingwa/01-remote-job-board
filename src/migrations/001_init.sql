-- v1 listing storage. `payer_id` is added by 002_add_payer_id.sql.
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL,
  lane TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  company_handle TEXT NOT NULL,
  apply_url TEXT NOT NULL,
  salary_min_usd INTEGER,
  salary_max_usd INTEGER,
  bid_usd INTEGER NOT NULL CHECK (bid_usd >= 1),
  paid_usd INTEGER NOT NULL DEFAULT 0 CHECK (paid_usd >= 0),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (period_id, lane, apply_url),
  UNIQUE (period_id, lane, company_handle)
);

CREATE INDEX IF NOT EXISTS listings_live_idx
  ON listings (lane, created_at, paid_usd);
