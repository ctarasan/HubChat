import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_EXPIRED_LOGIN_MESSAGE,
  SESSION_EXPIRED_REASON,
  SessionExpiredError,
  buildSessionExpiredLoginUrl,
  handleSessionExpired,
  isLoginPath,
  isSessionExpiredError,
  isSessionExpiredHttpStatus,
  isSessionExpiredRedirectInFlight,
  noteAuthenticatedResponse,
  readLoginReason,
  readSafeReturnTo,
  resetSessionExpiredRedirectGuard,
  sanitizeReturnTo,
  sessionExpiredMessageForReason
} from "./sessionExpiredRedirect.js";
import { SESSION_STORAGE_KEY, saveSessionConfig } from "./sessionConfig.js";

function makeStorage() {
  const data: Record<string, string> = {};
  return {
    getItem(key: string) {
      return data[key] ?? null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    }
  };
}

test("isSessionExpiredHttpStatus treats only 401 as session expiry", () => {
  assert.equal(isSessionExpiredHttpStatus(401), true);
  assert.equal(isSessionExpiredHttpStatus(403), false);
  assert.equal(isSessionExpiredHttpStatus(400), false);
  assert.equal(isSessionExpiredHttpStatus(404), false);
  assert.equal(isSessionExpiredHttpStatus(500), false);
  assert.equal(isSessionExpiredHttpStatus(0), false);
});

test("sanitizeReturnTo accepts safe relative app paths only", () => {
  assert.equal(sanitizeReturnTo("/dashboard"), "/dashboard");
  assert.equal(sanitizeReturnTo("/dashboard/leads?owner=me"), "/dashboard/leads?owner=me");
  assert.equal(sanitizeReturnTo("https://evil.example/dashboard"), null);
  assert.equal(sanitizeReturnTo("//evil.example/dashboard"), null);
  assert.equal(sanitizeReturnTo("/api/me"), null);
  assert.equal(sanitizeReturnTo("/login"), null);
  assert.equal(sanitizeReturnTo("/login?x=1"), null);
  assert.equal(sanitizeReturnTo(""), null);
  assert.equal(sanitizeReturnTo(null), null);
});

test("buildSessionExpiredLoginUrl includes reason and safe returnTo", () => {
  const url = buildSessionExpiredLoginUrl("/dashboard");
  assert.equal(url.startsWith("/login?"), true);
  assert.match(url, /reason=session_expired/);
  assert.match(url, /returnTo=%2Fdashboard/);
  assert.equal(buildSessionExpiredLoginUrl("https://evil.example"), `/login?reason=${SESSION_EXPIRED_REASON}`);
});

test("login reason helpers", () => {
  assert.equal(readLoginReason("?reason=session_expired"), SESSION_EXPIRED_REASON);
  assert.equal(sessionExpiredMessageForReason(SESSION_EXPIRED_REASON), SESSION_EXPIRED_LOGIN_MESSAGE);
  assert.equal(sessionExpiredMessageForReason("other"), null);
  assert.equal(readSafeReturnTo("?returnTo=%2Fdashboard%2Fleads"), "/dashboard/leads");
  assert.equal(readSafeReturnTo("?returnTo=https%3A%2F%2Fevil.example"), null);
});

test("isLoginPath detects login route for loop prevention", () => {
  assert.equal(isLoginPath("/login"), true);
  assert.equal(isLoginPath("/login?reason=session_expired"), true);
  assert.equal(isLoginPath("/dashboard"), false);
});

test("401 triggers cleanup and one Login redirect via replace", () => {
  resetSessionExpiredRedirectGuard();
  const storage = makeStorage();
  saveSessionConfig(storage, {
    baseUrl: "https://example.com",
    tenantId: "tenant-1",
    accessToken: "token-1"
  });
  const redirects: string[] = [];
  const started = handleSessionExpired({
    storage,
    currentPathname: "/dashboard",
    currentSearch: "",
    replace: (url) => redirects.push(url)
  });
  assert.equal(started, true);
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), null);
  assert.equal(redirects.length, 1);
  assert.match(redirects[0]!, /\/login\?reason=session_expired/);
  assert.match(redirects[0]!, /returnTo=%2Fdashboard/);
  assert.equal(isSessionExpiredRedirectInFlight(), true);
});

test("concurrent 401 responses trigger only one redirect", () => {
  resetSessionExpiredRedirectGuard();
  const redirects: string[] = [];
  const deps = {
    storage: makeStorage(),
    currentPathname: "/dashboard",
    replace: (url: string) => redirects.push(url)
  };
  assert.equal(noteAuthenticatedResponse({ status: 401 }, deps), true);
  assert.equal(noteAuthenticatedResponse({ status: 401 }, deps), true);
  assert.equal(handleSessionExpired(deps), false);
  assert.equal(redirects.length, 1);
});

test("403 and 500 do not redirect", () => {
  resetSessionExpiredRedirectGuard();
  const redirects: string[] = [];
  const deps = {
    storage: makeStorage(),
    currentPathname: "/dashboard",
    replace: (url: string) => redirects.push(url)
  };
  assert.equal(noteAuthenticatedResponse({ status: 403 }, deps), false);
  assert.equal(noteAuthenticatedResponse({ status: 500 }, deps), false);
  assert.equal(redirects.length, 0);
  assert.equal(isSessionExpiredRedirectInFlight(), false);
});

test("Login route does not redirect to itself", () => {
  resetSessionExpiredRedirectGuard();
  const redirects: string[] = [];
  const started = handleSessionExpired({
    storage: makeStorage(),
    currentPathname: "/login",
    replace: (url) => redirects.push(url)
  });
  assert.equal(started, false);
  assert.equal(redirects.length, 0);
});

test("cleanup failure still redirects to Login", () => {
  resetSessionExpiredRedirectGuard();
  const redirects: string[] = [];
  const started = handleSessionExpired({
    storage: makeStorage(),
    currentPathname: "/dashboard/leads",
    clearSession: () => {
      throw new Error("storage_locked");
    },
    replace: (url) => redirects.push(url)
  });
  assert.equal(started, true);
  assert.equal(redirects.length, 1);
  assert.match(redirects[0]!, /reason=session_expired/);
});

test("resetSessionExpiredRedirectGuard allows a later redirect after successful login", () => {
  resetSessionExpiredRedirectGuard();
  const redirects: string[] = [];
  handleSessionExpired({
    storage: makeStorage(),
    currentPathname: "/dashboard",
    replace: (url) => redirects.push(url)
  });
  resetSessionExpiredRedirectGuard();
  assert.equal(isSessionExpiredRedirectInFlight(), false);
  handleSessionExpired({
    storage: makeStorage(),
    currentPathname: "/dashboard",
    replace: (url) => redirects.push(url)
  });
  assert.equal(redirects.length, 2);
});

test("SessionExpiredError identity helpers", () => {
  const err = new SessionExpiredError();
  assert.equal(isSessionExpiredError(err), true);
  assert.equal(isSessionExpiredError(new Error("Unauthorized")), false);
});
