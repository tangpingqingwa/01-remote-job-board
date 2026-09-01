import { NextResponse } from "next/server";
import { handlePolarWebhook } from "../../../../payments/polar";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const result = await handlePolarWebhook(rawBody, headers);
  const status = 410;
  return NextResponse.json(
    {
      status: result.status,
      code: result.code,
      ...(result.intentId ? { intentId: result.intentId } : {}),
    },
    { status },
  );
}
