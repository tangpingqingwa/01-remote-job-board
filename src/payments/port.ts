import { createHash, randomUUID } from "node:crypto";
import {
  openBoardDatabase,
  type BoardDatabase,
} from "../lib/db";
import type { Listing } from "../lib/types";
import { CheckoutError, type ListingDraft } from "../lib/listing";
import { MAX_BID_USD, MIN_BID_USD } from "../lib/types";
import { isInRollingWeek } from "../lib/period";
import { defaultBoardStore, type BoardStore } from "../lib/store";
import {
  getPaymentMode,
  isMemoryDatabasePath,
  requireDatabasePath,
  type PaymentEnv,
  type PaymentMode,
} from "./env";
import { isProductionRuntime } from "../lib/runtime";
import { getFakePolarPort } from "./fixture";
import { LiveWaffoPort } from "./waffo";

export { CheckoutError, type ListingDraft };

export type CheckoutStart = {
  checkoutId: string;
  url: string;
  intentId?: string;
};

/** Polar is intentionally absent from this union: it can never be selected. */
export type PaymentProvider = "fixture" | "waffo";

export type CheckoutStatus =
  | "creating"
  | "open"
  | "unknown"
  | "processing"
  | "paid"
  | "abandoned"
  | "rejected"
  | "needs_reconciliation"
  | "failed";

export type CheckoutRecord = {
  checkoutId: string;
  amountUsd: number;
  listingDraft: ListingDraft;
  successUrl: string;
  status: CheckoutStatus;
  listingId?: string;
  intentId?: string;
  provider?: PaymentProvider;
  providerOrderId?: string;
  paymentId?: string;
  webhookId?: string;
  providerStatus?: string;
  errorCode?: string;
};

export type CreateCheckoutInput = {
  amountUsd: number;
  listingDraft: ListingDraft;
  successUrl: string;
};

export type PolarPort = {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart>;
  completeCheckout(checkoutId: string): Promise<Listing | null>;
  abandonCheckout(checkoutId: string): Promise<void>;
  getCheckout(checkoutId: string): CheckoutRecord | undefined;
  /** Read-only lookup for the immutable intent completion page. */
  getPaymentIntent?(intentId: string): PaymentIntent | undefined;
};

export type PaymentIntent = {
  intentId: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  fingerprint: string;
  normalizedPayload: string;
  normalizedPayloadHash: string;
  storeId: string;
  productId: string;
  currency: "USD";
  taxCategory: "digital_goods";
  periodId: string;
  targetBidCents: number;
  quoteBaseBidCents: number;
  chargeCents: number;
  providerCheckoutId?: string;
  checkoutUrl?: string;
  checkoutExpiresAt?: string;
  providerOrderId?: string;
  paymentId?: string;
  webhookId?: string;
  status: CheckoutStatus;
  amountUsd: number;
  expectedProductId?: string;
  successUrl: string;
  listingDraft: ListingDraft;
  listingId?: string;
  providerStatus?: string;
  lastError?: string;
  firstPaidAt?: string;
  createdAt: string;
  updatedAt: string;
};

type PaymentIntentRow = {
  intent_id: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  fingerprint: string;
  normalized_payload: string;
  normalized_payload_hash: string;
  store_id: string;
  product_id: string;
  currency: "USD";
  tax_category: "digital_goods";
  period_id: string;
  target_bid_cents: number;
  quote_base_bid_cents: number;
  charge_cents: number;
  provider_checkout_id: string | null;
  checkout_url: string | null;
  checkout_expires_at: string | null;
  provider_order_id: string | null;
  payment_id: string | null;
  delivery_id: string | null;
  status: CheckoutStatus;
  amount_usd: number;
  success_url: string;
  lane: ListingDraft["lane"];
  title: string;
  company: string;
  company_handle: string;
  apply_url: string;
  salary_min_usd: number | null;
  salary_max_usd: number | null;
  payer_id: string;
  provider_status: string | null;
  last_error: string | null;
  first_paid_at: string | null;
  listing_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WebhookDeliveryStatus =
  | "processing"
  | "applied"
  | "rejected"
  | "needs_reconciliation";

export type WebhookDelivery = {
  webhookId: string;
  eventType: string;
  eventId: string;
  paymentId: string;
  providerOrderId: string;
  intentId?: string;
  rawBodyHash: string;
  eventFingerprint: string;
  status: WebhookDeliveryStatus;
  outcome: string;
  errorCode?: string;
  receivedAt: string;
  providerTimestamp?: string;
  appliedAt?: string;
};

export type WebhookRejectionResult = {
  status: "rejected" | "reconciled" | "duplicate";
  code: string;
  intentId?: string;
};

export type WebhookClaim =
  | { kind: "claimed"; intent: PaymentIntent }
  | { kind: "busy"; intent: PaymentIntent }
  | { kind: "duplicate"; intent?: PaymentIntent; delivery: WebhookDelivery }
  | { kind: "rejected"; code: string; intent?: PaymentIntent };

export type WaffoEventData = Record<string, unknown>;

export type WaffoSettlementEvent = {
  id: string;
  timestamp: string;
  eventType: string;
  eventId: string;
  storeId: string;
  mode: "test" | "prod";
  data: WaffoEventData;
};

export type WaffoSettlementResult =
  | { status: "applied"; code: "paid"; intentId: string; listing: Listing }
  | { status: "duplicate"; code: string; intentId?: string; listing?: Listing }
  | { status: "reconciled"; code: "needs_reconciliation"; intentId: string }
  | { status: "rejected"; code: string; intentId?: string }
  | { status: "busy"; code: "processing"; intentId?: string };

type WaffoDeliveryRow = {
  delivery_id: string;
  event_type: string;
  event_id: string;
  payment_id: string;
  order_id: string;
  intent_id: string | null;
  raw_body_hash: string;
  event_fingerprint: string;
  status: WebhookDeliveryStatus;
  outcome: string;
  reason: string | null;
  provider_timestamp: string | null;
  received_at: string;
  applied_at: string | null;
  last_replay_hash: string | null;
};

type IdentityReservationRow = {
  identity_type: "intent" | "delivery" | "event" | "payment" | "order";
  identity_value: string;
  intent_id: string | null;
  event_type: string;
  event_id: string;
  delivery_id: string;
  payment_id: string | null;
  order_id: string | null;
  raw_body_hash: string;
  event_fingerprint: string;
  outcome: string;
  reason: string | null;
  created_at: string;
};

type ListingRow = {
  id: string;
  period_id: string;
  lane: ListingDraft["lane"];
  title: string;
  company: string;
  company_handle: string;
  apply_url: string;
  salary_min_usd: number | null;
  salary_max_usd: number | null;
  bid_usd: number;
  paid_usd: number;
  clicks: number;
  created_at: string;
  updated_at: string;
  payer_id: string | null;
};

const PAYMENT_INTENT_COLUMNS = `
  intent_id, provider, mode, fingerprint, normalized_payload,
  normalized_payload_hash, store_id, product_id, currency, tax_category,
  period_id, target_bid_cents, quote_base_bid_cents, charge_cents,
  provider_checkout_id, checkout_url, checkout_expires_at, provider_order_id,
  payment_id, delivery_id, status, amount_usd, success_url, lane, title,
  company, company_handle, apply_url, salary_min_usd, salary_max_usd,
  payer_id, provider_status, last_error, first_paid_at, listing_id,
  created_at, updated_at
`;

const LISTING_COLUMNS = `
  id, period_id, lane, title, company, company_handle, apply_url,
  salary_min_usd, salary_max_usd, bid_usd, paid_usd, clicks, created_at,
  updated_at, payer_id
`;

function rowToPaymentIntent(row: PaymentIntentRow): PaymentIntent {
  return {
    intentId: row.intent_id,
    provider: row.provider,
    mode: row.mode,
    fingerprint: row.fingerprint,
    normalizedPayload: row.normalized_payload,
    normalizedPayloadHash: row.normalized_payload_hash,
    storeId: row.store_id,
    productId: row.product_id,
    currency: row.currency,
    taxCategory: row.tax_category,
    periodId: row.period_id,
    targetBidCents: row.target_bid_cents,
    quoteBaseBidCents: row.quote_base_bid_cents,
    chargeCents: row.charge_cents,
    ...(row.provider_checkout_id === null ? {} : { providerCheckoutId: row.provider_checkout_id }),
    ...(row.checkout_url === null ? {} : { checkoutUrl: row.checkout_url }),
    ...(row.checkout_expires_at === null ? {} : { checkoutExpiresAt: row.checkout_expires_at }),
    ...(row.provider_order_id === null ? {} : { providerOrderId: row.provider_order_id }),
    ...(row.payment_id === null ? {} : { paymentId: row.payment_id }),
    ...(row.delivery_id === null ? {} : { webhookId: row.delivery_id }),
    status: row.status,
    amountUsd: row.amount_usd,
    expectedProductId: row.product_id,
    successUrl: row.success_url,
    listingDraft: {
      periodId: row.period_id,
      lane: row.lane,
      title: row.title,
      company: row.company,
      companyHandle: row.company_handle,
      applyUrl: row.apply_url,
      salary: row.salary_min_usd === null || row.salary_max_usd === null
        ? null
        : { minUsd: row.salary_min_usd, maxUsd: row.salary_max_usd },
      bidUsd: row.target_bid_cents / 100,
      payerId: row.payer_id,
    },
    ...(row.listing_id === null ? {} : { listingId: row.listing_id }),
    ...(row.provider_status === null ? {} : { providerStatus: row.provider_status }),
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
    ...(row.first_paid_at === null ? {} : { firstPaidAt: row.first_paid_at }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToListing(row: ListingRow): Listing {
  return {
    id: row.id,
    periodId: row.period_id,
    lane: row.lane,
    title: row.title,
    company: row.company,
    companyHandle: row.company_handle,
    applyUrl: row.apply_url,
    salary: row.salary_min_usd === null || row.salary_max_usd === null
      ? null
      : { minUsd: row.salary_min_usd, maxUsd: row.salary_max_usd },
    bidUsd: row.bid_usd,
    paidUsd: row.paid_usd,
    clicks: row.clicks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.payer_id === null ? {} : { payerId: row.payer_id }),
  };
}

function rowToDelivery(row: WaffoDeliveryRow): WebhookDelivery {
  return {
    webhookId: row.delivery_id,
    eventType: row.event_type,
    eventId: row.event_id,
    paymentId: row.payment_id,
    providerOrderId: row.order_id,
    ...(row.intent_id === null ? {} : { intentId: row.intent_id }),
    rawBodyHash: row.raw_body_hash,
    eventFingerprint: row.event_fingerprint,
    status: row.status,
    outcome: row.outcome,
    ...(row.reason === null ? {} : { errorCode: row.reason }),
    receivedAt: row.received_at,
    ...(row.provider_timestamp === null ? {} : { providerTimestamp: row.provider_timestamp }),
    ...(row.applied_at === null ? {} : { appliedAt: row.applied_at }),
  };
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function checkoutRecordFromIntent(intent: PaymentIntent): CheckoutRecord {
  return {
    checkoutId: intent.providerCheckoutId ?? intent.intentId,
    amountUsd: intent.amountUsd,
    listingDraft: { ...intent.listingDraft },
    successUrl: intent.successUrl,
    status: intent.status,
    ...(intent.listingId === undefined ? {} : { listingId: intent.listingId }),
    intentId: intent.intentId,
    provider: intent.provider,
    ...(intent.providerOrderId === undefined ? {} : { providerOrderId: intent.providerOrderId }),
    ...(intent.paymentId === undefined ? {} : { paymentId: intent.paymentId }),
    ...(intent.webhookId === undefined ? {} : { webhookId: intent.webhookId }),
    ...(intent.providerStatus === undefined ? {} : { providerStatus: intent.providerStatus }),
    ...(intent.lastError === undefined ? {} : { errorCode: intent.lastError }),
  };
}

/** Durable intent, checkout, delivery, and settlement ledger. */
export class PaymentIntentStore {
  readonly databasePath: string;
  private readonly db: BoardDatabase;

  constructor(databasePath?: string) {
    const configuredPath = databasePath?.trim();
    if (configuredPath) {
      if (isProductionRuntime() && isMemoryDatabasePath(configuredPath)) {
        throw new Error("BLOCKED-CONFIG: DATABASE_PATH");
      }
      this.databasePath = configuredPath;
    } else {
      this.databasePath = requireDatabasePath();
    }
    this.db = openBoardDatabase(this.databasePath);
  }

  private transaction<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  private getRow(intentId: string): PaymentIntentRow | undefined {
    return this.db.prepare<[string], PaymentIntentRow>(
      `SELECT ${PAYMENT_INTENT_COLUMNS} FROM waffo_payment_intents WHERE intent_id = ? LIMIT 1`,
    ).get(intentId);
  }

  getByIntentId(intentId: string): PaymentIntent | undefined {
    const row = this.getRow(intentId);
    return row ? rowToPaymentIntent(row) : undefined;
  }

  getLatestIntent(): PaymentIntent | undefined {
    const row = this.db.prepare<[], PaymentIntentRow>(
      `SELECT ${PAYMENT_INTENT_COLUMNS}
       FROM waffo_payment_intents
       ORDER BY created_at DESC, intent_id DESC LIMIT 1`,
    ).get();
    return row ? rowToPaymentIntent(row) : undefined;
  }

  getByCheckoutId(provider: PaymentProvider | "polar", providerCheckoutId: string): PaymentIntent | undefined {
    const canonicalProvider: PaymentProvider = provider === "polar" ? "waffo" : provider;
    const row = this.db.prepare<[PaymentProvider, string], PaymentIntentRow>(
      `SELECT ${PAYMENT_INTENT_COLUMNS}
       FROM waffo_payment_intents
       WHERE provider = ? AND provider_checkout_id = ? LIMIT 1`,
    ).get(canonicalProvider, providerCheckoutId);
    return row ? rowToPaymentIntent(row) : undefined;
  }

  getDelivery(webhookId: string): WebhookDelivery | undefined {
    const row = this.db.prepare<[string], WaffoDeliveryRow>(
      `SELECT delivery_id, event_type, event_id, payment_id, order_id,
              intent_id, raw_body_hash, event_fingerprint, status, outcome,
              reason, provider_timestamp, received_at, applied_at,
              last_replay_hash
       FROM waffo_webhook_deliveries WHERE delivery_id = ? LIMIT 1`,
    ).get(webhookId);
    return row ? rowToDelivery(row) : undefined;
  }

  /** Number of immutable provider replay/rejection audit records. */
  getReplayCount(): number {
    const row = this.db.prepare<[], { count: number }>(
      "SELECT COUNT(*) AS count FROM waffo_webhook_replays",
    ).get();
    return row?.count ?? 0;
  }

  create(input: {
    provider: PaymentProvider;
    amountUsd: number;
    listingDraft: ListingDraft;
    successUrl: string;
    expectedProductId?: string;
    intentId?: string;
    mode?: PaymentMode;
    storeId?: string;
    productId?: string;
    targetBidCents?: number;
    quoteBaseBidCents?: number;
    chargeCents?: number;
    fingerprint?: string;
    normalizedPayload?: string;
  }): PaymentIntent {
    const intentId = input.intentId?.trim() || `intent_${randomUUID()}`;
    const targetBidCents = input.targetBidCents ?? Math.round(input.listingDraft.bidUsd * 100);
    const chargeCents = input.chargeCents ?? Math.round(input.amountUsd * 100);
    const quoteBaseBidCents = input.quoteBaseBidCents ?? Math.max(0, targetBidCents - chargeCents);
    const mode = input.mode ?? (input.provider === "fixture" ? "fixture" : "waffo-test");
    const storeId = input.storeId ?? (input.provider === "fixture" ? "fixture" : "unknown");
    const productId = input.productId ?? input.expectedProductId ?? (input.provider === "fixture" ? "fixture" : "unknown");
    const normalizedPayload = input.normalizedPayload ?? stableJson({
      applyUrl: input.listingDraft.applyUrl,
      company: input.listingDraft.company,
      companyHandle: input.listingDraft.companyHandle,
      lane: input.listingDraft.lane,
      payerId: input.listingDraft.payerId,
      periodId: input.listingDraft.periodId,
      quoteBaseBidCents,
      targetBidCents,
      title: input.listingDraft.title,
    });
    const normalizedPayloadHash = sha256(normalizedPayload);
    const fingerprint = input.fingerprint ?? normalizedPayloadHash;
    const now = new Date().toISOString();
    const status: CheckoutStatus = input.provider === "fixture" ? "open" : "creating";
    this.transaction(() => {
      this.db.prepare(
        `INSERT INTO waffo_payment_intents (
          intent_id, provider, mode, fingerprint, normalized_payload,
          normalized_payload_hash, store_id, product_id, currency,
          tax_category, period_id, lane, title, company, company_handle,
          apply_url, salary_min_usd, salary_max_usd, payer_id,
          target_bid_cents, quote_base_bid_cents, charge_cents, amount_usd,
          success_url, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', 'digital_goods', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      ).run(
        intentId,
        input.provider,
        mode,
        fingerprint,
        normalizedPayload,
        normalizedPayloadHash,
        storeId,
        productId,
        input.listingDraft.periodId,
        input.listingDraft.lane,
        input.listingDraft.title,
        input.listingDraft.company,
        input.listingDraft.companyHandle,
        input.listingDraft.applyUrl,
        input.listingDraft.salary?.minUsd ?? null,
        input.listingDraft.salary?.maxUsd ?? null,
        input.listingDraft.payerId,
        targetBidCents,
        quoteBaseBidCents,
        chargeCents,
        Math.round(chargeCents / 100),
        input.successUrl,
        status,
        now,
        now,
      );
      this.db.prepare(
        `INSERT INTO waffo_checkout_events (
          checkout_event_id, intent_id, provider_checkout_id, checkout_url,
          expires_at, status, outcome, error_code, created_at, updated_at
        ) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, ?)`,
      ).run(`checkout_${intentId}`, intentId, status, now, now);
    });
    const intent = this.getByIntentId(intentId);
    if (!intent) throw new Error(`payment intent missing after insert: ${intentId}`);
    return intent;
  }

  attachCheckout(
    intentId: string,
    providerCheckoutId: string,
    checkoutUrl?: string,
    expiresAt?: string,
  ): PaymentIntent {
    const now = new Date().toISOString();
    this.transaction(() => {
      const result = this.db.prepare<[string, string | null, string | null, string, string, string]>(
        `UPDATE waffo_payment_intents
         SET provider_checkout_id = ?, checkout_url = COALESCE(?, checkout_url),
             checkout_expires_at = COALESCE(?, checkout_expires_at),
             status = CASE WHEN status = 'creating' THEN 'open' ELSE status END,
             updated_at = ?
         WHERE intent_id = ?
           AND (provider_checkout_id IS NULL OR provider_checkout_id = ?)`,
      ).run(providerCheckoutId, checkoutUrl ?? null, expiresAt ?? null, now, intentId, providerCheckoutId);
      if (result.changes === 0) throw new Error(`provider checkout already belongs to another intent: ${providerCheckoutId}`);
      this.db.prepare(
        `UPDATE waffo_checkout_events
         SET provider_checkout_id = ?, checkout_url = ?, expires_at = ?,
             status = 'open', updated_at = ? WHERE intent_id = ?`,
      ).run(providerCheckoutId, checkoutUrl ?? null, expiresAt ?? null, now, intentId);
    });
    const intent = this.getByIntentId(intentId);
    if (!intent) throw new Error(`payment intent not found: ${intentId}`);
    return intent;
  }

  markProviderStatus(intentId: string, providerStatus: string, lastError?: string): PaymentIntent | undefined {
    const now = new Date().toISOString();
    this.db.prepare<[string, string | null, string, string]>(
      `UPDATE waffo_payment_intents SET provider_status = ?, last_error = ?, updated_at = ? WHERE intent_id = ?`,
    ).run(providerStatus, lastError ?? null, now, intentId);
    return this.getByIntentId(intentId);
  }

  markStatus(intentId: string, status: CheckoutStatus, lastError?: string): PaymentIntent | undefined {
    const now = new Date().toISOString();
    this.db.prepare<[CheckoutStatus, string | null, string, string]>(
      `UPDATE waffo_payment_intents SET status = ?, last_error = ?, updated_at = ? WHERE intent_id = ?`,
    ).run(status, lastError ?? null, now, intentId);
    this.db.prepare<[CheckoutStatus, string | null, string, string]>(
      `UPDATE waffo_checkout_events SET status = ?, error_code = ?, updated_at = ? WHERE intent_id = ?`,
    ).run(status, lastError ?? null, now, intentId);
    return this.getByIntentId(intentId);
  }

  markFailed(intentId: string, errorCode: string): PaymentIntent | undefined {
    return this.markStatus(intentId, "failed", errorCode);
  }

  markAbandoned(intentId: string): PaymentIntent | undefined {
    const now = new Date().toISOString();
    this.db.prepare<[string, string]>(
      `UPDATE waffo_payment_intents SET status = 'abandoned', updated_at = ?
       WHERE intent_id = ? AND status IN ('open', 'creating')`,
    ).run(now, intentId);
    return this.getByIntentId(intentId);
  }

  markFixturePaid(input: { intentId: string; providerCheckoutId: string; listingId: string }): PaymentIntent | undefined {
    return this.transaction(() => {
      const intent = this.getByIntentId(input.intentId);
      if (!intent || intent.provider !== "fixture") return intent;
      if (intent.status === "paid") return intent;
      if (intent.status !== "open") return intent;
      const now = new Date().toISOString();
      const orderId = `fixture_order_${input.providerCheckoutId}`;
      const deliveryId = `fixture_delivery_${input.providerCheckoutId}`;
      this.db.prepare(
        `UPDATE waffo_payment_intents
         SET status = 'paid', provider_order_id = ?, payment_id = ?,
             delivery_id = ?, listing_id = ?, provider_status = 'paid',
             first_paid_at = COALESCE(first_paid_at, ?), last_error = NULL,
             updated_at = ? WHERE intent_id = ? AND status = 'open'`,
      ).run(orderId, orderId, deliveryId, input.listingId, now, now, input.intentId);
      this.db.prepare(
        `UPDATE waffo_checkout_events SET status = 'paid', outcome = 'paid', updated_at = ? WHERE intent_id = ?`,
      ).run(now, input.intentId);
      this.db.prepare(
        `INSERT OR IGNORE INTO waffo_webhook_deliveries
          (delivery_id,event_type,event_id,payment_id,order_id,intent_id,
           raw_body_hash,event_fingerprint,status,outcome,reason,
           provider_timestamp,received_at,applied_at,last_replay_hash)
         VALUES (?, 'fixture.completed', ?, ?, ?, ?, '', '', 'applied', 'paid', NULL, ?, ?, ?, NULL)`,
      ).run(deliveryId, orderId, orderId, orderId, input.intentId, now, now, now);
      return this.getByIntentId(input.intentId);
    });
  }

  /** Compatibility claim API; Waffo settlement uses settleWaffoEvent atomically. */
  claimWebhook(input: { webhookId: string; providerCheckoutId: string; providerOrderId: string }): WebhookClaim {
    return this.transaction(() => {
      const existing = this.getDelivery(input.webhookId);
      if (existing) {
        const intent = existing.intentId ? this.getByIntentId(existing.intentId) : undefined;
        if (existing.status === "processing" && intent) return { kind: "busy", intent };
        return { kind: "duplicate", intent, delivery: existing };
      }
      const intent = this.getByCheckoutId("waffo", input.providerCheckoutId);
      const now = new Date().toISOString();
      if (!intent) return { kind: "rejected", code: "unknown_intent" };
      if (intent.status === "paid" || intent.status === "abandoned" || intent.status === "rejected") {
        return { kind: "rejected", code: "intent_not_open", intent };
      }
      this.db.prepare(
        `INSERT INTO waffo_webhook_deliveries
          (delivery_id,event_type,event_id,payment_id,order_id,intent_id,
           raw_body_hash,event_fingerprint,status,outcome,reason,
           provider_timestamp,received_at,applied_at,last_replay_hash)
         VALUES (?, 'compat', ?, ?, ?, ?, '', '', 'processing', 'processing', NULL, NULL, ?, NULL, NULL)`,
      ).run(input.webhookId, input.providerOrderId, input.providerOrderId, input.providerOrderId, intent.intentId, now);
      this.db.prepare(
        `UPDATE waffo_payment_intents SET status = 'processing', provider_order_id = ?, delivery_id = ?, updated_at = ? WHERE intent_id = ?`,
      ).run(input.providerOrderId, input.webhookId, now, intent.intentId);
      const claimed = this.getByIntentId(intent.intentId);
      return claimed ? { kind: "claimed", intent: claimed } : { kind: "rejected", code: "unknown_intent" };
    });
  }

  private reserveProviderIdentities(input: {
    event: WaffoSettlementEvent;
    intentId?: string;
    paymentId?: string;
    orderId?: string;
    rawBodyHash: string;
    eventFingerprint: string;
    outcome: string;
    reason?: string;
    createdAt: string;
    reserveIntent?: boolean;
  }): { kind: "reserved" | "exact" | "conflict"; row?: IdentityReservationRow } {
    const identities: Array<{ type: IdentityReservationRow["identity_type"]; value: string }> = [
      { type: "delivery", value: input.event.id },
      { type: "event", value: `${input.event.eventType}:${input.event.eventId}` },
    ];
    if (input.paymentId) identities.push({ type: "payment", value: input.paymentId });
    if (input.orderId) identities.push({ type: "order", value: input.orderId });
    if (input.reserveIntent !== false && input.intentId) {
      identities.push({ type: "intent", value: input.intentId });
    }

    const existing = identities.flatMap(({ type, value }) => {
      const row = this.db.prepare<[string, string], IdentityReservationRow>(
        `SELECT identity_type, identity_value, intent_id, event_type, event_id,
                delivery_id, payment_id, order_id, raw_body_hash,
                event_fingerprint, outcome, reason, created_at
         FROM waffo_identity_reservations
         WHERE identity_type = ? AND identity_value = ? LIMIT 1`,
      ).get(type, value);
      return row ? [row] : [];
    });
    const expectedIntentId = input.intentId ?? null;
    const conflict = existing.find((row) =>
      row.raw_body_hash !== input.rawBodyHash
      || row.event_fingerprint !== input.eventFingerprint
      || row.intent_id !== expectedIntentId,
    );
    // Occupy every previously unseen identity even when one incoming identity
    // already belongs to another payload. In particular, a changed delivery
    // must remain unusable for a later fresh payment/order replay.
    for (const { type, value } of identities) {
      if (existing.some((row) => row.identity_type === type && row.identity_value === value)) continue;
      this.db.prepare(
        `INSERT INTO waffo_identity_reservations (
          identity_type, identity_value, intent_id, event_type, event_id,
          delivery_id, payment_id, order_id, raw_body_hash, event_fingerprint,
          outcome, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        type,
        value,
        input.intentId ?? null,
        input.event.eventType,
        input.event.eventId,
        input.event.id,
        input.paymentId ?? null,
        input.orderId ?? null,
        input.rawBodyHash,
        input.eventFingerprint,
        input.outcome,
        input.reason ?? null,
        input.createdAt,
      );
    }
    if (conflict) return { kind: "conflict", row: conflict };
    return existing.length > 0
      ? { kind: "exact", row: existing[0] }
      : { kind: "reserved" };
  }

  private finishIdentityReservations(
    event: WaffoSettlementEvent,
    outcome: string,
    reason?: string,
  ): void {
    this.db.prepare<[string, string | null, string, string]>(
      `UPDATE waffo_identity_reservations
       SET outcome = ?, reason = ?
       WHERE event_type = ? AND event_id = ?`,
    ).run(outcome, reason ?? null, event.eventType, event.eventId);
  }

  rejectWebhook(input: {
    webhookId: string;
    providerCheckoutId?: string;
    providerOrderId?: string;
    intentId?: string;
    code: string;
    event?: WaffoSettlementEvent;
    rawBodyHash?: string;
    eventFingerprint?: string;
    outcome?: "rejected" | "needs_reconciliation";
    /** Parse failures are audited, but must not consume a reusable intent. */
    reserveIntent?: boolean;
  }): WebhookRejectionResult {
    const now = new Date().toISOString();
    const event = input.event;
    const data = event?.data ?? {};
    const actualPaymentId = readProviderIdentifier(data.paymentId);
    const actualOrderId = readProviderIdentifier(data.orderId) ?? readProviderIdentifier(input.providerOrderId);
    const paymentId = actualPaymentId ?? `rejected_payment_${input.webhookId}`;
    const orderId = actualOrderId ?? `rejected_order_${input.webhookId}`;
    const intentId = readProviderIdentifier(input.intentId);
    const reconcile = input.outcome === "needs_reconciliation";
    return this.transaction(() => {
      const existing = this.getDelivery(input.webhookId);
      if (existing) {
        if (event && (input.rawBodyHash !== existing.rawBodyHash || input.eventFingerprint !== existing.eventFingerprint)) {
          // A changed delivery may carry a new payment/order/intent tuple.
          // Reserve those identities before recording the replay so the same
          // tuple cannot be laundered through a later delivery id.
          this.reserveProviderIdentities({
            event,
            intentId,
            paymentId: actualPaymentId,
            orderId: actualOrderId,
            rawBodyHash: input.rawBodyHash ?? "",
            eventFingerprint: input.eventFingerprint ?? "",
            outcome: "rejected",
            reason: "changed_replay",
            createdAt: now,
            reserveIntent: input.reserveIntent,
          });
          this.recordReplay(existing, event, input.rawBodyHash ?? "", input.eventFingerprint ?? "", "changed_replay", now);
          return { status: "rejected", code: "changed_replay", ...(existing.intentId ? { intentId: existing.intentId } : {}) };
        }
        return existing.status === "needs_reconciliation"
          ? { status: "reconciled", code: "needs_reconciliation", ...(existing.intentId ? { intentId: existing.intentId } : {}) }
          : { status: "duplicate", code: existing.outcome, ...(existing.intentId ? { intentId: existing.intentId } : {}) };
      }
      if (event) {
        const reservation = this.reserveProviderIdentities({
          event,
          intentId,
          paymentId: actualPaymentId,
          orderId: actualOrderId,
          rawBodyHash: input.rawBodyHash ?? "",
          eventFingerprint: input.eventFingerprint ?? "",
          outcome: reconcile ? "needs_reconciliation" : "rejected",
          reason: input.code,
          createdAt: now,
          reserveIntent: input.reserveIntent,
        });
        if (reservation.kind === "conflict") {
          this.recordReplay(
            undefined,
            event,
            input.rawBodyHash ?? "",
            input.eventFingerprint ?? "",
            "provider_identity_reused",
            now,
            { deliveryId: input.webhookId, paymentId: actualPaymentId, orderId: actualOrderId, intentId: intentId ?? reservation.row?.intent_id ?? undefined },
          );
          return { status: "rejected", code: "provider_identity_reused", ...(intentId ? { intentId } : {}) };
        }
      }
      const finalStatus: WebhookDeliveryStatus = reconcile ? "needs_reconciliation" : "rejected";
      const finalOutcome = reconcile ? "needs_reconciliation" : "rejected";
      this.insertDelivery({
        deliveryId: input.webhookId,
        eventType: event?.eventType ?? "unknown",
        eventId: event?.eventId ?? input.webhookId,
        paymentId,
        orderId,
        intentId,
        rawBodyHash: input.rawBodyHash ?? "",
        eventFingerprint: input.eventFingerprint ?? "",
        status: finalStatus,
        outcome: finalOutcome,
        reason: input.code,
        providerTimestamp: event?.timestamp,
        receivedAt: now,
      });
      if (event) {
        this.insertBusinessEvent(event, paymentId, orderId, intentId, input.rawBodyHash ?? "", input.eventFingerprint ?? "", finalStatus, input.code, now);
        this.finishIdentityReservations(event, finalOutcome, input.code);
      }
      if (intentId) {
        if (reconcile) {
          this.updateIntentReconciliation(intentId, input.code, {
            paymentId: actualPaymentId,
            orderId: actualOrderId,
            deliveryId: input.webhookId,
          });
        } else {
          this.db.prepare<[string, string, string]>(
            `UPDATE waffo_payment_intents SET last_error = ?, updated_at = ? WHERE intent_id = ?`,
          ).run(input.code, now, intentId);
        }
      }
      return reconcile
        ? { status: "reconciled", code: "needs_reconciliation", intentId }
        : { status: "rejected", code: input.code, ...(intentId ? { intentId } : {}) };
    });
  }

  markWebhookApplied(input: { webhookId: string; intentId: string; providerOrderId: string; listingId: string }): PaymentIntent | undefined {
    const now = new Date().toISOString();
    this.db.prepare(
      `UPDATE waffo_payment_intents SET status = 'paid', provider_order_id = ?,
       delivery_id = ?, listing_id = ?, provider_status = 'paid',
       first_paid_at = COALESCE(first_paid_at, ?), last_error = NULL,
       updated_at = ? WHERE intent_id = ?`,
    ).run(input.providerOrderId, input.webhookId, input.listingId, now, now, input.intentId);
    return this.getByIntentId(input.intentId);
  }

  markWebhookFailed(webhookId: string, intentId: string, errorCode: string): PaymentIntent | undefined {
    const now = new Date().toISOString();
    this.db.prepare(
      `UPDATE waffo_webhook_deliveries SET status = 'rejected', outcome = 'failed', reason = ? WHERE delivery_id = ? AND status = 'processing'`,
    ).run(errorCode, webhookId);
    this.db.prepare(
      `UPDATE waffo_payment_intents SET status = 'open', last_error = ?, updated_at = ? WHERE intent_id = ? AND status = 'processing'`,
    ).run(errorCode, now, intentId);
    return this.getByIntentId(intentId);
  }

  /** Delete only local fixture ledger rows; no provider state is touched. */
  resetFixture(): void {
    this.transaction(() => {
      this.db.prepare(
        `DELETE FROM waffo_webhook_replays WHERE intent_id IN (SELECT intent_id FROM waffo_payment_intents WHERE provider = 'fixture')`,
      ).run();
      this.db.prepare(
        `DELETE FROM waffo_identity_reservations WHERE intent_id IN (SELECT intent_id FROM waffo_payment_intents WHERE provider = 'fixture')`,
      ).run();
      this.db.prepare(
        `DELETE FROM waffo_business_events WHERE intent_id IN (SELECT intent_id FROM waffo_payment_intents WHERE provider = 'fixture')`,
      ).run();
      this.db.prepare(
        `DELETE FROM waffo_webhook_deliveries WHERE intent_id IN (SELECT intent_id FROM waffo_payment_intents WHERE provider = 'fixture')`,
      ).run();
      this.db.prepare(
        `DELETE FROM waffo_checkout_events WHERE intent_id IN (SELECT intent_id FROM waffo_payment_intents WHERE provider = 'fixture')`,
      ).run();
      this.db.prepare("DELETE FROM waffo_payment_intents WHERE provider = 'fixture'").run();
    });
  }

  /**
   * Apply a verified Waffo event and the corresponding listing mutation in
   * one SQLite transaction. A thrown failure rolls back every ledger/table
   * write, allowing the signed event to be retried safely.
   */
  settleWaffoEvent(input: {
    event: WaffoSettlementEvent;
    paymentId: string;
    orderId: string;
    intentId: string;
    rawBodyHash: string;
    eventFingerprint: string;
    receivedAt?: string;
    beforeListingMutation?: () => void;
  }): WaffoSettlementResult {
    try {
      return this.transaction(() => this.settleWaffoEventInTransaction(input));
    } catch (error) {
      if (isBusyError(error)) return { status: "busy", code: "processing", intentId: input.intentId };
      throw error;
    }
  }

  private settleWaffoEventInTransaction(input: {
    event: WaffoSettlementEvent;
    paymentId: string;
    orderId: string;
    intentId: string;
    rawBodyHash: string;
    eventFingerprint: string;
    receivedAt?: string;
    beforeListingMutation?: () => void;
  }): WaffoSettlementResult {
    const event = input.event;
    const receivedAt = input.receivedAt ?? new Date().toISOString();
    const existingDelivery = this.getDelivery(event.id);
    if (existingDelivery) {
      if (existingDelivery.rawBodyHash === input.rawBodyHash && existingDelivery.eventFingerprint === input.eventFingerprint) {
        const intent = existingDelivery.intentId ? this.getByIntentId(existingDelivery.intentId) : undefined;
        return existingDelivery.status === "applied"
          ? { status: "duplicate", code: "replay", intentId: intent?.intentId, listing: intent?.listingId ? this.readListing(intent.listingId) : undefined }
          : existingDelivery.status === "needs_reconciliation"
            ? { status: "reconciled", code: "needs_reconciliation", intentId: intent?.intentId ?? input.intentId }
            : { status: "duplicate", code: existingDelivery.outcome, intentId: intent?.intentId };
      }
      // Preserve every identity carried by the changed signed delivery, not
      // just the old delivery's replay row. This closes the fresh-delivery
      // laundering path without ever applying the changed payload.
      this.reserveProviderIdentities({
        event,
        intentId: input.intentId,
        paymentId: input.paymentId,
        orderId: input.orderId,
        rawBodyHash: input.rawBodyHash,
        eventFingerprint: input.eventFingerprint,
        outcome: "rejected",
        reason: "changed_replay",
        createdAt: receivedAt,
      });
      this.recordReplay(existingDelivery, event, input.rawBodyHash, input.eventFingerprint, "changed_replay", receivedAt);
      return { status: "rejected", code: "changed_replay", intentId: existingDelivery.intentId };
    }

    const priorBusiness = this.db.prepare<[string, string], {
      raw_body_hash: string;
      event_fingerprint: string;
      status: string;
      intent_id: string | null;
    }>(
      `SELECT raw_body_hash, event_fingerprint, status, intent_id
       FROM waffo_business_events WHERE event_type = ? AND event_id = ? LIMIT 1`,
    ).get(event.eventType, event.eventId);
    if (priorBusiness) {
      if (priorBusiness.raw_body_hash === input.rawBodyHash && priorBusiness.event_fingerprint === input.eventFingerprint) {
        const intent = priorBusiness.intent_id ? this.getByIntentId(priorBusiness.intent_id) : undefined;
        return { status: "duplicate", code: "business_replay", intentId: intent?.intentId, listing: intent?.listingId ? this.readListing(intent.listingId) : undefined };
      }
      this.reserveProviderIdentities({
        event,
        intentId: input.intentId,
        paymentId: input.paymentId,
        orderId: input.orderId,
        rawBodyHash: input.rawBodyHash,
        eventFingerprint: input.eventFingerprint,
        outcome: "rejected",
        reason: "changed_business_replay",
        createdAt: receivedAt,
      });
      this.recordReplay(undefined, event, input.rawBodyHash, input.eventFingerprint, "changed_business_replay", receivedAt, {
        deliveryId: event.id,
        paymentId: input.paymentId,
        orderId: input.orderId,
        intentId: input.intentId,
      });
      return { status: "rejected", code: "changed_replay", intentId: priorBusiness.intent_id ?? input.intentId };
    }

    const priorPayment = this.db.prepare<[string], { event_type: string; event_id: string; raw_body_hash: string; event_fingerprint: string; intent_id: string | null }>(
      `SELECT event_type, event_id, raw_body_hash, event_fingerprint, intent_id
       FROM waffo_business_events WHERE payment_id = ? LIMIT 1`,
    ).get(input.paymentId);
    const priorOrder = this.db.prepare<[string], { event_type: string; event_id: string; raw_body_hash: string; event_fingerprint: string; intent_id: string | null }>(
      `SELECT event_type, event_id, raw_body_hash, event_fingerprint, intent_id
       FROM waffo_business_events WHERE order_id = ? LIMIT 1`,
    ).get(input.orderId);
    if (priorPayment || priorOrder) {
      const prior = priorPayment ?? priorOrder;
      if (prior && prior.raw_body_hash === input.rawBodyHash && prior.event_fingerprint === input.eventFingerprint) {
        const intent = prior.intent_id ? this.getByIntentId(prior.intent_id) : undefined;
        return { status: "duplicate", code: "identity_replay", intentId: intent?.intentId, listing: intent?.listingId ? this.readListing(intent.listingId) : undefined };
      }
      this.reserveProviderIdentities({
        event,
        intentId: input.intentId,
        paymentId: input.paymentId,
        orderId: input.orderId,
        rawBodyHash: input.rawBodyHash,
        eventFingerprint: input.eventFingerprint,
        outcome: "rejected",
        reason: "provider_identity_reused",
        createdAt: receivedAt,
      });
      this.recordReplay(undefined, event, input.rawBodyHash, input.eventFingerprint, "provider_identity_reused", receivedAt, {
        deliveryId: event.id,
        paymentId: input.paymentId,
        orderId: input.orderId,
        intentId: input.intentId,
      });
      return { status: "rejected", code: "provider_identity_reused", intentId: prior?.intent_id ?? input.intentId };
    }

    const intent = this.getByIntentId(input.intentId);
    const reservedIntentId = intent?.provider === "waffo" ? intent.intentId : undefined;
    const reservation = this.reserveProviderIdentities({
      event,
      intentId: reservedIntentId,
      paymentId: input.paymentId,
      orderId: input.orderId,
      rawBodyHash: input.rawBodyHash,
      eventFingerprint: input.eventFingerprint,
      outcome: "processing",
      createdAt: receivedAt,
    });
    if (reservation.kind === "conflict") {
      this.recordReplay(
        undefined,
        event,
        input.rawBodyHash,
        input.eventFingerprint,
        "provider_identity_reused",
        receivedAt,
        {
          deliveryId: event.id,
          paymentId: input.paymentId,
          orderId: input.orderId,
          intentId: reservedIntentId ?? reservation.row?.intent_id ?? undefined,
        },
      );
      const conflictIntentId = reservedIntentId ?? reservation.row?.intent_id ?? undefined;
      return {
        status: "rejected",
        code: "provider_identity_reused",
        ...(conflictIntentId ? { intentId: conflictIntentId } : {}),
      };
    }
    if (reservation.kind === "exact") {
      const prior = reservation.row;
      if (prior?.outcome === "processing") {
        return { status: "busy", code: "processing", intentId: prior.intent_id ?? undefined };
      }
      if (prior?.outcome === "needs_reconciliation") {
        return { status: "reconciled", code: "needs_reconciliation", intentId: prior.intent_id ?? input.intentId };
      }
      return {
        status: "duplicate",
        code: prior?.outcome ?? "identity_replay",
        ...(prior?.intent_id ?? input.intentId ? { intentId: prior?.intent_id ?? input.intentId } : {}),
        ...(prior?.outcome === "applied" && intent?.listingId
          ? { listing: this.readListing(intent.listingId) }
          : {}),
      };
    }
    this.insertDelivery({
      deliveryId: event.id,
      eventType: event.eventType,
      eventId: event.eventId,
      paymentId: input.paymentId,
      orderId: input.orderId,
      intentId: intent?.intentId,
      rawBodyHash: input.rawBodyHash,
      eventFingerprint: input.eventFingerprint,
      status: "processing",
      outcome: "processing",
      providerTimestamp: event.timestamp,
      receivedAt,
    });
    this.insertBusinessEvent(event, input.paymentId, input.orderId, intent?.intentId, input.rawBodyHash, input.eventFingerprint, "processing", undefined, receivedAt);

    if (!intent) {
      this.finishDelivery(event.id, "rejected", "unknown_intent", "unknown_intent");
      this.finishBusinessEvent(event, "rejected", "unknown_intent");
      this.finishIdentityReservations(event, "rejected", "unknown_intent");
      return { status: "rejected", code: "unknown_intent" };
    }
    if (intent.status === "paid") {
      this.finishDelivery(event.id, "needs_reconciliation", "already_paid", "needs_reconciliation");
      this.finishBusinessEvent(event, "needs_reconciliation", "already_paid");
      this.finishIdentityReservations(event, "needs_reconciliation", "already_paid");
      this.updateIntentReconciliation(intent.intentId, "already_paid", {
        paymentId: input.paymentId,
        orderId: input.orderId,
        deliveryId: event.id,
      });
      return { status: "reconciled", code: "needs_reconciliation", intentId: intent.intentId };
    }
    if (intent.status === "abandoned" || intent.status === "rejected" || intent.status === "failed" || intent.status === "needs_reconciliation") {
      // A signed completed/succeeded capture is evidence of provider money
      // even when the local checkout is no longer open. Preserve it as a
      // reconciliation case instead of turning it into a stranded rejection.
      this.finishDelivery(event.id, "needs_reconciliation", "intent_not_open", "needs_reconciliation");
      this.finishBusinessEvent(event, "needs_reconciliation", "intent_not_open");
      this.finishIdentityReservations(event, "needs_reconciliation", "intent_not_open");
      this.updateIntentReconciliation(intent.intentId, "intent_not_open", {
        paymentId: input.paymentId,
        orderId: input.orderId,
        deliveryId: event.id,
      });
      return { status: "reconciled", code: "needs_reconciliation", intentId: intent.intentId };
    }

    const paidAt = normalizeTimestamp(event.timestamp);
    if (!paidAt) {
      this.finishDelivery(event.id, "rejected", "invalid_provider_timestamp", "invalid_provider_timestamp");
      this.finishBusinessEvent(event, "rejected", "invalid_provider_timestamp");
      this.finishIdentityReservations(event, "rejected", "invalid_provider_timestamp");
      return { status: "rejected", code: "invalid_provider_timestamp", intentId: intent.intentId };
    }

    input.beforeListingMutation?.();
    const mutation = this.mutateListing(intent, paidAt);
    if (mutation.kind === "reconcile") {
      this.finishDelivery(event.id, "needs_reconciliation", mutation.reason, "needs_reconciliation");
      this.finishBusinessEvent(event, "needs_reconciliation", mutation.reason);
      this.finishIdentityReservations(event, "needs_reconciliation", mutation.reason);
      this.updateIntentReconciliation(intent.intentId, mutation.reason, {
        paymentId: input.paymentId,
        orderId: input.orderId,
        deliveryId: event.id,
      });
      return { status: "reconciled", code: "needs_reconciliation", intentId: intent.intentId };
    }

    const now = new Date().toISOString();
    this.db.prepare(
      `UPDATE waffo_payment_intents SET status = 'paid', provider_order_id = ?,
       payment_id = ?, delivery_id = ?, listing_id = ?,
       provider_status = 'succeeded', first_paid_at = COALESCE(first_paid_at, ?),
       last_error = NULL, updated_at = ? WHERE intent_id = ?`,
    ).run(input.orderId, input.paymentId, event.id, mutation.listing.id, paidAt, now, intent.intentId);
    this.db.prepare(
      `UPDATE waffo_checkout_events SET status = 'paid', outcome = 'paid', updated_at = ? WHERE intent_id = ?`,
    ).run(now, intent.intentId);
    this.finishDelivery(event.id, "applied", "paid", "paid", now);
    this.finishBusinessEvent(event, "applied", "paid");
    this.finishIdentityReservations(event, "applied", "paid");
    return { status: "applied", code: "paid", intentId: intent.intentId, listing: mutation.listing };
  }

  private mutateListing(intent: PaymentIntent, paidAt: string): { kind: "applied"; listing: Listing } | { kind: "reconcile"; reason: string } {
    // A captured payment outside the live seven-day occupancy window cannot
    // safely claim or raise current rank. Keep it durable for reconciliation.
    if (!isInRollingWeek(paidAt, new Date())) return { kind: "reconcile", reason: "stale_payment" };
    const row = this.db.prepare<[ListingDraft["lane"], string, string], ListingRow>(
      `SELECT ${LISTING_COLUMNS} FROM listings
       WHERE lane = ? AND paid_usd >= 1 AND (apply_url = ? OR company_handle = ?)
       ORDER BY created_at ASC, id ASC`,
    ).all(intent.listingDraft.lane, intent.listingDraft.applyUrl, intent.listingDraft.companyHandle)
      .map(rowToListing)
      .find((item) => isInRollingWeek(item.createdAt, new Date()));

    const targetBidUsd = intent.targetBidCents / 100;
    const chargeUsd = intent.chargeCents / 100;
    if (!row) {
      if (intent.quoteBaseBidCents !== 0) return { kind: "reconcile", reason: "missing_incumbent" };
      const listing: Listing = {
        id: `lst_${intent.intentId}`,
        periodId: intent.periodId,
        lane: intent.listingDraft.lane,
        title: intent.listingDraft.title,
        company: intent.listingDraft.company,
        companyHandle: intent.listingDraft.companyHandle,
        applyUrl: intent.listingDraft.applyUrl,
        salary: intent.listingDraft.salary,
        bidUsd: targetBidUsd,
        paidUsd: chargeUsd,
        clicks: 0,
        createdAt: paidAt,
        updatedAt: paidAt,
        payerId: intent.listingDraft.payerId,
      };
      try {
        this.db.prepare(
          `INSERT INTO listings (
            id, period_id, lane, title, company, company_handle, apply_url,
            salary_min_usd, salary_max_usd, bid_usd, paid_usd, clicks,
            created_at, updated_at, payer_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          listing.id, listing.periodId, listing.lane, listing.title,
          listing.company, listing.companyHandle, listing.applyUrl,
          listing.salary?.minUsd ?? null, listing.salary?.maxUsd ?? null,
          listing.bidUsd, listing.paidUsd, listing.clicks, listing.createdAt,
          listing.updatedAt, listing.payerId ?? null,
        );
      } catch {
        return { kind: "reconcile", reason: "listing_identity_conflict" };
      }
      return { kind: "applied", listing };
    }

    if (row.payerId !== intent.listingDraft.payerId) return { kind: "reconcile", reason: "identity_taken" };
    if (intent.quoteBaseBidCents !== row.bidUsd * 100) return { kind: "reconcile", reason: "stale_quote" };
    if (intent.targetBidCents <= row.bidUsd * 100) return { kind: "reconcile", reason: "stale_raise" };
    if (intent.chargeCents !== intent.targetBidCents - intent.quoteBaseBidCents) return { kind: "reconcile", reason: "charge_mismatch" };

    const updated: Listing = {
      ...row,
      bidUsd: targetBidUsd,
      paidUsd: row.paidUsd + chargeUsd,
      updatedAt: paidAt,
    };
    this.db.prepare(
      `UPDATE listings SET bid_usd = ?, paid_usd = ?, updated_at = ? WHERE id = ? AND payer_id = ?`,
    ).run(updated.bidUsd, updated.paidUsd, updated.updatedAt, updated.id, intent.listingDraft.payerId);
    return { kind: "applied", listing: updated };
  }

  private readListing(id: string): Listing | undefined {
    const row = this.db.prepare<[string], ListingRow>(
      `SELECT ${LISTING_COLUMNS} FROM listings WHERE id = ? LIMIT 1`,
    ).get(id);
    return row ? rowToListing(row) : undefined;
  }

  private insertDelivery(input: {
    deliveryId: string;
    eventType: string;
    eventId: string;
    paymentId: string;
    orderId: string;
    intentId?: string;
    rawBodyHash: string;
    eventFingerprint: string;
    status: WebhookDeliveryStatus;
    outcome: string;
    reason?: string;
    providerTimestamp?: string;
    receivedAt: string;
    appliedAt?: string;
  }): void {
    this.db.prepare(
      `INSERT INTO waffo_webhook_deliveries (
        delivery_id, event_type, event_id, payment_id, order_id, intent_id,
        raw_body_hash, event_fingerprint, status, outcome, reason,
        provider_timestamp, received_at, applied_at, last_replay_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      input.deliveryId, input.eventType, input.eventId, input.paymentId,
      input.orderId, input.intentId ?? null, input.rawBodyHash,
      input.eventFingerprint, input.status, input.outcome, input.reason ?? null,
      input.providerTimestamp ?? null, input.receivedAt, input.appliedAt ?? null,
    );
  }

  private insertBusinessEvent(
    event: WaffoSettlementEvent,
    paymentId: string,
    orderId: string,
    intentId: string | undefined,
    rawBodyHash: string,
    eventFingerprint: string,
    status: string,
    reason: string | undefined,
    createdAt: string,
  ): void {
    this.db.prepare(
      `INSERT INTO waffo_business_events (
        event_type, event_id, payment_id, order_id, intent_id,
        raw_body_hash, event_fingerprint, status, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(event.eventType, event.eventId, paymentId, orderId, intentId ?? null, rawBodyHash, eventFingerprint, status, reason ?? null, createdAt);
  }

  private finishDelivery(deliveryId: string, status: WebhookDeliveryStatus, outcome: string, reason: string, appliedAt?: string): void {
    this.db.prepare(
      `UPDATE waffo_webhook_deliveries SET status = ?, outcome = ?, reason = ?, applied_at = COALESCE(?, applied_at) WHERE delivery_id = ?`,
    ).run(status, outcome, reason, appliedAt ?? null, deliveryId);
  }

  private finishBusinessEvent(event: WaffoSettlementEvent, status: string, reason: string): void {
    this.db.prepare(
      `UPDATE waffo_business_events SET status = ?, reason = ? WHERE event_type = ? AND event_id = ?`,
    ).run(status, reason, event.eventType, event.eventId);
  }

  private updateIntentReconciliation(
    intentId: string,
    reason: string,
    identities: { paymentId?: string; orderId?: string; deliveryId?: string } = {},
  ): void {
    const now = new Date().toISOString();
    this.db.prepare(
      `UPDATE waffo_payment_intents
       SET status = CASE WHEN status = 'paid' THEN status ELSE 'needs_reconciliation' END,
           provider_order_id = COALESCE(provider_order_id, ?),
           payment_id = COALESCE(payment_id, ?),
           delivery_id = COALESCE(delivery_id, ?),
           last_error = ?, updated_at = ? WHERE intent_id = ?`,
    ).run(identities.orderId ?? null, identities.paymentId ?? null, identities.deliveryId ?? null, reason, now, intentId);
    this.db.prepare(
      `UPDATE waffo_checkout_events SET status = 'needs_reconciliation', outcome = 'needs_reconciliation', error_code = ?, updated_at = ? WHERE intent_id = ?`,
    ).run(reason, now, intentId);
  }

  private findIdentityConflict(
    event: WaffoSettlementEvent,
    paymentId: string,
    orderId: string,
  ): { raw_body_hash: string; event_fingerprint: string; intent_id: string | null } | undefined {
    const business = this.db.prepare<[string, string, string, string], {
      raw_body_hash: string;
      event_fingerprint: string;
      intent_id: string | null;
    }>(
      `SELECT raw_body_hash, event_fingerprint, intent_id
       FROM waffo_business_events
       WHERE (event_type = ? AND event_id = ?) OR payment_id = ? OR order_id = ?
       LIMIT 1`,
    ).get(event.eventType, event.eventId, paymentId, orderId);
    if (business) return business;
    return this.db.prepare<[string, string, string, string], {
      raw_body_hash: string;
      event_fingerprint: string;
      intent_id: string | null;
    }>(
      `SELECT raw_body_hash, event_fingerprint, intent_id
       FROM waffo_webhook_deliveries
       WHERE (event_type = ? AND event_id = ?) OR payment_id = ? OR order_id = ?
       LIMIT 1`,
    ).get(event.eventType, event.eventId, paymentId, orderId);
  }

  private recordReplay(
    existing: WebhookDelivery | undefined,
    event: WaffoSettlementEvent,
    rawBodyHash: string,
    eventFingerprint: string,
    reason: string,
    receivedAt: string,
    identity: { deliveryId?: string; paymentId?: string; orderId?: string; intentId?: string } = {},
  ): void {
    this.db.prepare(
      `INSERT INTO waffo_webhook_replays (
        delivery_id, event_type, event_id, payment_id, order_id, intent_id,
        raw_body_hash, event_fingerprint, reason, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(identity.deliveryId ?? existing?.webhookId ?? null, event.eventType, event.eventId, identity.paymentId ?? readProviderIdentifier(event.data.paymentId) ?? null, identity.orderId ?? readProviderIdentifier(event.data.orderId) ?? null, identity.intentId ?? existing?.intentId ?? readProviderIdentifier(event.data.orderMerchantExternalId) ?? null, rawBodyHash, eventFingerprint, reason, receivedAt);
    if (existing) {
      this.db.prepare(
        `UPDATE waffo_webhook_deliveries SET last_replay_hash = ? WHERE delivery_id = ?`,
      ).run(rawBodyHash, existing.webhookId);
    }
  }

  close(): void {
    if (this.db.open) this.db.close();
  }
}

function normalizeTimestamp(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Provider IDs are already canonical; whitespace is never normalization. */
function readProviderIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || /\s/u.test(value)) return undefined;
  return value;
}

function isBusyError(error: unknown): boolean {
  return error instanceof Error && /busy|locked/i.test(error.message);
}

export function parseBidUsd(raw: unknown): number {
  if (typeof raw === "boolean") throw new CheckoutError("invalid_bid", 400);
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < 1) throw new CheckoutError("invalid_bid", 400);
    return assertBidRange(raw);
  }
  if (typeof raw !== "string" || raw.trim() === "" || !/^[0-9]+$/.test(raw.trim())) {
    throw new CheckoutError("invalid_bid", 400);
  }
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1) throw new CheckoutError("invalid_bid", 400);
  return assertBidRange(value);
}

function assertBidRange(value: number): number {
  if (value < MIN_BID_USD) throw new CheckoutError("bid_below_min", 400);
  if (value > MAX_BID_USD) throw new CheckoutError("bid_above_max", 400);
  return value;
}

/** Compatibility name retained by the app; Waffo mode is the only live selection. */
export function getPolarPort(store: BoardStore = defaultBoardStore, env: PaymentEnv = process.env): PolarPort {
  const mode = getPaymentMode(env);
  if (mode === "fixture") return getFakePolarPort(store, env);
  return new LiveWaffoPort({ store, env });
}

export function firstQuery(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function paymentIntentStoreFor(store: BoardStore): PaymentIntentStore {
  return new PaymentIntentStore(store.databasePath);
}

export function getPaymentIntent(
  intentId: string,
  port: PolarPort = getPolarPort(),
): PaymentIntent | undefined {
  if (!/^intent_[A-Za-z0-9-]+$/.test(intentId)) return undefined;
  return port.getPaymentIntent?.(intentId);
}

export async function handleCheckoutReturn(
  params: { checkoutId?: string | string[]; checkout_id?: string | string[]; status?: string | string[]; intent?: string | string[] },
  port: PolarPort = getPolarPort(),
): Promise<{ status: "success" | "cancel"; listing: Listing | null }> {
  const checkoutId = firstQuery(params.checkoutId) ?? firstQuery(params.checkout_id);
  const canceled = ["cancel", "canceled"].includes(firstQuery(params.status) ?? "");
  if (!checkoutId) return { status: canceled ? "cancel" : "success", listing: null };
  if (canceled) {
    await port.abandonCheckout(checkoutId);
    return { status: "cancel", listing: null };
  }
  return { status: "success", listing: await port.completeCheckout(checkoutId) };
}
