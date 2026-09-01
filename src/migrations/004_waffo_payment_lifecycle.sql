-- Waffo lifecycle ledger. Polar's compatibility tables remain untouched; the
-- Waffo tables are the only tables used by the production payment boundary.
CREATE TABLE IF NOT EXISTS waffo_payment_intents (
  intent_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('fixture', 'waffo')),
  mode TEXT NOT NULL CHECK (mode IN ('fixture', 'waffo-test', 'waffo-prod')),
  fingerprint TEXT NOT NULL,
  normalized_payload TEXT NOT NULL,
  normalized_payload_hash TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  tax_category TEXT NOT NULL CHECK (tax_category = 'digital_goods'),
  period_id TEXT NOT NULL,
  lane TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  company_handle TEXT NOT NULL,
  apply_url TEXT NOT NULL,
  salary_min_usd INTEGER,
  salary_max_usd INTEGER,
  payer_id TEXT NOT NULL,
  target_bid_cents INTEGER NOT NULL CHECK (target_bid_cents >= 500),
  quote_base_bid_cents INTEGER NOT NULL CHECK (quote_base_bid_cents >= 0),
  charge_cents INTEGER NOT NULL CHECK (charge_cents >= 100),
  amount_usd INTEGER NOT NULL CHECK (amount_usd >= 1),
  success_url TEXT NOT NULL,
  provider_checkout_id TEXT UNIQUE,
  checkout_url TEXT,
  checkout_expires_at TEXT,
  provider_order_id TEXT UNIQUE,
  payment_id TEXT UNIQUE,
  delivery_id TEXT UNIQUE,
  listing_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN (
      'creating', 'open', 'unknown', 'processing', 'paid',
      'rejected', 'needs_reconciliation', 'abandoned', 'failed'
    )
  ),
  provider_status TEXT,
  last_error TEXT,
  first_paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS waffo_payment_intents_checkout_idx
  ON waffo_payment_intents (provider, provider_checkout_id);
CREATE INDEX IF NOT EXISTS waffo_payment_intents_identity_idx
  ON waffo_payment_intents (lane, apply_url, company_handle, status);

CREATE TABLE IF NOT EXISTS waffo_checkout_events (
  checkout_event_id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL UNIQUE,
  provider_checkout_id TEXT UNIQUE,
  checkout_url TEXT,
  expires_at TEXT,
  status TEXT NOT NULL,
  outcome TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (intent_id) REFERENCES waffo_payment_intents(intent_id)
);

CREATE TABLE IF NOT EXISTS waffo_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  intent_id TEXT,
  raw_body_hash TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('processing', 'applied', 'rejected', 'needs_reconciliation')
  ),
  outcome TEXT NOT NULL,
  reason TEXT,
  provider_timestamp TEXT,
  received_at TEXT NOT NULL,
  applied_at TEXT,
  last_replay_hash TEXT,
  UNIQUE (event_type, event_id),
  UNIQUE (payment_id),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS waffo_webhook_intent_idx
  ON waffo_webhook_deliveries (intent_id);

CREATE TABLE IF NOT EXISTS waffo_business_events (
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payment_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL UNIQUE,
  intent_id TEXT,
  raw_body_hash TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_type, event_id)
);

CREATE TABLE IF NOT EXISTS waffo_webhook_replays (
  replay_id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payment_id TEXT,
  order_id TEXT,
  intent_id TEXT,
  raw_body_hash TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL,
  reason TEXT NOT NULL,
  received_at TEXT NOT NULL
);
