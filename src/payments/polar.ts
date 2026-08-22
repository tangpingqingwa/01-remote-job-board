import type { Listing } from "../lib/types";
import { isPolarLive, requirePolarSecret } from "./env";
import type {
  CheckoutRecord,
  CheckoutStart,
  CreateCheckoutInput,
  PolarPort,
} from "./port";

/**
 * Live Polar Checkout. Selected only when POLAR_LIVE=1 and
 * POLAR_FIXTURE_ONLY is not 1. Tests and CI must never construct this.
 */
export class LivePolarPort implements PolarPort {
  constructor() {
    if (!isPolarLive()) {
      throw new Error("Live Polar is env-gated; use FakePolarPort");
    }
    requirePolarSecret("POLAR_ACCESS_TOKEN");
    requirePolarSecret("POLAR_PRODUCT_ID");
  }

  async createCheckout(_input: CreateCheckoutInput): Promise<CheckoutStart> {
    throw new Error("Live Polar is unused in tests and CI");
  }

  async completeCheckout(_checkoutId: string): Promise<Listing | null> {
    throw new Error("Live Polar is unused in tests and CI");
  }

  async abandonCheckout(_checkoutId: string): Promise<void> {
    throw new Error("Live Polar is unused in tests and CI");
  }

  getCheckout(_checkoutId: string): CheckoutRecord | undefined {
    return undefined;
  }
}
