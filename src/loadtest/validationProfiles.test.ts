import test from "node:test";
import assert from "node:assert/strict";
import { getValidationProfile, toExecutionCounts } from "./validationProfiles.js";
import { percentile, safeRate } from "./validationMath.js";

test("validation profile resolves and includes workload", () => {
  const profile = getValidationProfile("high");
  assert.equal(profile.idleConnectedUsers, 5000);
  assert.equal(profile.workload.inboundBurstEvents > 0, true);
});

test("execution counts derive from profile", () => {
  const { profile, counts } = toExecutionCounts("low");
  assert.equal(profile.name, "low");
  assert.equal(counts.outboundSustainedEvents, profile.workload.outboundSustainedPerMinute * profile.workload.durationMinutes);
});

test("validation math helper works", () => {
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
  assert.equal(safeRate(2, 10), 0.2);
  assert.equal(safeRate(1, 0), 0);
});
