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
  grep -q 'export function rankListings' src/lib/rank.ts \
    || fail "rank.ts must export rankListings"
  grep -q 'Outbid' src/components/board/bid-form.tsx \
    || fail "bid form must render Outbid"
  grep -q 'data-empty-lane' src/components/board/leaderboard.tsx \
    || fail "leaderboard must have an honest empty-lane state"
  grep -q 'getBoardListings' src/lib/board.ts \
    || fail "board.ts must expose getBoardListings"
  grep -q 'rankListings' src/app/page.tsx \
    || fail "page.tsx must rank listings through rankListings"
  grep -q 'getBoardListings' src/app/page.tsx \
    || fail "page.tsx must load the board through getBoardListings"
  if grep -nE '\b(Acme|Google|Stripe)\b' src/lib/board.ts src/app/page.tsx >/dev/null; then
    fail "live board must not invent company listings"
  fi

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
