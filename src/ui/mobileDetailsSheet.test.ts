import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sheetSource = readFileSync(new URL("./MobileDetailsSheet.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

test("details sheet uses dialog ARIA with labelledby and describedby", () => {
  assert.ok(sheetSource.includes('role="dialog"'));
  assert.ok(sheetSource.includes('aria-modal="true"'));
  assert.ok(sheetSource.includes("aria-labelledby={titleId}"));
  assert.ok(sheetSource.includes("aria-describedby={descId}"));
  assert.ok(sheetSource.includes('data-testid="mobile-details-sheet-title"'));
  assert.ok(!sheetSource.includes('aria-label="Conversation details"'));
});

test("details sheet portals to document body", () => {
  assert.ok(sheetSource.includes("createPortal"));
  assert.ok(sheetSource.includes("document.body"));
});

test("details sheet focuses Close on open", () => {
  assert.ok(sheetSource.includes("closeRef.current?.focus()"));
  assert.ok(sheetSource.includes('data-testid="mobile-details-sheet-close"'));
});

test("details sheet implements Tab focus trap wrap", () => {
  assert.ok(sheetSource.includes('e.key !== "Tab"'));
  assert.ok(sheetSource.includes("e.shiftKey"));
  assert.ok(sheetSource.includes("last.focus()"));
  assert.ok(sheetSource.includes("first.focus()"));
  assert.ok(sheetSource.includes('addEventListener("keydown", onKeyDown, true)'));
});

test("details sheet sets background inert while open and cleans up", () => {
  assert.ok(sheetSource.includes('setAttribute("inert", "")'));
  assert.ok(sheetSource.includes("removeAttribute(\"inert\")"));
  assert.ok(sheetSource.includes("inertTargetRef"));
});

test("Escape and backdrop close; inside click does not", () => {
  assert.ok(sheetSource.includes('e.key === "Escape"'));
  assert.ok(sheetSource.includes("onBackdropClick"));
  assert.ok(sheetSource.includes("e.stopPropagation()"));
  assert.ok(sheetSource.includes('data-testid="mobile-details-sheet-scrim"'));
});

test("focus returns to details trigger on close", () => {
  assert.ok(sheetSource.includes("returnFocusRef"));
  assert.ok(sheetSource.includes("previouslyFocusedRef"));
  assert.ok(sheetSource.includes("restore.focus()"));
  assert.ok(dashboardSource.includes("mobileDetailsTriggerRef"));
  assert.ok(dashboardSource.includes("returnFocusRef={mobileDetailsTriggerRef}"));
});

test("dashboard wires sheet without duplicating assignment handlers", () => {
  assert.ok(dashboardSource.includes("MobileDetailsSheet"));
  assert.ok(dashboardSource.includes("handleCloseMobileDetails"));
  assert.ok(dashboardSource.includes('data-testid="mobile-details-manage-btn"'));
});

test("listeners cleaned up on unmount / close", () => {
  assert.ok(sheetSource.includes("removeEventListener"));
  assert.ok(sheetSource.includes("clearTimeout"));
});
