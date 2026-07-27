import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canDismissLogoutConfirm,
  canSubmitLogoutConfirm,
  createLogoutSubmitGuard,
  LOGOUT_CONFIRM_COPY
} from "./logoutConfirmModel.js";

const railSource = readFileSync(new URL("./DashboardAppRail.tsx", import.meta.url), "utf8");
const dialogSource = readFileSync(new URL("./LogoutConfirmDialog.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

test("logout confirm copy matches required Thai strings", () => {
  assert.equal(LOGOUT_CONFIRM_COPY.title, "ออกจากระบบ");
  assert.equal(LOGOUT_CONFIRM_COPY.message, "คุณต้องการออกจากระบบจริงหรือไม่?");
  assert.equal(LOGOUT_CONFIRM_COPY.cancel, "ยกเลิก");
  assert.equal(LOGOUT_CONFIRM_COPY.confirm, "ออกจากระบบ");
  assert.equal(LOGOUT_CONFIRM_COPY.pending, "กำลังออกจากระบบ...");
});

test("dismiss and submit rules respect pending phase", () => {
  assert.equal(canDismissLogoutConfirm("closed"), false);
  assert.equal(canDismissLogoutConfirm("open"), true);
  assert.equal(canDismissLogoutConfirm("pending"), false);
  assert.equal(canDismissLogoutConfirm("error"), true);
  assert.equal(canSubmitLogoutConfirm("open"), true);
  assert.equal(canSubmitLogoutConfirm("pending"), false);
  assert.equal(canSubmitLogoutConfirm("error"), true);
  assert.equal(canSubmitLogoutConfirm("closed"), false);
});

test("logout submit guard allows only one in-flight confirm", () => {
  const guard = createLogoutSubmitGuard();
  assert.equal(guard.tryBegin(), true);
  assert.equal(guard.inFlight, true);
  assert.equal(guard.tryBegin(), false);
  guard.end();
  assert.equal(guard.inFlight, false);
  assert.equal(guard.tryBegin(), true);
});

test("Sign out opens dialog instead of calling onSignOut immediately", () => {
  const btn = railSource.slice(
    railSource.indexOf("export function DashboardAppRailSignOutButton"),
    railSource.indexOf("export function DashboardAppRailReloadButton")
  );
  assert.match(btn, /onClick=\{openDialog\}/);
  assert.doesNotMatch(btn, /onClick=\{onSignOut\}/);
  assert.match(btn, /<LogoutConfirmDialog/);
  assert.match(btn, /await onSignOut\(\)/);
  assert.match(btn, /submitGuardRef\.current\.tryBegin\(\)/);
  assert.equal(btn.includes("window.confirm"), false);
  assert.equal(dialogSource.includes("window.confirm"), false);
});

test("logout dialog has required ARIA relationships", () => {
  assert.match(dialogSource, /role="dialog"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /aria-labelledby=\{titleId\}/);
  assert.match(dialogSource, /aria-describedby=\{descId\}/);
  assert.match(dialogSource, /data-testid="logout-confirm-title"/);
  assert.match(dialogSource, /data-testid="logout-confirm-message"/);
  assert.match(dialogSource, /data-testid="logout-confirm-cancel"/);
  assert.match(dialogSource, /data-testid="logout-confirm-submit"/);
  assert.match(dialogSource, /data-testid="logout-confirm-backdrop"/);
  assert.match(dialogSource, /cancelRef\.current\?\.focus\(\)/);
  assert.match(dialogSource, /Escape/);
  assert.match(dialogSource, /createPortal/);
});

test("dialog uses shared Thai copy constants", () => {
  assert.match(dialogSource, /LOGOUT_CONFIRM_COPY\.title/);
  assert.match(dialogSource, /LOGOUT_CONFIRM_COPY\.message/);
  assert.match(dialogSource, /LOGOUT_CONFIRM_COPY\.cancel/);
  assert.match(dialogSource, /LOGOUT_CONFIRM_COPY\.confirm/);
  assert.match(dialogSource, /LOGOUT_CONFIRM_COPY\.pending/);
});

test("pending disables actions and blocks backdrop/Escape dismiss", () => {
  assert.match(dialogSource, /disabled=\{pending\}/);
  assert.match(dialogSource, /disabled=\{!dismissible\}/);
  assert.match(dialogSource, /canDismissLogoutConfirm\(phase\)/);
  assert.match(railSource, /if \(phaseRef\.current === "pending"\) return;/);
});

test("focus returns to Exit after cancel", () => {
  assert.match(railSource, /exitBtnRef\.current\?\.focus\(\)/);
  assert.match(railSource, /aria-haspopup="dialog"/);
  assert.match(railSource, /aria-expanded=\{phase !== "closed"\}/);
});

test("existing logout flow remains clearSessionConfig + \/login replace", () => {
  assert.match(dashboardSource, /clearSessionConfig\(globalThis\.localStorage\)/);
  assert.match(dashboardSource, /window\.location\.replace\("\/login"\)/);
  const signOutSlice = dashboardSource.slice(
    dashboardSource.indexOf("DashboardAppRailSignOutButton"),
    dashboardSource.indexOf("DashboardAppRailSignOutButton") + 450
  );
  assert.doesNotMatch(signOutSlice, /session_expired/);
});

test("logout confirm CSS exists for light/dark and destructive confirm", () => {
  assert.match(globalsSource, /\.logout-confirm-root/);
  assert.match(globalsSource, /\.logout-confirm-panel/);
  assert.match(globalsSource, /\.logout-confirm-submit/);
  assert.match(globalsSource, /--danger-color/);
  assert.match(globalsSource, /\.logout-confirm-cancel/);
  assert.doesNotMatch(globalsSource, /window\.confirm/);
});
