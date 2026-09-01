import { validateProductionStartup } from "../instrumentation-node";
import { openBoardDatabase } from "./db";
import { isProductionRuntime } from "./runtime";

type HealthEnv = Record<string, string | undefined>;

/**
 * Check the same persistence/configuration boundary used by the app without
 * returning the underlying error (which may contain an env-var or key name).
 * Production uses the strict startup validator; local fixture health checks
 * still verify that SQLite can open and execute a read.
 */
export function checkReadiness(env: HealthEnv = process.env): void {
  if (isProductionRuntime(env)) {
    validateProductionStartup(env);
    return;
  }

  const database = openBoardDatabase(undefined, env);
  try {
    database.prepare("SELECT 1 AS ok").get();
  } finally {
    database.close();
  }
}
