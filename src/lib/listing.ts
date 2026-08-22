import { randomBytes } from "node:crypto";
import type { FunctionLane, Listing, SalaryBand } from "./types";
import { MAX_BID_USD, MIN_BID_USD } from "./types";
import type { BoardStore } from "./store";

export class CheckoutError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(code);
    this.name = "CheckoutError";
  }
}

export type ListingDraft = {
  periodId: string;
  lane: FunctionLane;
  title: string;
  company: string;
  companyHandle: string;
  applyUrl: string;
  salary: SalaryBand | null;
  bidUsd: number;
  payerId: string;
};

const TITLE_MIN = 3;
const TITLE_MAX = 80;
const COMPANY_MIN = 2;
const COMPANY_MAX = 60;
const HANDLE_RE = /^[a-z0-9-]{2,32}$/;

function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

function slugPart(raw: string): string {
  return raw.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
}

function deriveHandle(identity: string): string {
  const trimmed = identity.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const host = url.hostname.replace(/^www\./, "");
      const lastPath = url.pathname.split("/").filter(Boolean).at(-1);
      const slug = slugPart(lastPath || host);
      return normalizeHandle(slug.slice(0, 32) || "company");
    } catch {
      return "company";
    }
  }
  return normalizeHandle(trimmed);
}

function deriveApplyUrl(identity: string, handle: string): string {
  const trimmed = identity.trim();
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return `https://${handle}.example`;
}

function deriveCompany(identity: string, handle: string): string {
  const trimmed = identity.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return handle
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return trimmed;
}

export function newPayerId(): string {
  return `pay_${randomBytes(8).toString("hex")}`;
}

export function draftFromOutbidInput(input: {
  identity: string;
  amountUsd: number;
  lane: FunctionLane;
  periodId: string;
  title?: string;
  company?: string;
  payerId?: string;
}): ListingDraft {
  const identity = input.identity.trim();
  if (!identity) throw new CheckoutError("invalid_listing", 422);

  const companyHandle = deriveHandle(identity);
  if (!HANDLE_RE.test(companyHandle)) {
    throw new CheckoutError("invalid_listing", 422);
  }

  const company = (input.company ?? deriveCompany(identity, companyHandle)).trim();
  if (company.length < COMPANY_MIN || company.length > COMPANY_MAX) {
    throw new CheckoutError("invalid_listing", 422);
  }

  const title = (input.title ?? `${company} remote role`).trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    throw new CheckoutError("invalid_listing", 422);
  }

  return {
    periodId: input.periodId,
    lane: input.lane,
    title,
    company,
    companyHandle,
    applyUrl: deriveApplyUrl(identity, companyHandle),
    salary: null,
    bidUsd: input.amountUsd,
    payerId: input.payerId ?? newPayerId(),
  };
}

export function findListingByIdentity(
  store: BoardStore,
  draft: Pick<ListingDraft, "periodId" | "lane" | "applyUrl" | "companyHandle">,
): Listing | undefined {
  return store.findByIdentity(draft.periodId, draft.lane, {
    applyUrl: draft.applyUrl,
    companyHandle: draft.companyHandle,
  });
}

export type CheckoutPlan =
  | { kind: "create"; chargeUsd: number; draft: ListingDraft }
  | {
      kind: "raise";
      chargeUsd: number;
      draft: ListingDraft;
      existing: Listing;
    };

/** Same apply URL or handle in this lane + period is a raise, not a second card. */
export function planCheckout(
  store: BoardStore,
  draft: ListingDraft,
  requestedChargeUsd?: number,
): CheckoutPlan {
  if (!Number.isInteger(draft.bidUsd) || draft.bidUsd < 1) {
    throw new CheckoutError("invalid_bid", 400);
  }
  if (draft.bidUsd > MAX_BID_USD) {
    throw new CheckoutError("bid_above_max", 400);
  }

  const existing = findListingByIdentity(store, draft);

  if (!existing) {
    if (draft.bidUsd < MIN_BID_USD) {
      throw new CheckoutError("bid_below_min", 400);
    }
    if (
      requestedChargeUsd !== undefined &&
      requestedChargeUsd !== draft.bidUsd
    ) {
      throw new CheckoutError("invalid_bid", 400);
    }
    return { kind: "create", chargeUsd: draft.bidUsd, draft };
  }

  if (draft.bidUsd <= existing.bidUsd) {
    throw new CheckoutError("raise_too_small", 400);
  }

  const difference = draft.bidUsd - existing.bidUsd;
  const isOwner =
    Boolean(draft.payerId) && draft.payerId === existing.payerId;

  if (isOwner) {
    if (
      requestedChargeUsd !== undefined &&
      requestedChargeUsd !== difference
    ) {
      throw new CheckoutError("invalid_bid", 400);
    }
    return { kind: "raise", chargeUsd: difference, draft, existing };
  }

  if (
    requestedChargeUsd !== undefined &&
    requestedChargeUsd < draft.bidUsd
  ) {
    throw new CheckoutError("raise_not_owner", 403);
  }

  throw new CheckoutError("identity_taken", 409);
}

export function applyPaidCheckout(
  store: BoardStore,
  draft: ListingDraft,
  paidUsd: number,
  now: string,
  newId: () => string,
): Listing {
  const plan = planCheckout(store, draft, paidUsd);
  if (plan.kind === "raise") {
    const updated: Listing = {
      ...plan.existing,
      bidUsd: draft.bidUsd,
      paidUsd: plan.existing.paidUsd + paidUsd,
      updatedAt: now,
    };
    store.updatePaid(updated);
    return updated;
  }

  const listing: Listing = {
    id: newId(),
    periodId: draft.periodId,
    lane: draft.lane,
    title: draft.title,
    company: draft.company,
    companyHandle: draft.companyHandle,
    applyUrl: draft.applyUrl,
    salary: draft.salary,
    bidUsd: draft.bidUsd,
    paidUsd,
    clicks: 0,
    createdAt: now,
    updatedAt: now,
    payerId: draft.payerId,
  };
  store.insertPaid(listing);
  return listing;
}
