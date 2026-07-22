import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(here, "DashboardPage.tsx"), "utf8");
const loginSource = readFileSync(join(here, "LoginPage.tsx"), "utf8");
const cssSource = readFileSync(join(here, "../../app/globals.css"), "utf8");

test("Dashboard apiFetch redirects on 401 via centralized session-expired handler", () => {
  assert.match(dashboardSource, /noteAuthenticatedResponse\(res\)/);
  assert.match(dashboardSource, /SessionExpiredError/);
  assert.match(dashboardSource, /isSessionExpiredError/);
});

test("Dashboard /api/me bootstrap does not leave Unauthorized error after session expiry", () => {
  assert.match(dashboardSource, /isSessionExpiredError\(e\)/);
  assert.match(dashboardSource, /if \(cancelled \|\| isSessionExpiredError\(e\)\) return;/);
});

test("Dashboard templates and attachment upload observe 401 without auto-replay", () => {
  assert.match(dashboardSource, /noteAuthenticatedResponse\(res\)/);
  assert.match(dashboardSource, /noteAuthenticatedResponse\(uploadRes\)/);
  assert.doesNotMatch(dashboardSource, /retry.*SessionExpired|SessionExpired.*retry/i);
});

test("Login page uses replace navigation and session-expired banner styles exist", () => {
  assert.match(loginSource, /window\.location\.replace/);
  assert.match(cssSource, /\.hub-login-session-notice/);
});
