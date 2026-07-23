import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const loginSource = readFileSync(new URL("./LoginPage.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
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
  assert.equal(loginSource.includes("SMARTKORP_BRAND_ASSETS.loginWordmark"), true);
  assert.equal(loginSource.includes("SMARTKORP_BRAND_ASSETS.wordmark"), false);
  assert.equal(loginSource.includes("AW_SmartKorp_Logo_Serie-01.jpg"), false);
  assert.equal(loginSource.includes("width={192}"), true);
  assert.equal(loginSource.includes("height={42}"), true);
  assert.equal(loginSource.includes("SMARTKORP_BRAND_ALT"), true);
});

test("login logo CSS sizes the cropped wordmark without square-canvas aspect hack", () => {
  const logoBlock = globalsSource.slice(
    globalsSource.indexOf(".hub-login-brand-logo"),
    globalsSource.indexOf(".hub-login-title")
  );
  assert.match(logoBlock, /width:\s*min\(100%,\s*192px\)/);
  assert.doesNotMatch(logoBlock, /aspect-ratio:\s*280\s*\/\s*64/);
  assert.doesNotMatch(logoBlock, /max-height:\s*52px/);
  assert.doesNotMatch(logoBlock, /width:\s*min\(100%,\s*340px\)/);
  assert.match(globalsSource, /html\[data-theme="dark"\][\s\S]*\.hub-login-brand-logo[\s\S]*background:\s*#ffffff/);
  assert.match(globalsSource, /@media \(max-width:\s*480px\)[\s\S]*\.hub-login-brand-logo[\s\S]*width:\s*min\(100%,\s*168px\)/);
  const brandBlock = globalsSource.slice(
    globalsSource.indexOf(".hub-login-brand {"),
    globalsSource.indexOf(".hub-login-brand-logo")
  );
  assert.match(brandBlock, /margin:\s*0\s+0\s+24px/);
});

test("login page keeps heading, form, and Advanced setup after logo resize", () => {
  assert.match(loginSource, /Sign in to HubChat/);
  assert.match(loginSource, /data-testid="login-email"/);
  assert.match(loginSource, /data-testid="login-submit"/);
  assert.match(loginSource, /Advanced setup/);
});

test("login page calls saveSessionConfig and redirects after success", () => {
  assert.equal(loginSource.includes("saveSessionConfig"), true);
  assert.equal(loginSource.includes("window.location.replace"), true);
  assert.equal(loginSource.includes("readSafeReturnTo"), true);
  assert.equal(loginSource.includes('"/dashboard"'), true);
});

test("login page shows session-expired notice from reason query", () => {
  assert.equal(loginSource.includes("login-session-expired-notice"), true);
  assert.equal(loginSource.includes("sessionExpiredMessageForReason"), true);
  assert.equal(loginSource.includes("resetSessionExpiredRedirectGuard"), true);
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
