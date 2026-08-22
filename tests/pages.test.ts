import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import AboutPage from "../src/app/about/page";
import RulesPage from "../src/app/rules/page";

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function renderPage(page: () => ReturnType<typeof AboutPage>): string {
  return renderToStaticMarkup(createElement(page));
}

function assertCoreRules(html: string) {
  assert.match(html, /Rank is the bid/);
  assert.match(html, /\$5/);
  assert.match(html, /older/i);
  assert.match(html, /difference/i);
}

test("board nav links to /about and /rules", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /href="\/about"/);
  assert.match(layout, />About</);
  assert.match(layout, /href="\/rules"/);
  assert.match(layout, />Rules</);
  assert.match(layout, /href="\/"/);
  assert.match(layout, /Leaderboard/);
});

test("GET /about is a 200-class English page: no ads, no API keys, no revenue share", () => {
  const html = renderPage(AboutPage);
  assert.match(html, /data-page="about"/);
  assert.match(html, /<h1>About<\/h1>/);
  assertCoreRules(html);
  assert.match(html, /min \$5/);
  assert.match(html, /no ads/i);
  assert.match(html, /no API keys/i);
  assert.match(html, /no revenue share/i);
  assert.match(html, /English/);
  assert.match(html, /USD/);
  assert.match(html, /global remote/i);
  assert.match(html, /never invent a salary/i);
  assert.match(html, /newBid − currentBid/);
  assert.match(html, /href="\/rules"/);
  assert.doesNotMatch(html, /POLAR_LIVE/);
  assert.doesNotMatch(html, /api\.polar/);
});

test("GET /rules is a 200-class English page matching SPEC §3–§6", () => {
  const html = renderPage(RulesPage);
  assert.match(html, /data-page="rules"/);
  assert.match(html, /<h1>Rules<\/h1>/);
  assertCoreRules(html);
  assert.match(html, /min \$5/);

  // §3 ranking
  assert.match(html, /bidUsd/);
  assert.match(html, /Whole dollars/);
  assert.match(html, /≥ \$5/);
  assert.match(html, /≤ \$50,000/);
  assert.match(html, /Below #1 still lists/);
  assert.match(html, /createdAt/);
  assert.match(html, /periodId, lane, identity/);
  assert.match(html, /newBid − currentBid/);
  assert.match(html, /raise pays the difference/i);
  assert.match(html, /raise_not_owner/);
  assert.match(html, /identity_taken/);
  assert.match(html, /currentTopBid \+ 1/);
  assert.match(html, /Payment claims rank/);
  assert.match(html, /Acme bids \$5/);
  assert.match(html, /Beta bids \$20/);
  assert.match(html, /pays \$16/);
  assert.match(html, /Gamma bids \$21/);

  // §4 cadence
  assert.match(html, /Monday 00:00:00.000 UTC/);
  assert.match(html, /YYYY-Www/);
  assert.match(html, /weekly reset/i);
  assert.match(html, /2026-W34/);
  assert.match(html, /pays again/);

  // §5 listings
  assert.match(html, /Remote \(global\)/);
  assert.match(html, /never invent salaries/i);
  assert.match(html, /competitive/);
  assert.match(html, /no city field/i);

  // §6 URL rules (documented; enforcement is a later PR)
  assert.match(html, /https:/);
  assert.match(html, /utm_\*/);
  assert.match(html, /Telegram/);
  assert.match(html, /Discord/);
  assert.match(html, /NSFW/);
  assert.match(html, /onlyfans/i);
  assert.match(html, /GET \/out\/:listingId/);
  assert.match(html, /no<\/strong> query parameters added/);
});
