# Offline smoke — Remote Job Board

Operator-only. `bash scripts/live-smoke.sh` is **not** called from
`scripts/test.sh` or GitHub Actions. CI and the release gate stay offline and
use an explicit `WAFFO_MODE=fixture`; this script never calls Waffo or any
other payment provider.

`100%` for this unit means a **local process** walked every SPEC §10 flow.
Fixture checkout is the only payment path supported by this offline smoke.
Missing or incomplete live Waffo configuration is never converted into a
paid listing. Do not invent jobs. An empty lane is valid.

## How to run

```bash
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` and `GITHUB_ACTIONS=true`.
2. Starts a local Next.js-handler process on a free loopback port with
   `WAFFO_MODE=fixture` and provider credentials unset.
3. Or attaches to `LIVE_SMOKE_BASE` if that server already answers
   `GET /healthz`.
4. Walks every SPEC §10 row against the running process.
5. Exercises checkout, return, raise, validation, click, and rolling-window
   behavior through the offline fixture only.
6. Kills the process it started.

Overrides: `LIVE_SMOKE_BASE`, `LIVE_SMOKE_PORT`.

An authorized post-deploy Waffo test/prod smoke is a separate operator
runbook. It must explicitly select `WAFFO_MODE=waffo-test` or
`WAFFO_MODE=waffo-prod` and provide the merchant, private key, store, product,
HTTPS public URL, webhook key, and durable `DATABASE_PATH`. Never put those
values in this repository or this offline command.

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Documented product error; nothing invented. |
| `BLOCKED-SECRET` | An authorized live run lacks a required secret; exact env var is named. |
| `FAIL` | Broken product or invented listing. |

## This session

The current run records the fixture-only path on **2026-08-27**. The local
process is started with `WAFFO_MODE=fixture`; no Waffo request, secret, or
dashboard mutation is made. The checkout row is intentionally reported as
`PASS-ERROR` to distinguish an offline fixture proof from an authorized live
provider proof. Re-run this command after changes and preserve its exact
result table here.

| # | Flow | Expected offline result |
|---|---|---|
| 1 | `GET /` | 200. Lane tabs + Claim rank. Empty lane is honest; no invented listings. |
| 2 | `GET /about` and `GET /rules` | 200. Min $5; rolling last 7 days from paid placement; ISO weekId is audit-only; Monday 00:00 UTC does not drop live rank; rank = bid. |
| 3 | New listing, valid remote job, bid $5 | Explicit fixture checkout; no provider request. |
| 4 | Fixture or completed live return | Fixture return lists at the rank that $5 takes. |
| 5 | Raise same apply URL to $8 | Same id; charged $3; rank recomputed. |
| 6 | Other payer, same URL, difference only | `raise_not_owner` or `identity_taken`; original rank unchanged. |
| 7 | Second company, lower bid | Lists below; both cards show `$` and clicks. |
| 8 | Two equal bids | Older listing keeps the higher rank. |
| 9 | Apply URL with `?utm_source=x` | Stored URL and card link have no query. |
| 10 | Telegram / Discord / NSFW URL | `422` `chat_link_forbidden` or `nsfw_forbidden`; no row. |
| 11 | Click apply | Public clicks increments; clean `302` redirect. |
| 12 | Salary omitted | Card has no invented salary figures. |
| 13 | Clock at Monday 00:00 UTC after Sunday placement | Listing remains within the rolling seven-day window; expiry is paid placement + 7 days. |

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not select a live Waffo mode or make a real payment request.
- Does not seed invented jobs on an empty lane.
- Does not treat missing live configuration as a paid listing.
