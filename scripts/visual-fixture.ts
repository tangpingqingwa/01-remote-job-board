import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BoardStore } from "../src/lib/store";
import type { Listing } from "../src/lib/types";

export const VISUAL_FIXTURE_PERIOD = "2026-W35";

export const VISUAL_FIXTURE_ROWS: readonly Listing[] = [
  {
    id: "lst_visual_one",
    periodId: VISUAL_FIXTURE_PERIOD,
    lane: "backend",
    title: "Staff Backend Engineer · Americas (UTC−8 to UTC−3)",
    company: "Northstar Ledger",
    companyHandle: "northstar-ledger",
    applyUrl: "https://jobs.example.com/northstar-ledger/staff-backend-engineer",
    salary: { minUsd: 180_000, maxUsd: 225_000 },
    bidUsd: 17_000,
    paidUsd: 17_000,
    clicks: 148,
    createdAt: "2026-08-25T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
  },
  {
    id: "lst_visual_two",
    periodId: VISUAL_FIXTURE_PERIOD,
    lane: "backend",
    title: "Senior Platform Engineer · Europe (UTC−1 to UTC+3)",
    company: "Ternary Harbor",
    companyHandle: "ternary-harbor",
    applyUrl: "https://jobs.example.com/ternary-harbor/senior-platform-engineer",
    salary: { minUsd: 155_000, maxUsd: 195_000 },
    bidUsd: 16_000,
    paidUsd: 16_000,
    clicks: 92,
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:00.000Z",
  },
  {
    id: "lst_visual_three",
    periodId: VISUAL_FIXTURE_PERIOD,
    lane: "backend",
    title: "Infrastructure Engineer · Global (UTC−5 to UTC+5)",
    company: "Mosslight Systems",
    companyHandle: "mosslight-systems",
    applyUrl: "https://jobs.example.com/mosslight-systems/infrastructure-engineer",
    salary: { minUsd: 140_000, maxUsd: 180_000 },
    bidUsd: 14_028,
    paidUsd: 14_028,
    clicks: 64,
    createdAt: "2026-08-23T12:00:00.000Z",
    updatedAt: "2026-08-23T12:00:00.000Z",
  },
  {
    id: "lst_visual_four",
    periodId: VISUAL_FIXTURE_PERIOD,
    lane: "backend",
    title: "Backend Reliability Engineer · Americas (UTC−8 to UTC−3)",
    company: "Relay Orchard",
    companyHandle: "relay-orchard",
    applyUrl: "https://jobs.example.com/relay-orchard/backend-reliability-engineer",
    salary: { minUsd: 132_000, maxUsd: 172_000 },
    bidUsd: 13_005,
    paidUsd: 13_005,
    clicks: 48,
    createdAt: "2026-08-23T06:00:00.000Z",
    updatedAt: "2026-08-23T06:00:00.000Z",
  },
  {
    id: "lst_visual_five",
    periodId: VISUAL_FIXTURE_PERIOD,
    lane: "backend",
    title: "API Engineer · Europe (UTC+0 to UTC+4)",
    company: "Plainfield Cloud",
    companyHandle: "plainfield-cloud",
    applyUrl: "https://jobs.example.com/plainfield-cloud/api-engineer",
    salary: { minUsd: 125_000, maxUsd: 165_000 },
    bidUsd: 12_080,
    paidUsd: 12_080,
    clicks: 27,
    createdAt: "2026-08-23T05:00:00.000Z",
    updatedAt: "2026-08-23T05:00:00.000Z",
  },
  {
    id: "lst_visual_six",
    periodId: VISUAL_FIXTURE_PERIOD,
    lane: "backend",
    title: "Data Services Engineer · APAC (UTC+7 to UTC+12)",
    company: "Kiteframe",
    companyHandle: "kiteframe",
    applyUrl: "https://jobs.example.com/kiteframe/data-services-engineer",
    salary: { minUsd: 120_000, maxUsd: 158_000 },
    bidUsd: 11_004,
    paidUsd: 11_004,
    clicks: 12,
    createdAt: "2026-08-23T04:00:00.000Z",
    updatedAt: "2026-08-23T04:00:00.000Z",
  },
];

export function seedVisualFixture(databasePath: string): Listing[] {
  const path = resolve(databasePath);
  if (!path.startsWith("/private/tmp/")) {
    throw new Error("visual fixture requires a disposable /private/tmp database");
  }
  mkdirSync(dirname(path), { recursive: true });
  const store = new BoardStore({ databasePath: path });
  try {
    store.reset();
    for (const row of VISUAL_FIXTURE_ROWS) store.insertPaid(row);
    return store.listPaidRolling("backend", new Date("2026-08-29T12:00:00.000Z"));
  } finally {
    store.close();
  }
}

function runFromCli(): void {
  const requested = process.argv[2] ?? process.env.DATABASE_PATH;
  if (!requested || requested === ":memory:") {
    throw new Error("visual fixture requires a disposable file-backed DATABASE_PATH");
  }
  const rows = seedVisualFixture(requested);
  for (const row of rows) {
    process.stdout.write(`${row.id}\t${row.title}\t${row.bidUsd}\t${row.clicks}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runFromCli();
}
