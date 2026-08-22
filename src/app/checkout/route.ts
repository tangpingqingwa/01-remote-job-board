import { NextResponse } from "next/server";
import { currentPeriodMeta, parseLane } from "../../lib/board";
import { draftFromOutbidInput } from "../../lib/listing";
import {
  CheckoutError,
  getPolarPort,
  parseBidUsd,
} from "../../payments/port";

function formValue(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const origin = new URL(request.url).origin;
  const lane = parseLane(formValue(form, "lane"));
  const period = currentPeriodMeta();

  try {
    const amountUsd = parseBidUsd(formValue(form, "amount"));
    const draft = draftFromOutbidInput({
      identity: formValue(form, "identity"),
      amountUsd,
      lane,
      periodId: period.periodId,
    });
    const started = await getPolarPort().createCheckout({
      amountUsd,
      listingDraft: draft,
      successUrl: `${origin}/return`,
    });
    return NextResponse.redirect(started.url, 303);
  } catch (error) {
    if (error instanceof CheckoutError) {
      const back = new URL("/", origin);
      back.searchParams.set("lane", lane);
      back.searchParams.set("error", error.code);
      return NextResponse.redirect(back, 303);
    }
    throw error;
  }
}
