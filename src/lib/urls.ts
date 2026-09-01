/** SPEC §6 — clean apply URLs before store or outbound redirect. */

export type UrlErrorCode =
  | "invalid_url"
  | "tracking_stripped_empty"
  | "chat_link_forbidden"
  | "nsfw_forbidden"
  | "shortener_unresolved";

export class UrlError extends Error {
  readonly httpStatus = 422;

  constructor(
    readonly code: UrlErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "UrlError";
  }
}

/** Documented shortener hosts. Live may resolve one hop; tests pass fixtures. */
export const SHORTENER_HOSTS: readonly string[] = [
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "tiny.cc",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "is.gd",
  "cutt.ly",
  "rebrand.ly",
  "rb.gy",
  "lnkd.in",
  "db.tt",
  "shorturl.at",
];

/** Chat / invite hosts. Subdomains match. Slack / Discord also use path rules. */
export const CHAT_HOSTS: readonly string[] = [
  "t.me",
  "telegram.me",
  "telegram.org",
  "telegram.dog",
  "wa.me",
  "whatsapp.com",
  "discord.gg",
  "discord.com",
  "discordapp.com",
  "discord.me",
  "m.me",
  "messenger.com",
  "signal.me",
  "signal.group",
  "signal.link",
  "signal.org",
  "line.me",
  "line.naver.jp",
  "weixin.qq.com",
  "u.wechat.com",
  "wechat.com",
  "open.kakao.com",
  "plus.kakao.com",
  "story.kakao.com",
  "join.slack.com",
];

/** Adult hosts. Subdomains match. Path keywords are checked separately. */
export const NSFW_HOSTS: readonly string[] = [
  "pornhub.com",
  "pornhub.org",
  "pornhubpremium.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "onlyfans.com",
  "fansly.com",
  "chaturbate.com",
  "stripchat.com",
  "manyvids.com",
  "youporn.com",
  "redtube.com",
  "brazzers.com",
  "spankbang.com",
  "adultfriendfinder.com",
];

const NSFW_PATH_SEGMENTS = new Set([
  "porn",
  "porno",
  "xxx",
  "nsfw",
  "onlyfans",
  "fansly",
  "hentai",
]);

export type ShortenerResolver = (shortUrl: string) => string;

export type CanonicalizeOptions = {
  /**
   * Fixture or already-resolved final https URL for one shortener hop.
   * Prefer this in tests. Live callers may pass the hop they fetched.
   */
  resolvedTarget?: string;
  /** Map a documented shortener to its final https URL (tests: fixtures). */
  resolveShortener?: ShortenerResolver;
};

function hostMatches(host: string, listed: string): boolean {
  return host === listed || host.endsWith(`.${listed}`);
}

function hostMatchesAny(host: string, listed: readonly string[]): boolean {
  return listed.some((candidate) => hostMatches(host, candidate));
}

function hostnameOf(parsed: URL): string {
  return parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .replace(/^\.+/, "");
}

export function isShortenerHost(host: string): boolean {
  return hostMatchesAny(hostnameOfHost(host), SHORTENER_HOSTS);
}

export function isChatHost(host: string): boolean {
  return hostMatchesAny(hostnameOfHost(host), CHAT_HOSTS);
}

export function isNsfwHost(host: string): boolean {
  return hostMatchesAny(hostnameOfHost(host), NSFW_HOSTS);
}

function hostnameOfHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .replace(/^\.+/, "");
}

function unresolvedShortener(): never {
  throw new UrlError("shortener_unresolved", "shortener could not be resolved");
}

export function isChatUrl(parsed: URL): boolean {
  const host = hostnameOf(parsed);
  if (hostMatchesAny(host, CHAT_HOSTS)) {
    return true;
  }
  const path = parsed.pathname.toLowerCase();
  if (host === "slack.com" || host.endsWith(".slack.com")) {
    return (
      path.startsWith("/invite") ||
      path.startsWith("/shared_invite") ||
      path.startsWith("/join") ||
      path.includes("/ssb/redirect")
    );
  }
  return false;
}

export function isNsfwUrl(parsed: URL): boolean {
  const host = hostnameOf(parsed);
  if (hostMatchesAny(host, NSFW_HOSTS)) {
    return true;
  }
  const segments = parsed.pathname.toLowerCase().split("/").filter(Boolean);
  return segments.some((segment) => NSFW_PATH_SEGMENTS.has(segment));
}

function parseAbsoluteUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new UrlError("invalid_url", "apply URL is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UrlError("invalid_url", "apply URL is not a valid URL");
  }
  if (parsed.protocol.toLowerCase() !== "https:") {
    throw new UrlError("invalid_url", "apply URL must be https");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new UrlError("invalid_url", "apply URL must not include credentials");
  }
  return parsed;
}

/** Format https URL: lowercase host, no :443, no trailing slash, no query/hash. */
export function formatCanonicalHttps(parsed: URL): string {
  const host = hostnameOf(parsed);
  if (!host) {
    throw new UrlError(
      "tracking_stripped_empty",
      "apply URL is empty after stripping query / host",
    );
  }
  const port = parsed.port && parsed.port !== "443" ? `:${parsed.port}` : "";
  let path = parsed.pathname;
  if (path.length > 1) {
    path = path.replace(/\/+$/, "");
  }
  if (path === "/") {
    path = "";
  }
  const hostForUrl = host.includes(":") ? `[${host}]` : host;
  return `https://${hostForUrl}${port}${path}`;
}

/**
 * Require https, resolve one documented shortener hop when a fixture/live
 * target is supplied, strip query + fragment, reject chat/NSFW/credentials.
 */
export function canonicalizeApplyUrl(
  raw: string,
  options: CanonicalizeOptions = {},
): string {
  const parsed = parseAbsoluteUrl(raw);
  const host = hostnameOf(parsed);

  if (!host) {
    throw new UrlError(
      "tracking_stripped_empty",
      "apply URL is empty after stripping query / host",
    );
  }

  if (isShortenerHost(host)) {
    const target =
      options.resolvedTarget?.trim() ||
      (options.resolveShortener
        ? options.resolveShortener(raw.trim())
        : undefined);
    if (!target) unresolvedShortener();
    // One hop only — never store the shortener, never follow a second hop.
    return canonicalizeApplyUrl(target);
  }

  if (isChatUrl(parsed)) {
    throw new UrlError(
      "chat_link_forbidden",
      "chat and invite links are not allowed",
    );
  }
  if (isNsfwUrl(parsed)) {
    throw new UrlError("nsfw_forbidden", "adult / NSFW apply URLs are not allowed");
  }

  return formatCanonicalHttps(parsed);
}

/**
 * 302 target for `/out/:id`. Never adds query parameters. Strips any leftover
 * tracking if a dirty URL slipped into storage.
 */
export function outboundApplyUrl(stored: string): string {
  return canonicalizeApplyUrl(stored);
}

export type UrlResolveEnv = Record<string, string | undefined>;

export const SHORTENER_HOP_TIMEOUT_MS = 5_000;

export function isLiveUrlResolveEnabled(
  env: UrlResolveEnv = process.env,
): boolean {
  if (env.WAFFO_MODE === "fixture") return false;
  return env.URL_RESOLVE_LIVE === "1"
    || env.WAFFO_MODE === "waffo-test"
    || env.WAFFO_MODE === "waffo-prod";
}

export type ShortenerFetch = (
  input: string,
  init: {
    method: "HEAD";
    redirect: "manual";
    signal?: AbortSignal;
  },
) => Promise<{ headers: { get(name: string): string | null } }>;

export type ShortenerResolveDeps = {
  fetchImpl?: ShortenerFetch;
  env?: UrlResolveEnv;
  /** Tests may shorten the production timeout without changing live defaults. */
  timeoutMs?: number;
};

function defaultShortenerFetch(): ShortenerFetch {
  const globalFetch = globalThis.fetch;
  if (typeof globalFetch !== "function") unresolvedShortener();
  return (input, init) => globalFetch.call(globalThis, input, init);
}

function looksLikeAbsoluteUrl(raw: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(raw);
}

/**
 * Resolve only a documented shortener input. Handles and direct HTTPS URLs
 * are returned untouched so checkout creation stays offline for them.
 */
export async function resolveShortenerInput(
  raw: string,
  deps: ShortenerResolveDeps = {},
): Promise<string> {
  const trimmed = raw.trim();
  if (!looksLikeAbsoluteUrl(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (
    parsed.protocol.toLowerCase() !== "https:" ||
    !isShortenerHost(hostnameOf(parsed))
  ) {
    return trimmed;
  }
  return resolveShortenerHop(trimmed, deps);
}

/**
 * Live-only: one redirect hop for a documented shortener. Tests must not call
 * this without injecting `fetchImpl` — default CI has fixture-only env.
 */
export async function resolveShortenerHop(
  raw: string,
  deps: ShortenerResolveDeps = {},
): Promise<string> {
  const env = deps.env ?? process.env;
  const parsed = parseAbsoluteUrl(raw);
  const host = hostnameOf(parsed);
  if (!isShortenerHost(host)) {
    return raw.trim();
  }

  if (!isLiveUrlResolveEnabled(env)) unresolvedShortener();

  const fetchImpl = deps.fetchImpl ?? defaultShortenerFetch();

  let location: string | null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller =
    typeof AbortController === "function" ? new AbortController() : undefined;
  try {
    const responsePromise = fetchImpl(parsed.href, {
      method: "HEAD",
      redirect: "manual",
      ...(controller ? { signal: controller.signal } : {}),
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller?.abort();
        reject(new Error("shortener hop timed out"));
      }, deps.timeoutMs ?? SHORTENER_HOP_TIMEOUT_MS);
    });
    const response = await Promise.race([responsePromise, timeout]);
    location = response.headers.get("location");
  } catch {
    unresolvedShortener();
  } finally {
    if (timer) clearTimeout(timer);
  }

  const trimmedLocation = location?.trim();
  if (!trimmedLocation) unresolvedShortener();

  let resolved: URL;
  try {
    resolved = new URL(trimmedLocation, parsed);
  } catch {
    unresolvedShortener();
  }
  if (resolved.protocol !== "https:") {
    throw new UrlError("invalid_url", "apply URL must be https");
  }
  if (isShortenerHost(hostnameOf(resolved))) unresolvedShortener();
  return resolved.href;
}
