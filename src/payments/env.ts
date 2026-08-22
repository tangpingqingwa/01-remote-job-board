export type PolarEnv = Record<string, string | undefined>;

/** Live Polar only when POLAR_LIVE=1 and fixture override is unset. */
export function isPolarLive(env: PolarEnv = process.env): boolean {
  if (env.POLAR_FIXTURE_ONLY === "1") return false;
  return env.POLAR_LIVE === "1";
}

export function requirePolarSecret(
  name: "POLAR_ACCESS_TOKEN" | "POLAR_WEBHOOK_SECRET" | "POLAR_PRODUCT_ID",
  env: PolarEnv = process.env,
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`BLOCKED-SECRET: ${name}`);
  }
  return value;
}
