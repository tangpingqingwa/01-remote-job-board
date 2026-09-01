#!/usr/bin/env bash
# Start the exact built Next artifact with disposable durable storage, prove
# the public readiness and board routes, and clean every process/file on exit.
# The synthetic Waffo production configuration is only for local startup
# validation; this probe never reaches a provider checkout or webhook.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

node --input-type=module - <<'NODE'
import { createServer } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const workdir = mkdtempSync(join(tmpdir(), "remote-job-board-built-runtime-"));
const databasePath = join(workdir, "board.sqlite");
let child;
let output = "";

function exportedKey(key, type) {
  return key.export({ type, format: "pem" }).toString();
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("could not choose a runtime-smoke port")));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve();
    };
    const killTimer = setTimeout(() => {
      processHandle.kill("SIGKILL");
      finish();
    }, 2_000);
    processHandle.once("close", finish);
    processHandle.kill("SIGTERM");
  });
}

let failure;
try {
  const port = await freePort();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privatePem = exportedKey(privateKey, "pkcs8");
  const publicPem = exportedKey(publicKey, "spki");
  const env = {
    PATH: process.env.PATH ?? "",
    NODE_ENV: "production",
    WAFFO_MODE: "waffo-prod",
    WAFFO_MERCHANT_ID: `MER_${"A".repeat(22)}`,
    WAFFO_PRIVATE_KEY: privatePem,
    WAFFO_PRIVATE_KEY_FILE: "",
    WAFFO_STORE_ID: `STO_${"B".repeat(22)}`,
    WAFFO_PRODUCT_ID: `PROD_${"C".repeat(22)}`,
    WAFFO_PUBLIC_BASE_URL: "https://jobs.example.com",
    WAFFO_API_BASE: "https://api.waffo.ai",
    WAFFO_WEBHOOK_PUBLIC_KEY: "",
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY: "",
    WAFFO_WEBHOOK_PROD_PUBLIC_KEY: publicPem,
    DATABASE_PATH: databasePath,
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: "1",
  };

  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  child.on("error", (error) => { output += `${error.message}\n`; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  let lastHealth = "not attempted";
  let lastHome = "not attempted";
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`built runtime exited before readiness (code=${child.exitCode}, signal=${child.signalCode})`);
    }
    try {
      const health = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1_000) });
      lastHealth = String(health.status);
      const healthBody = await health.text();
      if (health.status !== 200 || healthBody !== '{"ok":true}') {
        throw new Error(`unexpected /healthz response: ${health.status} ${healthBody}`);
      }
      const home = await fetch(`${base}/`, { signal: AbortSignal.timeout(1_000) });
      lastHome = String(home.status);
      const homeBody = await home.text();
      if (home.status !== 200 || !homeBody.includes('data-hiring-wall')) {
        throw new Error(`unexpected / response: ${home.status}`);
      }
      ready = true;
      break;
    } catch (error) {
      if (Date.now() >= deadline) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}; last /healthz=${lastHealth}, /=${lastHome}`);
      }
      await delay(100);
    }
  }
  if (!ready) {
    throw new Error(`built runtime did not become ready; last /healthz=${lastHealth}, /=${lastHome}`);
  }
} catch (error) {
  failure = error;
} finally {
  await stopProcess(child);
  rmSync(workdir, { recursive: true, force: true });
}

if (failure) {
  if (output) console.error(output);
  throw failure;
}
console.log("built runtime smoke: next start served /healthz and / (provider-free; temporary DB/process cleaned)");
NODE
