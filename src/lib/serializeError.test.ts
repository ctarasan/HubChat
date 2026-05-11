import test from "node:test";
import assert from "node:assert/strict";
import { serializeError } from "./serializeError.js";

test("serializeError maps PostgREST-style payloads", () => {
  const out = serializeError({ message: "RPC failed", code: "42883", details: "detail", hint: "h", status: 400 });
  assert.equal(out.message, "RPC failed");
  assert.equal(out.code, "42883");
  assert.equal(out.details, "detail");
  assert.equal(out.hint, "h");
  assert.equal(out.status, 400);
});

test("serializeError maps Error", () => {
  const out = serializeError(new Error("boom"));
  assert.equal(out.message, "boom");
  assert.equal(out.name, "Error");
  assert.match(out.stack ?? "", /boom/);
});

test("serializeError includes Error cause chain", () => {
  const root = new Error("root");
  const err = new Error("outer");
  (err as Error & { cause?: unknown }).cause = root;
  const out = serializeError(err);
  assert.equal(out.message, "outer");
  assert.ok(out.cause && typeof out.cause === "object");
  assert.equal((out.cause as { message?: string }).message, "root");
});

test("serializeError adds rawJson for arbitrary objects", () => {
  const out = serializeError({ foo: 1, bar: "x" });
  assert.ok(out.rawJson);
  assert.match(out.rawJson, /"foo":1/);
});
