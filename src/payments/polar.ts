import type { Listing } from "../lib/types";
import { applyPaidCheckout } from "../lib/listing";
import { defaultBoardStore, type BoardStore } from "../lib/store";
import {
  isPolarLive,
  polarApiBase,
  requirePolarSecret,
  type PolarEnv,
} from "./env";
import type {
  CheckoutRecord,
  CheckoutStart,
  CreateCheckoutInput,
  PolarPort,
} from "./port";

export type LivePolarOptions = {
  env?: PolarEnv;
  fetch?: typeof fetch;
  store?: BoardStore;
};

/**
 * Live Polar Checkout. Selected only when POLAR_LIVE=1 and
 * POLAR_FIXTURE_ONLY is not 1. Tests and CI must never construct this
 * without an injected fetch. unused in tests and CI.
 */
export class LivePolarPort implements PolarPort {
  private readonly env: PolarEnv;
  private readonly fetchFn: typeof fetch;
  private readonly store: BoardStore;
  private readonly checkouts = new Map<string, CheckoutRecord>();

  constructor(options: LivePolarOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchFn = options.fetch ?? fetch;
    this.store = options.store ?? defaultBoardStore;
    if (!isPolarLive(this.env)) {
      throw new Error("Live Polar is env-gated; use FakePolarPort");
    }
    requirePolarSecret("POLAR_ACCESS_TOKEN", this.env);
    requirePolarSecret("POLAR_PRODUCT_ID", this.env);
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart> {
    const token = requirePolarSecret("POLAR_ACCESS_TOKEN", this.env);
    const productId = requirePolarSecret("POLAR_PRODUCT_ID", this.env);
    const successUrl = withCheckoutPlaceholder(
      this.env.POLAR_SUCCESS_URL?.trim() || input.successUrl,
    );
    const response = await this.fetchFn(`${polarApiBase(this.env)}/v1/checkouts/`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "remote-job-board/1.0",
      },
      body: JSON.stringify({
        products: [productId],
        amount: input.amountUsd * 100,
        success_url: successUrl,
        metadata: {
          lane: input.listingDraft.lane,
          periodId: input.listingDraft.periodId,
          applyUrl: input.listingDraft.applyUrl,
          companyHandle: input.listingDraft.companyHandle,
          company: input.listingDraft.company,
          title: input.listingDraft.title,
          bidUsd: String(input.listingDraft.bidUsd),
          chargeUsd: String(input.amountUsd),
          payerId: input.listingDraft.payerId,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`polar checkout failed: ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const checkoutId = readString(payload.id);
    const url = readString(payload.url);
    if (!checkoutId || !url) {
      throw new Error("polar checkout response missing id/url");
    }
    this.checkouts.set(checkoutId, {
      checkoutId,
      amountUsd: input.amountUsd,
      listingDraft: { ...input.listingDraft },
      successUrl: input.successUrl,
      status: "open",
    });
    return { checkoutId, url };
  }

  async completeCheckout(checkoutId: string): Promise<Listing | null> {
    const checkout = this.checkouts.get(checkoutId);
    if (!checkout) return null;
    if (checkout.status === "paid" && checkout.listingId) {
      return this.store.getById(checkout.listingId) ?? null;
    }
    if (checkout.status !== "open") return null;
    const remote = await this.fetchCheckout(checkoutId);
    if (!remote || !isPaidPolarStatus(remote.status)) return null;
    const listing = applyPaidCheckout(
      this.store,
      checkout.listingDraft,
      checkout.amountUsd,
      new Date().toISOString(),
      () => `lst_${checkoutId}`,
    );
    checkout.status = "paid";
    checkout.listingId = listing.id;
    return listing;
  }

  async abandonCheckout(checkoutId: string): Promise<void> {
    const checkout = this.checkouts.get(checkoutId);
    if (!checkout || checkout.status !== "open") return;
    checkout.status = "abandoned";
  }

  getCheckout(checkoutId: string): CheckoutRecord | undefined {
    return this.checkouts.get(checkoutId);
  }

  private async fetchCheckout(
    checkoutId: string,
  ): Promise<{ status: string } | null> {
    const token = requirePolarSecret("POLAR_ACCESS_TOKEN", this.env);
    const response = await this.fetchFn(
      `${polarApiBase(this.env)}/v1/checkouts/${encodeURIComponent(checkoutId)}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          "user-agent": "remote-job-board/1.0",
        },
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as Record<string, unknown>;
    const status = readString(payload.status);
    return status ? { status } : null;
  }
}

function withCheckoutPlaceholder(successUrl: string): string {
  if (successUrl.includes("{CHECKOUT_ID}")) return successUrl;
  const sep = successUrl.includes("?") ? "&" : "?";
  return `${successUrl}${sep}checkoutId={CHECKOUT_ID}`;
}

function isPaidPolarStatus(status: string): boolean {
  return (
    status === "succeeded" ||
    status === "paid" ||
    status === "confirmed" ||
    status === "complete"
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}
