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
  assert.match(html, /Pay \$5 to list/);
  assert.doesNotMatch(html, /data-listing-card/);
  assert.doesNotMatch(html, /Acme|Beta|Gamma|competitive salary/i);
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
  assert.match(html, /data-lane-empty="true"/);
  assert.match(html, /data-empty-bay-list=""/);
  assert.match(html, /\$5 takes #1/);
  assert.match(html, />Outbid</);
  assert.match(html, /Nobody is invented here/);
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
  assert.doesNotMatch(html, /after Apply/);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-apply-after-list-first/);
  assert.doesNotMatch(html, /data-apply-after-list-two/);
  assert.doesNotMatch(html, /data-apply-after-list-three/);
  assert.doesNotMatch(html, /data-apply-after-list-four/);
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
  const identityMark = html.indexOf("data-empty-identity");
  const identityFirst = html.indexOf("data-empty-identity-first");
  const label = html.indexOf("identity-label");
  const identity = html.indexOf('name="identity"');
  const claimTitle = html.indexOf("Claim #1 for");
  const amount = html.indexOf('name="amount"');
  const outbid = html.indexOf(">Outbid<");
  const about = html.indexOf("Function lanes");
  assert.ok(claim >= 0 && stamp > claim);
  assert.ok(identityMark > stamp && identityFirst >= identityMark);
  assert.ok(label > identityMark && identity > label);
  assert.ok(claimTitle > identity && amount > claimTitle && outbid > amount);
  assert.ok(about >= 0 && stamp > about);
  assert.match(html, /data-empty-bay-list=""/);
  assert.match(html, /data-empty-identity=""/);
  assert.match(html, /data-empty-identity-first=""/);
  assert.match(html, /htmlFor="identity"|for="identity"/);
  assert.match(html, /autofocus/i);
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
  assert.doesNotMatch(html, /after Apply/);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-apply-after-list-first/);
  assert.doesNotMatch(html, /data-apply-after-list-two/);
  assert.doesNotMatch(html, /data-apply-after-list-three/);
  assert.doesNotMatch(html, /data-apply-after-list-four/);
  assert.doesNotMatch(html, /star rating|chat|discord/i);
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
  assert.match(html, />Outbid</);
  assert.match(html, /Already on this lane/);
  assert.match(html, /Paying less than #1/);
  assert.match(html, /name="identity"/);
  assert.doesNotMatch(html, /data-empty-lane/);
  assert.doesNotMatch(html, /data-empty-bay-list/);
  assert.doesNotMatch(html, /data-empty-identity/);
  assert.doesNotMatch(html, /data-empty-identity-first/);
  assert.doesNotMatch(html, /identity-label/);
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
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
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
  const listAfter = html.indexOf("data-list-after-apply");
  const listFirst = html.indexOf("data-list-after-apply-first");
  const listTwo = html.indexOf("data-list-after-apply-two");
  const listThree = html.indexOf("data-list-after-apply-three");
  const listFour = html.indexOf("data-list-after-apply-four");
  const bid = html.indexOf("data-bid");
  assert.ok(title >= 0 && company > title && apply > company && bid > apply);
  assert.ok(firstClick > company && firstClick < apply);
  assert.ok(afterListFirst > firstClick && afterListFirst < apply);
  assert.ok(afterListTwo > afterListFirst && afterListTwo < apply);
  assert.ok(afterListThree > afterListTwo && afterListThree < apply);
  assert.ok(afterListFour > afterListThree && afterListFour < apply);
  assert.ok(
    listAfter > apply &&
      listFirst >= listAfter &&
      listTwo >= listFirst &&
      listThree >= listTwo &&
      listFour >= listThree &&
      bid > listFour,
  );
  assert.match(html, /class="sheet-apply"/);
  assert.doesNotMatch(html, /sheet-head/);
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
  const stamp = html.indexOf("List a role");
  const claimTitle = html.indexOf("Claim #1 for");
  const outbid = html.indexOf(">Outbid<");
  const later = html.indexOf('data-listing-id="lst_gamma"');
  assert.ok(claim >= 0 && listRole > claim && stamp > claim);
  assert.ok(claimTitle > stamp && outbid > claimTitle);
  assert.ok(take > outbid && applyLive > take);
  assert.ok(later > applyLive);
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
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.equal((html.match(/data-list-role="employer"/g) ?? []).length, 1);
  assert.equal((html.match(/List a role/g) ?? []).length, 3);
  assert.doesNotMatch(html.slice(later), /data-list-role|List a role|data-list-after-apply/);
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
  assert.match(html, /\$21/);
  assert.match(html, /Claim #1 for/);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-take-apply|data-apply-live|data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four/,
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
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf("data-list-after-apply");
  const listFirst = html.indexOf("data-list-after-apply-first");
  const listTwo = html.indexOf("data-list-after-apply-two");
  const listThree = html.indexOf("data-list-after-apply-three");
  const listFour = html.indexOf("data-list-after-apply-four");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const laterStamp = html.indexOf("data-later-apply");
  assert.ok(listRole >= 0 && occupiedIdentity > listRole);
  assert.ok(take > occupiedIdentity && afterIdentity > take);
  assert.ok(applyLive > afterIdentity && firstClick > applyLive);
  assert.ok(afterListFirst > firstClick && afterListTwo > afterListFirst);
  assert.ok(afterListThree > afterListTwo && afterListFour > afterListThree);
  assert.ok(apply > afterListFour && bid > apply);
  assert.ok(
    listAfter > apply &&
      listFirst >= listAfter &&
      listTwo >= listFirst &&
      listThree >= listTwo &&
      listFour >= listThree &&
      bid > listFour,
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
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-empty-identity-first/);
  assert.doesNotMatch(html, /identity-label/);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-identity|data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four/,
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
  const apply = html.indexOf(">Apply<");
  const bid = html.indexOf("data-bid");
  assert.ok(stamp >= 0 && hop > stamp && apply > hop && bid > apply);
  assert.match(html, /data-rank="2"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.match(html, />Apply</);
  assert.match(html, /href="\/out\/lst_gamma"/);
  assert.match(html, /class="apply"/);
  assert.match(html, /class="sheet-apply"/);
  assert.doesNotMatch(html, /data-take-apply/);
  assert.doesNotMatch(html, /data-apply-live/);
  assert.doesNotMatch(html, /data-apply-after-identity/);
  assert.doesNotMatch(html, /data-first-click="apply"/);
  assert.doesNotMatch(html, /data-apply-after-list-first/);
  assert.doesNotMatch(html, /data-apply-after-list-two/);
  assert.doesNotMatch(html, /data-apply-after-list-three/);
  assert.doesNotMatch(html, /data-apply-after-list-four/);
  assert.doesNotMatch(html, /data-list-after-apply/);
  assert.doesNotMatch(html, /data-list-after-apply-first/);
  assert.doesNotMatch(html, /data-list-after-apply-two/);
  assert.doesNotMatch(html, /data-list-after-apply-three/);
  assert.doesNotMatch(html, /data-list-after-apply-four/);
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
  const laterHref = html.indexOf('href="/out/lst_gamma"');
  const lastHref = html.indexOf('href="/out/lst_beta"');
  const listRole = html.indexOf('data-list-role="employer"');
  const listAfter = html.indexOf("data-list-after-apply");
  assert.ok(take >= 0 && applyLive > take && later > applyLive);
  assert.ok(listAfter > applyLive && later > listAfter);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(laterHref > later && last > later && lastHref > last);
  assert.ok(listRole >= 0 && laterStamp > listRole);
  assert.match(html, /data-period-live="true"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
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
  assert.equal((html.match(/data-apply-later/g) ?? []).length, 2);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.doesNotMatch(html.slice(0, later), /data-later-apply|data-apply-later/);
  assert.doesNotMatch(
    html.slice(later),
    /data-take-apply|data-apply-live|data-apply-after-identity|data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four/,
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
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
  const hopHref = html.indexOf('href="#claim"');
  const afterCopy = html.indexOf("after Apply");
  const bid = html.indexOf('data-bid=""');
  const later = html.indexOf('data-listing-id="lst_gamma"');
  const claim = html.indexOf('id="claim"');
  const listRole = html.indexOf('data-list-role="employer"');
  assert.ok(take >= 0 && afterIdentity > take && applyLive > afterIdentity);
  assert.ok(firstClick > applyLive && afterListFirst > firstClick);
  assert.ok(afterListTwo > afterListFirst && afterListThree > afterListTwo);
  assert.ok(afterListFour > afterListThree && apply > afterListFour && listAfter > apply);
  assert.ok(listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listFour && bid > afterCopy && later > bid);
  assert.ok(claim >= 0 && listRole > claim && take > listRole);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
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
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-empty-bay-list/);
  assert.doesNotMatch(html, /data-empty-identity-first/);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|after Apply|data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four/,
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
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
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
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(apply > afterListFour && listAfter > apply);
  assert.ok(listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listFour && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later);
  assert.ok(claim >= 0 && listRole > claim && take > listRole);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /data-apply-after-identity=""/);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
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
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|after Apply/,
  );
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
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
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
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
  assert.ok(listAfter > apply);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree);
  assert.ok(afterCopy > listFour && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later);
  assert.ok(claim >= 0 && listRole > claim && firstClick > listRole);
  assert.match(html, /data-list-after-apply=""/);
  assert.match(html, /data-list-after-apply-first=""/);
  assert.match(html, /data-list-after-apply-two=""/);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /Paying less than #1 still lists/);
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /href="\/out\/lst_acme"/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|after Apply|data-first-click="apply"|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
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
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
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
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listFour && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick > listRole);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
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
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-first-click="apply"|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|after Apply/,
  );
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
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
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
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
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree);
  assert.ok(Math.abs(listTwo - listAfter) < 120);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listFour && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick > listRole);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
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
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply-four|data-list-after-apply-three|data-list-after-apply-two|data-list-after-apply-first|data-list-after-apply|after Apply|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-first-click="apply"/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
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
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
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
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(Math.abs(afterListTwo - afterListFirst) < 80);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst && listThree >= listTwo && listFour >= listThree);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listFour && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick > listRole);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-four=""/);
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
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-list-two|data-apply-after-list-first|data-apply-after-list-three|data-apply-after-list-four|data-first-click="apply"|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|after Apply/,
  );
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
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
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
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
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree);
  assert.ok(Math.abs(listThree - listAfter) < 160);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listFour && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick > listRole);
  assert.match(html, /data-list-after-apply-three=""/);
  assert.match(html, /data-list-after-apply-four=""/);
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
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-list-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply-four|data-list-after-apply-three|data-list-after-apply-two|data-list-after-apply-first|data-list-after-apply|after Apply|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-first-click="apply"/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
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
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
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
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(Math.abs(afterListThree - afterListTwo) < 80);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listFour && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick > listRole);
  assert.match(html, /data-apply-after-list-three=""/);
  assert.match(html, /data-apply-after-list-two=""/);
  assert.match(html, /data-apply-after-list-first=""/);
  assert.match(html, /data-apply-after-list-four=""/);
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
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-first=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-two=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-three=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-list-after-apply-four=""/g) ?? []).length, 1);
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-list-three|data-apply-after-list-two|data-apply-after-list-first|data-apply-after-list-four|data-first-click="apply"|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|after Apply/,
  );
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
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
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
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
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree);
  assert.ok(Math.abs(listFour - listAfter) < 200);
  assert.ok(Math.abs(listFour - listThree) < 80);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listFour && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick > listRole);
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
  assert.match(html, /data-first-click="apply"/);
  assert.match(html, /data-apply-live=""/);
  assert.match(html, /class="apply"[^>]*href="\/out\/lst_acme"/);
  assert.match(html, />Apply</);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
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
  assert.equal((html.match(/data-first-click="apply"/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-list-after-apply-four|data-list-after-apply-three|data-list-after-apply-two|data-list-after-apply-first|data-list-after-apply|after Apply|data-apply-after-list-first|data-apply-after-list-two|data-apply-after-list-three|data-apply-after-list-four|data-first-click="apply"/,
  );
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
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
  const applyHref = html.indexOf('href="/out/lst_acme"');
  const apply = html.indexOf(">Apply<");
  const listAfter = html.indexOf('data-list-after-apply=""');
  const listFirst = html.indexOf('data-list-after-apply-first=""');
  const listTwo = html.indexOf('data-list-after-apply-two=""');
  const listThree = html.indexOf('data-list-after-apply-three=""');
  const listFour = html.indexOf('data-list-after-apply-four=""');
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
  assert.ok(applyHref >= 0 && applyHref < firstClick);
  assert.ok(Math.abs(afterListFour - afterListThree) < 80);
  assert.ok(listAfter > apply && listFirst >= listAfter && listTwo >= listFirst);
  assert.ok(listThree >= listTwo && listFour >= listThree);
  assert.ok(hopHref > apply && hopHref < bid && listAfter < bid);
  assert.ok(afterCopy > listFour && bid > afterCopy && later > bid);
  assert.ok(laterStamp > later && laterHop > laterStamp);
  assert.ok(claim >= 0 && listRole > claim && firstClick > listRole);
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
  assert.match(html, /class="list-after-apply"[^>]*href="#claim"/);
  assert.match(html, />List a role</);
  assert.match(html, /after Apply/);
  assert.match(html, /data-list-role="employer"/);
  assert.match(html, /data-later-apply=""/);
  assert.match(html, /data-apply-later=""/);
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
  assert.equal((html.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-after-identity=""/g) ?? []).length, 1);
  assert.equal((html.match(/data-take-apply/g) ?? []).length, 1);
  assert.equal((html.match(/data-apply-live/g) ?? []).length, 1);
  assert.equal((html.match(/name="identity"/g) ?? []).length, 1);
  assert.doesNotMatch(
    html.slice(later),
    /data-apply-after-list-four|data-apply-after-list-three|data-apply-after-list-two|data-apply-after-list-first|data-first-click="apply"|data-list-after-apply|data-list-after-apply-first|data-list-after-apply-two|data-list-after-apply-three|data-list-after-apply-four|after Apply/,
  );
  assert.doesNotMatch(laterCard, /data-apply-after-list-four/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-three/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-two/);
  assert.doesNotMatch(laterCard, /data-apply-after-list-first/);
  assert.doesNotMatch(laterCard, /data-first-click="apply"/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-first/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-two/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-three/);
  assert.doesNotMatch(laterCard, /data-list-after-apply-four/);
  assert.doesNotMatch(laterCard, /data-list-after-apply/);
  assert.match(laterCard, /data-apply-later=""/);
  assert.match(empty, /data-empty-bay-list=""/);
  assert.match(empty, /data-empty-identity-first=""/);
  assert.doesNotMatch(empty, /data-apply-after-list-four/);
  assert.doesNotMatch(empty, /data-apply-after-list-three/);
  assert.doesNotMatch(empty, /data-apply-after-list-two/);
  assert.doesNotMatch(empty, /data-apply-after-list-first/);
  assert.doesNotMatch(empty, /data-first-click="apply"/);
  assert.doesNotMatch(empty, /data-list-after-apply-first/);
  assert.doesNotMatch(empty, /data-list-after-apply-two/);
  assert.doesNotMatch(empty, /data-list-after-apply-three/);
  assert.doesNotMatch(empty, /data-list-after-apply-four/);
  assert.doesNotMatch(empty, /data-list-after-apply/);
  assert.doesNotMatch(empty, /after Apply/);
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
