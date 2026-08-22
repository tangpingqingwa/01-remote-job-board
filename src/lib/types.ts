export type FunctionLane =
  | "backend"
  | "frontend"
  | "growth"
  | "design"
  | "devrel"
  | "product"
  | "data"
  | "founding";

export type SalaryBand = {
  minUsd: number;
  maxUsd: number;
};

export type Listing = {
  id: string;
  periodId: string;
  lane: FunctionLane;
  title: string;
  company: string;
  companyHandle: string;
  applyUrl: string;
  salary: SalaryBand | null;
  bidUsd: number;
  paidUsd: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
};

export type RankedListing = Listing & {
  rank: number;
};

export const MIN_BID_USD = 5;
export const MAX_BID_USD = 50_000;

export const FUNCTION_LANES: readonly FunctionLane[] = [
  "backend",
  "frontend",
  "growth",
  "design",
  "devrel",
  "product",
  "data",
  "founding",
] as const;
