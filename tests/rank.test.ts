import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Board } from "../src/components/board/board";
import { Leaderboard } from "../src/components/board/leaderboard";
import { ListingCard } from "../src/components/board/listing-card";
import { getBoardListings, parseLane } from "../src/lib/board";
import { liveRankResetAt } from "../src/lib/period";
import { rankListings } from "../src/lib/rank";
import { FUNCTION_LANES } from "../src/lib/types";
import { fixtureListing, specTieRows } from "./fixtures/listings";

const cssSource = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const formSource = readFileSync(
  join(process.cwd(), "src/components/board/bid-form.tsx"),
  "utf8",
);

test("empty input stays empty", () => {
  assert.deepEqual(rankListings([]), []);
});

test("unpaid stays off the hiring wall — No #1 until Polar reports paid", () => {
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
  const ranked = rankListings([unpaid, abandoned, paid]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.id, "lst_paid_only");
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.paidUsd, 5);
  assert.doesNotMatch(
    ranked.map((row) => row.id).join(","),
    /lst_unpaid|lst_abandoned/,
  );

  const unpaidHtml = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings([unpaid, abandoned]),
    }),
  );
  const mixedHtml = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings([unpaid, abandoned, paid]),
    }),
  );
  const leakedHtml = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [
        { ...unpaid, rank: 1 },
        { ...paid, rank: 2 },
      ],
    }),
  );
  const occupied = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings(specTieRows),
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: rankListings(specTieRows)[1]! }),
  );
  const unpaidCard = renderToStaticMarkup(
    createElement(ListingCard, {
      listing: { ...unpaid, rank: 1 },
    }),
  );
  const closedUnpaid = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W33",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings([unpaid]),
      live: false,
    }),
  );

  assert.equal(unpaidCard, "");
  assert.match(unpaidHtml, /data-empty-lane="true"/);
  assert.match(unpaidHtml, /data-first-click="claim"/);
  assert.match(unpaidHtml, /Claim #1 for/);
  assert.match(unpaidHtml, /Claim #1, then pick the function/);
  assert.match(unpaidHtml, /<select[^>]*name="lane"/);
  assert.doesNotMatch(unpaidHtml, /data-listing-card/);
  assert.doesNotMatch(unpaidHtml, /data-prize-title/);
  assert.doesNotMatch(unpaidHtml, /data-prize-pack/);
  assert.doesNotMatch(unpaidHtml, /data-later-pack/);
  assert.doesNotMatch(unpaidHtml, /data-take-apply/);
  assert.doesNotMatch(unpaidHtml, /data-first-click="apply"/);
  assert.doesNotMatch(unpaidHtml, />Apply</);
  assert.doesNotMatch(unpaidHtml, /href="\/out\//);
  assert.doesNotMatch(unpaidHtml, /Ghost|Vapor|Unpaid Staff Engineer|Abandoned Growth Lead/);
  assert.doesNotMatch(unpaidHtml, /\$50,000|\$9,000/);
  assert.doesNotMatch(unpaidHtml, /data-list-after-apply-eight|data-list-after-apply-N/);
  assert.doesNotMatch(unpaidHtml, /wall-rail|wall-plate/);

  assert.match(mixedHtml, /data-prize-title=""/);
  assert.match(mixedHtml, /Staff Backend Engineer/);
  assert.match(mixedHtml, /data-listing-id="lst_paid_only"/);
  assert.match(mixedHtml, /data-first-click="apply"/);
  assert.match(mixedHtml, /href="\/out\/lst_paid_only"/);
  assert.match(mixedHtml, />Apply</);
  assert.match(mixedHtml, /data-list-role="employer"/);
  assert.doesNotMatch(mixedHtml, /class="wall-rail"/);
  assert.ok(mixedHtml.indexOf('data-first-click="apply"') < mixedHtml.indexOf("wall-plate"));
  assert.equal((mixedHtml.match(/data-listing-card/g) ?? []).length, 1);
  assert.equal((mixedHtml.match(/data-prize-title=""/g) ?? []).length, 1);
  assert.doesNotMatch(mixedHtml, /lst_unpaid|lst_abandoned|Ghost|Vapor/);
  assert.doesNotMatch(mixedHtml, /data-empty-lane/);
  assert.doesNotMatch(mixedHtml, /data-first-click="claim"/);
  assert.doesNotMatch(mixedHtml, /<select[^>]*name="lane"/);

  assert.match(leakedHtml, /data-prize-title=""/);
  assert.match(leakedHtml, /Staff Backend Engineer/);
  assert.match(leakedHtml, /data-listing-id="lst_paid_only"/);
  assert.match(leakedHtml, /data-rank="1"/);
  assert.match(leakedHtml, /data-first-click="apply"/);
  assert.match(leakedHtml, /href="\/out\/lst_paid_only"/);
  assert.equal((leakedHtml.match(/data-listing-card/g) ?? []).length, 1);
  assert.doesNotMatch(leakedHtml, /lst_unpaid|Ghost|Unpaid Staff Engineer/);
  assert.doesNotMatch(leakedHtml, /data-empty-lane/);
  assert.doesNotMatch(leakedHtml, /data-first-click="claim"/);
  assert.doesNotMatch(leakedHtml, /data-rank="2"/);

  assert.match(occupied, /data-prize-title=""/);
  assert.match(occupied, /data-first-click="apply"/);
  assert.match(occupied, /Staff Backend Engineer/);
  assert.doesNotMatch(occupied, /class="wall-rail"/);
  assert.ok(occupied.indexOf('data-first-click="apply"') < occupied.indexOf("wall-plate"));
  assert.match(laterCard, /data-apply-later-outlined=""/);
  assert.match(laterCard, /class="later-apply"/);
  assert.doesNotMatch(laterCard, /data-prize-title/);
  assert.doesNotMatch(laterCard, /class="apply"/);

  assert.match(closedUnpaid, /data-empty-closed="true"/);
  assert.match(closedUnpaid, /Bids are closed/);
  assert.doesNotMatch(closedUnpaid, /data-listing-card/);
  assert.doesNotMatch(closedUnpaid, /Ghost|Unpaid Staff Engineer/);
  assert.doesNotMatch(closedUnpaid, />Apply</);
  assert.doesNotMatch(closedUnpaid, /data-first-click="apply"/);
});

test("higher bid wins regardless of clicks or recency", () => {
  const low = fixtureListing({
    id: "lst_low",
    company: "Acme",
    bidUsd: 12,
    clicks: 900,
    createdAt: "2026-08-17T09:00:00.000Z",
  });
  const high = fixtureListing({
    id: "lst_high",
    company: "Beta",
    bidUsd: 20,
    clicks: 0,
    createdAt: "2026-08-18T09:00:00.000Z",
  });
  const ranked = rankListings([low, high]);
  assert.equal(ranked[0]?.id, "lst_high");
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[1]?.id, "lst_low");
  assert.equal(ranked[1]?.rank, 2);
});

test("equal bids: older listing keeps the higher rank", () => {
  const ranked = rankListings(specTieRows);
  assert.deepEqual(
    ranked.map((row) => [row.rank, row.company, row.bidUsd]),
    [
      [1, "Acme", 21],
      [2, "Gamma", 21],
      [3, "Beta", 20],
    ],
  );
});

test("a bid below #1 still lists at the rank it can take", () => {
  const ranked = rankListings([
    fixtureListing({
      id: "lst_top",
      company: "Beta",
      bidUsd: 12,
      createdAt: "2026-08-17T10:00:00.000Z",
    }),
    fixtureListing({
      id: "lst_low",
      company: "Acme",
      bidUsd: 7,
      createdAt: "2026-08-17T11:00:00.000Z",
    }),
  ]);
  assert.equal(ranked[0]?.bidUsd, 12);
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[1]?.bidUsd, 7);
  assert.equal(ranked[1]?.rank, 2);
});

test("rankListings does not mutate the input", () => {
  const rows = specTieRows.slice();
  const before = rows.map((row) => row.id);
  rankListings(rows);
  assert.deepEqual(
    rows.map((row) => row.id),
    before,
  );
});

test("live board loader invents no jobs", () => {
  assert.deepEqual(getBoardListings("backend", "2026-W34"), []);
  assert.deepEqual(getBoardListings("design", "2026-W34"), []);
});

test("unknown lane query falls back to backend", () => {
  assert.equal(parseLane(undefined), "backend");
  assert.equal(parseLane("not-a-lane"), "backend");
  assert.equal(parseLane(["growth", "design"]), "growth");
  for (const lane of FUNCTION_LANES) {
    assert.equal(parseLane(lane), lane);
  }
});

test("empty lane markup is honest", () => {
  const html = renderToStaticMarkup(
    createElement(Leaderboard, { lane: "design", listings: [] }),
  );
  assert.match(html, /data-empty-lane="true"/);
  assert.match(html, /No listings this period/);
  assert.match(html, /Pay \$5 to list/);
  assert.doesNotMatch(html, /data-listing-card/);
  assert.doesNotMatch(html, /Acme|Beta|Gamma|competitive salary/i);
});

test("empty and closed-empty weeks stay honest — Claim #1, no invented role", () => {
  const liveEmpty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const closedEmpty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W33",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
      live: false,
    }),
  );
  const occupied = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings(specTieRows),
    }),
  );
  const claim = liveEmpty.indexOf('id="claim"');
  const honest = liveEmpty.indexOf("data-empty-honest");
  const emptyClaim = liveEmpty.indexOf("data-empty-claim");
  const claimTitle = liveEmpty.indexOf("Claim #1 for");
  const identity = liveEmpty.indexOf('name="identity"');
  const outbid = liveEmpty.indexOf(">Outbid<");
  const closedHonest = closedEmpty.indexOf("data-empty-honest");
  const closedMark = closedEmpty.indexOf("data-empty-closed");
  const closedCopy = closedEmpty.indexOf("This lane was empty");
  assert.ok(claim >= 0 && honest > claim && emptyClaim > honest);
  assert.ok(claimTitle > emptyClaim && outbid > claimTitle && identity > outbid);
  assert.ok(closedHonest >= 0 && closedMark >= 0 && closedCopy > closedHonest);
  assert.match(liveEmpty, /data-empty-honest=""/);
  assert.match(liveEmpty, /data-empty-claim=""/);
  assert.match(liveEmpty, /Claim #1 for/);
  assert.match(liveEmpty, /\$5 takes #1/);
  assert.match(liveEmpty, /data-empty-lane="true"/);
  assert.match(liveEmpty, /name="identity"/);
  assert.equal((liveEmpty.match(/name="identity"/g) ?? []).length, 1);
  assert.equal((liveEmpty.match(/data-empty-honest=""/g) ?? []).length, 2);
  assert.doesNotMatch(liveEmpty, /data-prize-title/);
  assert.doesNotMatch(liveEmpty, /data-later-fact/);
  assert.doesNotMatch(liveEmpty, /data-later-quiet/);
  assert.doesNotMatch(liveEmpty, /data-later-pack/);
  assert.doesNotMatch(liveEmpty, /data-prize-pack/);
  assert.doesNotMatch(liveEmpty, /data-later-role/);
  assert.doesNotMatch(liveEmpty, /data-listing-card/);
  assert.doesNotMatch(liveEmpty, /data-take-apply/);
  assert.doesNotMatch(liveEmpty, /data-later-apply/);
  assert.doesNotMatch(liveEmpty, /data-apply-live/);
  assert.doesNotMatch(liveEmpty, /data-apply-later/);
  assert.doesNotMatch(liveEmpty, /data-apply-later-outlined/);
  assert.doesNotMatch(liveEmpty, /href="\/out\//);
  assert.doesNotMatch(liveEmpty, />Apply</);
  assert.doesNotMatch(liveEmpty, /data-list-role/);
  assert.match(closedEmpty, /data-empty-honest=""/);
  assert.match(closedEmpty, /data-empty-closed="true"/);
  assert.match(closedEmpty, /Bids are closed/);
  assert.match(closedEmpty, /This lane was empty/);
  assert.match(closedEmpty, /data-live-week=""/);
  assert.doesNotMatch(closedEmpty, /data-empty-claim/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
  assert.doesNotMatch(closedEmpty, /data-prize-title/);
  assert.doesNotMatch(closedEmpty, /data-later-fact/);
  assert.doesNotMatch(closedEmpty, /data-later-quiet/);
  assert.doesNotMatch(closedEmpty, /data-later-pack/);
  assert.doesNotMatch(closedEmpty, /data-prize-pack/);
  assert.doesNotMatch(closedEmpty, /data-later-role/);
  assert.doesNotMatch(closedEmpty, /data-listing-card/);
  assert.doesNotMatch(closedEmpty, /data-take-apply/);
  assert.doesNotMatch(closedEmpty, /data-later-apply/);
  assert.doesNotMatch(closedEmpty, /data-apply-live/);
  assert.doesNotMatch(closedEmpty, /data-apply-later/);
  assert.doesNotMatch(closedEmpty, /data-apply-later-outlined/);
  assert.doesNotMatch(closedEmpty, /href="\/out\//);
  assert.doesNotMatch(closedEmpty, />Apply</);
  assert.doesNotMatch(closedEmpty, /data-bid-form/);
  assert.doesNotMatch(closedEmpty, />Outbid</);
  assert.doesNotMatch(occupied, /data-empty-honest/);
  assert.doesNotMatch(occupied, /data-empty-claim/);
  assert.match(occupied, /data-prize-title=""/);
  assert.match(occupied, /data-later-fact=""/);
  assert.match(occupied, /data-later-quiet=""/);
  assert.match(occupied, /data-prize-pack=""/);
  assert.match(occupied, /data-later-pack=""/);
  assert.match(occupied, /data-later-role=""/);
  assert.match(occupied, /href="\/out\/lst_acme"/);
  assert.match(occupied, />Apply</);
});

test("live empty bay yields the claim box as the only action", () => {
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  assert.match(html, /data-empty-lane="true"/);
  assert.match(html, /data-empty-quiet="true"/);
  assert.match(html, /data-empty-honest=""/);
  assert.match(html, /data-empty-claim=""/);
  assert.match(html, /data-lane-empty="true"/);
  assert.match(html, /data-empty-bay-list=""/);
  assert.match(html, /\$5 takes #1/);
  assert.match(html, />Outbid</);
  assert.match(html, /Nobody is invented here/);
  assert.doesNotMatch(html, /data-prize-title/);
  assert.doesNotMatch(html, /data-later-fact/);
  assert.doesNotMatch(html, /data-later-quiet/);
  assert.doesNotMatch(html, /data-later-pack/);
  assert.doesNotMatch(html, /data-prize-pack/);
  assert.doesNotMatch(html, /data-later-role/);
  assert.doesNotMatch(html, /href="\/out\//);
  assert.doesNotMatch(html, />Apply</);
  assert.doesNotMatch(html, /Pay \$5 to list/);
  assert.doesNotMatch(html, /Empty bay/);
  assert.doesNotMatch(html, /Already on this lane/);
  assert.doesNotMatch(html, /Paying less than #1/);
  assert.doesNotMatch(html, /data-list-role/);
  assert.doesNotMatch(html, /List a role/);
  assert.doesNotMatch(html, /data-list-after-apply/);
  assert.doesNotMatch(html, /data-list-after-apply-first/);
  assert.doesNotMatch(html, /data-list-after-apply-two/);
  assert.doesNotMatch(html, /data-list-after-apply-three/);
  assert.doesNotMatch(html, /data-list-after-apply-four/);
  assert.doesNotMatch(html, /data-list-after-apply-five/);
  assert.doesNotMatch(html, /data-list-after-apply-six/);
  assert.doesNotMatch(html, /data-list-after-apply-seven/);
  assert.doesNotMatch(html, /after Apply/);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-apply-after-list-first/);
  assert.doesNotMatch(html, /data-apply-after-list-two/);
  assert.doesNotMatch(html, /data-apply-after-list-three/);
  assert.doesNotMatch(html, /data-apply-after-list-four/);
  assert.doesNotMatch(html, /data-apply-after-list-five/);
  assert.doesNotMatch(html, /data-apply-after-list-six/);
});

test("live empty bay stamps identity as the certain write", () => {
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const claim = html.indexOf('id="claim"');
  const stamp = html.indexOf("data-empty-bay-list");
  const claimTitle = html.indexOf("Claim #1 for");
  const amount = html.indexOf('name="amount"');
  const outbid = html.indexOf(">Outbid<");
  const identityMark = html.indexOf("data-empty-identity");
  const identityFirst = html.indexOf("data-empty-identity-first");
  const label = html.indexOf("identity-label");
  const identity = html.indexOf('name="identity"');
  const about = html.indexOf("Function lanes");
  assert.ok(claim >= 0 && stamp > claim);
  assert.ok(claimTitle > stamp && amount > claimTitle && outbid > amount);
  assert.ok(identityMark > outbid && identityFirst >= identityMark);
  assert.ok(label > identityMark && identity > label);
  assert.ok(about > identity);
  assert.match(html, /data-empty-bay-list=""/);
  assert.match(html, /data-empty-identity=""/);
  assert.match(html, /data-empty-identity-first=""/);
  assert.match(html, /htmlFor="identity"|for="identity"/);
  assert.match(html, /Apply URL or company handle/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, /\$5 takes #1/);
  assert.match(html, /name="identity"/);
  assert.match(html, />Outbid</);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Pay \$5 to list/);
  assert.doesNotMatch(html, /Empty bay/);
  assert.doesNotMatch(html, /data-apply-after-identity/);
  assert.doesNotMatch(html, /data-list-after-apply/);
  assert.doesNotMatch(html, /data-list-after-apply-first/);
  assert.doesNotMatch(html, /data-list-after-apply-two/);
  assert.doesNotMatch(html, /data-list-after-apply-three/);
  assert.doesNotMatch(html, /data-list-after-apply-four/);
  assert.doesNotMatch(html, /data-list-after-apply-five/);
  assert.doesNotMatch(html, /data-list-after-apply-six/);
  assert.doesNotMatch(html, /data-list-after-apply-seven/);
  assert.doesNotMatch(html, /after Apply/);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-apply-after-list-first/);
  assert.doesNotMatch(html, /data-apply-after-list-two/);
  assert.doesNotMatch(html, /data-apply-after-list-three/);
  assert.doesNotMatch(html, /data-apply-after-list-four/);
  assert.doesNotMatch(html, /data-apply-after-list-five/);
  assert.doesNotMatch(html, /data-apply-after-list-six/);
  assert.doesNotMatch(html, /star rating|chat|discord/i);
});

test("empty week Claim #1 stays the only first click — identity field does not steal focus", () => {
  const liveEmpty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const closedEmpty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W33",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
      live: false,
    }),
  );
  const occupied = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings(specTieRows),
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: rankListings(specTieRows)[1]! }),
  );
  const claim = liveEmpty.indexOf('id="claim"');
  const claimTitle = liveEmpty.indexOf("Claim #1 for");
  const amount = liveEmpty.indexOf('name="amount"');
  const amountFocus = liveEmpty.indexOf("autofocus");
  const outbid = liveEmpty.indexOf(">Outbid<");
  const firstClick = liveEmpty.indexOf('data-first-click="claim"');
  const identity = liveEmpty.indexOf('name="identity"');
  const identityTagStart = liveEmpty.lastIndexOf("<input", identity);
  const identityTag = liveEmpty.slice(
    identityTagStart,
    liveEmpty.indexOf(">", identity) + 1,
  );
  const occupiedPrize = occupied.indexOf("data-prize-title");
  const occupiedTitle = occupied.indexOf("Staff Backend Engineer");
  const occupiedBid = occupied.indexOf('data-bid=""');
  assert.ok(claim >= 0 && claimTitle > claim && amount > claimTitle);
  assert.ok(amountFocus > claimTitle && amountFocus < outbid);
  assert.ok(firstClick > amount && firstClick < outbid);
  assert.ok(outbid > amount && identity > outbid);
  assert.doesNotMatch(identityTag, /autofocus/i);
  assert.match(
    liveEmpty,
    /<input[^>]*(?:autofocus[^>]*name="amount"|name="amount"[^>]*autofocus)/i,
  );
  assert.match(liveEmpty, /data-first-click="claim"/);
  assert.match(liveEmpty, /Claim #1 for/);
  assert.match(liveEmpty, />Outbid</);
  assert.match(liveEmpty, /data-empty-identity-first=""/);
  assert.doesNotMatch(liveEmpty, /List a role/);
  assert.doesNotMatch(liveEmpty, /data-list-role/);
  assert.doesNotMatch(liveEmpty, /data-empty-claim-first/);
  assert.doesNotMatch(liveEmpty, /data-empty-claim-after|data-claim-after-empty/);
  assert.doesNotMatch(closedEmpty, /data-first-click="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
  assert.doesNotMatch(closedEmpty, /autofocus/i);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /name="amount"[^>]*autofocus/i);
  assert.match(occupied, /data-list-role="employer"/);
  assert.match(occupied, /List a role/);
  assert.match(occupied, /data-prize-title=""/);
  assert.ok(occupiedPrize >= 0 && occupiedTitle > occupiedPrize && occupiedBid > occupiedTitle);
  assert.match(laterCard, /data-apply-later-outlined=""/);
  assert.match(laterCard, /class="later-apply"/);
  assert.doesNotMatch(laterCard, /data-prize-title/);
  assert.doesNotMatch(laterCard, /class="apply"/);
  assert.match(formSource, /autoFocus=\{laneEmpty\}/);
  assert.doesNotMatch(formSource, /name="identity"[\s\S]*autoFocus/);
  const emptyOutbidRule =
    cssSource.match(
      /\.claim\[data-empty-bay-list\] \.outbid\[data-first-click="claim"\][\s\S]*?\}/,
    )?.[0] ?? "";
  assert.match(emptyOutbidRule, /display:\s*flex/);
  assert.match(emptyOutbidRule, /min-height:\s*3\.15rem/);
  assert.doesNotMatch(emptyOutbidRule, /background:/);
});

test("empty week Claim #1 is the first click — function pick comes after, not eight equal plates", () => {
  const liveEmpty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const occupied = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings(specTieRows),
    }),
  );
  const closedEmpty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W33",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
      live: false,
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: rankListings(specTieRows)[1]! }),
  );
  const claim = liveEmpty.indexOf('id="claim"');
  const claimTitle = liveEmpty.indexOf("Claim #1 for");
  const firstClick = liveEmpty.indexOf('data-first-click="claim"');
  const outbid = liveEmpty.indexOf(">Outbid<");
  const identity = liveEmpty.indexOf('name="identity"');
  const lanePick = liveEmpty.indexOf('name="lane"');
  const functionLanes = liveEmpty.indexOf("Function lanes");
  const wallPlate = liveEmpty.indexOf("wall-plate");
  const wallRail = liveEmpty.indexOf("wall-rail");
  const occupiedPrize = occupied.indexOf("data-prize-title");
  const occupiedApply = occupied.indexOf('data-first-click="apply"');
  const occupiedRail = occupied.indexOf('class="wall-rail"');
  const occupiedPlate = occupied.indexOf("wall-plate");
  const occupiedClaim = occupied.indexOf('id="claim"');
  assert.ok(claim >= 0 && claimTitle > claim && firstClick > claimTitle);
  assert.ok(outbid > firstClick && identity > outbid);
  assert.ok(lanePick > identity && functionLanes > identity);
  assert.equal(wallPlate, -1);
  assert.equal(wallRail, -1);
  assert.ok(cssSource.includes(".hiring-wall:not(:has(.wall-rail))"));
  assert.match(liveEmpty, /data-first-click="claim"/);
  assert.match(liveEmpty, /Claim #1, then pick the function/);
  assert.match(liveEmpty, /<select[^>]*name="lane"/);
  assert.match(liveEmpty, /<option[^>]*data-lane="backend"/);
  assert.match(liveEmpty, /<option[^>]*data-lane="founding"/);
  assert.equal((liveEmpty.match(/data-lane="/g) ?? []).length, 10);
  assert.equal((liveEmpty.match(/wall-plate/g) ?? []).length, 0);
  assert.doesNotMatch(liveEmpty, /data-empty-claim-first|data-empty-claim-after|data-claim-after-empty/);
  assert.doesNotMatch(liveEmpty, /data-first-click="apply"/);
  assert.doesNotMatch(liveEmpty, /List a role/);
  assert.doesNotMatch(liveEmpty, /data-list-role/);
  assert.doesNotMatch(liveEmpty, /data-listing-card/);
  assert.doesNotMatch(liveEmpty, /<h1 class="wall-lane-name">Backend<\/h1>/);
  assert.match(occupied, /data-prize-title=""/);
  assert.match(occupied, /data-first-click="apply"/);
  assert.match(occupied, /wall-plate/);
  assert.doesNotMatch(occupied, /class="wall-rail"/);
  assert.equal(occupiedRail, -1);
  assert.ok(occupiedPrize >= 0 && occupiedApply > occupiedPrize);
  assert.ok(occupiedPlate > occupiedApply);
  assert.ok(occupiedClaim > occupiedPlate);
  assert.match(occupied, /class="board hiring-wall"/);
  assert.doesNotMatch(occupied, /<select[^>]*name="lane"/);
  assert.match(laterCard, /data-later-quiet=""/);
  assert.match(laterCard, /data-apply-later-outlined=""/);
  assert.match(laterCard, /class="later-apply"/);
  assert.doesNotMatch(laterCard, /data-prize-title/);
  assert.doesNotMatch(laterCard, /class="apply"/);
  assert.match(closedEmpty, /wall-rail/);
  assert.match(closedEmpty, /wall-plate/);
  assert.doesNotMatch(closedEmpty, /data-first-click="claim"/);
  assert.doesNotMatch(closedEmpty, /<select[^>]*name="lane"/);
});

test("occupied wall keeps one first click — Apply #1, function plates stay after the listing", () => {
  const occupied = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings(specTieRows),
    }),
  );
  const liveEmpty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const closedEmpty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W33",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
      live: false,
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: rankListings(specTieRows)[1]! }),
  );
  const prize = occupied.indexOf("data-prize-title");
  const title = occupied.indexOf("Staff Backend Engineer");
  const apply = occupied.indexOf('data-first-click="apply"');
  const applyHref = occupied.indexOf('href="/out/lst_acme"');
  const applyLabel = occupied.indexOf(">Apply<");
  const plates = occupied.indexOf("wall-plate");
  const rail = occupied.indexOf('class="wall-rail"');
  const claim = occupied.indexOf('id="claim"');
  const listRole = occupied.indexOf('data-list-role="employer"');
  const emptyClaim = liveEmpty.indexOf("Claim #1 for");
  const emptyFirstClick = liveEmpty.indexOf('data-first-click="claim"');
  const emptyLane = liveEmpty.indexOf('name="lane"');
  assert.ok(prize >= 0 && title > prize && applyHref > title);
  assert.ok(apply > applyHref && applyLabel > apply);
  assert.ok(plates > applyLabel);
  assert.equal(rail, -1);
  assert.ok(claim > plates && listRole > claim);
  assert.ok(emptyClaim >= 0 && emptyFirstClick > emptyClaim && emptyLane > emptyFirstClick);
  assert.match(occupied, /data-prize-title=""/);
  assert.match(occupied, /data-first-click="apply"/);
  assert.match(occupied, /Staff Backend Engineer/);
  assert.match(occupied, /wall-plate/);
  assert.doesNotMatch(occupied, /class="wall-rail"/);
  assert.equal((occupied.match(/wall-plate/g) ?? []).length, 8);
  assert.equal((occupied.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /<select[^>]*name="lane"/);
  assert.doesNotMatch(occupied, /data-empty-lane-pick|data-lane-after-claim|data-empty-function-pick|hiring-wall-empty-first/);
  assert.doesNotMatch(occupied, /data-occupied-plates|data-plates-after-listing|data-apply-one-first|data-list-after-apply-eight/);
  assert.match(liveEmpty, /data-first-click="claim"/);
  assert.match(liveEmpty, /Claim #1, then pick the function/);
  assert.match(liveEmpty, /<select[^>]*name="lane"/);
  assert.doesNotMatch(liveEmpty, /wall-rail|wall-plate/);
  assert.doesNotMatch(liveEmpty, /data-first-click="apply"/);
  assert.match(closedEmpty, /wall-rail/);
  assert.match(closedEmpty, /wall-plate/);
  assert.doesNotMatch(closedEmpty, /data-first-click="apply"/);
  assert.doesNotMatch(closedEmpty, /data-first-click="claim"/);
  assert.match(laterCard, /class="later-apply"/);
  assert.match(laterCard, /data-apply-later-outlined=""/);
  assert.doesNotMatch(laterCard, /class="apply"/);
  assert.ok(cssSource.includes(".hiring-wall:not(:has(.wall-rail))"));
  assert.ok(cssSource.includes(".wall-bay > .lane-tabs"));
  assert.ok(cssSource.includes(".wall-bay > .wall-rail-kicker"));
});

test("occupied live wall keeps Outbid and does not hide raise rules", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  assert.match(html, /data-lane-empty="false"/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /List a role/);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, />Outbid</);
  assert.match(html, /Already on this lane/);
  assert.match(html, /Paying less than #1/);
  assert.match(html, /name="identity"/);
  assert.match(html, /data-one-identity=""/);
  assert.match(html, /identity-label/);
  assert.doesNotMatch(html, /data-empty-lane/);
  assert.doesNotMatch(html, /data-empty-bay-list/);
  assert.doesNotMatch(html, /data-empty-honest/);
  assert.doesNotMatch(html, /data-empty-claim/);
  assert.doesNotMatch(html, /data-empty-identity/);
  assert.doesNotMatch(html, /data-empty-identity-first/);
  assert.doesNotMatch(html, /\$5 takes #1/);
  const occupiedIdentity = html.indexOf('name="identity"');
  const occupiedClaim = html.indexOf("Claim #1 for");
  assert.ok(occupiedClaim >= 0 && occupiedIdentity > occupiedClaim);
});

test("cards render rank, title, company, $bid, and click count", () => {
  const [acme] = rankListings(specTieRows);
  assert.ok(acme);
  const html = renderToStaticMarkup(
    createElement(ListingCard, { listing: acme }),
  );
  assert.match(html, /data-rank="1"/);
  assert.match(html, /#1/);
  assert.match(html, /Staff Backend Engineer/);
  assert.match(html, /Acme/);
  assert.match(html, /\$21/);
  assert.match(html, /9 clicks/);
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
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
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /href="#claim"/);
  assert.match(html, /Remote \(global\)/);
  assert.doesNotMatch(html, /\$0|competitive/i);
});

test("job sheet scans as a job: title, company, Apply, then $bid", () => {
  const [acme] = rankListings(specTieRows);
  assert.ok(acme);
  const html = renderToStaticMarkup(
    createElement(ListingCard, { listing: acme }),
  );
  const title = html.indexOf("Staff Backend Engineer");
  const company = html.indexOf("data-company");
  const apply = html.indexOf(">Apply<");
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf("data-apply-after-list-first");
  const afterListTwo = html.indexOf("data-apply-after-list-two");
  const afterListThree = html.indexOf("data-apply-after-list-three");
  const afterListFour = html.indexOf("data-apply-after-list-four");
  const afterListFive = html.indexOf("data-apply-after-list-five");
  const afterListSix = html.indexOf("data-apply-after-list-six");
  const listAfter = html.indexOf("data-list-after-apply");
  const listFirst = html.indexOf("data-list-after-apply-first");
  const listTwo = html.indexOf("data-list-after-apply-two");
  const listThree = html.indexOf("data-list-after-apply-three");
  const listFour = html.indexOf("data-list-after-apply-four");
  const listFive = html.indexOf("data-list-after-apply-five");
  const listSix = html.indexOf("data-list-after-apply-six");
  const listSeven = html.indexOf("data-list-after-apply-seven");
  const bid = html.indexOf("data-bid");
  assert.ok(title >= 0 && company > title && apply > company && bid > apply);
  assert.ok(firstClick > company && firstClick < apply);
  assert.ok(afterListFirst > firstClick && afterListFirst < apply);
  assert.ok(afterListTwo > afterListFirst && afterListTwo < apply);
  assert.ok(afterListThree > afterListTwo && afterListThree < apply);
  assert.ok(afterListFour > afterListThree && afterListFour < apply);
  assert.ok(afterListFive > afterListFour && afterListFive < apply);
  assert.ok(afterListSix > afterListFive && afterListSix < apply);
  assert.ok(
    listAfter > apply &&
      listFirst >= listAfter &&
      listTwo >= listFirst &&
      listThree >= listTwo &&
      listFour >= listThree &&
      listFive >= listFour &&
      listSix >= listFive &&
      listSeven >= listSix &&
      bid > listSeven,
  );
  assert.match(html, /class="sheet-apply"/);
  assert.doesNotMatch(html, /sheet-head/);
});

test("occupied #1 role title is the prize before $bid + clicks", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const first = html.indexOf('data-listing-id="lst_acme"');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const prize = html.indexOf("data-prize-title");
  const title = html.indexOf("Staff Backend Engineer");
  const laterFact = html.indexOf("data-later-fact");
  const bid = html.indexOf('data-bid=""');
  const clicks = html.indexOf('data-clicks=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  assert.ok(first >= 0 && prize > first && title > prize && later > title);
  assert.ok(laterFact > title && bid > laterFact && clicks > bid && later > clicks);
  assert.ok(applyHref > title && applyHref < bid);
  assert.match(html, /data-prize-title=""/);
  assert.match(html, /data-later-fact=""/);
  assert.match(html, /data-rank="1"/);
  assert.match(html, /Staff Backend Engineer/);
  assert.match(html, /\$21/);
  assert.match(html, /9 clicks/);
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, /name="identity"/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, />Outbid</);
  assert.equal((html.match(/data-prize-title=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-later-fact=""/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(html.slice(later), /data-prize-title/);
  assert.doesNotMatch(html.slice(later), /data-later-fact/);
  assert.doesNotMatch(laterCard, /data-prize-title/);
  assert.doesNotMatch(laterCard, /data-later-fact/);
  assert.match(laterCard, /data-rank="2"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(laterCard, /data-apply-later-outlined=""/);
  assert.match(laterCard, /data-later-quiet=""/);
  assert.match(laterCard, /data-later-role=""/);
  assert.match(laterCard, /Platform Engineer/);
  assert.match(empty, /data-empty-lane="true"/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, /data-prize-title/);
  assert.doesNotMatch(empty, /data-later-fact/);
  assert.doesNotMatch(empty, /data-later-quiet/);
  assert.doesNotMatch(empty, /data-later-pack/);
  assert.doesNotMatch(empty, /data-later-role/);
  assert.doesNotMatch(empty, /data-listing-card/);
});

test("occupied #1 $bid stays a later fact — title stays the prize", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const first = html.indexOf('data-listing-id="lst_acme"');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const prize = html.indexOf("data-prize-title");
  const title = html.indexOf("Staff Backend Engineer");
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const laterApply = html.indexOf("data-apply-later-outlined");
  const laterFact = html.indexOf("data-later-fact");
  const bid = html.indexOf('data-bid=""');
  const clicks = html.indexOf('data-clicks=""');
  assert.ok(first >= 0 && prize > first && title > prize);
  assert.ok(applyHref > title && applyHref < laterFact);
  assert.ok(laterFact > applyHref && bid > laterFact && clicks > bid && later > clicks);
  assert.ok(laterApply > later);
  assert.match(html, /data-prize-title=""/);
  assert.match(html, /class="meta"[^>]*data-later-fact=""/);
  assert.match(html, /data-bid=""/);
  assert.match(html, /data-clicks=""/);
  assert.match(html, /\$21/);
  assert.match(html, /9 clicks/);
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, /data-apply-later-outlined=""/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, /name="identity"/);
  assert.match(html, />Outbid</);
  assert.equal((html.match(/data-later-fact=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-prize-title=""/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(html.slice(later), /data-later-fact/);
  assert.doesNotMatch(html.slice(later), /data-prize-title/);
  assert.doesNotMatch(laterCard, /data-later-fact/);
  assert.doesNotMatch(laterCard, /data-prize-title/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(laterCard, /data-apply-later-outlined=""/);
  assert.match(laterCard, /class="later-apply"/);
  assert.match(laterCard, /href="\/out\/lst_gamma"/);
  assert.doesNotMatch(laterCard, /class="apply"/);
  assert.match(empty, /data-empty-lane="true"/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, /data-later-fact/);
  assert.doesNotMatch(empty, /data-prize-title/);
  assert.doesNotMatch(empty, /href="\/out\//);
  assert.doesNotMatch(empty, />Apply</);
});

test("occupied later ranks stay quieter than occupied #1", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  const lastCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[2]! }),
  );
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const first = html.indexOf('data-listing-id="lst_acme"');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const last = html.indexOf('data-listing-id="lst_beta"');
  const prize = html.indexOf("data-prize-title");
  const prizePack = html.indexOf("data-prize-pack");
  const laterPack = html.indexOf("data-later-pack");
  const laterRole = html.indexOf("data-later-role");
  const laterQuiet = html.indexOf("data-later-quiet");
  const lastQuiet = html.lastIndexOf("data-later-quiet");
  const laterApply = html.indexOf("data-apply-later");
  const laterHref = html.indexOf('href="/out/lst_gamma"');
  const lastHref = html.indexOf('href="/out/lst_beta"');
  assert.ok(first >= 0 && prize > first && later > prize);
  assert.ok(prizePack >= 0 && prizePack < first && laterPack > prize && later > laterPack);
  assert.ok(laterRole > later && laterQuiet > later && last > later && lastQuiet > last);
  assert.ok(laterHref > laterQuiet && laterApply > laterHref);
  assert.ok(lastHref > last);
  assert.match(html, /data-prize-title=""/);
  assert.match(html, /data-later-quiet=""/);
  assert.match(html, /data-prize-pack=""/);
  assert.match(html, /data-later-pack=""/);
  assert.match(html, /data-later-role=""/);
  assert.match(html, /data-apply-later=""/);
  assert.match(html, /href="\/out\/lst_gamma"/);
  assert.match(html, /href="\/out\/lst_beta"/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, />Outbid</);
  assert.match(html, /name="identity"/);
  assert.equal((html.match(/data-prize-title=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-later-quiet=""/g) ?? []).length, 2);
  assert.equal((html.match(/data-prize-pack=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-later-pack=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-later-role=""/g) ?? []).length, 2);
  assert.equal((html.match(/data-apply-later=""/g) ?? []).length, 2);
  assert.doesNotMatch(html.slice(0, later), /data-later-quiet/);
  assert.doesNotMatch(html.slice(later), /data-prize-title/);
  assert.match(laterCard, /data-later-quiet=""/);
  assert.match(laterCard, /data-later-role=""/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(laterCard, /class="later-apply"/);
  assert.match(laterCard, /href="\/out\/lst_gamma"/);
  assert.doesNotMatch(laterCard, /data-prize-title/);
  assert.doesNotMatch(laterCard, /data-apply-live/);
  assert.doesNotMatch(laterCard, /class="apply"/);
  assert.match(lastCard, /data-later-quiet=""/);
  assert.match(lastCard, /data-later-role=""/);
  assert.match(lastCard, /href="\/out\/lst_beta"/);
  assert.match(empty, /data-empty-lane="true"/);
  assert.match(empty, /data-empty-quiet="true"/);
  assert.doesNotMatch(empty, /data-later-quiet/);
  assert.doesNotMatch(empty, /data-later-pack/);
  assert.doesNotMatch(empty, /data-later-role/);
  assert.doesNotMatch(empty, /data-listing-card/);
});

test("occupied later-rank titles stay quieter than #1 — prize stays first", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  const lastCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[2]! }),
  );
  const firstCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[0]! }),
  );
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const prizePack = html.indexOf("data-prize-pack");
  const first = html.indexOf('data-listing-id="lst_acme"');
  const prize = html.indexOf("data-prize-title");
  const prizeTitle = html.indexOf("Staff Backend Engineer");
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const firstClick = html.indexOf('data-first-click="apply"');
  const laterPack = html.indexOf("data-later-pack");
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterRole = html.indexOf("data-later-role");
  const laterTitle = html.indexOf("Platform Engineer");
  const laterOutlined = html.indexOf("data-apply-later-outlined");
  const last = html.indexOf('data-listing-id="lst_beta"');
  const claim = html.indexOf('id="claim"');
  const emptyClaim = empty.indexOf("Claim #1 for");
  const emptyOutbid = empty.indexOf(">Outbid<");
  const emptyIdentity = empty.indexOf('name="identity"');
  const laterSheetRule =
    cssSource.match(/\.later-sheet\[data-later-quiet\][\s\S]*?\}/)?.[0] ?? "";
  const laterRoleRule =
    cssSource.match(
      /\.later-sheet\[data-later-quiet\] \.later-role[\s\S]*?\}/,
    )?.[0] ?? "";
  const prizeTitleRule =
    cssSource.match(
      /\.card\[data-rank="1"\] \.title\[data-prize-title\][\s\S]*?\}/,
    )?.[0] ?? "";
  assert.ok(prizePack >= 0 && first > prizePack && prize > first);
  assert.ok(prizeTitle > prize && applyHref > prizeTitle && firstClick > applyHref);
  assert.ok(laterPack > firstClick && later > laterPack && laterRole > later);
  assert.ok(laterTitle > laterRole && laterOutlined > laterTitle && last > laterOutlined);
  assert.ok(claim > last);
  assert.ok(emptyClaim >= 0 && emptyOutbid > emptyClaim && emptyIdentity > emptyOutbid);
  assert.match(html, /data-prize-pack=""/);
  assert.match(html, /data-later-pack=""/);
  assert.match(html, /data-prize-title=""/);
  assert.match(html, /data-later-role=""/);
  assert.match(html, /class="card later-sheet"/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-later-outlined=""/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, />Outbid</);
  assert.match(html, /name="identity"/);
  assert.equal((html.match(/data-prize-pack=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-later-pack=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-prize-title=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-later-role=""/g) ?? []).length, 2);
  assert.equal((html.match(/class="card later-sheet"/g) ?? []).length, 2);
  assert.equal((html.match(/class="card job-sheet"/g) ?? []).length, 1);
  assert.doesNotMatch(html.slice(later), /data-prize-title|class="card job-sheet"|class="title"/);
  assert.doesNotMatch(html.slice(0, laterPack), /data-later-pack|data-later-role|class="card later-sheet"/);
  assert.match(firstCard, /class="card job-sheet"/);
  assert.match(firstCard, /data-prize-title=""/);
  assert.match(firstCard, /<h3 class="title"/);
  assert.doesNotMatch(firstCard, /data-later-role|class="card later-sheet"|class="later-role"/);
  assert.match(laterCard, /class="card later-sheet"/);
  assert.match(laterCard, /data-later-role=""/);
  assert.match(laterCard, /class="later-role"/);
  assert.match(laterCard, /class="later-apply"/);
  assert.match(laterCard, /Platform Engineer/);
  assert.doesNotMatch(laterCard, /data-prize-title|<h3|class="title"|class="card job-sheet"|class="apply"/);
  assert.match(lastCard, /class="card later-sheet"/);
  assert.match(lastCard, /data-later-role=""/);
  assert.doesNotMatch(lastCard, /data-prize-title|<h3|class="title"/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, />Outbid</);
  assert.match(empty, /data-first-click="claim"/);
  assert.doesNotMatch(empty, /data-later-pack|data-prize-pack|data-later-role|class="card later-sheet"/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.match(laterSheetRule, /flex-direction:\s*row/);
  assert.match(laterSheetRule, /min-height:\s*0/);
  assert.match(laterSheetRule, /border-style:\s*dashed/);
  assert.match(laterRoleRule, /font-size:\s*0\.92rem/);
  assert.match(prizeTitleRule, /clamp\(1\.55rem/);
  assert.doesNotMatch(cssSource, /data-later-quiet\] \.title/);
  assert.doesNotMatch(html, /data-later-title|data-title-later-quiet|data-later-quiet-title/);
});

test("later-rank Apply stays outlined — filled Apply is #1 only", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  const lastCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[2]! }),
  );
  const firstCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[0]! }),
  );
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const prizePack = html.indexOf("data-prize-pack");
  const first = html.indexOf('data-listing-id="lst_acme"');
  const prize = html.indexOf("data-prize-title");
  const prizeTitle = html.indexOf("Staff Backend Engineer");
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const firstClick = html.indexOf('data-first-click="apply"');
  const applyLive = html.indexOf("data-apply-live");
  const laterPack = html.indexOf("data-later-pack");
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterHop = html.indexOf("data-apply-later");
  const laterOutlined = html.indexOf("data-apply-later-outlined");
  const laterHref = html.indexOf('href="/out/lst_gamma"');
  const last = html.indexOf('data-listing-id="lst_beta"');
  const lastHref = html.indexOf('href="/out/lst_beta"');
  const claim = html.indexOf('id="claim"');
  const identity = html.indexOf('name="identity"');
  const emptyClaim = empty.indexOf("Claim #1 for");
  const emptyOutbid = empty.indexOf(">Outbid<");
  const emptyIdentity = empty.indexOf('name="identity"');
  const laterApplyRule =
    cssSource.match(
      /\.later-sheet\[data-later-quiet\] \.later-apply\[data-apply-later\]\[data-apply-later-outlined\][\s\S]*?\}/,
    )?.[0] ?? "";
  const filledApplyRule =
    cssSource.match(
      /\.job-sheet\[data-take-apply\] \.sheet-apply\[data-apply-after-identity\][\s\S]*?\.apply\[data-apply-live\]\[data-first-click="apply"\]\[data-apply-after-list-first\]\[data-apply-after-list-two\]\[data-apply-after-list-three\]\[data-apply-after-list-four\]\[data-apply-after-list-five\]\[data-apply-after-list-six\][\s\S]*?\}/,
    )?.[0] ?? "";
  assert.ok(prizePack >= 0 && first > prizePack && prize > first);
  assert.ok(prizeTitle > prize && applyHref > prizeTitle && firstClick > applyHref);
  assert.ok(applyLive > first && laterPack > applyLive && later > laterPack);
  assert.ok(laterHop > later && laterOutlined > laterHop && laterHref > later);
  assert.ok(last > later && lastHref > last && claim > last);
  assert.ok(identity >= 0 && identity > claim);
  assert.ok(emptyClaim >= 0 && emptyOutbid > emptyClaim && emptyIdentity > emptyOutbid);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-apply-later=""/);
  assert.match(html, /data-apply-later-outlined=""/);
  assert.match(html, /class="later-apply"/);
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, /href="\/out\/lst_gamma"/);
  assert.match(html, /href="\/out\/lst_beta"/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, />Outbid</);
  assert.match(html, /name="identity"/);
  assert.match(html, /data-first-click="apply"/);
  assert.equal((html.match(/data-apply-live=""/g) ?? []).length, 1);
  assert.equal((html.match(/class="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/class="later-apply"/g) ?? []).length, 2);
  assert.equal((html.match(/data-apply-later=""/g) ?? []).length, 2);
  assert.equal((html.match(/data-apply-later-outlined=""/g) ?? []).length, 2);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(html.slice(0, later), /data-apply-later-outlined|class="later-apply"/);
  assert.doesNotMatch(html.slice(later), /data-apply-live|class="apply"/);
  assert.match(firstCard, /data-apply-live=""/);
  assert.match(firstCard, /class="apply"/);
  assert.match(firstCard, /href="\/out\/lst_acme"/);
  assert.doesNotMatch(firstCard, /data-apply-later/);
  assert.doesNotMatch(firstCard, /data-apply-later-outlined/);
  assert.doesNotMatch(firstCard, /class="later-apply"/);
  assert.match(laterCard, /class="later-apply"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(laterCard, /data-apply-later-outlined=""/);
  assert.match(laterCard, /href="\/out\/lst_gamma"/);
  assert.doesNotMatch(laterCard, /data-apply-live/);
  assert.doesNotMatch(laterCard, /data-take-apply/);
  assert.doesNotMatch(laterCard, /class="apply"/);
  assert.match(lastCard, /class="later-apply"/);
  assert.match(lastCard, /data-apply-later-outlined=""/);
  assert.match(lastCard, /href="\/out\/lst_beta"/);
  assert.doesNotMatch(lastCard, /class="apply"|data-apply-live|data-first-click="apply"/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /name="identity"/);
  assert.match(empty, /data-first-click="claim"/);
  assert.doesNotMatch(empty, /data-apply-later-outlined/);
  assert.doesNotMatch(empty, /data-apply-later/);
  assert.doesNotMatch(empty, /class="later-apply"/);
  assert.doesNotMatch(empty, />Apply</);
  assert.doesNotMatch(empty, /href="\/out\//);
  assert.match(laterApplyRule, /border:\s*1px solid var\(--fg\)/);
  assert.match(laterApplyRule, /background:\s*transparent/);
  assert.match(filledApplyRule, /min-height:\s*6\.15rem/);
  assert.doesNotMatch(cssSource, /data-later-quiet\] \.apply[^-]/);
  assert.doesNotMatch(html, /data-apply-later-mute|data-later-apply-quiet|data-apply-later-quiet|data-later-apply-outlined|data-apply-later-two/);
});

test("board chrome has lane tabs, identity field, amount, and Outbid", () => {
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  assert.match(html, /data-lane-tabs/);
  for (const lane of [
    "backend",
    "frontend",
    "growth",
    "design",
    "devrel",
    "product",
    "data",
    "founding",
  ]) {
    assert.match(html, new RegExp(`data-lane="${lane}"`));
  }
  assert.match(html, /Apply URL or company handle/);
  assert.match(html, /name="amount"/);
  assert.match(html, />Outbid</);
  assert.match(html, /action="\/checkout"/);
  assert.match(html, /data-empty-lane="true"/);
  assert.match(html, /2026-W34/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, /name="identity"/);
  assert.match(html, /aria-label="Decrease bid by one dollar"/);
  assert.match(html, /aria-label="Increase bid by one dollar"/);
});

test("hiring wall treats function lanes as the product and stays a job board", () => {
  const withSalary = rankListings([
    fixtureListing({
      id: "lst_paid",
      company: "Acme",
      title: "Staff Backend Engineer",
      bidUsd: 21,
      clicks: 9,
      createdAt: "2026-08-17T10:00:00.000Z",
      salary: { minUsd: 140_000, maxUsd: 180_000 },
    }),
  ])[0];
  assert.ok(withSalary);

  const wall = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  assert.match(wall, /data-hiring-wall/);
  assert.match(wall, /Function lanes/);
  assert.match(wall, /\$5 takes #1/);
  assert.match(wall, /Nobody is invented here/);
  assert.match(wall, /aria-label="Function lanes"/);
  assert.doesNotMatch(wall, /top company|featured|star rating|social proof/i);

  const card = renderToStaticMarkup(
    createElement(ListingCard, { listing: withSalary }),
  );
  assert.match(card, /Staff Backend Engineer/);
  assert.match(card, /Acme/);
  assert.match(card, /Remote \(global\)/);
  assert.match(card, /data-salary=""/);
  assert.match(card, /\$140,000–\$180,000/);
  assert.match(card, />Apply</);
  assert.match(card, /data-take-apply=""/);
  assert.match(card, /data-apply-after-identity=""/);
  assert.match(card, /href="\/out\/lst_paid"/);
  assert.doesNotMatch(card, /View site|Visit|Buy now|Shop/i);

  const silent = renderToStaticMarkup(
    createElement(ListingCard, {
      listing: { ...withSalary, salary: null },
    }),
  );
  assert.doesNotMatch(silent, /data-salary/);
  assert.doesNotMatch(silent, /\$140,000|\$0|competitive/i);
});

test("occupied List a role does not ask for a second name", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const oneIdentity = html.indexOf("data-one-identity");
  const label = html.indexOf("identity-label");
  const identity = html.indexOf('name="identity"');
  const outbid = html.indexOf(">Outbid<");
  const applyHref = html.indexOf('href="/out/lst_acme"');
  assert.ok(claim >= 0 && listRole > claim && oneIdentity > listRole);
  assert.ok(label > oneIdentity && identity > label && outbid > identity);
  assert.ok(applyHref >= 0 && applyHref < claim);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-one-identity=""/);
  assert.match(html, /htmlFor="identity"|for="identity"/);
  assert.match(html, /Apply URL or company handle/);
  assert.match(html, /name="identity"/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, />Outbid</);
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.equal((html.match(/data-one-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/name="company"/g) ?? []).length, 0);
  assert.equal((html.match(/name="contact"/g) ?? []).length, 0);
  assert.equal((html.match(/name="title"/g) ?? []).length, 0);
  assert.doesNotMatch(html, /name="company"|name="contact"|Company name|Contact name/);
  assert.doesNotMatch(html, /data-empty-identity-first/);
  assert.doesNotMatch(empty, /data-one-identity/);
  assert.match(empty, /Claim #1 for/);
  assert.equal((empty.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(empty, /href="\/out\//);
  assert.doesNotMatch(empty, />Apply</);
});

test("occupied live claim stamps List a role so an employer can find the write", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const take = html.indexOf("data-take-apply");
  const applyLive = html.indexOf("data-apply-live");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const stamp = html.indexOf("data-list-role-stamp");
  const claimTitle = html.indexOf("Claim #1 for");
  const outbid = html.indexOf(">Outbid<");
  const later = html.indexOf('data-listing-id="lst_gamma"');
  assert.ok(claim >= 0 && listRole > claim && stamp > listRole);
  assert.ok(claimTitle > stamp && outbid > claimTitle);
  assert.ok(take >= 0 && applyLive > take);
  assert.ok(later > applyLive && claim > later);
  assert.match(html, /data-list-role-stamp=""/);
  assert.match(html, /aria-label="List a role"/);
  assert.match(html, /List a remote role on this lane/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, /name="identity"/);
  assert.match(html, /class="amount-field"/);
  assert.match(html, />Outbid</);
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
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.equal((html.match(/data-list-role="employer"/g) ?? []).length, 1);
  assert.equal((html.match(/List a role/g) ?? []).length, 3);
  assert.match(html.slice(later), /data-list-role="employer"/);
  assert.match(html.slice(later), /List a role/);
  assert.doesNotMatch(html.slice(later, claim), /data-list-role="employer"/);
});

test("occupied live sheet stamps Apply as the certain outbound hop", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const take = html.indexOf("data-take-apply");
  const applyLive = html.indexOf("data-apply-live");
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const claim = html.indexOf('id="claim"');
  const outbid = html.indexOf(">Outbid<");
  assert.ok(take >= 0 && applyLive > take);
  assert.ok(applyHref >= 0 && applyLive < later);
  assert.ok(claim >= 0 && outbid > claim);
  assert.match(html, /data-period-live="true"/);
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, /class="apply"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /\$21/);
  assert.match(html, /Claim #1 for/);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-take-apply|data-apply-live|data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six/,
  );
});

test("occupied #1 Apply stays the certain hop after empty-bay identity leads", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const listRole = html.indexOf('data-list-role="employer"');
  const occupiedIdentity = html.indexOf('name="identity"');
  const take = html.indexOf("data-take-apply");
  const afterIdentity = html.indexOf("data-apply-after-identity");
  const applyLive = html.indexOf("data-apply-live");
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf("data-apply-after-list-first");
  const afterListTwo = html.indexOf("data-apply-after-list-two");
  const afterListThree = html.indexOf("data-apply-after-list-three");
  const afterListFour = html.indexOf("data-apply-after-list-four");
  const afterListFive = html.indexOf("data-apply-after-list-five");
  const afterListSix = html.indexOf("data-apply-after-list-six");
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf("data-list-after-apply");
  const listFirst = html.indexOf("data-list-after-apply-first");
  const listTwo = html.indexOf("data-list-after-apply-two");
  const listThree = html.indexOf("data-list-after-apply-three");
  const listFour = html.indexOf("data-list-after-apply-four");
  const listFive = html.indexOf("data-list-after-apply-five");
  const listSix = html.indexOf("data-list-after-apply-six");
  const listSeven = html.indexOf("data-list-after-apply-seven");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  assert.ok(listRole >= 0 && occupiedIdentity > listRole);
  assert.ok(take >= 0 && afterIdentity > take && occupiedIdentity > take);
  assert.ok(applyLive > afterIdentity && firstClick > applyLive);
  assert.ok(afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree);
  assert.ok(afterListFive > afterListFour && afterListSix > afterListFive && apply > afterListSix && bid > apply);
  assert.ok(
    listAfter > apply &&
      listFirst >= listAfter &&
      listTwo >= listFirst &&
      listThree >= listTwo &&
      listFour >= listThree &&
      listFive >= listFour &&
      listSix >= listFive &&
      listSeven >= listSix &&
      bid > listSeven,
  );
  assert.ok(later > bid && laterStamp > later);
  assert.match(html, /data-apply-after-identity=""/);
  assert.match(html, /data-take-apply=""/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /List a role/);
  assert.match(html, /data-later-apply=""/);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-empty-identity-first/);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-identity|data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six/,
  );
});

test("later live ranks stamp Apply as the certain hop, not a second #1 take", () => {
  const later = rankListings(specTieRows)[1];
  assert.ok(later);
  const html = renderToStaticMarkup(
    createElement(ListingCard, { listing: later }),
  );
  const stamp = html.indexOf("data-later-apply");
  const hop = html.indexOf("data-apply-later");
  const outlined = html.indexOf("data-apply-later-outlined");
  const apply = html.indexOf(">Apply<");
  const bid = html.indexOf("data-bid");
  assert.ok(stamp >= 0 && hop > stamp && outlined > hop && apply > outlined && bid > apply);
  assert.match(html, /data-rank="2"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.match(html, /data-apply-later-outlined=""/);
  assert.match(html, /data-later-quiet=""/);
  assert.match(html, /data-later-role=""/);
  assert.match(html, />Apply</);
  assert.match(html, /href="\/out\/lst_gamma"/);
  assert.match(html, /class="later-apply"/);
  assert.match(html, /class="sheet-apply"/);
  assert.doesNotMatch(html, /class="apply"/);
  assert.doesNotMatch(html, /data-take-apply/);
  assert.doesNotMatch(html, /data-apply-live/);
  assert.doesNotMatch(html, /data-apply-after-identity/);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-apply-after-list-first/);
  assert.doesNotMatch(html, /data-apply-after-list-two/);
  assert.doesNotMatch(html, /data-apply-after-list-three/);
  assert.doesNotMatch(html, /data-apply-after-list-four/);
  assert.doesNotMatch(html, /data-apply-after-list-five/);
  assert.doesNotMatch(html, /data-apply-after-list-six/);
  assert.doesNotMatch(html, /data-list-after-apply/);
  assert.doesNotMatch(html, /data-list-after-apply-first/);
  assert.doesNotMatch(html, /data-list-after-apply-two/);
  assert.doesNotMatch(html, /data-list-after-apply-three/);
  assert.doesNotMatch(html, /data-list-after-apply-four/);
  assert.doesNotMatch(html, /data-list-after-apply-five/);
  assert.doesNotMatch(html, /data-list-after-apply-six/);
  assert.doesNotMatch(html, /data-list-after-apply-seven/);
  assert.doesNotMatch(html, /after Apply/);
});

test("occupied live later ranks stamp Apply so an applicant can take the hop", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const take = html.indexOf("data-take-apply");
  const applyLive = html.indexOf("data-apply-live");
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const last = html.indexOf('data-listing-id="lst_beta"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const laterOutlined = html.indexOf("data-apply-later-outlined");
  const laterHref = html.indexOf('href="/out/lst_gamma"');
  const lastHref = html.indexOf('href="/out/lst_beta"');
  const listRole = html.indexOf('data-list-role="employer"');
  const listAfter = html.indexOf("data-list-after-apply");
  assert.ok(take >= 0 && applyLive > take && later > applyLive);
  assert.ok(listAfter > applyLive && later > listAfter);
  assert.ok(laterStamp > later && laterHop > laterStamp && laterOutlined > laterHop);
  assert.ok(laterHref > later && last > later && lastHref > last);
  assert.ok(listRole >= 0 && laterStamp < listRole);
  assert.match(html, /data-period-live="true"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.match(html, /data-apply-later-outlined=""/);
  assert.match(html, /href="\/out\/lst_gamma"/);
  assert.match(html, /href="\/out\/lst_beta"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-take-apply=""/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /List a role/);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/data-later-apply/g) ?? []).length, 2);
  assert.equal((html.match(/data-apply-later=""/g) ?? []).length, 2);
  assert.equal((html.match(/data-apply-later-outlined=""/g) ?? []).length, 2);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.doesNotMatch(html.slice(0, later), /data-later-apply|data-apply-later=""/);
  assert.doesNotMatch(
    html.slice(later),
    /data-take-apply|data-apply-live|data-apply-after-identity|data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven/,
  );
});

test("occupied live #1 lists after Apply so a closer can find the write", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const take = html.indexOf("data-take-apply");
  const afterIdentity = html.indexOf("data-apply-after-identity");
  const applyLive = html.indexOf("data-apply-live");
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  assert.ok(take >= 0 && afterIdentity > take && applyLive > afterIdentity);
  assert.ok(firstClick > applyLive && afterListFirst > firstClick);
  assert.ok(afterListTwo > afterListFirst && afterListThree > afterListTwo);
  assert.ok(afterListFour > afterListThree && afterListFive > afterListFour && afterListSix > afterListFive && apply > afterListSix && listAfter > apply);
  assert.ok(listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(claim >= 0 && listRole > claim && take < listRole);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /Paying less than #1 still lists/);
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
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-empty-bay-list/);
  assert.doesNotMatch(html, /data-empty-identity-first/);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|after Apply|data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six/,
  );
});

test("occupied live #1 Apply wins the first click after List a role", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const take = html.indexOf("data-take-apply");
  const afterIdentity = html.indexOf("data-apply-after-identity");
  const applyLive = html.indexOf("data-apply-live");
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  assert.ok(take >= 0 && afterIdentity > take && applyLive > afterIdentity);
  assert.ok(firstClick > applyLive && firstClick < listAfter);
  assert.ok(afterListFirst > firstClick && afterListFirst < listAfter);
  assert.ok(afterListTwo > afterListFirst && afterListTwo < listAfter);
  assert.ok(afterListThree > afterListTwo && afterListThree < listAfter);
  assert.ok(afterListFour > afterListThree && afterListFour < listAfter);
  assert.ok(afterListFive > afterListFour && afterListFive < listAfter);
  assert.ok(afterListSix > afterListFive && afterListSix < listAfter);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(apply > afterListFive && listAfter > apply);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later);
  assert.ok(claim >= 0 && listRole > claim && take < listRole);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-apply-after-identity=""/);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|after Apply/,
  );
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied List a role stays certain after Apply wins the first click", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(listAfter > apply);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /Paying less than #1 still lists/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|after Apply|data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
});

test("occupied #1 Apply stays certain after List a role is concentrated", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-apply-after-identity=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-first-click="apply"|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|after Apply/,
  );
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied live #1 lists after Apply is re-concentrated without another hop", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(Math.abs(listTwo - listAfter) < 120);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /Paying less than #1 still lists/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|data-list-after-apply-three|data-list-after-apply-two|data-list-after-apply-first|data-list-after-apply|after Apply|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-first-click="apply"/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied #1 Apply stays certain after List a role is re-concentrated", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(Math.abs(afterListTwo - afterListFirst) < 80);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-apply-after-identity=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-list-two|data-apply-after-list-first|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-first-click="apply"|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|after Apply/,
  );
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied live #1 lists after Apply is re-concentrated again without another hop", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(Math.abs(listThree - listAfter) < 160);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /Paying less than #1 still lists/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|data-list-after-apply-three|data-list-after-apply-two|data-list-after-apply-first|data-list-after-apply|after Apply|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-first-click="apply"/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied #1 Apply stays certain after List a role is re-concentrated again", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(Math.abs(afterListThree - afterListTwo) < 80);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-apply-after-identity=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-list-three|data-apply-after-list-two|data-apply-after-list-first|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-first-click="apply"|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|after Apply/,
  );
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied live #1 lists after Apply is re-concentrated again without another named hop", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(Math.abs(listFour - listAfter) < 200);
  assert.ok(Math.abs(listFour - listThree) < 80);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /Paying less than #1 still lists/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|data-list-after-apply-three|data-list-after-apply-two|data-list-after-apply-first|data-list-after-apply|after Apply|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-first-click="apply"/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied #1 Apply stays certain after List a role is re-concentrated again without another named hop", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(Math.abs(afterListFour - afterListThree) < 80);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-apply-after-identity=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-apply-after-list-three|data-apply-after-list-two|data-apply-after-list-first|data-first-click="apply"|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|after Apply/,
  );
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied live #1 lists after Apply is re-concentrated again so List a role does not disappear", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(Math.abs(listFive - listAfter) < 240);
  assert.ok(Math.abs(listFive - listFour) < 80);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /Paying less than #1 still lists/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|data-list-after-apply-four|data-list-after-apply-three|data-list-after-apply-two|data-list-after-apply-first|data-list-after-apply|after Apply|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-first-click="apply"/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied live #1 lists after Apply is re-concentrated again so List a role does not disappear under Apply", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(Math.abs(listSix - listAfter) < 280);
  assert.ok(Math.abs(listSix - listFive) < 80);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /Paying less than #1 still lists/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply-six|data-list-after-apply-seven|data-list-after-apply-five|data-list-after-apply-four|data-list-after-apply-three|data-list-after-apply-two|data-list-after-apply-first|data-list-after-apply|after Apply|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-first-click="apply"/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied live #1 lists after Apply is re-concentrated again so List a role does not disappear under that louder Apply", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(Math.abs(listSeven - listAfter) < 320);
  assert.ok(Math.abs(listSeven - listSix) < 80);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /Paying less than #1 still lists/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply-seven|data-list-after-apply-six|data-list-after-apply-five|data-list-after-apply-four|data-list-after-apply-three|data-list-after-apply-two|data-list-after-apply-first|data-list-after-apply|after Apply|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-apply-after-list-five|data-apply-after-list-six|data-first-click="apply"/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied #1 Apply stays certain after List a role is re-concentrated again so Apply does not disappear", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && apply > afterListFive);
  assert.ok(afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(Math.abs(afterListFive - afterListFour) < 80);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-apply-after-identity=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-list-five|data-apply-after-list-six|data-apply-after-list-four|data-apply-after-list-three|data-apply-after-list-two|data-apply-after-list-first|data-first-click="apply"|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|after Apply/,
  );
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied #1 Apply stays certain after List a role is re-concentrated again so Apply does not disappear under List", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const firstClick = html.indexOf('data-first-click="apply"');
  const afterListFirst = html.indexOf('data-apply-after-list-first=""');
  const afterListTwo = html.indexOf('data-apply-after-list-two=""');
  const afterListThree = html.indexOf('data-apply-after-list-three=""');
  const afterListFour = html.indexOf('data-apply-after-list-four=""');
  const afterListFive = html.indexOf('data-apply-after-list-five=""');
  const afterListSix = html.indexOf('data-apply-after-list-six=""');
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const listFive = html.indexOf('data-list-after-apply-five=""');
  const listSix = html.indexOf('data-list-after-apply-six=""');
  const listSeven = html.indexOf('data-list-after-apply-seven=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  const laterHop = html.indexOf("data-apply-later");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  assert.ok(firstClick >= 0 && afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree && apply > afterListFour);
  assert.ok(afterListFive > afterListFour && afterListSix > afterListFive && apply > afterListSix);
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(Math.abs(afterListSix - afterListFive) < 80);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree && listFive >= listFour && listSix >= listFive && listSeven >= listSix);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listSeven && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick < listRole);
  assert.match(html, /data-apply-after-list-six=""/);
  assert.match(html, /data-apply-after-list-five=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-apply-after-identity=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /data-list-after-apply-five=""/);
  assert.match(html, /data-list-after-apply-six=""/);
  assert.match(html, /data-list-after-apply-seven=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-apply-after-list-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-five=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-six=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-seven=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-list-six|data-apply-after-list-five|data-apply-after-list-four|data-apply-after-list-three|data-apply-after-list-two|data-apply-after-list-first|data-first-click="apply"|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|data-list-after-apply-five|data-list-after-apply-six|data-list-after-apply-seven|after Apply/,
  );
  assert.doesNotMatch(laterCard, /data-apply-after-list-six/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-five/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-five/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-six/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-seven/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-apply-after-list-six/);
  assert.doesNotMatch(empty, /data-apply-after-list-five/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-five/);
  assert.doesNotMatch(empty, /data-list-after-apply-six/);
  assert.doesNotMatch(empty, /data-list-after-apply-seven/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /after Apply/);
});

test("occupied List a role stays quieter than Apply #1 — title stays the prize", () => {
  const listings = rankListings(specTieRows);
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
    }),
  );
  const laterCard = renderToStaticMarkup(
    createElement(ListingCard, { listing: listings[1]! }),
  );
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: [],
    }),
  );
  const prize = html.indexOf("data-prize-title");
  const title = html.indexOf("Staff Backend Engineer");
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const firstClick = html.indexOf('data-first-click="apply"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterOutlined = html.indexOf("data-apply-later-outlined");
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  const listStamp = html.indexOf("data-list-role-stamp");
  const emptyClaim = empty.indexOf("Claim #1 for");
  const emptyOutbid = empty.indexOf(">Outbid<");
  const emptyIdentity = empty.indexOf('name="identity"');
  const emptyFirstClick = empty.indexOf('data-first-click="claim"');
  const listHopRule =
    cssSource.match(
      /\.list-after-apply\[data-list-after-apply\]\[data-list-after-apply-first\]\[data-list-after-apply-two\]\[data-list-after-apply-three\]\[data-list-after-apply-four\]\[data-list-after-apply-five\]\[data-list-after-apply-six\]\[data-list-after-apply-seven\][\s\S]*?\}/,
    )?.[0] ?? "";
  const applyHopRule =
    cssSource.match(
      /\.job-sheet\[data-take-apply\] \.sheet-apply\[data-apply-after-identity\][\s\S]*?\.apply\[data-apply-live\]\[data-first-click="apply"\]\[data-apply-after-list-first\]\[data-apply-after-list-two\]\[data-apply-after-list-three\]\[data-apply-after-list-four\]\[data-apply-after-list-five\]\[data-apply-after-list-six\][\s\S]*?\}/,
    )?.[0] ?? "";
  const occupiedClaimRule =
    cssSource.match(/\.claim\[data-list-role\][\s\S]*?\}/)?.[0] ?? "";
  assert.ok(prize >= 0 && title > prize && applyHref > title);
  assert.ok(firstClick > applyHref && apply > firstClick);
  assert.ok(listAfter > apply && later > listAfter);
  assert.ok(laterOutlined > later && claim > later && listRole > claim);
  assert.ok(listStamp > listRole);
  assert.ok(emptyClaim >= 0 && emptyOutbid > emptyClaim && emptyIdentity > emptyOutbid);
  assert.ok(emptyFirstClick > emptyClaim && emptyFirstClick < emptyIdentity);
  assert.match(html, /data-prize-title=""/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /List a role/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, />Outbid</);
  assert.match(html, /name="identity"/);
  assert.match(html, /data-apply-later-outlined=""/);
  assert.equal((html.match(/data-prize-title=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-role="employer"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-list-after-apply-eight/);
  assert.doesNotMatch(html, /data-apply-after-list-seven/);
  assert.doesNotMatch(html, /data-list-quiet-after|data-apply-one-first|data-list-after-apply-N/);
  assert.match(laterCard, /data-apply-later-outlined=""/);
  assert.match(laterCard, /class="later-apply"/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-prize-title/);
  assert.doesNotMatch(laterCard, /class="apply"/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, />Outbid</);
  assert.doesNotMatch(empty, /List a role/);
  assert.doesNotMatch(empty, /data-list-role/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.match(listHopRule, /display:\s*inline/);
  assert.match(listHopRule, /min-height:\s*0/);
  assert.match(applyHopRule, /min-height:\s*6\.15rem/);
  assert.match(occupiedClaimRule, /margin-top:\s*1\.5rem/);
  assert.doesNotMatch(occupiedClaimRule, /background:\s*var\(--primary\)/);
});

test("ranked fixture cards keep SPEC §3 order in markup", () => {
  const html = renderToStaticMarkup(
    createElement(Leaderboard, {
      lane: "backend",
      listings: rankListings(specTieRows),
    }),
  );
  const acme = html.indexOf("Acme");
  const gamma = html.indexOf("Gamma");
  const beta = html.indexOf("Beta");
  assert.ok(acme >= 0 && gamma > acme && beta > gamma);
  assert.match(html, /\$21/);
  assert.match(html, /\$20/);
  assert.match(html, /9 clicks/);
  assert.match(html, /4 clicks/);
});

test("occupied week window is rolling last 7 days from paid placement — not Monday 00:00 UTC", () => {
  const listings = rankListings(specTieRows);
  const occupied = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: liveRankResetAt(listings, new Date("2026-08-17T14:00:00.000Z")),
      listings,
    }),
  );
  const empty = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T14:00:00.000Z",
      listings: [],
    }),
  );
  const closed = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W33",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings,
      live: false,
    }),
  );

  assert.match(occupied, /data-week-window="rolling-7d"/);
  assert.match(occupied, /Rolling last 7 days from paid placement/);
  assert.match(occupied, /Week 2026-W34 is an audit label/);
  assert.match(occupied, /2026-08-24T10:00:00.000Z/);
  assert.doesNotMatch(occupied, /2026-08-24T00:00:00.000Z/);
  assert.match(occupied, /data-prize-title=""/);
  assert.match(occupied, /Staff Backend Engineer/);
  assert.match(occupied, /data-first-click="apply"/);
  assert.match(occupied, />Apply</);
  assert.match(occupied, /\$21/);
  assert.match(occupied, /9 clicks/);
  assert.match(occupied, />Outbid</);
  assert.match(occupied, /amount-field/);
  assert.ok(occupied.indexOf('data-first-click="apply"') < occupied.indexOf("wall-plate"));
  assert.ok(occupied.indexOf("wall-plate") < occupied.indexOf('data-list-role="employer"'));
  assert.doesNotMatch(occupied, /class="wall-rail"/);
  assert.doesNotMatch(occupied, /data-list-after-apply-N|data-list-after-apply-eight/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);

  assert.match(empty, /data-week-window="rolling-7d"/);
  assert.match(empty, /Rolling last 7 days from paid placement/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Claim #1, then pick the function/);
  assert.match(empty, /<select[^>]*name="lane"/);
  assert.ok(empty.indexOf("Claim #1 for") < empty.indexOf('name="lane"'));
  assert.doesNotMatch(empty, /wall-rail|wall-plate/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-N/);

  assert.doesNotMatch(closed, /data-week-window="rolling-7d"/);
  assert.match(closed, /Closed week/);
  assert.match(closed, /wall-rail/);
});
