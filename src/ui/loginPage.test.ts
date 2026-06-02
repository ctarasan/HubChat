import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const loginSource = readFileSync(new URL("./LoginPage.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const teamMembersSource = readFileSync(new URL("./TeamMembersPage.tsx", import.meta.url), "utf8");

test("/login page exists as app route importing LoginPage", () => {
  const route = readFileSync(new URL("../../app/login/page.tsx", import.meta.url), "utf8");
  assert.equal(route.includes("LoginPage"), true);
});

test("login form includes email and password fields", () => {
  assert.equal(loginSource.includes('type="email"'), true);
  assert.equal(loginSource.includes('type="password"'), true);
});

test("login page does not include access token field", () => {
  assert.equal(loginSource.toLowerCase().includes("access token"), false);
  assert.equal(loginSource.includes("textarea"), false);
});

test("login page includes Advanced setup link to /setup", () => {
  assert.equal(loginSource.includes('href="/setup"'), true);
  assert.equal(loginSource.includes("Advanced setup"), true);
});

test("login page has hub-login card markers", () => {
  assert.equal(loginSource.includes("hub-login-card"), true);
  assert.equal(loginSource.includes("hub-login-root"), true);
});

test("login page renders SmartKorp brand logo", () => {
  assert.equal(loginSource.includes("hub-login-brand-logo"), true);
  assert.equal(loginSource.includes("login-brand-logo"), true);
  assert.equal(loginSource.includes("SMARTKORP_BRAND_ASSETS.wordmark"), true);
});

test("login page calls saveSessionConfig and redirects to dashboard after success", () => {
  assert.equal(loginSource.includes("saveSessionConfig"), true);
  assert.equal(loginSource.includes('window.location.replace("/dashboard")'), true);
});

test("login page maps 401 to invalid credentials copy", () => {
  assert.equal(loginSource.includes("Invalid email or password."), true);
});

test("Dashboard sidebar includes Sign out clearing session and navigating to login", () => {
  assert.equal(dashboardSource.includes("DashboardAppRailSignOutButton"), true);
  assert.equal(dashboardSource.includes("clearSessionConfig"), true);
  assert.equal(dashboardSource.includes('window.location.replace("/login")'), true);
});

test("Team Members sidebar includes Sign out", () => {
  assert.equal(teamMembersSource.includes("DashboardAppRailSignOutButton"), true);
  assert.equal(teamMembersSource.includes("clearSessionConfig"), true);
});

test("Team Members create drawer includes Login account section", () => {
  assert.equal(teamMembersSource.includes("Login account"), true);
  assert.equal(teamMembersSource.includes("Create login account"), true);
});

test("LoginPage does not import service role or admin provision", () => {
  assert.equal(loginSource.includes("SERVICE_ROLE"), false);
  assert.equal(loginSource.includes("createServiceSupabaseClient"), false);
  assert.equal(loginSource.includes("authAdminProvision"), false);
});

test("TeamMembersPage does not import service role", () => {
  assert.equal(teamMembersSource.includes("SERVICE_ROLE"), false);
  assert.equal(teamMembersSource.includes("createServiceSupabaseClient"), false);
});

test("no invitation sent copy on login or team members page", () => {
  assert.equal(loginSource.toLowerCase().includes("invitation sent"), false);
  assert.equal(teamMembersSource.toLowerCase().includes("invitation sent"), false);
});

test("no ChannelIcon or WhatsApp in login page", () => {
  assert.equal(loginSource.includes("ChannelIcon"), false);
  assert.equal(loginSource.includes("WhatsApp"), false);
});

test("home page redirects to login or dashboard based on session", () => {
  const home = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
  assert.equal(home.includes("hasRequiredSessionConfig"), true);
  assert.equal(home.includes("/login"), true);
  assert.equal(home.includes("/dashboard"), true);
});
