import { randomUUID } from "node:crypto";
import {
  WaffoPancake,
  WaffoPancakeError,
  TaxCategory,
  verifyWebhook,
  type WebhookPublicKeys,
} from "@waffo/pancake-ts";
import type { Listing } from "../lib/types";
import { planCheckout } from "../lib/listing";
import { BoardStore, defaultBoardStore, type BoardStore as BoardStoreType } from "../lib/store";
import {
  getPaymentMode,
  isPublicHostname,
  requireWaffoConfig,
  type PaymentEnv,
  type PaymentMode,
  type WaffoConfig,
} from "./env";
import {
  checkoutRecordFromIntent,
  CheckoutError,
  PaymentIntentStore,
  sha256,
  stableJson,
  type CheckoutRecord,
  type CheckoutStart,
  type CreateCheckoutInput,
  type PaymentIntent,
  type PolarPort,
  type WaffoEventData,
  type WaffoSettlementEvent,
  type WaffoSettlementResult,
} from "./port";
export { isWaffoLive } from "./env";

export type LiveWaffoOptions = {
  env?: PaymentEnv;
  fetch?: typeof fetch;
  /** Test-only override; production still receives a bounded timeout. */
  timeoutMs?: number;
  store?: BoardStoreType;
  intentStore?: PaymentIntentStore;
  beforeListingMutation?: () => void;
};

export type WaffoWebhookOptions = {
  env?: PaymentEnv;
  store?: BoardStoreType;
  intentStore?: PaymentIntentStore;
  /** Test-only generated key. Production callers must use configured Waffo keys. */
  publicKey?: string;
  publicKeys?: WebhookPublicKeys;
  receivedAt?: string;
  beforeListingMutation?: () => void;
};

export type WaffoWebhookResult = WaffoSettlementResult | {
  status: "rejected" | "retryable" | "duplicate" | "reconciled";
  code: string;
  intentId?: string;
};

export const DEFAULT_WAFFO_API_BASE = "https://api.waffo.ai";
const WAFFO_PRODUCT_NAME = "Rank";

type WaffoRuntimeResources = {
  store: BoardStoreType;
  intentStore: PaymentIntentStore;
};

/**
 * Route handlers are constructed per request by the App Router. Keep one
 * durable SQLite pair per database path so a request does not leak a new
 * native connection, while still allowing tests to inject their own pair.
 */
const runtimeResources = new Map<string, WaffoRuntimeResources>();

function runtimeResourcesFor(
  databasePath: string,
  storeOverride?: BoardStoreType,
  intentStoreOverride?: PaymentIntentStore,
): WaffoRuntimeResources {
  const existing = runtimeResources.get(databasePath);
  if (existing) {
    return {
      store: storeOverride ?? existing.store,
      intentStore: intentStoreOverride ?? existing.intentStore,
    };
  }
  const resources: WaffoRuntimeResources = {
    store: storeOverride ?? (defaultBoardStore.databasePath === databasePath ? defaultBoardStore : new BoardStore(databasePath)),
    intentStore: intentStoreOverride ?? new PaymentIntentStore(databasePath),
  };
  // Injected pairs belong to their caller/test. Cache only request-owned
  // resources (or the app's shared default board store) for the process.
  if (!intentStoreOverride && (!storeOverride || storeOverride === defaultBoardStore)) {
    runtimeResources.set(databasePath, resources);
  }
  return resources;
}

/** Test/process-shutdown hook; production requests retain one pair per path. */
export function closeWaffoRuntimeResources(databasePath?: string): void {
  const entries = databasePath
    ? [[databasePath, runtimeResources.get(databasePath)] as const]
    : [...runtimeResources.entries()];
  for (const [path, resources] of entries) {
    if (!resources) continue;
    resources.intentStore.close();
    resources.store.close();
    runtimeResources.delete(path);
  }
}

export function waffoRuntimeResourceCount(): number {
  return runtimeResources.size;
}

/** Exact decimal USD display parser. Floating point is never used for money. */
export function decimalToCents(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : undefined;
}

export function centsToDisplayString(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("invalid cents");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function waffoEnvironmentForMode(mode: PaymentMode): "test" | "prod" {
  if (mode === "waffo-test") return "test";
  if (mode === "waffo-prod") return "prod";
  throw new Error("fixture mode has no Waffo environment");
}

/** Metadata is an immutable string projection of the persisted normalized intent. */
export function metadataForIntent(intent: PaymentIntent): Record<string, string> {
  return {
    intentId: intent.intentId,
    intentFingerprint: intent.fingerprint,
    targetBidCents: String(intent.targetBidCents),
    quoteBaseBidCents: String(intent.quoteBaseBidCents),
    chargeCents: String(intent.chargeCents),
    canonicalUrl: intent.listingDraft.applyUrl,
    periodId: intent.periodId,
    lane: intent.listingDraft.lane,
    title: intent.listingDraft.title,
    company: intent.listingDraft.company,
    companyHandle: intent.listingDraft.companyHandle,
    payerId: intent.listingDraft.payerId,
    mode: intent.mode,
    storeId: intent.storeId,
    productId: intent.productId,
    currency: intent.currency,
    taxCategory: intent.taxCategory,
  };
}

/** Official Waffo checkout client. Its fetch is injectable for offline vectors. */
export class LiveWaffoPort implements PolarPort {
  private readonly env: PaymentEnv;
  private readonly config: WaffoConfig;
  private readonly mode: Exclude<PaymentMode, "fixture">;
  private readonly client: WaffoPancake;
  private readonly store: BoardStoreType;
  private readonly intentStore: PaymentIntentStore;
  private readonly beforeListingMutation?: () => void;
  private readonly timeoutMs: number;

  constructor(options: LiveWaffoOptions = {}) {
    this.env = options.env ?? process.env;
    const mode = getPaymentMode(this.env);
    if (mode === "fixture") throw new Error("Waffo live port requires WAFFO_MODE=waffo-test or waffo-prod");
    this.mode = mode;
    this.config = requireWaffoConfig(this.env, mode);
    this.timeoutMs = requestTimeoutMs(this.env, options.timeoutMs);
    if (options.store && options.store.databasePath !== this.config.databasePath) {
      throw new Error("BLOCKED-CONFIG: DATABASE_PATH_MISMATCH");
    }
    if (options.intentStore && options.intentStore.databasePath !== this.config.databasePath) {
      throw new Error("BLOCKED-CONFIG: DATABASE_PATH_MISMATCH");
    }
    const resources = runtimeResourcesFor(this.config.databasePath, options.store, options.intentStore);
    this.store = resources.store;
    this.intentStore = resources.intentStore;
    this.beforeListingMutation = options.beforeListingMutation;
    const providerFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.client = new WaffoPancake({
      merchantId: this.config.merchantId,
      privateKey: this.config.privateKey,
      baseUrl: this.config.apiBase,
      environment: waffoEnvironmentForMode(mode),
      ...(this.config.webhookPublicKeys ? { webhookPublicKey: this.config.webhookPublicKeys } : {}),
      fetch: withRequestTimeout(providerFetch, this.timeoutMs),
    });
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart> {
    const plan = planCheckout(this.store, input.listingDraft, input.amountUsd);
    const intentId = `intent_${randomUUID()}`;
    const successUrl = `${this.config.publicBaseUrl}/checkout/complete?intent=${encodeURIComponent(intentId)}`;
    const intent = this.intentStore.create({
      provider: "waffo",
      mode: this.mode,
      storeId: this.config.storeId,
      productId: this.config.productId,
      amountUsd: plan.chargeUsd,
      chargeCents: plan.chargeUsd * 100,
      targetBidCents: plan.draft.bidUsd * 100,
      quoteBaseBidCents: plan.kind === "raise" ? plan.existing.bidUsd * 100 : 0,
      listingDraft: { ...plan.draft },
      successUrl,
      intentId,
    });
    const metadata = metadataForIntent(intent);
    try {
      const session = await this.client.checkout.anonymous.create({
        productId: this.config.productId,
        currency: "USD",
        priceSnapshot: {
          amount: centsToDisplayString(intent.chargeCents),
          taxCategory: TaxCategory.DigitalGoods,
        },
        successUrl,
        orderMerchantExternalId: intent.intentId,
        metadata,
      });
      if (!isValidCheckoutResponse(session, this.mode)) {
        this.intentStore.markStatus(intent.intentId, "unknown", "provider_response_invalid");
        throw new Error("Waffo checkout response missing sessionId/checkoutUrl/expiresAt");
      }
      const attached = this.intentStore.attachCheckout(
        intent.intentId,
        session.sessionId,
        session.checkoutUrl,
        session.expiresAt,
      );
      return {
        checkoutId: session.sessionId,
        url: session.checkoutUrl,
        intentId: attached.intentId,
      };
    } catch (error) {
      const status = error instanceof WaffoPancakeError ? error.status : undefined;
      const current = this.intentStore.getByIntentId(intent.intentId);
      if (current?.status === "creating") {
        const nonJsonResponse = error instanceof WaffoPancakeError
          && error.errors.some((item) => /non-json response/i.test(item.message));
        const ambiguous = status === undefined
          || status === 408
          || status === 409
          || status === 425
          || status === 429
          || status >= 500
          || nonJsonResponse;
        if (!ambiguous && status !== undefined && status >= 400 && status < 500) {
          this.intentStore.markStatus(intent.intentId, "rejected", `provider_http_${status}`);
        } else {
          this.intentStore.markStatus(intent.intentId, "unknown", status ? `provider_http_${status}` : "provider_transport_ambiguous");
        }
      }
      const latest = this.intentStore.getByIntentId(intent.intentId);
      const currentStatus = latest?.status === "rejected" ? "checkout_failed" : "checkout_unknown";
      throw new CheckoutError(currentStatus, latest?.status === "rejected" ? 502 : 503, intent.intentId);
    }
  }

  /** Browser return is informational; only a verified webhook can settle. */
  async completeCheckout(checkoutId: string): Promise<Listing | null> {
    const intent = this.intentStore.getByCheckoutId("waffo", checkoutId);
    if (!intent || intent.status !== "paid" || !intent.listingId) return null;
    return this.store.getById(intent.listingId) ?? null;
  }

  async abandonCheckout(checkoutId: string): Promise<void> {
    // A browser-controlled return is not an authenticated provider operation.
    // Never let query parameters abandon an intent that may already be paid.
    void checkoutId;
  }

  getCheckout(checkoutId: string): CheckoutRecord | undefined {
    const intent = this.intentStore.getByCheckoutId("waffo", checkoutId);
    return intent ? checkoutRecordFromIntent(intent) : undefined;
  }

  get databasePath(): string {
    return this.config.databasePath;
  }

  get paymentIntents(): PaymentIntentStore {
    return this.intentStore;
  }

  getPaymentIntent(intentId: string): PaymentIntent | undefined {
    return this.intentStore.getByIntentId(intentId);
  }
}

function isValidCheckoutResponse(
  value: unknown,
  mode: Exclude<PaymentMode, "fixture">,
): value is { sessionId: string; checkoutUrl: string; expiresAt: string } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const sessionId = readProviderIdentifier(item.sessionId) ?? "";
  const rawCheckoutUrl = typeof item.checkoutUrl === "string" ? item.checkoutUrl : "";
  if (!sessionId || !rawCheckoutUrl || rawCheckoutUrl.trim() !== rawCheckoutUrl) return false;
  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(rawCheckoutUrl);
  } catch {
    return false;
  }
  // The SDK documents the hosted cashier at pancake.waffo.ai. Keep the
  // authority exact: suffix matches, userinfo, IDNA, terminal dots, and
  // explicit ports must not turn a provider response into an open redirect.
  const authority = rawCheckoutUrl.match(/^https:\/\/([^/?#]+)(?:[/?#]|$)/i)?.[1];
  if (!authority || authority.toLowerCase() !== "pancake.waffo.ai" || authority.includes(":") || authority.includes("@") || /[^\x21-\x7e]/.test(authority)) return false;
  if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "pancake.waffo.ai"
      || checkoutUrl.port !== "" || checkoutUrl.username !== "" || checkoutUrl.password !== ""
      || checkoutUrl.search !== "" || checkoutUrl.hash !== "") return false;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(checkoutUrl.pathname);
  } catch {
    return false;
  }
  if (decodedPath !== checkoutUrl.pathname) return false;
  const segments = checkoutUrl.pathname.split("/").filter(Boolean);
  const isStorePath = segments.length === 4 && segments[0] === "store" && segments[2] === "checkout";
  if (!isStorePath || segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) return false;
  if (segments[segments.length - 1] !== sessionId) return false;
  const expiresText = typeof item.expiresAt === "string" ? item.expiresAt : "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresText)) return false;
  const expiresAt = Date.parse(expiresText);
  const now = Date.now();
  if (!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== expiresText) return false;
  return isPublicHostname(checkoutUrl.hostname)
    && expiresAt > now
    && (mode === "waffo-test" || mode === "waffo-prod");
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MIN_REQUEST_TIMEOUT_MS = 10;
const MAX_REQUEST_TIMEOUT_MS = 60_000;

function requestTimeoutMs(env: PaymentEnv, override?: number): number {
  const raw = env.WAFFO_REQUEST_TIMEOUT_MS?.trim();
  const value = override ?? (raw ? Number(raw) : DEFAULT_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(value) || value < MIN_REQUEST_TIMEOUT_MS || value > MAX_REQUEST_TIMEOUT_MS) {
    throw new Error("BLOCKED-CONFIG: WAFFO_REQUEST_TIMEOUT_MS");
  }
  return value;
}

function withRequestTimeout(fetchFn: typeof fetch, timeoutMs: number): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
    if (upstreamSignal) {
      if (upstreamSignal.aborted) abortFromUpstream();
      else upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cleaned = false;
    let timedOut = false;
    let bodyReject: ((reason: Error) => void) | undefined;
    let responseForTimeout: Response | undefined;
    const timeoutError = new Error("waffo_request_timeout");
    timeoutError.name = "WaffoRequestTimeoutError";
    let bodyTimeout: Promise<never> | undefined;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (timer !== undefined) clearTimeout(timer);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    };
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(timeoutError);
      bodyReject?.(timeoutError);
      const body = responseForTimeout?.body;
      if (body) void body.cancel().catch(() => undefined);
    }, timeoutMs);
    const fetchPromise = Promise.resolve().then(() => fetchFn(input, { ...init, signal: controller.signal }));
    try {
      // Race the transport itself as well as aborting it. A test double (or a
      // broken adapter) that ignores AbortSignal must not strand an intent.
      const response = await Promise.race([
        fetchPromise,
        new Promise<never>((_resolve, reject) => {
          const rejectOnTimeout = () => reject(timeoutError);
          const timeoutListener = setTimeout(rejectOnTimeout, timeoutMs);
          fetchPromise.finally(() => clearTimeout(timeoutListener)).catch(() => undefined);
        }),
      ]);
      responseForTimeout = response;
      bodyTimeout = new Promise<never>((_resolve, reject) => {
        bodyReject = reject;
      });
      bodyTimeout.catch(() => undefined);
      const originalJson = response.json.bind(response);
      const responseWithBoundedBody = new Proxy(response, {
        get(target, property) {
          if (property === "json") {
            return () => {
              const parse = originalJson();
              parse.catch(() => undefined);
              const parsed = timedOut
                ? Promise.reject(timeoutError)
                : Promise.race([parse, bodyTimeout as Promise<never>]);
              // A response body with an ambiguous HTTP status must not be
              // treated as a successful checkout merely because it happens to
              // contain a complete-looking data object.
              const result = parsed.then((value) => {
                if (response.status === 408 || response.status === 429 || response.status >= 500) {
                  throw new WaffoPancakeError(response.status, [{
                    message: `Ambiguous Waffo response status ${response.status}`,
                    layer: "sdk",
                  }]);
                }
                return value;
              });
              return result.finally(cleanup);
            };
          }
          return Reflect.get(target, property, target);
        },
      });
      return responseWithBoundedBody;
    } catch (error) {
      cleanup();
      throw error;
    }
  };
}

function headerValue(headers: Record<string, string> | string, name: string): string | undefined {
  if (typeof headers === "string") return headers;
  const target = name.toLowerCase();
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === target)?.[1];
  return value?.trim() || undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Provider identifiers are canonical values, never whitespace-normalized. */
function readProviderIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || /\s/u.test(value)) return undefined;
  return value;
}

const PROVIDER_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PROVIDER_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const PROVIDER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function providerTimestampState(
  value: unknown,
  receivedAt?: string,
): { kind: "valid"; iso: string } | { kind: "invalid" | "stale" | "future" } {
  if (typeof value !== "string" || !PROVIDER_TIMESTAMP_RE.test(value)) return { kind: "invalid" };
  const eventMs = Date.parse(value);
  if (!Number.isFinite(eventMs) || new Date(eventMs).toISOString() !== value) return { kind: "invalid" };
  const receivedMs = receivedAt ? Date.parse(receivedAt) : Date.now();
  const clockMs = Number.isFinite(receivedMs) ? receivedMs : Date.now();
  if (eventMs > clockMs + PROVIDER_FUTURE_TOLERANCE_MS) return { kind: "future" };
  if (eventMs < clockMs - PROVIDER_MAX_AGE_MS) return { kind: "stale" };
  return { kind: "valid", iso: value };
}

function readMetadata(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") return undefined;
    output[key] = item;
  }
  return output;
}

function metadataMatches(actual: Record<string, string> | undefined, expected: Record<string, string>): boolean {
  if (!actual) return false;
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  return actualKeys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(actual, key) && actual[key] === expected[key]);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function eventIdentity(event: WaffoSettlementEvent): { paymentId?: string; orderId?: string; intentId?: string } | undefined {
  const data = event.data;
  const paymentId = readProviderIdentifier(data.paymentId);
  const orderId = readProviderIdentifier(data.orderId);
  const metadata = readMetadata(data.orderMetadata);
  const intentId = readProviderIdentifier(data.orderMerchantExternalId) ?? readProviderIdentifier(metadata?.intentId);
  if (!paymentId && !orderId && !intentId) return undefined;
  return { paymentId, orderId, intentId };
}

function configForWebhook(options: WaffoWebhookOptions): { env: PaymentEnv; mode: Exclude<PaymentMode, "fixture">; config: WaffoConfig; store: BoardStoreType; intentStore: PaymentIntentStore } | WaffoWebhookResult {
  const env = options.env ?? process.env;
  let mode: PaymentMode;
  try {
    mode = getPaymentMode(env);
  } catch {
    return { status: "rejected", code: "blocked_config" };
  }
  if (mode === "fixture") return { status: "rejected", code: "fixture_only" };
  let config: WaffoConfig;
  try {
    config = requireWaffoConfig(env, mode);
  } catch {
    return { status: "rejected", code: "blocked_config" };
  }
  if (options.store && options.store.databasePath !== config.databasePath) {
    return { status: "rejected", code: "blocked_database" };
  }
  if (options.intentStore && options.intentStore.databasePath !== config.databasePath) {
    return { status: "rejected", code: "blocked_database" };
  }
  const resources = runtimeResourcesFor(config.databasePath, options.store, options.intentStore);
  const store = resources.store;
  const intentStore = resources.intentStore;
  return { env, mode, config, store, intentStore };
}

function normalizeEvent(value: unknown): WaffoSettlementEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const id = readProviderIdentifier(item.id);
  const eventId = readProviderIdentifier(item.eventId);
  const eventType = readProviderIdentifier(item.eventType);
  const storeId = readProviderIdentifier(item.storeId);
  if (!id || typeof item.timestamp !== "string"
      || !eventType || !eventId
      || !storeId || (item.mode !== "test" && item.mode !== "prod")
      || !item.data || typeof item.data !== "object" || Array.isArray(item.data)) return undefined;
  return {
    id,
    timestamp: item.timestamp,
    eventType,
    eventId,
    storeId,
    mode: item.mode,
    data: item.data as WaffoEventData,
  };
}

function rejectParsedEvent(
  event: WaffoSettlementEvent,
  reason: string,
  intentStore: PaymentIntentStore,
  rawBodyHash: string,
  eventFingerprint: string,
  outcome: "rejected" | "needs_reconciliation" = "rejected",
): WaffoWebhookResult {
  const identity = eventIdentity(event);
  const existing = intentStore.getDelivery(event.id);
  if (existing && existing.rawBodyHash === rawBodyHash && existing.eventFingerprint === eventFingerprint) {
    const intent = existing.intentId ? intentStore.getByIntentId(existing.intentId) : undefined;
    if (existing.status === "needs_reconciliation") {
      return { status: "reconciled", code: "needs_reconciliation", intentId: intent?.intentId ?? identity?.intentId ?? event.id };
    }
    return {
      status: "duplicate",
      code: existing.outcome || reason,
      ...(intent?.intentId ?? identity?.intentId ? { intentId: intent?.intentId ?? identity?.intentId } : {}),
    };
  }
  try {
    return intentStore.rejectWebhook({
      webhookId: event.id,
      providerOrderId: identity?.orderId,
      providerCheckoutId: readProviderIdentifier(event.data.checkoutId),
      intentId: identity?.intentId,
      code: reason,
      outcome,
      reserveIntent: outcome !== "rejected",
      event,
      rawBodyHash,
      eventFingerprint,
    });
  } catch {
    // The rejection itself is part of the durable delivery contract. If its
    // audit write fails, ask Waffo to retry instead of returning a permanent
    // 400 that could strand a captured payment.
    return { status: "retryable", code: "audit_unavailable", ...(identity?.intentId ? { intentId: identity.intentId } : {}) };
  }
}

/** Verify raw Waffo webhook bytes and atomically settle one order.completed event. */
export async function handleWaffoWebhook(
  rawBody: string,
  headers: Record<string, string> | string,
  options: WaffoWebhookOptions = {},
): Promise<WaffoWebhookResult> {
  const selected = configForWebhook(options);
  if ("status" in selected) return selected;
  const { env, mode, config, intentStore } = selected;
  const rawBodyHash = sha256(rawBody);
  const signature = headerValue(headers, "x-waffo-signature");
  const expectedEnvironment = waffoEnvironmentForMode(mode);
  let parsed: unknown;
  try {
    const allowInjectedKeys = env.NODE_ENV === "test";
    parsed = verifyWebhook(rawBody, signature, {
      environment: expectedEnvironment,
      ...(allowInjectedKeys && options.publicKey ? { publicKey: options.publicKey } : {}),
      ...(allowInjectedKeys && options.publicKeys
        ? { publicKeys: options.publicKeys }
        : config.webhookPublicKeys ? { publicKeys: config.webhookPublicKeys } : {}),
    });
  } catch {
    return { status: "rejected", code: "invalid_signature" };
  }
  const event = normalizeEvent(parsed);
  if (!event) return { status: "rejected", code: "invalid_event" };
  const eventFingerprint = sha256(stableJson(event));
  const data = event.data;
  const identity = eventIdentity(event);

  if (event.eventType !== "order.completed") return rejectParsedEvent(event, "unsupported_event", intentStore, rawBodyHash, eventFingerprint);
  if (event.mode !== expectedEnvironment) return rejectParsedEvent(event, "mode_mismatch", intentStore, rawBodyHash, eventFingerprint);
  if (event.storeId !== config.storeId) return rejectParsedEvent(event, "store_mismatch", intentStore, rawBodyHash, eventFingerprint);
  if (data.orderStatus !== "completed") return rejectParsedEvent(event, "order_status_mismatch", intentStore, rawBodyHash, eventFingerprint);
  if (data.paymentStatus !== "succeeded") return rejectParsedEvent(event, "payment_status_mismatch", intentStore, rawBodyHash, eventFingerprint);
  if (data.currency !== "USD") return rejectParsedEvent(event, "currency_mismatch", intentStore, rawBodyHash, eventFingerprint);
  if (!identity?.paymentId || !identity.orderId || !identity.intentId) return rejectParsedEvent(event, "missing_payment_identity", intentStore, rawBodyHash, eventFingerprint);
  if (identity.paymentId !== event.eventId) return rejectParsedEvent(event, "payment_event_mismatch", intentStore, rawBodyHash, eventFingerprint);

  const metadata = readMetadata(data.orderMetadata);
  const intent = intentStore.getByIntentId(identity.intentId);
  if (!intent || intent.provider !== "waffo") return rejectParsedEvent(event, "unknown_intent", intentStore, rawBodyHash, eventFingerprint);
  const expectedMetadata = metadataForIntent(intent);
  if (!metadataMatches(metadata, expectedMetadata)) {
    return rejectParsedEvent(event, "metadata_mismatch", intentStore, rawBodyHash, eventFingerprint);
  }
  const externalId = readProviderIdentifier(data.orderMerchantExternalId);
  if (!externalId) return rejectParsedEvent(event, "missing_external_id", intentStore, rawBodyHash, eventFingerprint);
  if (externalId !== intent.intentId) return rejectParsedEvent(event, "external_id_mismatch", intentStore, rawBodyHash, eventFingerprint);

  const hasProductId = hasOwn(data, "productId");
  const hasProductMetadata = hasOwn(data, "productMetadata");
  const hasProduct = hasOwn(data, "product");
  const productId = hasProductId ? readProviderIdentifier(data.productId) : undefined;
  if (hasProductId && !productId) return rejectParsedEvent(event, "malformed_product_id", intentStore, rawBodyHash, eventFingerprint);
  const productMetadata = hasProductMetadata ? readMetadata(data.productMetadata) : undefined;
  if (hasProductMetadata && !productMetadata) {
    return rejectParsedEvent(event, "malformed_product_metadata", intentStore, rawBodyHash, eventFingerprint);
  }
  const metadataProductId = readProviderIdentifier(productMetadata?.productId);
  if (hasProductMetadata && Object.prototype.hasOwnProperty.call(productMetadata ?? {}, "productId") && !metadataProductId) {
    return rejectParsedEvent(event, "malformed_product_id", intentStore, rawBodyHash, eventFingerprint);
  }
  const expectedProductId = productId ?? metadataProductId;
  if (!expectedProductId) return rejectParsedEvent(event, "missing_product_id", intentStore, rawBodyHash, eventFingerprint);
  if (expectedProductId !== intent.productId) return rejectParsedEvent(event, "product_mismatch", intentStore, rawBodyHash, eventFingerprint);
  if (data.productName !== WAFFO_PRODUCT_NAME) {
    return rejectParsedEvent(event, "product_name_mismatch", intentStore, rawBodyHash, eventFingerprint);
  }
  if (hasProduct) {
    const product = data.product;
    if (!product || typeof product !== "object" || Array.isArray(product)) {
      return rejectParsedEvent(event, "malformed_product", intentStore, rawBodyHash, eventFingerprint);
    }
    const nestedProductId = readProviderIdentifier((product as Record<string, unknown>).id);
    if (!nestedProductId) return rejectParsedEvent(event, "malformed_product", intentStore, rawBodyHash, eventFingerprint);
    if (nestedProductId !== intent.productId) return rejectParsedEvent(event, "product_mismatch", intentStore, rawBodyHash, eventFingerprint);
  }

  const hasCheckoutId = hasOwn(data, "checkoutId");
  if (hasCheckoutId) {
    const checkoutId = readProviderIdentifier(data.checkoutId);
    if (!checkoutId) return rejectParsedEvent(event, "malformed_checkout_id", intentStore, rawBodyHash, eventFingerprint);
    if (intent.providerCheckoutId && checkoutId !== intent.providerCheckoutId) {
      return rejectParsedEvent(event, "checkout_mismatch", intentStore, rawBodyHash, eventFingerprint);
    }
  }

  const hasSubtotal = Object.prototype.hasOwnProperty.call(data, "subtotal");
  const hasTotal = Object.prototype.hasOwnProperty.call(data, "total");
  const hasTax = Object.prototype.hasOwnProperty.call(data, "taxAmount");
  const subtotal = hasSubtotal ? decimalToCents(data.subtotal) : undefined;
  const tax = hasTax ? decimalToCents(data.taxAmount) : undefined;
  const total = hasTotal ? decimalToCents(data.total) : undefined;
  const amount = decimalToCents(data.amount);
  // A malformed or missing provider money field is a terminally invalid
  // event, while a well-formed amount that disagrees with the immutable
  // intent is a captured-payment inconsistency that needs reconciliation.
  if (amount === undefined) {
    return rejectParsedEvent(event, "malformed_amount", intentStore, rawBodyHash, eventFingerprint);
  }
  if (hasSubtotal && subtotal === undefined) {
    return rejectParsedEvent(event, "malformed_subtotal", intentStore, rawBodyHash, eventFingerprint);
  }
  if (!hasTax || tax === undefined) {
    return rejectParsedEvent(event, "malformed_tax", intentStore, rawBodyHash, eventFingerprint);
  }
  if (hasTotal && total === undefined) {
    return rejectParsedEvent(event, "malformed_total", intentStore, rawBodyHash, eventFingerprint);
  }
  const subtotalChargeIsConsistent = hasSubtotal
    && subtotal === intent.chargeCents
    && hasTax
    && tax !== undefined
    && amount !== undefined
    && Number.isSafeInteger(subtotal + (tax ?? 0))
    && (amount === subtotal || amount === subtotal + (tax ?? 0))
    && (!hasTotal || (total !== undefined && total === subtotal + (tax ?? 0)));
  const noSubtotalChargeIsConsistent = !hasSubtotal
    && hasTax
    && tax === 0
    && amount === intent.chargeCents
    && (!hasTotal || (total !== undefined && total === amount));
  if (!(subtotalChargeIsConsistent || noSubtotalChargeIsConsistent)) {
    return rejectParsedEvent(event, "amount_mismatch", intentStore, rawBodyHash, eventFingerprint, "needs_reconciliation");
  }

  const timestamp = providerTimestampState(event.timestamp, options.receivedAt);
  if (timestamp.kind !== "valid") {
    return timestamp.kind === "invalid"
      ? rejectParsedEvent(event, "invalid_provider_timestamp", intentStore, rawBodyHash, eventFingerprint)
      : rejectParsedEvent(event, timestamp.kind === "stale" ? "stale_payment" : "future_provider_timestamp", intentStore, rawBodyHash, eventFingerprint, "needs_reconciliation");
  }

  const settlementEvent: WaffoSettlementEvent = { ...event, timestamp: timestamp.iso };
  try {
    return intentStore.settleWaffoEvent({
      event: settlementEvent,
      paymentId: identity.paymentId,
      orderId: identity.orderId,
      intentId: identity.intentId,
      rawBodyHash,
      eventFingerprint,
      receivedAt: options.receivedAt,
      beforeListingMutation: options.beforeListingMutation,
    });
  } catch {
    return { status: "retryable", code: "atomic_rollback", intentId: identity.intentId };
  }
}
