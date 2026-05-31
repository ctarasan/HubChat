import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessSlaPolicyPage,
  canEditSlaPolicy,
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
