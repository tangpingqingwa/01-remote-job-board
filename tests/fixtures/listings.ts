import type { Listing } from "../../src/lib/types";

export function fixtureListing(
  overrides: Partial<Listing> &
    Pick<Listing, "id" | "company" | "bidUsd" | "createdAt">,
): Listing {
  const handle =
    overrides.companyHandle ??
    overrides.company.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    periodId: "2026-W34",
    lane: "backend",
    title: `${overrides.company} remote role`,
    companyHandle: handle,
    applyUrl: `https://jobs.example.com/${handle}`,
    salary: null,
    paidUsd: overrides.bidUsd,
    clicks: 0,
    updatedAt: overrides.createdAt,
    ...overrides,
  };
}

/** SPEC §3 worked example 4: Acme $21 (older), Gamma $21, Beta $20. */
export const specTieRows: Listing[] = [
  fixtureListing({
    id: "lst_beta",
    title: "Growth Engineer",
    company: "Beta",
    bidUsd: 20,
    clicks: 4,
    createdAt: "2026-08-17T12:00:00.000Z",
  }),
  fixtureListing({
    id: "lst_gamma",
    title: "Platform Engineer",
    company: "Gamma",
    bidUsd: 21,
    clicks: 1,
    createdAt: "2026-08-17T13:00:00.000Z",
  }),
  fixtureListing({
    id: "lst_acme",
    title: "Staff Backend Engineer",
    company: "Acme",
    bidUsd: 21,
    clicks: 9,
    createdAt: "2026-08-17T10:00:00.000Z",
  }),
];
