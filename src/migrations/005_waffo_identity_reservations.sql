-- Reserve each signed Waffo identity, including the local immutable intent,
-- before any rejected, reconciled, or accepted outcome can be retried with
-- changed provider facts.
CREATE TABLE IF NOT EXISTS waffo_identity_reservations (
  identity_type TEXT NOT NULL CHECK (
    identity_type IN ('intent', 'delivery', 'event', 'payment', 'order')
  ),
  identity_value TEXT NOT NULL,
  intent_id TEXT,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  payment_id TEXT,
  order_id TEXT,
  raw_body_hash TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (identity_type, identity_value)
);

CREATE INDEX IF NOT EXISTS waffo_identity_reservations_intent_idx
  ON waffo_identity_reservations (intent_id);

INSERT OR IGNORE INTO waffo_identity_reservations (
  identity_type, identity_value, intent_id, event_type, event_id,
  delivery_id, payment_id, order_id, raw_body_hash, event_fingerprint,
  outcome, reason, created_at
)
SELECT 'delivery', delivery_id, intent_id, event_type, event_id,
       delivery_id, payment_id, order_id, raw_body_hash,
       event_fingerprint, outcome, reason, received_at
FROM waffo_webhook_deliveries;

INSERT OR IGNORE INTO waffo_identity_reservations (
  identity_type, identity_value, intent_id, event_type, event_id,
  delivery_id, payment_id, order_id, raw_body_hash, event_fingerprint,
  outcome, reason, created_at
)
SELECT 'event', event_type || ':' || event_id, intent_id, event_type,
       event_id, COALESCE(intent_id, event_id), payment_id, order_id,
       raw_body_hash, event_fingerprint, status, reason, created_at
FROM waffo_business_events;

INSERT OR IGNORE INTO waffo_identity_reservations (
  identity_type, identity_value, intent_id, event_type, event_id,
  delivery_id, payment_id, order_id, raw_body_hash, event_fingerprint,
  outcome, reason, created_at
)
SELECT 'payment', payment_id, intent_id, event_type, event_id,
       COALESCE(intent_id, event_id), payment_id, order_id,
       raw_body_hash, event_fingerprint, status, reason, created_at
FROM waffo_business_events;

INSERT OR IGNORE INTO waffo_identity_reservations (
  identity_type, identity_value, intent_id, event_type, event_id,
  delivery_id, payment_id, order_id, raw_body_hash, event_fingerprint,
  outcome, reason, created_at
)
SELECT 'order', order_id, intent_id, event_type, event_id,
       COALESCE(intent_id, event_id), payment_id, order_id,
       raw_body_hash, event_fingerprint, status, reason, created_at
FROM waffo_business_events;
