import { NextResponse } from "next/server";
import { handleWaffoWebhook } from "../../../../payments/waffo";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-waffo-signature") ?? "";
  const result = await handleWaffoWebhook(rawBody, signature);
  const status =
    result.status === "applied" || result.status === "duplicate" || result.status === "reconciled"
      ? 200
      : result.status === "retryable"
        ? 503
      : result.status === "busy"
        ? 202
        : result.code === "invalid_signature"
          ? 401
          : result.code === "blocked_config" || result.code === "blocked_database"
            ? 503
            : 400;
  return NextResponse.json(
    {
      status: result.status,
      code: result.code,
      ...(result.intentId ? { intentId: result.intentId } : {}),
    },
    { status },
  );
}
