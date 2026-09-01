import { NextResponse } from "next/server";
import { defaultBoardStore } from "../../../lib/store";
import { outboundApplyUrl } from "../../../lib/urls";

const CLICK_COOKIE = "rj_click";
const CLICK_WINDOW_MS = 10 * 60 * 1000;

type ClickContext = {
  params: Promise<{ id: string }>;
};

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  const value = match?.[1];
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    // A stale or hand-edited cookie must not turn a valid apply click into a
    // server error. Treat malformed encoding as an empty click history.
    return undefined;
  }
}

function recentClicks(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function shouldCount(
  seen: Record<string, number>,
  listingId: string,
  nowMs: number,
): boolean {
  const last = seen[listingId];
  return last === undefined || nowMs - last >= CLICK_WINDOW_MS;
}

/** Increment public apply clicks, then 302 to the canonical apply URL. */
export async function GET(
  request: Request,
  context: ClickContext,
): Promise<Response> {
  const params = await Promise.resolve(context.params);
  const id = params.id?.trim() ?? "";
  const listing = defaultBoardStore.getById(id);
  if (!listing) {
    return NextResponse.json({ code: "not_found" }, { status: 404 });
  }
  if (!listing.applyUrl) {
    return NextResponse.json({ code: "apply_url_unavailable" }, { status: 410 });
  }

  const nowMs = Date.now();
  const seen = recentClicks(cookieValue(request, CLICK_COOKIE));
  if (shouldCount(seen, listing.id, nowMs)) {
    defaultBoardStore.incrementClicks(listing.id);
    seen[listing.id] = nowMs;
  }

  const target = outboundApplyUrl(listing.applyUrl);
  const response = NextResponse.redirect(target, 302);
  response.headers.set("cache-control", "private, no-store");
  response.cookies.set(CLICK_COOKIE, JSON.stringify(seen), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
