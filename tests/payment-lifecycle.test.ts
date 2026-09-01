import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { BoardStore } from "../src/lib/store";
import { draftFromOutbidInput } from "../src/lib/listing";
import { rankListings } from "../src/lib/rank";
import {
  getPaymentMode,
  isPublicHostname,
  requireDatabasePath,
  requireWaffoConfig,
  type PaymentEnv,
} from "../src/payments/env";
import { getPolarPort, handleCheckoutReturn } from "../src/payments/port";
import {
  centsToDisplayString,
  decimalToCents,
  closeWaffoRuntimeResources,
  handleWaffoWebhook,
  LiveWaffoPort,
  metadataForIntent,
  waffoRuntimeResourceCount,
  type WaffoWebhookOptions,
} from "../src/payments/waffo";
import { FakePolarPort } from "../src/payments/fixture";
import { LivePolarPort } from "../src/payments/polar";
import { PaymentIntentStore } from "../src/payments/port";
import { validateProductionStartup } from "../src/instrumentation-node";

const PERIOD = "2026-W34";
const MERCHANT = `MER_${"A".repeat(22)}`;
const STORE = `STO_${"B".repeat(22)}`;
const PRODUCT = `PROD_${"C".repeat(22)}`;
const { privateKey: signingPrivateKey, publicKey: signingPublicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY = signingPrivateKey.export({ type: "pkcs8", format: "pem" }).toString();
const PUBLIC_KEY = signingPublicKey.export({ type: "spki", format: "pem" }).toString();
const resources: Array<() => void> = [];

afterEach(() => {
  while (resources.length > 0) resources.pop()?.();
});

function setup(fetch?: typeof globalThis.fetch): {
  path: string;
  directory: string;
  env: PaymentEnv;
  store: BoardStore;
  intentStore: PaymentIntentStore;
  waffo: LiveWaffoPort;
} {
  const directory = mkdtempSync(join(tmpdir(), "remote-job-board-waffo-"));
  const path = join(directory, "board.sqlite");
  const store = new BoardStore(path);
  const intentStore = new PaymentIntentStore(path);
  const env: PaymentEnv = {
    NODE_ENV: "test",
    WAFFO_MODE: "waffo-test",
    DATABASE_PATH: path,
    WAFFO_MERCHANT_ID: MERCHANT,
    WAFFO_PRIVATE_KEY: PRIVATE_KEY,
    WAFFO_STORE_ID: STORE,
    WAFFO_PRODUCT_ID: PRODUCT,
    WAFFO_PUBLIC_BASE_URL: "https://jobs.example.test",
    WAFFO_API_BASE: "https://waffo.test.invalid",
    WAFFO_ALLOW_TEST_API_OVERRIDE: "1",
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY: PUBLIC_KEY,
  };
  let checkoutNumber = 0;
  const checkoutFetch: typeof globalThis.fetch = fetch ?? (async () => {
    checkoutNumber += 1;
    const sessionId = `CS_${String(checkoutNumber).padStart(22, "0")}`;
    return new Response(JSON.stringify({
      data: {
        sessionId,
        checkoutUrl: `https://pancake.waffo.ai/store/remote-jobs/checkout/${sessionId}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const waffo = new LiveWaffoPort({ env, store, intentStore, fetch: checkoutFetch });
  resources.push(() => {
    intentStore.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { path, directory, env, store, intentStore, waffo };
}

function roleDraft(identity: string, amountUsd: number, payerId = "pay_acme") {
  return draftFromOutbidInput({
    identity,
    amountUsd,
    lane: "backend",
    periodId: PERIOD,
    title: "Staff Backend Engineer",
    company: "Acme",
    payerId,
  });
}

function signedEvent(input: {
  deliveryId: string;
  paymentId: string;
  orderId: string;
  intentId: string;
  metadata: Record<string, string>;
  amount?: string | null;
  subtotal?: string | null;
  taxAmount?: string | null;
  total?: string | null;
  omitAmount?: boolean;
  omitSubtotal?: boolean;
  omitTaxAmount?: boolean;
  omitTotal?: boolean;
  omitPaymentId?: boolean;
  paymentIdValue?: string;
  mode?: "test" | "prod";
  storeId?: string;
  orderStatus?: string;
  paymentStatus?: string;
  currency?: string;
  checkoutId?: string;
  checkoutIdValue?: unknown;
  productId?: string;
  productIdValue?: unknown;
  productValue?: unknown;
  eventType?: string;
  timestamp?: string;
}): { body: string; signature: string } {
  const body = JSON.stringify({
    id: input.deliveryId,
    timestamp: input.timestamp ?? "2026-08-27T00:00:00.000Z",
    eventType: input.eventType ?? "order.completed",
    eventId: input.paymentId,
    storeId: input.storeId ?? STORE,
    storeName: "Remote Jobs",
    mode: input.mode ?? "test",
    data: {
      orderId: input.orderId,
      orderStatus: input.orderStatus ?? "completed",
      buyerEmail: "buyer@example.com",
      orderMerchantExternalId: input.intentId,
      currency: input.currency ?? "USD",
      ...(input.omitAmount ? {} : { amount: input.amount === undefined ? "5.00" : input.amount }),
      ...(input.omitTaxAmount ? {} : { taxAmount: input.taxAmount === undefined ? "0.00" : input.taxAmount }),
      ...(input.omitSubtotal ? {} : { subtotal: input.subtotal === undefined ? input.amount ?? "5.00" : input.subtotal }),
      ...(input.omitTotal ? {} : { total: input.total === undefined ? input.amount ?? "5.00" : input.total }),
      ...(input.omitPaymentId ? {} : { paymentId: input.paymentIdValue ?? input.paymentId }),
      paymentStatus: input.paymentStatus ?? "succeeded",
      ...(Object.prototype.hasOwnProperty.call(input, "productIdValue")
        ? { productId: input.productIdValue }
        : { productId: input.productId ?? PRODUCT }),
      ...(Object.prototype.hasOwnProperty.call(input, "productValue") ? { product: input.productValue } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "checkoutIdValue")
        ? { checkoutId: input.checkoutIdValue }
        : input.checkoutId === undefined ? {} : { checkoutId: input.checkoutId }),
      orderMetadata: input.metadata,
      productName: "Rank",
    },
  });
  const timestamp = String(Date.now());
  const signer = createSign("RSA-SHA256");
  signer.update(`${timestamp}.${body}`);
  return { body, signature: `t=${timestamp},v1=${signer.sign(PRIVATE_KEY, "base64")}` };
}

async function createIntent(
  fixture: ReturnType<typeof setup>,
  amountUsd: number,
  draft: ReturnType<typeof roleDraft>,
) {
  const started = await fixture.waffo.createCheckout({
    amountUsd,
    listingDraft: draft,
    successUrl: "https://ignored.example.test/return",
  });
  assert.ok(started.intentId);
  const intent = fixture.intentStore.getByIntentId(started.intentId);
  assert.ok(intent);
  return { started, intent };
}

function eventFor(
  fixture: ReturnType<typeof setup>,
  input: { deliveryId: string; paymentId: string; orderId: string; intentId: string; amount?: string | null; subtotal?: string | null; taxAmount?: string | null; total?: string | null; omitAmount?: boolean; omitSubtotal?: boolean; omitTaxAmount?: boolean; omitTotal?: boolean; omitPaymentId?: boolean; paymentIdValue?: string; [key: string]: unknown },
) {
  const intent = fixture.intentStore.getByIntentId(input.intentId);
  assert.ok(intent);
  return signedEvent({
    deliveryId: input.deliveryId,
    paymentId: input.paymentId,
    orderId: input.orderId,
    intentId: input.intentId,
    metadata: metadataForIntent(intent),
    ...(input.amount === undefined ? {} : { amount: input.amount }),
    ...(input.subtotal === undefined ? {} : { subtotal: input.subtotal }),
    ...(input.taxAmount === undefined ? {} : { taxAmount: input.taxAmount }),
    ...(input.total === undefined ? {} : { total: input.total }),
    ...(input.omitAmount === undefined ? {} : { omitAmount: input.omitAmount }),
    ...(input.omitSubtotal === undefined ? {} : { omitSubtotal: input.omitSubtotal }),
    ...(input.omitTaxAmount === undefined ? {} : { omitTaxAmount: input.omitTaxAmount }),
    ...(input.omitTotal === undefined ? {} : { omitTotal: input.omitTotal }),
    ...(input.omitPaymentId === undefined ? {} : { omitPaymentId: input.omitPaymentId }),
    ...(typeof input.paymentIdValue === "string" ? { paymentIdValue: input.paymentIdValue } : {}),
    ...(typeof input.checkoutId === "string" ? { checkoutId: input.checkoutId } : {}),
    ...(typeof input.productId === "string" ? { productId: input.productId } : {}),
    ...(typeof input.mode === "string" ? { mode: input.mode as "test" | "prod" } : {}),
    ...(typeof input.storeId === "string" ? { storeId: input.storeId } : {}),
    ...(typeof input.orderStatus === "string" ? { orderStatus: input.orderStatus } : {}),
    ...(typeof input.paymentStatus === "string" ? { paymentStatus: input.paymentStatus } : {}),
    ...(typeof input.currency === "string" ? { currency: input.currency } : {}),
    ...(typeof input.eventType === "string" ? { eventType: input.eventType } : {}),
    ...(typeof input.timestamp === "string" ? { timestamp: input.timestamp } : {}),
  });
}

function webhookOptions(fixture: ReturnType<typeof setup>, extra: Partial<WaffoWebhookOptions> = {}): WaffoWebhookOptions {
  return { env: fixture.env, store: fixture.store, intentStore: fixture.intentStore, publicKey: PUBLIC_KEY, ...extra };
}

test("Waffo mode is explicit, production rejects fixture, and Polar flags cannot select it", () => {
  assert.equal(getPaymentMode({ WAFFO_MODE: "fixture", CI: "1", POLAR_LIVE: "1" }), "fixture");
  assert.equal(getPaymentMode({ WAFFO_MODE: "waffo-test" }), "waffo-test");
  assert.equal(getPaymentMode({ WAFFO_MODE: "waffo-prod" }), "waffo-prod");
  assert.throws(
    () => getPaymentMode({ NODE_ENV: "production", WAFFO_MODE: "fixture" }),
    /BLOCKED-CONFIG: FIXTURE_DISABLED_IN_PRODUCTION/,
  );
  assert.throws(
    () => getPaymentMode({ NODE_ENV: "production", WAFFO_MODE: "waffo-test" }),
    /BLOCKED-CONFIG: WAFFO_MODE_PRODUCTION/,
  );
  assert.throws(() => getPaymentMode({ CI: "1" }), /BLOCKED-CONFIG: WAFFO_MODE/);
  assert.throws(() => getPaymentMode({}), /BLOCKED-CONFIG: WAFFO_MODE/);
  assert.throws(() => new LivePolarPort({ env: { WAFFO_MODE: "waffo-test" } }), /POLAR_PROVIDER_DISABLED/);

  const store = new BoardStore();
  try {
    assert.throws(
      () => getPolarPort(store, { NODE_ENV: "production", WAFFO_MODE: "fixture" }),
      /BLOCKED-CONFIG: FIXTURE_DISABLED_IN_PRODUCTION/,
    );
    assert.throws(
      () => new FakePolarPort(store, { NODE_ENV: "production", WAFFO_MODE: "fixture" }),
      /BLOCKED-CONFIG: FIXTURE_DISABLED_IN_PRODUCTION/,
    );
  } finally {
    store.close();
  }
});

test("production fixture and missing durable storage stay blocked during Next build phase", async () => {
  const env: PaymentEnv = {
    NODE_ENV: "production",
    NEXT_PHASE: "phase-production-build",
    WAFFO_MODE: "fixture",
  };
  assert.throws(() => getPaymentMode(env), /BLOCKED-CONFIG: FIXTURE_DISABLED_IN_PRODUCTION/);
  const blockedStore = new BoardStore();
  try {
    assert.throws(() => getPolarPort(blockedStore, env), /BLOCKED-CONFIG: FIXTURE_DISABLED_IN_PRODUCTION/);
    assert.throws(() => new FakePolarPort(blockedStore, env), /BLOCKED-CONFIG: FIXTURE_DISABLED_IN_PRODUCTION/);
  } finally {
    blockedStore.close();
  }
  assert.throws(() => requireDatabasePath(env), /BLOCKED-CONFIG: DATABASE_PATH/);
  assert.throws(
    () => requireDatabasePath({ ...env, DATABASE_PATH: ":memory:" }),
    /BLOCKED-CONFIG: DATABASE_PATH/,
  );
  assert.throws(
    () => requireDatabasePath({ ...env, DATABASE_PATH: "file:shared?mode=memory&cache=shared" }),
    /BLOCKED-CONFIG: DATABASE_PATH/,
  );

  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousMode = mutableEnv.WAFFO_MODE;
  const previousNodeEnv = mutableEnv.NODE_ENV;
  const previousNextPhase = mutableEnv.NEXT_PHASE;
  mutableEnv.WAFFO_MODE = "fixture";
  mutableEnv.NODE_ENV = "production";
  mutableEnv.NEXT_PHASE = "phase-production-build";
  try {
    const form = new URLSearchParams({
      lane: "backend",
      identity: "https://jobs.example.com/phase-build",
      amount: "5",
      title: "Staff Backend Engineer",
      company: "Acme",
    });
    const { POST } = await import("../src/app/checkout/route");
    await assert.rejects(
      () => POST(new Request("http://localhost/checkout", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      })),
      /BLOCKED-CONFIG: FIXTURE_DISABLED_IN_PRODUCTION/,
    );
  } finally {
    if (previousMode === undefined) delete mutableEnv.WAFFO_MODE;
    else mutableEnv.WAFFO_MODE = previousMode;
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
    if (previousNextPhase === undefined) delete mutableEnv.NEXT_PHASE;
    else mutableEnv.NEXT_PHASE = previousNextPhase;
  }
});

test("production config fails before constructing a network checkout", () => {
  const missing = [
    "WAFFO_MERCHANT_ID",
    "WAFFO_PRIVATE_KEY",
    "WAFFO_STORE_ID",
    "WAFFO_PRODUCT_ID",
    "WAFFO_PUBLIC_BASE_URL",
    "DATABASE_PATH",
    "WAFFO_WEBHOOK_PROD_PUBLIC_KEY",
  ] as const;
  for (const name of missing) {
    const env: PaymentEnv = {
      NODE_ENV: "production",
      WAFFO_MODE: "waffo-prod",
      WAFFO_MERCHANT_ID: MERCHANT,
      WAFFO_PRIVATE_KEY: PRIVATE_KEY,
      WAFFO_STORE_ID: STORE,
      WAFFO_PRODUCT_ID: PRODUCT,
      WAFFO_PUBLIC_BASE_URL: "https://jobs.example.com",
      WAFFO_WEBHOOK_PROD_PUBLIC_KEY: PUBLIC_KEY,
      DATABASE_PATH: "/tmp/waffo-config-test.sqlite",
    };
    delete env[name];
    assert.throws(() => requireWaffoConfig(env), new RegExp(`BLOCKED-(?:CONFIG|SECRET): ${name}`));
  }
  let calls = 0;
  assert.throws(() => new LiveWaffoPort({
    env: { NODE_ENV: "production", WAFFO_MODE: "waffo-prod" },
    fetch: async () => { calls += 1; return new Response(); },
  }), /BLOCKED-CONFIG/);
  assert.equal(calls, 0);

  const validProd: PaymentEnv = {
    NODE_ENV: "production",
    WAFFO_MODE: "waffo-prod",
    WAFFO_MERCHANT_ID: MERCHANT,
    WAFFO_PRIVATE_KEY: PRIVATE_KEY,
    WAFFO_STORE_ID: STORE,
    WAFFO_PRODUCT_ID: PRODUCT,
    WAFFO_PUBLIC_BASE_URL: "https://jobs.example.com",
    WAFFO_WEBHOOK_PROD_PUBLIC_KEY: PUBLIC_KEY,
    DATABASE_PATH: "/tmp/waffo-config-test.sqlite",
  };
  assert.throws(
    () => requireWaffoConfig({ ...validProd, WAFFO_PUBLIC_BASE_URL: "https://127.0.0.1" }),
    /BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL_PUBLIC/,
  );
  for (const host of [
    "https://localhost.",
    "https://localhost%2e",
    "https://127.0.0.1.",
    "https://0177.0.0.1",
    "https://0x7f.0.0.1",
    "https://2130706433",
    "https://[::1]",
    "https://[::ffff:7f00:1]",
  ]) {
    assert.throws(
      () => requireWaffoConfig({ ...validProd, WAFFO_PUBLIC_BASE_URL: host }),
      /BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL_PUBLIC/,
      host,
    );
  }
  for (const host of ["localhost.", "localhost%2e", "0177.0.0.1", "0x7f.0.0.1", "2130706433", "[::1]", "[fec0::1]"]) {
    assert.equal(isPublicHostname(host), false, host);
  }
  assert.throws(
    () => requireWaffoConfig({ ...validProd, WAFFO_PUBLIC_BASE_URL: "https://jobs.example.test" }),
    /BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL_PUBLIC/,
  );
  assert.throws(
    () => requireWaffoConfig({ ...validProd, WAFFO_API_BASE: "https://attacker.example" }),
    /BLOCKED-CONFIG: WAFFO_API_BASE_OFFICIAL/,
  );
  assert.throws(
    () => requireWaffoConfig({ ...validProd, WAFFO_API_BASE: "http://api.waffo.ai" }),
    /BLOCKED-CONFIG: WAFFO_API_BASE/,
  );
  for (const publicBase of [
    "https://jobs.example.com/path",
    "https://jobs.example.com/?next=evil",
    "https://jobs.example.com/#fragment",
  ]) {
    assert.throws(
      () => requireWaffoConfig({ ...validProd, WAFFO_PUBLIC_BASE_URL: publicBase }),
      /BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL_ORIGIN/,
    );
  }
  const valid = requireWaffoConfig(validProd);
  assert.equal(valid.apiBase, "https://api.waffo.ai");
  assert.throws(
    () => validateProductionStartup({ ...validProd, WAFFO_PRIVATE_KEY: "not-a-key" }),
    /BLOCKED-CONFIG: WAFFO_PRIVATE_KEY/,
  );
  assert.throws(
    () => validateProductionStartup({ ...validProd, WAFFO_WEBHOOK_PROD_PUBLIC_KEY: "not-a-key" }),
    /BLOCKED-CONFIG: WAFFO_WEBHOOK_PROD_PUBLIC_KEY/,
  );

  const validTest: PaymentEnv = {
    ...validProd,
    NODE_ENV: "test",
    WAFFO_MODE: "waffo-test",
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY: PUBLIC_KEY,
    WAFFO_ALLOW_TEST_API_OVERRIDE: "1",
    WAFFO_API_BASE: "https://waffo.test.invalid",
  };
  const testConfig = requireWaffoConfig(validTest);
  assert.equal(testConfig.apiBase, "https://waffo.test.invalid");
  assert.throws(
    () => requireWaffoConfig({ ...validTest, WAFFO_PUBLIC_BASE_URL: "https://jobs.example.test/path" }),
    /BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL_ORIGIN/,
  );
  assert.throws(
    () => requireWaffoConfig({ ...validTest, WAFFO_WEBHOOK_TEST_PUBLIC_KEY: undefined, WAFFO_WEBHOOK_PUBLIC_KEY: undefined }),
    /BLOCKED-CONFIG: WAFFO_WEBHOOK_TEST_PUBLIC_KEY/,
  );
  assert.throws(
    () => requireWaffoConfig({ ...validTest, WAFFO_WEBHOOK_TEST_PUBLIC_KEY: undefined, WAFFO_WEBHOOK_PROD_PUBLIC_KEY: PUBLIC_KEY }),
    /BLOCKED-CONFIG: WAFFO_WEBHOOK_TEST_PUBLIC_KEY/,
  );
  assert.throws(
    () => requireWaffoConfig({ ...validProd, WAFFO_WEBHOOK_PROD_PUBLIC_KEY: undefined, WAFFO_WEBHOOK_TEST_PUBLIC_KEY: PUBLIC_KEY }),
    /BLOCKED-CONFIG: WAFFO_WEBHOOK_PROD_PUBLIC_KEY/,
  );
  assert.throws(
    () => requireWaffoConfig({ ...validTest, WAFFO_ALLOW_TEST_API_OVERRIDE: undefined }),
    /BLOCKED-CONFIG: WAFFO_API_BASE_TEST_OVERRIDE/,
  );
});

test("a production startup child rejects missing mode and fixture before listening", () => {
  const probe = (extra: Record<string, string> = {}) => spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--eval",
      "import('./src/instrumentation.ts').then(({ register }) => register()).catch((error) => { console.error(error.message); process.exit(17); })",
    ],
    {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "production",
        NEXT_PHASE: "",
        ...extra,
      },
      encoding: "utf8",
      timeout: 2_000,
    },
  );
  const missingMode = probe();
  assert.notEqual(missingMode.status, 0);
  assert.match(`${missingMode.stdout}${missingMode.stderr}`, /BLOCKED-CONFIG: WAFFO_MODE/);
  const fixture = probe({ WAFFO_MODE: "fixture", DATABASE_PATH: ":memory:" });
  assert.notEqual(fixture.status, 0);
  assert.match(`${fixture.stdout}${fixture.stderr}`, /FIXTURE_DISABLED_IN_PRODUCTION/);
});

test("request-owned checkout and webhook resources reuse one bounded SQLite pair", async () => {
  const directory = mkdtempSync(join(tmpdir(), "remote-job-board-waffo-runtime-"));
  const path = join(directory, "board.sqlite");
  const env: PaymentEnv = {
    NODE_ENV: "test",
    WAFFO_MODE: "waffo-test",
    DATABASE_PATH: path,
    WAFFO_MERCHANT_ID: MERCHANT,
    WAFFO_PRIVATE_KEY: PRIVATE_KEY,
    WAFFO_STORE_ID: STORE,
    WAFFO_PRODUCT_ID: PRODUCT,
    WAFFO_PUBLIC_BASE_URL: "https://jobs.example.test",
    WAFFO_API_BASE: "https://waffo.test.invalid",
    WAFFO_ALLOW_TEST_API_OVERRIDE: "1",
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY: PUBLIC_KEY,
  };
  const before = waffoRuntimeResourceCount();
  try {
    const first = new LiveWaffoPort({ env, fetch: async () => new Response() });
    const second = new LiveWaffoPort({ env, fetch: async () => new Response() });
    assert.equal(first.paymentIntents, second.paymentIntents);
    assert.equal(waffoRuntimeResourceCount(), before + 1);
    await handleWaffoWebhook("{}", "", { env, publicKey: PUBLIC_KEY });
    assert.equal(waffoRuntimeResourceCount(), before + 1);
  } finally {
    closeWaffoRuntimeResources(path);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("official SDK receives exact anonymous checkout fields and decimal price snapshot", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fixture = setup(async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(JSON.stringify({ data: {
      sessionId: "CS_1234567890123456789012",
      checkoutUrl: "https://pancake.waffo.ai/store/remote-jobs/checkout/CS_1234567890123456789012",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    } }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const { started, intent } = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/acme", 5));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://waffo.test.invalid/v1/actions/checkout/create-session");
  assert.deepEqual(calls[0]?.body.priceSnapshot, { amount: "5.00", taxCategory: "digital_goods" });
  assert.equal(calls[0]?.body.productId, PRODUCT);
  assert.equal(calls[0]?.body.currency, "USD");
  assert.equal(calls[0]?.body.successUrl, `https://jobs.example.test/checkout/complete?intent=${encodeURIComponent(intent.intentId)}`);
  assert.equal(calls[0]?.body.orderMerchantExternalId, intent.intentId);
  const metadata = calls[0]?.body.metadata as Record<string, unknown>;
  assert.ok(metadata);
  assert.equal(metadata.intentFingerprint, intent.fingerprint);
  assert.equal(Object.values(metadata).every((value) => typeof value === "string"), true);
  assert.equal(started.checkoutId, "CS_1234567890123456789012");
  assert.equal(fixture.intentStore.getByIntentId(intent.intentId)?.status, "open");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 0);
});

test("live browser return cancellation is informational and cannot abandon an intent", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/return-read-only", 5));
  const result = await handleCheckoutReturn(
    { checkoutId: created.started.checkoutId, status: "cancel" },
    fixture.waffo,
  );
  assert.equal(result.status, "cancel");
  assert.equal(result.listing, null);
  assert.equal(fixture.intentStore.getByIntentId(created.intent.intentId)?.status, "open");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 0);
});

test("signed payment identity is explicit and must equal eventId", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/payment-identity", 5));
  const cases: Array<[string, Record<string, unknown>]> = [
    ["missing", { omitPaymentId: true }],
    ["empty", { paymentIdValue: "" }],
    ["mismatch", { paymentIdValue: "PAY_body_only" }],
  ];
  for (const [name, changes] of cases) {
    const target = name === "missing"
      ? created
      : await createIntent(fixture, 5, roleDraft(`https://jobs.example.com/payment-identity-${name}`, 5));
    const event = eventFor(fixture, {
      deliveryId: `delivery_payment_identity_${name}`,
      paymentId: `PAY_event_${name}`,
      orderId: `ORD_payment_identity_${name}`,
      intentId: target.intent.intentId,
      checkoutId: target.started.checkoutId,
      ...changes,
    });
    const result = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
    assert.equal(result.status, "rejected", name);
    assert.equal(result.code, name === "mismatch" ? "payment_event_mismatch" : "missing_payment_identity", name);
  }
  assert.deepEqual(fixture.store.listPaid("backend", PERIOD), []);
});

test("exact decimal money parser rejects binary/over-precision values", () => {
  assert.equal(decimalToCents("5"), 500);
  assert.equal(decimalToCents("5.0"), 500);
  assert.equal(decimalToCents("5.00"), 500);
  assert.equal(decimalToCents("5.001"), undefined);
  assert.equal(decimalToCents("5.1x"), undefined);
  assert.equal(centsToDisplayString(1200), "12.00");
});

test("ambiguous timeout is persisted unknown and can later recover by signed intent", async () => {
  const fixture = setup(async () => { throw new TypeError("socket timeout"); });
  const draft = roleDraft("https://jobs.example.com/timeout", 5);
  let intentId = "";
  await assert.rejects(async () => {
    const started = await fixture.waffo.createCheckout({ amountUsd: 5, listingDraft: draft, successUrl: "https://ignored" });
    intentId = started.intentId ?? "";
  });
  if (!intentId) intentId = fixture.intentStore.getLatestIntent()?.intentId ?? "";
  assert.ok(intentId);
  assert.equal(fixture.intentStore.getByIntentId(intentId)?.status, "unknown");
  const event = eventFor(fixture, { deliveryId: "delivery_timeout", paymentId: "PAY_timeout", orderId: "ORD_timeout", intentId });
  const result = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
  assert.equal(result.status, "applied");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 1);
});

test("bounded SDK timeout aborts a hanging fetch and the signed event recovers it", async () => {
  const fixture = setup();
  let observedSignal: AbortSignal | undefined;
  const hangingFetch: typeof globalThis.fetch = async (_input, init) => {
    observedSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing abort signal"));
        return;
      }
      if (signal.aborted) {
        reject(new Error("aborted"));
        return;
      }
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  };
  const waffo = new LiveWaffoPort({
    env: { ...fixture.env, WAFFO_REQUEST_TIMEOUT_MS: "60" },
    store: fixture.store,
    intentStore: fixture.intentStore,
    fetch: hangingFetch,
    timeoutMs: 60,
  });
  await assert.rejects(() => waffo.createCheckout({
    amountUsd: 5,
    listingDraft: roleDraft("https://jobs.example.com/abort-recovery", 5),
    successUrl: "https://ignored.example.test/return",
  }));
  assert.ok(observedSignal);
  assert.equal(observedSignal?.aborted, true);
  const intent = fixture.intentStore.getLatestIntent();
  assert.ok(intent);
  assert.equal(intent.status, "unknown");

  const event = eventFor(fixture, {
    deliveryId: "delivery_abort_recovery",
    paymentId: "PAY_abort_recovery",
    orderId: "ORD_abort_recovery",
    intentId: intent.intentId,
  });
  const recovered = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
  assert.equal(recovered.status, "applied");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 1);
});

test("the SDK body timeout aborts stalled JSON parsing and leaves signed recovery available", async () => {
  const fixture = setup();
  let observedSignal: AbortSignal | undefined;
  const stalledBodyFetch: typeof globalThis.fetch = async (_input, init) => {
    observedSignal = init?.signal ?? undefined;
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    return new Response(stream, { status: 201, headers: { "content-type": "application/json" } });
  };
  const waffo = new LiveWaffoPort({
    env: { ...fixture.env, WAFFO_REQUEST_TIMEOUT_MS: "40" },
    store: fixture.store,
    intentStore: fixture.intentStore,
    fetch: stalledBodyFetch,
    timeoutMs: 40,
  });
  const startedAt = Date.now();
  await assert.rejects(() => waffo.createCheckout({
    amountUsd: 5,
    listingDraft: roleDraft("https://jobs.example.com/stalled-body", 5),
    successUrl: "https://ignored.example.test/return",
  }));
  assert.ok(Date.now() - startedAt < 500);
  assert.equal(observedSignal?.aborted, true);
  const intent = fixture.intentStore.getLatestIntent();
  assert.ok(intent);
  assert.equal(intent.status, "unknown");
  const event = eventFor(fixture, {
    deliveryId: "delivery_stalled_body_recovery",
    paymentId: "PAY_stalled_body_recovery",
    orderId: "ORD_stalled_body_recovery",
    intentId: intent.intentId,
  });
  assert.equal((await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture))).status, "applied");
});

test("408, 409, 425, 429, 5xx, and incomplete provider responses stay ambiguous and recover by signature", async () => {
  const cases: Array<[string, number, string]> = [
    ["timeout", 408, JSON.stringify({ errors: [{ message: "timeout" }] })],
    ["conflict", 409, JSON.stringify({ errors: [{ message: "accepted checkout may be in flight" }] })],
    ["too-early", 425, JSON.stringify({ errors: [{ message: "accepted checkout may be in flight" }] })],
    ["rate-limit", 429, JSON.stringify({ errors: [{ message: "rate limited" }] })],
    ["server-error", 503, JSON.stringify({ errors: [{ message: "unavailable" }] })],
    ["server-data", 500, JSON.stringify({ data: {
      sessionId: "CS_ambiguous_server_data",
      checkoutUrl: "https://pancake.waffo.ai/store/remote-jobs/checkout/CS_ambiguous_server_data",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    } })],
    ["non-json", 201, "not-json"],
  ];
  for (const [name, status, body] of cases) {
    const fixture = setup(async () => new Response(body, {
      status,
      headers: { "content-type": name === "non-json" ? "text/plain" : "application/json" },
    }));
    await assert.rejects(() => fixture.waffo.createCheckout({
      amountUsd: 5,
      listingDraft: roleDraft(`https://jobs.example.com/ambiguous-${name}`, 5),
      successUrl: "https://ignored.example.test/return",
    }));
    const intent = fixture.intentStore.getLatestIntent();
    assert.ok(intent);
    assert.equal(intent.status, "unknown", name);
    const event = eventFor(fixture, {
      deliveryId: `delivery_ambiguous_${name}`,
      paymentId: `PAY_ambiguous_${name}`,
      orderId: `ORD_ambiguous_${name}`,
      intentId: intent.intentId,
    });
    assert.equal((await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture))).status, "applied", name);
    assert.equal(fixture.store.listPaid("backend", PERIOD).length, 1, name);
  }
});

test("checkout response must provide an HTTPS URL", async () => {
  const fixture = setup(async () => new Response(JSON.stringify({
    data: {
      sessionId: "CS_HTTP_RESPONSE",
      checkoutUrl: "http://pancake.waffo.ai/checkout/CS_HTTP_RESPONSE",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  }), { status: 200, headers: { "content-type": "application/json" } }));
  await assert.rejects(() => fixture.waffo.createCheckout({
    amountUsd: 5,
    listingDraft: roleDraft("https://jobs.example.com/http-checkout", 5),
    successUrl: "https://ignored.example.test/return",
  }));
  assert.equal(fixture.intentStore.getLatestIntent()?.status, "unknown");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 0);
});

test("checkout response rejects private, reserved, and expired provider destinations", async () => {
  const fixture = setup();
  const cases: Array<[string, string]> = [
    ["loopback", "https://127.0.0.1/steal"],
    ["mapped-loopback", "https://[::ffff:7f00:1]/steal"],
    ["reserved", "https://checkout.example.test/session"],
  ];
  for (const [name, checkoutUrl] of cases) {
    const waffo = new LiveWaffoPort({
      env: fixture.env,
      store: fixture.store,
      intentStore: fixture.intentStore,
      fetch: async () => new Response(JSON.stringify({ data: {
        sessionId: `CS_${name}`,
        checkoutUrl,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      } }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    await assert.rejects(() => waffo.createCheckout({
      amountUsd: 5,
      listingDraft: roleDraft(`https://jobs.example.com/response-${name}`, 5),
      successUrl: "https://ignored.example.test/return",
    }));
    assert.equal(fixture.intentStore.getLatestIntent()?.status, "unknown");
  }

  const expired = new LiveWaffoPort({
    env: fixture.env,
    store: fixture.store,
    intentStore: fixture.intentStore,
    fetch: async () => new Response(JSON.stringify({ data: {
      sessionId: "CS_expired",
      checkoutUrl: "https://pancake.waffo.ai/store/remote-jobs/checkout/CS_expired",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    } }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  await assert.rejects(() => expired.createCheckout({
    amountUsd: 5,
    listingDraft: roleDraft("https://jobs.example.com/response-expired", 5),
    successUrl: "https://ignored.example.test/return",
  }));
  assert.equal(fixture.intentStore.getLatestIntent()?.status, "unknown");
});

test("checkout response accepts only the documented Waffo cashier host and path", async () => {
  const hostileUrls = [
    "https://attacker.com/checkout/CS_hostile_0",
    "https://pancake.waffo.ai.attacker.com/checkout/CS_hostile_1",
    "https://pancake.waffo.ai@attacker.com/checkout/CS_hostile_2",
    "https://xn--pancake-9za.waffo.ai/checkout/CS_hostile_3",
    "https://pancake.waffo.ai./checkout/CS_hostile_4",
    "https://pancake.waffo.ai:443/checkout/CS_hostile_5",
    "https://pancake.waffo.ai/checkout/CS_hostile_6?next=evil",
    "https://pancake.waffo.ai/checkout/CS_hostile_7#token=evil",
    "https://pancake.waffo.ai",
    "https://pancake.waffo.ai/other/CS_hostile_9",
  ];
  let index = 0;
  const fixture = setup(async () => {
    const sessionId = `CS_hostile_${index}`;
    const checkoutUrl = hostileUrls[index] ?? hostileUrls[0];
    index += 1;
    return new Response(JSON.stringify({ data: {
      sessionId,
      checkoutUrl,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    } }), { status: 201, headers: { "content-type": "application/json" } });
  });
  for (let i = 0; i < hostileUrls.length; i += 1) {
    await assert.rejects(() => fixture.waffo.createCheckout({
      amountUsd: 5,
      listingDraft: roleDraft(`https://jobs.example.com/hostile-${i}`, 5),
      successUrl: "https://ignored.example.test/return",
    }));
    assert.equal(fixture.intentStore.getLatestIntent()?.status, "unknown", hostileUrls[i]);
  }
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 0);
});

test("signed order.completed settles initial bid, preserves first paid tie, and exact replay is a no-op", async () => {
  const fixture = setup();
  const { started, intent } = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/acme", 5));
  const event = eventFor(fixture, {
    deliveryId: "delivery_initial",
    paymentId: "PAY_initial",
    orderId: "ORD_initial",
    intentId: intent.intentId,
    checkoutId: started.checkoutId,
  });
  const firstResult = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
  assert.equal(firstResult.status, "applied");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 1);
  const first = fixture.store.listPaid("backend", PERIOD)[0];
  assert.ok(first);
  assert.equal(first.bidUsd, 5);
  assert.equal(first.paidUsd, 5);
  assert.equal(first.createdAt, "2026-08-27T00:00:00.000Z");
  const replay = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
  assert.equal(replay.status, "duplicate");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 1);
    assert.equal(fixture.intentStore.getByIntentId(intent.intentId)?.firstPaidAt, first.createdAt);
});

test("settlement keeps tax out of rank and accepts consistent subtotal or inclusive amount", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/taxed", 5));
  const event = eventFor(fixture, {
    deliveryId: "delivery_taxed",
    paymentId: "PAY_taxed",
    orderId: "ORD_taxed",
    intentId: created.intent.intentId,
    checkoutId: created.started.checkoutId,
    subtotal: "5.00",
    taxAmount: "0.50",
    total: "5.50",
    amount: "5.50",
  });
  const result = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
  assert.equal(result.status, "applied");
  assert.equal(fixture.store.listPaid("backend", PERIOD)[0]?.paidUsd, 5);

  const subtotalAmount = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/taxed-subtotal", 5));
  const subtotalEvent = eventFor(fixture, {
    deliveryId: "delivery_taxed_subtotal",
    paymentId: "PAY_taxed_subtotal",
    orderId: "ORD_taxed_subtotal",
    intentId: subtotalAmount.intent.intentId,
    checkoutId: subtotalAmount.started.checkoutId,
    subtotal: "5.00",
    taxAmount: "0.50",
    total: "5.50",
    amount: "5.00",
  });
  assert.equal((await handleWaffoWebhook(subtotalEvent.body, subtotalEvent.signature, webhookOptions(fixture))).status, "applied");

  const optionalTotal = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/taxed-no-total", 5));
  const optionalTotalEvent = eventFor(fixture, {
    deliveryId: "delivery_taxed_no_total",
    paymentId: "PAY_taxed_no_total",
    orderId: "ORD_taxed_no_total",
    intentId: optionalTotal.intent.intentId,
    checkoutId: optionalTotal.started.checkoutId,
    subtotal: "5.00",
    taxAmount: "0.50",
    amount: "5.00",
    omitTotal: true,
  });
  assert.equal((await handleWaffoWebhook(optionalTotalEvent.body, optionalTotalEvent.signature, webhookOptions(fixture))).status, "applied");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 3);
});

test("subtotal-absent zero-tax settlement is valid while malformed amounts never rank", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/totals", 5));
  const noSubtotal = eventFor(fixture, {
    deliveryId: "delivery_no_subtotal",
    paymentId: "PAY_no_subtotal",
    orderId: "ORD_no_subtotal",
    intentId: created.intent.intentId,
    checkoutId: created.started.checkoutId,
    omitSubtotal: true,
  });
  assert.equal((await handleWaffoWebhook(noSubtotal.body, noSubtotal.signature, webhookOptions(fixture))).status, "applied");

  const cases: Array<[string, Record<string, unknown>]> = [
    ["nonzero_tax_without_subtotal", { omitSubtotal: true, taxAmount: "0.01", total: "5.01", amount: "5.00" }],
    ["wrong_total_without_subtotal", { omitSubtotal: true, total: "5.01" }],
    ["malformed_subtotal", { subtotal: null }],
    ["malformed_total", { total: null }],
    ["missing_tax", { omitTaxAmount: true }],
    ["missing_amount", { omitAmount: true }],
    ["malformed_tax", { taxAmount: null }],
    ["wrong_tax", { subtotal: "5.00", taxAmount: "0.60", total: "5.50", amount: "5.50" }],
    ["wrong_total", { subtotal: "5.00", taxAmount: "0.50", total: "5.40", amount: "5.40" }],
    ["wrong_amount", { subtotal: "5.00", taxAmount: "0.50", total: "5.50", amount: "5.40" }],
  ];
  for (const [name, changes] of cases) {
    const malformedIntent = await createIntent(fixture, 5, roleDraft(`https://jobs.example.com/totals-malformed-${name}`, 5));
    const event = eventFor(fixture, {
      deliveryId: `delivery_bad_total_${name}`,
      paymentId: `PAY_bad_total_${name}`,
      orderId: `ORD_bad_total_${name}`,
      intentId: malformedIntent.intent.intentId,
      checkoutId: malformedIntent.started.checkoutId,
      ...changes,
    });
    const result = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
    const malformedFields = name.startsWith("malformed_") || name.startsWith("missing_");
    assert.equal(result.status, malformedFields ? "rejected" : "reconciled", name);
    const expectedMalformedCode = name.startsWith("malformed_")
      ? name
      : `malformed_${name.replace(/^missing_/, "")}`;
    assert.equal(result.code, malformedFields ? expectedMalformedCode : "needs_reconciliation", name);
  }
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 1);
});

test("owner raise charges only the delta and a stale second $5→$12 payment is reconciled", async () => {
  const fixture = setup();
  const initial = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/acme", 5));
  const initialEvent = eventFor(fixture, { deliveryId: "delivery_raise_initial", paymentId: "PAY_raise_initial", orderId: "ORD_raise_initial", intentId: initial.intent.intentId, checkoutId: initial.started.checkoutId });
  assert.equal((await handleWaffoWebhook(initialEvent.body, initialEvent.signature, webhookOptions(fixture))).status, "applied");
  const first = fixture.store.listPaid("backend", PERIOD)[0];
  assert.ok(first);
  const raiseOne = await createIntent(fixture, 7, roleDraft("https://jobs.example.com/acme", 12));
  const raiseTwo = await createIntent(fixture, 7, roleDraft("https://jobs.example.com/acme", 12));
  const eventOne = eventFor(fixture, { deliveryId: "delivery_raise_one", paymentId: "PAY_raise_one", orderId: "ORD_raise_one", intentId: raiseOne.intent.intentId, checkoutId: raiseOne.started.checkoutId, amount: "7.00", subtotal: "7.00" });
  const eventTwo = eventFor(fixture, { deliveryId: "delivery_raise_two", paymentId: "PAY_raise_two", orderId: "ORD_raise_two", intentId: raiseTwo.intent.intentId, checkoutId: raiseTwo.started.checkoutId, amount: "7.00", subtotal: "7.00" });
  assert.equal((await handleWaffoWebhook(eventOne.body, eventOne.signature, webhookOptions(fixture))).status, "applied");
  const second = await handleWaffoWebhook(eventTwo.body, eventTwo.signature, webhookOptions(fixture));
  assert.equal(second.status, "reconciled");
  const raised = fixture.store.listPaid("backend", PERIOD)[0];
  assert.ok(raised);
  assert.equal(raised.id, first.id);
  assert.equal(raised.createdAt, first.createdAt);
  assert.equal(raised.bidUsd, 12);
  assert.equal(raised.paidUsd, 12);
  assert.equal(fixture.intentStore.getByIntentId(raiseTwo.intent.intentId)?.status, "needs_reconciliation");
  assert.equal(fixture.store.listPaid("backend", PERIOD).some((listing) => listing.paidUsd === 19), false);
});

test("captured payment outside the rolling window is durable reconciliation, never rank", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/stale", 5));
  const event = eventFor(fixture, {
    deliveryId: "delivery_stale_payment",
    paymentId: "PAY_stale_payment",
    orderId: "ORD_stale_payment",
    intentId: created.intent.intentId,
    checkoutId: created.started.checkoutId,
    timestamp: "2026-08-17T00:00:00.000Z",
  });
  const result = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
  assert.deepEqual(result, { status: "reconciled", code: "needs_reconciliation", intentId: created.intent.intentId });
  assert.equal(fixture.intentStore.getByIntentId(created.intent.intentId)?.status, "needs_reconciliation");
  assert.equal(fixture.intentStore.getDelivery("delivery_stale_payment")?.status, "needs_reconciliation");
  assert.deepEqual(fixture.store.listPaid("backend", PERIOD), []);
});

test("a completed amount conflict reserves the intent and blocks a fresh signed payment", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/intent-reservation", 5));
  const bad = eventFor(fixture, {
    deliveryId: "delivery_intent_conflict_bad",
    paymentId: "PAY_intent_conflict_bad",
    orderId: "ORD_intent_conflict_bad",
    intentId: created.intent.intentId,
    checkoutId: created.started.checkoutId,
    amount: "4.00",
    subtotal: "4.00",
    total: "4.00",
  });
  assert.deepEqual(
    await handleWaffoWebhook(bad.body, bad.signature, webhookOptions(fixture)),
    { status: "reconciled", code: "needs_reconciliation", intentId: created.intent.intentId },
  );
  assert.equal(fixture.intentStore.getByIntentId(created.intent.intentId)?.status, "needs_reconciliation");
  const good = eventFor(fixture, {
    deliveryId: "delivery_intent_conflict_good",
    paymentId: "PAY_intent_conflict_good",
    orderId: "ORD_intent_conflict_good",
    intentId: created.intent.intentId,
    checkoutId: created.started.checkoutId,
  });
  assert.deepEqual(
    await handleWaffoWebhook(good.body, good.signature, webhookOptions(fixture)),
    { status: "rejected", code: "provider_identity_reused", intentId: created.intent.intentId },
  );
  assert.equal(fixture.intentStore.getReplayCount(), 1);
  assert.deepEqual(fixture.store.listPaid("backend", PERIOD), []);
  assert.equal((await handleWaffoWebhook(bad.body, bad.signature, webhookOptions(fixture))).status, "reconciled");
  assert.equal(fixture.intentStore.getReplayCount(), 1);
});

test("wrong mode/store/status/payment/currency/metadata/product/amount never ranks", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/reject", 5));
  const cases: Array<[string, Record<string, unknown>]> = [
    ["mode", { mode: "prod" }],
    ["store", { storeId: `STO_${"D".repeat(22)}` }],
    ["order_status", { orderStatus: "pending" }],
    ["payment_status", { paymentStatus: "pending" }],
    ["currency", { currency: "EUR" }],
    ["amount", { amount: "6.00" }],
    ["product", { productId: `PROD_${"D".repeat(22)}` }],
  ];
  for (const [name, changes] of cases) {
    const event = eventFor(fixture, { deliveryId: `delivery_bad_${name}`, paymentId: `PAY_bad_${name}`, orderId: `ORD_bad_${name}`, intentId: created.intent.intentId, checkoutId: created.started.checkoutId, ...changes });
    const result = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
    assert.equal(result.status, name === "amount" ? "reconciled" : "rejected", name);
  }
  const metadataEvent = signedEvent({
    deliveryId: "delivery_bad_metadata",
    paymentId: "PAY_bad_metadata",
    orderId: "ORD_bad_metadata",
    intentId: created.intent.intentId,
    metadata: { ...metadataForIntent(created.intent), company: "Forged" },
    checkoutId: created.started.checkoutId,
  });
  assert.equal((await handleWaffoWebhook(metadataEvent.body, metadataEvent.signature, webhookOptions(fixture))).status, "rejected");
  assert.deepEqual(fixture.store.listPaid("backend", PERIOD), []);
});

test("present provider fields and metadata must be well-formed and exact", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/provider-fields", 5));
  const expected = metadataForIntent(created.intent);
  const cases: Array<[string, Record<string, unknown>]> = [
    ["empty_checkout", { checkoutId: "" }],
    ["null_checkout", { checkoutIdValue: null }],
    ["empty_product", { productId: "" }],
    ["null_product", { productIdValue: null }],
    ["malformed_product", { productValue: null }],
  ];
  for (const [name, changes] of cases) {
    const event = signedEvent({
      deliveryId: `delivery_malformed_${name}`,
      paymentId: `PAY_malformed_${name}`,
      orderId: `ORD_malformed_${name}`,
      intentId: created.intent.intentId,
      metadata: expected,
      amount: "5.00",
      subtotal: "5.00",
      total: "5.00",
      ...(typeof changes.checkoutId === "string" ? { checkoutId: changes.checkoutId } : {}),
      ...(Object.prototype.hasOwnProperty.call(changes, "checkoutIdValue") ? { checkoutIdValue: changes.checkoutIdValue } : {}),
      ...(typeof changes.productId === "string" ? { productId: changes.productId } : {}),
      ...(Object.prototype.hasOwnProperty.call(changes, "productIdValue") ? { productIdValue: changes.productIdValue } : {}),
      ...(Object.prototype.hasOwnProperty.call(changes, "productValue") ? { productValue: changes.productValue } : {}),
    } as Parameters<typeof signedEvent>[0]);
    const result = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
    assert.equal(result.status, "rejected", name);
  }

  const extraMetadata = signedEvent({
    deliveryId: "delivery_metadata_extra",
    paymentId: "PAY_metadata_extra",
    orderId: "ORD_metadata_extra",
    intentId: created.intent.intentId,
    metadata: { ...expected, attacker: "extra" },
    checkoutId: created.started.checkoutId,
  });
  const extraResult = await handleWaffoWebhook(extraMetadata.body, extraMetadata.signature, webhookOptions(fixture));
  assert.equal(extraResult.status, "rejected");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 0);
});

test("changed replay is durably rejected while the original applied delivery stays applied", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/replay", 5));
  const event = eventFor(fixture, { deliveryId: "delivery_replay", paymentId: "PAY_replay", orderId: "ORD_replay", intentId: created.intent.intentId, checkoutId: created.started.checkoutId });
  assert.equal((await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture))).status, "applied");
  const changed = signedEvent({
    deliveryId: "delivery_replay",
    paymentId: "PAY_replay",
    orderId: "ORD_replay",
    intentId: created.intent.intentId,
    metadata: metadataForIntent(created.intent),
    amount: "6.00",
    checkoutId: created.started.checkoutId,
  });
  assert.equal((await handleWaffoWebhook(changed.body, changed.signature, webhookOptions(fixture))).code, "changed_replay");
  assert.equal(fixture.intentStore.getDelivery("delivery_replay")?.status, "applied");
  const second = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/replay-launder", 5, "pay_launder"));
  const changedDelivery = signedEvent({
    deliveryId: "delivery_replay",
    paymentId: "PAY_launder",
    orderId: "ORD_launder",
    intentId: second.intent.intentId,
    metadata: metadataForIntent(second.intent),
    checkoutId: second.started.checkoutId,
  });
  assert.equal((await handleWaffoWebhook(changedDelivery.body, changedDelivery.signature, webhookOptions(fixture))).code, "changed_replay");
  const freshDelivery = signedEvent({
    deliveryId: "delivery_replay_fresh",
    paymentId: "PAY_launder",
    orderId: "ORD_launder",
    intentId: second.intent.intentId,
    metadata: metadataForIntent(second.intent),
    checkoutId: second.started.checkoutId,
  });
  assert.deepEqual(
    await handleWaffoWebhook(freshDelivery.body, freshDelivery.signature, webhookOptions(fixture)),
    { status: "rejected", code: "provider_identity_reused", intentId: second.intent.intentId },
  );
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 1);
  const exact = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
  assert.equal(exact.status, "duplicate");
});

test("a changed new delivery reusing provider identities is durably audited before settlement", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/replay-new-delivery", 5));
  const original = eventFor(fixture, {
    deliveryId: "delivery_reused_original",
    paymentId: "PAY_reused_identity",
    orderId: "ORD_reused_identity",
    intentId: created.intent.intentId,
    checkoutId: created.started.checkoutId,
  });
  assert.equal((await handleWaffoWebhook(original.body, original.signature, webhookOptions(fixture))).status, "applied");
  const replayCount = fixture.intentStore.getReplayCount();
  const changed = signedEvent({
    deliveryId: "delivery_reused_changed",
    paymentId: "PAY_reused_identity",
    orderId: "ORD_reused_identity",
    intentId: created.intent.intentId,
    metadata: metadataForIntent(created.intent),
    amount: "6.00",
    checkoutId: created.started.checkoutId,
  });
  const rejected = await handleWaffoWebhook(changed.body, changed.signature, webhookOptions(fixture));
  assert.deepEqual(rejected, { status: "rejected", code: "provider_identity_reused", intentId: created.intent.intentId });
  assert.equal(fixture.intentStore.getReplayCount(), replayCount + 1);
  assert.equal(fixture.intentStore.getDelivery("delivery_reused_changed"), undefined);
  assert.equal(fixture.intentStore.getDelivery("delivery_reused_original")?.status, "applied");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 1);
});

test("rejected signed events return retryable when their durable audit write fails", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/audit-retry", 5));
  const event = eventFor(fixture, {
    deliveryId: "delivery_audit_retry",
    paymentId: "PAY_audit_retry",
    orderId: "ORD_audit_retry",
    intentId: created.intent.intentId,
    checkoutId: created.started.checkoutId,
    amount: "6.00",
  });
  const storeWithFault = fixture.intentStore as PaymentIntentStore & {
    rejectWebhook: (input: Parameters<PaymentIntentStore["rejectWebhook"]>[0]) => void;
  };
  const originalReject = storeWithFault.rejectWebhook;
  storeWithFault.rejectWebhook = () => {
    throw new Error("injected audit outage");
  };
  try {
    const retryable = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
    assert.equal(retryable.status, "retryable");
    assert.equal(retryable.code, "audit_unavailable");
    assert.equal(fixture.intentStore.getDelivery("delivery_audit_retry"), undefined);
  } finally {
    storeWithFault.rejectWebhook = originalReject;
  }
  const rejected = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture));
  assert.equal(rejected.status, "reconciled");
  assert.equal(rejected.code, "needs_reconciliation");
  assert.equal(fixture.intentStore.getDelivery("delivery_audit_retry")?.status, "needs_reconciliation");
});

test("failure injection rolls back delivery, intent, checkout event, and listing atomically", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/rollback", 5));
  const event = eventFor(fixture, { deliveryId: "delivery_rollback", paymentId: "PAY_rollback", orderId: "ORD_rollback", intentId: created.intent.intentId, checkoutId: created.started.checkoutId });
  const failed = await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture, { beforeListingMutation: () => { throw new Error("injected"); } }));
  assert.equal(failed.status, "retryable");
  assert.equal(failed.code, "atomic_rollback");
  assert.equal(fixture.store.listPaid("backend", PERIOD).length, 0);
  assert.equal(fixture.intentStore.getByIntentId(created.intent.intentId)?.status, "open");
  assert.equal(fixture.intentStore.getDelivery("delivery_rollback"), undefined);
  assert.equal((await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture))).status, "applied");
});

test("restart and two instances preserve paid board, intent, click-visible listing, and webhook deduplication", async () => {
  const fixture = setup();
  const created = await createIntent(fixture, 5, roleDraft("https://jobs.example.com/restart", 5));
  const event = eventFor(fixture, { deliveryId: "delivery_restart", paymentId: "PAY_restart", orderId: "ORD_restart", intentId: created.intent.intentId, checkoutId: created.started.checkoutId });
  assert.equal((await handleWaffoWebhook(event.body, event.signature, webhookOptions(fixture))).status, "applied");
  const listing = fixture.store.listPaid("backend", PERIOD)[0];
  assert.ok(listing);
  fixture.intentStore.close();
  fixture.store.close();
  const restartedStore = new BoardStore(fixture.path);
  const restartedIntents = new PaymentIntentStore(fixture.path);
  const restarted = new LiveWaffoPort({ env: fixture.env, store: restartedStore, intentStore: restartedIntents, fetch: async () => { throw new Error("must not fetch on return"); } });
  assert.equal(restarted.getCheckout(created.started.checkoutId)?.status, "paid");
  assert.equal(restartedStore.listPaid("backend", PERIOD)[0]?.id, listing.id);
  const duplicate = await handleWaffoWebhook(event.body, event.signature, { ...webhookOptions(fixture), store: restartedStore, intentStore: restartedIntents });
  assert.equal(duplicate.status, "duplicate");
  const secondStore = new BoardStore(fixture.path);
  const secondIntents = new PaymentIntentStore(fixture.path);
  const [one, two] = await Promise.all([
    handleWaffoWebhook(event.body, event.signature, { ...webhookOptions(fixture), store: restartedStore, intentStore: restartedIntents }),
    handleWaffoWebhook(event.body, event.signature, { ...webhookOptions(fixture), store: secondStore, intentStore: secondIntents }),
  ]);
  assert.equal([one, two].filter((result) => result.status === "applied").length, 0);
  assert.equal([one, two].every((result) => result.status === "duplicate" || result.status === "reconciled" || result.status === "busy"), true);
  assert.equal(restartedStore.listPaid("backend", PERIOD).length, 1);
  restartedIntents.close();
  restartedStore.close();
  secondIntents.close();
  secondStore.close();
});

test("fixture remains offline and unknown external metadata cannot invent rank", async () => {
  const store = new BoardStore();
  const fixture = new FakePolarPort(store);
  assert.equal(await fixture.completeCheckout("external_unknown"), null);
  assert.deepEqual(store.listPaid("backend", PERIOD), []);
  const started = await fixture.createCheckout({ amountUsd: 5, listingDraft: roleDraft("https://jobs.example.com/fixture", 5), successUrl: "http://localhost/return" });
  assert.equal(store.listPaid("backend", PERIOD).length, 0);
  assert.ok(await fixture.completeCheckout(started.checkoutId));
  assert.equal(rankListings(store.listPaid("backend", PERIOD)).length, 1);
  store.close();
});
