import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import AboutPage from "../src/app/about/page";
import RulesPage from "../src/app/rules/page";
import { GET as getHealth } from "../src/app/healthz/route";
import {
  SearchPopover,
  searchListings,
} from "../src/components/search-popover";

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function renderPage(page: () => ReturnType<typeof AboutPage>): string {
  return renderToStaticMarkup(createElement(page));
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

test("maker contact is one visible mailto link in the global footer", () => {
  const layout = read("src/app/layout.tsx");
  const styles = read("src/app/globals.css");
  const contact = layout.match(
    /<span className="site-footer-maker" data-maker-contact>[\s\S]*?<\/span>/,
  )?.[0];

  assert.ok(contact);
  assert.match(
    contact,
    /Built by <a href="mailto:tangpingqingwa@gmail\.com">tangpingqingwa@gmail\.com<\/a>/,
  );
  assert.equal((layout.match(/data-maker-contact/g) ?? []).length, 1);
  assert.match(layout, /\{children\}[\s\S]*<footer className="site-footer">/);
  assert.match(styles, /\.site-footer-maker\s*\{/);
  assert.match(styles, /\.site-footer-maker a[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(styles, /a:focus-visible/);
});

test("Find is a closed, accessible search popover over real page listings", () => {
  const html = renderToStaticMarkup(createElement(SearchPopover));
  const component = read("src/components/search-popover.tsx");
  const styles = read("src/app/globals.css");

  assert.match(html, /role="search"/);
  assert.match(html, /data-search-popover=""/);
  assert.match(html, /aria-label="Search remote jobs"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="search-panel-[^"]+"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(component, /role="dialog"/);
  assert.match(html, />Find</);
  assert.doesNotMatch(html, /data-search-panel/);

  const listings = [
    {
      id: "lst_acme",
      title: "Staff Backend Engineer",
      company: "Acme",
      text: "Staff Backend Engineer Acme Backend paid placement",
      href: "/out/lst_acme",
    },
    {
      id: "lst_gamma",
      title: "Platform Engineer",
      company: "Gamma",
      text: "Platform Engineer Gamma Backend paid placement",
    },
  ];
  assert.deepEqual(searchListings(listings, "acme").map((row) => row.id), [
    "lst_acme",
  ]);
  assert.deepEqual(searchListings(listings, "no such role"), []);
  assert.deepEqual(searchListings(listings, "").map((row) => row.id), [
    "lst_acme",
    "lst_gamma",
  ]);

  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /triggerRef\.current\?\.focus/);
  assert.match(component, /data-listing-card\]\[data-listing-id\]/);
  assert.match(component, /a\[data-apply-url\]\[href\^='/);
  assert.match(styles, /\.search-panel\s*\{/);
  assert.match(styles, /\.search-popover\s*\{/);
});

test("GET /healthz reports readiness without configuration details", async () => {
  const response = await getHealth();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("health route keeps readiness helper outside the App Router module exports", () => {
  const route = read("src/app/healthz/route.ts");
  const helper = read("src/lib/health.ts");
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export function checkReadiness/);
  assert.match(helper, /export function checkReadiness/);
});

test("GET /about is a production-facing English page", () => {
  const html = renderPage(AboutPage);
  assert.match(html, /data-page="about"/);
  assert.match(html, /<h1>About<\/h1>/);
  assert.match(html, /Remote Job Board/);
  assert.match(html, /Rank is the bid/);
  assert.match(html, /English/);
  assert.match(html, /USD/);
  assert.match(html, /remote roles open to applicants across regions/i);
  assert.match(html, /never filled with an estimate/i);
  assert.match(html, /payment is confirmed/i);
  assert.match(html, /href="\/rules"/);
  assert.doesNotMatch(
    html,
    /outbid\.lol|clone of|\bv1\b|fixture|API keys|Waffo|weekId|createdAt|paidAt|BLOCKED-/i,
  );
});

test("GET /rules publishes business rules without implementation details", () => {
  const html = renderPage(RulesPage);
  assert.match(html, /data-page="rules"/);
  assert.match(html, /<h1>Rules<\/h1>/);
  assert.match(html, /Rank is the bid/);
  assert.match(html, /Whole dollars/);
  assert.match(html, /starts at <strong>\$5/);
  assert.match(html, /\$50,000/);
  assert.match(html, /Below #1 still lists/);
  assert.match(html, /placed first/);
  assert.match(html, /difference between the current bid and the new bid/);
  assert.match(html, /Payment claims rank/);
  assert.match(html, /Acme bids \$5/);
  assert.match(html, /Beta bids \$20/);
  assert.match(html, /pays the \$16 difference/);
  assert.match(html, /Gamma bids \$21/);
  assert.match(html, /Rolling seven-day window/);
  assert.match(html, /Monday midnight/);
  assert.doesNotMatch(html, /week(?:ly)?\s+reset/i);
  assert.match(html, /secure, public job-application link/i);
  assert.match(html, /Tracking and affiliate parameters are removed/);
  assert.match(html, /chat invitations/);
  assert.match(html, /adult content/);
  assert.doesNotMatch(
    html,
    /outbid\.lol|clone of|\bv1\b|fixture|API keys|Waffo|weekId|createdAt|paidAt|periodId|raise_not_owner|identity_taken|BLOCKED-/i,
  );
});
