import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getBoardListings } from "../src/lib/board";
import { draftFromOutbidInput } from "../src/lib/listing";
import { BoardStore } from "../src/lib/store";
import { rankListings } from "../src/lib/rank";
import { isPolarLive } from "../src/payments/env";
import { FakePolarPort, resetFixtureIds } from "../src/payments/fixture";
import { LivePolarPort } from "../src/payments/polar";
import {
  CheckoutError,
  getPolarPort,
  handleCheckoutReturn,
  parseBidUsd,
} from "../src/payments/port";

const PERIOD = "2026-W34";

afterEach(() => {
  resetFixtureIds();
});

function draft(overrides: Partial<ReturnType<typeof draftFromOutbidInput>> = {}) {
  return {
    ...draftFromOutbidInput({
      identity: "https://jobs.example.com/acme",
      amountUsd: 5,
      lane: "backend",
      periodId: PERIOD,
      title: "Staff Backend Engineer",
      company: "Acme",
    }),
    ...overrides,
  };
}

test("fixture $5 new listing appears after fake pay", async () => {
  const store = new BoardStore();
  const polar = new FakePolarPort(store);
  const started = await polar.createCheckout({
    amountUsd: 5,
    listingDraft: draft(),
    successUrl: "http://localhost:3000/return",
  });

  assert.equal(store.listPaid("backend", PERIOD).length, 0);

  const listing = await polar.completeCheckout(started.checkoutId);
  assert.ok(listing);
  assert.equal(listing.bidUsd, 5);
  assert.equal(listing.paidUsd, 5);
  assert.equal(listing.company, "Acme");
  assert.equal(listing.salary, null);

  const ranked = rankListings(store.listPaid("backend", PERIOD));
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.bidUsd, 5);
  assert.equal(ranked[0]?.id, listing.id);
});

test("abandoned checkout does not list", async () => {
  const store = new BoardStore();
  const polar = new FakePolarPort(store);
  const started = await polar.createCheckout({
    amountUsd: 5,
    listingDraft: draft({ company: "Ghost", companyHandle: "ghost" }),
    successUrl: "http://localhost:3000/return",
  });

  await polar.abandonCheckout(started.checkoutId);
  assert.equal(await polar.completeCheckout(started.checkoutId), null);
  assert.deepEqual(store.listPaid("backend", PERIOD), []);
  assert.equal(polar.getCheckout(started.checkoutId)?.status, "abandoned");
});

test("handleCheckoutReturn pays on success and not on cancel", async () => {
  const store = new BoardStore();
  const polar = new FakePolarPort(store);
  const paid = await polar.createCheckout({
    amountUsd: 5,
    listingDraft: draft(),
    successUrl: "http://localhost:3000/return",
  });
  const canceled = await polar.createCheckout({
    amountUsd: 12,
    listingDraft: draft({
      company: "Beta",
      companyHandle: "beta",
      applyUrl: "https://jobs.example.com/beta",
    }),
    successUrl: "http://localhost:3000/return",
  });

  const success = await handleCheckoutReturn(
    { checkoutId: paid.checkoutId },
    polar,
  );
  assert.equal(success.status, "success");
  assert.equal(success.listing?.bidUsd, 5);

  const cancel = await handleCheckoutReturn(
    { checkoutId: canceled.checkoutId, status: "cancel" },
    polar,
  );
  assert.equal(cancel.status, "cancel");
  assert.equal(cancel.listing, null);
  assert.equal(store.listPaid("backend", PERIOD).length, 1);
  assert.equal(store.listPaid("backend", PERIOD)[0]?.company, "Acme");
});

test("shared fixture port keeps checkout across getPolarPort calls", async () => {
  const { defaultBoardStore } = await import("../src/lib/store");
  defaultBoardStore.reset();
  resetFixtureIds();
  const first = getPolarPort();
  const started = await first.createCheckout({
    amountUsd: 5,
    listingDraft: draft({
      company: "Shared",
      companyHandle: "shared",
      applyUrl: "https://jobs.example.com/shared",
    }),
    successUrl: "http://localhost:3000/return",
  });
  const second = getPolarPort();
  const listing = await second.completeCheckout(started.checkoutId);
  assert.ok(listing);
  assert.equal(listing.company, "Shared");
  assert.equal(getBoardListings("backend", PERIOD).length, 1);
  defaultBoardStore.reset();
  resetFixtureIds();
});

test("POLAR_FIXTURE_ONLY=1 wins over POLAR_LIVE=1", () => {
  assert.equal(
    isPolarLive({ POLAR_LIVE: "1", POLAR_FIXTURE_ONLY: "1" }),
    false,
  );
  assert.equal(isPolarLive({ POLAR_LIVE: "1" }), true);
  assert.equal(isPolarLive({ POLAR_FIXTURE_ONLY: "1" }), false);
  assert.equal(isPolarLive({}), false);

  const previousLive = process.env.POLAR_LIVE;
  const previousFixture = process.env.POLAR_FIXTURE_ONLY;
  process.env.POLAR_LIVE = "1";
  process.env.POLAR_FIXTURE_ONLY = "1";
  try {
    assert.equal(getPolarPort() instanceof FakePolarPort, true);
    assert.throws(() => new LivePolarPort(), /env-gated|BLOCKED-SECRET/);
  } finally {
    if (previousLive === undefined) delete process.env.POLAR_LIVE;
    else process.env.POLAR_LIVE = previousLive;
    if (previousFixture === undefined) delete process.env.POLAR_FIXTURE_ONLY;
    else process.env.POLAR_FIXTURE_ONLY = previousFixture;
  }
});

test("live Polar module is unused unless POLAR_LIVE=1", () => {
  const previousLive = process.env.POLAR_LIVE;
  const previousFixture = process.env.POLAR_FIXTURE_ONLY;
  delete process.env.POLAR_LIVE;
  process.env.POLAR_FIXTURE_ONLY = "1";
  try {
    assert.equal(isPolarLive(), false);
    assert.throws(() => new LivePolarPort(), /env-gated/);
    const source = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../src/payments/polar.ts"),
      "utf8",
    ) as string;
    assert.match(source, /unused in tests and CI/);
    assert.doesNotMatch(source, /fetch\(/);
    assert.doesNotMatch(source, /polar\.sh/);
  } finally {
    if (previousLive === undefined) delete process.env.POLAR_LIVE;
    else process.env.POLAR_LIVE = previousLive;
    if (previousFixture === undefined) delete process.env.POLAR_FIXTURE_ONLY;
    else process.env.POLAR_FIXTURE_ONLY = previousFixture;
  }
});

test("/return markup shows success or cancel", async () => {
  const { default: ReturnPage } = await import("../src/app/return/page");
  const successHtml = renderToStaticMarkup(
    await ReturnPage({
      searchParams: Promise.resolve({ checkoutId: "missing" }),
    }),
  );
  assert.match(successHtml, /data-return="success"/);
  assert.match(successHtml, /on the board/i);
  assert.match(successHtml, /Back to the board/);

  const cancelHtml = renderToStaticMarkup(
    await ReturnPage({
      searchParams: Promise.resolve({
        checkoutId: "missing",
        status: "cancel",
      }),
    }),
  );
  assert.match(cancelHtml, /data-return="cancel"/);
  assert.match(cancelHtml, /No rank claimed/);
  assert.match(cancelHtml, /does not list/);
});

test("parseBidUsd enforces whole dollars and SPEC min/max", () => {
  assert.equal(parseBidUsd("5"), 5);
  assert.throws(() => parseBidUsd("4.5"), (err: unknown) => {
    assert.ok(err instanceof CheckoutError);
    assert.equal(err.code, "invalid_bid");
    return true;
  });
  assert.throws(() => parseBidUsd("4"), (err: unknown) => {
    assert.ok(err instanceof CheckoutError);
    assert.equal(err.code, "bid_below_min");
    return true;
  });
  assert.throws(() => parseBidUsd("50001"), (err: unknown) => {
    assert.ok(err instanceof CheckoutError);
    assert.equal(err.code, "bid_above_max");
    return true;
  });
});

test("default board store stays empty without a paid checkout", () => {
  assert.deepEqual(getBoardListings("backend", PERIOD), []);
});
