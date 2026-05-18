import test from "node:test";
import assert from "node:assert/strict";
import { assertValidLeadStatusTransition, listAllowedLeadStatusTransitions } from "./entities.js";

test("UNQUALIFIED is a valid transition from funnel stages", () => {
  assert.doesNotThrow(() => assertValidLeadStatusTransition("NEW", "UNQUALIFIED"));
  assert.doesNotThrow(() => assertValidLeadStatusTransition("ASSIGNED", "UNQUALIFIED"));
  assert.doesNotThrow(() => assertValidLeadStatusTransition("CONTACTED", "UNQUALIFIED"));
});

test("UNQUALIFIED terminal: no further transitions except same status", () => {
  assert.doesNotThrow(() => assertValidLeadStatusTransition("UNQUALIFIED", "UNQUALIFIED"));
  assert.throws(() => assertValidLeadStatusTransition("UNQUALIFIED", "NEW"), /Invalid lead status transition/);
});

test("existing funnel transitions still accepted", () => {
  assert.doesNotThrow(() => assertValidLeadStatusTransition("NEW", "ASSIGNED"));
  assert.doesNotThrow(() => assertValidLeadStatusTransition("NEW", "CONTACTED"));
  assert.doesNotThrow(() => assertValidLeadStatusTransition("NEGOTIATION", "WON"));
  assert.doesNotThrow(() => assertValidLeadStatusTransition("NEGOTIATION", "LOST"));
});

test("invalid lead status transition still rejected", () => {
  assert.throws(() => assertValidLeadStatusTransition("NEW", "WON"), /Invalid lead status transition/);
});

test("listAllowedLeadStatusTransitions returns outbound options", () => {
  assert.deepEqual(listAllowedLeadStatusTransitions("NEW"), ["ASSIGNED", "CONTACTED", "LOST", "UNQUALIFIED"]);
  assert.deepEqual(listAllowedLeadStatusTransitions("WON"), []);
});
