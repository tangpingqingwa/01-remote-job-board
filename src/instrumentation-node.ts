import { createPublicKey } from "node:crypto";
import { WaffoPancake } from "@waffo/pancake-ts";
import { openBoardDatabase } from "./lib/db";
import {
  getPaymentMode,
  requireWaffoConfig,
  type PaymentEnv,
} from "./payments/env";

/**
 * Validate the live payment and persistence boundary before Next accepts
 * traffic. Build-time imports are intentionally excluded; the release build
 * remains fixture-independent while `next start` cannot silently boot a
 * fixture or in-memory board.
 */
export function validateProductionStartup(
  env: PaymentEnv = process.env,
  options: { skipBuildPhase?: boolean } = {},
): void {
  if (env.NODE_ENV !== "production") return;
  if (options.skipBuildPhase && env.NEXT_PHASE === "phase-production-build") return;
  const mode = getPaymentMode(env);
  if (mode !== "waffo-prod") {
    throw new Error("BLOCKED-CONFIG: WAFFO_MODE_PRODUCTION");
  }
  const config = requireWaffoConfig(env, mode);
  validateWaffoShortId(config.merchantId, "WAFFO_MERCHANT_ID", "MER");
  validateWaffoShortId(config.storeId, "WAFFO_STORE_ID", "STO");
  validateWaffoShortId(config.productId, "WAFFO_PRODUCT_ID", "PROD");
  validatePublicKey(config.webhookPublicKeys?.prod, "WAFFO_WEBHOOK_PROD_PUBLIC_KEY");
  // The official constructor performs the provider's private-key and
  // merchant-id validation without making a network request. Constructing it
  // here keeps malformed production credentials from reaching a listener.
  try {
    new WaffoPancake({
      merchantId: config.merchantId,
      privateKey: config.privateKey,
      baseUrl: config.apiBase,
      environment: config.environment,
      ...(config.webhookPublicKeys ? { webhookPublicKey: config.webhookPublicKeys } : {}),
    });
  } catch {
    throw new Error("BLOCKED-CONFIG: WAFFO_PRIVATE_KEY");
  }
  const database = openBoardDatabase(config.databasePath, env);
  database.close();
}

function validateWaffoShortId(value: string, name: string, prefix: string): void {
  if (!new RegExp(`^${prefix}_[0-9A-Za-z]{22}$`).test(value)) {
    throw new Error(`BLOCKED-CONFIG: ${name}`);
  }
}

function validatePublicKey(value: string | undefined, name: string): void {
  if (!value) throw new Error(`BLOCKED-CONFIG: ${name}`);
  const normalized = value.replace(/\\n/g, "\n").trim();
  const candidate = normalized.includes("BEGIN")
    ? normalized
    : `-----BEGIN PUBLIC KEY-----\n${normalized.replace(/\s+/g, "")}\n-----END PUBLIC KEY-----`;
  try {
    const key = createPublicKey(candidate);
    if (key.asymmetricKeyType !== "rsa") throw new Error("webhook key must be RSA");
  } catch {
    throw new Error(`BLOCKED-CONFIG: ${name}`);
  }
}

export function register(): void {
  // Next invokes the instrumentation hook during `next build`; that phase is
  // intentionally compile-only. The server config calls the validator with
  // the default (strict) option before `next start` can bind a listener.
  validateProductionStartup(process.env, { skipBuildPhase: true });
}
