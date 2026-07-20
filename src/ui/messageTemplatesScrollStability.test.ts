import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(join(here, "MessageTemplatesPanel.tsx"), "utf8");
const cssSource = readFileSync(join(here, "../../app/globals.css"), "utf8");

test("templates panel focuses fields once with preventScroll", () => {
  assert.match(panelSource, /focusWithoutScroll/);
  assert.match(panelSource, /preventScroll:\s*true/);
  assert.match(panelSource, /focusModeRef/);
  assert.doesNotMatch(panelSource, /searchRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(panelSource, /scrollIntoView/);
});

test("templates panel does not attach capture-phase document scroll reposition loop", () => {
  assert.doesNotMatch(panelSource, /addEventListener\("scroll", onViewportChange, true\)/);
  assert.doesNotMatch(panelSource, /addEventListener\("scroll", onResize, true\)/);
  assert.match(panelSource, /visualViewport\?\.addEventListener\("resize"/);
});

test("templates panel skips redundant coordinate state updates", () => {
  assert.match(panelSource, /messageTemplatesPanelCoordsEqual/);
  assert.match(panelSource, /applyCoords/);
});

test("templates panel renders fixed dialog through document body portal", () => {
  assert.match(panelSource, /createPortal/);
  assert.match(panelSource, /document\.body/);
});

test("templates panel layout effect does not depend on list loading/filter size", () => {
  assert.doesNotMatch(panelSource, /\[open, mode, filtered\.length, loading, reposition\]/);
  assert.match(panelSource, /\[open, mode, reposition, applyCoords\]/);
});

test("templates panel CSS keeps dialog out of page layout and scrolls internally", () => {
  assert.match(cssSource, /\.message-templates-panel\s*\{[^}]*position:\s*fixed/s);
  assert.match(cssSource, /overflow-anchor:\s*none/);
  assert.match(cssSource, /\.message-templates-form,/);
  assert.match(cssSource, /overflow-y:\s*auto/);
});

test("outside click handler accounts for portaled panel node", () => {
  assert.match(panelSource, /panel\?\.contains\(target\)/);
});
