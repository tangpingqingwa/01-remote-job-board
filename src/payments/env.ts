import { isIP } from "node:net";
import { readFileSync } from "node:fs";

/** Environment values are passed explicitly in tests so live secrets never leak into fixtures. */
export type PaymentEnv = Record<string, string | undefined>;
/** Deprecated compatibility alias for callers that still import PolarEnv. */
export type PolarEnv = PaymentEnv;

export type PaymentMode = "fixture" | "waffo-test" | "waffo-prod";

export const DEFAULT_WAFFO_API_BASE = "https://api.waffo.ai";

/**
 * Return the explicitly selected payment mode.
 *
 * There is deliberately no CI or missing-secret fallback here: a deployment
 * must say `WAFFO_MODE=fixture`, `waffo-test`, or `waffo-prod`. Local callers
 * that only exercise the board should use the fixture port directly.
 */
export function getPaymentMode(env: PaymentEnv = process.env): PaymentMode {
  const value = env.WAFFO_MODE?.trim();
  if (value === "fixture" || value === "waffo-test" || value === "waffo-prod") {
    if (env.NODE_ENV === "production" && value !== "waffo-prod") {
      throw new Error(
        value === "fixture"
          ? "BLOCKED-CONFIG: FIXTURE_DISABLED_IN_PRODUCTION"
          : "BLOCKED-CONFIG: WAFFO_MODE_PRODUCTION",
      );
    }
    return value;
  }
  throw new Error("BLOCKED-CONFIG: WAFFO_MODE");
}

/** Short alias used by payment code and focused tests. */
export const paymentMode = getPaymentMode;

export function isFixtureMode(env: PaymentEnv = process.env): boolean {
  return getPaymentMode(env) === "fixture";
}

/** Legacy name retained for the fixture gate; Polar flags are not selectors. */
export function isFixtureOnly(env: PaymentEnv = process.env): boolean {
  return isFixtureMode(env);
}

/** CI is informational only and never changes provider selection. */
export function isCi(env: PaymentEnv = process.env): boolean {
  return env.CI === "1" || env.CI === "true" || env.GITHUB_ACTIONS === "true";
}

/** Deprecated Polar flag helper. It reports the old variable only; it cannot select a provider. */
export function polarFixtureOnly(env: PaymentEnv = process.env): boolean {
  return env.POLAR_FIXTURE_ONLY === "1";
}

/** Polar is obsolete and is never selected by runtime code. */
export function isPolarLive(_env: PaymentEnv = process.env): boolean {
  return false;
}

/** Deprecated compatibility value; Waffo code uses DEFAULT_WAFFO_API_BASE. */
export const DEFAULT_POLAR_API_BASE = "https://api.polar.sh";

export function polarApiBase(env: PaymentEnv = process.env): string {
  const value = env.POLAR_API_BASE?.trim();
  return value ? value.replace(/\/$/, "") : DEFAULT_POLAR_API_BASE;
}

export function requirePolarSecret(
  name: "POLAR_ACCESS_TOKEN" | "POLAR_WEBHOOK_SECRET" | "POLAR_PRODUCT_ID",
  env: PaymentEnv = process.env,
): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`BLOCKED-SECRET: ${name}`);
  return value;
}

/** Production-like callers must use an explicitly configured shared database. */
export function requireDatabasePath(env: PaymentEnv = process.env): string {
  const value = env.DATABASE_PATH?.trim();
  if (env.NODE_ENV === "production" && (!value || isMemoryDatabasePath(value))) {
    throw new Error("BLOCKED-CONFIG: DATABASE_PATH");
  }
  return value || ":memory:";
}

export type WaffoConfig = {
  mode: PaymentMode;
  environment: "test" | "prod";
  merchantId: string;
  privateKey: string;
  storeId: string;
  productId: string;
  publicBaseUrl: string;
  apiBase: string;
  databasePath: string;
  webhookPublicKeys?: { test?: string; prod?: string };
};

function required(env: PaymentEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`BLOCKED-CONFIG: ${name}`);
  return value;
}

function privateKeyFromEnv(env: PaymentEnv): string {
  const direct = env.WAFFO_PRIVATE_KEY?.trim();
  if (direct) return direct.replace(/\\n/g, "\n");
  const path = env.WAFFO_PRIVATE_KEY_FILE?.trim();
  if (!path) throw new Error("BLOCKED-CONFIG: WAFFO_PRIVATE_KEY");
  try {
    const value = readFileSync(path, "utf8").trim();
    if (!value) throw new Error("empty key");
    return value;
  } catch {
    throw new Error("BLOCKED-CONFIG: WAFFO_PRIVATE_KEY_FILE");
  }
}

function publicBaseUrl(env: PaymentEnv, mode: PaymentMode): string {
  const raw = env.WAFFO_PUBLIC_BASE_URL?.trim() || env.PUBLIC_BASE_URL?.trim();
  if (!raw) throw new Error("BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL_HTTPS");
  }
  if (parsed.username || parsed.password || !parsed.hostname) {
    throw new Error("BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL_ORIGIN");
  }
  if (mode === "waffo-prod" && !isPublicHostname(parsed.hostname)) {
    throw new Error("BLOCKED-CONFIG: WAFFO_PUBLIC_BASE_URL_PUBLIC");
  }
  return parsed.origin;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && second >= 18 && second <= 19)
    || (first === 198 && second === 51)
    || (first === 203 && second === 0)
    || first >= 224;
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe") || normalized.startsWith("ff") || normalized.startsWith("2001:db8")) {
    return true;
  }
  const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (mapped) return isPrivateIpv4(mapped);
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const first = Number.parseInt(mappedHex[1], 16);
    const second = Number.parseInt(mappedHex[2], 16);
    return isPrivateIpv4(`${first >> 8}.${first & 255}.${second >> 8}.${second & 255}`);
  }
  return false;
}

/** WHATWG URL accepts legacy decimal/hex IPv4 spellings; classify them too. */
function legacyIpv4(hostname: string): string | undefined {
  const parts = hostname.split(".");
  if (parts.length < 1 || parts.length > 4 || parts.some((part) => !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(part))) return undefined;
  const values = parts.map((part) => {
    if (/^0x/i.test(part)) return Number.parseInt(part.slice(2), 16);
    // Match WHATWG URL's legacy IPv4 spelling, where a multi-digit leading
    // zero selects octal (e.g. 0177.0.0.1 is 127.0.0.1).
    if (part.length > 1 && part.startsWith("0")) return Number.parseInt(part, 8);
    return Number.parseInt(part, 10);
  });
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) return undefined;
  let address: number;
  if (values.length === 1 && values[0] <= 0xffff_ffff) {
    address = values[0];
  } else if (values.length === 2 && values[0] <= 0xff && values[1] <= 0xffffff) {
    address = (values[0] << 24) + values[1];
  } else if (values.length === 3 && values[0] <= 0xff && values[1] <= 0xff && values[2] <= 0xffff) {
    address = (values[0] << 24) + (values[1] << 16) + values[2];
  } else if (values.length === 4 && values.every((value) => value <= 0xff)) {
    address = (values[0] << 24) + (values[1] << 16) + (values[2] << 8) + values[3];
  } else {
    return undefined;
  }
  return `${(address >>> 24) & 0xff}.${(address >>> 16) & 0xff}.${(address >>> 8) & 0xff}.${address & 0xff}`;
}

function canonicalHostname(hostname: string): string | undefined {
  if (!hostname || hostname.trim() !== hostname || hostname.includes("%") || /[^\x00-\x7F]/.test(hostname)) {
    return undefined;
  }
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!normalized || normalized.endsWith(".") || normalized.includes("..")) return undefined;
  if (normalized.split(".").some((label) => label === "" || label.startsWith("xn--"))) return undefined;
  return normalized;
}

export function isPublicHostname(hostname: string): boolean {
  const normalized = canonicalHostname(hostname);
  if (!normalized) return false;
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return !isPrivateIpv4(normalized);
  if (ipVersion === 6) return !isPrivateIpv6(normalized);
  const legacy = legacyIpv4(normalized);
  if (legacy) return !isPrivateIpv4(legacy);
  if (/^(?:(?:0x[0-9a-f]+|[0-9]+)\.){0,3}(?:0x[0-9a-f]+|[0-9]+)$/i.test(normalized)) return false;
  if (!normalized.includes(".") || normalized === "localhost" || normalized.endsWith(".localhost")) return false;
  return ![".local", ".internal", ".test", ".invalid", ".example"].some((suffix) => normalized.endsWith(suffix));
}

function apiBase(env: PaymentEnv, mode: PaymentMode): string {
  const raw = env.WAFFO_API_BASE?.trim() || DEFAULT_WAFFO_API_BASE;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || !parsed.hostname) {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE");
  }
  const official = new URL(DEFAULT_WAFFO_API_BASE);
  if (mode === "waffo-prod" && parsed.origin !== official.origin) {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE_OFFICIAL");
  }
  if (mode === "waffo-test" && parsed.origin !== official.origin && (env.NODE_ENV !== "test" || env.WAFFO_ALLOW_TEST_API_OVERRIDE !== "1")) {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE_TEST_OVERRIDE");
  }
  return parsed.origin;
}

function durablePath(env: PaymentEnv): string {
  const value = env.DATABASE_PATH?.trim();
  if (!value || isMemoryDatabasePath(value)) {
    throw new Error("BLOCKED-CONFIG: DATABASE_PATH");
  }
  return value;
}

export function isMemoryDatabasePath(value: string): boolean {
  return value === ":memory:"
    || value.startsWith("file::memory:")
    || /^file:[^?]*(?:\?|&)mode=memory(?:&|$)/i.test(value);
}

/** Validate all network and persistence prerequisites before any Waffo call. */
export function requireWaffoConfig(
  env: PaymentEnv = process.env,
  mode: PaymentMode = getPaymentMode(env),
): WaffoConfig {
  if (env.WAFFO_MODE?.trim() !== mode) {
    throw new Error("BLOCKED-CONFIG: WAFFO_MODE");
  }
  if (env.NODE_ENV === "production" && mode !== "waffo-prod") {
    throw new Error("BLOCKED-CONFIG: WAFFO_MODE_PRODUCTION");
  }
  if (mode === "fixture") {
    throw new Error("BLOCKED-CONFIG: WAFFO_MODE_LIVE_REQUIRED");
  }
  const environment = mode === "waffo-test" ? "test" : "prod";
  const merchantId = required(env, "WAFFO_MERCHANT_ID");
  const privateKey = privateKeyFromEnv(env);
  const storeId = required(env, "WAFFO_STORE_ID");
  const productId = required(env, "WAFFO_PRODUCT_ID");
  const publicUrl = publicBaseUrl(env, mode);
  const databasePath = durablePath(env);
  const testKey = env.WAFFO_WEBHOOK_TEST_PUBLIC_KEY?.trim();
  const prodKey = env.WAFFO_WEBHOOK_PROD_PUBLIC_KEY?.trim();
  const scopedKey = mode === "waffo-test" ? testKey : prodKey;
  if (!scopedKey) {
    throw new Error(`BLOCKED-CONFIG: ${mode === "waffo-test" ? "WAFFO_WEBHOOK_TEST_PUBLIC_KEY" : "WAFFO_WEBHOOK_PROD_PUBLIC_KEY"}`);
  }
  return {
    mode,
    environment,
    merchantId,
    privateKey,
    storeId,
    productId,
    publicBaseUrl: publicUrl,
    apiBase: apiBase(env, mode),
    databasePath,
    webhookPublicKeys: mode === "waffo-test" ? { test: scopedKey } : { prod: scopedKey },
  };
}

/** Legacy Waffo helper names are kept without reviving the hand-rolled client. */
export function isWaffoLive(env: PaymentEnv = process.env): boolean {
  try {
    return getPaymentMode(env) !== "fixture";
  } catch {
    return false;
  }
}

export function waffoApiBase(env: PaymentEnv = process.env): string {
  return (env.WAFFO_API_BASE?.trim() || DEFAULT_WAFFO_API_BASE).replace(/\/$/, "");
}

export function requireWaffoSecret(
  name: "WAFFO_MERCHANT_ID" | "WAFFO_STORE_ID" | "WAFFO_PRODUCT_ID" | "WAFFO_PRIVATE_KEY_FILE",
  env: PaymentEnv = process.env,
): string {
  if (name === "WAFFO_PRIVATE_KEY_FILE") return privateKeyFromEnv(env);
  return required(env, name);
}

export function waffoPrivateKey(env: PaymentEnv = process.env): string {
  return privateKeyFromEnv(env);
}
