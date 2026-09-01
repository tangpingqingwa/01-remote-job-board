# Remote Job Board — Product Development Spec

**Version:** 1.0  
**Status:** Ready to build  
**Repo:** https://github.com/tangpingqingwa/01-remote-job-board  
**Market:** Global English, USD, remote-only  
**Clone of:** [outbid.lol](https://outbid.lol/) ranking mechanics, applied to remote job posts

Public rolling auction for the #1 remote job in a function lane. Live rank is the rolling last 7 days from paid placement. ISO weekId is audit-only; Monday 00:00 UTC does not drop live rank. Rank is the bid — nothing else. Candidates come to watch who is paying to hire.

One-line pitch: **Companies bid USD to stand first on the rolling last 7 days of a remote Backend / Growth / Design board.**

---

## 1. Product statement

Each function lane (Backend, Growth, Design, DevRel, …) is its own public leaderboard. A company posts a remote job and a whole-dollar USD bid. The listing with the highest bid is #1. Paying less than #1 still lists, at the rank that bid can take.

There are no ads, no API keys, and no revenue share with listed companies. Clicks on the apply URL are counted and shown on the card.

Currency is **USD**. Copy is **English**. The market is **global remote**. There is no default city, no China-city default, and no geo-restricted board in v1.

---

## 2. Goals and non-goals

### Goals

- One public board per function lane. Rank = current bid, then older listing wins ties.
- Whole USD bids. Documented minimum **$5**. Documented maximum **$50,000**.
- A bid below #1 still appears at the rank it can take.
- Same apply URL or company handle can raise; the owner pays only the difference. A different payer cannot steal that rank by paying only the difference.
- Live rank is the rolling last 7 days from paid placement (not Monday 00:00 UTC, not a 24h lock). `periodId` / weekId is an ISO-week audit label. Architecture must allow a daily flag later without rewriting rank.
- Apply-URL clicks are counted and public.
- Waffo Pancake is the sole Merchant of Record in live. Tests use an explicit fixture checkout. No live Waffo in CI.
- Pages: board, about, rules, checkout return.
- Listing is a remote job: title, function lane, company, apply URL, optional salary band. Never invent a salary.

### Non-goals

- Applicant accounts, résumés, messaging, or apply-on-behalf.
- Recruiter ATS sync, API keys, or a public jobs API in v1.
- Ads, affiliate payouts, or revenue share with listed companies.
- On-site / hybrid / city-default boards (including any China-city default).
- Invented compensation, “competitive salary”, or scraped salary estimates.
- Chat, invite, or community links as the apply target.
- NSFW, adult, or sexual listings.
- Multi-currency, non-English UI, or localized city lanes in v1.

---

## 3. Ranking rules (normative)

These rules are the product. UI and payments exist to make them visible and enforceable.

| Rule | Detail |
|---|---|
| Rank is the bid | Sort key is `bidUsd` descending. Nothing else (clicks, company size, recency of raise except the tie-break) moves rank. |
| Whole dollars | Bids are integers ≥ 1. No cents. Step is $1. |
| Minimum | First bid on a listing in a period must be **≥ $5**. |
| Maximum | Any bid (first or raise) must be **≤ $50,000**. |
| Below #1 still lists | A $5 bid on a lane whose #1 is $200 lists at the first rank whose current bid is `< 5`, or last if every bid is ≥ 5. |
| Equal bids | The **older** listing (`createdAt` earlier) keeps the higher rank. |
| Identity | A live listing is keyed by `(lane, identity)` in the **rolling last 7 days**. `identity` is the canonical apply URL when present, else the company handle. `periodId` is an audit label, not the live key. |
| Raise | Submitting the same apply URL or the same company handle in the same lane while that listing is still in the rolling window updates it. New bid must be **≥ current bid + 1**. Payer pays **newBid − currentBid** only. |
| Cannot steal the difference | A different checkout identity cannot raise listing A by paying only `newBid − A.bid`. They must pay the **full** new bid as a new listing (or fail `raise_not_owner`). They cannot inherit A’s paid amount. |
| Raise to take #1 | To become #1, `newBid` must be **≥ currentTopBid + 1**. Equal to the top bid is not enough (older keeps the higher rank). |
| Period | Live rank is computed among paid listings whose `createdAt` (paid placement) falls in the **rolling last 7 days**. ISO `periodId` is an audit label. Closed weekIds remain history at `?period=`. |
| Payment claims rank | An unpaid or abandoned checkout does not appear. Rank updates only after a completed payment (signed live Waffo event or explicit fixture). |

Worked examples:

1. Lane empty. Acme bids $5 → #1 at $5.
2. Beta bids $20 → Beta #1 ($20), Acme #2 ($5).
3. Acme raises to $21 and pays $16. Acme #1 ($21), Beta #2 ($20).
4. Gamma bids $21. Tie on dollars; Acme is older → Acme #1, Gamma #2, Beta #3.
5. Delta tries to submit Acme’s apply URL and pay $1 (the difference to $22). Rejected: not the owner. To list that URL as a new payer they would pay the full $22 as a new listing only if identity rules treat it as a new row — v1 **rejects** a second payer on an existing identity (`identity_taken`) so the original listing cannot be hijacked.

---

## 4. Cadence

**Default: rolling last 7 days from paid placement per function lane.** Not Monday 00:00 UTC. Not a 24h lock on #1.

| Field | Value |
|---|---|
| Period length | 7 days |
| Live boundary | Rolling last 7 days from `createdAt` (paid placement). A Sunday 23:00 UTC bid still occupies Monday 00:01 UTC. |
| `periodId` / weekId | ISO week in UTC, `YYYY-Www` (e.g. `2026-W34`). **Audit label only.** Monday 00:00:00.000 UTC opens a new weekId; it does not drop live rank. |
| What ages out | A listing leaves live rank 7 days after paid placement. Rank among remaining paid rows is still the bid. |
| What does not carry | An expired placement. A company that wants #1 again pays a new listing (full bid). A raise inside the window pays only the difference and does not restart a 24h lock. |
| History | Prior weekId listings remain readable at `/board?lane=backend&period=2026-W33` (no new bids on a closed weekId). |
| Daily mode | `CADENCE=daily` is a documented future flag (`periodId` = `YYYY-MM-DD` UTC). v1 ships the 7-day rolling window. Ranking code must take `periodId` as a parameter so daily does not rewrite the sort. |

The occupied board header shows the rolling last-7-days window, the weekId as an audit label, and the UTC instant the current #1 placement expires.

---

## 5. Listing schema

```ts
type FunctionLane =
  | "backend"
  | "frontend"
  | "growth"
  | "design"
  | "devrel"
  | "product"
  | "data"
  | "founding"

type Listing = {
  id: string                    // lst_...
  periodId: string              // 2026-W34 audit weekId; live rank is rolling 7 days
  lane: FunctionLane
  title: string                 // job title, 3–80 chars
  company: string               // company display name, 2–60 chars
  companyHandle: string         // lowercase [a-z0-9-]{2,32}, unique per (period, lane) with applyUrl
  applyUrl: string              // https URL, canonical (tracking stripped)
  salary: {
    minUsd: number              // whole USD, annual
    maxUsd: number              // whole USD, annual, >= min
  } | null                      // omit entirely when unknown — never invent
  bidUsd: number                // current bid, integer
  paidUsd: number               // sum of completed payments for this listing this period
  clicks: number                // public apply-click count this period
  createdAt: string             // ISO-8601, first paid listing time (tie-break)
  updatedAt: string             // last successful raise
}

type RankedListing = Listing & {
  rank: number                  // 1-based in this live rolling window (or closed weekId)
}
```

v1 launch lanes are the eight values above. Adding a lane is a data change (enum + tab), not a ranking rewrite.

**Salary honesty:** `salary` is present only when the poster typed both bounds. The UI must not fill “$0”, “competitive”, or a scraped band. Missing salary renders as no salary line.

**Remote-only:** Every listing is a remote job. There is no city field on the listing. Copy may say “Remote (global)”. Do not default a city.

---

## 6. URL and anti-spam rules

Apply URLs are cleaned and then validated. Failures are `422` with the codes in §8.

1. Require `https:` (not `http:`).
2. Resolve one redirect hop for known shortener hosts and replace the stored URL with the final `https` target. Do not store the shortener.
3. Strip the query string and fragment entirely (tracking, affiliate, `utm_*`, `ref`, `fbclid`, `gclid`).
4. Normalize: lowercase host, strip default `:443`, strip trailing slash, reject credentials in the URL.
5. Reject chat / invite hosts and paths: Telegram, WhatsApp, Discord, Messenger, Signal, Slack invite, Line, WeChat, Kakao, and similar invite links.
6. Reject NSFW / adult hosts and path keywords (porn, onlyfans, fansly, and documented equivalents).
7. Reject `javascript:`, `data:`, and non-http(s) schemes.
8. Identity collision: same canonical apply URL or same company handle in the same live rolling 7-day window is a **raise** of that listing, not a second card. `periodId` stays an audit label.

Clicks: `GET /out/:listingId` increments `clicks` by 1 (at-most-once per session cookie per listing per 10 minutes is enough against refresh spam) and **302**s to the stored apply URL with **no** query parameters added.

---

## 7. Payment

| Mode | When | Behavior |
|---|---|---|
| Fixture | tests, CI, `WAFFO_MODE=fixture` | `FakePolarPort` compatibility port records a completed checkout in-process. No network. |
| Waffo test | explicit `WAFFO_MODE=waffo-test` | Official Pancake SDK test checkout and signed test `order.completed` webhook. |
| Waffo prod | explicit `WAFFO_MODE=waffo-prod` | Official Pancake SDK production checkout and signed prod `order.completed` webhook. |

Live env (documented in `.env.example` when the app exists; never committed with secrets):

- `WAFFO_MODE` (`fixture`, `waffo-test`, or `waffo-prod`)
- `WAFFO_MERCHANT_ID`
- `WAFFO_PRIVATE_KEY` or `WAFFO_PRIVATE_KEY_FILE`
- `WAFFO_STORE_ID`
- `WAFFO_PRODUCT_ID`
- `WAFFO_PUBLIC_BASE_URL` (HTTPS in prod)
- `WAFFO_WEBHOOK_TEST_PUBLIC_KEY` / `WAFFO_WEBHOOK_PROD_PUBLIC_KEY`
- `DATABASE_PATH` (durable SQLite in test/prod modes)

Rules:

- Charge amount is the **first bid** or the **raise difference**, in whole USD.
- Persist the complete immutable intent before calling Waffo. An ambiguous transport/5xx or invalid response remains recoverable as `unknown`; it is never released as paid.
- Rank changes only after a verified Waffo `order.completed` with the expected mode, store, product, identity, USD amount, and exact metadata (or the explicit fixture marks paid).
- Webhook money is parsed as decimal strings: when present, `subtotal` must equal the immutable intent charge; `amount` may equal that subtotal or the tax-inclusive total, and a present `total` must equal `subtotal + tax`. Without a subtotal, tax must be explicitly zero and `amount` must equal the charge. Malformed or inconsistent present values are rejected/reconciled, and tax never inflates the ranked bid.
- Abandoned checkout: no listing row (or a `pending` row that the board never shows).
- Captured payments outside the rolling window become durable `needs_reconciliation`; they never rank stale occupancy.
- `event.id`, business event, payment, order, and intent identities are unique. Exact signed retries are no-ops; changed replays are rejected. Atomic internal failures return retryable 5xx and leave the event retryable.
- Browser return is informational and never settles a live listing. Fixture mode is explicit and cannot self-settle in a production runtime.

There is no API-key product and no revenue share with the hiring company. Waffo’s MoR fee is the operator’s cost.

---

## 8. Pages

| Path | Purpose |
|---|---|
| `/` | Board. Lane tabs. One apply-URL (or handle) field, amount field, **Outbid** button. Ranked cards: rank, title, company, **$bid**, public **clicks**. |
| `/about` | What this is: no ads, no API keys, no revenue share. Rank is the bid. Global remote, English, USD. |
| `/rules` | Normative ranking, min/max, raise-the-difference, rolling placement window and ISO audit weekId, URL rules, no chat/NSFW, no invented salaries. |
| `/return` | Checkout return. Success → “you’re on the board” + link home. Cancel → no rank claimed. |

Board chrome clones outbid.lol: one input row, amount, Outbid, then a stacked leaderboard of cards. No extra marketing widgets on `/`.

---

## 9. Errors

Machine `code` plus HTTP status. No stack traces on the wire.

| code | HTTP | meaning |
|---|---|---|
| `invalid_bid` | 400 | not a whole USD integer |
| `bid_below_min` | 400 | first bid < $5 |
| `bid_above_max` | 400 | bid > $50,000 |
| `raise_too_small` | 400 | new bid ≤ current bid on that identity |
| `raise_not_owner` | 403 | payer tried to pay only the difference on someone else’s listing |
| `identity_taken` | 409 | identity exists and this checkout is not a valid raise |
| `invalid_url` | 422 | not https, credentials, or unusable after normalize |
| `tracking_stripped_empty` | 422 | URL empty after stripping query / host |
| `chat_link_forbidden` | 422 | chat / invite host |
| `nsfw_forbidden` | 422 | adult / NSFW |
| `shortener_unresolved` | 422 | shortener could not be resolved (live); tests use fixtures |
| `invalid_lane` | 422 | unknown function lane |
| `invalid_listing` | 422 | title / company / handle fail length or charset |
| `salary_invalid` | 422 | partial band, min > max, or non-integer |
| `period_closed` | 409 | bid on a non-current period |
| `payment_required` | 402 | checkout not completed |
| `payment_failed` | 402 | Waffo / fixture reported failure |
| `not_found` | 404 | listing or period missing |

Salary must not be coerced into a valid band. Garbage or a single bound → `salary_invalid` or omit; never invent the other bound.

---

## 10. Live-smoke flows

Operator-only. `scripts/live-smoke.sh` is **not** called from `scripts/test.sh` or Actions. It starts an explicit local `WAFFO_MODE=fixture` process and never invokes a provider. Authorized post-deploy Waffo smoke is a separate runbook with the required merchant, key, store, product, HTTPS URL, and durable database configuration. Missing live configuration is `BLOCKED-SECRET` / `BLOCKED-CONFIG` with the env var name. Each flow is `PASS`, `PASS-ERROR` (documented code), or `FAIL`.

| # | Flow | Expected |
|---|---|---|
| 1 | `GET /` | 200, lane tabs, Outbid control, no invented listings |
| 2 | `GET /about` and `GET /rules` | 200, state min $5, rolling placement window, ISO audit weekId, rank = bid |
| 3 | New listing, valid remote job, bid $5 | Fixture checkout in the offline smoke; authorized Waffo Checkout session or `BLOCKED-CONFIG` in a deployment smoke |
| 4 | Fixture or completed live return | listing visible at the rank that $5 takes |
| 5 | Raise same apply URL to $8 | charged **$3**; same `id`; rank recomputed |
| 6 | Other payer, same URL, difference only | `raise_not_owner` or `identity_taken`; original rank unchanged |
| 7 | Second company, lower bid | lists below; both cards show `$` and clicks |
| 8 | Two equal bids | older listing keeps the higher rank |
| 9 | Apply URL with `?utm_source=x` | stored URL has no query; card link has no query |
| 10 | Telegram / Discord / NSFW URL | `422` `chat_link_forbidden` or `nsfw_forbidden` |
| 11 | Click apply | public `clicks` increments; redirect has no tracking |
| 12 | Salary omitted | card has no salary figures (none invented) |
| 13 | Clock at Monday 00:00 UTC after a Sunday paid placement | listing still on the live board; expires 7 days after paid placement; weekId may change as an audit label. Not a 24h lock. |

---

## 11. Acceptance

| # | Case | Expected |
|---|---|---|
| 1 | Empty lane, $5 job | #1 at $5 after payment |
| 2 | $12 then $7 | $12 is #1, $7 is #2 |
| 3 | Two $10 bids | earlier `createdAt` is #1 |
| 4 | Owner raises $10 → $15 | pays $5; bid becomes 15 |
| 5 | Stranger pays $5 against a $10 listing | not a raise; original stays #1 |
| 6 | `http://` or chat URL | 422, no row |
| 7 | Salary left blank | `salary: null`, UI silent |
| 8 | Seven days after paid placement | listing absent from live rank; Monday 00:00 UTC alone does not drop it |
| 9 | Click counter | public, integer, no dark traffic |

---

## 12. Git collaboration (normative)

Development is GitHub trunk-based. **`main` is always cloneable, buildable, and testable.**

| Rule | Requirement |
|---|---|
| Integration branch | `main` only. No long-lived `develop`. |
| How code lands | Pull request into `main`. No direct push. |
| Required check | GitHub Actions workflow `ci` (job id `ci`) must be green. |
| Local / CI test | `bash scripts/test.sh` — offline, no production secrets. |
| Branch names | `feat/` `fix/` `docs/` `chore/` `test/` + short slug. |
| Merge | Squash. Delete the head branch. |
| Broken `main` | Treat as an incident. Fix on `fix/…` via PR. |

Full process: [CONTRIBUTING.md](./CONTRIBUTING.md).

Implementation plan (stack, modules, PR DAG): [BUILD.md](./BUILD.md).

Until there is an application binary, `scripts/test.sh` still has to pass: contract files exist, SPEC/CONTRIBUTING agree, no tracked secrets. Adding the Next.js app means **extending** that script with unit/contract tests. Live Waffo is optional and must not be required for `main` to stay green.
