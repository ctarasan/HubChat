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

test("PatchTeamMemberSchema rejects legacy password field name", () => {
  const r = PatchTeamMemberSchema.safeParse({ name: "X", password: "nope" });
  assert.equal(r.success, false);
});

test("PatchTeamMemberSchema accepts newPassword with confirmation", () => {
  const r = PatchTeamMemberSchema.safeParse({
    newPassword: "secret1234",
    confirmNewPassword: "secret1234"
  });
  assert.equal(r.success, true);
});

test("PatchTeamMemberSchema rejects password mismatch", () => {
  const r = PatchTeamMemberSchema.safeParse({
    newPassword: "secret1234",
    confirmNewPassword: "secret5678"
  });
  assert.equal(r.success, false);
});

test("PatchTeamMemberSchema rejects short newPassword", () => {
  const r = PatchTeamMemberSchema.safeParse({
    newPassword: "short",
    confirmNewPassword: "short"
  });
  assert.equal(r.success, false);
});
