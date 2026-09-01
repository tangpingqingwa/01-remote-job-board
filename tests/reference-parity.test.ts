import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { Board } from "../src/components/board/board";
import { rankListings } from "../src/lib/rank";
import type { Listing } from "../src/lib/types";

const root = join(process.cwd());
const pageSource = readFileSync(join(root, "src/app/page.tsx"), "utf8");
const checkoutSource = readFileSync(join(root, "src/app/checkout/route.ts"), "utf8");
const stylesSource = readFileSync(join(root, "src/app/globals.css"), "utf8");

function fixtureListing(
  id: string,
  title: string,
  bidUsd: number,
  index: number,
): Listing {
  return {
    id,
    periodId: "2026-W34",
    lane: "backend",
    title,
    company: `Company ${index}`,
    companyHandle: `company-${index}`,
    applyUrl: `https://jobs.example.com/role-${index}`,
    salary: index === 1 ? { minUsd: 120_000, maxUsd: 160_000 } : null,
    bidUsd,
    paidUsd: bidUsd,
    clicks: index,
    createdAt: `2026-08-2${index}T10:00:00.000Z`,
    updatedAt: `2026-08-2${index}T10:00:00.000Z`,
  };
}

test("ordinary home route is the only runtime renderer", () => {
  assert.doesNotMatch(pageSource, /OutbidReferenceFixturePage/);
  assert.doesNotMatch(pageSource, /isFixtureMode/);
  assert.doesNotMatch(pageSource, /OUTBID_REFERENCE_ROWS|OUTBID_REFERENCE_FIXTURE/);
  assert.doesNotMatch(pageSource, /referenceFixtureListings|referenceNow/);
  assert.match(pageSource, /<Board/);
  assert.match(pageSource, /getLiveBoardListings/);
  assert.match(pageSource, /resolveBoardPeriod/);
  assert.match(stylesSource, /Identity R23 — remote\.jobs \/ Hiring Wall/);
  assert.match(stylesSource, /--bg:\s*#ece6d4/);
  assert.match(stylesSource, /--primary:\s*#1f5c45/);
});

test("exact former visual rows render as ordinary remote-job cards", () => {
  const rows = [
    fixtureListing("lst_visual_one", "Midnight Frequency", 17_000, 1),
    fixtureListing("lst_visual_two", "Canvas Night Drive", 16_000, 2),
    fixtureListing("lst_visual_three", "First Light Mix", 14_028, 3),
    fixtureListing("lst_visual_four", "Low Tide Session", 13_005, 4),
    fixtureListing("lst_visual_five", "Sunday Side A", 12_080, 5),
    fixtureListing("lst_visual_six", "Paper Planes", 11_004, 6),
  ];
  const html = renderToStaticMarkup(
    createElement(Board, {
      lane: "backend",
      periodId: "2026-W34",
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings(rows),
      live: true,
    }),
  );

  assert.match(html, /data-hiring-wall=""/);
  assert.match(html, /data-card-kind="lead"/);
  assert.match(html, /data-placement-ledger=""/);
  assert.equal((html.match(/data-listing-card=""/g) ?? []).length, 6);
  assert.match(html, /Midnight Frequency/);
  assert.match(html, /Company 1/);
  assert.match(html, /\$120,000–\$160,000/);
  assert.match(html, /href="\/out\/lst_visual_one"/);
  assert.doesNotMatch(
    html,
    /data-reference-fixture|outbid\.lol|picks\.daily|Test this today|morning edition|Product URL|venueName|Why test this today/i,
  );
});

test("reference renderer remains historical evidence and is not imported by the root", () => {
  assert.doesNotMatch(pageSource, /src\/app\/outbid-reference-page|src\/views\/outbid-reference/);
  const referencePage = join(root, "src/app/outbid-reference-page.tsx");
  const referenceBoard = join(root, "src/views/outbid-reference-board.ts");
  assert.equal(readFileSync(referencePage, "utf8").includes("outbid-reference-root"), true);
  assert.equal(readFileSync(referenceBoard, "utf8").includes("Test this today"), true);
});

test("checkout path keeps labelled job fields and optional salary parsing", () => {
  assert.match(checkoutSource, /formValue\(form, "title"\)/);
  assert.match(checkoutSource, /formValue\(form, "company"\)/);
  assert.match(checkoutSource, /salaryMinUsd/);
  assert.match(checkoutSource, /salaryMaxUsd/);
  assert.match(checkoutSource, /parseSalaryBand/);
});
