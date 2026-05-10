import test from "node:test";
import assert from "node:assert/strict";
import { loggableError } from "./logError.js";

test("loggableError serializes Postgrest-style objects", () => {
  const out = loggableError({ message: "RPC failed", code: "42883", details: "hint here" });
  assert.equal(typeof out === "object" && out !== null && !Array.isArray(out), true);
  const o = out as Record<string, unknown>;
  assert.equal(o.message, "RPC failed");
  assert.equal(o.code, "42883");
});

test("loggableError passes through Error", () => {
  const out = loggableError(new Error("boom"));
  assert.equal(typeof out === "object" && out !== null, true);
  assert.equal((out as { message?: string }).message, "boom");
});
