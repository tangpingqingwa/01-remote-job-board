import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const smokeScript = join(root, "scripts/live-smoke.sh");
const releaseScript = join(root, "scripts/test.sh");

function rejectBase(base: string): void {
  const result = spawnSync("bash", [smokeScript], {
    cwd: root,
    encoding: "utf8",
    timeout: 5_000,
    env: {
      PATH: process.env.PATH ?? "",
      CI: "",
      GITHUB_ACTIONS: "",
      NODE_ENV: "test",
      WAFFO_MODE: "fixture",
      LIVE_SMOKE_BASE: base,
    },
  });
  assert.equal(result.error, undefined, `${base}: ${result.error?.message ?? "spawn failed"}`);
  assert.notEqual(result.status, 0, `${base} must be rejected`);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /LIVE_SMOKE_BASE is unsupported; offline smoke always starts a local fixture process/,
  );
}

test("offline smoke rejects remote LIVE_SMOKE_BASE before any network work", () => {
  rejectBase("https://remote.example.invalid");
});

test("offline smoke rejects userinfo LIVE_SMOKE_BASE before any network work", () => {
  rejectBase("http://smoke-user:smoke-pass@127.0.0.1:43123");
});

test("offline gate children scrub every retired Polar environment variable", () => {
  const retiredPolar = [
    "POLAR_LIVE",
    "POLAR_ACCESS_TOKEN",
    "POLAR_WEBHOOK_SECRET",
    "POLAR_PRODUCT_ID",
    "POLAR_API_BASE",
    "POLAR_SUCCESS_URL",
    "POLAR_FIXTURE_ONLY",
  ];
  const smoke = readFileSync(smokeScript, "utf8");
  const smokeStart = smoke.indexOf("unset WAFFO_MODE");
  const smokeEnd = smoke.indexOf("export WAFFO_MODE=fixture", smokeStart);
  assert.ok(smokeStart >= 0 && smokeEnd > smokeStart, "smoke fixture environment block is missing");
  const smokeEnvBlock = smoke.slice(smokeStart, smokeEnd);

  const release = readFileSync(releaseScript, "utf8");
  const releaseStart = release.indexOf("unset WAFFO_MODE");
  const releaseEnd = release.indexOf("export WAFFO_MODE=fixture", releaseStart);
  assert.ok(releaseStart >= 0 && releaseEnd > releaseStart, "release fixture environment block is missing");
  const releaseEnvBlock = release.slice(releaseStart, releaseEnd);

  for (const name of retiredPolar) {
    assert.match(smokeEnvBlock, new RegExp(`\\b${name}\\b`), `smoke child must clear ${name}`);
    assert.match(releaseEnvBlock, new RegExp(`\\b${name}\\b`), `release child must clear ${name}`);
  }
  assert.match(smoke, /export WAFFO_MODE=fixture/);
  assert.match(release, /export WAFFO_MODE=fixture/);
});
