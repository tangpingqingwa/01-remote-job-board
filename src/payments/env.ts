export type PolarEnv = Record<string, string | undefined>;

/** Production Polar API. Override with POLAR_API_BASE for sandbox. */
export const DEFAULT_POLAR_API_BASE = "https://api.polar.sh";

/** Live Polar only when POLAR_LIVE=1 and fixture override is unset. */
export function isPolarLive(env: PolarEnv = process.env): boolean {
  if (env.POLAR_FIXTURE_ONLY === "1") return false;
  return env.POLAR_LIVE === "1";
}

export function polarApiBase(env: PolarEnv = process.env): string {
  const fromEnv = env.POLAR_API_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return DEFAULT_POLAR_API_BASE;
}

export function requirePolarSecret(
  name: "POLAR_ACCESS_TOKEN" | "POLAR_WEBHOOK_SECRET" | "POLAR_PRODUCT_ID",
  env: PolarEnv = process.env,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`BLOCKED-SECRET: ${name}`);
  }
  return value;
}
