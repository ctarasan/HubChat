import { clearSessionConfig } from "./sessionConfig.js";

export const SESSION_EXPIRED_REASON = "session_expired";

export const SESSION_EXPIRED_LOGIN_MESSAGE = "Your session has expired. Please sign in again.";

export class SessionExpiredError extends Error {
  readonly name = "SessionExpiredError";
  constructor(message = "Session expired") {
    super(message);
  }
}

export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof SessionExpiredError || (error instanceof Error && error.name === "SessionExpiredError");
}

/** True only for confirmed authentication failure (expired/invalid session). */
export function isSessionExpiredHttpStatus(status: number): boolean {
  return status === 401;
}

/**
 * Allow only same-origin relative app paths for post-login return.
 * Rejects absolute/external URLs, protocol-relative URLs, API routes, and login itself.
 */
export function sanitizeReturnTo(candidate: string | null | undefined): string | null {
  if (typeof candidate !== "string") return null;
  const raw = candidate.trim();
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  if (/[\r\n\0]/.test(raw)) return null;
  if (raw.startsWith("/api/") || raw === "/api") return null;
  const pathOnly = raw.split(/[?#]/, 2)[0] ?? raw;
  if (pathOnly === "/login" || pathOnly.startsWith("/login/")) return null;
  return raw;
}

export function buildSessionExpiredLoginUrl(returnTo?: string | null): string {
  const params = new URLSearchParams();
  params.set("reason", SESSION_EXPIRED_REASON);
  const safe = sanitizeReturnTo(returnTo);
  if (safe) params.set("returnTo", safe);
  return `/login?${params.toString()}`;
}

export function readLoginReason(search: string | null | undefined): string | null {
  if (typeof search !== "string" || !search.trim()) return null;
  try {
    const q = search.startsWith("?") ? search.slice(1) : search;
    const reason = new URLSearchParams(q).get("reason");
    return reason && reason.trim() ? reason.trim() : null;
  } catch {
    return null;
  }
}

export function readSafeReturnTo(search: string | null | undefined): string | null {
  if (typeof search !== "string" || !search.trim()) return null;
  try {
    const q = search.startsWith("?") ? search.slice(1) : search;
    return sanitizeReturnTo(new URLSearchParams(q).get("returnTo"));
  } catch {
    return null;
  }
}

export function sessionExpiredMessageForReason(reason: string | null | undefined): string | null {
  return reason === SESSION_EXPIRED_REASON ? SESSION_EXPIRED_LOGIN_MESSAGE : null;
}

export function isLoginPath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== "string" || !pathname.trim()) return false;
  const path = pathname.trim().split(/[?#]/, 2)[0] ?? "";
  return path === "/login" || path.startsWith("/login/");
}

type RedirectDeps = {
  storage?: Pick<Storage, "removeItem"> | null;
  currentPathname?: string;
  currentSearch?: string;
  returnTo?: string | null;
  clearSession?: (storage: Pick<Storage, "removeItem"> | null | undefined) => void;
  replace?: (url: string) => void;
};

let redirectInFlight = false;

/** Exposed for tests and successful login re-entry. */
export function isSessionExpiredRedirectInFlight(): boolean {
  return redirectInFlight;
}

export function resetSessionExpiredRedirectGuard(): void {
  redirectInFlight = false;
}

/**
 * Single-flight session-expired cleanup + Login redirect.
 * Returns true when this call initiated the redirect.
 */
export function handleSessionExpired(deps: RedirectDeps = {}): boolean {
  if (redirectInFlight) return false;

  const pathname =
    deps.currentPathname ??
    (typeof globalThis !== "undefined" && "location" in globalThis
      ? String((globalThis as { location?: { pathname?: string } }).location?.pathname ?? "")
      : "");
  if (isLoginPath(pathname)) return false;

  redirectInFlight = true;

  const storage =
    deps.storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? ((globalThis as { localStorage?: Storage }).localStorage ?? null)
      : null);

  try {
    (deps.clearSession ?? clearSessionConfig)(storage);
  } catch {
    // Cleanup failure must not block redirect.
  }

  const search =
    deps.currentSearch ??
    (typeof globalThis !== "undefined" && "location" in globalThis
      ? String((globalThis as { location?: { search?: string } }).location?.search ?? "")
      : "");
  const returnTo =
    deps.returnTo !== undefined
      ? deps.returnTo
      : `${pathname}${search}`;
  const url = buildSessionExpiredLoginUrl(returnTo);

  const replace =
    deps.replace ??
    ((target: string) => {
      if (typeof globalThis !== "undefined" && "location" in globalThis) {
        (globalThis as { location: { replace: (u: string) => void } }).location.replace(target);
      }
    });

  try {
    replace(url);
  } catch {
    // If navigation fails, keep the guard set to avoid toast/redirect storms.
  }
  return true;
}

/**
 * Observe an authenticated Response. On HTTP 401, start the session-expired flow once.
 * Does not redirect for 403/other statuses. Returns true when 401 was handled.
 */
export function noteAuthenticatedResponse(res: Pick<Response, "status">, deps?: RedirectDeps): boolean {
  if (!isSessionExpiredHttpStatus(res.status)) return false;
  handleSessionExpired(deps);
  return true;
}
