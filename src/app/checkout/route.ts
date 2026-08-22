import { NextResponse } from "next/server";
import { parseLane } from "../../lib/board";
import { currentPeriodMeta } from "../../lib/period";
import {
  draftFromOutbidInput,
  newPayerId,
  planCheckout,
} from "../../lib/listing";
import { defaultBoardStore } from "../../lib/store";
import {
  CheckoutError,
  getPolarPort,
  parseBidUsd,
} from "../../payments/port";

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

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const origin = new URL(request.url).origin;
  const lane = parseLane(formValue(form, "lane"));
  const period = currentPeriodMeta();
  const postedPayer = formValue(form, "payerId");
  const payerId =
    (PAYER_RE.test(postedPayer) ? postedPayer : undefined) ??
    payerFromCookie(request) ??
    newPayerId();

  try {
    const bidUsd = parseBidUsd(formValue(form, "amount"));
    const draft = draftFromOutbidInput({
      identity: formValue(form, "identity"),
      amountUsd: bidUsd,
      lane,
      periodId: period.periodId,
      payerId,
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
      const back = new URL("/", origin);
      back.searchParams.set("lane", lane);
      back.searchParams.set("error", error.code);
      return withPayerCookie(NextResponse.redirect(back, 303), payerId);
    }
    throw error;
  }
}
