-- Durable local payment intents and separately unique provider deliveries.
CREATE TABLE IF NOT EXISTS payment_intents (
  intent_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('fixture', 'waffo')),
  provider_checkout_id TEXT UNIQUE,
  provider_order_id TEXT UNIQUE,
  webhook_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('creating', 'open', 'unknown', 'processing', 'paid', 'abandoned', 'rejected', 'needs_reconciliation', 'failed')
  ),
  amount_usd INTEGER NOT NULL CHECK (amount_usd >= 1),
  expected_product_id TEXT,
  success_url TEXT NOT NULL,
  lane TEXT NOT NULL,
  period_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  company_handle TEXT NOT NULL,
  apply_url TEXT NOT NULL,
  salary_min_usd INTEGER,
  salary_max_usd INTEGER,
  bid_usd INTEGER NOT NULL CHECK (bid_usd >= 1),
  payer_id TEXT NOT NULL,
  listing_id TEXT,
  provider_status TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS payment_intents_provider_idx
  ON payment_intents (provider, provider_checkout_id);

CREATE TABLE IF NOT EXISTS payment_webhook_deliveries (
  webhook_id TEXT PRIMARY KEY,
  provider_checkout_id TEXT,
  provider_order_id TEXT NOT NULL,
  intent_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('processing', 'applied', 'rejected', 'failed')
  ),
  error_code TEXT,
  received_at TEXT NOT NULL,
  applied_at TEXT
);

CREATE INDEX IF NOT EXISTS payment_webhook_intent_idx
  ON payment_webhook_deliveries (intent_id);
