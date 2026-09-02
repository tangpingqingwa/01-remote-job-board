import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ListingCard } from "../src/components/board/listing-card";
import {
  draftFromOutbidInput,
  listingApplyUrl,
  planCheckout,
} from "../src/lib/listing";
import { rankListings } from "../src/lib/rank";
import { BoardStore } from "../src/lib/store";
import {
  canonicalizeApplyUrl,
  isLiveUrlResolveEnabled,
  outboundApplyUrl,
  resolveShortenerHop,
  UrlError,
} from "../src/lib/urls";
import { FakePolarPort, resetFixtureIds } from "../src/payments/fixture";
import { CheckoutError } from "../src/payments/port";
import { fixtureListing } from "./fixtures/listings";

const PERIOD = "2026-W34";

/** Tests never hit the network. Documented shorteners resolve via this map. */
const SHORTENER_FIXTURES: Readonly<Record<string, string>> = {
  "https://bit.ly/acme-backend":
    "https://jobs.example.com/acme?utm_source=bitly&fbclid=1#top",
  "https://t.co/acme": "https://Jobs.Example.com:443/acme/",
  "https://tinyurl.com/chat-job": "https://t.me/acmejobs",
  "https://lnkd.in/nsfw-job": "https://onlyfans.com/creator",
  "https://bit.ly/still-short": "https://t.co/still-short",
};

function fixtureResolver(shortUrl: string): string {
  const target = SHORTENER_FIXTURES[shortUrl];
  if (!target) {
    throw new UrlError("shortener_unresolved", "shortener could not be resolved");
  }
  return target;
}

function assertUrlError(raw: string, code: UrlError["code"]) {
  assert.throws(() => canonicalizeApplyUrl(raw), (error: unknown) => {
    assert.ok(error instanceof UrlError);
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, 422);
    return true;
  });
}

afterEach(() => {
  resetFixtureIds();
});

test("SPEC §6: strip query, fragment, tracking; normalize host/port/slash", () => {
  assert.equal(
    canonicalizeApplyUrl(
      "https://Jobs.Example.com:443/acme/?utm_source=x&utm_campaign=ad&ref=tw&fbclid=1&gclid=2#frag",
    ),
    "https://jobs.example.com/acme",
  );
  assert.equal(
    canonicalizeApplyUrl("https://jobs.example.com/acme?affiliate=1&keep=no"),
    "https://jobs.example.com/acme",
  );
  assert.doesNotMatch(
    canonicalizeApplyUrl("https://jobs.example.com/acme?utm_source=x"),
    /[?#]/,
  );
});

test("scheme-less domains gain an https origin before canonicalization", () => {
  assert.equal(canonicalizeApplyUrl("hartevo.com"), "https://hartevo.com");
  assert.equal(
    canonicalizeApplyUrl("hartevo.com:8443/jobs"),
    "https://hartevo.com:8443/jobs",
  );
  assert.equal(
    canonicalizeApplyUrl("HARTEVO.COM/jobs/backend/?utm_source=launch#role"),
    "https://hartevo.com/jobs/backend",
  );
  assert.equal(
    canonicalizeApplyUrl("//hartevo.com/jobs/backend"),
    "https://hartevo.com/jobs/backend",
  );

  const draft = draftFromOutbidInput({
    identity: "hartevo.com",
    amountUsd: 5,
    lane: "backend",
    periodId: PERIOD,
    title: "Backend Engineer",
    company: "Hartevo",
    payerId: "pay_hartevo",
  });
  assert.equal(draft.applyUrl, "https://hartevo.com");
  assert.equal(draft.companyHandle, "hartevo-com");
});

test("https required; credentials, javascript, and data schemes are invalid_url", () => {
  for (const raw of [
    "http://jobs.example.com/acme",
    "javascript:alert(1)",
    "data:text/html,hi",
    "ftp://jobs.example.com/acme",
    "not a url",
    "",
    "https://user:pass@jobs.example.com/acme",
  ]) {
    assertUrlError(raw, "invalid_url");
  }
});

test("tracking-only URL with no host after strip is tracking_stripped_empty", () => {
  assertUrlError("https://./?utm_source=x&fbclid=1", "tracking_stripped_empty");
  assertUrlError("https://../?ref=1", "tracking_stripped_empty");
});

test("chat and invite hosts are 422 chat_link_forbidden", () => {
  for (const raw of [
    "https://t.me/acmejobs",
    "https://telegram.me/joinchat/abc",
    "https://wa.me/15551234567",
    "https://chat.whatsapp.com/invite",
    "https://discord.gg/acme",
    "https://discord.com/invite/acme",
    "https://m.me/acme",
    "https://signal.me/#p/+15551234567",
    "https://join.slack.com/t/acme/shared_invite/zt-1",
    "https://acme.slack.com/join/shared_invite/zt-1",
    "https://line.me/R/ti/p/@acme",
    "https://u.wechat.com/abc",
    "https://open.kakao.com/o/abc",
  ]) {
    assertUrlError(raw, "chat_link_forbidden");
  }
});

test("NSFW hosts and path keywords are 422 nsfw_forbidden", () => {
  for (const raw of [
    "https://onlyfans.com/creator",
    "https://www.pornhub.com/view_video.php?viewkey=1",
    "https://fansly.com/profile",
    "https://jobs.example.com/porn/role",
    "https://careers.example.com/onlyfans",
  ]) {
    assertUrlError(raw, "nsfw_forbidden");
  }
});

test("documented shortener without a fixture is 422 shortener_unresolved", () => {
  assertUrlError("https://bit.ly/unknown", "shortener_unresolved");
  assertUrlError("https://t.co/abc", "shortener_unresolved");
  assertUrlError("https://tinyurl.com/abc", "shortener_unresolved");
  assertUrlError("https://lnkd.in/abc", "shortener_unresolved");
});

test("shortener fixtures resolve one hop; stored URL is the final https target", () => {
  assert.equal(
    canonicalizeApplyUrl("https://bit.ly/acme-backend", {
      resolveShortener: fixtureResolver,
    }),
    "https://jobs.example.com/acme",
  );
  assert.equal(
    canonicalizeApplyUrl("https://t.co/acme", {
      resolvedTarget: SHORTENER_FIXTURES["https://t.co/acme"],
    }),
    "https://jobs.example.com/acme",
  );
});

test("resolved shortener that lands on chat or NSFW is still rejected", () => {
  assert.throws(
    () =>
      canonicalizeApplyUrl("https://tinyurl.com/chat-job", {
        resolveShortener: fixtureResolver,
      }),
    (error: unknown) =>
      error instanceof UrlError && error.code === "chat_link_forbidden",
  );
  assert.throws(
    () =>
      canonicalizeApplyUrl("https://lnkd.in/nsfw-job", {
        resolveShortener: fixtureResolver,
      }),
    (error: unknown) =>
      error instanceof UrlError && error.code === "nsfw_forbidden",
  );
  assert.throws(
    () =>
      canonicalizeApplyUrl("https://bit.ly/still-short", {
        resolveShortener: fixtureResolver,
      }),
    (error: unknown) =>
      error instanceof UrlError && error.code === "shortener_unresolved",
  );
});

test("live shortener resolve is off in fixture/CI env; injected fetch is the only hop", async () => {
  assert.equal(
    isLiveUrlResolveEnabled({ WAFFO_MODE: "fixture", URL_RESOLVE_LIVE: "1" }),
    false,
  );
  assert.equal(isLiveUrlResolveEnabled({ POLAR_LIVE: "1" }), false);
  assert.equal(isLiveUrlResolveEnabled({ WAFFO_MODE: "waffo-test" }), true);
  assert.equal(isLiveUrlResolveEnabled({ URL_RESOLVE_LIVE: "1" }), true);
  assert.equal(isLiveUrlResolveEnabled({}), false);

  await assert.rejects(
    () =>
      resolveShortenerHop("https://bit.ly/acme-backend", {
        env: { WAFFO_MODE: "fixture" },
      }),
    (error: unknown) =>
      error instanceof UrlError && error.code === "shortener_unresolved",
  );

  let calls = 0;
  const target = await resolveShortenerHop("https://bit.ly/acme-backend", {
    env: { URL_RESOLVE_LIVE: "1" },
    fetchImpl: async (_input, init) => {
      calls += 1;
      assert.equal(init.method, "HEAD");
      assert.equal(init.redirect, "manual");
      assert.ok(init.signal);
      return {
        headers: {
          get(name: string) {
            return name.toLowerCase() === "location"
              ? "https://jobs.example.com/acme?utm_source=x"
              : null;
          },
        },
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(target, "https://jobs.example.com/acme?utm_source=x");
  assert.equal(canonicalizeApplyUrl(target), "https://jobs.example.com/acme");

  let directCalls = 0;
  assert.equal(
    await resolveShortenerHop("https://jobs.example.com/acme", {
      env: { WAFFO_MODE: "fixture" },
      fetchImpl: async () => {
        directCalls += 1;
        return { headers: { get: () => null } };
      },
    }),
    "https://jobs.example.com/acme",
  );
  assert.equal(directCalls, 0);
});

test("live shortener timeout and malformed locations stay unresolved", async () => {
  await assert.rejects(
    () =>
      resolveShortenerHop("https://bit.ly/acme-backend", {
        env: { WAFFO_MODE: "waffo-test" },
        timeoutMs: 1,
        fetchImpl: async () => new Promise<never>(() => undefined),
      }),
    (error: unknown) =>
      error instanceof UrlError && error.code === "shortener_unresolved",
  );
  await assert.rejects(
    () =>
      resolveShortenerHop("https://bit.ly/acme-backend", {
        env: { WAFFO_MODE: "waffo-test" },
        fetchImpl: async () => ({
          headers: { get: () => "not a valid % location" },
        }),
      }),
    (error: unknown) =>
      error instanceof UrlError && error.code === "shortener_unresolved",
  );
});

test("outbound apply URL never adds query parameters", () => {
  const stored = canonicalizeApplyUrl(
    "https://jobs.example.com/acme?utm_source=x#frag",
  );
  const outbound = outboundApplyUrl(stored);
  assert.equal(outbound, "https://jobs.example.com/acme");
  assert.doesNotMatch(outbound, /[?#]/);
  assert.doesNotMatch(outbound, /utm_/);
});

test("draft and paid listing store the stripped apply URL (SPEC live-smoke 9)", async () => {
  const dirty = "https://Jobs.Example.com:443/acme/?utm_source=x&fbclid=abc#top";
  const draft = draftFromOutbidInput({
    identity: dirty,
    amountUsd: 5,
    lane: "backend",
    periodId: PERIOD,
    title: "Staff Backend Engineer",
    company: "Acme",
    payerId: "pay_acme",
  });
  assert.equal(draft.applyUrl, "https://jobs.example.com/acme");
  assert.doesNotMatch(draft.applyUrl, /[?#]/);

  const store = new BoardStore();
  const polar = new FakePolarPort(store);
  const started = await polar.createCheckout({
    amountUsd: 5,
    listingDraft: draft,
    successUrl: "http://localhost:3000/return",
  });
  const listing = await polar.completeCheckout(started.checkoutId);
  assert.ok(listing);
  assert.equal(listing.applyUrl, "https://jobs.example.com/acme");
  assert.doesNotMatch(listing.applyUrl, /utm_|fbclid|[?#]/);
  assert.equal(outboundApplyUrl(listing.applyUrl), listing.applyUrl);

  const [ranked] = rankListings(store.listPaid("backend", PERIOD));
  assert.ok(ranked);
  const html = renderToStaticMarkup(createElement(ListingCard, { listing: ranked }));
  assert.doesNotMatch(html, /utm_|fbclid|\?ref=/);
});

test("same canonical apply URL is a raise, not a second card", () => {
  const store = new BoardStore();
  store.insertPaid(
    fixtureListing({
      id: "lst_acme",
      company: "Acme",
      companyHandle: "acme",
      applyUrl: "https://jobs.example.com/acme",
      bidUsd: 5,
      createdAt: "2026-08-17T10:00:00.000Z",
      payerId: "pay_acme",
    }),
  );
  const raise = draftFromOutbidInput({
    identity: "https://jobs.example.com/acme?utm_source=x",
    amountUsd: 8,
    lane: "backend",
    periodId: PERIOD,
    company: "Acme",
    payerId: "pay_acme",
  });
  const plan = planCheckout(
    store,
    raise,
    undefined,
    new Date("2026-08-18T10:00:00.000Z"),
  );
  assert.equal(plan.kind, "raise");
  assert.equal(plan.chargeUsd, 3);
  assert.equal(raise.applyUrl, "https://jobs.example.com/acme");
});

test("checkout maps URL failures to SPEC §9 codes", () => {
  assert.throws(
    () => listingApplyUrl("http://jobs.example.com/acme"),
    (error: unknown) => {
      assert.ok(error instanceof CheckoutError);
      assert.equal(error.code, "invalid_url");
      assert.equal(error.httpStatus, 422);
      return true;
    },
  );
  assert.throws(
    () =>
      draftFromOutbidInput({
        identity: "https://t.me/joinchat/abc",
        amountUsd: 5,
        lane: "backend",
        periodId: PERIOD,
      }),
    (error: unknown) => {
      assert.ok(error instanceof CheckoutError);
      assert.equal(error.code, "chat_link_forbidden");
      return true;
    },
  );
  assert.throws(
    () =>
      draftFromOutbidInput({
        identity: "https://onlyfans.com/x",
        amountUsd: 5,
        lane: "backend",
        periodId: PERIOD,
      }),
    (error: unknown) => {
      assert.ok(error instanceof CheckoutError);
      assert.equal(error.code, "nsfw_forbidden");
      return true;
    },
  );
  assert.throws(
    () =>
      draftFromOutbidInput({
        identity: "https://bit.ly/nope",
        amountUsd: 5,
        lane: "backend",
        periodId: PERIOD,
      }),
    (error: unknown) => {
      assert.ok(error instanceof CheckoutError);
      assert.equal(error.code, "shortener_unresolved");
      return true;
    },
  );
});
