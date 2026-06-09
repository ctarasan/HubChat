import test from "node:test";
import assert from "node:assert/strict";
import { resolveConnectionScopeMode } from "./connectionScopeQuery.js";

test("resolveConnectionScopeMode defaults to active", () => {
  const result = resolveConnectionScopeMode({ role: "SALES" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.mode, "active");
});

test("resolveConnectionScopeMode blocks SALES from all", () => {
  const result = resolveConnectionScopeMode({ role: "SALES" }, "all");
  assert.equal(result.ok, false);
});

test("resolveConnectionScopeMode allows MANAGER all", () => {
  const result = resolveConnectionScopeMode({ role: "MANAGER" }, "all");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.mode, "all");
});

test("resolveConnectionScopeMode allows ADMIN all", () => {
  const result = resolveConnectionScopeMode({ role: "ADMIN" }, "all");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.mode, "all");
});
