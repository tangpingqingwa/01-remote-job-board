import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { isMemoryDatabasePath } from "../payments/env";
import { isProductionRuntime } from "./runtime";

export type DatabaseEnv = Record<string, string | undefined>;
export type BoardDatabase = Database.Database;

type Migration = {
  version: number;
  sql: string;
};

/**
 * Tests and local callers without DATABASE_PATH stay isolated in memory. A
 * deployed process must set DATABASE_PATH to a shared SQLite file so every
 * request and instance observes the same paid board.
 */
export function resolveDatabasePath(
  explicitPath?: string,
  env: DatabaseEnv = process.env,
): string {
  return explicitPath?.trim() || env.DATABASE_PATH?.trim() || ":memory:";
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
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
    `,
  },
  {
    version: 2,
    sql: "ALTER TABLE listings ADD COLUMN payer_id TEXT;",
  },
  {
    version: 3,
    sql: `
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
    `,
  },
  {
    version: 4,
    sql: `
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
    `,
  },
  {
    version: 5,
    sql: `
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
    `,
  },
];

function isMemoryDatabase(databasePath: string): boolean {
  return databasePath === ":memory:" || databasePath.startsWith("file::memory:");
}

function ensureDatabaseDirectory(databasePath: string): void {
  if (isMemoryDatabase(databasePath) || databasePath.startsWith("file:")) {
    return;
  }
  mkdirSync(dirname(databasePath), { recursive: true });
}

function isDatabaseBusy(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return error.code === "SQLITE_BUSY" || error.code === "SQLITE_LOCKED";
}

function waitForDatabase(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function hasColumn(db: BoardDatabase, table: string, column: string): boolean {
  const columns = db
    .prepare<[], { name: string }>(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return columns.some((item) => item.name === column);
}

function applyMigrations(db: BoardDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  for (const migration of MIGRATIONS) {
    const apply = db.transaction((item: Migration) => {
      const applied = db
        .prepare<[number], { version: number }>(
          "SELECT version FROM schema_migrations WHERE version = ?",
        )
        .get(item.version);
      if (applied) return;

      // Migration 2 is safe for a database created by an older checkout that
      // has the column but no migration ledger entry.
      if (item.version === 2 && hasColumn(db, "listings", "payer_id")) {
        db.prepare(
          "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        ).run(item.version, new Date().toISOString());
        return;
      }

      db.exec(item.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      ).run(item.version, new Date().toISOString());
    });
    apply.immediate(migration);
  }
}

/** Open the shared board database and apply all checked-in migrations. */
export function openBoardDatabase(
  explicitPath?: string,
  env: DatabaseEnv = process.env,
): BoardDatabase {
  const databasePath = resolveDatabasePath(explicitPath, env);
  if (isProductionRuntime(env) && isMemoryDatabasePath(databasePath)) {
    throw new Error("BLOCKED-CONFIG: DATABASE_PATH");
  }
  ensureDatabaseDirectory(databasePath);
  const deadline = Date.now() + 5_000;
  let retryDelay = 10;

  for (;;) {
    let db: BoardDatabase | undefined;
    try {
      db = new Database(databasePath, { timeout: 5_000 });
      db.pragma("busy_timeout = 5000");
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
      db.pragma("foreign_keys = ON");
      applyMigrations(db);
      return db;
    } catch (error) {
      if (db?.open) {
        try {
          db.close();
        } catch {
          // Preserve the initialization error; a failed handle is discarded.
        }
      }
      if (!isDatabaseBusy(error) || Date.now() >= deadline) throw error;
      waitForDatabase(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 200);
    }
  }
}
