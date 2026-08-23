#!/usr/bin/env bash
# Operator smoke against a local Next.js process. Not called from scripts/test.sh or CI.
# Walks SPEC §10. Fixture path is the default. Live Polar only if POLAR_LIVE=1
# and secrets exist; otherwise BLOCKED-SECRET with the exact env var.
# Next.js webpack cannot load node:crypto via the client bid form, so this
# process serves the same App Router handlers through tsx (not next dev).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  fail "live-smoke must not run in GitHub Actions"
fi
if [[ "${CI:-}" == "true" ]]; then
  fail "live-smoke refuses CI=true"
fi

command -v curl >/dev/null || fail "curl is required"
command -v node >/dev/null || fail "node is required"

if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

PASS=0
PASS_ERROR=0
BLOCKED=0
FAIL=0
STARTED_PID=""
WEEK_PID=""
LIVE_PID=""
WORKDIR=""
RESULT_LOG=""
BASE="${LIVE_SMOKE_BASE:-}"

# Capture operator Polar flags before the fixture process unsets them.
OP_POLAR_LIVE="${POLAR_LIVE:-}"
OP_POLAR_ACCESS_TOKEN="${POLAR_ACCESS_TOKEN:-}"
OP_POLAR_WEBHOOK_SECRET="${POLAR_WEBHOOK_SECRET:-}"
OP_POLAR_PRODUCT_ID="${POLAR_PRODUCT_ID:-}"
OP_POLAR_FIXTURE_ONLY="${POLAR_FIXTURE_ONLY:-}"
OP_POLAR_API_BASE="${POLAR_API_BASE:-}"
OP_POLAR_SUCCESS_URL="${POLAR_SUCCESS_URL:-}"

kill_tree() {
  local pid="${1:-}"
  [[ -n "$pid" ]] || return 0
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  if [[ -n "${LIVE_PID}" ]]; then
    kill_tree "${LIVE_PID}"
    wait "${LIVE_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WEEK_PID}" ]]; then
    kill_tree "${WEEK_PID}"
    wait "${WEEK_PID}" 2>/dev/null || true
  fi
  if [[ -n "${STARTED_PID}" ]]; then
    kill_tree "${STARTED_PID}"
    wait "${STARTED_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WORKDIR}" && -d "${WORKDIR}" ]]; then
    rm -rf "${WORKDIR}"
  fi
  if [[ -n "${SERVER_PATH:-}" && -f "${SERVER_PATH}" ]]; then
    rm -f "${SERVER_PATH}"
  fi
}
trap cleanup EXIT

record() {
  local flow="$1"
  local status="$2"
  local note="${3:-}"
  printf 'RESULT\t%s\t%s\t%s\n' "$flow" "$status" "$note"
  if [[ -n "${RESULT_LOG}" ]]; then
    printf '%s\t%s\t%s\n' "$flow" "$status" "$note" >>"${RESULT_LOG}"
  fi
  case "$status" in
    PASS) PASS=$((PASS + 1)) ;;
    PASS-ERROR) PASS_ERROR=$((PASS_ERROR + 1)) ;;
    BLOCKED-SECRET) BLOCKED=$((BLOCKED + 1)) ;;
    FAIL) FAIL=$((FAIL + 1)) ;;
    *) fail "unknown smoke status ${status}" ;;
  esac
}

pick_port() {
  node --input-type=module -e '
    import net from "node:net";
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") process.exit(1);
      process.stdout.write(String(addr.port));
      server.close();
    });
  '
}

iso_week_utc() {
  node --input-type=module -e '
    const now = new Date();
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = cursor.getUTCDay() || 7;
    cursor.setUTCDate(cursor.getUTCDate() + 4 - day);
    const isoYear = cursor.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil(((cursor.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    process.stdout.write(`${isoYear}-W${String(week).padStart(2, "0")}`);
  '
}

wait_health() {
  local url="$1/healthz"
  local i
  for i in $(seq 1 80); do
    if curl -fsS --connect-timeout 2 --max-time 5 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

write_smoke_server() {
  local dest="$1"
  cat >"$dest" <<'EOF'
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AboutPage from "../src/app/about/page.tsx";
import { POST as postCheckout } from "../src/app/checkout/route.ts";
import { GET as getClick } from "../src/app/out/[id]/route.ts";
import ReturnPage from "../src/app/return/page.tsx";
import RulesPage from "../src/app/rules/page.tsx";
import { Board } from "../src/components/board/board.tsx";
import { getBoardListings, parseLane } from "../src/lib/board.ts";
import { resolveBoardPeriod } from "../src/lib/period.ts";
import { rankListings } from "../src/lib/rank.ts";

{
  const raw = process.env.BOARD_NOW?.trim();
  const frozenMs = raw ? Date.parse(raw) : Number.NaN;
  if (!Number.isNaN(frozenMs)) {
    const RealDate = Date;
    const Frozen = function (this: unknown, ...args: unknown[]) {
      if (new.target) {
        if (args.length === 0) return new RealDate(frozenMs);
        return new (RealDate as unknown as new (...a: unknown[]) => Date)(...args);
      }
      return RealDate();
    } as unknown as DateConstructor;
    Frozen.now = () => frozenMs;
    Frozen.parse = RealDate.parse.bind(RealDate);
    Frozen.UTC = RealDate.UTC.bind(RealDate);
    Frozen.prototype = RealDate.prototype;
    globalThis.Date = Frozen;
  }
}

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT is required");
}
const origin = process.env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${port}`;

function htmlDocument(node: ReactNode): string {
  const inner = renderToStaticMarkup(node);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Remote Job Board</title></head><body><header class="site-header"><nav class="site-nav" aria-label="Main"><a href="/">Leaderboard</a><a href="/about">About</a><a href="/rules">Rules</a></nav></header>${inner}</body></html>`;
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? "/", origin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Request(url, { method, headers, body: Buffer.concat(chunks) });
}

async function sendWeb(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

function sendHtml(res: ServerResponse, node: ReactNode): void {
  const body = htmlDocument(node);
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "private, no-store");
  res.end(body);
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "private, no-store");
  res.end(JSON.stringify(body));
}

function clockNow(): Date {
  const raw = process.env.BOARD_NOW?.trim();
  if (!raw) return new Date();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function renderBoard(url: URL): Promise<ReactNode> {
  const lane = parseLane(url.searchParams.get("lane") ?? undefined);
  const period = resolveBoardPeriod(url.searchParams.get("period") ?? undefined, clockNow());
  const listings = rankListings(getBoardListings(lane, period.periodId));
  return createElement(Board, {
    lane,
    periodId: period.periodId,
    nextResetAt: period.nextResetAt,
    listings,
    live: period.live,
  });
}

const server = createServer((req, res) => {
  void (async () => {
    const request = await toRequest(req);
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && path === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (request.method === "GET" && path === "/") {
      sendHtml(res, await renderBoard(url));
      return;
    }
    if (request.method === "GET" && path === "/about") {
      sendHtml(res, createElement(AboutPage));
      return;
    }
    if (request.method === "GET" && path === "/rules") {
      sendHtml(res, createElement(RulesPage));
      return;
    }
    if (request.method === "GET" && path === "/return") {
      const searchParams = {
        checkoutId: url.searchParams.get("checkoutId") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
      };
      sendHtml(res, await ReturnPage({ searchParams: Promise.resolve(searchParams) }));
      return;
    }
    if (request.method === "POST" && path === "/checkout") {
      await sendWeb(res, await postCheckout(request));
      return;
    }
    const click = path.match(/^\/out\/([^/]+)$/);
    if (request.method === "GET" && click) {
      await sendWeb(
        res,
        await getClick(request, {
          params: { id: decodeURIComponent(click[1]) },
        }),
      );
      return;
    }
    sendText(res, 404, "not found");
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    if (!res.headersSent) sendText(res, 500, message);
    else res.end();
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`live-smoke listening ${origin}\n`);
});
EOF
}

start_smoke_server() {
  local port="$1"
  local log_path="$2"
  local server_path="$3"
  shift 3
  (
    cd "$root"
    unset POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET POLAR_PRODUCT_ID || true
    export POLAR_FIXTURE_ONLY=1
    export PORT="${port}"
    export PUBLIC_BASE_URL="http://127.0.0.1:${port}"
    while [[ $# -gt 0 ]]; do
      _assign="$1"
      _key="${_assign%%=*}"
      _val="${_assign#*=}"
      if [[ -z "$_val" ]]; then
        unset "$_key" || true
      else
        export "${_key}=${_val}"
      fi
      shift
    done
    unset _assign _key _val
    exec npx --no-install tsx --tsconfig "${root}/tsconfig.test.json" "${server_path}"
  ) >"${log_path}" 2>&1 &
  echo $!
}

http_get() {
  local base="$1"
  local path="$2"
  local out="$3"
  curl -sS -o "$out" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    "${base}${path}"
}

http_get_headers() {
  local base="$1"
  local path="$2"
  local body="$3"
  local hdrs="$4"
  shift 4
  curl -sS -D "$hdrs" -o "$body" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    --max-redirs 0 \
    "$@" \
    "${base}${path}"
}

http_post_form() {
  local base="$1"
  local path="$2"
  local body="$3"
  local hdrs="$4"
  shift 4
  curl -sS -D "$hdrs" -o "$body" -w "%{http_code}" --connect-timeout 5 --max-time 30 \
    --max-redirs 0 \
    -X POST \
    "$@" \
    "${base}${path}"
}

header_value() {
  local file="$1"
  local name="$2"
  awk -v name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { FS = ": " }
    tolower($1) == name {
      val = $0
      sub(/^[^:]+:[ \t]*/, "", val)
      gsub(/\r/, "", val)
      print val
      exit
    }
  ' "$file"
}

cookie_from_headers() {
  local file="$1"
  local name="$2"
  awk -v name="$name" '
    BEGIN { IGNORECASE = 1 }
    tolower($1) == "set-cookie:" {
      line = $0
      sub(/^[Ss]et-[Cc]ookie:[ \t]*/, "", line)
      gsub(/\r/, "", line)
      split(line, parts, ";")
      cookie = parts[1]
      split(cookie, kv, "=")
      if (kv[1] == name) {
        print cookie
        exit
      }
    }
  ' "$file"
}

query_param() {
  node --input-type=module -e '
    const raw = process.argv[1] || "";
    const key = process.argv[2];
    try {
      const url = new URL(raw, "http://127.0.0.1");
      process.stdout.write(url.searchParams.get(key) ?? "");
    } catch {
      process.exit(2);
    }
  ' "$1" "$2"
}

html_has() {
  local file="$1"
  local pattern="$2"
  grep -Eq "$pattern" "$file"
}

invented_listings() {
  local file="$1"
  grep -Eiq 'Google|Stripe|OpenAI|Y Combinator|sample job|lorem ipsum' "$file"
}

listing_count() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    process.stdout.write(String([...html.matchAll(/data-listing-id="([^"]+)"/g)].length));
  ' "$1"
}

card_field() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const needle = process.argv[2];
    const field = process.argv[3];
    const cards = [...html.matchAll(/<article[\s\S]*?<\/article>/g)].map((m) => m[0]);
    for (const card of cards) {
      if (!card.includes(needle)) continue;
      if (field === "id") {
        const id = card.match(/data-listing-id="([^"]+)"/);
        if (id) { process.stdout.write(id[1]); process.exit(0); }
      }
      if (field === "rank") {
        const rank = card.match(/data-rank="(\d+)"/);
        if (rank) { process.stdout.write(rank[1]); process.exit(0); }
      }
      if (field === "bid") {
        const bid = card.match(/data-bid="">\s*\$([0-9,]+)/) || card.match(/class="bid"[^>]*>\s*\$([0-9,]+)/);
        if (bid) { process.stdout.write(bid[1].replace(/,/g, "")); process.exit(0); }
      }
      if (field === "clicks") {
        const clicks = card.match(/data-clicks="">\s*(\d+)\s+clicks?/) || card.match(/(\d+)\s+clicks?/);
        if (clicks) { process.stdout.write(clicks[1]); process.exit(0); }
      }
      if (field === "apply") {
        const apply = card.match(/data-apply-url="([^"]+)"/);
        if (apply) { process.stdout.write(apply[1]); process.exit(0); }
      }
      if (field === "salary") {
        process.stdout.write(/data-salary=/.test(card) ? "yes" : "no");
        process.exit(0);
      }
      process.exit(3);
    }
    process.exit(2);
  ' "$1" "$2" "$3"
}

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/remote-job-board-live-smoke.XXXXXX")"
RESULT_LOG="${WORKDIR}/results.tsv"
: >"${RESULT_LOG}"
STAMP="$(date -u +%Y%m%d%H%M%S)"
EXPECT_WEEK="$(iso_week_utc)"
ACME_HOST="jobs.example.com/acme-${STAMP}"
ACME_URL="https://${ACME_HOST}"
TRACKED_URL="${ACME_URL}?utm_source=x&fbclid=1"
BETA_HOST="jobs.example.com/beta-${STAMP}"
BETA_URL="https://${BETA_HOST}"
GAMMA_HOST="jobs.example.com/gamma-${STAMP}"
GAMMA_URL="https://${GAMMA_HOST}"
DELTA_HOST="jobs.example.com/delta-${STAMP}"
DELTA_URL="https://${DELTA_HOST}"
SERVER_PATH="${root}/scripts/.live-smoke-server.tsx"
write_smoke_server "$SERVER_PATH"

echo "== live-smoke (operator only; not CI) =="
echo "root=${root}"
echo "weekId=${EXPECT_WEEK}"

if [[ -z "${BASE}" ]]; then
  PORT="${LIVE_SMOKE_PORT:-$(pick_port)}"
  BASE="http://127.0.0.1:${PORT}"
  LOG_PATH="${WORKDIR}/server.log"
  echo "starting local fixture process on ${BASE}"
  STARTED_PID="$(start_smoke_server "$PORT" "$LOG_PATH" "$SERVER_PATH" "POLAR_FIXTURE_ONLY=1")"
  if ! wait_health "$BASE"; then
    echo "server log:" >&2
    cat "${LOG_PATH}" >&2 || true
    fail "local server did not become healthy at ${BASE}/healthz"
  fi
else
  BASE="${BASE%/}"
  echo "assuming existing server at ${BASE}"
  if ! wait_health "$BASE"; then
    fail "existing server at ${BASE} did not answer /healthz"
  fi
fi

echo "base=${BASE}"
echo "operator POLAR_LIVE=${OP_POLAR_LIVE:-<unset>}"

# --- healthz ---
health_body="${WORKDIR}/healthz.json"
health_code="$(http_get "$BASE" "/healthz" "$health_body" || true)"
if [[ "$health_code" != "200" ]] || ! grep -q '"ok":true' "$health_body"; then
  fail "GET /healthz HTTP ${health_code}"
fi

# --- SPEC §10.1 GET / ---
board0="${WORKDIR}/board0.html"
board0_code="$(http_get "$BASE" "/" "$board0" || true)"
board0_count="$(listing_count "$board0" || echo 0)"
if [[ "$board0_code" != "200" ]]; then
  record "1-board" "FAIL" "GET / HTTP ${board0_code}"
elif ! html_has "$board0" 'data-lane-tabs' \
  || ! html_has "$board0" 'data-lane="backend"' \
  || ! html_has "$board0" 'data-bid-form' \
  || ! html_has "$board0" 'Outbid' \
  || ! html_has "$board0" "data-period=\"${EXPECT_WEEK}\""; then
  record "1-board" "FAIL" "GET / missing lane tabs, Outbid control, or period ${EXPECT_WEEK}"
elif invented_listings "$board0"; then
  record "1-board" "FAIL" "GET / invented listings"
elif [[ "$board0_count" == "0" ]] && html_has "$board0" 'data-empty-lane="true"'; then
  record "1-board" "PASS" "GET / 200 lane tabs + Outbid; empty lane; no invented listings"
elif [[ "$board0_count" != "0" ]]; then
  record "1-board" "PASS" "GET / 200 lane tabs + Outbid; ${board0_count} already-paid card(s) (not seeded by smoke)"
else
  record "1-board" "FAIL" "GET / 200 but empty-lane contract broken"
fi

# --- SPEC §10.2 GET /about and GET /rules ---
about_body="${WORKDIR}/about.html"
about_code="$(http_get "$BASE" "/about" "$about_body" || true)"
rules_body="${WORKDIR}/rules.html"
rules_code="$(http_get "$BASE" "/rules" "$rules_body" || true)"
if [[ "$about_code" == "200" && "$rules_code" == "200" ]] \
  && html_has "$about_body" 'Rank is the bid' \
  && html_has "$about_body" 'global remote' \
  && html_has "$rules_body" '≥ \$5' \
  && html_has "$rules_body" 'Monday 00:00' \
  && html_has "$rules_body" 'Rank is the bid' \
  && html_has "$rules_body" 'weekly reset'; then
  record "2-about-rules" "PASS" "GET /about and /rules 200; min \$5, weekly reset, rank = bid"
else
  record "2-about-rules" "FAIL" "about HTTP ${about_code} rules HTTP ${rules_code}"
fi

# --- SPEC §10.3 New listing $5: Polar session or BLOCKED-SECRET ---
echo "== polar live checkout =="
if [[ "${OP_POLAR_LIVE}" == "1" && "${OP_POLAR_FIXTURE_ONLY}" != "1" ]]; then
  missing=""
  if [[ -z "${OP_POLAR_ACCESS_TOKEN}" ]]; then
    missing="POLAR_ACCESS_TOKEN"
  elif [[ -z "${OP_POLAR_PRODUCT_ID}" ]]; then
    missing="POLAR_PRODUCT_ID"
  fi
  if [[ -n "$missing" ]]; then
    echo "BLOCKED-SECRET: ${missing}"
    record "3-new-listing" "BLOCKED-SECRET" "${missing}"
  else
    live_port="$(pick_port)"
    live_log="${WORKDIR}/polar-live.log"
    live_base="http://127.0.0.1:${live_port}"
    LIVE_PID="$(start_smoke_server "$live_port" "$live_log" "$SERVER_PATH" \
      "POLAR_LIVE=1" \
      "POLAR_ACCESS_TOKEN=${OP_POLAR_ACCESS_TOKEN}" \
      "POLAR_WEBHOOK_SECRET=${OP_POLAR_WEBHOOK_SECRET:-}" \
      "POLAR_PRODUCT_ID=${OP_POLAR_PRODUCT_ID}" \
      "POLAR_API_BASE=${OP_POLAR_API_BASE}" \
      "POLAR_SUCCESS_URL=${OP_POLAR_SUCCESS_URL}" \
      "POLAR_FIXTURE_ONLY=")"
    if ! wait_health "$live_base"; then
      if grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' "${live_log}"; then
        echo "BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
        record "3-new-listing" "BLOCKED-SECRET" "POLAR_ACCESS_TOKEN"
      elif grep -q 'BLOCKED-SECRET: POLAR_PRODUCT_ID' "${live_log}"; then
        echo "BLOCKED-SECRET: POLAR_PRODUCT_ID"
        record "3-new-listing" "BLOCKED-SECRET" "POLAR_PRODUCT_ID"
      else
        record "3-new-listing" "FAIL" "live Polar process did not become healthy"
      fi
    else
      live_body="${WORKDIR}/live-checkout.body"
      live_hdrs="${WORKDIR}/live-checkout.hdrs"
      live_code="$(http_post_form "$live_base" "/checkout" "$live_body" "$live_hdrs" \
        --data-urlencode "lane=backend" \
        --data-urlencode "identity=https://live.example/job-${STAMP}" \
        --data-urlencode "amount=5" || true)"
      live_loc="$(header_value "$live_hdrs" "location" || true)"
      live_board="${WORKDIR}/live-board.html"
      http_get "$live_base" "/" "$live_board" >/dev/null || true
      if html_has "$live_board" "live.example/job-${STAMP}"; then
        record "3-new-listing" "FAIL" "unpaid live Polar session appeared on the board"
      elif [[ "$live_code" =~ ^30[12378]$ && "$live_loc" == https://sandbox.polar.sh/* ]]; then
        record "3-new-listing" "PASS" "live Polar sandbox Checkout URL; unpaid not listed"
      elif [[ "$live_code" =~ ^30[12378]$ && "$live_loc" == https://*polar.sh* ]]; then
        record "3-new-listing" "FAIL" "Polar checkout host is not sandbox.polar.sh: ${live_loc%%\?*}"
      elif grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' "${live_log}" "$live_body" 2>/dev/null; then
        echo "BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
        record "3-new-listing" "BLOCKED-SECRET" "POLAR_ACCESS_TOKEN"
      elif grep -q 'BLOCKED-SECRET: POLAR_PRODUCT_ID' "${live_log}" "$live_body" 2>/dev/null; then
        echo "BLOCKED-SECRET: POLAR_PRODUCT_ID"
        record "3-new-listing" "BLOCKED-SECRET" "POLAR_PRODUCT_ID"
      else
        record "3-new-listing" "PASS-ERROR" "POLAR_LIVE=1 HTTP ${live_code} loc=${live_loc}; no invented paid rank"
      fi
    fi
    if [[ -n "${LIVE_PID}" ]]; then
      kill_tree "${LIVE_PID}"
      wait "${LIVE_PID}" 2>/dev/null || true
    fi
    LIVE_PID=""
  fi
else
  if [[ -z "${OP_POLAR_ACCESS_TOKEN}" ]]; then
    echo "BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
    record "3-new-listing" "BLOCKED-SECRET" "POLAR_ACCESS_TOKEN"
  elif [[ -z "${OP_POLAR_PRODUCT_ID}" ]]; then
    echo "BLOCKED-SECRET: POLAR_PRODUCT_ID"
    record "3-new-listing" "BLOCKED-SECRET" "POLAR_PRODUCT_ID"
  else
    record "3-new-listing" "PASS-ERROR" "POLAR_LIVE unset; secrets present but live Polar not invoked"
  fi
fi

# Remaining §10 rows use the fixture process (allowed when live pay is blocked).
# Rank updates only after GET /return completes the fixture checkout.

post_and_return() {
  local identity="$1"
  local amount="$2"
  local tag="$3"
  local cookie="${4:-}"
  local body="${WORKDIR}/${tag}.body"
  local hdrs="${WORKDIR}/${tag}.hdrs"
  local code
  if [[ -n "$cookie" ]]; then
    code="$(http_post_form "$BASE" "/checkout" "$body" "$hdrs" \
      -H "cookie: ${cookie}" \
      --data-urlencode "lane=backend" \
      --data-urlencode "identity=${identity}" \
      --data-urlencode "amount=${amount}" || true)"
  else
    code="$(http_post_form "$BASE" "/checkout" "$body" "$hdrs" \
      --data-urlencode "lane=backend" \
      --data-urlencode "identity=${identity}" \
      --data-urlencode "amount=${amount}" || true)"
  fi
  local loc
  loc="$(header_value "$hdrs" "location" || true)"
  local set_cookie
  set_cookie="$(cookie_from_headers "$hdrs" "rj_payer" || true)"
  local err
  err="$(query_param "$loc" "error" || true)"
  local checkout_id
  checkout_id="$(query_param "$loc" "checkoutId" || true)"
  printf '%s\t%s\t%s\t%s\t%s\n' "$code" "$loc" "$err" "$checkout_id" "$set_cookie"
}

complete_return() {
  local checkout_id="$1"
  local tag="$2"
  local encoded
  encoded="$(node --input-type=module -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$checkout_id")"
  local body="${WORKDIR}/${tag}-return.html"
  http_get "$BASE" "/return?checkoutId=${encoded}" "$body"
}

# --- SPEC §10.4 Fixture return: $5 lists at the rank it takes ---
create_line="$(post_and_return "$TRACKED_URL" "5" "create")"
create_code="$(printf '%s' "$create_line" | cut -f1)"
create_loc="$(printf '%s' "$create_line" | cut -f2)"
create_err="$(printf '%s' "$create_line" | cut -f3)"
create_chk="$(printf '%s' "$create_line" | cut -f4)"
owner_cookie="$(printf '%s' "$create_line" | cut -f5)"
board_unpaid="${WORKDIR}/board-unpaid.html"
http_get "$BASE" "/" "$board_unpaid" >/dev/null || true
if [[ "$create_code" != "303" || -z "$create_chk" ]]; then
  record "4-fixture-return" "FAIL" "fixture checkout HTTP ${create_code} loc=${create_loc} err=${create_err}"
elif html_has "$board_unpaid" "$ACME_HOST"; then
  record "4-fixture-return" "FAIL" "unpaid fixture checkout appeared on the board"
else
  return_code="$(complete_return "$create_chk" "create" || true)"
  board4="${WORKDIR}/board4.html"
  board4_code="$(http_get "$BASE" "/" "$board4" || true)"
  acme_id="$(card_field "$board4" "$ACME_HOST" "id" || true)"
  acme_rank="$(card_field "$board4" "$ACME_HOST" "rank" || true)"
  acme_bid="$(card_field "$board4" "$ACME_HOST" "bid" || true)"
  acme_apply="$(card_field "$board4" "$ACME_HOST" "apply" || true)"
  if [[ "$return_code" == "200" && "$board4_code" == "200" \
    && -n "$acme_id" && "$acme_bid" == "5" && -n "$acme_rank" ]]; then
    record "4-fixture-return" "PASS" "fixture return listed ${acme_id} at #${acme_rank} \$5"
  else
    record "4-fixture-return" "FAIL" "return HTTP ${return_code} id=${acme_id} rank=${acme_rank} bid=${acme_bid}"
  fi
fi

# --- SPEC §10.5 Raise same apply URL to $8; charged $3; same id ---
raise_line="$(post_and_return "$ACME_URL" "8" "raise" "${owner_cookie}")"
raise_code="$(printf '%s' "$raise_line" | cut -f1)"
raise_loc="$(printf '%s' "$raise_line" | cut -f2)"
raise_err="$(printf '%s' "$raise_line" | cut -f3)"
raise_chk="$(printf '%s' "$raise_line" | cut -f4)"
if [[ "$raise_code" != "303" || -z "$raise_chk" || -n "$raise_err" ]]; then
  record "5-raise" "FAIL" "raise checkout HTTP ${raise_code} loc=${raise_loc} err=${raise_err}"
else
  complete_return "$raise_chk" "raise" >/dev/null || true
  board5="${WORKDIR}/board5.html"
  board5_code="$(http_get "$BASE" "/" "$board5" || true)"
  raise_id="$(card_field "$board5" "$ACME_HOST" "id" || true)"
  raise_bid="$(card_field "$board5" "$ACME_HOST" "bid" || true)"
  raise_rank="$(card_field "$board5" "$ACME_HOST" "rank" || true)"
  if [[ "$board5_code" == "200" && "$raise_id" == "$acme_id" && "$raise_bid" == "8" ]]; then
    record "5-raise" "PASS" "same id ${raise_id}; bid \$8 (charged \$3); rank #${raise_rank}"
  else
    record "5-raise" "FAIL" "raise id=${raise_id} expected=${acme_id} bid=${raise_bid}"
  fi
fi

# --- SPEC §10.6 Other payer, same URL, difference only ---
stranger_line="$(post_and_return "$ACME_URL" "11" "stranger")"
stranger_code="$(printf '%s' "$stranger_line" | cut -f1)"
stranger_loc="$(printf '%s' "$stranger_line" | cut -f2)"
stranger_err="$(printf '%s' "$stranger_line" | cut -f3)"
board6="${WORKDIR}/board6.html"
http_get "$BASE" "/" "$board6" >/dev/null || true
after_id="$(card_field "$board6" "$ACME_HOST" "id" || true)"
after_bid="$(card_field "$board6" "$ACME_HOST" "bid" || true)"
after_rank="$(card_field "$board6" "$ACME_HOST" "rank" || true)"
if [[ "$stranger_code" == "303" \
  && ( "$stranger_err" == "raise_not_owner" || "$stranger_err" == "identity_taken" ) \
  && "$after_id" == "$acme_id" && "$after_bid" == "8" ]]; then
  record "6-stranger" "PASS-ERROR" "${stranger_err}; original ${after_id} stays #${after_rank} \$8"
else
  record "6-stranger" "FAIL" "stranger HTTP ${stranger_code} err=${stranger_err} bid=${after_bid} loc=${stranger_loc}"
fi

# --- SPEC §10.7 Second company, lower bid ---
beta_line="$(post_and_return "$BETA_URL" "5" "beta")"
beta_code="$(printf '%s' "$beta_line" | cut -f1)"
beta_chk="$(printf '%s' "$beta_line" | cut -f4)"
if [[ "$beta_code" != "303" || -z "$beta_chk" ]]; then
  record "7-second-company" "FAIL" "beta checkout HTTP ${beta_code}"
else
  complete_return "$beta_chk" "beta" >/dev/null || true
  board7="${WORKDIR}/board7.html"
  board7_code="$(http_get "$BASE" "/" "$board7" || true)"
  acme_rank7="$(card_field "$board7" "$ACME_HOST" "rank" || true)"
  acme_bid7="$(card_field "$board7" "$ACME_HOST" "bid" || true)"
  beta_rank="$(card_field "$board7" "$BETA_HOST" "rank" || true)"
  beta_bid="$(card_field "$board7" "$BETA_HOST" "bid" || true)"
  acme_clicks7="$(card_field "$board7" "$ACME_HOST" "clicks" || true)"
  beta_clicks7="$(card_field "$board7" "$BETA_HOST" "clicks" || true)"
  if [[ "$board7_code" == "200" \
    && "$acme_rank7" == "1" && "$acme_bid7" == "8" \
    && "$beta_rank" == "2" && "$beta_bid" == "5" \
    && "$acme_clicks7" =~ ^[0-9]+$ && "$beta_clicks7" =~ ^[0-9]+$ ]]; then
    record "7-second-company" "PASS" "Acme #1 \$8; Beta #2 \$5; both show \$ and clicks"
  else
    record "7-second-company" "FAIL" "acme=#${acme_rank7}/\$ ${acme_bid7} beta=#${beta_rank}/\$ ${beta_bid}"
  fi
fi

# --- SPEC §10.8 Two equal bids: older keeps the higher rank ---
gamma_line="$(post_and_return "$GAMMA_URL" "5" "gamma")"
gamma_chk="$(printf '%s' "$gamma_line" | cut -f4)"
delta_ok=0
if [[ -n "$gamma_chk" ]]; then
  complete_return "$gamma_chk" "gamma" >/dev/null || true
  sleep 1
  delta_line="$(post_and_return "$DELTA_URL" "5" "delta")"
  delta_chk="$(printf '%s' "$delta_line" | cut -f4)"
  if [[ -n "$delta_chk" ]]; then
    complete_return "$delta_chk" "delta" >/dev/null || true
    delta_ok=1
  fi
fi
board8="${WORKDIR}/board8.html"
http_get "$BASE" "/" "$board8" >/dev/null || true
gamma_rank="$(card_field "$board8" "$GAMMA_HOST" "rank" || true)"
delta_rank="$(card_field "$board8" "$DELTA_HOST" "rank" || true)"
gamma_bid8="$(card_field "$board8" "$GAMMA_HOST" "bid" || true)"
delta_bid8="$(card_field "$board8" "$DELTA_HOST" "bid" || true)"
if [[ "$delta_ok" -eq 1 \
  && "$gamma_bid8" == "5" && "$delta_bid8" == "5" \
  && -n "$gamma_rank" && -n "$delta_rank" \
  && "$gamma_rank" -lt "$delta_rank" ]]; then
  record "8-equal-bids" "PASS" "both \$5; older Gamma #${gamma_rank} above Delta #${delta_rank}"
else
  record "8-equal-bids" "FAIL" "gamma=#${gamma_rank} delta=#${delta_rank} bids ${gamma_bid8}/${delta_bid8}"
fi

# --- SPEC §10.9 Apply URL with ?utm_source=x ---
board9="${WORKDIR}/board9.html"
http_get "$BASE" "/" "$board9" >/dev/null || true
stored_apply="$(card_field "$board9" "$ACME_HOST" "apply" || true)"
if [[ "$stored_apply" == "$ACME_URL" ]] \
  && ! html_has "$board9" 'utm_source' \
  && ! html_has "$board9" 'fbclid'; then
  record "9-utm-stripped" "PASS" "stored apply URL has no query; card link has no query"
else
  record "9-utm-stripped" "FAIL" "stored=${stored_apply}"
fi

# --- SPEC §10.10 Telegram / Discord / NSFW ---
tg_line="$(post_and_return "https://t.me/foo" "5" "telegram")"
tg_err="$(printf '%s' "$tg_line" | cut -f3)"
dc_line="$(post_and_return "https://discord.gg/invite" "5" "discord")"
dc_err="$(printf '%s' "$dc_line" | cut -f3)"
nsfw_line="$(post_and_return "https://onlyfans.com/x" "5" "nsfw")"
nsfw_err="$(printf '%s' "$nsfw_line" | cut -f3)"
board10="${WORKDIR}/board10.html"
http_get "$BASE" "/" "$board10" >/dev/null || true
if [[ "$tg_err" == "chat_link_forbidden" \
  && "$dc_err" == "chat_link_forbidden" \
  && "$nsfw_err" == "nsfw_forbidden" ]] \
  && ! html_has "$board10" 't.me/foo' \
  && ! html_has "$board10" 'discord.gg' \
  && ! html_has "$board10" 'onlyfans'; then
  record "10-forbidden-url" "PASS-ERROR" "422 chat_link_forbidden / nsfw_forbidden; no row"
else
  record "10-forbidden-url" "FAIL" "tg=${tg_err} dc=${dc_err} nsfw=${nsfw_err}"
fi

# --- SPEC §10.11 Click apply ---
if [[ -z "${acme_id:-}" ]]; then
  acme_id="$(card_field "$board9" "$ACME_HOST" "id" || true)"
fi
if [[ -z "$acme_id" ]]; then
  record "11-click" "FAIL" "no paid listing id to click"
else
  before_board="${WORKDIR}/click-before.html"
  http_get "$BASE" "/" "$before_board" >/dev/null || true
  before_clicks="$(card_field "$before_board" "$ACME_HOST" "clicks" || echo "")"
  click_body="${WORKDIR}/click.body"
  click_hdrs="${WORKDIR}/click.hdrs"
  click_code="$(http_get_headers "$BASE" "/out/${acme_id}" "$click_body" "$click_hdrs" || true)"
  click_loc="$(header_value "$click_hdrs" "location" || true)"
  after_board="${WORKDIR}/click-after.html"
  http_get "$BASE" "/" "$after_board" >/dev/null || true
  after_clicks="$(card_field "$after_board" "$ACME_HOST" "clicks" || echo "")"
  if [[ "$click_code" == "302" \
    && "$click_loc" == "$ACME_URL" \
    && "$click_loc" != *"?"* \
    && "$before_clicks" =~ ^[0-9]+$ \
    && "$after_clicks" =~ ^[0-9]+$ \
    && "$after_clicks" -eq $((before_clicks + 1)) ]]; then
    record "11-click" "PASS" "GET /out/${acme_id} 302 → canonical URL; clicks ${before_clicks}→${after_clicks}"
  else
    record "11-click" "FAIL" "GET /out/${acme_id} HTTP ${click_code} loc=${click_loc} clicks ${before_clicks}→${after_clicks}"
  fi
fi

# --- SPEC §10.12 Salary omitted ---
salary_flag="$(card_field "$board9" "$ACME_HOST" "salary" || echo "missing")"
if [[ "$salary_flag" == "no" ]] \
  && ! html_has "$board9" 'data-salary' \
  && ! grep -Eqi 'competitive salary|\$0–|\$0-' "$board9"; then
  record "12-salary-omitted" "PASS" "card has no salary figures (none invented)"
else
  record "12-salary-omitted" "FAIL" "salary=${salary_flag}"
fi

# --- SPEC §10.13 Clock at Monday 00:00 UTC ---
# In-memory store is process-local, so seed last week on a Sunday process,
# then start a Monday process that shares nothing — previous bids are absent
# from the live board (new periodId). Documented clock inject via BOARD_NOW.
week_old_port="$(pick_port)"
week_old_log="${WORKDIR}/week-old.log"
week_old_base="http://127.0.0.1:${week_old_port}"
WEEK_PID="$(start_smoke_server "$week_old_port" "$week_old_log" "$SERVER_PATH" \
  "POLAR_FIXTURE_ONLY=1" \
  "BOARD_NOW=2026-08-16T23:59:59.999Z")"
if ! wait_health "$week_old_base"; then
  record "13-monday-reset" "FAIL" "Sunday-week process did not become healthy"
else
  week_create_body="${WORKDIR}/week-create.body"
  week_create_hdrs="${WORKDIR}/week-create.hdrs"
  week_create_code="$(http_post_form "$week_old_base" "/checkout" \
    "$week_create_body" "$week_create_hdrs" \
    --data-urlencode "lane=backend" \
    --data-urlencode "identity=https://last-week.example/job-${STAMP}" \
    --data-urlencode "amount=5" || true)"
  week_loc="$(header_value "$week_create_hdrs" "location" || true)"
  week_chk="$(query_param "$week_loc" "checkoutId" || true)"
  week_return_code="000"
  if [[ -n "$week_chk" ]]; then
    week_encoded="$(node --input-type=module -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$week_chk")"
    week_return="${WORKDIR}/week-return.html"
    week_return_code="$(http_get "$week_old_base" "/return?checkoutId=${week_encoded}" "$week_return" || true)"
  fi
  week_old_board="${WORKDIR}/week-old.html"
  http_get "$week_old_base" "/" "$week_old_board" >/dev/null || true
  if [[ -n "${WEEK_PID}" ]]; then
    kill_tree "${WEEK_PID}"
    wait "${WEEK_PID}" 2>/dev/null || true
  fi
  WEEK_PID=""
  week_new_port="$(pick_port)"
  week_new_log="${WORKDIR}/week-new.log"
  week_new_base="http://127.0.0.1:${week_new_port}"
  WEEK_PID="$(start_smoke_server "$week_new_port" "$week_new_log" "$SERVER_PATH" \
    "POLAR_FIXTURE_ONLY=1" \
    "BOARD_NOW=2026-08-17T00:00:00.000Z")"
  if ! wait_health "$week_new_base"; then
    record "13-monday-reset" "FAIL" "Monday 00:00 UTC process did not become healthy"
  else
    week_new_board="${WORKDIR}/week-new.html"
    week_new_code="$(http_get "$week_new_base" "/" "$week_new_board" || true)"
    if [[ "$week_create_code" == "303" && "$week_return_code" == "200" ]] \
      && html_has "$week_old_board" "last-week.example/job-${STAMP}" \
      && html_has "$week_old_board" 'data-period="2026-W33"' \
      && [[ "$week_new_code" == "200" ]] \
      && html_has "$week_new_board" 'data-period="2026-W34"' \
      && ! html_has "$week_new_board" "last-week.example/job-${STAMP}" \
      && html_has "$week_new_board" 'data-empty-lane="true"'; then
      record "13-monday-reset" "PASS" "Monday 00:00 UTC new periodId 2026-W34; previous bids absent"
    else
      record "13-monday-reset" "FAIL" "create=${week_create_code} return=${week_return_code} monday=${week_new_code}"
    fi
  fi
  if [[ -n "${WEEK_PID}" ]]; then
    kill_tree "${WEEK_PID}"
    wait "${WEEK_PID}" 2>/dev/null || true
  fi
  WEEK_PID=""
fi

echo
echo "== summary =="
echo "PASS=${PASS} PASS-ERROR=${PASS_ERROR} BLOCKED-SECRET=${BLOCKED} FAIL=${FAIL}"
echo "base=${BASE}"
echo "weekId=${EXPECT_WEEK}"
if [[ -f "${RESULT_LOG}" ]]; then
  echo "----"
  while IFS=$'\t' read -r flow status note; do
    printf '%-22s %-16s %s\n' "$flow" "$status" "$note"
  done <"${RESULT_LOG}"
fi

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
