import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Board } from "../src/components/board/board";
import { Leaderboard } from "../src/components/board/leaderboard";
import { ListingCard } from "../src/components/board/listing-card";
import { getBoardListings, parseLane } from "../src/lib/board";
import { rankListings } from "../src/lib/rank";
import { FUNCTION_LANES } from "../src/lib/types";
import { fixtureListing, specTieRows } from "./fixtures/listings";

test("empty input stays empty", () => {
  assert.deepEqual(rankListings([]), []);
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
  assert.doesNotMatch(html, /data-listing-card/);
  assert.doesNotMatch(html, /Acme|Beta|Gamma|competitive salary/i);
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
  assert.doesNotMatch(html, /\$0|competitive/i);
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
