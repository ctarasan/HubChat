import test from "node:test";
import assert from "node:assert/strict";
import {
  computeMessageTemplatesPanelCoords,
  messageTemplatesPanelCoordsEqual
} from "./messageTemplatesPanelModel.js";

const triggerNearBottom = {
  top: 700,
  bottom: 740,
  left: 500,
  right: 600,
  width: 100,
  height: 40,
  x: 500,
  y: 700,
  toJSON() {}
};

test("messageTemplatesPanelCoordsEqual treats sub-pixel drift as unchanged", () => {
  const a = { top: 272, left: 360, width: 340, maxHeight: 420 };
  const b = { top: 272.4, left: 359.8, width: 340, maxHeight: 419.6 };
  assert.equal(messageTemplatesPanelCoordsEqual(a, b), true);
  assert.equal(messageTemplatesPanelCoordsEqual(a, { ...a, top: 304 }), false);
});

test("computeMessageTemplatesPanelCoords is stable for identical inputs", () => {
  const input = {
    trigger: triggerNearBottom,
    viewportWidth: 1280,
    viewportHeight: 800,
    preferredHeight: 420
  };
  const first = computeMessageTemplatesPanelCoords(input);
  const second = computeMessageTemplatesPanelCoords(input);
  assert.deepEqual(first, second);
});

test("panel coords track trigger rect one-to-one with viewport scroll offset", () => {
  const scrolledTrigger = { ...triggerNearBottom, top: 669, bottom: 709, y: 669 };
  const baseline = computeMessageTemplatesPanelCoords({
    trigger: triggerNearBottom,
    viewportWidth: 1280,
    viewportHeight: 800
  });
  const shifted = computeMessageTemplatesPanelCoords({
    trigger: scrolledTrigger,
    viewportWidth: 1280,
    viewportHeight: 800
  });
  assert.equal(baseline.top - shifted.top, 31);
});

test("panel maxHeight stays within available viewport space", () => {
  const coords = computeMessageTemplatesPanelCoords({
    trigger: triggerNearBottom,
    viewportWidth: 1280,
    viewportHeight: 800,
    preferredHeight: 420
  });
  assert.ok(coords.top >= 0);
  assert.ok(coords.top + coords.maxHeight <= 800);
  assert.ok(coords.maxHeight >= 160);
});

test("narrow viewport clamps panel inside horizontal margins", () => {
  const coords = computeMessageTemplatesPanelCoords({
    trigger: { ...triggerNearBottom, left: 20, right: 120 },
    viewportWidth: 390,
    viewportHeight: 844,
    panelWidth: 340
  });
  assert.ok(coords.left >= 8);
  assert.ok(coords.left + coords.width <= 390 - 8);
});
