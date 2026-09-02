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

const URL_SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;
const RAW_URL_CONTROL_RE = /[\p{Cc}\p{Cf}]/u;
const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

type AuthorityParts = {
  host: string;
  port?: string;
};

function invalidUrl(message: string): never {
  throw new UrlError("invalid_url", message);
}

function validPort(port: string): boolean {
  if (!/^\d{1,5}$/.test(port)) return false;
  const value = Number(port);
  return value >= 1 && value <= 65_535;
}

/** Parse only the authority syntax accepted by the scheme-less shorthand. */
function authorityParts(raw: string): AuthorityParts | undefined {
  const protocolRelative = raw.startsWith("//");
  if (raw.startsWith("///") || (raw.startsWith("/") && !protocolRelative)) {
    return undefined;
  }

  const withoutPrefix = protocolRelative ? raw.slice(2) : raw;
  const authority = withoutPrefix.split(/[/?#]/, 1)[0] ?? "";
  if (!authority || authority.includes("@") || /[\s\\%]/.test(authority)) {
    return undefined;
  }

  if (authority.startsWith("[")) {
    const close = authority.indexOf("]");
    if (close < 2) return undefined;
    const host = authority.slice(0, close + 1);
    const suffix = authority.slice(close + 1);
    if (suffix === "") return { host };
    if (!suffix.startsWith(":") || !validPort(suffix.slice(1))) {
      return undefined;
    }
    return { host, port: suffix.slice(1) };
  }

  if (authority.includes("[") || authority.includes("]")) return undefined;
  const firstColon = authority.indexOf(":");
  if (firstColon !== authority.lastIndexOf(":")) return undefined;
  if (firstColon === -1) return { host: authority };

  const host = authority.slice(0, firstColon);
  const port = authority.slice(firstColon + 1);
  if (!host || !validPort(port)) return undefined;
  return { host, port };
}

function plausibleDnsHostname(host: string): boolean {
  const canonical = host.toLowerCase().replace(/\.+$/, "");
  if (
    !canonical ||
    canonical.startsWith(".") ||
    canonical.includes("..") ||
    canonical.length > 253
  ) {
    return false;
  }
  const labels = canonical.split(".");
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 && label.length <= 63 && DNS_LABEL_RE.test(label),
    )
  );
}

function plausibleBareAuthority(raw: string): boolean {
  if (!raw || RAW_URL_CONTROL_RE.test(raw) || raw.includes("\\")) {
    return false;
  }
  const parts = authorityParts(raw);
  if (!parts) return false;
  const host = parts.host;
  if (host.startsWith("[")) {
    // The URL parser performs the exact IPv6 grammar check. Requiring a
    // bracketed colon-bearing host keeps bare `::1` and malformed
    // bracket authorities out of the fallback path.
    return host.includes(":");
  }
  return host.toLowerCase() === "localhost" || plausibleDnsHostname(host);
}

/**
 * Default only host-shaped input to HTTPS. Explicit schemes remain intact so
 * the parser can reject every non-HTTPS protocol instead of upgrading it.
 */
function withHttpsScheme(raw: string): string {
  if (RAW_URL_CONTROL_RE.test(raw) || raw.includes("\\")) {
    return invalidUrl("apply URL contains a control character or backslash");
  }
  if (raw.startsWith("//")) {
    if (!plausibleBareAuthority(raw)) {
      return invalidUrl("apply URL authority is malformed");
    }
    return `https:${raw}`;
  }
  if (raw.startsWith("/")) {
    return invalidUrl("apply URL must include a host");
  }
  if (plausibleBareAuthority(raw)) return `https://${raw}`;

  const scheme = URL_SCHEME_RE.exec(raw);
  if (!scheme) return invalidUrl("apply URL must include a public host");
  if (scheme[1]?.toLowerCase() === "https") {
    const rest = raw.slice(scheme[0].length);
    if (
      !rest.startsWith("//") ||
      rest.startsWith("///") ||
      !authorityParts(rest)
    ) {
      return invalidUrl("apply URL must include a valid HTTPS authority");
    }
  }
  return raw;
}

/**
 * Company handles stay scheme-less, while a domain/path is a valid apply
 * identity even when the employer omits the `https://` prefix. Keep this
 * deliberately conservative so values such as `@company` remain handles.
 */
export function isUrlLikeApplyIdentity(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("@")) return false;
  if (
    RAW_URL_CONTROL_RE.test(trimmed) ||
    trimmed.includes("\\") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    URL_SCHEME_RE.test(trimmed)
  ) {
    return true;
  }

  const authority = trimmed.split(/[/?#]/, 1)[0] ?? "";
  if (!authority) return false;
  if (plausibleBareAuthority(trimmed)) return true;
  // Numeric-only authorities are not valid company handles when they are
  // supplied as URL-shaped identities; route them through URL validation.
  return /^(?:0x[0-9a-f]+|\d+)(?::|[/?#]|$)/i.test(authority);
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

type Ipv4 = [number, number, number, number];

function parseIpv4(host: string): Ipv4 | undefined {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return undefined;
  const octets = host.split(".").map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }
  return octets as Ipv4;
}

/** Decode the legacy decimal/hex/octal IPv4 spellings normalized by WHATWG. */
function parseLegacyIpv4(host: string): Ipv4 | undefined {
  const parts = host.split(".");
  if (
    parts.length < 1 ||
    parts.length > 4 ||
    parts.some((part) => !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(part))
  ) {
    return undefined;
  }

  const values = parts.map((part) => {
    if (/^0x/i.test(part)) return Number.parseInt(part.slice(2), 16);
    if (part.length > 1 && part.startsWith("0")) return Number.parseInt(part, 8);
    return Number.parseInt(part, 10);
  });
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return undefined;
  }

  let address: number;
  if (values.length === 1 && values[0] <= 0xffff_ffff) {
    address = values[0];
  } else if (values.length === 2 && values[0] <= 0xff && values[1] <= 0xff_ffff) {
    address = values[0] * 0x1_00_00_00 + values[1];
  } else if (
    values.length === 3 &&
    values[0] <= 0xff &&
    values[1] <= 0xff &&
    values[2] <= 0xffff
  ) {
    address = values[0] * 0x1_00_00_00 + values[1] * 0x1_00_00 + values[2];
  } else if (values.length === 4 && values.every((value) => value <= 0xff)) {
    address =
      values[0] * 0x1_00_00_00 +
      values[1] * 0x1_00_00 +
      values[2] * 0x100 +
      values[3];
  } else {
    return undefined;
  }

  return [
    Math.floor(address / 0x1_00_00_00) % 0x100,
    Math.floor(address / 0x1_00_00) % 0x100,
    Math.floor(address / 0x100) % 0x100,
    address % 0x100,
  ];
}

/** RFC 6890, RFC 5737, RFC 6598, and other non-public IPv4 allocations. */
function isPrivateOrReservedIpv4([first, second, third]: Ipv4): boolean {
  if (first === 0 || first === 10 || first === 127 || first >= 224) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 0) return true;
  if (first === 192 && second === 2) return true;
  if (first === 192 && second === 31 && third === 196) return true;
  if (first === 192 && second === 52 && third === 193) return true;
  if (first === 192 && second === 88 && third === 99) return true;
  if (first === 192 && second === 168) return true;
  if (first === 198 && second >= 18 && second <= 19) return true;
  if (first === 198 && second === 51 && third === 100) return true;
  if (first === 203 && second === 0 && third === 113) return true;
  return false;
}

function parseIpv6Words(host: string): number[] | undefined {
  const halves = host.split("::");
  if (halves.length > 2) return undefined;

  const parseHalf = (half: string): number[] | undefined => {
    if (!half) return [];
    const words: number[] = [];
    const groups = half.split(":");
    for (const [index, group] of groups.entries()) {
      if (group.includes(".")) {
        const ipv4 = parseIpv4(group);
        if (!ipv4 || index !== groups.length - 1) return undefined;
        words.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(group)) return undefined;
        words.push(Number.parseInt(group, 16));
      }
    }
    return words;
  };

  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves.length === 2 ? halves[1] ?? "" : "");
  if (!left || !right) return undefined;
  if (halves.length === 1) return left.length === 8 ? left : undefined;
  const zeroWords = 8 - left.length - right.length;
  if (zeroWords < 1) return undefined;
  return [
    ...left,
    ...Array.from({ length: zeroWords }, () => 0),
    ...right,
  ];
}

function isPrivateOrReservedIpv6(words: number[]): boolean {
  if (words.length !== 8) return true;
  const [a, b, c, d, e, f, g, h] = words;
  const mappedIpv4: Ipv4 | undefined =
    a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff
      ? [g >> 8, g & 0xff, h >> 8, h & 0xff]
      : undefined;
  if (mappedIpv4 && isPrivateOrReservedIpv4(mappedIpv4)) return true;

  if (
    words.every((word) => word === 0) ||
    (words.slice(0, 7).every((word) => word === 0) && h === 1) ||
    (a === 0 && b === 0 && c === 0 && d === 0 && e === 0) ||
    (a === 0x0064 && b === 0xff9b) // NAT64 / well-known translation prefix
  ) {
    return true;
  }
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((a & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if ((a & 0xffc0) === 0xfec0) return true; // fec0::/10 site local
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return true; // discard
  if (a === 0x2001 && b === 0) return true; // Teredo / protocol assignments
  if (a === 0x2001 && b === 2 && c === 0) return true; // benchmarking
  if (a === 0x2001 && (b & 0xfff0) === 0x0010) return true; // ORCHID
  if (a === 0x2001 && b === 0xdb8) return true; // documentation
  if (a === 0x2002) return true; // 6to4 transition space
  return false;
}

function hasPrivateEmbeddedIpv4(host: string): boolean {
  const labels = host.split(".");
  for (let index = 0; index + 3 < labels.length; index += 1) {
    const dotted = labels.slice(index, index + 4).join(".");
    const ipv4 = parseIpv4(dotted) ?? parseLegacyIpv4(dotted);
    if (ipv4 && isPrivateOrReservedIpv4(ipv4)) return true;
  }
  return labels.some((label) => {
    const legacy = parseLegacyIpv4(label);
    return legacy ? isPrivateOrReservedIpv4(legacy) : false;
  });
}

/** True when a parsed destination is not a public, plausible host. */
function isPrivateOrReservedHost(rawHost: string): boolean {
  const raw = rawHost.toLowerCase().replace(/^\[|\]$/g, "");
  const host = raw.replace(/\.+$/, "");
  if (
    !host ||
    raw.startsWith(".") ||
    host.includes("..") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "home.arpa"
  ) {
    return true;
  }

  if (host.includes(":")) {
    const words = parseIpv6Words(host);
    return !words || isPrivateOrReservedIpv6(words);
  }

  const ipv4 = parseIpv4(host);
  if (ipv4) return isPrivateOrReservedIpv4(ipv4);
  if (parseLegacyIpv4(host)) return true;
  return !plausibleDnsHostname(host) || hasPrivateEmbeddedIpv4(host);
}

function parseAbsoluteUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new UrlError("invalid_url", "apply URL is required");
  }
  if (RAW_URL_CONTROL_RE.test(trimmed) || trimmed.includes("\\")) {
    throw new UrlError(
      "invalid_url",
      "apply URL contains a control character or backslash",
    );
  }
  const candidate = withHttpsScheme(trimmed);
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new UrlError("invalid_url", "apply URL is not a valid URL");
  }
  if (parsed.protocol.toLowerCase() !== "https:") {
    throw new UrlError("invalid_url", "apply URL must be https");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new UrlError("invalid_url", "apply URL must not include credentials");
  }
  if (parsed.port && !validPort(parsed.port)) {
    throw new UrlError("invalid_url", "apply URL port is invalid");
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
 * Require HTTPS (adding it when a scheme-less domain is supplied), resolve one
 * documented shortener hop when a fixture/live target is supplied, strip
 * query + fragment, and reject chat/NSFW/credentials.
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
  if (isPrivateOrReservedHost(parsed.hostname)) {
    throw new UrlError(
      "invalid_url",
      "apply URL must point to a public destination",
    );
  }

  return formatCanonicalHttps(parsed);
}

/** Client-safe readiness check shared with the claim form. */
export function isApplyIdentityReady(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (isUrlLikeApplyIdentity(trimmed)) {
    try {
      canonicalizeApplyUrl(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return /^[a-z0-9-]{2,32}$/i.test(trimmed);
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

/**
 * Resolve only a documented shortener input. Handles and direct apply URLs
 * (including bare domains) are returned without a network hop unless they are
 * documented shorteners.
 */
export async function resolveShortenerInput(
  raw: string,
  deps: ShortenerResolveDeps = {},
): Promise<string> {
  const trimmed = raw.trim();
  if (!isUrlLikeApplyIdentity(trimmed)) return trimmed;

  const candidate = withHttpsScheme(trimmed);

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return trimmed;
  }
  if (
    parsed.protocol.toLowerCase() !== "https:" ||
    !isShortenerHost(hostnameOf(parsed))
  ) {
    return trimmed;
  }
  return resolveShortenerHop(candidate, deps);
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
