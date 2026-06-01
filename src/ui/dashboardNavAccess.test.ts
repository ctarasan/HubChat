import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessAnalyticsPage,
  canAccessSlaPolicyPage,
  canEditSlaPolicy,
  canViewAnalyticsNav,
  canViewSlaPolicyNav
} from "./dashboardNavAccess.js";

test("canViewSlaPolicyNav allows MANAGER and ADMIN only", () => {
  assert.equal(canViewSlaPolicyNav("ADMIN"), true);
  assert.equal(canViewSlaPolicyNav("MANAGER"), true);
  assert.equal(canViewSlaPolicyNav("SALES"), false);
  assert.equal(canViewSlaPolicyNav(null), false);
});

test("canEditSlaPolicy allows ADMIN only", () => {
  assert.equal(canEditSlaPolicy("ADMIN"), true);
  assert.equal(canEditSlaPolicy("MANAGER"), false);
  assert.equal(canEditSlaPolicy("SALES"), false);
});

test("canAccessSlaPolicyPage matches nav visibility", () => {
  assert.equal(canAccessSlaPolicyPage("MANAGER"), canViewSlaPolicyNav("MANAGER"));
  assert.equal(canAccessSlaPolicyPage("SALES"), false);
});

test("canViewAnalyticsNav allows MANAGER and ADMIN only", () => {
  assert.equal(canViewAnalyticsNav("ADMIN"), true);
  assert.equal(canViewAnalyticsNav("MANAGER"), true);
  assert.equal(canViewAnalyticsNav("SALES"), false);
  assert.equal(canViewAnalyticsNav(null), false);
});

test("canAccessAnalyticsPage matches analytics nav visibility", () => {
  assert.equal(canAccessAnalyticsPage("MANAGER"), canViewAnalyticsNav("MANAGER"));
  assert.equal(canAccessAnalyticsPage("SALES"), false);
});
