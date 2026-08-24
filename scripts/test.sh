#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# Contract checks stay; when the app exists, extend this script with tsc +
# node:test. Do not replace it with a no-op. Do not require Polar or any
# live third-party network. Operator live smoke is scripts/live-smoke.sh
# and is never invoked from here.
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

echo "== contributing rules are documented =="
grep -q 'main must always be buildable' CONTRIBUTING.md \
  || grep -q 'main` must always be buildable' CONTRIBUTING.md \
  || fail "CONTRIBUTING.md does not state the main-branch rule"

echo "== SPEC mentions git collaboration =="
grep -q 'Git collaboration' SPEC.md || fail "SPEC.md missing Git collaboration section"

echo "== BUILD PR headings are parseable =="
grep -E '^### PR [0-9]+: ' BUILD.md >/dev/null \
  || fail "BUILD.md missing ### PR N: title headings"

echo "== CI stays offline =="
if [[ -f .github/workflows/ci.yml ]]; then
  if grep -nE 'live-smoke|POLAR_LIVE=1' .github/workflows/ci.yml >/dev/null; then
    fail "CI must not run live-smoke or set POLAR_LIVE=1"
  fi
fi
if grep -Eq '^\s*(bash )?scripts/live-smoke\.sh' scripts/test.sh; then
  fail "test.sh must not invoke live-smoke.sh"
fi

echo "== no committed secrets =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files | grep -E '(^|/)\.env$|(^|/)id_rsa$|\.pem$|credentials\.json$' >/dev/null; then
    fail "secret-like path is tracked"
  fi
fi

echo "== markdown is UTF-8 text =="
file -b --mime-encoding README.md SPEC.md CONTRIBUTING.md BUILD.md | grep -qiE 'utf-8|us-ascii' \
  || fail "docs are not UTF-8/ASCII"

if [[ -f package.json ]]; then
  echo "== skeleton files =="
  for f in package.json tsconfig.json next.config.ts \
    src/app/layout.tsx src/app/page.tsx src/lib/types.ts \
    src/migrations/001_init.sql .env.example; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done

  echo "== board UI files =="
  for f in src/lib/rank.ts src/lib/board.ts \
    src/components/board/board.tsx \
    src/components/board/lane-tabs.tsx \
    src/components/board/bid-form.tsx \
    src/components/board/listing-card.tsx \
    src/components/board/leaderboard.tsx \
    tests/rank.test.ts; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done

  echo "== polar checkout files =="
  for f in src/payments/port.ts src/payments/fixture.ts src/payments/polar.ts \
    src/app/return/page.tsx src/lib/listing.ts tests/checkout.test.ts; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'export class FakePolarPort' src/payments/fixture.ts \
    || fail "fixture.ts must export FakePolarPort"
  grep -q 'createCheckout' src/payments/port.ts \
    || fail "port.ts must define createCheckout"
  grep -q 'POLAR_FIXTURE_ONLY' src/payments/env.ts \
    || fail "env.ts must honor POLAR_FIXTURE_ONLY"
  grep -q 'on the board' src/app/return/page.tsx \
    || fail "return page must show success copy"
  grep -q 'No rank claimed' src/app/return/page.tsx \
    || fail "return page must show cancel copy"
  if grep -nE 'fetch\(|polar\.sh|api\.polar' src/payments/fixture.ts src/payments/port.ts >/dev/null; then
    fail "fixture/port must not call Polar over the network"
  fi
  grep -q 'export function rankListings' src/lib/rank.ts \
    || fail "rank.ts must export rankListings"
  grep -q 'Outbid' src/components/board/bid-form.tsx \
    || fail "bid form must render Outbid"
  grep -q 'data-empty-lane' src/components/board/leaderboard.tsx \
    || fail "leaderboard must have an honest empty-lane state"
  grep -q 'Pay \${MIN_BID_USD} to list' src/components/board/leaderboard.tsx \
    || fail "empty lane must teach pay \$5 to list"
  grep -q 'hideEmptyChrome' src/components/board/leaderboard.tsx \
    || fail "live empty bay must yield claim chrome"
  grep -q 'data-empty-closed' src/components/board/leaderboard.tsx \
    || fail "closed empty week must be a distinct empty state"
  grep -q 'Bids are closed' src/components/board/leaderboard.tsx \
    || fail "closed empty week must say bids are closed"
  grep -q 'data-live-week' src/components/board/leaderboard.tsx \
    || fail "closed empty week must point at this week's live wall"
  grep -q 'MIN_BID_USD} takes' src/components/board/bid-form.tsx \
    || fail "empty claim box must say \$5 takes #1"
  grep -q 'Claim #1 for' src/components/board/bid-form.tsx \
    || fail "bid form must clone Claim #1 for"
  grep -q 'amount-field' src/components/board/bid-form.tsx \
    || fail "bid form must keep the dashed amount field"
  grep -q 'Decrease bid by one dollar' src/components/board/bid-form.tsx \
    || fail "bid form must expose a minus stepper"
  grep -q 'Increase bid by one dollar' src/components/board/bid-form.tsx \
    || fail "bid form must expose a plus stepper"
  grep -q 'name="identity"' src/components/board/bid-form.tsx \
    || fail "bid form must keep one identity field"
  grep -q 'data-empty-bay-list' src/components/board/bid-form.tsx \
    || fail "live empty claim must stamp the listing write"
  grep -q 'data-empty-identity' src/components/board/bid-form.tsx \
    || fail "live empty claim must stamp the identity field"
  grep -q 'data-empty-identity-first' src/components/board/bid-form.tsx \
    || fail "live empty identity must lead the claim write"
  grep -q 'identity-label' src/components/board/bid-form.tsx \
    || fail "live empty identity must have a visible label"
  grep -q 'data-empty-bay-list' src/app/globals.css \
    || fail "live empty identity stamp must be visually certain"
  grep -q 'data-empty-identity-first' src/app/globals.css \
    || fail "live empty identity-first write must be visually certain"
  grep -q 'data-empty-bay-list' tests/rank.test.ts \
    || fail "rank tests must cover listing on a live empty bay"
  grep -q 'data-empty-identity' tests/rank.test.ts \
    || fail "rank tests must stamp the empty-bay identity field"
  grep -q 'data-empty-identity-first' tests/rank.test.ts \
    || fail "rank tests must put empty-bay identity before the \$ stepper"
  grep -q 'data-empty-bay-list' tests/period.test.ts \
    || fail "period tests must keep closed weeks unstamped for listing"
  grep -q 'data-empty-identity-first' tests/period.test.ts \
    || fail "period tests must keep closed weeks unstamped for identity-first"
  grep -q 'data-empty-honest' src/components/board/bid-form.tsx \
    || fail "live empty claim must stamp honesty"
  grep -q 'data-empty-claim' src/components/board/bid-form.tsx \
    || fail "live empty claim must stamp Claim #1 as the honest lead"
  grep -q 'autoFocus={laneEmpty}' src/components/board/bid-form.tsx \
    || fail "empty week Claim #1 amount must take focus, not identity"
  if grep -nE 'name="identity"' src/components/board/bid-form.tsx | grep -q autoFocus; then
    fail "identity field must not steal empty-week first click"
  fi
  grep -q 'data-first-click="claim"' src/components/board/bid-form.tsx \
    || fail "empty week Outbid must be the certain first click"
  grep -q 'outbid\[data-first-click="claim"\]' src/app/globals.css \
    || fail "empty week Outbid first-click must stay visually certain"
  empty_outbid_rule="$(awk '/\.claim\[data-empty-bay-list\] \.outbid\[data-first-click="claim"\]/,/^\}/' src/app/globals.css)"
  echo "$empty_outbid_rule" | grep -q 'min-height: 3.15rem' \
    || fail "empty week Outbid must stay taller than the identity write"
  if echo "$empty_outbid_rule" | grep -q 'background:'; then
    fail "empty week Outbid must concentrate first click, not recolor the hiring wall"
  fi
  grep -q 'empty week Claim #1 stays the only first click' tests/rank.test.ts \
    || fail "rank tests must cover empty-week Claim #1 as the only first click"
  grep -q 'identity field does not steal focus' tests/rank.test.ts \
    || fail "rank tests must cover identity not stealing empty-week focus"
  grep -q 'data-first-click="claim"' tests/rank.test.ts \
    || fail "rank tests must stamp empty-week first-click Claim #1"
  grep -q 'data-first-click="claim"' tests/period.test.ts \
    || fail "period tests must keep closed weeks unstamped for first-click Claim #1"
  if grep -nE 'data-empty-claim-after|data-claim-after-empty-[0-9]|data-empty-claim-first' \
    src/components/board/bid-form.tsx src/components/board/board.tsx src/app/globals.css >/dev/null; then
    fail "empty Claim #1 first-click must not add a second named hop"
  fi
  grep -q 'emptyFirst ? null' src/components/board/board.tsx \
    || fail "live empty week must not hang eight Function-lane plates in the wall rail"
  grep -q 'hiring-wall:not(:has(.wall-rail))' src/app/globals.css \
    || fail "live empty week must drop the eight-plate rail column"
  grep -q 'name="lane"' src/components/board/bid-form.tsx \
    || fail "empty week must pick the function after Claim #1"
  grep -q '<select' src/components/board/bid-form.tsx \
    || fail "empty week function pick must be one control after Claim #1, not eight plates"
  grep -q 'empty week Claim #1 is the first click' tests/rank.test.ts \
    || fail "rank tests must cover empty-week Claim #1 before the function pick"
  grep -q 'function pick comes after, not eight equal plates' tests/rank.test.ts \
    || fail "rank tests must keep empty-week function pick off eight equal plates"
  grep -q 'hiring-wall:not(:has(.wall-rail))' tests/rank.test.ts \
    || fail "rank tests must cover the empty-week one-column first click"
  grep -q 'wall-plate' tests/rank.test.ts \
    || fail "rank tests must keep empty week off eight equal wall plates"
  grep -q 'wall-rail' tests/period.test.ts \
    || fail "period tests must keep closed weeks on the occupied wall rail"
  if grep -nE 'data-empty-lane-pick|data-lane-after-claim|data-empty-function-pick|hiring-wall-empty-first' \
    src/components/board/bid-form.tsx src/components/board/board.tsx src/app/globals.css >/dev/null; then
    fail "empty week function pick must not add another named hop"
  fi
  grep -q 'List a role' src/components/board/bid-form.tsx \
    || fail "empty Claim #1 cut must keep occupied List a role"
  grep -q 'data-prize-title' src/components/board/listing-card.tsx \
    || fail "empty Claim #1 cut must keep occupied #1 prize title"
  grep -q 'data-apply-later-outlined' src/components/board/listing-card.tsx \
    || fail "empty Claim #1 cut must keep later-rank Apply outlined"
  grep -q 'data-empty-honest' src/components/board/leaderboard.tsx \
    || fail "empty and closed-empty weeks must stamp honesty"
  grep -q 'data-empty-honest' src/app/globals.css \
    || fail "empty-honest chrome must be visually certain"
  grep -q 'empty and closed-empty weeks stay honest' tests/rank.test.ts \
    || fail "rank tests must cover empty-week honesty"
  grep -q 'data-empty-honest' tests/rank.test.ts \
    || fail "rank tests must stamp empty-week honesty"
  grep -q 'data-empty-honest' tests/period.test.ts \
    || fail "period tests must stamp closed-empty honesty"
  grep -q 'data-hiring-wall' src/components/board/board.tsx \
    || fail "board must be a hiring wall, not a generic directory"
  grep -q 'Function lanes' src/components/board/board.tsx \
    || fail "function lanes must be first-class wall chrome"
  grep -q 'Remote (global)' src/components/board/listing-card.tsx \
    || fail "job card must state remote (global)"
  grep -q 'Apply' src/components/board/listing-card.tsx \
    || fail "job card must keep Apply as the outbound CTA"
  grep -q 'className="apply"' src/components/board/listing-card.tsx \
    || fail "job card must keep a single Apply control"
  grep -q 'sheet-apply' src/components/board/listing-card.tsx \
    || fail "job card must put Apply after the job identity"
  grep -q 'data-take-apply' src/components/board/listing-card.tsx \
    || fail "live #1 sheet must stamp the Apply hop"
  grep -q 'data-apply-live' src/components/board/listing-card.tsx \
    || fail "live #1 Apply must be the outbound hop"
  grep -q 'data-apply-live' src/app/globals.css \
    || fail "live Apply hop must be visually certain"
  grep -q 'data-apply-after-identity' src/components/board/listing-card.tsx \
    || fail "occupied #1 Apply must stamp the hop after identity"
  grep -q 'data-apply-after-identity' src/app/globals.css \
    || fail "occupied #1 Apply after identity must be visually certain"
  grep -q 'data-apply-after-identity' tests/rank.test.ts \
    || fail "rank tests must cover Apply after empty-bay identity leads"
  grep -q 'data-apply-after-identity' tests/period.test.ts \
    || fail "period tests must keep closed-week Apply after identity unstamped"
  grep -q 'data-take-apply' tests/rank.test.ts \
    || fail "rank tests must cover taking Apply on a live sheet"
  grep -q 'live={!closed}' src/components/board/leaderboard.tsx \
    || fail "closed-week sheets must not stamp a live Apply hop"
  grep -q 'data-take-apply' tests/period.test.ts \
    || fail "period tests must keep closed-week Apply unstamped"
  grep -q 'data-later-apply' src/components/board/listing-card.tsx \
    || fail "live later-rank sheet must stamp the Apply hop"
  grep -q 'data-apply-later' src/components/board/listing-card.tsx \
    || fail "live later-rank Apply must be the outbound hop"
  grep -q 'data-apply-later' src/app/globals.css \
    || fail "later-rank Apply hop must be visually certain"
  grep -q 'data-apply-later-outlined' src/components/board/listing-card.tsx \
    || fail "later-rank Apply must stamp the outlined hop, not a filled #1"
  grep -q 'data-apply-later-outlined' src/app/globals.css \
    || fail "later-rank outlined Apply must stay visually certain"
  grep -q 'data-later-apply' tests/rank.test.ts \
    || fail "rank tests must cover taking Apply on a later live sheet"
  grep -q 'data-later-apply' tests/period.test.ts \
    || fail "period tests must keep closed-week later Apply unstamped"
  grep -q 'data-list-role' src/components/board/bid-form.tsx \
    || fail "occupied live claim must stamp List a role"
  grep -q 'List a role' src/components/board/bid-form.tsx \
    || fail "occupied live claim must say List a role"
  grep -q 'list-this-role' src/app/globals.css \
    || fail "occupied List a role stamp must be visually certain"
  grep -q 'data-list-role' tests/rank.test.ts \
    || fail "rank tests must cover listing a role on an occupied live wall"
  grep -q 'data-list-role' tests/period.test.ts \
    || fail "period tests must keep closed-week history unstamped for listing"
  grep -q 'data-one-identity' src/components/board/bid-form.tsx \
    || fail "occupied List a role must stamp one identity field"
  grep -q 'data-one-identity' src/app/globals.css \
    || fail "occupied one identity field must be visually certain"
  if grep -nE 'name="(company|contact)"' src/components/board/bid-form.tsx >/dev/null; then
    fail "List a role must not ask for a second name"
  fi
  grep -q 'does not ask for a second name' tests/rank.test.ts \
    || fail "rank tests must cover List a role without a second name"
  grep -q 'data-one-identity' tests/rank.test.ts \
    || fail "rank tests must stamp one identity field on occupied List a role"
  grep -q 'data-one-identity' tests/period.test.ts \
    || fail "period tests must keep closed weeks unstamped for one identity"
  grep -q 'data-list-after-apply' src/components/board/listing-card.tsx \
    || fail "occupied #1 must stamp List a role after Apply"
  grep -q 'after Apply' src/components/board/listing-card.tsx \
    || fail "list-after-apply hop must sit after Apply"
  grep -q 'href="#claim"' src/components/board/listing-card.tsx \
    || fail "list-after-apply hop must jump to #claim"
  grep -q 'list-after-apply' src/app/globals.css \
    || fail "occupied List a role after Apply must be visually certain"
  grep -q 'data-list-after-apply' tests/rank.test.ts \
    || fail "rank tests must cover listing after occupied Apply"
  grep -q 'data-list-after-apply' tests/period.test.ts \
    || fail "period tests must keep closed-week history unstamped for list-after-apply"
  grep -q 'data-first-click": "apply"' src/components/board/listing-card.tsx \
    || fail "occupied #1 Apply must win the first click after List a role"
  grep -q 'data-first-click="apply"' src/app/globals.css \
    || fail "first-click Apply must be louder than List a role after Apply"
  grep -q 'wins the first click after List a role' tests/rank.test.ts \
    || fail "rank tests must cover Apply winning the first click after List a role"
  grep -q 'data-first-click="apply"' tests/rank.test.ts \
    || fail "rank tests must stamp first-click Apply on occupied #1"
  grep -q 'data-first-click="apply"' tests/period.test.ts \
    || fail "period tests must keep closed-week first-click Apply unstamped"
  grep -q 'data-list-after-apply-first' src/components/board/listing-card.tsx \
    || fail "occupied List a role after Apply must stay certain after first-click Apply"
  grep -q 'data-list-after-apply-first' src/app/globals.css \
    || fail "List a role after first-click Apply must be visually certain"
  grep -q 'stays certain after Apply wins the first click' tests/rank.test.ts \
    || fail "rank tests must cover List a role after first-click Apply"
  grep -q 'data-list-after-apply-first' tests/rank.test.ts \
    || fail "rank tests must stamp List a role after first-click Apply"
  grep -q 'data-list-after-apply-first' tests/period.test.ts \
    || fail "period tests must keep closed-week List a role after first-click unstamped"
  grep -q 'data-apply-after-list-first' src/components/board/listing-card.tsx \
    || fail "occupied #1 Apply must stay certain after List a role is concentrated"
  grep -q 'data-apply-after-list-first' src/app/globals.css \
    || fail "Apply after concentrated List a role must be visually certain"
  grep -q 'stays certain after List a role is concentrated' tests/rank.test.ts \
    || fail "rank tests must cover Apply after concentrated List a role"
  grep -q 'data-apply-after-list-first' tests/rank.test.ts \
    || fail "rank tests must stamp Apply after concentrated List a role"
  grep -q 'data-apply-after-list-first' tests/period.test.ts \
    || fail "period tests must keep closed-week Apply after concentrated List a role unstamped"
  grep -q 'data-list-after-apply-two' src/components/board/listing-card.tsx \
    || fail "occupied List a role after Apply must stay certain after Apply is re-concentrated"
  grep -q 'data-list-after-apply-two' src/app/globals.css \
    || fail "List a role after Apply is re-concentrated must be visually certain"
  grep -q 'lists after Apply is re-concentrated without another hop' tests/rank.test.ts \
    || fail "rank tests must cover List a role after Apply is re-concentrated"
  grep -q 'data-list-after-apply-two' tests/rank.test.ts \
    || fail "rank tests must stamp List a role after Apply is re-concentrated"
  grep -q 'data-list-after-apply-two' tests/period.test.ts \
    || fail "period tests must keep closed-week List a role after Apply is re-concentrated unstamped"
  grep -q 'data-apply-after-list-two' src/components/board/listing-card.tsx \
    || fail "occupied #1 Apply must stay certain after List a role is re-concentrated"
  grep -q 'data-apply-after-list-two' src/app/globals.css \
    || fail "Apply after List a role is re-concentrated must be visually certain"
  grep -q 'stays certain after List a role is re-concentrated' tests/rank.test.ts \
    || fail "rank tests must cover Apply after List a role is re-concentrated"
  grep -q 'data-apply-after-list-two' tests/rank.test.ts \
    || fail "rank tests must stamp Apply after List a role is re-concentrated"
  grep -q 'data-apply-after-list-two' tests/period.test.ts \
    || fail "period tests must keep closed-week Apply after List a role is re-concentrated unstamped"
  grep -q 'data-list-after-apply-three' src/components/board/listing-card.tsx \
    || fail "occupied List a role after Apply must stay certain after Apply is re-concentrated again"
  grep -q 'data-list-after-apply-three' src/app/globals.css \
    || fail "List a role after Apply is re-concentrated again must be visually certain"
  grep -q 'lists after Apply is re-concentrated again without another hop' tests/rank.test.ts \
    || fail "rank tests must cover List a role after Apply is re-concentrated again"
  grep -q 'data-list-after-apply-three' tests/rank.test.ts \
    || fail "rank tests must stamp List a role after Apply is re-concentrated again"
  grep -q 'data-list-after-apply-three' tests/period.test.ts \
    || fail "period tests must keep closed-week List a role after Apply is re-concentrated again unstamped"
  grep -q 'data-list-after-apply-four' src/components/board/listing-card.tsx \
    || fail "occupied List a role must stay certain after Apply is re-concentrated again"
  grep -q 'data-list-after-apply-four' src/app/globals.css \
    || fail "List a role after Apply is re-concentrated again must stay a full-width dashed hop"
  grep -q 'min-height: 3.75rem' src/app/globals.css \
    || fail "List a role after Apply is re-concentrated again must stay taller than 3.25rem"
  grep -q 'lists after Apply is re-concentrated again without another named hop' tests/rank.test.ts \
    || fail "rank tests must cover List a role after Apply is re-concentrated again without another named hop"
  grep -q 'data-list-after-apply-four' tests/rank.test.ts \
    || fail "rank tests must stamp List a role after Apply is re-concentrated again without another named hop"
  grep -q 'data-list-after-apply-four' tests/period.test.ts \
    || fail "period tests must keep closed-week List a role after Apply is re-concentrated again unstamped"
  grep -q 'data-list-after-apply-five' src/components/board/listing-card.tsx \
    || fail "occupied List a role must stay certain after Apply is re-concentrated again"
  grep -q 'data-list-after-apply-five' src/app/globals.css \
    || fail "List a role after Apply is re-concentrated again must stay a full-width dashed hop"
  grep -q 'min-height: 4.25rem' src/app/globals.css \
    || fail "List a role after Apply is re-concentrated again must stay taller than 3.75rem"
  grep -q 'lists after Apply is re-concentrated again so List a role does not disappear' tests/rank.test.ts \
    || fail "rank tests must cover List a role after Apply is re-concentrated again so it does not disappear"
  grep -q 'data-list-after-apply-five' tests/rank.test.ts \
    || fail "rank tests must stamp List a role after Apply is re-concentrated again so it does not disappear"
  grep -q 'data-list-after-apply-five' tests/period.test.ts \
    || fail "period tests must keep closed-week List a role after Apply is re-concentrated again unstamped"
  grep -q 'data-list-after-apply-six' src/components/board/listing-card.tsx \
    || fail "occupied List a role must stay certain after Apply is re-concentrated again"
  grep -q 'data-list-after-apply-six' src/app/globals.css \
    || fail "List a role after Apply is re-concentrated again must stay a full-width dashed hop"
  grep -q 'min-height: 4.75rem' src/app/globals.css \
    || fail "List a role after Apply is re-concentrated again must stay taller than 4.25rem"
  grep -q 'lists after Apply is re-concentrated again so List a role does not disappear under Apply' tests/rank.test.ts \
    || fail "rank tests must cover List a role after Apply is re-concentrated again so it does not disappear under Apply"
  grep -q 'data-list-after-apply-six' tests/rank.test.ts \
    || fail "rank tests must stamp List a role after Apply is re-concentrated again so it does not disappear under Apply"
  grep -q 'data-list-after-apply-six' tests/period.test.ts \
    || fail "period tests must keep closed-week List a role after Apply is re-concentrated again unstamped"
  grep -q 'data-list-after-apply-seven' src/components/board/listing-card.tsx \
    || fail "occupied List a role must stay certain after Apply is re-concentrated again"
  grep -q 'data-list-after-apply-seven' src/app/globals.css \
    || fail "List a role after Apply is re-concentrated again must stay a full-width dashed hop"
  grep -q 'lists after Apply is re-concentrated again so List a role does not disappear under that louder Apply' tests/rank.test.ts \
    || fail "rank tests must cover List a role after Apply is re-concentrated again so it does not disappear under that louder Apply"
  grep -q 'data-list-after-apply-seven' tests/rank.test.ts \
    || fail "rank tests must stamp List a role after Apply is re-concentrated again so it does not disappear under that louder Apply"
  grep -q 'data-list-after-apply-seven' tests/period.test.ts \
    || fail "period tests must keep closed-week List a role after Apply is re-concentrated again unstamped"
  grep -q 'data-apply-after-list-three' src/components/board/listing-card.tsx \
    || fail "occupied #1 Apply must stay certain after List a role is re-concentrated again"
  grep -q 'data-apply-after-list-three' src/app/globals.css \
    || fail "Apply after List a role is re-concentrated again must be visually certain"
  grep -q 'stays certain after List a role is re-concentrated again' tests/rank.test.ts \
    || fail "rank tests must cover Apply after List a role is re-concentrated again"
  grep -q 'data-apply-after-list-three' tests/rank.test.ts \
    || fail "rank tests must stamp Apply after List a role is re-concentrated again"
  grep -q 'data-apply-after-list-three' tests/period.test.ts \
    || fail "period tests must keep closed-week Apply after List a role is re-concentrated again unstamped"
  grep -q 'data-apply-after-list-four' src/components/board/listing-card.tsx \
    || fail "occupied #1 Apply must stay certain after List a role is re-concentrated again without another named hop"
  grep -q 'data-apply-after-list-four' src/app/globals.css \
    || fail "Apply after List a role is re-concentrated again must stay a filled hop taller than dashed List"
  grep -q 'min-height: 5.15rem' src/app/globals.css \
    || fail "Apply after List a role is re-concentrated again must stay taller than 4.65rem"
  grep -q 'stays certain after List a role is re-concentrated again without another named hop' tests/rank.test.ts \
    || fail "rank tests must cover Apply after List a role is re-concentrated again without another named hop"
  grep -q 'data-apply-after-list-four' tests/rank.test.ts \
    || fail "rank tests must stamp Apply after List a role is re-concentrated again without another named hop"
  grep -q 'data-apply-after-list-four' tests/period.test.ts \
    || fail "period tests must keep closed-week Apply after List a role is re-concentrated again unstamped"
  grep -q 'data-apply-after-list-five' src/components/board/listing-card.tsx \
    || fail "occupied #1 Apply must stay certain after List a role is re-concentrated again so Apply does not disappear"
  grep -q 'data-apply-after-list-five' src/app/globals.css \
    || fail "Apply after List a role is re-concentrated again must stay a filled hop taller than dashed List"
  grep -q 'min-height: 5.65rem' src/app/globals.css \
    || fail "Apply after List a role is re-concentrated again must stay taller than 5.15rem"
  grep -q 'stays certain after List a role is re-concentrated again so Apply does not disappear' tests/rank.test.ts \
    || fail "rank tests must cover Apply after List a role is re-concentrated again so Apply does not disappear"
  grep -q 'data-apply-after-list-five' tests/rank.test.ts \
    || fail "rank tests must stamp Apply after List a role is re-concentrated again so Apply does not disappear"
  grep -q 'data-apply-after-list-five' tests/period.test.ts \
    || fail "period tests must keep closed-week Apply after List a role is re-concentrated again unstamped"
  grep -q 'data-apply-after-list-six' src/components/board/listing-card.tsx \
    || fail "occupied #1 Apply must stay certain after List a role is re-concentrated again so Apply does not disappear under List"
  grep -q 'data-apply-after-list-six' src/app/globals.css \
    || fail "Apply after List a role is re-concentrated again must stay a filled hop taller than dashed List"
  grep -q 'min-height: 6.15rem' src/app/globals.css \
    || fail "Apply after List a role is re-concentrated again must stay taller than 5.65rem"
  grep -q 'stays certain after List a role is re-concentrated again so Apply does not disappear under List' tests/rank.test.ts \
    || fail "rank tests must cover Apply after List a role is re-concentrated again so Apply does not disappear under List"
  grep -q 'data-apply-after-list-six' tests/rank.test.ts \
    || fail "rank tests must stamp Apply after List a role is re-concentrated again so Apply does not disappear under List"
  grep -q 'data-apply-after-list-six' tests/period.test.ts \
    || fail "period tests must keep closed-week Apply after List a role is re-concentrated again unstamped"
  grep -q 'laneEmpty ? claimForm : null' src/components/board/board.tsx \
    || fail "empty week must keep Claim #1 above the empty bay"
  grep -q 'laneEmpty ? null : claimForm' src/components/board/board.tsx \
    || fail "occupied wall must put List a role after the prize sheets"
  grep -q 'claim\[data-list-role\]' src/app/globals.css \
    || fail "occupied List a role claim must stay visually quieter than Apply #1"
  list_hop_rule="$(awk '/\.list-after-apply\[data-list-after-apply\]\[data-list-after-apply-first\]\[data-list-after-apply-two\]\[data-list-after-apply-three\]\[data-list-after-apply-four\]\[data-list-after-apply-five\]\[data-list-after-apply-six\]\[data-list-after-apply-seven\] \{/,/^\}/' src/app/globals.css)"
  echo "$list_hop_rule" | grep -q 'display: inline' \
    || fail "occupied List a role hop must stay inline quieter than filled Apply"
  echo "$list_hop_rule" | grep -q 'min-height: 0' \
    || fail "occupied List a role hop must not stay a 5.25rem first click"
  if echo "$list_hop_rule" | grep -q 'min-height: 5.25rem'; then
    fail "occupied List a role hop must not stay taller than Apply as a first click"
  fi
  grep -q 'occupied List a role stays quieter than Apply #1' tests/rank.test.ts \
    || fail "rank tests must cover occupied List a role quieter than Apply #1"
  if grep -nE 'data-list-after-apply-eight|data-apply-after-list-seven|data-list-quiet-after|data-apply-one-first' \
    src/components/board/listing-card.tsx src/components/board/board.tsx src/app/globals.css >/dev/null; then
    fail "occupied List a role quieter than Apply must not add a second named hop"
  fi
  grep -q 'data-salary' src/components/board/listing-card.tsx \
    || fail "job card must render optional salary as a fact"
  grep -q 'data-prize-title' src/components/board/listing-card.tsx \
    || fail "occupied #1 must stamp the role title as the prize"
  grep -q 'data-prize-title' src/app/globals.css \
    || fail "occupied #1 prize title must be visually certain"
  grep -q 'clamp(1.55rem' src/app/globals.css \
    || fail "occupied #1 prize title must read larger than \$bid + clicks"
  grep -q 'role title is the prize before' tests/rank.test.ts \
    || fail "rank tests must cover prize-before-price on occupied #1"
  grep -q 'data-prize-title' tests/rank.test.ts \
    || fail "rank tests must stamp the occupied #1 prize title"
  grep -q 'data-prize-title' tests/period.test.ts \
    || fail "period tests must keep empty/closed weeks honest about the prize title"
  grep -q 'data-later-fact' src/components/board/listing-card.tsx \
    || fail "occupied #1 must stamp \$bid + clicks as a later fact"
  grep -q 'meta\[data-later-fact\]' src/app/globals.css \
    || fail "occupied #1 later-fact money must stay quieter than the prize title"
  grep -q 'meta\[data-later-fact\] .bid' src/app/globals.css \
    || fail "occupied #1 later-fact \$bid must stay muted beside the prize title"
  grep -q 'meta\[data-later-fact\] .clicks' src/app/globals.css \
    || fail "occupied #1 later-fact clicks must stay muted beside the prize title"
  grep -q 'stays a later fact' tests/rank.test.ts \
    || fail "rank tests must keep occupied #1 \$bid a later fact"
  grep -q 'data-later-fact' tests/rank.test.ts \
    || fail "rank tests must stamp occupied #1 \$bid as a later fact"
  grep -q 'data-later-fact' tests/period.test.ts \
    || fail "period tests must keep empty/closed weeks honest about later-fact \$bid"
  grep -q 'data-later-quiet' src/components/board/listing-card.tsx \
    || fail "later ranks must stamp quieter type/outline/chrome than occupied #1"
  grep -q 'data-later-quiet' src/app/globals.css \
    || fail "later-rank quiet chrome must be visually certain"
  grep -q 'data-later-pack' src/components/board/leaderboard.tsx \
    || fail "occupied later ranks must group after the #1 prize pack"
  grep -q 'data-prize-pack' src/components/board/leaderboard.tsx \
    || fail "occupied #1 must stay in its own prize pack"
  grep -q 'leaderboard-later' src/components/board/leaderboard.tsx \
    || fail "later ranks must use a later leaderboard, not the prize grid"
  grep -q 'leaderboard-later' src/app/globals.css \
    || fail "later-rank pack must stay visually certain as a roster"
  grep -q 'later-sheet' src/components/board/listing-card.tsx \
    || fail "later-rank cards must use later-sheet anatomy, not the #1 job-sheet"
  grep -q 'later-sheet' src/app/globals.css \
    || fail "later-sheet roster chrome must be visually certain"
  grep -q 'data-later-role' src/components/board/listing-card.tsx \
    || fail "later-rank titles must sit on later-role, not the #1 prize title node"
  grep -q 'later-sheet\[data-later-quiet\] \.later-role' src/app/globals.css \
    || fail "later-rank role line must stay quieter than the occupied #1 prize"
  later_role_rule="$(awk '/\.later-sheet\[data-later-quiet\] \.later-role \{/,/^\}/' src/app/globals.css)"
  echo "$later_role_rule" | grep -q 'font-size: 0.92rem' \
    || fail "later-rank titles must read smaller than the occupied #1 prize"
  if echo "$later_role_rule" | grep -q 'var(--muted)'; then
    fail "later-rank titles must recede by anatomy, not --muted on the prize title node"
  fi
  if echo "$later_role_rule" | grep -q '0.78rem'; then
    fail "later-rank titles must not stamp-mute the prize title at 0.78rem"
  fi
  if grep -nE 'data-later-quiet\] \.title|\.title\[data-later-quiet\]' src/app/globals.css >/dev/null; then
    fail "later-rank titles must not mute the same .title node as occupied #1"
  fi
  if grep -nE 'data-later-title|data-title-later-quiet|data-later-quiet-title|data-later-title-quiet' \
    src/components/board/listing-card.tsx src/components/board/leaderboard.tsx src/app/globals.css >/dev/null; then
    fail "later-rank titles must not add a stamp-only mute on the same title node"
  fi
  grep -q 'occupied later-rank titles stay quieter than #1' tests/rank.test.ts \
    || fail "rank tests must cover later-rank titles quieter than the #1 prize"
  grep -q 'later-rank titles stay quieter than #1' tests/rank.test.ts \
    || fail "rank tests must cover quieter later-rank titles on an occupied wall"
  grep -q 'data-later-pack' tests/rank.test.ts \
    || fail "rank tests must stamp the later-rank pack"
  grep -q 'data-later-pack' tests/period.test.ts \
    || fail "period tests must keep empty/closed weeks honest about the later-rank pack"
  grep -q 'data-later-role' tests/rank.test.ts \
    || fail "rank tests must stamp later-rank titles as later-role"
  grep -q 'data-later-role' tests/period.test.ts \
    || fail "period tests must keep empty/closed weeks honest about later-role titles"
  grep -q 'apply\[data-apply-later\]' src/app/globals.css \
    || fail "later-rank Apply must stay an outlined hop"
  grep -q 'apply\[data-apply-later\]\[data-apply-later-outlined\]' src/app/globals.css \
    || fail "later-rank Apply must stay outlined on the existing hop"
  grep -q 'border: 1px solid var(--fg)' src/app/globals.css \
    || fail "later-rank Apply must stay an outline, not a filled #1 hop"
  grep -q 'background: transparent' src/app/globals.css \
    || fail "later-rank Apply must stay outlined, not filled like occupied #1"
  grep -q 'later ranks stay quieter than occupied #1' tests/rank.test.ts \
    || fail "rank tests must cover quieter later ranks on an occupied wall"
  grep -q 'later-rank Apply stays outlined' tests/rank.test.ts \
    || fail "rank tests must keep later-rank Apply outlined — filled Apply is #1 only"
  grep -q 'data-apply-later-outlined' tests/rank.test.ts \
    || fail "rank tests must stamp later-rank Apply as outlined"
  grep -q 'data-apply-later-outlined' tests/period.test.ts \
    || fail "period tests must keep closed-week later Apply unstamped for outline"
  grep -q 'data-later-quiet' tests/rank.test.ts \
    || fail "rank tests must stamp quieter later ranks"
  grep -q 'data-later-quiet' tests/period.test.ts \
    || fail "period tests must keep empty/closed weeks honest about later-rank quiet"
  grep -q 'hiring wall' tests/rank.test.ts \
    || fail "rank tests must cover the hiring-wall layout"
  if grep -nE 'top company|featured employer|star rating' \
    src/components/board/*.tsx src/app/page.tsx >/dev/null; then
    fail "hiring wall must not add social proof"
  fi
  grep -q 'getBoardListings' src/lib/board.ts \
    || fail "board.ts must expose getBoardListings"
  grep -q 'rankListings' src/app/page.tsx \
    || fail "page.tsx must rank listings through rankListings"
  grep -q 'getBoardListings' src/app/page.tsx \
    || fail "page.tsx must load the board through getBoardListings"
  grep -q 'export function planCheckout' src/lib/listing.ts \
    || fail "listing.ts must export planCheckout"
  grep -q 'export function applyPaidCheckout' src/lib/listing.ts \
    || fail "listing.ts must apply paid create/raise"
  for code in raise_too_small raise_not_owner identity_taken; do
    grep -q "$code" src/lib/listing.ts \
      || fail "listing.ts must emit $code"
    grep -q "$code" tests/checkout.test.ts \
      || fail "checkout tests must cover $code"
  done
  grep -q 'chargeUsd' src/lib/listing.ts \
    || fail "listing.ts must charge the raise difference"
  grep -q 'planCheckout' src/app/checkout/route.ts \
    || fail "checkout route must plan raise vs create"
  grep -q 'planCheckout' src/payments/fixture.ts \
    || fail "fixture checkout must re-check raise rules"
  if grep -nE '\b(Acme|Google|Stripe)\b' src/lib/board.ts src/app/page.tsx >/dev/null; then
    fail "live board must not invent company listings"
  fi

  echo "== about and rules pages =="
  for f in src/app/about/page.tsx src/app/rules/page.tsx tests/pages.test.ts; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'href="/about"' src/app/layout.tsx || fail "board nav must link to /about"
  grep -q 'href="/rules"' src/app/layout.tsx || fail "board nav must link to /rules"
  grep -q 'no ads' src/app/about/page.tsx || fail "about must state no ads"
  grep -q 'no API keys' src/app/about/page.tsx || fail "about must state no API keys"
  grep -q 'no revenue share' src/app/about/page.tsx || fail "about must state no revenue share"
  grep -q 'Rank is the bid' src/app/about/page.tsx || fail "about must state rank is the bid"
  grep -q 'global remote' src/app/about/page.tsx || fail "about must state global remote"
  grep -q '≥ $5' src/app/rules/page.tsx || fail "rules must state min $5"
  grep -q '$50,000' src/app/rules/page.tsx || fail "rules must state max $50,000"
  grep -q 'Monday 00:00' src/app/rules/page.tsx || fail "rules must state weekly UTC reset"
  grep -q 'never invent salaries' src/app/rules/page.tsx || fail "rules must forbid invented salaries"
  grep -q 'newBid − currentBid' src/app/rules/page.tsx || fail "rules must state raise-the-difference"
  grep -q 'Telegram' src/app/rules/page.tsx || fail "rules must document chat-link rejects"
  grep -q 'NSFW' src/app/rules/page.tsx || fail "rules must document NSFW rejects"

  echo "== anti-spam URL rules =="
  for f in src/lib/urls.ts tests/urls.test.ts; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'export function canonicalizeApplyUrl' src/lib/urls.ts \
    || fail "urls.ts must export canonicalizeApplyUrl"
  grep -q 'export function outboundApplyUrl' src/lib/urls.ts \
    || fail "urls.ts must export outboundApplyUrl"
  for code in invalid_url tracking_stripped_empty chat_link_forbidden \
    nsfw_forbidden shortener_unresolved; do
    grep -q "$code" src/lib/urls.ts || fail "urls.ts must emit $code"
    grep -q "$code" tests/urls.test.ts || fail "url tests must cover $code"
  done
  grep -q 'utm_' tests/urls.test.ts || fail "url tests must strip tracking query"
  grep -q 't.me' tests/urls.test.ts || fail "url tests must reject Telegram"
  grep -q 'onlyfans' tests/urls.test.ts || fail "url tests must reject NSFW"
  grep -q 'SHORTENER_FIXTURES\|resolveShortener' tests/urls.test.ts \
    || fail "url tests must resolve shorteners via fixtures"
  if grep -nE '[^a-zA-Z_]fetch\(' src/lib/urls.ts >/dev/null; then
    fail "urls.ts must not call global fetch (tests stay offline)"
  fi
  echo "== weekly reset + public apply clicks =="
  for f in src/lib/period.ts src/app/out/\[id\]/route.ts tests/period.test.ts; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'export function isoWeekPeriodId' src/lib/period.ts \
    || fail "period.ts must export isoWeekPeriodId"
  grep -q 'export function currentPeriodMeta' src/lib/period.ts \
    || fail "period.ts must export currentPeriodMeta"
  grep -q 'export function resolveBoardPeriod' src/lib/period.ts \
    || fail "period.ts must resolve ?period= closed weeks"
  grep -q 'Monday' src/lib/period.ts \
    || fail "period.ts must document Monday 00:00 UTC"
  grep -q 'export async function GET' src/app/out/\[id\]/route.ts \
    || fail "click route must export GET"
  grep -q 'NextResponse.redirect' src/app/out/\[id\]/route.ts \
    || fail "click route must 302 to the apply URL"
  grep -q 'incrementClicks' src/app/out/\[id\]/route.ts \
    || fail "click route must increment public clicks"
  grep -q 'outboundApplyUrl' src/app/out/\[id\]/route.ts \
    || fail "click route must use the canonical outbound URL"
  grep -q 'resolveBoardPeriod' src/app/page.tsx \
    || fail "board must resolve the period via resolveBoardPeriod"
  grep -q 'params.period' src/app/page.tsx \
    || fail "board must accept ?period="
  grep -q 'getLiveBoardListings' src/lib/board.ts \
    || fail "board.ts must expose getLiveBoardListings"
  grep -q 'href={applyClickPath' src/components/board/listing-card.tsx \
    || fail "listing card must link Apply through /out/:id"
  grep -q 'data-clicks' src/components/board/listing-card.tsx \
    || fail "listing card must show public clicks"
  grep -q 'Monday 00:00 UTC' tests/period.test.ts \
    || fail "period tests must cover Monday 00:00 UTC"
  grep -q 'getLiveBoardListings' tests/period.test.ts \
    || fail "period tests must drop old bids from the live query"
  grep -q '/out/' tests/period.test.ts \
    || fail "period tests must cover GET /out/:id"
  grep -q '302' tests/period.test.ts \
    || fail "period tests must assert the 302 hop"

  echo "== live-smoke stays operator-only =="
  [[ -f scripts/live-smoke.sh ]] || fail "missing scripts/live-smoke.sh"
  [[ -x scripts/live-smoke.sh ]] || fail "scripts/live-smoke.sh must be executable"
  [[ -f docs/live-smoke.md ]] || fail "missing docs/live-smoke.md"
  [[ -s docs/live-smoke.md ]] || fail "empty docs/live-smoke.md"
  if grep -Eq '^\s*(bash )?(\./)?scripts/live-smoke\.sh' scripts/test.sh; then
    fail "test.sh must not invoke live-smoke.sh"
  fi
  if grep -E '^[[:space:]]*(export[[:space:]]+)?POLAR_LIVE=1' scripts/test.sh >/dev/null; then
    fail "test.sh must not set POLAR_LIVE=1"
  fi
  grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' scripts/live-smoke.sh \
    || fail "live-smoke.sh must name BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
  grep -q 'POLAR_LIVE' scripts/live-smoke.sh \
    || fail "live-smoke.sh must gate live Polar on POLAR_LIVE"
  grep -q 'live-smoke refuses CI=true' scripts/live-smoke.sh \
    || fail "live-smoke.sh must refuse CI=true"
  grep -q 'PASS-ERROR' docs/live-smoke.md || fail "docs/live-smoke.md missing PASS-ERROR"
  grep -q 'BLOCKED-SECRET' docs/live-smoke.md || fail "docs/live-smoke.md missing BLOCKED-SECRET"
  for n in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
    grep -q "| ${n} |" docs/live-smoke.md \
      || fail "docs/live-smoke.md missing SPEC §10 row $n"
  done

  echo "== install =="
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi

  unset POLAR_LIVE
  unset POLAR_ACCESS_TOKEN
  unset POLAR_WEBHOOK_SECRET
  export POLAR_FIXTURE_ONLY=1
  [[ "${POLAR_LIVE:-}" != "1" ]] || fail "POLAR_LIVE must stay unset in test.sh"

  echo "== tsc --noEmit =="
  npx tsc --noEmit

  echo "== unit tests =="
  if [[ -d tests ]] && find tests -name '*.test.ts' | grep -q .; then
    # Quoted so bash 3.2 does not eat **; Node 22's test runner expands the glob.
    npx tsx --tsconfig tsconfig.test.json --test 'tests/**/*.test.ts'
  else
    echo "skip: no tests/**/*.test.ts yet"
  fi
fi

echo "OK: buildable and testable"
