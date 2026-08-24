import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as getClick } from "../src/app/out/[id]/route";
import { Board } from "../src/components/board/board";
import { ListingCard } from "../src/components/board/listing-card";
import {
  getBoardListings,
  getLiveBoardListings,
} from "../src/lib/board";
import { applyClickPath } from "../src/lib/clicks";
import {
  currentPeriodId,
  currentPeriodMeta,
  isoWeekPeriodId,
  isClosedPeriod,
  nextMondayUtc,
  resolveBoardPeriod,
} from "../src/lib/period";
import { rankListings } from "../src/lib/rank";
import { defaultBoardStore } from "../src/lib/store";
import { fixtureListing } from "./fixtures/listings";

const WEEK_34 = "2026-W34";
const WEEK_33 = "2026-W33";
const MONDAY = new Date("2026-08-17T00:00:00.000Z");
const SUNDAY = new Date("2026-08-16T23:59:59.999Z");

afterEach(() => {
  defaultBoardStore.reset();
});

function seedPaid(overrides: Parameters<typeof fixtureListing>[0]): void {
  defaultBoardStore.insertPaid(fixtureListing(overrides));
}

test("Monday 00:00 UTC is included in the new ISO week", () => {
  assert.equal(isoWeekPeriodId(MONDAY), WEEK_34);
  assert.equal(currentPeriodId(MONDAY), WEEK_34);
  assert.equal(nextMondayUtc(MONDAY).toISOString(), "2026-08-24T00:00:00.000Z");
  assert.deepEqual(currentPeriodMeta(MONDAY), {
    periodId: WEEK_34,
    nextResetAt: "2026-08-24T00:00:00.000Z",
    cadence: "weekly",
    live: true,
  });
});

test("Sunday still belongs to the previous ISO week", () => {
  assert.equal(isoWeekPeriodId(SUNDAY), WEEK_33);
  assert.equal(currentPeriodId(SUNDAY), WEEK_33);
  assert.equal(nextMondayUtc(SUNDAY).toISOString(), "2026-08-17T00:00:00.000Z");
});

test("one millisecond before Monday 00:00 UTC stays on the previous week", () => {
  assert.notEqual(isoWeekPeriodId(SUNDAY), isoWeekPeriodId(MONDAY));
  assert.equal(isoWeekPeriodId(SUNDAY), WEEK_33);
  assert.equal(isoWeekPeriodId(MONDAY), WEEK_34);
});

test("ISO year can differ from the calendar year near 1 January", () => {
  assert.equal(isoWeekPeriodId(new Date("2026-12-31T12:00:00.000Z")), "2026-W53");
  assert.equal(isoWeekPeriodId(new Date("2027-01-01T00:00:00.000Z")), "2026-W53");
  assert.equal(isoWeekPeriodId(new Date("2027-01-04T00:00:00.000Z")), "2027-W01");
});

test("injected clock rolls the week and live query drops old bids", () => {
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

  assert.deepEqual(
    getLiveBoardListings("backend", SUNDAY).map((row) => row.id),
    ["lst_old"],
  );
  assert.deepEqual(
    getLiveBoardListings("backend", MONDAY).map((row) => row.id),
    ["lst_live"],
  );
  assert.deepEqual(getBoardListings("backend", WEEK_33).map((row) => row.id), [
    "lst_old",
  ]);
});

test("board reads only the current periodId unless ?period= is a closed week", () => {
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
  assert.equal(live.periodId, WEEK_34);
  assert.equal(live.live, true);
  assert.deepEqual(
    getBoardListings("backend", live.periodId).map((row) => row.id),
    ["lst_live"],
  );

  const closed = resolveBoardPeriod(WEEK_33, MONDAY);
  assert.equal(closed.periodId, WEEK_33);
  assert.equal(closed.live, false);
  assert.deepEqual(
    getBoardListings("backend", closed.periodId).map((row) => row.id),
    ["lst_old"],
  );

  const future = resolveBoardPeriod("2026-W35", MONDAY);
  assert.equal(future.periodId, WEEK_34);
  assert.equal(future.live, true);

  const junk = resolveBoardPeriod("not-a-week", MONDAY);
  assert.equal(junk.periodId, WEEK_34);
  assert.equal(isClosedPeriod(WEEK_34, MONDAY), false);
  assert.equal(isClosedPeriod(WEEK_33, MONDAY), true);
});

function setCookieHeader(response: Response): string {
  const raw = response.headers.get("set-cookie") ?? "";
  return raw.split(";")[0] ?? "";
}

test("GET /out/:id increments public clicks and 302s to the canonical apply URL", async () => {
  seedPaid({
    id: "lst_click",
    company: "Acme",
    bidUsd: 5,
    applyUrl: "https://jobs.example.com/acme",
    clicks: 0,
    createdAt: "2026-08-17T09:00:00.000Z",
  });
  assert.equal(applyClickPath("lst_click"), "/out/lst_click");

  const response = await getClick(
    new Request("http://localhost/out/lst_click"),
    { params: { id: "lst_click" } },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://jobs.example.com/acme");
  assert.doesNotMatch(response.headers.get("location") ?? "", /[?#]/);
  assert.equal(defaultBoardStore.getById("lst_click")?.clicks, 1);

  const again = await getClick(
    new Request("http://localhost/out/lst_click"),
    { params: Promise.resolve({ id: "lst_click" }) },
  );
  assert.equal(again.status, 302);
  assert.equal(again.headers.get("location"), "https://jobs.example.com/acme");
  assert.equal(defaultBoardStore.getById("lst_click")?.clicks, 2);
});

test("same session cookie does not increment the same listing again within 10 minutes", async () => {
  seedPaid({
    id: "lst_once",
    company: "Acme",
    bidUsd: 5,
    applyUrl: "https://jobs.example.com/acme",
    createdAt: "2026-08-17T09:00:00.000Z",
  });

  const first = await getClick(new Request("http://localhost/out/lst_once"), {
    params: { id: "lst_once" },
  });
  const cookie = setCookieHeader(first);
  assert.match(cookie, /^rj_click=/);
  assert.equal(defaultBoardStore.getById("lst_once")?.clicks, 1);

  const refresh = await getClick(
    new Request("http://localhost/out/lst_once", {
      headers: { cookie },
    }),
    { params: { id: "lst_once" } },
  );
  assert.equal(refresh.status, 302);
  assert.equal(refresh.headers.get("location"), "https://jobs.example.com/acme");
  assert.equal(defaultBoardStore.getById("lst_once")?.clicks, 1);
});

test("click hop strips leftover tracking and never adds query params", async () => {
  seedPaid({
    id: "lst_dirty",
    company: "Beta",
    bidUsd: 7,
    applyUrl: "https://Jobs.Example.com:443/beta/?utm_source=x&fbclid=1#frag",
    createdAt: "2026-08-17T09:00:00.000Z",
  });

  const response = await getClick(
    new Request("http://localhost/out/lst_dirty"),
    { params: { id: "lst_dirty" } },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://jobs.example.com/beta");
  assert.doesNotMatch(response.headers.get("location") ?? "", /utm_|fbclid|[?#]/);
});

test("unknown listing click is 404 not_found", async () => {
  const missing = await getClick(new Request("http://localhost/out/missing"), {
    params: { id: "missing" },
  });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { code: "not_found" });
});

test("click count is public on the card and Apply uses /out/:id", () => {
  const listing = rankListings([
    fixtureListing({
      id: "lst_card",
      company: "Acme",
      title: "Staff Backend Engineer",
      bidUsd: 21,
      clicks: 9,
      createdAt: "2026-08-17T10:00:00.000Z",
    }),
  ])[0];
  assert.ok(listing);
  const html = renderToStaticMarkup(
    createElement(ListingCard, { listing }),
  );
  assert.match(html, /9 clicks/);
  assert.match(html, /data-clicks=""/);
  assert.match(html, /href="\/out\/lst_card"/);
  assert.match(html, /data-apply-url="https:\/\/jobs.example.com\/acme"/);
  assert.match(html, /data-take-apply=""/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-apply-after-identity=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.doesNotMatch(html, /utm_/);
});

test("closed-week board is read-only history of that period", () => {
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: WEEK_33,
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
      live: false,
    }),
  );
  assert.match(html, /data-period="2026-W33"/);
  assert.match(html, /data-period-live="false"/);
  assert.match(html, /Closed week/);
  assert.match(html, /period=2026-W33/);
  assert.match(html, /data-empty-closed="true"/);
  assert.match(html, /Bids are closed/);
  assert.match(html, /This lane was empty/);
  assert.match(html, /data-live-week=""/);
  assert.match(html, /href="\/\?lane=backend"/);
  assert.match(html, /Open this week/);
  assert.doesNotMatch(html, /Pay \$5 to list/);
  assert.doesNotMatch(html, /Empty bay/);
  assert.doesNotMatch(html, /data-empty-bay-list/);
  assert.doesNotMatch(html, /data-empty-identity/);
  assert.doesNotMatch(html, /data-empty-identity-first/);
  assert.doesNotMatch(html, /data-bid-form/);
  assert.doesNotMatch(html, />Outbid</);
  assert.doesNotMatch(html, /data-list-role/);
  assert.doesNotMatch(html, /List a role/);
  assert.doesNotMatch(html, /data-list-after-apply/);
  assert.doesNotMatch(html, /data-list-after-apply-first/);
  assert.doesNotMatch(html, /data-list-after-apply-two/);
  assert.doesNotMatch(html, /data-list-after-apply-three/);
  assert.doesNotMatch(html, /after Apply/);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-apply-after-list-first/);
  assert.doesNotMatch(html, /data-apply-after-list-two/);
  assert.doesNotMatch(html, /data-apply-after-list-three/);
});

test("closed-week occupied board stays history and still has no checkout", () => {
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
  assert.match(html, /data-period-live="false"/);
  assert.match(html, /Closed week/);
  assert.match(html, /data-listing-card/);
  assert.match(html, /\$21/);
  assert.match(html, />Apply</);
  assert.match(html, /href="\/out\/lst_old"/);
  assert.match(html, /href="\/out\/lst_old_later"/);
  assert.match(html, /data-rank="2"/);
  assert.doesNotMatch(html, /data-empty-lane/);
  assert.doesNotMatch(html, /Pay \$5 to list/);
  assert.doesNotMatch(html, /data-bid-form/);
  assert.doesNotMatch(html, />Outbid</);
  assert.doesNotMatch(html, /data-take-apply/);
  assert.doesNotMatch(html, /data-apply-live/);
  assert.doesNotMatch(html, /data-apply-after-identity/);
  assert.doesNotMatch(html, /data-later-apply/);
  assert.doesNotMatch(html, /data-apply-later/);
  assert.doesNotMatch(html, /data-list-role/);
  assert.doesNotMatch(html, /List a role/);
  assert.doesNotMatch(html, /data-list-after-apply/);
  assert.doesNotMatch(html, /data-list-after-apply-first/);
  assert.doesNotMatch(html, /data-list-after-apply-two/);
  assert.doesNotMatch(html, /data-list-after-apply-three/);
  assert.doesNotMatch(html, /after Apply/);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-apply-after-list-first/);
  assert.doesNotMatch(html, /data-apply-after-list-two/);
  assert.doesNotMatch(html, /data-apply-after-list-three/);
});
