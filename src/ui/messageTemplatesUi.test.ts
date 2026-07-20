import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeMessageTemplatesPanelCoords } from "./messageTemplatesPanelModel.js";

const here = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(here, "DashboardPage.tsx"), "utf8");
const panelSource = readFileSync(join(here, "MessageTemplatesPanel.tsx"), "utf8");
const cssSource = readFileSync(join(here, "../../app/globals.css"), "utf8");

test("dashboard wires Templates control beside Attach without changing Send API path", () => {
  assert.match(dashboardSource, /MessageTemplatesPanel/);
  assert.match(dashboardSource, /insertTemplateBodyIntoComposer/);
  assert.match(dashboardSource, /composerTextareaRef/);
  assert.match(dashboardSource, /\/api\/messages\/send/);
  assert.equal(dashboardSource.includes("onInsertBody={insertTemplateBodyIntoComposer}"), true);
});

test("templates panel never calls outbound send endpoints", () => {
  assert.equal(panelSource.includes("/api/messages/send"), false);
  assert.equal(panelSource.includes("upload-image"), false);
  assert.match(panelSource, /\/api\/message-templates/);
  assert.match(panelSource, /role="dialog"/);
  assert.match(panelSource, /Escape/);
  assert.match(panelSource, /Add template/);
  assert.match(panelSource, /Delete template\?/);
});

test("templates CSS uses fixed panel and theme tokens", () => {
  assert.match(cssSource, /\.message-templates-panel\s*\{[^}]*position:\s*fixed/s);
  assert.match(cssSource, /--text-muted/);
  assert.match(cssSource, /@media \(max-width: 640px\)/);
  assert.match(cssSource, /\.message-templates-item-action-btn/);
});

test("panel coords prefer opening above near-bottom composer", () => {
  const coords = computeMessageTemplatesPanelCoords({
    trigger: { top: 700, bottom: 740, left: 500, right: 600, width: 100, height: 40, x: 500, y: 700, toJSON() {} },
    viewportWidth: 1280,
    viewportHeight: 800,
    preferredHeight: 420
  });
  assert.ok(coords.top + coords.maxHeight <= 700);
  assert.ok(coords.left >= 0);
  assert.ok(coords.left + coords.width <= 1280);
});
