import type { FunctionLane } from "./types";
import { CheckoutError, type ListingDraft } from "../payments/port";

const TITLE_MIN = 3;
const TITLE_MAX = 80;
const COMPANY_MIN = 2;
const COMPANY_MAX = 60;
const HANDLE_RE = /^[a-z0-9-]{2,32}$/;

function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

function deriveHandle(identity: string): string {
  const trimmed = identity.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const host = new URL(trimmed).hostname.replace(/^www\./, "");
      const slug = host.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
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

export function draftFromOutbidInput(input: {
  identity: string;
  amountUsd: number;
  lane: FunctionLane;
  periodId: string;
  title?: string;
  company?: string;
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
  };
}
