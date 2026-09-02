#!/usr/bin/env bash
# Offline release gate for main. This script deliberately exercises the real
# typecheck, test, and build paths without requiring Waffo or any live network.
# Operator coverage belongs to scripts/live-smoke.sh and is never invoked here.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "== contract files =="
for f in README.md SPEC.md BUILD.md CONTRIBUTING.md scripts/test.sh; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'main must always be buildable' CONTRIBUTING.md \
  || grep -q 'main` must always be buildable' CONTRIBUTING.md \
  || fail "CONTRIBUTING.md does not state the main-branch rule"
grep -q 'Git collaboration' SPEC.md || fail "SPEC.md missing Git collaboration section"
grep -E '^### PR [0-9]+: ' BUILD.md >/dev/null \
  || fail "BUILD.md missing ### PR N: title headings"

echo "== CI and secret hygiene =="
if [[ -f .github/workflows/ci.yml ]] && \
  grep -nE 'live-smoke|WAFFO_MODE=waffo-(test|prod)' .github/workflows/ci.yml >/dev/null; then
  fail "CI must not run live-smoke or select a live Waffo mode"
fi
if grep -Eq '^\s*(bash )?(\./)?scripts/live-smoke\.sh' scripts/test.sh; then
  fail "test.sh must not invoke live-smoke.sh"
fi
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && \
  git ls-files | grep -E '(^|/)\.env$|(^|/)id_rsa$|\.pem$|credentials\.json$' >/dev/null; then
  fail "secret-like path is tracked"
fi
file -b --mime-encoding README.md SPEC.md CONTRIBUTING.md BUILD.md | \
  grep -qiE 'utf-8|us-ascii' || fail "docs are not UTF-8/ASCII"

if [[ -f package.json ]]; then
  echo "== skeleton and test surface =="
  for f in package.json package-lock.json tsconfig.json next.config.ts \
    src/app/layout.tsx src/app/page.tsx src/app/healthz/route.ts src/lib/types.ts \
    src/lib/rank.ts src/lib/board.ts src/lib/period.ts \
    src/lib/urls.ts src/lib/store.ts src/lib/db.ts \
    src/components/board/board.tsx src/components/board/lane-tabs.tsx \
    src/components/board/bid-form.tsx src/components/board/listing-card.tsx \
    src/components/board/leaderboard.tsx tests/rank.test.ts tests/period.test.ts \
    tests/pages.test.ts tests/checkout.test.ts tests/urls.test.ts tests/live-smoke.test.ts \
    tests/payment-lifecycle.test.ts src/migrations/001_init.sql .env.example; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  [[ -x scripts/test.sh ]] || fail "scripts/test.sh must remain executable"
  [[ -x scripts/probe-built-runtime.sh ]] || fail "built runtime probe must remain executable"

  echo "== durable SQLite board store =="
  for f in src/migrations/*.sql; do
    [[ -s "$f" ]] || fail "empty migration $f"
  done
  grep -q 'DATABASE_PATH' src/lib/db.ts || fail "store must use DATABASE_PATH"
  grep -q 'journal_mode = WAL' src/lib/db.ts || fail "store must enable WAL"
  grep -q 'UNIQUE (period_id, lane, apply_url)' src/migrations/001_init.sql \
    || fail "store must enforce URL identity uniqueness"
  grep -q 'UNIQUE (period_id, lane, company_handle)' src/migrations/001_init.sql \
    || fail "store must enforce company identity uniqueness"
  grep -q 'clicks = clicks + 1' src/lib/store.ts \
    || fail "clicks must increment atomically"
  grep -q 'SQLite board survives process restart' tests/period.test.ts \
    || fail "period tests must cover restart persistence"
  grep -q 'concurrent click increments' tests/period.test.ts \
    || fail "period tests must cover concurrent click writes"

  echo "== Waffo payment lifecycle =="
  for f in src/payments/env.ts src/payments/port.ts src/payments/fixture.ts \
    src/payments/waffo.ts src/payments/polar.ts \
    src/app/api/webhooks/waffo/route.ts src/app/checkout/route.ts \
    src/app/checkout/complete/page.tsx src/app/return/page.tsx \
    src/migrations/003_payment_intents.sql src/migrations/004_waffo_payment_lifecycle.sql \
    src/migrations/005_waffo_identity_reservations.sql; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'payment_intents' src/lib/db.ts || fail "payment intents must be migrated"
  grep -q 'payment_webhook_deliveries' src/lib/db.ts || fail "deliveries must be durable"
  grep -q 'waffo_identity_reservations' src/lib/db.ts || fail "provider identities must be reserved"
  grep -q 'verifyWebhook' src/payments/waffo.ts || fail "webhooks must use SDK verification"
  grep -q 'order.completed' src/payments/waffo.ts || fail "only order.completed may settle"
  grep -q 'x-waffo-signature' src/payments/waffo.ts || fail "signature header must be read"
  grep -q 'WAFFO_MODE' src/payments/env.ts || fail "Waffo mode must be explicit"
  if grep -n 'NEXT_PHASE' src/payments/env.ts src/payments/fixture.ts >/dev/null; then
    fail "production guards must not exempt Next build phase"
  fi
  grep -q 'FIXTURE_DISABLED_IN_PRODUCTION' src/payments/env.ts \
    || fail "production fixture mode must fail closed"
  grep -q 'data.paymentId' src/payments/waffo.ts \
    || fail "signed events must carry an explicit payment identity"
  grep -q 'WAFFO_WEBHOOK_TEST_PUBLIC_KEY' src/payments/env.ts \
    || fail "webhooks must require a mode-scoped key"
  grep -q 'WAFFO_API_BASE_OFFICIAL' src/payments/env.ts \
    || fail "production API must be pinned to Waffo"
  grep -q 'subtotal + (tax ?? 0)' src/payments/waffo.ts \
    || fail "settlement must reconcile subtotal and tax"
  grep -q 'amount === subtotal || amount === subtotal + (tax ?? 0)' src/payments/waffo.ts \
    || fail "settlement must accept only consistent amount variants"
  grep -q 'status: "retryable"' src/payments/waffo.ts \
    || fail "atomic failures must remain retryable"
  grep -q 'result.status === "retryable"' src/app/api/webhooks/waffo/route.ts \
    || fail "retryable webhook failures must return 5xx"
  grep -q 'runtimeResourcesFor' src/payments/waffo.ts \
    || fail "SDK operations must have bounded resources"
  grep -q 'export class FakePolarPort' src/payments/fixture.ts \
    || fail "fixture adapter must remain available offline"
  grep -q 'createCheckout' src/payments/port.ts \
    || fail "payment port must define createCheckout"
  grep -q 'POLAR_PROVIDER_DISABLED' src/payments/polar.ts \
    || fail "retired Polar adapter must fail closed"
  if grep -nE 'POLAR_(LIVE|FIXTURE_ONLY)=1' scripts/test.sh scripts/live-smoke.sh .env.example >/dev/null; then
    fail "offline gates must not select retired Polar"
  fi
  [[ ! -e src/payments/waffo-session.ts ]] \
    || fail "obsolete hand-written Waffo client must not remain"
  if grep -nE '^\s*return;\s*$' tests/checkout.test.ts >/dev/null; then
    fail "checkout tests must not hide legacy assertions"
  fi
  if grep -nE 'fetch\(|waffo\.ai|polar\.sh|api\.polar' \
    src/payments/fixture.ts src/payments/port.ts >/dev/null; then
    fail "fixture/port must not call a provider over the network"
  fi

  echo "== direct empty form and occupied wall =="
  grep -q 'export function rankListings' src/lib/rank.ts || fail "rankListings is missing"
  grep -q 'data-empty-lane' src/components/board/leaderboard.tsx \
    || fail "empty lane must be explicit"
  grep -q 'Pay \${MIN_BID_USD} to list' src/components/board/leaderboard.tsx \
    || fail "empty lane must teach the minimum bid"
  grep -q 'hideEmptyChrome' src/components/board/leaderboard.tsx \
    || fail "live empty lane must expose claim chrome"
  grep -q 'data-empty-closed' src/components/board/leaderboard.tsx \
    || fail "closed empty lane must be distinct"
  grep -q 'Bids are closed' src/components/board/leaderboard.tsx \
    || fail "closed empty lane must say bids are closed"
  grep -q 'data-live-week' src/components/board/leaderboard.tsx \
    || fail "closed empty lane must link to live week"
  for phrase in 'Claim #1 for' 'amount-field' 'Decrease bid by one dollar' \
    'Increase bid by one dollar' 'name="identity"' 'name="lane"' '<select'; do
    grep -q "$phrase" src/components/board/bid-form.tsx \
      || fail "bid form is missing $phrase"
  done
  grep -q 'data-empty-bay-list' src/components/board/bid-form.tsx \
    || fail "empty form must stamp its state"
  grep -q 'data-empty-honest' src/components/board/bid-form.tsx \
    || fail "empty form must stamp honest copy"
  grep -q 'data-empty-claim' src/components/board/bid-form.tsx \
    || fail "empty form must stamp Claim #1"
  grep -q 'data-empty-identity' src/components/board/bid-form.tsx \
    || fail "empty form must stamp its identity field"
  grep -q 'aria-label="Claim rank"' src/components/board/bid-form.tsx \
    || fail "bid form must expose the Claim rank action"
  grep -q 'Claim rank' src/components/board/bid-form.tsx \
    || fail "bid form must use Claim rank copy"
  if grep -n 'Outbid' src/components/board/bid-form.tsx >/dev/null; then
    fail "production bid form must not expose legacy Outbid copy"
  fi
  grep -q 'data-lane-tabs' src/components/board/bid-form.tsx \
    || fail "empty form must expose one function selector"
  if grep -nE 'data-first-click="claim"|data-empty-identity-first|autoFocus=\{laneEmpty\}|Pick the function after Claim #1' \
    src/components/board/bid-form.tsx src/app/globals.css >/dev/null; then
    fail "empty form must not retain staged claim markers or focus"
  fi
  if grep -nEi 'claim[[:space:]]*#1[[:space:]]*,?[[:space:]]*then[[:space:]]+(pick|choose)[[:space:]]+the[[:space:]]+function' \
    src/components/board/board.tsx >/dev/null; then
    fail "empty board mast must not describe a staged claim-to-function hop"
  fi
  grep -q 'empty lane form is a direct identity-and-function path before one Claim rank submit' tests/rank.test.ts \
    || fail "rank tests must cover direct empty form order"
  grep -Fq 'claim\s*#1\s*,?\s*then\s+(?:pick|choose)' tests/rank.test.ts \
    || fail "rank tests must reject staged empty-board mast wording"
  grep -q 'contract docs keep audit detail while public metadata stays product-facing' tests/rank.test.ts \
    || fail "rank tests must separate internal contract detail from public metadata"
  grep -q 'closed empty weeks are read-only' tests/period.test.ts \
    || fail "period tests must cover closed empty isolation"
  grep -q 'live rank is not a 24h lock — 25 hours later still occupies' tests/period.test.ts \
    || fail "period tests must retain the greater-than-24-hour rolling regression"
  grep -q 'data-slot="lane-rail"' src/components/board/board.tsx \
    || fail "live wall must render the truthful function rail"
  grep -q 'grid-template-columns: minmax(15rem, 17rem)' src/app/globals.css \
    || fail "hiring wall must keep the rail-and-bay layout"
  grep -q 'emptyFirst' src/components/board/board.tsx \
    || fail "live empty wall must retain its honest state marker"
  grep -q 'wall-rail .function-rail' src/app/globals.css \
    || fail "occupied function rail must remain visually stable"
  grep -q 'occupied hiring wall keeps one #1 Apply, paid facts, and quieter later cards' tests/rank.test.ts \
    || fail "rank tests must cover occupied prize and later cards"
  grep -q 'List a role' src/components/board/bid-form.tsx || fail "occupied form must say List a role"
  grep -q 'data-one-identity' src/components/board/bid-form.tsx \
    || fail "occupied form must keep one identity field"
  grep -q 'Returning employers pay only the difference' src/components/board/bid-form.tsx \
    || fail "occupied form must explain the raise difference"
  for phrase in 'data-job-fields' 'name="title"' 'name="company"' \
    'name="salaryMinUsd"' 'name="salaryMaxUsd"'; do
    grep -q "$phrase" src/components/board/bid-form.tsx \
      || fail "occupied form is missing $phrase"
  done
  grep -q 'data-first-click": "apply"' src/components/board/listing-card.tsx \
    || fail "#1 Apply must remain the first action"
  grep -q 'data-apply-state": "first"' src/components/board/listing-card.tsx \
    || fail "#1 Apply must expose first-action state"
  grep -q 'data-take-apply' src/components/board/listing-card.tsx \
    || fail "#1 Apply must expose take-apply state"
  grep -q 'data-apply-live' src/components/board/listing-card.tsx \
    || fail "#1 Apply must be an outbound live action"
  grep -q 'data-list-action="role"' src/components/board/listing-card.tsx \
    || fail "#1 must keep the List a role action"
  grep -q 'data-apply-later-outlined' src/components/board/listing-card.tsx \
    || fail "later Apply must stay outlined"
  grep -q 'data-later-quiet' src/components/board/listing-card.tsx \
    || fail "later cards must stay quiet"
  grep -q 'data-prize-title' src/components/board/listing-card.tsx \
    || fail "#1 must expose prize title"
  grep -q 'data-later-fact' src/components/board/listing-card.tsx \
    || fail "#1 money/clicks must remain later facts"
  grep -q 'data-prize-pack' src/components/board/leaderboard.tsx \
    || fail "#1 must have its own prize pack"
  grep -q 'data-later-pack' src/components/board/leaderboard.tsx \
    || fail "later cards must have a separate pack"
  grep -q 'leaderboard-later' src/components/board/leaderboard.tsx \
    || fail "later cards must use a later roster"
  grep -q 'if (!isPaidListing(listing)) return null' src/components/board/listing-card.tsx \
    || fail "unpaid rows must not render"
  grep -q 'paidListings(listings)' src/lib/rank.ts || fail "rank must filter unpaid rows"
  grep -q 'isPaidListing(row)' src/lib/store.ts || fail "store must filter unpaid rows"
  grep -q 'if (!isPaidListing(listing)) return;' src/lib/store.ts \
    || fail "store must refuse unpaid inserts"
  grep -q 'unpaid stays off the hiring wall' tests/rank.test.ts \
    || fail "rank tests must cover unpaid off-board behavior"
  grep -q 'rank is the bid, and older paid rows win equal bids' tests/rank.test.ts \
    || fail "rank tests must cover bid/tie hierarchy"
  grep -q 'hiring wall keeps its composition' tests/rank.test.ts \
    || fail "rank tests must cover hiring-wall composition"
  grep -q 'closed empty and occupied boards isolate live actions' tests/rank.test.ts \
    || fail "rank tests must cover closed state isolation"
  if grep -nE 'data-(?:list-after-apply-(?:first|two|three|four|five|six|seven|eight|N)|apply-after-list-(?:first|two|three|four|five|six|seven|eight|N)|apply-after-identity|empty-lane-pick|lane-after-claim|empty-function-pick|rolling-week-hop|rolling-strip|last-7d-strip|week-window-hop)' \
    src/components/board/*.tsx src/app/globals.css >/dev/null; then
    fail "generated named hop markers must stay absent"
  fi
  if grep -nE 'top company|featured employer|star rating|review count|Google Maps|OpenStreetMap' \
    src/components/board/*.tsx src/app/page.tsx >/dev/null; then
    fail "hiring wall must not invent social proof or maps"
  fi

  echo "== listing and payment flow contracts =="
  grep -q 'getBoardListings' src/app/page.tsx || fail "board page must load board listings"
  grep -q 'rankListings' src/app/page.tsx || fail "board page must rank listings"
  grep -q 'export function planCheckout' src/lib/listing.ts || fail "listing must plan checkout"
  grep -q 'export function applyPaidCheckout' src/lib/listing.ts || fail "listing must apply paid checkout"
  for code in raise_too_small raise_not_owner identity_taken; do
    grep -q "$code" src/lib/listing.ts || fail "listing must emit $code"
    grep -q "$code" tests/checkout.test.ts || fail "checkout tests must cover $code"
  done
  grep -q 'chargeUsd' src/lib/listing.ts || fail "raises must charge the difference"
  grep -q 'planCheckout' src/app/checkout/route.ts || fail "checkout route must plan raises"
  grep -q 'planCheckout' src/payments/fixture.ts || fail "fixture checkout must re-check raises"
  grep -q 'on the board' src/app/return/page.tsx || fail "return page must show paid success"
  grep -q 'No rank claimed' src/app/return/page.tsx || fail "return page must show cancel truth"
  grep -q 'data-complete-state' src/app/checkout/complete/page.tsx \
    || fail "completion page must expose truthful states"
  grep -q 'data-hiring-wall' src/components/board/board.tsx \
    || fail "board must identify as a hiring wall"
  grep -q 'Function lanes' src/components/board/board.tsx \
    || fail "function lanes must remain first-class"
  grep -q 'Remote (global)' src/components/board/listing-card.tsx \
    || fail "cards must state remote global"
  grep -q 'href={applyClickPath' src/components/board/listing-card.tsx \
    || fail "Apply must route through the click path"
  grep -q 'data-clicks' src/components/board/listing-card.tsx \
    || fail "cards must show public clicks"
  grep -q 'salary_invalid' src/lib/listing.ts \
    && grep -q 'optional salary requires both annual USD bounds' tests/checkout.test.ts \
    || fail "salary fields must preserve the optional truthful contract"

  echo "== about, rules, URL, period, and click contracts =="
  for f in src/app/about/page.tsx src/app/rules/page.tsx tests/pages.test.ts \
    src/lib/urls.ts tests/urls.test.ts src/app/out/\[id\]/route.ts tests/period.test.ts; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'href="/about"' src/app/layout.tsx || fail "nav must link to /about"
  grep -q 'href="/rules"' src/app/layout.tsx || fail "nav must link to /rules"
  for f in README.md SPEC.md BUILD.md docs/live-smoke.md; do
    grep -qi 'rolling last 7 days from paid placement' "$f" \
      || fail "$f must describe rolling paid-placement rank"
    grep -qi 'ISO weekId is audit-only' "$f" \
      || fail "$f must describe weekId as audit-only"
    grep -qi 'Monday 00:00 UTC does not drop live rank' "$f" \
      || fail "$f must state Monday does not drop live rank"
  done
  grep -qi 'rolling seven-day placement window' src/app/layout.tsx \
    || fail "public metadata must describe the seven-day placement window"
  for phrase in 'Remote Job Board' 'Rank is the bid' 'payment is confirmed' 'English' 'USD'; do
    grep -q "$phrase" src/app/about/page.tsx || fail "about is missing $phrase"
  done
  for phrase in 'starts at' '$50,000' 'Monday midnight' 'seven days' \
    'estimated or placeholder salary' 'difference between' 'chat invitations' 'adult content'; do
    grep -q "$phrase" src/app/rules/page.tsx || fail "rules are missing $phrase"
  done
  if grep -nEi 'outbid\.lol|clone of|\bv1\b|fixture|no API keys|weekId|createdAt|paidAt|Waffo|BLOCKED-(SECRET|CONFIG)' \
    src/app/about/page.tsx src/app/rules/page.tsx src/app/layout.tsx \
    src/app/checkout/complete/page.tsx src/components/board/bid-form.tsx >/dev/null; then
    fail "public copy must not expose development, test, clone, provider, or storage details"
  fi
  if grep -nEi 'weekly[[:space:]-]+reset|rolling[[:space:]-]+reset' \
    src/app/rules/page.tsx tests/pages.test.ts scripts/live-smoke.sh docs/live-smoke.md >/dev/null; then
    fail "Rules and fixture smoke must not make an obsolete cadence claim"
  fi
  grep -q 'invalid_lane' tests/checkout.test.ts \
    || fail "checkout tests must cover invalid lane rejection"
  grep -q 'export async function GET' src/app/healthz/route.ts \
    || fail "health route GET missing"
  grep -q 'status: 503' src/app/healthz/route.ts \
    || fail "health route must fail closed"
  grep -q 'export function canonicalizeApplyUrl' src/lib/urls.ts || fail "URL canonicalizer missing"
  grep -q 'export function outboundApplyUrl' src/lib/urls.ts || fail "outbound URL helper missing"
  for code in invalid_url tracking_stripped_empty chat_link_forbidden nsfw_forbidden shortener_unresolved; do
    grep -q "$code" src/lib/urls.ts || fail "URL helper must emit $code"
    grep -q "$code" tests/urls.test.ts || fail "URL tests must cover $code"
  done
  grep -q 'utm_' tests/urls.test.ts || fail "URL tests must strip tracking query"
  grep -q 'SHORTENER_FIXTURES\|resolveShortener' tests/urls.test.ts \
    || fail "URL tests must use offline shortener fixtures"
  grep -q 'resolveListingIdentity' src/app/checkout/route.ts \
    || fail "checkout must resolve known live shorteners before drafting"
  grep -q 'SHORTENER_HOP_TIMEOUT_MS' src/lib/urls.ts \
    || fail "shortener resolution must have a bounded hop timeout"
  if grep -nE '[^a-zA-Z_]fetch\(' src/lib/urls.ts >/dev/null; then
    fail "URL helper must not call global fetch"
  fi
  for phrase in 'export function isoWeekPeriodId' 'export function currentPeriodMeta' \
    'export function resolveBoardPeriod' 'ROLLING_WEEK_MS' 'export function isInRollingWeek' \
    'export function liveRankResetAt' 'export function placementExpiresAt'; do
    grep -q "$phrase" src/lib/period.ts || fail "period helper is missing $phrase"
  done
  grep -q 'Monday' src/lib/period.ts || fail "period helper must document Monday UTC"
  grep -q '7 \* DAY_MS' src/lib/period.ts || fail "period window must be seven days"
  if grep -nE 'ROLLING_WINDOW_MS = 24|24 \* 60 \* 60 \* 1000' \
    src/lib/period.ts src/lib/board.ts src/lib/store.ts >/dev/null; then
    fail "live rank must not be a 24-hour lock"
  fi
  grep -q 'listPaidRolling' src/lib/store.ts || fail "store must query rolling paid rows"
  grep -q 'findLiveByIdentity' src/lib/store.ts || fail "store must raise against live identity"
  grep -q 'listPaidRolling' src/lib/board.ts || fail "board must query rolling paid rows"
  grep -q 'export async function GET' src/app/out/\[id\]/route.ts || fail "click route GET missing"
  grep -q 'NextResponse.redirect' src/app/out/\[id\]/route.ts || fail "click route must redirect"
  grep -q 'incrementClicks' src/app/out/\[id\]/route.ts || fail "click route must count clicks"
  grep -q 'outboundApplyUrl' src/app/out/\[id\]/route.ts || fail "click route must canonicalize URL"
  grep -q 'resolveBoardPeriod' src/app/page.tsx || fail "page must resolve period"
  grep -q 'params.period' src/app/page.tsx || fail "page must accept period"
  grep -q 'getLiveBoardListings' src/app/page.tsx || fail "page must load live rolling rows"
  grep -q 'liveRankResetAt' src/app/page.tsx || fail "page must reset from paid placement"
  grep -q 'data-week-window={occupiedLive ? "rolling-7d"' src/components/board/board.tsx \
    || fail "occupied wall must stamp rolling window"
  grep -q 'data-empty-window' src/components/board/board.tsx \
    || fail "empty wall must stamp its rolling window"
  grep -q 'Rolling last 7 days from paid placement' src/components/board/board.tsx \
    || fail "wall must state rolling placement window"
  grep -q 'The last 7 days from paid placement are empty' src/components/board/bid-form.tsx \
    || fail "empty form must state rolling placement window"
  grep -q 'Rolling last 7 days #1' src/components/board/leaderboard.tsx \
    || fail "prize pack must state rolling window"
  grep -q 'Later ranks in the rolling last 7 days' src/components/board/leaderboard.tsx \
    || fail "later pack must state rolling window"
  grep -q 'Week {periodId} is read-only week history' src/components/board/board.tsx \
    || fail "closed board must identify its week history"
  grep -q 'Closed week history #1' src/components/board/leaderboard.tsx \
    || fail "closed prize pack must be read-only"
  grep -q 'Later ranks in closed week history' src/components/board/leaderboard.tsx \
    || fail "closed later pack must be read-only"
  grep -q 'No listings in closed week history' src/components/board/leaderboard.tsx \
    || fail "closed empty board must be honest"
  grep -q 'Bids are closed in closed week history' src/components/board/leaderboard.tsx \
    || fail "closed empty board must say bids are closed"
  grep -q 'weekHistory={closedOccupied || closedEmpty}' src/components/board/board.tsx \
    || fail "closed function plates must be marked as history"
  grep -q 'weekHistory ? `${name} week history` : name' src/components/board/lane-tabs.tsx \
    || fail "closed function plates must name history"
  grep -q 'GET /out/:id increments clicks' tests/period.test.ts \
    || fail "period tests must cover click/redirect behavior"
  grep -q 'malformed click-cookie encoding' tests/period.test.ts \
    || fail "period tests must cover malformed click-cookie recovery"
  grep -q '302s without query' tests/period.test.ts || fail "click tests must assert clean 302"
  grep -q 'paid placement stays live across Monday' tests/period.test.ts \
    || fail "period tests must cover rolling placement"
  grep -q 'ISO week labels follow Monday UTC' tests/period.test.ts \
    || fail "period tests must cover frozen/Monday labels"
  grep -q 'closed occupied weeks keep paid cards' tests/period.test.ts \
    || fail "period tests must cover closed occupied history"
  grep -q 'closed-week unpaid rows stay off the wall' tests/period.test.ts \
    || fail "period tests must cover closed unpaid rows"

  echo "== operator smoke remains offline and explicit =="
  [[ -f scripts/live-smoke.sh && -x scripts/live-smoke.sh ]] \
    || fail "live-smoke.sh must be present and executable"
  [[ -f docs/live-smoke.md && -s docs/live-smoke.md ]] \
    || fail "live smoke documentation is missing"
  grep -q 'WAFFO_MODE=fixture' scripts/live-smoke.sh \
    || fail "live smoke must use explicit fixture mode"
  grep -q 'live-smoke refuses CI=true' scripts/live-smoke.sh \
    || fail "live smoke must refuse CI"
  grep -q 'LIVE_SMOKE_BASE is unsupported' scripts/live-smoke.sh \
    || fail "live smoke must not attach to an arbitrary server"
  for name in POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET POLAR_PRODUCT_ID \
    POLAR_API_BASE POLAR_SUCCESS_URL POLAR_FIXTURE_ONLY; do
    grep -q "$name" scripts/live-smoke.sh \
      || fail "live smoke must clear retired $name"
    grep -q "$name" scripts/test.sh \
      || fail "release gate must clear retired $name"
  done
  grep -q 'PASS-ERROR' docs/live-smoke.md || fail "smoke docs missing PASS-ERROR"
  grep -q 'BLOCKED-SECRET' docs/live-smoke.md || fail "smoke docs missing BLOCKED-SECRET"
  for n in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
    grep -q "| ${n} |" docs/live-smoke.md || fail "smoke docs missing SPEC §10 row $n"
  done

  echo "== install and offline release gates =="
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
  fi
  unset WAFFO_MODE WAFFO_MERCHANT_ID WAFFO_PRIVATE_KEY WAFFO_PRIVATE_KEY_FILE
  unset WAFFO_STORE_ID WAFFO_PRODUCT_ID WAFFO_PUBLIC_BASE_URL WAFFO_API_BASE
  unset WAFFO_WEBHOOK_PUBLIC_KEY WAFFO_WEBHOOK_TEST_PUBLIC_KEY WAFFO_WEBHOOK_PROD_PUBLIC_KEY
  unset DATABASE_PATH WAFFO_LIVE
  unset POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET POLAR_PRODUCT_ID
  unset POLAR_API_BASE POLAR_SUCCESS_URL POLAR_FIXTURE_ONLY
  export WAFFO_MODE=fixture
  [[ "${WAFFO_MODE:-}" == "fixture" ]] || fail "test gate must select fixture mode"
  [[ "${WAFFO_LIVE:-}" != "1" ]] || fail "test gate must not select live Waffo"

  echo "== typecheck =="
  npm run typecheck
  echo "== unit tests =="
  if [[ -d tests ]] && find tests -name '*.test.ts' | grep -q .; then
    npx tsx --tsconfig tsconfig.test.json --test 'tests/**/*.test.ts'
  else
    echo "skip: no tests/**/*.test.ts yet"
  fi
  echo "== next build =="
  npm run build
  echo "== built runtime happy-path smoke =="
  bash scripts/probe-built-runtime.sh
  echo "== production startup fail-closed probe =="
  bash scripts/probe-production-start.sh
  echo "== production dependency audit =="
  npm audit --omit=dev
fi

echo "OK: buildable and testable"
