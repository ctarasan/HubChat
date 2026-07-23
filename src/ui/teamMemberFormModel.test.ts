import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCreateTeamMemberApiPayload,
  buildCreateTeamMemberBody,
  buildPatchTeamMemberApiPayload,
  buildPatchTeamMemberBody,
  canDeactivateTeamMemberRow,
  canManageTeamMemberRow,
  createDefaultTeamMemberForm,
  getRoleOptionsForForm,
  parseCapacityInput,
  rowToForm,
  validateTeamMemberForm,
  type TeamMemberFormDraft,
  type TeamMemberRowSnapshot
} from "./teamMemberFormModel.js";

const baseForm = (): TeamMemberFormDraft => ({
  name: "Pat",
  email: "pat@example.com",
  role: "SALES",
  status: "ACTIVE",
  assignmentEnabled: false,
  assignmentMode: "MANUAL_ONLY",
  maxActiveConversationsInput: "",
  maxActiveLeadsInput: "10",
  createAuthUser: false,
  passwordInput: "",
  confirmPasswordInput: ""
});

const baseRow = (over: Partial<TeamMemberRowSnapshot> = {}): TeamMemberRowSnapshot => ({
  id: "u1",
  name: "Pat",
  email: "pat@example.com",
  role: "SALES",
  status: "ACTIVE",
  assignmentEnabled: false,
  assignmentMode: "MANUAL_ONLY",
  maxActiveConversations: null,
  maxActiveLeads: 10,
  ...over
});

test("parseCapacityInput empty maps to null", () => {
  assert.deepEqual(parseCapacityInput("  "), { ok: true, value: null });
});

test("parseCapacityInput integer maps to value", () => {
  assert.deepEqual(parseCapacityInput("20"), { ok: true, value: 20 });
});

test("parseCapacityInput rejects invalid", () => {
  const r = parseCapacityInput("2x");
  assert.equal(r.ok, false);
});

test("buildCreateTeamMemberBody includes all POST fields", () => {
  const body = buildCreateTeamMemberBody("ADMIN", {
    ...baseForm(),
    maxActiveConversationsInput: "5",
    maxActiveLeadsInput: ""
  });
  assert.deepEqual(body, {
    name: "Pat",
    email: "pat@example.com",
    role: "SALES",
    status: "ACTIVE",
    assignmentEnabled: false,
    assignmentMode: "MANUAL_ONLY",
    maxActiveConversations: 5,
    maxActiveLeads: null
  });
});

test("MANAGER create body forces SALES role even if form carried ADMIN", () => {
  const body = buildCreateTeamMemberBody("MANAGER", {
    ...baseForm(),
    role: "ADMIN"
  });
  assert.equal(body.role, "SALES");
});

test("buildPatchTeamMemberBody sends only changed fields", () => {
  const orig = baseRow({ name: "Pat", email: "pat@example.com" });
  const form = rowToForm(orig);
  form.name = "Pat2";
  const patch = buildPatchTeamMemberBody(orig, form);
  assert.deepEqual(patch, { name: "Pat2" });
});

test("buildPatchTeamMemberBody returns null when no changes", () => {
  const orig = baseRow();
  const form = rowToForm(orig);
  assert.equal(buildPatchTeamMemberBody(orig, form), null);
});

test("Deactivate maps to status INACTIVE in patch", () => {
  const orig = baseRow({ status: "ACTIVE" });
  const form = rowToForm(orig);
  form.status = "INACTIVE";
  assert.deepEqual(buildPatchTeamMemberBody(orig, form), { status: "INACTIVE" });
});

test("Activate maps to status ACTIVE in patch", () => {
  const orig = baseRow({ status: "INACTIVE" });
  const form = rowToForm(orig);
  form.status = "ACTIVE";
  assert.deepEqual(buildPatchTeamMemberBody(orig, form), { status: "ACTIVE" });
});

test("MANAGER cannot choose MANAGER or ADMIN in role options", () => {
  assert.deepEqual([...getRoleOptionsForForm("MANAGER")], ["SALES"]);
  assert.deepEqual([...getRoleOptionsForForm("ADMIN")], ["SALES", "MANAGER", "ADMIN"]);
});

test("MANAGER cannot manage MANAGER or ADMIN rows", () => {
  assert.equal(canManageTeamMemberRow({ role: "MANAGER" }, { role: "SALES" }), true);
  assert.equal(canManageTeamMemberRow({ role: "MANAGER" }, { role: "MANAGER" }), false);
  assert.equal(canManageTeamMemberRow({ role: "MANAGER" }, { role: "ADMIN" }), false);
});

test("ADMIN can manage all roles in model", () => {
  assert.equal(canManageTeamMemberRow({ role: "ADMIN" }, { role: "SALES" }), true);
  assert.equal(canManageTeamMemberRow({ role: "ADMIN" }, { role: "MANAGER" }), true);
  assert.equal(canManageTeamMemberRow({ role: "ADMIN" }, { role: "ADMIN" }), true);
});

test("SALES cannot manage rows", () => {
  assert.equal(canManageTeamMemberRow({ role: "SALES" }, { role: "SALES" }), false);
});

test("canDeactivateTeamMemberRow blocks self", () => {
  assert.equal(
    canDeactivateTeamMemberRow({ role: "ADMIN", salesAgentId: "u1" }, { id: "u1", role: "ADMIN" }),
    false
  );
  assert.equal(
    canDeactivateTeamMemberRow({ role: "ADMIN", salesAgentId: "u2" }, { id: "u1", role: "ADMIN" }),
    true
  );
});

test("validateTeamMemberForm catches missing name and bad email", () => {
  const r = validateTeamMemberForm({
    ...baseForm(),
    name: "   ",
    email: "not-an-email"
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.name);
    assert.ok(r.errors.email);
  }
});

test("buildPatchTeamMemberBody clears capacity to null when input emptied", () => {
  const orig = baseRow({ maxActiveConversations: 5, maxActiveLeads: 3 });
  const form = rowToForm(orig);
  form.maxActiveConversationsInput = "";
  form.maxActiveLeadsInput = "";
  assert.deepEqual(buildPatchTeamMemberBody(orig, form), {
    maxActiveConversations: null,
    maxActiveLeads: null
  });
});

test("buildCreateTeamMemberApiPayload omits auth fields when createAuthUser is false", () => {
  const p = buildCreateTeamMemberApiPayload("ADMIN", baseForm());
  assert.equal("createAuthUser" in p && p.createAuthUser === true, false);
  assert.equal("password" in p, false);
});

test("buildCreateTeamMemberApiPayload includes password when createAuthUser is true", () => {
  const p = buildCreateTeamMemberApiPayload("ADMIN", {
    ...baseForm(),
    createAuthUser: true,
    passwordInput: "secret1234",
    confirmPasswordInput: "secret1234"
  });
  assert.equal(p.createAuthUser, true);
  assert.equal(p.password, "secret1234");
  assert.equal(p.confirmPassword, "secret1234");
});

test("validateTeamMemberForm requires password in create mode when createAuthUser", () => {
  const r = validateTeamMemberForm(
    { ...baseForm(), createAuthUser: true, passwordInput: "", confirmPasswordInput: "" },
    { isCreate: true }
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.passwordInput);
});

test("validateTeamMemberForm rejects password mismatch in create mode", () => {
  const r = validateTeamMemberForm(
    {
      ...baseForm(),
      createAuthUser: true,
      passwordInput: "secret1234",
      confirmPasswordInput: "secret5678"
    },
    { isCreate: true }
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.confirmPasswordInput);
});

test("validateTeamMemberForm rejects short password in create mode", () => {
  const r = validateTeamMemberForm(
    {
      ...baseForm(),
      createAuthUser: true,
      passwordInput: "short",
      confirmPasswordInput: "short"
    },
    { isCreate: true }
  );
  assert.equal(r.ok, false);
});

test("no Delete or Remove in team member form model source", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./teamMemberFormModel.ts", import.meta.url), "utf8");
  assert.equal(src.includes("Delete"), false);
  assert.equal(src.includes("Remove"), false);
});

test("rowToForm leaves password fields empty", () => {
  const form = rowToForm(baseRow());
  assert.equal(form.passwordInput, "");
  assert.equal(form.confirmPasswordInput, "");
});

test("buildPatchTeamMemberApiPayload omits password when empty", () => {
  const payload = buildPatchTeamMemberApiPayload(baseRow(), baseForm());
  assert.equal(payload, null);
});

test("buildPatchTeamMemberApiPayload includes newPassword when set", () => {
  const payload = buildPatchTeamMemberApiPayload(baseRow(), {
    ...baseForm(),
    passwordInput: "secret1234",
    confirmPasswordInput: "secret1234"
  });
  assert.deepEqual(payload, {
    newPassword: "secret1234",
    confirmNewPassword: "secret1234"
  });
});

test("validateTeamMemberForm rejects edit password mismatch", () => {
  const r = validateTeamMemberForm({
    ...baseForm(),
    passwordInput: "secret1234",
    confirmPasswordInput: "secret5678"
  });
  assert.equal(r.ok, false);
});

test("validateTeamMemberForm rejects short edit password", () => {
  const r = validateTeamMemberForm({
    ...baseForm(),
    passwordInput: "short",
    confirmPasswordInput: "short"
  });
  assert.equal(r.ok, false);
});

test("hasEditPasswordChange detects password-only updates", async () => {
  const { hasEditPasswordChange } = await import("./teamMemberFormModel.js");
  assert.equal(hasEditPasswordChange({ ...baseForm(), passwordInput: "secret1234" }), true);
  assert.equal(hasEditPasswordChange(baseForm()), false);
});
