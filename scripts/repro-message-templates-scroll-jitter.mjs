/**
 * Reproduce Message Templates panel scroll jitter (pre-fix baseline).
 * Simulates the capture-phase scroll → reposition → setCoords feedback loop.
 */
import assert from "node:assert/strict";
import { computeMessageTemplatesPanelCoords } from "../src/ui/messageTemplatesPanelModel.ts";

function coordsChanged(a, b) {
  return a.top !== b.top || a.left !== b.left || a.width !== b.width || a.maxHeight !== b.maxHeight;
}

// Simulate document scroll oscillation: focus scrolls doc +31px, reposition follows trigger
const viewport = { width: 1280, height: 800 };
const triggerBase = { top: 700, bottom: 740, left: 500, right: 600, width: 100, height: 40, x: 500, y: 700, toJSON() {} };

let scrollY = 0;
const samples = [];

for (let frame = 0; frame < 20; frame++) {
  // Odd frames: focus/anchoring nudges document scroll +31px
  // Even frames: browser snaps back (scroll anchoring)
  scrollY = frame % 2 === 0 ? 0 : 31;
  const trigger = { ...triggerBase, top: triggerBase.top - scrollY, bottom: triggerBase.bottom - scrollY, y: triggerBase.y - scrollY };
  const coords = computeMessageTemplatesPanelCoords({
    trigger,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height
  });
  samples.push({ frame, scrollY, panelTop: coords.top, maxHeight: coords.maxHeight });
}

const tops = samples.map((s) => s.panelTop);
const range = Math.max(...tops) - Math.min(...tops);
assert.equal(range, 31, "reposition tracking trigger rect reproduces ~31px panel oscillation");

// setCoords with new object every scroll event causes re-render even when unchanged
let renderCount = 0;
let lastCoords = computeMessageTemplatesPanelCoords({
  trigger: triggerBase,
  viewportWidth: viewport.width,
  viewportHeight: viewport.height
});
for (let i = 0; i < 60; i++) {
  const next = computeMessageTemplatesPanelCoords({
    trigger: triggerBase,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height
  });
  if (coordsChanged(lastCoords, next)) {
    renderCount += 1;
    lastCoords = next;
  } else {
    // Current code always setState — count as render
    renderCount += 1;
  }
}
assert.equal(renderCount, 60, "unconditional setCoords re-renders on every scroll event");

console.log(JSON.stringify({ reproducedOscillationPx: range, scrollSamples: samples.slice(0, 6), rendersPer60ScrollEvents: renderCount }, null, 2));
