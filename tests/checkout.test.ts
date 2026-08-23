import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getBoardListings } from "../src/lib/board";
import { currentPeriodMeta } from "../src/lib/period";
import { draftFromOutbidInput, planCheckout } from "../src/lib/listing";
import { BoardStore, defaultBoardStore } from "../src/lib/store";
import { rankListings } from "../src/lib/rank";
import {
  DEFAULT_POLAR_API_BASE,
  isPolarLive,
  polarApiBase,
} from "../src/payments/env";
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
  defaultBoardStore.reset();
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
      bidUsd: 12,
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
    assert.match(source, /polarApiBase/);
    assert.equal(polarApiBase({}), DEFAULT_POLAR_API_BASE);
    assert.equal(
      polarApiBase({ POLAR_API_BASE: "https://sandbox-api.polar.sh/" }),
      "https://sandbox-api.polar.sh",
    );
  } finally {
    if (previousLive === undefined) delete process.env.POLAR_LIVE;
    else process.env.POLAR_LIVE = previousLive;
    if (previousFixture === undefined) delete process.env.POLAR_FIXTURE_ONLY;
    else process.env.POLAR_FIXTURE_ONLY = previousFixture;
  }
});

test("live Polar createCheckout posts to POLAR_API_BASE and does not list unpaid", async () => {
  const previousLive = process.env.POLAR_LIVE;
  const previousFixture = process.env.POLAR_FIXTURE_ONLY;
  process.env.POLAR_LIVE = "1";
  delete process.env.POLAR_FIXTURE_ONLY;
  const store = new BoardStore();
  const calls: { url: string; body: unknown }[] = [];
  const polar = new LivePolarPort({
    env: {
      POLAR_LIVE: "1",
      POLAR_ACCESS_TOKEN: "polar_oat_test",
      POLAR_PRODUCT_ID: "prod_test",
      POLAR_API_BASE: "https://sandbox-api.polar.sh",
    },
    store,
    fetch: async (input, init) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, body });
      if (method === "POST") {
        assert.equal(url, "https://sandbox-api.polar.sh/v1/checkouts/");
        return new Response(
          JSON.stringify({
            id: "chk_live_sandbox",
            url: "https://sandbox.polar.sh/checkout/chk_live_sandbox",
            status: "open",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ id: "chk_live_sandbox", status: "open" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  try {
    const started = await polar.createCheckout({
      amountUsd: 5,
      listingDraft: draft(),
      successUrl: "http://127.0.0.1:3000/return",
    });
    assert.equal(started.checkoutId, "chk_live_sandbox");
    assert.equal(
      started.url,
      "https://sandbox.polar.sh/checkout/chk_live_sandbox",
    );
    assert.equal(calls.length, 1);
    assert.deepEqual((calls[0]?.body as { products: string[] }).products, [
      "prod_test",
    ]);
    assert.equal((calls[0]?.body as { amount: number }).amount, 500);
    assert.equal(store.listPaid("backend", PERIOD).length, 0);
    assert.equal(await polar.completeCheckout(started.checkoutId), null);
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

async function pay(
  polar: FakePolarPort,
  input: {
    identity: string;
    amountUsd: number;
    payerId: string;
    company?: string;
    title?: string;
  },
) {
  const started = await polar.createCheckout({
    amountUsd: input.amountUsd,
    listingDraft: draft({
      ...draftFromOutbidInput({
        identity: input.identity,
        amountUsd: input.amountUsd,
        lane: "backend",
        periodId: PERIOD,
        title: input.title,
        company: input.company,
        payerId: input.payerId,
      }),
    }),
    successUrl: "http://localhost:3000/return",
  });
  const listing = await polar.completeCheckout(started.checkoutId);
  assert.ok(listing);
  return { listing, checkoutId: started.checkoutId, charged: started };
}

test("SPEC raise examples: owner pays the difference, stranger cannot steal it", async () => {
  const store = new BoardStore();
  const polar = new FakePolarPort(store);

  const acme = await pay(polar, {
    identity: "https://jobs.example.com/acme",
    amountUsd: 5,
    payerId: "pay_acme",
    company: "Acme",
    title: "Staff Backend Engineer",
  });
  assert.equal(acme.listing.bidUsd, 5);
  assert.equal(rankListings(store.listPaid("backend", PERIOD))[0]?.company, "Acme");

  const beta = await pay(polar, {
    identity: "https://jobs.example.com/beta",
    amountUsd: 20,
    payerId: "pay_beta",
    company: "Beta",
    title: "Growth Engineer",
  });
  let ranked = rankListings(store.listPaid("backend", PERIOD));
  assert.deepEqual(
    ranked.map((row) => [row.company, row.bidUsd]),
    [
      ["Beta", 20],
      ["Acme", 5],
    ],
  );

  const acmeRaiseDraft = draftFromOutbidInput({
    identity: "https://jobs.example.com/acme",
    amountUsd: 21,
    lane: "backend",
    periodId: PERIOD,
    title: "Staff Backend Engineer",
    company: "Acme",
    payerId: "pay_acme",
  });
  const acmePlan = planCheckout(store, acmeRaiseDraft);
  assert.equal(acmePlan.kind, "raise");
  assert.equal(acmePlan.chargeUsd, 16);

  const acmeRaise = await polar.createCheckout({
    amountUsd: 16,
    listingDraft: acmeRaiseDraft,
    successUrl: "http://localhost:3000/return",
  });
  const raised = await polar.completeCheckout(acmeRaise.checkoutId);
  assert.ok(raised);
  assert.equal(raised.id, acme.listing.id);
  assert.equal(raised.createdAt, acme.listing.createdAt);
  assert.equal(raised.bidUsd, 21);
  assert.equal(raised.paidUsd, 21);

  ranked = rankListings(store.listPaid("backend", PERIOD));
  assert.deepEqual(
    ranked.map((row) => [row.company, row.bidUsd, row.rank]),
    [
      ["Acme", 21, 1],
      ["Beta", 20, 2],
    ],
  );

  const gamma = await pay(polar, {
    identity: "https://jobs.example.com/gamma",
    amountUsd: 21,
    payerId: "pay_gamma",
    company: "Gamma",
    title: "Platform Engineer",
  });
  ranked = rankListings(store.listPaid("backend", PERIOD));
  assert.deepEqual(
    ranked.map((row) => [row.company, row.bidUsd, row.rank]),
    [
      ["Acme", 21, 1],
      ["Gamma", 21, 2],
      ["Beta", 20, 3],
    ],
  );
  assert.equal(ranked[0]?.id, acme.listing.id);
  assert.equal(ranked[1]?.id, gamma.listing.id);
  assert.equal(ranked[2]?.id, beta.listing.id);

  const deltaDraft = draftFromOutbidInput({
    identity: "https://jobs.example.com/acme",
    amountUsd: 22,
    lane: "backend",
    periodId: PERIOD,
    payerId: "pay_delta",
  });
  assert.throws(() => planCheckout(store, deltaDraft, 1), (err: unknown) => {
    assert.ok(err instanceof CheckoutError);
    assert.equal(err.code, "raise_not_owner");
    assert.equal(err.httpStatus, 403);
    return true;
  });
  await assert.rejects(
    () =>
      polar.createCheckout({
        amountUsd: 1,
        listingDraft: deltaDraft,
        successUrl: "http://localhost:3000/return",
      }),
    (err: unknown) => {
      assert.ok(err instanceof CheckoutError);
      assert.equal(err.code, "raise_not_owner");
      return true;
    },
  );

  assert.throws(() => planCheckout(store, deltaDraft), (err: unknown) => {
    assert.ok(err instanceof CheckoutError);
    assert.equal(err.code, "identity_taken");
    assert.equal(err.httpStatus, 409);
    return true;
  });
  await assert.rejects(
    () =>
      polar.createCheckout({
        amountUsd: 22,
        listingDraft: deltaDraft,
        successUrl: "http://localhost:3000/return",
      }),
    (err: unknown) => {
      assert.ok(err instanceof CheckoutError);
      assert.equal(err.code, "identity_taken");
      return true;
    },
  );

  ranked = rankListings(store.listPaid("backend", PERIOD));
  assert.equal(ranked[0]?.id, acme.listing.id);
  assert.equal(ranked[0]?.bidUsd, 21);
  assert.equal(store.listPaid("backend", PERIOD).length, 3);
});

test("owner raise $10 → $15 pays $5 and keeps the same listing id", async () => {
  const store = new BoardStore();
  const polar = new FakePolarPort(store);
  const first = await pay(polar, {
    identity: "acme",
    amountUsd: 10,
    payerId: "pay_acme",
    company: "Acme",
  });

  const raiseDraft = draftFromOutbidInput({
    identity: "acme",
    amountUsd: 15,
    lane: "backend",
    periodId: PERIOD,
    company: "Acme",
    payerId: "pay_acme",
  });
  const plan = planCheckout(store, raiseDraft);
  assert.equal(plan.kind, "raise");
  assert.equal(plan.chargeUsd, 5);

  const started = await polar.createCheckout({
    amountUsd: 5,
    listingDraft: raiseDraft,
    successUrl: "http://localhost:3000/return",
  });
  const raised = await polar.completeCheckout(started.checkoutId);
  assert.ok(raised);
  assert.equal(raised.id, first.listing.id);
  assert.equal(raised.bidUsd, 15);
  assert.equal(raised.paidUsd, 15);
  assert.equal(raised.createdAt, first.listing.createdAt);
  assert.equal(store.listPaid("backend", PERIOD).length, 1);
});

test("raise_too_small when new bid is not at least current + 1", async () => {
  const store = new BoardStore();
  const polar = new FakePolarPort(store);
  await pay(polar, {
    identity: "https://jobs.example.com/acme",
    amountUsd: 10,
    payerId: "pay_acme",
    company: "Acme",
  });

  const sameBid = draftFromOutbidInput({
    identity: "https://jobs.example.com/acme",
    amountUsd: 10,
    lane: "backend",
    periodId: PERIOD,
    payerId: "pay_acme",
  });
  const lowerBid = draftFromOutbidInput({
    identity: "https://jobs.example.com/acme",
    amountUsd: 9,
    lane: "backend",
    periodId: PERIOD,
    payerId: "pay_acme",
  });

  for (const draftBid of [sameBid, lowerBid]) {
    assert.throws(() => planCheckout(store, draftBid), (err: unknown) => {
      assert.ok(err instanceof CheckoutError);
      assert.equal(err.code, "raise_too_small");
      assert.equal(err.httpStatus, 400);
      return true;
    });
    await assert.rejects(
      () =>
        polar.createCheckout({
          amountUsd: 1,
          listingDraft: draftBid,
          successUrl: "http://localhost:3000/return",
        }),
      (err: unknown) => {
        assert.ok(err instanceof CheckoutError);
        assert.equal(err.code, "raise_too_small");
        return true;
      },
    );
  }

  const still = store.listPaid("backend", PERIOD);
  assert.equal(still.length, 1);
  assert.equal(still[0]?.bidUsd, 10);
});

test("stranger paying only the difference is raise_not_owner; original stays #1", async () => {
  const store = new BoardStore();
  const polar = new FakePolarPort(store);
  await pay(polar, {
    identity: "https://jobs.example.com/acme",
    amountUsd: 10,
    payerId: "pay_acme",
    company: "Acme",
  });
  await pay(polar, {
    identity: "https://jobs.example.com/beta",
    amountUsd: 7,
    payerId: "pay_beta",
    company: "Beta",
  });

  const stranger = draftFromOutbidInput({
    identity: "https://jobs.example.com/acme",
    amountUsd: 15,
    lane: "backend",
    periodId: PERIOD,
    payerId: "pay_stranger",
  });
  assert.throws(() => planCheckout(store, stranger, 5), (err: unknown) => {
    assert.ok(err instanceof CheckoutError);
    assert.equal(err.code, "raise_not_owner");
    assert.equal(err.httpStatus, 403);
    return true;
  });
  assert.throws(() => planCheckout(store, stranger), (err: unknown) => {
    assert.ok(err instanceof CheckoutError);
    assert.equal(err.code, "identity_taken");
    assert.equal(err.httpStatus, 409);
    return true;
  });

  const ranked = rankListings(store.listPaid("backend", PERIOD));
  assert.equal(ranked[0]?.company, "Acme");
  assert.equal(ranked[0]?.bidUsd, 10);
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[1]?.company, "Beta");
});

test("different apply URLs on the same host are distinct listings", async () => {
  const store = new BoardStore();
  const polar = new FakePolarPort(store);
  const acme = await pay(polar, {
    identity: "https://jobs.example.com/acme",
    amountUsd: 5,
    payerId: "pay_acme",
    company: "Acme",
  });
  const beta = await pay(polar, {
    identity: "https://jobs.example.com/beta",
    amountUsd: 20,
    payerId: "pay_beta",
    company: "Beta",
  });
  assert.notEqual(acme.listing.id, beta.listing.id);
  assert.notEqual(acme.listing.companyHandle, beta.listing.companyHandle);
  assert.equal(store.listPaid("backend", PERIOD).length, 2);
});

test("same company handle in the same lane + period is a raise", async () => {
  const store = new BoardStore();
  const polar = new FakePolarPort(store);
  const first = await pay(polar, {
    identity: "acme",
    amountUsd: 5,
    payerId: "pay_acme",
    company: "Acme",
  });
  const raiseDraft = draftFromOutbidInput({
    identity: "Acme",
    amountUsd: 8,
    lane: "backend",
    periodId: PERIOD,
    company: "Acme",
    payerId: "pay_acme",
  });
  const plan = planCheckout(store, raiseDraft);
  assert.equal(plan.kind, "raise");
  assert.equal(plan.chargeUsd, 3);
  const started = await polar.createCheckout({
    amountUsd: 3,
    listingDraft: raiseDraft,
    successUrl: "http://localhost:3000/return",
  });
  const raised = await polar.completeCheckout(started.checkoutId);
  assert.ok(raised);
  assert.equal(raised.id, first.listing.id);
  assert.equal(raised.bidUsd, 8);
  assert.equal(raised.paidUsd, 8);
});

test("checkout route charges the raise difference for the owner", async () => {
  defaultBoardStore.reset();
  resetFixtureIds();
  const periodId = currentPeriodMeta().periodId;
  const polar = getPolarPort();
  const first = await polar.createCheckout({
    amountUsd: 5,
    listingDraft: draftFromOutbidInput({
      identity: "https://jobs.example.com/acme",
      amountUsd: 5,
      lane: "backend",
      periodId,
      company: "Acme",
      payerId: "pay_aaaaaaaaaaaaaaaa",
    }),
    successUrl: "http://localhost:3000/return",
  });
  await polar.completeCheckout(first.checkoutId);

  const { POST } = await import("../src/app/checkout/route");
  const body = new URLSearchParams({
    lane: "backend",
    identity: "https://jobs.example.com/acme",
    amount: "8",
    payerId: "pay_aaaaaaaaaaaaaaaa",
  });
  const response = await POST(
    new Request("http://localhost:3000/checkout", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  assert.equal(response.status, 303);
  const location = response.headers.get("location");
  assert.ok(location);
  const checkoutId = new URL(location).searchParams.get("checkoutId");
  assert.ok(checkoutId);
  const checkout = polar.getCheckout(checkoutId);
  assert.equal(checkout?.amountUsd, 3);
  assert.equal(checkout?.listingDraft.bidUsd, 8);

  const raised = await polar.completeCheckout(checkoutId);
  assert.ok(raised);
  assert.equal(raised.bidUsd, 8);
  assert.equal(raised.paidUsd, 8);
  assert.equal(getBoardListings("backend", periodId).length, 1);
  defaultBoardStore.reset();
  resetFixtureIds();
});

test("checkout route rejects a stranger raise with identity_taken", async () => {
  defaultBoardStore.reset();
  resetFixtureIds();
  const periodId = currentPeriodMeta().periodId;
  const polar = getPolarPort();
  const first = await polar.createCheckout({
    amountUsd: 10,
    listingDraft: draftFromOutbidInput({
      identity: "https://jobs.example.com/acme",
      amountUsd: 10,
      lane: "backend",
      periodId,
      company: "Acme",
      payerId: "pay_aaaaaaaaaaaaaaaa",
    }),
    successUrl: "http://localhost:3000/return",
  });
  await polar.completeCheckout(first.checkoutId);

  const { POST } = await import("../src/app/checkout/route");
  const body = new URLSearchParams({
    lane: "backend",
    identity: "https://jobs.example.com/acme",
    amount: "15",
    payerId: "pay_bbbbbbbbbbbbbbbb",
  });
  const response = await POST(
    new Request("http://localhost:3000/checkout", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location") ?? "");
  assert.equal(location.searchParams.get("error"), "identity_taken");
  const listed = getBoardListings("backend", periodId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.bidUsd, 10);
  defaultBoardStore.reset();
  resetFixtureIds();
});
