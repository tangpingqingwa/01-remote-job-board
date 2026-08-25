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
  isInRollingWeek,
  liveRankResetAt,
  nextMondayUtc,
  placementExpiresAt,
  resolveBoardPeriod,
  rollingWeekStart,
  ROLLING_WEEK_MS,
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
  assert.equal(ROLLING_WEEK_MS, 7 * 86_400_000);
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

test("injected clock keeps Sunday occupancy through Monday 00:00 UTC", () => {
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
    ["lst_old"],
  );
  assert.deepEqual(
    getLiveBoardListings("backend", new Date("2026-08-17T10:00:00.000Z")).map(
      (row) => row.id,
    ),
    ["lst_old", "lst_live"],
  );
  assert.deepEqual(getBoardListings("backend", WEEK_33).map((row) => row.id), [
    "lst_old",
  ]);
});

test("live rank is rolling last 7 days from paid placement — not Monday 00:00 UTC", () => {
  seedPaid({
    id: "lst_sunday",
    company: "Acme",
    title: "Staff Backend Engineer",
    bidUsd: 21,
    periodId: WEEK_33,
    createdAt: "2026-08-16T23:00:00.000Z",
  });
  const mondayMorning = new Date("2026-08-17T00:01:00.000Z");
  const still = getLiveBoardListings("backend", mondayMorning);
  assert.deepEqual(still.map((row) => row.id), ["lst_sunday"]);
  assert.equal(isoWeekPeriodId(mondayMorning), WEEK_34);
  assert.equal(still[0]?.periodId, WEEK_33);
  assert.equal(
    placementExpiresAt("2026-08-16T23:00:00.000Z"),
    "2026-08-23T23:00:00.000Z",
  );
  assert.equal(
    liveRankResetAt(still, mondayMorning),
    "2026-08-23T23:00:00.000Z",
  );
  assert.notEqual(
    liveRankResetAt(still, mondayMorning),
    nextMondayUtc(mondayMorning).toISOString(),
  );
  assert.ok(isInRollingWeek("2026-08-16T23:00:00.000Z", mondayMorning));
  assert.equal(
    rollingWeekStart(mondayMorning).toISOString(),
    "2026-08-10T00:01:00.000Z",
  );

  const occupied = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: WEEK_34,
      nextResetAt: liveRankResetAt(still, mondayMorning),
      listings: rankListings(still),
    }),
  );
  assert.match(occupied, /data-week-window="rolling-7d"/);
  assert.match(occupied, /Rolling last 7 days from paid placement/);
  assert.match(occupied, /Week 2026-W34 is an audit label/);
  assert.match(
    occupied,
    /This remote \(global\) Backend wall is the rolling last 7 days from paid placement/,
  );
  assert.match(occupied, /aria-label="Rolling last 7 days #1"/);
  assert.doesNotMatch(occupied, /This week(?:'|&#x27;|&apos;)s remote \(global\)/);
  assert.doesNotMatch(occupied, /This week(?:'|&#x27;|&apos;)s #1/);
  assert.doesNotMatch(occupied, /Later ranks this week/);
  assert.match(occupied, /2026-08-23T23:00:00.000Z/);
  assert.doesNotMatch(occupied, /2026-08-17T00:00:00.000Z/);
  assert.match(occupied, /data-prize-title=""/);
  assert.match(occupied, /Staff Backend Engineer/);
  assert.match(occupied, /data-first-click="apply"/);
  assert.match(occupied, />Apply</);
  assert.match(occupied, /\$21/);
  assert.match(occupied, /data-clicks/);
  assert.match(occupied, />Outbid</);
  assert.ok(occupied.indexOf('data-first-click="apply"') < occupied.indexOf("wall-plate"));
  assert.doesNotMatch(occupied, /class="wall-rail"/);
  assert.match(occupied, /data-lane="backend"[^>]*>Backend</);
  assert.doesNotMatch(occupied, /data-lane="backend"[^>]*>Backend week history</);
  assert.doesNotMatch(occupied, /data-list-after-apply-N|data-list-after-apply-eight/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
});

test("live rank is not a 24h lock on #1 — 25 hours later still occupies", () => {
  seedPaid({
    id: "lst_hold",
    company: "Acme",
    bidUsd: 12,
    periodId: WEEK_33,
    createdAt: "2026-08-16T12:00:00.000Z",
  });
  const twentyFiveHours = new Date("2026-08-17T13:00:00.000Z");
  assert.deepEqual(
    getLiveBoardListings("backend", twentyFiveHours).map((row) => row.id),
    ["lst_hold"],
  );
  assert.ok(isInRollingWeek("2026-08-16T12:00:00.000Z", twentyFiveHours));
});

test("listing leaves live rank 7 days after paid placement", () => {
  seedPaid({
    id: "lst_expired",
    company: "Acme",
    bidUsd: 50,
    periodId: WEEK_33,
    createdAt: "2026-08-12T10:00:00.000Z",
  });
  seedPaid({
    id: "lst_unpaid",
    company: "Ghost",
    bidUsd: 50_000,
    paidUsd: 0,
    periodId: WEEK_33,
    createdAt: "2026-08-19T09:00:00.000Z",
  });
  const justAfter = new Date("2026-08-19T10:00:00.001Z");
  assert.equal(isInRollingWeek("2026-08-12T10:00:00.000Z", justAfter), false);
  assert.deepEqual(getLiveBoardListings("backend", justAfter), []);
  assert.deepEqual(getBoardListings("backend", WEEK_33).map((row) => row.id), [
    "lst_expired",
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
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
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
  assert.match(html, /Closed week history 2026-W33 — read only/);
  assert.doesNotMatch(html, /Period 2026-W33\. Next reset/);
  assert.doesNotMatch(html, /Next reset 2026-08-24T00:00:00\.000Z/);
  assert.match(html, /class="empty-lane-kicker">Closed week history</);
  assert.doesNotMatch(html, /class="empty-lane-kicker">Closed week</);
  assert.match(html, /Week 2026-W33 is read-only week history/);
  assert.doesNotMatch(
    html,
    /This week(?:'|&#x27;|&apos;)s remote \(global\) Backend wall/,
  );
  assert.doesNotMatch(html, /data-week-window="rolling-7d"/);
  assert.doesNotMatch(
    html,
    /Rolling last 7 days from paid placement\. Week 2026-W33 is an audit label/,
  );
  assert.match(html, /period=2026-W33/);
  assert.match(html, /data-empty-closed="true"/);
  assert.match(html, /data-empty-honest=""/);
  assert.match(html, /Bids are closed in closed week history/);
  assert.doesNotMatch(html, /Bids are closed\./);
  assert.match(html, /No listings in closed week history/);
  assert.match(html, /Closed week history was empty/);
  assert.doesNotMatch(html, /This lane was empty/);
  assert.doesNotMatch(html, /No listings this period/);
  assert.match(html, /data-live-week=""/);
  assert.match(html, /href="\/\?lane=backend"/);
  assert.match(
    html,
    /Open the live Backend wall for the rolling last 7 days from paid placement/,
  );
  assert.doesNotMatch(html, /Open this week/);
  assert.doesNotMatch(html, /Pay \$5 to list/);
  assert.doesNotMatch(html, /Empty bay/);
  assert.doesNotMatch(html, /data-empty-bay-list/);
  assert.doesNotMatch(html, /data-empty-identity/);
  assert.doesNotMatch(html, /data-empty-identity-first/);
  assert.doesNotMatch(html, /data-bid-form/);
  assert.doesNotMatch(html, />Outbid</);
  assert.doesNotMatch(html, /data-list-role/);
  assert.doesNotMatch(html, /List a role/);
  assert.doesNotMatch(html, /data-one-identity/);
  assert.doesNotMatch(html, /data-list-after-apply/);
  assert.doesNotMatch(html, /data-list-after-apply-first/);
  assert.doesNotMatch(html, /data-list-after-apply-two/);
  assert.doesNotMatch(html, /data-list-after-apply-three/);
  assert.doesNotMatch(html, /data-list-after-apply-four/);
  assert.doesNotMatch(html, /data-list-after-apply-five/);
  assert.doesNotMatch(html, /data-list-after-apply-six/);
  assert.doesNotMatch(html, /data-list-after-apply-seven/);
  assert.doesNotMatch(html, /after Apply/);
  assert.doesNotMatch(html, /data-list-after-apply-eight/);
  assert.doesNotMatch(html, /data-apply-after-list-seven/);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-apply-after-list-first/);
  assert.doesNotMatch(html, /data-apply-after-list-two/);
  assert.doesNotMatch(html, /data-apply-after-list-three/);
  assert.doesNotMatch(html, /data-apply-after-list-four/);
  assert.doesNotMatch(html, /data-apply-after-list-five/);
  assert.doesNotMatch(html, /data-apply-after-list-six/);
  assert.doesNotMatch(html, /data-prize-title/);
  assert.doesNotMatch(html, /data-later-fact/);
  assert.doesNotMatch(html, /data-later-quiet/);
  assert.doesNotMatch(html, /data-later-pack/);
  assert.doesNotMatch(html, /data-prize-pack/);
  assert.doesNotMatch(html, /data-later-role/);
  assert.doesNotMatch(html, /data-apply-later-outlined/);
  assert.doesNotMatch(html, /class="later-apply"/);
  assert.doesNotMatch(html, /data-empty-claim/);
  assert.doesNotMatch(html, /data-first-click="claim"/);
  assert.doesNotMatch(html, /Claim #1 for/);
  assert.doesNotMatch(html, /autofocus/i);
  assert.doesNotMatch(html, /<select[^>]*name="lane"/);
  assert.match(html, /wall-rail/);
  assert.match(html, /wall-plate/);
  assert.match(html, /class="wall-rail-kicker">Closed week history</);
  assert.match(html, /aria-label="Closed week history"/);
  assert.ok(
    html.indexOf(">Backend week history<") >= 0,
    "closed empty function plates must name closed week history, not live Function lanes",
  );
  assert.match(html, /data-lane="backend"[^>]*>Backend week history</);
  assert.match(html, /data-lane="founding"[^>]*>Founding week history</);
  assert.equal((html.match(/week history<\/a>/g) ?? []).length, 8);
  assert.doesNotMatch(html, /data-lane="backend"[^>]*>Backend</);
  assert.doesNotMatch(html, /class="wall-rail-kicker">Function lanes</);
  assert.doesNotMatch(html, /aria-label="Function lanes"/);
  assert.doesNotMatch(html, /Function lanes/);
  assert.doesNotMatch(html, /data-listing-card/);
  assert.doesNotMatch(html, /href="\/out\//);
  assert.doesNotMatch(html, />Apply</);
  assert.doesNotMatch(html, /data-unpaid-off|data-paid-only-wall/);
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
  assert.match(html, /Closed week history 2026-W33 — read only/);
  assert.doesNotMatch(html, /Period 2026-W33\. Next reset/);
  assert.doesNotMatch(html, /Next reset 2026-08-24T00:00:00\.000Z/);
  assert.match(html, /Closed week/);
  assert.match(html, /Week 2026-W33 is read-only week history/);
  assert.doesNotMatch(
    html,
    /This week(?:'|&#x27;|&apos;)s remote \(global\) Backend wall/,
  );
  assert.match(html, /aria-label="Closed week history #1"/);
  assert.match(html, /aria-label="Later ranks in closed week history"/);
  assert.doesNotMatch(html, /This week(?:'|&#x27;|&apos;)s #1/);
  assert.doesNotMatch(html, /Later ranks this week/);
  assert.doesNotMatch(html, /wall is the rolling last 7 days from paid placement/);
  assert.doesNotMatch(html, /aria-label="Rolling last 7 days #1"/);
  assert.doesNotMatch(html, /Later ranks in the rolling last 7 days/);
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
  assert.doesNotMatch(html, /data-apply-later-outlined/);
  assert.doesNotMatch(html, /data-list-role/);
  assert.doesNotMatch(html, /List a role/);
  assert.doesNotMatch(html, /data-first-click="claim"/);
  assert.doesNotMatch(html, /<select[^>]*name="lane"/);
  assert.match(html, /wall-rail/);
  assert.match(html, /wall-plate/);
  assert.ok(
    html.indexOf('class="wall-rail-kicker">Closed week history') >= 0,
    "closed occupied function-rail must name closed week history, not generic Function lanes",
  );
  assert.ok(
    html.indexOf(">Backend week history<") >= 0,
    "closed occupied function plates must name closed week history, not live Function lanes",
  );
  assert.match(html, /class="wall-rail-kicker">Closed week history</);
  assert.match(html, /aria-label="Closed week history"/);
  assert.match(html, /data-lane="backend"[^>]*>Backend week history</);
  assert.match(html, /data-lane="founding"[^>]*>Founding week history</);
  assert.equal((html.match(/week history<\/a>/g) ?? []).length, 8);
  assert.doesNotMatch(html, /data-lane="backend"[^>]*>Backend</);
  assert.doesNotMatch(html, /class="wall-rail-kicker">Function lanes</);
  assert.doesNotMatch(html, /aria-label="Function lanes"/);
  assert.doesNotMatch(html, /Function lanes/);
  assert.ok(html.indexOf("wall-rail") < html.indexOf("data-prize-title"));
  assert.ok(html.indexOf("wall-rail") < html.indexOf(">Apply<"));
  assert.doesNotMatch(html, /data-one-identity/);
  assert.doesNotMatch(html, /data-list-after-apply/);
  assert.doesNotMatch(html, /data-list-after-apply-first/);
  assert.doesNotMatch(html, /data-list-after-apply-two/);
  assert.doesNotMatch(html, /data-list-after-apply-three/);
  assert.doesNotMatch(html, /data-list-after-apply-four/);
  assert.doesNotMatch(html, /data-list-after-apply-five/);
  assert.doesNotMatch(html, /data-list-after-apply-six/);
  assert.doesNotMatch(html, /data-list-after-apply-seven/);
  assert.doesNotMatch(html, /after Apply/);
  assert.doesNotMatch(html, /data-list-after-apply-eight/);
  assert.doesNotMatch(html, /data-apply-after-list-seven/);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-apply-after-list-first/);
  assert.doesNotMatch(html, /data-apply-after-list-two/);
  assert.doesNotMatch(html, /data-apply-after-list-three/);
  assert.doesNotMatch(html, /data-apply-after-list-four/);
  assert.doesNotMatch(html, /data-apply-after-list-five/);
  assert.doesNotMatch(html, /data-apply-after-list-six/);
  assert.match(html, /data-prize-title=""/);
  assert.equal((html.match(/data-prize-title=""/g) ?? []).length, 1);
  assert.match(html, /data-later-fact=""/);
  assert.equal((html.match(/data-later-fact=""/g) ?? []).length, 1);
  assert.match(html, /data-later-quiet=""/);
  assert.equal((html.match(/data-later-quiet=""/g) ?? []).length, 1);
  assert.match(html, /data-prize-pack=""/);
  assert.equal((html.match(/data-prize-pack=""/g) ?? []).length, 1);
  assert.match(html, /data-later-pack=""/);
  assert.equal((html.match(/data-later-pack=""/g) ?? []).length, 1);
  assert.match(html, /data-later-role=""/);
  assert.equal((html.match(/data-later-role=""/g) ?? []).length, 1);
  assert.match(html, /class="later-apply"/);
  assert.equal((html.match(/class="later-apply"/g) ?? []).length, 1);
  assert.doesNotMatch(html.slice(html.indexOf('data-listing-id="lst_old_later"')), /data-prize-title/);
  assert.doesNotMatch(html.slice(html.indexOf('data-listing-id="lst_old_later"')), /data-later-fact/);
  assert.doesNotMatch(html.slice(html.indexOf('data-listing-id="lst_old_later"')), /class="title"|class="card job-sheet"|class="apply"/);
  assert.doesNotMatch(html.slice(0, html.indexOf('data-listing-id="lst_old_later"')), /data-later-quiet|class="later-apply"/);
  assert.ok(html.indexOf("data-prize-pack") < html.indexOf("data-later-pack"));
  assert.doesNotMatch(html, /data-unpaid-off|data-paid-only-wall/);
});

test("closed-week unpaid rows stay off the wall — no invented occupancy", () => {
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: WEEK_33,
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings([
        fixtureListing({
          id: "lst_old_unpaid",
          company: "Ghost",
          title: "Unpaid Staff Engineer",
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
  assert.match(html, /Bids are closed in closed week history/);
  assert.doesNotMatch(html, /Bids are closed\./);
  assert.match(
    html,
    /Open the live Backend wall for the rolling last 7 days from paid placement/,
  );
  assert.doesNotMatch(html, /Open this week/);
  assert.match(html, /wall-rail/);
  assert.doesNotMatch(html, /data-listing-card/);
  assert.doesNotMatch(html, /data-prize-title/);
  assert.doesNotMatch(html, /Ghost|Unpaid Staff Engineer/);
  assert.doesNotMatch(html, />Apply</);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-bid-form/);
  assert.doesNotMatch(html, /data-unpaid-off|data-paid-only-wall/);
});
