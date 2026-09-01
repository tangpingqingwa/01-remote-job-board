import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { afterEach, test } from "node:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as getClick } from "../src/app/out/[id]/route";
import { Board } from "../src/components/board/board";
import { getBoardListings, getLiveBoardListings } from "../src/lib/board";
import { applyClickPath } from "../src/lib/clicks";
import {
  currentPeriodId,
  currentPeriodMeta,
  isoWeekPeriodId,
  isClosedPeriod,
  isInRollingWeek,
  liveRankResetAt,
  nextMondayUtc,
  placementExpiresAt,
  resolveBoardPeriod,
  rollingWeekStart,
  ROLLING_WEEK_MS,
} from "../src/lib/period";
import { rankListings } from "../src/lib/rank";
import { defaultBoardStore, BoardStore } from "../src/lib/store";
import { fixtureListing } from "./fixtures/listings";

const WEEK_34 = "2026-W34";
const WEEK_33 = "2026-W33";
const MONDAY = new Date("2026-08-17T00:00:00.000Z");
const SUNDAY = new Date("2026-08-16T23:59:59.999Z");
const RESET_FOR_TEST = "2026-08-24T00:00:00.000Z";

afterEach(() => {
  defaultBoardStore.reset();
});

function seedPaid(overrides: Parameters<typeof fixtureListing>[0]): void {
  defaultBoardStore.insertPaid(fixtureListing(overrides));
}

type StoreProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

function runStoreProcess(
  databasePath: string,
  body: string,
  extraEnv: Record<string, string> = {},
): Promise<StoreProcessResult> {
  const storeUrl = pathToFileURL(join(process.cwd(), "src/lib/store.ts")).href;
  const rankUrl = pathToFileURL(join(process.cwd(), "src/lib/rank.ts")).href;
  const source = `import { BoardStore } from ${JSON.stringify(storeUrl)}; import { rankListings } from ${JSON.stringify(rankUrl)}; ${body}`;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", source],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        WAFFO_MODE: "fixture",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: StoreProcessResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once("error", (error) => {
      finish({
        code: null,
        signal: null,
        stdout,
        stderr: `${stderr}${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      });
    });
    child.once("close", (code, signal) => {
      finish({ code, signal, stdout, stderr });
    });
  });
}

test("BoardStore defers SQLite side effects until the first runtime operation", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "remote-job-board-lazy-store-"));
  const databasePath = join(tempDir, "board.sqlite");
  const store = new BoardStore(databasePath);

  try {
    assert.equal(existsSync(databasePath), false);
    assert.deepEqual(store.listPaid("backend", WEEK_34), []);
    assert.equal(existsSync(databasePath), true);
  } finally {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("SQLite board survives process restart and concurrent click increments", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "remote-job-board-store-"));
  const databasePath = join(tempDir, "board.sqlite");
  const original = fixtureListing({
    id: "lst_restart",
    company: "Acme",
    companyHandle: "acme-restart",
    applyUrl: "https://jobs.example.com/acme-restart",
    bidUsd: 5,
    paidUsd: 5,
    payerId: "pay_restart",
    periodId: WEEK_34,
    createdAt: "2026-08-20T09:00:00.000Z",
  });
  const competing = fixtureListing({
    id: "lst_restart_competing",
    company: "Beta",
    companyHandle: "beta-restart",
    applyUrl: "https://jobs.example.com/beta-restart",
    bidUsd: 10,
    paidUsd: 10,
    payerId: "pay_competing",
    periodId: WEEK_34,
    createdAt: "2026-08-20T10:00:00.000Z",
  });

  try {
    const seeded = await runStoreProcess(
      databasePath,
      `
        const store = new BoardStore();
        const peer = new BoardStore();
        store.insertPaid(JSON.parse(process.env.ORIGINAL_LISTING ?? ""));
        store.insertPaid(JSON.parse(process.env.COMPETING_LISTING ?? ""));
        if (!peer.getById("lst_restart")) throw new Error("peer store did not observe insert");
        peer.close();
        store.close();
      `,
      {
        ORIGINAL_LISTING: JSON.stringify(original),
        COMPETING_LISTING: JSON.stringify(competing),
      },
    );
    assert.equal(seeded.code, 0, seeded.stderr);

    const raised = await runStoreProcess(
      databasePath,
      `
        const store = new BoardStore();
        const existing = store.findLiveByIdentity(
          "backend",
          { applyUrl: "https://jobs.example.com/acme-restart", companyHandle: "acme-restart" },
          new Date("2026-08-20T12:00:00.000Z"),
        );
        if (!existing) throw new Error("restart listing was not found for raise");
        store.updatePaid({ ...existing, bidUsd: 15, paidUsd: existing.paidUsd + 10, updatedAt: "2026-08-20T12:01:00.000Z" });
        store.close();
      `,
    );
    assert.equal(raised.code, 0, raised.stderr);

    const verified = await runStoreProcess(
      databasePath,
      `
        const store = new BoardStore();
        const ranked = rankListings(store.listPaid("backend", "2026-W34"));
        const clicked = store.incrementClicks("lst_restart");
        process.stdout.write(JSON.stringify({
          ids: ranked.map((row) => row.id),
          bidUsd: ranked[0]?.bidUsd,
          paidUsd: ranked[0]?.paidUsd,
          clicks: clicked?.clicks,
          payerId: clicked?.payerId,
          createdAt: clicked?.createdAt,
        }));
        store.close();
      `,
    );
    assert.equal(verified.code, 0, verified.stderr);
    assert.deepEqual(JSON.parse(verified.stdout.trim()), {
      ids: ["lst_restart", "lst_restart_competing"],
      bidUsd: 15,
      paidUsd: 15,
      clicks: 1,
      payerId: "pay_restart",
      createdAt: original.createdAt,
    });

    const concurrentClicks = await Promise.all(
      Array.from({ length: 6 }, () =>
        runStoreProcess(
          databasePath,
          `
            const store = new BoardStore();
            if (!store.incrementClicks("lst_restart")) throw new Error("click target missing");
            store.close();
          `,
        ),
      ),
    );
    for (const result of concurrentClicks) assert.equal(result.code, 0, result.stderr);

    const clickCount = await runStoreProcess(
      databasePath,
      `
        const store = new BoardStore();
        process.stdout.write(String(store.getById("lst_restart")?.clicks ?? -1));
        store.close();
      `,
    );
    assert.equal(clickCount.code, 0, clickCount.stderr);
    assert.equal(clickCount.stdout.trim(), "7");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("SQLite identity uniqueness serializes concurrent paid inserts", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "remote-job-board-unique-"));
  const databasePath = join(tempDir, "board.sqlite");
  const first = fixtureListing({
    id: "lst_unique_a",
    company: "Same Company",
    companyHandle: "same-company",
    applyUrl: "https://jobs.example.com/same-company",
    bidUsd: 5,
    paidUsd: 5,
    payerId: "pay_a",
    periodId: WEEK_34,
    createdAt: "2026-08-21T09:00:00.000Z",
  });
  const second = { ...first, id: "lst_unique_b", payerId: "pay_b" };

  try {
    const initialized = await runStoreProcess(
      databasePath,
      `const store = new BoardStore(); store.close();`,
    );
    assert.equal(initialized.code, 0, initialized.stderr);
    const results = await Promise.all([
      runStoreProcess(
        databasePath,
        `const store = new BoardStore(); store.insertPaid(JSON.parse(process.env.LISTING ?? "")); store.close();`,
        { LISTING: JSON.stringify(first) },
      ),
      runStoreProcess(
        databasePath,
        `const store = new BoardStore(); store.insertPaid(JSON.parse(process.env.LISTING ?? "")); store.close();`,
        { LISTING: JSON.stringify(second) },
      ),
    ]);
    assert.equal(results.filter((result) => result.code === 0).length, 1);
    assert.equal(results.filter((result) => result.code !== 0).length, 1);
    assert.match(results.find((result) => result.code !== 0)?.stderr ?? "", /UNIQUE constraint failed/);

    const winner = await runStoreProcess(
      databasePath,
      `const store = new BoardStore(); process.stdout.write(JSON.stringify(store.listPaid("backend", "2026-W34").map((row) => row.id))); store.close();`,
    );
    assert.equal(winner.code, 0, winner.stderr);
    assert.deepEqual(JSON.parse(winner.stdout.trim()).length, 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("ISO week labels follow Monday UTC while live rank remains rolling", () => {
  assert.equal(isoWeekPeriodId(MONDAY), WEEK_34);
  assert.equal(isoWeekPeriodId(SUNDAY), WEEK_33);
  assert.equal(currentPeriodId(MONDAY), WEEK_34);
  assert.equal(nextMondayUtc(MONDAY).toISOString(), "2026-08-24T00:00:00.000Z");
  assert.equal(nextMondayUtc(SUNDAY).toISOString(), "2026-08-17T00:00:00.000Z");
  assert.deepEqual(currentPeriodMeta(MONDAY), {
    periodId: WEEK_34,
    nextResetAt: "2026-08-24T00:00:00.000Z",
    cadence: "weekly",
    live: true,
  });
  assert.equal(ROLLING_WEEK_MS, 7 * 86_400_000);
  assert.equal(isoWeekPeriodId(new Date("2027-01-01T00:00:00.000Z")), "2026-W53");
  assert.equal(isoWeekPeriodId(new Date("2027-01-04T00:00:00.000Z")), "2027-W01");
});

test("paid placement stays live across Monday and expires after seven days", () => {
  seedPaid({
    id: "lst_sunday",
    company: "Acme",
    bidUsd: 21,
    periodId: WEEK_33,
    createdAt: "2026-08-16T23:00:00.000Z",
  });
  seedPaid({
    id: "lst_monday",
    company: "Beta",
    bidUsd: 8,
    periodId: WEEK_34,
    createdAt: "2026-08-17T10:00:00.000Z",
  });
  const mondayMorning = new Date("2026-08-17T00:01:00.000Z");
  assert.deepEqual(getLiveBoardListings("backend", mondayMorning).map((row) => row.id), [
    "lst_sunday",
  ]);
  assert.deepEqual(
    getLiveBoardListings("backend", new Date("2026-08-17T10:00:00.000Z")).map((row) => row.id),
    ["lst_sunday", "lst_monday"],
  );
  assert.equal(
    placementExpiresAt("2026-08-16T23:00:00.000Z"),
    "2026-08-23T23:00:00.000Z",
  );
  assert.equal(
    liveRankResetAt(getLiveBoardListings("backend", mondayMorning), mondayMorning),
    "2026-08-23T23:00:00.000Z",
  );
  assert.notEqual(liveRankResetAt([], mondayMorning), nextMondayUtc(mondayMorning).toISOString());
  assert.equal(
    rollingWeekStart(mondayMorning).toISOString(),
    "2026-08-10T00:01:00.000Z",
  );
  assert.ok(isInRollingWeek("2026-08-16T23:00:00.000Z", mondayMorning));

  const expiredAt = new Date("2026-08-23T23:00:00.001Z");
  assert.equal(isInRollingWeek("2026-08-16T23:00:00.000Z", expiredAt), false);
  assert.deepEqual(getLiveBoardListings("backend", expiredAt).map((row) => row.id), [
    "lst_monday",
  ]);

  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: WEEK_34,
      nextResetAt: liveRankResetAt(getLiveBoardListings("backend", mondayMorning), mondayMorning),
      listings: rankListings(getLiveBoardListings("backend", mondayMorning)),
    }),
  );
  assert.match(html, /data-week-window="rolling-7d"/);
  assert.match(html, /Rolling last 7 days from paid placement/);
  assert.match(html, /Each placement expires seven days after payment/);
  assert.doesNotMatch(html, /audit label|weekId/i);
  assert.match(html, /data-prize-title=""/);
  assert.match(html, />Apply</);
  assert.match(html, />Outbid</);
  assert.doesNotMatch(html, /data-empty-window|data-first-click="claim"/);
});

test("live rank is not a 24h lock — 25 hours later still occupies", () => {
  const paidAt = new Date("2026-08-16T23:00:00.000Z");
  const twentyFiveHoursLater = new Date("2026-08-18T00:00:00.000Z");
  assert.equal(
    twentyFiveHoursLater.getTime() - paidAt.getTime(),
    25 * 60 * 60 * 1000,
  );
  seedPaid({
    id: "lst_25h",
    company: "Acme",
    bidUsd: 21,
    periodId: WEEK_33,
    createdAt: paidAt.toISOString(),
  });
  assert.deepEqual(
    getLiveBoardListings("backend", twentyFiveHoursLater).map((row) => row.id),
    ["lst_25h"],
  );
  assert.ok(isInRollingWeek(paidAt.toISOString(), twentyFiveHoursLater));
});

test("board period resolution uses the current live period or an explicit closed history", () => {
  seedPaid({
    id: "lst_old",
    company: "Acme",
    bidUsd: 21,
    periodId: WEEK_33,
    createdAt: "2026-08-12T10:00:00.000Z",
  });
  seedPaid({
    id: "lst_live",
    company: "Beta",
    bidUsd: 8,
    periodId: WEEK_34,
    createdAt: "2026-08-17T10:00:00.000Z",
  });

  const live = resolveBoardPeriod(undefined, MONDAY);
  assert.deepEqual(
    [live.periodId, live.live, getBoardListings("backend", live.periodId).map((row) => row.id)],
    [WEEK_34, true, ["lst_live"]],
  );
  const closed = resolveBoardPeriod(WEEK_33, MONDAY);
  assert.deepEqual(
    [closed.periodId, closed.live, getBoardListings("backend", closed.periodId).map((row) => row.id)],
    [WEEK_33, false, ["lst_old"]],
  );
  assert.equal(resolveBoardPeriod("2026-W35", MONDAY).periodId, WEEK_34);
  assert.equal(resolveBoardPeriod("not-a-week", MONDAY).periodId, WEEK_34);
  assert.equal(isClosedPeriod(WEEK_34, MONDAY), false);
  assert.equal(isClosedPeriod(WEEK_33, MONDAY), true);
});

function setCookieHeader(response: Response): string {
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

test("GET /out/:id increments clicks, deduplicates a session, and 302s without query", async () => {
  seedPaid({
    id: "lst_click",
    company: "Acme",
    bidUsd: 5,
    applyUrl: "https://Jobs.Example.com:443/acme/?utm_source=x#frag",
    createdAt: "2026-08-17T09:00:00.000Z",
  });
  assert.equal(applyClickPath("lst_click"), "/out/lst_click");

  const first = await getClick(new Request("http://localhost/out/lst_click"), {
    params: Promise.resolve({ id: "lst_click" }),
  });
  assert.equal(first.status, 302);
  assert.equal(first.headers.get("location"), "https://jobs.example.com/acme");
  assert.match(setCookieHeader(first), /^rj_click=/);
  assert.equal(defaultBoardStore.getById("lst_click")?.clicks, 1);

  const refresh = await getClick(
    new Request("http://localhost/out/lst_click", {
      headers: { cookie: setCookieHeader(first) },
    }),
    { params: Promise.resolve({ id: "lst_click" }) },
  );
  assert.equal(refresh.status, 302);
  assert.equal(refresh.headers.get("location"), "https://jobs.example.com/acme");
  assert.equal(defaultBoardStore.getById("lst_click")?.clicks, 1);

  const otherSession = await getClick(new Request("http://localhost/out/lst_click"), {
    params: Promise.resolve({ id: "lst_click" }),
  });
  assert.equal(otherSession.status, 302);
  assert.equal(defaultBoardStore.getById("lst_click")?.clicks, 2);
  assert.doesNotMatch(otherSession.headers.get("location") ?? "", /[?#]/);
});

test("GET /out/:id treats malformed click-cookie encoding as empty history", async () => {
  seedPaid({
    id: "lst_malformed_cookie",
    company: "Acme",
    bidUsd: 5,
    applyUrl: "https://jobs.example.com/malformed-cookie",
    createdAt: "2026-08-17T09:00:00.000Z",
  });
  const response = await getClick(
    new Request("http://localhost/out/lst_malformed_cookie", {
      headers: { cookie: "rj_click=%" },
    }),
    { params: Promise.resolve({ id: "lst_malformed_cookie" }) },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://jobs.example.com/malformed-cookie");
  assert.equal(defaultBoardStore.getById("lst_malformed_cookie")?.clicks, 1);
});

test("unknown listing click is a 404 and does not invent a redirect", async () => {
  const missing = await getClick(new Request("http://localhost/out/missing"), {
    params: Promise.resolve({ id: "missing" }),
  });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { code: "not_found" });
});

test("closed empty weeks are read-only and keep live claim controls out", () => {
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: WEEK_33,
      nextResetAt: RESET_FOR_TEST,
      listings: [],
      live: false,
    }),
  );
  assert.match(html, /data-period-live="false"/);
  assert.match(html, /Closed week history 2026-W33 — read only/);
  assert.match(html, /data-empty-closed="true"/);
  assert.match(html, /Bids are closed in closed week history/);
  assert.match(html, /Open the live Backend wall for the rolling last 7 days/);
  assert.match(html, /class="wall-rail"/);
  assert.match(html, /Backend week history/);
  assert.doesNotMatch(html, /data-bid-form|>Outbid<|data-empty-bay-list|data-first-click/);
});

test("closed occupied weeks keep paid cards and facts but no live checkout", () => {
  const listings = rankListings([
    fixtureListing({
      id: "lst_old",
      company: "Acme",
      bidUsd: 21,
      periodId: WEEK_33,
      createdAt: "2026-08-12T10:00:00.000Z",
    }),
    fixtureListing({
      id: "lst_old_later",
      company: "Gamma",
      bidUsd: 8,
      periodId: WEEK_33,
      createdAt: "2026-08-13T10:00:00.000Z",
    }),
  ]);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: WEEK_33,
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
      live: false,
    }),
  );
  assert.match(html, /Closed week history 2026-W33 — read only/);
  assert.match(html, /data-prize-title=""/);
  assert.match(html, /data-later-pack=""/);
  assert.match(html, /href="\/out\/lst_old"/);
  assert.match(html, /href="\/out\/lst_old_later"/);
  assert.match(html, /data-lane="backend"[^>]*>Backend week history</);
  assert.doesNotMatch(html, /data-bid-form|>Outbid<|data-list-role|data-first-click="apply"/);
});

test("closed-week unpaid rows stay off the wall", () => {
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: WEEK_33,
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings([
        fixtureListing({
          id: "lst_old_unpaid",
          company: "Ghost",
          bidUsd: 21,
          paidUsd: 0,
          periodId: WEEK_33,
          createdAt: "2026-08-12T10:00:00.000Z",
        }),
      ]),
      live: false,
    }),
  );
  assert.match(html, /data-empty-closed="true"/);
  assert.match(html, /data-empty-honest=""/);
  assert.doesNotMatch(html, /data-listing-card|Ghost|>Apply<|data-bid-form/);
});
