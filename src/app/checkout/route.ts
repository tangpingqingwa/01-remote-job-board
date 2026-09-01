import { NextResponse } from "next/server";
import { parseLane } from "../../lib/board";
import { currentPeriodMeta } from "../../lib/period";
import {
  draftFromOutbidInput,
  newPayerId,
  parseSalaryBand,
  planCheckout,
  resolveListingIdentity,
} from "../../lib/listing";
import { defaultBoardStore } from "../../lib/store";
import {
  CheckoutError,
  getPolarPort,
  parseBidUsd,
} from "../../payments/port";
import { FUNCTION_LANES } from "../../lib/types";

const PAYER_COOKIE = "rj_payer";
const PAYER_RE = /^pay_[a-f0-9]+$/;

function formValue(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function payerFromCookie(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)rj_payer=([^;]+)/);
  const value = match?.[1];
  return value && PAYER_RE.test(value) ? value : undefined;
}

function withPayerCookie(response: NextResponse, payerId: string): NextResponse {
  response.cookies.set(PAYER_COOKIE, payerId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

function isKnownLane(value: string): boolean {
  return (FUNCTION_LANES as readonly string[]).includes(value);
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const origin = new URL(request.url).origin;
  const rawLane = formValue(form, "lane");
  // Query rendering may use parseLane's friendly backend fallback. A checkout
  // POST is different: charging an unknown lane into backend would put a paid
  // listing on the wrong wall, so preserve the documented invalid_lane error.
  const lane = parseLane(rawLane);
  const period = currentPeriodMeta();
  const postedPayer = formValue(form, "payerId");
  const payerId =
    (PAYER_RE.test(postedPayer) ? postedPayer : undefined) ??
    payerFromCookie(request) ??
    newPayerId();

  try {
    if (!isKnownLane(rawLane)) {
      throw new CheckoutError("invalid_lane", 422);
    }
    const bidUsd = parseBidUsd(formValue(form, "amount"));
    const identity = await resolveListingIdentity(formValue(form, "identity"));
    const title = formValue(form, "title").trim();
    const company = formValue(form, "company").trim();
    if (!title || !company) {
      throw new CheckoutError("invalid_listing", 422);
    }
    const salary = parseSalaryBand(
      formValue(form, "salaryMinUsd"),
      formValue(form, "salaryMaxUsd"),
    );
    const draft = draftFromOutbidInput({
      identity,
      amountUsd: bidUsd,
      lane,
      periodId: period.periodId,
      payerId,
      ...(title ? { title } : {}),
      ...(company ? { company } : {}),
      salary,
    });
    const plan = planCheckout(defaultBoardStore, draft);
    const started = await getPolarPort().createCheckout({
      amountUsd: plan.chargeUsd,
      listingDraft: draft,
      successUrl: `${origin}/return`,
    });
    return withPayerCookie(NextResponse.redirect(started.url, 303), payerId);
  } catch (error) {
    if (error instanceof CheckoutError) {
      if (error.intentId) {
        const recovery = new URL("/checkout/complete", origin);
        recovery.searchParams.set("intent", error.intentId);
        return withPayerCookie(NextResponse.redirect(recovery, 303), payerId);
      }
      const back = new URL("/", origin);
      back.searchParams.set("lane", lane);
      back.searchParams.set("error", error.code);
      return withPayerCookie(NextResponse.redirect(back, 303), payerId);
    }
    // Configuration failures are intentional fail-closed startup/runtime
    // blockers. Do not turn them into a misleading user checkout redirect.
    if (error instanceof Error && /^BLOCKED-(?:CONFIG|SECRET):/.test(error.message)) {
      throw error;
    }
    const back = new URL("/", origin);
    back.searchParams.set("lane", lane);
    back.searchParams.set("error", "checkout_unavailable");
    return withPayerCookie(NextResponse.redirect(back, 303), payerId);
  }
}
