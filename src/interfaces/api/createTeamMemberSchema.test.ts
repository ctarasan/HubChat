import test from "node:test";
import assert from "node:assert/strict";
import { CreateTeamMemberSchema, PatchTeamMemberSchema } from "./contracts.js";

test("CreateTeamMemberSchema rejects password fields when createAuthUser is false", () => {
  const r = CreateTeamMemberSchema.safeParse({
    name: "A",
    email: "a@b.com",
    role: "SALES",
    password: "secret12",
    confirmPassword: "secret12"
  });
  assert.equal(r.success, false);
});

test("CreateTeamMemberSchema requires matching passwords when createAuthUser is true", () => {
  const r = CreateTeamMemberSchema.safeParse({
    name: "A",
    email: "a@b.com",
    role: "SALES",
    createAuthUser: true,
    password: "secret12",
    confirmPassword: "secret13"
  });
  assert.equal(r.success, false);
});

test("CreateTeamMemberSchema requires min length 8 when createAuthUser is true", () => {
  const r = CreateTeamMemberSchema.safeParse({
    name: "A",
    email: "a@b.com",
    role: "SALES",
    createAuthUser: true,
    password: "short",
    confirmPassword: "short"
  });
  assert.equal(r.success, false);
});

test("CreateTeamMemberSchema accepts createAuthUser with valid passwords", () => {
  const r = CreateTeamMemberSchema.safeParse({
    name: "A",
    email: "a@b.com",
    role: "SALES",
    createAuthUser: true,
    password: "secret123",
    confirmPassword: "secret123"
  });
  assert.equal(r.success, true);
});

test("PatchTeamMemberSchema rejects password field", () => {
  const r = PatchTeamMemberSchema.safeParse({ name: "X", password: "nope" });
  assert.equal(r.success, false);
});
