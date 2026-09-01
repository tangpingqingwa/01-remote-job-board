/**
 * Polar compatibility surface.
 *
 * Polar is retired for this vertical. These names remain only so an older
 * caller fails closed instead of accidentally selecting a second MoR. All
 * production traffic is routed through LiveWaffoPort in waffo.ts.
 */
import type { Listing } from "../lib/types";
import { handleWaffoWebhook, type LiveWaffoOptions, type WaffoWebhookOptions } from "./waffo";
import type { CheckoutStart, CheckoutRecord, CreateCheckoutInput, PolarPort } from "./port";

export type LivePolarOptions = LiveWaffoOptions;

/** @deprecated Polar never selects a provider; use LiveWaffoPort. */
export class LivePolarPort implements PolarPort {
  constructor(_options: LivePolarOptions = {}) {
    throw new Error("BLOCKED-CONFIG: POLAR_PROVIDER_DISABLED");
  }

  async createCheckout(_input: CreateCheckoutInput): Promise<CheckoutStart> {
    throw new Error("BLOCKED-CONFIG: POLAR_PROVIDER_DISABLED");
  }

  async completeCheckout(_checkoutId: string): Promise<Listing | null> {
    throw new Error("BLOCKED-CONFIG: POLAR_PROVIDER_DISABLED");
  }

  async abandonCheckout(_checkoutId: string): Promise<void> {
    throw new Error("BLOCKED-CONFIG: POLAR_PROVIDER_DISABLED");
  }

  getCheckout(_checkoutId: string): CheckoutRecord | undefined {
    throw new Error("BLOCKED-CONFIG: POLAR_PROVIDER_DISABLED");
  }
}

export type PolarWebhookResult = {
  status: "rejected";
  code: "provider_disabled";
  intentId?: string;
  listing?: Listing;
};

export type PolarWebhookOptions = WaffoWebhookOptions;

/** Polar webhook endpoint is intentionally inert and can never settle rank. */
export async function handlePolarWebhook(
  _rawBody: string,
  _headers: Record<string, string>,
  _options: PolarWebhookOptions = {},
): Promise<PolarWebhookResult> {
  return { status: "rejected", code: "provider_disabled" };
}

export type { CheckoutStart, CheckoutRecord, CreateCheckoutInput };
export { handleWaffoWebhook };
