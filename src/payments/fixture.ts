import type { Listing } from "../lib/types";
import { applyPaidCheckout, planCheckout } from "../lib/listing";
import { defaultBoardStore, type BoardStore } from "../lib/store";
import type { PaymentEnv } from "./env";
import {
  checkoutRecordFromIntent,
  PaymentIntentStore,
  paymentIntentStoreFor,
  CheckoutError,
  type CheckoutRecord,
  type CheckoutStart,
  type CreateCheckoutInput,
  type PaymentIntent,
  type PolarPort,
} from "./port";

let seq = 0;
let defaultPort: FakePolarPort | undefined;

export function resetFixtureIds(): void {
  seq = 0;
  defaultPort?.reset();
}

export function getFakePolarPort(
  store: BoardStore = defaultBoardStore,
  env: PaymentEnv = process.env,
): FakePolarPort {
  if (store !== defaultBoardStore) return new FakePolarPort(store, env);
  if (env.NODE_ENV === "production") {
    throw new Error("BLOCKED-CONFIG: FIXTURE_DISABLED_IN_PRODUCTION");
  }
  if (!defaultPort) defaultPort = new FakePolarPort(store, env);
  return defaultPort;
}

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${String(seq).padStart(4, "0")}`;
}

/**
 * In-process fixture payment. Completing a known local intent is a trusted
 * test action; unknown provider metadata can never create a listing.
 */
export class FakePolarPort implements PolarPort {
  private readonly intentStore: PaymentIntentStore;

  constructor(
    private readonly store: BoardStore = defaultBoardStore,
    env: PaymentEnv = process.env,
  ) {
    if (env.NODE_ENV === "production") {
      throw new Error("BLOCKED-CONFIG: FIXTURE_DISABLED_IN_PRODUCTION");
    }
    this.intentStore = paymentIntentStoreFor(store);
  }

  reset(): void {
    this.intentStore.resetFixture();
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart> {
    if (!Number.isInteger(input.amountUsd) || input.amountUsd < 1) {
      throw new CheckoutError("invalid_bid", 400);
    }
    const plan = planCheckout(this.store, input.listingDraft, input.amountUsd);
    const intent = this.intentStore.create({
      provider: "fixture",
      amountUsd: plan.chargeUsd,
      listingDraft: { ...plan.draft },
      successUrl: input.successUrl,
      expectedProductId: "fixture",
    });
    const checkoutId = nextId("chk");
    try {
      this.intentStore.attachCheckout(intent.intentId, checkoutId);
    } catch (error) {
      this.intentStore.markFailed(intent.intentId, "fixture_checkout_id_conflict");
      throw error;
    }
    const sep = input.successUrl.includes("?") ? "&" : "?";
    return {
      checkoutId,
      url: `${input.successUrl}${sep}checkoutId=${encodeURIComponent(checkoutId)}`,
      intentId: intent.intentId,
    };
  }

  async completeCheckout(checkoutId: string): Promise<Listing | null> {
    const intent = this.intentStore.getByCheckoutId("fixture", checkoutId);
    if (!intent) return null;
    if (intent.status === "paid" && intent.listingId) {
      return this.store.getById(intent.listingId) ?? null;
    }
    if (intent.status !== "open") return null;

    try {
      const listing = applyFixtureIntent(this.store, intent);
      const paid = this.intentStore.markFixturePaid({
        intentId: intent.intentId,
        providerCheckoutId: checkoutId,
        listingId: listing.id,
      });
      if (!paid || paid.status !== "paid") return null;
      return listing;
    } catch (error) {
      this.intentStore.markFailed(intent.intentId, "fixture_listing_apply_failed");
      throw error;
    }
  }

  async abandonCheckout(checkoutId: string): Promise<void> {
    const intent = this.intentStore.getByCheckoutId("fixture", checkoutId);
    if (!intent) return;
    this.intentStore.markAbandoned(intent.intentId);
  }

  getCheckout(checkoutId: string): CheckoutRecord | undefined {
    const intent = this.intentStore.getByCheckoutId("fixture", checkoutId);
    return intent ? checkoutRecordFromIntent(intent) : undefined;
  }

  getPaymentIntent(intentId: string): PaymentIntent | undefined {
    return this.intentStore.getByIntentId(intentId);
  }
}

function applyFixtureIntent(store: BoardStore, intent: PaymentIntent): Listing {
  const existing = store.findLiveByIdentity(
    intent.listingDraft.lane,
    {
      applyUrl: intent.listingDraft.applyUrl,
      companyHandle: intent.listingDraft.companyHandle,
    },
    new Date(),
  );
  if (
    existing &&
    existing.payerId === intent.listingDraft.payerId &&
    existing.bidUsd === intent.listingDraft.bidUsd &&
    existing.paidUsd >= intent.listingDraft.bidUsd
  ) {
    return existing;
  }
  return applyPaidCheckout(
    store,
    { ...intent.listingDraft },
    intent.amountUsd,
    new Date().toISOString(),
    () => nextId("lst"),
  );
}
