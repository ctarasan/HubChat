import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dashboardNavBundleSource } from "./dashboardNavTestSources.js";

const pageSource = readFileSync(new URL("./SlaPolicyPage.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const leadsSource = readFileSync(new URL("./LeadsPage.tsx", import.meta.url), "utf8");

test("SLA Policy page fetches GET and PATCH /api/sla-policy", () => {
  assert.equal(pageSource.includes('data-testid="sla-policy-page"'), true);
  assert.ok(pageSource.includes('fetchWithTenantHeaders(session, tenantId, "/api/sla-policy")'));
  assert.ok(pageSource.includes('method: "PATCH"'));
  assert.ok(pageSource.includes("formStateToPatchBody(form)"));
});

test("ADMIN can edit and save policy", () => {
  assert.equal(pageSource.includes("canEditSlaPolicy"), true);
  assert.equal(pageSource.includes('data-testid="sla-policy-save"'), true);
  assert.equal(pageSource.includes('data-testid="sla-policy-reset"'), true);
  assert.ok(pageSource.includes("disabled={!canEdit"));
});

test("MANAGER sees read-only banner", () => {
  assert.equal(pageSource.includes('data-testid="sla-policy-readonly-banner"'), true);
  assert.ok(pageSource.includes("คุณมีสิทธิ์ดู SLA Policy แต่ไม่สามารถแก้ไขได้"));
});

test("SALES access denied on SLA Policy page", () => {
  assert.equal(pageSource.includes('data-testid="sla-policy-access-denied"'), true);
  assert.equal(pageSource.includes("canAccessSlaPolicyPage"), true);
  assert.ok(pageSource.includes("คุณไม่มีสิทธิ์เข้าถึงหน้านี้"));
});

test("SLA Policy page states: loading, error, default notice, success, conflict", () => {
  assert.equal(pageSource.includes('data-testid="sla-policy-loading"'), true);
  assert.equal(pageSource.includes('data-testid="sla-policy-load-error"'), true);
  assert.equal(pageSource.includes('data-testid="sla-policy-default-notice"'), true);
  assert.equal(pageSource.includes('data-testid="sla-policy-save-success"'), true);
  assert.equal(pageSource.includes('data-testid="sla-policy-conflict"'), true);
  assert.ok(pageSource.includes("บันทึก SLA Policy แล้ว"));
  assert.ok(pageSource.includes("SLA_POLICY_CONFLICT_MESSAGE_TH"));
});

test("SLA Policy page does not send deferred API fields", () => {
  assert.equal(pageSource.includes("Coming soon"), true);
  assert.equal(pageSource.includes("Channel-specific SLA"), true);
  assert.equal(pageSource.includes('businessHours:'), false);
  assert.equal(pageSource.includes("formStateToPatchBody"), true);
});

test("SLA Policy page uses API-driven form without local timing defaults", () => {
  assert.equal(pageSource.includes("apiDataToFormState"), true);
  assert.equal(pageSource.includes("buildDefaultTenantSlaPolicy"), false);
  assert.equal(pageSource.includes("7200000"), false);
  assert.equal(pageSource.includes("DEFAULT_SLA_DUE_SOON"), false);
});

test("unsaved changes and validation gate save", () => {
  assert.equal(pageSource.includes('data-testid="sla-policy-unsaved"'), true);
  assert.ok(pageSource.includes("!validation.valid || !dirty"));
});

test("Dashboard shows SLA Policy nav for MANAGER and ADMIN only", () => {
  assert.equal(dashboardNavBundleSource.includes("canViewSlaPolicyNav"), true);
  assert.equal(dashboardNavBundleSource.includes('testId: "nav-sla-policy"'), true);
  assert.equal(dashboardNavBundleSource.includes('href: "/dashboard/sla-policy"'), true);
});

test("Leads page includes SLA Policy nav for managers and admins", () => {
  assert.equal(leadsSource.includes("<DashboardAppRail"), true);
  assert.equal(dashboardNavBundleSource.includes('testId: "nav-sla-policy"'), true);
  assert.equal(dashboardNavBundleSource.includes("canViewSlaPolicyNav"), true);
});

test("route page re-exports SlaPolicyPage", () => {
  const routeSource = readFileSync(
    new URL("../../app/dashboard/sla-policy/page.tsx", import.meta.url),
    "utf8"
  );
  assert.equal(routeSource.includes("SlaPolicyPage"), true);
  assert.equal(routeSource.includes("/dashboard/sla-policy"), false);
});

test("globals.css gives SLA duration number input usable min-width", () => {
  const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(globalsCss, /\.sla-policy-duration-input\s*\{[^}]*display:\s*grid/s);
  assert.match(
    globalsCss,
    /\.sla-policy-duration-input\s*\{[^}]*grid-template-columns:\s*minmax\(7rem,\s*9rem\)\s*minmax\(8rem,\s*1fr\)/s
  );
  assert.match(globalsCss, /\.sla-policy-duration-input input\s*\{[^}]*min-width:\s*7rem/s);
  assert.match(globalsCss, /\.sla-policy-duration-input select\s*\{[^}]*min-width:\s*8rem/s);
  assert.doesNotMatch(globalsCss, /\.sla-policy-duration-input input\s*\{[^}]*min-width:\s*0/s);
});
