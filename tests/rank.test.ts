import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { Board } from "../src/components/board/board";
import { Leaderboard } from "../src/components/board/leaderboard";
import { ListingCard } from "../src/components/board/listing-card";
import { getBoardListings, parseLane } from "../src/lib/board";
import { rankListings } from "../src/lib/rank";
import { FUNCTION_LANES } from "../src/lib/types";
import { fixtureListing, specTieRows } from "./fixtures/listings";

const cssSource = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const WEEK_34 = "2026-W34";
const WEEK_33 = "2026-W33";
const RESET = "2026-08-24T00:00:00.000Z";

function renderBoard(
  listings: Parameters<typeof rankListings>[0] = specTieRows,
  options: { periodId?: string; live?: boolean } = {},
): string {
  return renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: options.periodId ?? WEEK_34,
      nextResetAt: RESET,
      listings: rankListings(listings),
      live: options.live ?? true,
    }),
  );
}

function formMarkup(markup: string): string {
  const start = markup.indexOf("<form");
  const end = markup.indexOf("</form>", start);
  assert.ok(start >= 0 && end > start, "board must render a form");
  return markup.slice(start, end);
}

function count(markup: string, pattern: RegExp): number {
  return markup.match(pattern)?.length ?? 0;
}

test("empty input stays empty", () => {
  assert.deepEqual(rankListings([]), []);
});

test("unpaid stays off the hiring wall — No #1 until Waffo reports paid", () => {
  const unpaid = fixtureListing({
    id: "lst_unpaid",
    company: "Ghost",
    title: "Unpaid Staff Engineer",
    bidUsd: 50_000,
    paidUsd: 0,
    clicks: 99,
    createdAt: "2026-08-17T08:00:00.000Z",
  });
  const abandoned = fixtureListing({
    id: "lst_abandoned",
    company: "Vapor",
    title: "Abandoned Growth Lead",
    bidUsd: 9_000,
    paidUsd: 0,
    clicks: 12,
    createdAt: "2026-08-17T08:30:00.000Z",
  });
  const paid = fixtureListing({
    id: "lst_paid_only",
    company: "Acme",
    title: "Staff Backend Engineer",
    bidUsd: 5,
    paidUsd: 5,
    clicks: 1,
    createdAt: "2026-08-17T11:00:00.000Z",
  });

  assert.deepEqual(rankListings([unpaid, abandoned]), []);
  assert.deepEqual(rankListings([unpaid, abandoned, paid]).map((row) => row.id), [
    "lst_paid_only",
  ]);

  const empty = renderBoard([unpaid, abandoned]);
  assert.match(empty, /data-empty-lane="true"/);
  assert.match(empty, /Nobody is invented here/);
  assert.doesNotMatch(empty, /Ghost|Vapor|Unpaid Staff Engineer|Abandoned Growth Lead/);
  assert.doesNotMatch(empty, /data-listing-card|>Apply<|\$50,000|\$9,000/);
});

test("rank is the bid, and older paid rows win equal bids", () => {
  const ranked = rankListings(specTieRows);
  assert.deepEqual(
    ranked.map((row) => [row.rank, row.company, row.bidUsd]),
    [
      [1, "Acme", 21],
      [2, "Gamma", 21],
      [3, "Beta", 20],
    ],
  );

  const low = fixtureListing({
    id: "lst_low",
    company: "Low",
    bidUsd: 12,
    clicks: 900,
    createdAt: "2026-08-18T09:00:00.000Z",
  });
  const high = fixtureListing({
    id: "lst_high",
    company: "High",
    bidUsd: 20,
    clicks: 0,
    createdAt: "2026-08-19T09:00:00.000Z",
  });
  assert.deepEqual(rankListings([low, high]).map((row) => row.id), [
    "lst_high",
    "lst_low",
  ]);
  assert.deepEqual(
    rankListings([
      fixtureListing({
        id: "lst_top",
        company: "Top",
        bidUsd: 12,
        createdAt: "2026-08-17T10:00:00.000Z",
      }),
      fixtureListing({
        id: "lst_below",
        company: "Below",
        bidUsd: 7,
        createdAt: "2026-08-17T11:00:00.000Z",
      }),
    ]).map((row) => row.bidUsd),
    [12, 7],
  );
});

test("rankListings does not mutate its input", () => {
  const rows = specTieRows.slice();
  const before = rows.map((row) => row.id);
  rankListings(rows);
  assert.deepEqual(rows.map((row) => row.id), before);
});

test("live board loader invents no jobs and unknown lanes fall back", () => {
  assert.deepEqual(getBoardListings("backend", WEEK_34), []);
  assert.deepEqual(getBoardListings("design", WEEK_34), []);
  assert.equal(parseLane(undefined), "backend");
  assert.equal(parseLane("not-a-lane"), "backend");
  assert.equal(parseLane(["growth", "design"]), "growth");
  for (const lane of FUNCTION_LANES) assert.equal(parseLane(lane), lane);
});

test("empty lane markup is honest", () => {
  const html = renderToStaticMarkup(
    createElement(Leaderboard, { lane: "design", listings: [] }),
  );
  assert.match(html, /data-empty-lane="true"/);
  assert.match(html, /No listings this period/);
  assert.match(html, /Pay \$5 to list/);
  assert.doesNotMatch(html, /data-listing-card|Acme|Beta|Gamma|competitive salary/i);
});

test("empty lane form is a direct identity-and-function path before one Claim rank submit", () => {
  const html = renderBoard([]);
  const form = formMarkup(html);
  const claim = html.indexOf("Claim #1 for");
  const amount = html.indexOf('name="amount"');
  const minus = html.indexOf("Decrease bid by one dollar");
  const plus = html.indexOf("Increase bid by one dollar");
  const honest = html.indexOf("Nobody is invented here");
  const title = html.indexOf('name="title"');
  const company = html.indexOf('name="company"');
  const salary = html.indexOf('name="salaryMinUsd"');
  const identity = html.indexOf('name="identity"');
  const lane = html.indexOf('name="lane"');
  const submit = html.indexOf(">Claim rank<");

  assert.ok(claim >= 0 && amount > claim && minus > claim && plus > amount);
  assert.ok(honest > plus && title > honest && company > title && salary > company);
  assert.ok(identity > salary && lane > identity && submit > lane);
  assert.equal(count(form, /name="identity"/g), 1);
  assert.equal(count(form, /name="title"/g), 1);
  assert.equal(count(form, /name="company"/g), 1);
  assert.equal(count(form, /name="salary(?:Min|Max)Usd"/g), 2);
  assert.equal(count(form, /name="lane"/g), 1);
  assert.equal(count(form, /type="submit"/g), 1);
  assert.equal(count(form, />Claim rank</g), 1);
  assert.match(form, /aria-label="Claim rank"/);
  assert.match(form, /name="identity"[^>]*required|required[^>]*name="identity"/);
  assert.match(form, /name="title"[^>]*required|required[^>]*name="title"/);
  assert.match(form, /name="company"[^>]*required|required[^>]*name="company"/);
  assert.match(form, /<select[^>]*name="lane"/);
  assert.match(html, /data-lane-empty="true"/);
  assert.match(html, /data-empty-bay-list=""/);
  assert.match(html, /data-empty-honest=""/);
  assert.match(html, /data-empty-claim=""/);
  assert.match(html, /data-empty-identity=""/);
  assert.match(html, /\$5 takes #1/);
  assert.match(html, /The last 7 days from paid placement are empty/);
  assert.doesNotMatch(
    html,
    /data-first-click="claim"|data-empty-identity-first|autoFocus|autofocus|Pick the function after Claim #1/,
  );
  assert.doesNotMatch(
    html,
    /claim\s*#1\s*,?\s*then\s+(?:pick|choose)\s+the\s+function/i,
  );
});

test("empty live homepage keeps claim, function rail, and empty bay in order", () => {
  const html = renderBoard([]);
  const rail = html.indexOf('data-slot="lane-rail"');
  const mast = html.indexOf('class="wall-mast"');
  const claim = html.indexOf('id="claim"');
  const emptyBay = html.indexOf('data-empty-lane="true"');

  assert.ok(rail >= 0 && mast > rail && claim > mast && emptyBay > claim);
  assert.match(html, /data-empty-honest=""/);
  assert.match(html, /class="lane-tabs"/);
  assert.match(html, /class="empty-lane empty-lane-quiet"/);
  assert.match(html, /No paid Backend roles in the rolling last 7 days/);
  assert.match(html, /class="wall-rail"/);
  assert.match(html, /Hiring wall/);
});

test("live and history period tabs are real synchronized views", () => {
  const live = renderBoard();
  assert.match(live, /href="\/\?lane=backend"[^>]*role="tab"[^>]*aria-selected="true"/);
  assert.match(
    live,
    /href="\/\?lane=backend&amp;period=2026-W33"[^>]*role="tab"[^>]*aria-selected="false"[^>]*>History</,
  );
  assert.doesNotMatch(live, /period-choice[^>]*aria-disabled/);

  const history = renderBoard(
    specTieRows.map((row) => ({ ...row, periodId: WEEK_33 })),
    { periodId: WEEK_33, live: false },
  );
  assert.match(history, /data-period-live="false"/);
  assert.match(history, /href="\/\?lane=backend"[^>]*role="tab"[^>]*aria-selected="false"/);
  assert.match(
    history,
    /href="\/\?lane=backend&amp;period=2026-W32"[^>]*role="tab"[^>]*aria-selected="true"[^>]*>History</,
  );
  assert.doesNotMatch(history, /data-bid-form|>Claim rank</);
});

test("bid amount keeps a visible keyboard focus cue", () => {
  assert.match(
    cssSource,
    /\.amount-field input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--primary\);[^}]*outline-offset:\s*2px;/,
  );
});

test("Claim rank amount controls stay centered and inline without legacy copy", () => {
  const html = renderBoard([]);
  assert.match(html, /class="claim-submit" aria-label="Claim rank"/);
  assert.doesNotMatch(html, /Outbid/);
  assert.match(
    cssSource,
    /\.claim h2,\s*\.claim\[data-list-role\] h2,[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?justify-content:\s*center;[\s\S]*?white-space:\s*nowrap;/,
  );
  assert.match(cssSource, /\.amount-stepper\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*8px;/);
  assert.match(cssSource, /\.amount-field input\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*2ch;[^}]*max-width:\s*6ch;/);
});

test("function rail exposes all eight job lanes", () => {
  const html = renderBoard();
  assert.match(html, /data-lane-count="8"/);
  assert.equal(count(html, /class="wall-plate"/g), FUNCTION_LANES.length);
  for (const lane of FUNCTION_LANES) {
    assert.match(html, new RegExp(`data-lane="${lane}"`));
  }
  assert.doesNotMatch(html, />More</);
  assert.match(
    cssSource,
    /\.hiring-wall\s*\{[^}]*grid-template-columns:\s*minmax\(15rem,\s*17rem\)\s+minmax\(0,\s*1fr\)/,
  );
  assert.match(cssSource, /\.lane-tabs-primary\s*\{[^}]*display:\s*grid/);
});

test("occupied form keeps List a role, job fields, one identity, and one Claim rank after the paid board", () => {
  const html = renderBoard();
  const form = formMarkup(html);
  const identity = form.indexOf('name="identity"');
  const submit = form.indexOf(">Claim rank<");
  assert.ok(identity >= 0 && submit > identity);
  assert.equal(count(form, /name="identity"/g), 1);
  assert.equal(count(form, /name="title"/g), 1);
  assert.equal(count(form, /name="company"/g), 1);
  assert.equal(count(form, /type="submit"/g), 1);
  assert.equal(count(form, />Claim rank</g), 1);
  assert.match(form, /aria-label="Claim rank"/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /List a role/);
  assert.match(html, /Already on this lane/);
  assert.match(
    html,
    /Returning employers pay only the difference when they raise the same listing\./,
  );
  assert.match(html, /Paying less than #1/);
  assert.match(html, /data-one-identity=""/);
  assert.doesNotMatch(html, /data-lane-empty="true"|data-empty-bay-list|data-empty-identity/);
  assert.doesNotMatch(html, /data-first-click="claim"|data-empty-identity-first|autoFocus/);
});

test("occupied hiring wall keeps one #1 Apply, paid facts, and quieter later cards", () => {
  const ranked = rankListings(specTieRows);
  const html = renderBoard(ranked);
  const first = renderToStaticMarkup(createElement(ListingCard, { listing: ranked[0]! }));
  const later = renderToStaticMarkup(createElement(ListingCard, { listing: ranked[1]! }));

  assert.equal(count(html, /data-listing-card=""/g), 3);
  assert.equal(count(html, /data-prize-title=""/g), 1);
  assert.equal(count(html, /data-first-click="apply"/g), 1);
  assert.equal(count(html, /data-list-action="role"/g), 1);
  assert.equal(count(html, /class="later-apply"/g), 2);
  assert.match(html, /data-prize-title=""[^>]*>[\s\S]*Staff Backend Engineer/);
  assert.match(html, /\$21/);
  assert.match(html, /9 clicks/);
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, /class="wall-plate"/);
  assert.ok(html.indexOf("data-prize-title") < html.indexOf('data-first-click="apply"'));
  assert.ok(html.indexOf('data-first-click="apply"') < html.indexOf("data-list-action"));
  assert.match(first, /class="card job-sheet"/);
  assert.match(first, /data-card-kind="lead"/);
  assert.match(first, /data-apply-state="first"/);
  assert.match(first, /data-apply-live=""/);
  assert.match(first, />Apply</);
  assert.match(later, /class="card later-sheet"/);
  assert.match(later, /data-card-kind="ledger"/);
  assert.match(later, /data-later-quiet=""/);
  assert.match(later, /data-later-role=""/);
  assert.match(later, /data-apply-later-outlined=""/);
  assert.doesNotMatch(later, /data-prize-title|class="apply"/);
  assert.doesNotMatch(html, /card-surface-link/);
});

test("hiring wall keeps its composition and avoids invented social proof", () => {
  const html = renderBoard();
  assert.match(html, /class="board hiring-wall"/);
  assert.match(html, /data-hiring-wall=""/);
  assert.match(html, /Function lanes/);
  assert.match(html, /Remote \(global\)/);
  assert.match(html, /Apply/);
  assert.match(html, /Hiring wall/);
  assert.match(html, /More placements/);
  assert.doesNotMatch(html, /map|leaflet|google\.maps|OpenStreetMap|★|star rating|review count/i);
  assert.doesNotMatch(html, /data-reference-fixture|outbid\.lol|picks\.daily|Test this today|morning edition|venue/i);
  assert.doesNotMatch(html, /data-list-after-apply-(?:first|two|three|four|five|six|seven|eight)|data-apply-after-list-(?:first|two|three|four|five|six|seven)/);
});

test("lower fold derives ranking and activity facts after the complete job ledger", () => {
  const rows = [
    ...specTieRows,
    fixtureListing({
      id: "lst_delta",
      title: "Senior Data Engineer",
      company: "Delta",
      bidUsd: 19,
      clicks: 3,
      createdAt: "2026-08-18T09:00:00.000Z",
      updatedAt: "2026-08-19T10:30:00.000Z",
    }),
    fixtureListing({
      id: "lst_epsilon",
      title: "Platform Reliability Engineer",
      company: "Epsilon",
      bidUsd: 18,
      clicks: 0,
      createdAt: "2026-08-18T11:00:00.000Z",
      updatedAt: "2026-08-18T11:00:00.000Z",
    }),
  ];
  const html = renderBoard(rows);
  const ledger = html.indexOf('data-placement-ledger=""');
  const lower = html.indexOf('data-lower-fold=""');
  const rankFour = html.indexOf('data-rank="4"');

  assert.ok(ledger >= 0 && rankFour > ledger && lower > rankFour);
  assert.match(html, /Current ranking/);
  assert.match(html, /data-ranking-item=""[^>]*data-listing-id="lst_acme"/);
  assert.match(html, /Staff Backend Engineer/);
  assert.match(html, /data-bid="">\$21</);
  assert.match(html, /data-activity-id="lst_delta"/);
  assert.match(html, /Updated 2026-08-19 10:30 UTC · 3 clicks/);
  assert.match(html, /data-activity-id="lst_epsilon"/);
  assert.match(html, /Listed 2026-08-18 11:00 UTC · 0 clicks/);
  assert.doesNotMatch(html, /avatar|profile photo|review count|synthetic event/i);
  assert.match(cssSource, /\.placement-ledger\s*\{[^}]*margin-top:\s*26px/);
  assert.match(cssSource, /\.lower-fold\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
});

test("salary and Apply facts remain truthful in job cards", () => {
  const listing = fixtureListing({
    id: "lst_salary",
    company: "Salary Co",
    title: "Senior Backend Engineer",
    bidUsd: 18,
    salary: { minUsd: 120_000, maxUsd: 160_000 },
    clicks: 7,
    createdAt: "2026-08-17T09:00:00.000Z",
  });
  const rankedListing = rankListings([listing])[0]!;
  const html = renderToStaticMarkup(createElement(ListingCard, { listing: rankedListing }));
  assert.match(html, /Remote \(global\)/);
  assert.match(html, /\$120,000–\$160,000/);
  assert.match(html, /data-apply-url="https:\/\/jobs\.example\.com\/salary-co"/);
  assert.match(html, /href="\/out\/lst_salary"/);
  assert.match(html, /7 clicks/);

  const nullSalary = renderToStaticMarkup(
    createElement(ListingCard, { listing: { ...rankedListing, salary: null } }),
  );
  assert.doesNotMatch(nullSalary, /120,000|160,000/);
});

test("closed empty and occupied boards isolate live actions while preserving history", () => {
  const empty = renderBoard([], { periodId: WEEK_33, live: false });
  const occupied = renderBoard(
    specTieRows.map((row) => ({ ...row, periodId: WEEK_33 })),
    { periodId: WEEK_33, live: false },
  );

  assert.match(empty, /data-period-live="false"/);
  assert.match(empty, /data-empty-closed="true"/);
  assert.match(empty, /Closed week history/);
  assert.match(empty, /Bids are closed in closed week history/);
  assert.match(empty, /Open the live Backend wall for the rolling last 7 days/);
  assert.doesNotMatch(empty, /data-bid-form|>Claim rank<|data-empty-bay-list|data-first-click/);

  assert.match(occupied, /Closed week history 2026-W33 — read only/);
  assert.match(occupied, /data-listing-card/);
  assert.match(occupied, /job-sheet/);
  assert.match(occupied, /later-sheet/);
  assert.match(occupied, />Apply</);
  assert.doesNotMatch(occupied, /data-bid-form|>Claim rank<|data-list-role|data-first-click="apply"/);
  assert.match(occupied, /data-lane="backend"[^>]*>Backend week history</);
});

test("contract docs keep audit detail while public metadata stays product-facing", () => {
  const artifacts = ["README.md", "SPEC.md", "BUILD.md"];
  for (const artifact of artifacts) {
    const source = readFileSync(join(process.cwd(), artifact), "utf8");
    assert.match(source, /rolling last 7 days from paid placement/i, artifact);
    assert.match(source, /ISO weekId is audit-only/i, artifact);
    assert.match(source, /Monday 00:00 UTC does not drop live rank/i, artifact);
  }
  const publicLayout = readFileSync(
    join(process.cwd(), "src/app/layout.tsx"),
    "utf8",
  );
  assert.match(publicLayout, /rolling seven-day placement window/i);
  assert.doesNotMatch(publicLayout, /weekId|Monday 00:00 UTC|Waffo|outbid\.lol/i);
});
