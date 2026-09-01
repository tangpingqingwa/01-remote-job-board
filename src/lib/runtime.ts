export type RuntimeEnv = Record<string, string | undefined>;

/** A production server is distinct from Next's build-time module evaluation. */
export function isProductionRuntime(env: RuntimeEnv = process.env): boolean {
  return env.NODE_ENV === "production" && env.NEXT_PHASE !== "phase-production-build";
}
