import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getBoardListings } from "../src/lib/board";
import { currentPeriodMeta } from "../src/lib/period";
import {
  draftFromOutbidInput,
  parseSalaryBand,
  planCheckout,
  resolveListingIdentity,
} from "../src/lib/listing";
import { BoardStore, defaultBoardStore } from "../src/lib/store";
import { rankListings } from "../src/lib/rank";
import { getPaymentMode, isPolarLive } from "../src/payments/env";
import { FakePolarPort, resetFixtureIds } from "../src/payments/fixture";
import {
  CheckoutError,
  getPolarPort,
  handleCheckoutReturn,
  parseBidUsd,
} from "../src/payments/port";
import { LiveWaffoPort } from "../src/payments/waffo";

const PERIOD = "2026-W34";

if (!process.env.WAFFO_MODE) process.env.WAFFO_MODE = "fixture";

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

test("open Polar checkout does not occupy #1 until paid", async () => {
  const store = new BoardStore();
  const polar = new FakePolarPort(store);
  const started = await polar.createCheckout({
    amountUsd: 5,
    listingDraft: draft({ company: "Ghost", companyHandle: "ghost" }),
    successUrl: "http://localhost:3000/return",
  });

  assert.equal(polar.getCheckout(started.checkoutId)?.status, "open");
  assert.deepEqual(store.listPaid("backend", PERIOD), []);
  assert.deepEqual(rankListings(store.listPaid("backend", PERIOD)), []);
  assert.deepEqual(getBoardListings("backend", PERIOD), []);

  store.insertPaid({
    id: "lst_unpaid_seed",
    periodId: PERIOD,
    lane: "backend",
    title: "Unpaid Staff Engineer",
    company: "Ghost",
    companyHandle: "ghost-unpaid",
    applyUrl: "https://jobs.example.com/ghost-unpaid",
    salary: null,
    bidUsd: 50_000,
    paidUsd: 0,
    clicks: 0,
    createdAt: "2026-08-17T08:00:00.000Z",
    updatedAt: "2026-08-17T08:00:00.000Z",
  });
  assert.deepEqual(store.listPaid("backend", PERIOD), []);
  assert.deepEqual(rankListings(store.listPaid("backend", PERIOD)), []);
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

test("retired Polar flags can never select a provider", () => {
  assert.equal(isPolarLive({ POLAR_LIVE: "1" }), false);
  assert.throws(() => getPaymentMode({}), /BLOCKED-CONFIG: WAFFO_MODE/);
});

test("retired Polar module is inert", () => {
  assert.equal(isPolarLive({ POLAR_LIVE: "1" }), false);
});

test("Waffo mode is the sole provider selector", () => {
  const inheritedPolar = {
    POLAR_LIVE: "1",
    POLAR_ACCESS_TOKEN: "legacy-access-token",
    POLAR_WEBHOOK_SECRET: "legacy-webhook-secret",
    POLAR_PRODUCT_ID: "legacy-product",
    POLAR_API_BASE: "https://legacy.polar.invalid",
    POLAR_SUCCESS_URL: "https://legacy.example/return",
    POLAR_FIXTURE_ONLY: "1",
  };
  assert.equal(getPaymentMode({ WAFFO_MODE: "fixture", ...inheritedPolar }), "fixture");
  assert.equal(isPolarLive(inheritedPolar), false);
});

test("Waffo checkout requires explicit validated production configuration", async () => {
  assert.throws(() => getPaymentMode({ WAFFO_LIVE: "1" }), /BLOCKED-CONFIG: WAFFO_MODE/);
  assert.throws(() => new LiveWaffoPort({ env: { WAFFO_MODE: "waffo-prod" }, fetch: async () => new Response() }), /BLOCKED-CONFIG/);
});

test("checkout preparation resolves one live shortener hop before storing identity", async () => {
  let calls = 0;
  const identity = await resolveListingIdentity("https://bit.ly/acme-backend", {
    env: { WAFFO_MODE: "waffo-test" },
    fetchImpl: async (_input, init) => {
      calls += 1;
      assert.equal(init.method, "HEAD");
      assert.equal(init.redirect, "manual");
      return {
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "location"
              ? "https://jobs.example.com/acme?utm_source=checkout"
              : null,
        },
      };
    },
  });
  assert.equal(identity, "https://jobs.example.com/acme");
  assert.equal(calls, 1);

  const draftFromResolved = draftFromOutbidInput({
    identity,
    amountUsd: 5,
    lane: "backend",
    periodId: PERIOD,
    company: "Acme",
  });
  const plan = planCheckout(new BoardStore(), draftFromResolved);
  assert.equal(plan.kind, "create");
  assert.equal(plan.draft.applyUrl, "https://jobs.example.com/acme");
});

test("Polar checkout path is retired", async () => {
  assert.equal(isPolarLive({ POLAR_LIVE: "1" }), false);
});

test("/return markup shows pending or cancel without claiming payment", async () => {
  const { default: ReturnPage } = await import("../src/app/return/page");
  const successHtml = renderToStaticMarkup(
    await ReturnPage({
      searchParams: Promise.resolve({ checkoutId: "missing" }),
    }),
  );
  assert.match(successHtml, /data-return="pending"/);
  assert.match(successHtml, /Payment pending/i);
  assert.doesNotMatch(successHtml, /Payment completed/i);
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

test("/checkout/complete is intent-keyed, read-only, and truthful across refresh", async () => {
  const { default: CheckoutCompletePage } = await import("../src/app/checkout/complete/page");
  const polar = getPolarPort();
  const started = await polar.createCheckout({
    amountUsd: 5,
    listingDraft: draft({ company: "Pending", companyHandle: "pending", applyUrl: "https://jobs.example.com/pending" }),
    successUrl: "http://localhost:3000/return",
  });
  assert.ok(started.intentId);

  const pendingHtml = renderToStaticMarkup(await CheckoutCompletePage({
    searchParams: Promise.resolve({ intent: started.intentId }),
  }));
  assert.match(pendingHtml, /data-complete-state="pending"/);
  assert.match(pendingHtml, /Payment pending/);
  assert.doesNotMatch(pendingHtml, /Payment received/);
  assert.equal(polar.getCheckout(started.checkoutId)?.status, "open");

  const listing = await polar.completeCheckout(started.checkoutId);
  assert.ok(listing);
  const paidHtml = renderToStaticMarkup(await CheckoutCompletePage({
    searchParams: Promise.resolve({ intent: started.intentId }),
  }));
  assert.match(paidHtml, /data-complete-state="paid"/);
  assert.match(paidHtml, /Payment received/);
  assert.match(paidHtml, /Pending is listed at \$5/);

  const unknownHtml = renderToStaticMarkup(await CheckoutCompletePage({
    searchParams: Promise.resolve({ intent: "intent_missing" }),
  }));
  assert.match(unknownHtml, /data-complete-state="unknown"/);
  assert.match(unknownHtml, /could not confirm/i);
  assert.doesNotMatch(unknownHtml, /Payment received/);

  const abandoned = await polar.createCheckout({
    amountUsd: 5,
    listingDraft: draft({ company: "Abandoned", companyHandle: "abandoned", applyUrl: "https://jobs.example.com/abandoned" }),
    successUrl: "http://localhost:3000/return",
  });
  assert.ok(abandoned.intentId);
  await polar.abandonCheckout(abandoned.checkoutId);
  const failedHtml = renderToStaticMarkup(await CheckoutCompletePage({
    searchParams: Promise.resolve({ intent: abandoned.intentId }),
  }));
  assert.match(failedHtml, /data-complete-state="failed"/);
  assert.match(failedHtml, /No rank claimed/);
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

test("optional salary requires both annual USD bounds and preserves null", () => {
  assert.equal(parseSalaryBand("", ""), null);
  assert.deepEqual(parseSalaryBand("120000", "160000"), {
    minUsd: 120_000,
    maxUsd: 160_000,
  });
  for (const [min, max] of [["120000", ""], ["160000", "120000"], ["$120000", "160000"]]) {
    assert.throws(
      () => parseSalaryBand(min, max),
      (error: unknown) => error instanceof CheckoutError && error.code === "salary_invalid",
    );
  }
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
    title: "Staff Backend Engineer",
    company: "Acme",
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

test("checkout POST rejects an unknown lane instead of charging backend", async () => {
  defaultBoardStore.reset();
  resetFixtureIds();
  const { POST } = await import("../src/app/checkout/route");
  const body = new URLSearchParams({
    lane: "not-a-lane",
    identity: "https://jobs.example.com/invalid-lane",
    amount: "5",
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
  assert.equal(location.searchParams.get("error"), "invalid_lane");
  assert.equal(location.searchParams.get("lane"), "backend");
  assert.deepEqual(getBoardListings("backend", currentPeriodMeta().periodId), []);
});

test("checkout POST rejects a role without title or company fields", async () => {
  defaultBoardStore.reset();
  resetFixtureIds();
  const { POST } = await import("../src/app/checkout/route");
  const body = new URLSearchParams({
    lane: "backend",
    identity: "https://jobs.example.com/missing-role-fields",
    amount: "5",
  });
  const response = await POST(
    new Request("http://localhost:3000/checkout", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  const location = new URL(response.headers.get("location") ?? "");
  assert.equal(response.status, 303);
  assert.equal(location.searchParams.get("error"), "invalid_listing");
  assert.deepEqual(getBoardListings("backend", currentPeriodMeta().periodId), []);
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
    title: "Staff Backend Engineer",
    company: "Acme",
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

test("raise still hits the same listing across an audit weekId while inside the rolling 7 days", () => {
  const store = new BoardStore();
  const sunday = new Date("2026-08-16T23:00:00.000Z");
  store.insertPaid({
    id: "lst_sunday",
    periodId: "2026-W33",
    lane: "backend",
    title: "Staff Backend Engineer",
    company: "Acme",
    companyHandle: "acme",
    applyUrl: "https://jobs.example.com/acme",
    salary: null,
    bidUsd: 5,
    paidUsd: 5,
    clicks: 0,
    createdAt: sunday.toISOString(),
    updatedAt: sunday.toISOString(),
    payerId: "pay_acme",
  });
  const monday = new Date("2026-08-17T00:01:00.000Z");
  const raiseDraft = draftFromOutbidInput({
    identity: "https://jobs.example.com/acme",
    amountUsd: 8,
    lane: "backend",
    periodId: "2026-W34",
    company: "Acme",
    payerId: "pay_acme",
  });
  const plan = planCheckout(store, raiseDraft, undefined, monday);
  assert.equal(plan.kind, "raise");
  assert.equal(plan.chargeUsd, 3);
  if (plan.kind === "raise") {
    assert.equal(plan.existing.id, "lst_sunday");
    assert.equal(plan.existing.periodId, "2026-W33");
  }

  const expired = new Date("2026-08-23T23:00:00.001Z");
  const fresh = planCheckout(store, raiseDraft, undefined, expired);
  assert.equal(fresh.kind, "create");
  assert.equal(fresh.chargeUsd, 8);
});
