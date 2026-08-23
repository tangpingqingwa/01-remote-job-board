# Live smoke — Remote Job Board

Operator-only. `bash scripts/live-smoke.sh` is **not** called from `scripts/test.sh` or GitHub Actions. CI and `scripts/test.sh` stay offline and must not set `POLAR_LIVE`.

`100%` for this unit means a **local process** walked every SPEC §10 flow. Fixture checkout is the default path. Live Polar runs only when `POLAR_LIVE=1` and secrets exist. Missing Polar secret is `BLOCKED-SECRET` naming the env var — that is not a fixture success and not a paid listing. Do not invent jobs. An empty lane is valid.

## How to run

```bash
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` and `GITHUB_ACTIONS=true`.
2. Starts a local Next.js-handler process on a free loopback port with Polar env unset and `POLAR_FIXTURE_ONLY=1`.
3. Or attaches to `LIVE_SMOKE_BASE` if that server already answers `GET /healthz`.
4. Walks every SPEC §10 row against the running process.
5. Live Polar: if `POLAR_LIVE` is not `1` or `POLAR_ACCESS_TOKEN` / `POLAR_PRODUCT_ID` is empty, prints `BLOCKED-SECRET: <env>` for the new-listing row. Board, rules, about, raise, URL, click, and weekly reset still run on the fixture process.
6. Kills the process it started.

Overrides: `LIVE_SMOKE_BASE`, `LIVE_SMOKE_PORT`.

Live Polar (operator machine with real **sandbox** secrets):

```bash
set -a
# source operator Polar sandbox env (never commit)
set +a
export POLAR_LIVE=1
unset POLAR_FIXTURE_ONLY
export POLAR_API_BASE=https://sandbox-api.polar.sh
bash scripts/live-smoke.sh
```

Row 3 must redirect to a real Polar **sandbox** Checkout URL (`https://sandbox.polar.sh/…`), not a fixture `/return?checkoutId=` listing. Missing secret is `BLOCKED-SECRET` — never invent a paid row. Production `https://api.polar.sh` rejects sandbox tokens (401).

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Documented product error; nothing invented. |
| `BLOCKED-SECRET` | Live Polar secret missing. Exact env var named. |
| `FAIL` | Broken product or invented listing. |

## This session

Ran `bash scripts/test.sh` then `bash scripts/live-smoke.sh` on **2026-08-23** from `feat/live-polar-sandbox-smoke` (parent `0854728` / `origin/main`). Offline `scripts/test.sh` green (`tsc --noEmit`, 57/57 `node:test`). Operator Polar sandbox env sourced from the local operator file (mode 600). `POLAR_LIVE=1`. `POLAR_FIXTURE_ONLY` unset. `POLAR_API_BASE=https://sandbox-api.polar.sh`. Token / product / webhook present by length only. Fixture board process on `http://127.0.0.1:57361`. Live Polar process started by the script for SPEC §10.3 only. No invented jobs: empty backend lane first, then unique `jobs.example.com/*-${STAMP}` apply URLs for this run.

Process exit 0 (`PASS=11` `PASS-ERROR=2` `BLOCKED-SECRET=0` `FAIL=0`).

| # | Flow | Result | Note |
|---|---|---|---|
| 1 | `GET /` | **PASS** | 200. Lane tabs + Outbid. Empty lane. No invented listings. Period `2026-W34`. |
| 2 | `GET /about` and `GET /rules` | **PASS** | 200. Min $5, weekly reset, rank = bid. |
| 3 | New listing, valid remote job, bid $5 | **PASS** | Live Polar sandbox Checkout URL (`https://sandbox.polar.sh/…`). Unpaid session not listed. Not a fixture `/return` listing. |
| 4 | Fixture or completed live return | **PASS** | Fixture-on-live-process return listed `lst_0002` at **#1 $5**. Unpaid checkout did not appear. |
| 5 | Raise same apply URL to $8 | **PASS** | Same `id` `lst_0002`. Bid $8 (charged **$3**). Rank #1. Documented as fixture-on-live-process. |
| 6 | Other payer, same URL, difference only | **PASS-ERROR** | `identity_taken`. Original `lst_0002` stays #1 $8. |
| 7 | Second company, lower bid | **PASS** | Acme #1 $8; Beta #2 $5. Both cards show `$` and clicks. |
| 8 | Two equal bids | **PASS** | Both $5. Older Gamma #3 above Delta #4. |
| 9 | Apply URL with `?utm_source=x` | **PASS** | Stored apply URL has no query. Card link has no query. |
| 10 | Telegram / Discord / NSFW URL | **PASS-ERROR** | `chat_link_forbidden` / `nsfw_forbidden`. No row. |
| 11 | Click apply | **PASS** | `GET /out/lst_0002` **302** to canonical URL. Clicks `0 → 1`. No tracking on redirect. |
| 12 | Salary omitted | **PASS** | Card has no salary figures. None invented. |
| 13 | Clock at Monday 00:00 UTC | **PASS** | Sunday process `2026-W33` listed last-week bid. Monday 00:00 UTC process is `2026-W34`; previous bids absent from live board. |

Sandbox token against production `https://api.polar.sh` is 401. Live checkout uses `POLAR_API_BASE`. Missing secret still records `BLOCKED-SECRET` and does not invent a paid row.

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not set `POLAR_LIVE=1` in CI.
- Does not seed invented jobs on an empty lane.
- Does not treat a missing Polar secret as a paid listing.
