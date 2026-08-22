# Remote Job Board — Detailed Specification and Build Plan

**Contract:** [SPEC.md](./SPEC.md)  
**Git:** [CONTRIBUTING.md](./CONTRIBUTING.md)

Pay-to-rank remote jobs. Clone [outbid.lol](https://outbid.lol/) mechanics into a weekly function-lane board. Rank is the bid. Polar is MoR in live; fixture checkout in tests.

This document locks the stack and the PR sequence. Do not implement the app in the docs PR that lands this file.

---

## 1. Stack (locked)

| Layer | Choice |
|---|---|
| App | **Next.js** (App Router) + TypeScript + Node 22 |
| UI | Server Components + small client islands for the bid form. Clone outbid.lol: one URL/handle field, amount, **Outbid** button, ranked cards with **$bid** and **clicks** |
| DB | **SQLite** via `better-sqlite3` (one file). Tests use a temp file. No Postgres in v1 — keep CI offline and one-box |
| Rank | Pure function `rankListings(listings): RankedListing[]` — `bidUsd` desc, then `createdAt` asc |
| Period | `periodId` from UTC clock. Weekly default (`YYYY-Www`). Inject `now` in tests |
| Payments | `PolarPort.createCheckout({ amountUsd, listingDraft, successUrl })`. **Live Polar** when `POLAR_LIVE=1`. **`FakePolarPort`** fixture otherwise. `POLAR_FIXTURE_ONLY=1` always wins |
| Clicks | `GET /out/[id]` increments then 302 to canonical apply URL |
| Tests | `node:test` + fixture Polar. No network |
| CI | `.github/workflows/ci.yml` job **`ci`** → `bash scripts/test.sh` |

Do not add Stripe, ads, API keys, or a public JSON API in this launch path.

---

## 2. Target tree

```
.
├── README.md
├── SPEC.md
├── BUILD.md
├── CONTRIBUTING.md
├── .env.example
├── .github/workflows/ci.yml
├── package.json
├── tsconfig.json
├── next.config.ts
├── scripts/
│   ├── test.sh
│   └── live-smoke.sh          # PR 8 only; never called from test.sh
├── docs/
│   └── live-smoke.md
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           # board
│   │   ├── about/page.tsx
│   │   ├── rules/page.tsx
│   │   ├── return/page.tsx
│   │   └── out/[id]/route.ts
│   ├── lib/
│   │   ├── db.ts
│   │   ├── period.ts
│   │   ├── rank.ts
│   │   ├── urls.ts
│   │   ├── listing.ts
│   │   └── types.ts
│   ├── payments/
│   │   ├── polar.ts           # live, env-gated
│   │   ├── fixture.ts
│   │   └── port.ts
│   └── migrations/
│       └── 001_init.sql
└── tests/
    ├── rank.test.ts
    ├── urls.test.ts
    ├── period.test.ts
    ├── listing.test.ts
    ├── checkout.test.ts
    └── fixtures/
```

Until PR 1, only the contract files and `scripts/test.sh` exist.

---

## 3. Tests (extend `scripts/test.sh`)

`scripts/test.sh` stays **offline**. After the app exists it runs `tsc` and `node:test`. It must never set `POLAR_LIVE=1` or call `live-smoke.sh`.

| Area | Assert |
|---|---|
| rank | higher bid wins; equal bid → older wins; below-#1 still listed |
| raise | owner pays difference; stranger cannot pay only the difference |
| urls | query stripped; chat/NSFW rejected; https required |
| salary | omitted → null; never filled in |
| period | Monday 00:00 UTC starts a new `periodId`; old bids absent from live query |
| polar | fixture checkout completes without network; live module unused unless flag |
| clicks | `/out/:id` increments and redirects without adding query params |

---

## 4. PR plan

Each heading below is exactly `### PR N: title` on its own line so the fleet parser can find it.

### PR 1: Skeleton, CI, scripts/test.sh
- **Description:** Next.js + TS skeleton, SQLite schema stub, health/home placeholder, lockfile. Extend `scripts/test.sh` to install + typecheck when `package.json` exists. Keep tests offline.
- **Files:** `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/lib/types.ts`, `src/migrations/001_init.sql`, `.env.example`, `scripts/test.sh`
- **Dependencies:** None (docs already on `main`)
- **Acceptance:** `bash scripts/test.sh` green with no Polar secrets. Job `ci` still the only required check. No live Polar. No real board logic required beyond a compiling app.

### PR 2: Board UI clone of outbid.lol
- **Description:** Public board: lane tabs, one input (apply URL or company handle), amount, **Outbid** button, ranked cards showing **$** bid and **clicks**. Fixture listings are enough; checkout may still be a stub that does not charge.
- **Files:** `src/app/page.tsx`, board components, `src/lib/rank.ts`, `tests/rank.test.ts`
- **Dependencies:** PR 1
- **Acceptance:** Empty lane is honest (no invented jobs). Cards render rank, title, company, `$N`, click count. Sort matches SPEC §3 on fixture rows.

### PR 3: Polar checkout + fixture
- **Description:** Outbid starts a checkout for the bid amount. Live Polar is env-gated. Tests complete payment through `FakePolarPort`. `/return` shows success or cancel. Rank updates only after paid.
- **Files:** `src/payments/port.ts`, `src/payments/fixture.ts`, `src/payments/polar.ts`, `src/app/return/page.tsx`, `tests/checkout.test.ts`
- **Dependencies:** PR 2
- **Acceptance:** Fixture: $5 new listing appears after fake pay. Abandoned checkout does not list. `POLAR_FIXTURE_ONLY=1` wins. CI does not call Polar.

### PR 4: Raise-bid
- **Description:** Same apply URL or company handle in the same lane + period raises the existing listing. Owner pays `newBid − currentBid`. A different payer cannot take the rank by paying only that difference.
- **Files:** `src/lib/listing.ts`, checkout wiring, `tests/checkout.test.ts`
- **Dependencies:** PR 3
- **Acceptance:** SPEC raise examples. `raise_too_small`, `raise_not_owner`, `identity_taken` as specified.

### PR 5: Rules and about pages
- **Description:** `/about` and `/rules` in English. State: no ads, no API keys, no revenue share; rank is the bid; min $5 / max $50,000; weekly UTC reset; no invented salaries; global remote.
- **Files:** `src/app/about/page.tsx`, `src/app/rules/page.tsx`
- **Dependencies:** PR 1
- **Acceptance:** Pages 200. Rules text matches SPEC §3–§6. Board nav links to both.

### PR 6: Anti-spam URL rules
- **Description:** Canonicalize apply URLs: strip tracking query strings and fragments, reject chat/invite links, reject NSFW, require https, resolve documented shorteners in live only (fixtures for tests).
- **Files:** `src/lib/urls.ts`, `tests/urls.test.ts`
- **Dependencies:** PR 2
- **Acceptance:** SPEC §6 and error codes. Stored and outbound links have no tracking query.

### PR 7: Weekly reset + public apply clicks
- **Description:** Period helper (Monday 00:00 UTC). Click route increments public count and 302s to the canonical apply URL. Board reads only the current `periodId` unless `?period=` is a closed week.
- **Files:** `src/lib/period.ts`, `src/app/out/[id]/route.ts`, `tests/period.test.ts`
- **Dependencies:** PR 2
- **Acceptance:** Injected clock rolls the week; live query drops old bids. Click count is public on the card.

### PR 8: Live-smoke
- **Description:** Operator script walks SPEC §10 against a local Next.js server with `POLAR_LIVE=1`. Missing Polar secrets → `BLOCKED-SECRET`. Not invoked from `scripts/test.sh` or Actions.
- **Files:** `scripts/live-smoke.sh`, `docs/live-smoke.md`
- **Dependencies:** PR 3, PR 4, PR 5, PR 6, PR 7
- **Acceptance:** Script is executable. CI must not set `POLAR_LIVE` or call the script. Offline `scripts/test.sh` still green.

---

## 5. Done (GA)

Launch-path complete is **not** fleet-done. After PR 8 is on `main`, an operator must run `bash scripts/live-smoke.sh` on a worktree of `origin/main` (or the smoke PR) and record SPEC §10 rows in `docs/live-smoke.md`.

| Unit | Required |
|---|---|
| Offline `scripts/test.sh` | green on `origin/main`; never sets live Polar |
| Live Polar checkout | real Checkout or `BLOCKED-SECRET` + env var name |
| Raise difference | live or fixture-on-live-process as documented in the smoke doc |
| URL + NSFW + chat rejects | `PASS-ERROR` with SPEC codes |
| Weekly boundary | clock-injected or documented wait; old bids gone |
| Apply clicks | public increment + clean redirect |
