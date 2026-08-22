import type { FunctionLane, Listing, SalaryBand } from "../lib/types";
import { MAX_BID_USD, MIN_BID_USD } from "../lib/types";
import { defaultBoardStore, type BoardStore } from "../lib/store";
import { isPolarLive } from "./env";
import { getFakePolarPort } from "./fixture";
import { LivePolarPort } from "./polar";

export type ListingDraft = {
  periodId: string;
  lane: FunctionLane;
  title: string;
  company: string;
  companyHandle: string;
  applyUrl: string;
  salary: SalaryBand | null;
  bidUsd: number;
};

export type CheckoutStart = {
  checkoutId: string;
  url: string;
};

export type CheckoutStatus = "open" | "paid" | "abandoned";

export type CheckoutRecord = {
  checkoutId: string;
  amountUsd: number;
  listingDraft: ListingDraft;
  successUrl: string;
  status: CheckoutStatus;
  listingId?: string;
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
};

export class CheckoutError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(code);
    this.name = "CheckoutError";
  }
}

export function parseBidUsd(raw: unknown): number {
  if (typeof raw === "boolean") {
    throw new CheckoutError("invalid_bid", 400);
  }
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < 1) {
      throw new CheckoutError("invalid_bid", 400);
    }
    return assertBidRange(raw);
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CheckoutError("invalid_bid", 400);
  }
  if (!/^[0-9]+$/.test(raw.trim())) {
    throw new CheckoutError("invalid_bid", 400);
  }
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1) {
    throw new CheckoutError("invalid_bid", 400);
  }
  return assertBidRange(value);
}

function assertBidRange(value: number): number {
  if (value < MIN_BID_USD) throw new CheckoutError("bid_below_min", 400);
  if (value > MAX_BID_USD) throw new CheckoutError("bid_above_max", 400);
  return value;
}

export function getPolarPort(store: BoardStore = defaultBoardStore): PolarPort {
  if (isPolarLive()) return new LivePolarPort();
  return getFakePolarPort(store);
}

export function firstQuery(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function handleCheckoutReturn(
  params: {
    checkoutId?: string | string[];
    status?: string | string[];
  },
  port: PolarPort = getPolarPort(),
): Promise<{ status: "success" | "cancel"; listing: Listing | null }> {
  const checkoutId = firstQuery(params.checkoutId);
  const rawStatus = firstQuery(params.status);
  const canceled = rawStatus === "cancel" || rawStatus === "canceled";

  if (!checkoutId) {
    return { status: canceled ? "cancel" : "success", listing: null };
  }

  if (canceled) {
    await port.abandonCheckout(checkoutId);
    return { status: "cancel", listing: null };
  }

  const listing = await port.completeCheckout(checkoutId);
  return { status: "success", listing };
}
