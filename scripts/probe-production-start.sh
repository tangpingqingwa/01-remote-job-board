#!/usr/bin/env bash
# Offline child-process proof that a production server refuses missing live
# configuration before it can announce readiness. Every value is explicitly
# blank so this probe never depends on a developer's .env.local secrets.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

node --input-type=module - <<'NODE'
import { createServer } from "node:net";
import { spawn } from "node:child_process";

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close(() => reject(new Error("could not choose a probe port")));
      return;
    }
    const chosen = address.port;
    server.close((error) => error ? reject(error) : resolve(chosen));
  });
});

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1"], {
  cwd: process.cwd(),
  env: {
    PATH: process.env.PATH ?? "",
    NODE_ENV: "production",
    WAFFO_MODE: "waffo-prod",
    WAFFO_MERCHANT_ID: "",
    WAFFO_PRIVATE_KEY: "",
    WAFFO_PRIVATE_KEY_FILE: "",
    WAFFO_STORE_ID: "",
    WAFFO_PRODUCT_ID: "",
    WAFFO_PUBLIC_BASE_URL: "",
    WAFFO_API_BASE: "",
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY: "",
    WAFFO_WEBHOOK_PROD_PUBLIC_KEY: "",
    WAFFO_WEBHOOK_PUBLIC_KEY: "",
    DATABASE_PATH: "",
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => { output += String(chunk); });
child.stderr.on("data", (chunk) => { output += String(chunk); });
const result = await new Promise((resolve) => {
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    resolve(value);
  };
  child.once("close", (code, signal) => finish({ code, signal, timedOut: false }));
  setTimeout(() => {
    if (settled) return;
    child.kill("SIGTERM");
    finish({ code: null, signal: "SIGTERM", timedOut: true });
  }, 2500);
});

if (result.timedOut) {
  console.error(output);
  throw new Error("production start probe stayed alive with fixture configuration");
}
if (result.code === 0 || !/BLOCKED-CONFIG|FIXTURE_DISABLED_IN_PRODUCTION/.test(output)) {
  console.error(output);
  throw new Error(`production start probe did not fail closed (code=${result.code}, signal=${result.signal})`);
}
console.log(`production start probe: blocked before listening (exit=${result.code ?? result.signal})`);
NODE
