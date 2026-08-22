import type { Listing } from "../lib/types";
import { defaultBoardStore, type BoardStore } from "../lib/store";
import {
  CheckoutError,
  type CheckoutRecord,
  type CheckoutStart,
  type CreateCheckoutInput,
  type PolarPort,
} from "./port";

let seq = 0;
let defaultPort: FakePolarPort | undefined;

export function resetFixtureIds(): void {
  seq = 0;
  defaultPort?.reset();
}

export function getFakePolarPort(store: BoardStore = defaultBoardStore): FakePolarPort {
  if (store !== defaultBoardStore) return new FakePolarPort(store);
  if (!defaultPort) defaultPort = new FakePolarPort(store);
  return defaultPort;
}

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${String(seq).padStart(4, "0")}`;
}

/** In-process Polar. Completing a checkout writes the listing; abandon does not. */
export class FakePolarPort implements PolarPort {
  private readonly checkouts = new Map<string, CheckoutRecord>();

  constructor(private readonly store: BoardStore = defaultBoardStore) {}

  reset(): void {
    this.checkouts.clear();
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart> {
    if (!Number.isInteger(input.amountUsd) || input.amountUsd < 1) {
      throw new CheckoutError("invalid_bid", 400);
    }
    const checkoutId = nextId("chk");
    this.checkouts.set(checkoutId, {
      checkoutId,
      amountUsd: input.amountUsd,
      listingDraft: input.listingDraft,
      successUrl: input.successUrl,
      status: "open",
    });
    const sep = input.successUrl.includes("?") ? "&" : "?";
    return {
      checkoutId,
      url: `${input.successUrl}${sep}checkoutId=${encodeURIComponent(checkoutId)}`,
    };
  }

  async completeCheckout(checkoutId: string): Promise<Listing | null> {
    const checkout = this.checkouts.get(checkoutId);
    if (!checkout) return null;
    if (checkout.status === "paid" && checkout.listingId) {
      return this.store.getById(checkout.listingId) ?? null;
    }
    if (checkout.status !== "open") return null;

    const now = new Date().toISOString();
    const draft = checkout.listingDraft;
    const listing: Listing = {
      id: nextId("lst"),
      periodId: draft.periodId,
      lane: draft.lane,
      title: draft.title,
      company: draft.company,
      companyHandle: draft.companyHandle,
      applyUrl: draft.applyUrl,
      salary: draft.salary,
      bidUsd: draft.bidUsd,
      paidUsd: checkout.amountUsd,
      clicks: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.store.insertPaid(listing);
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
}
