export type TeamMemberFormRole = "SALES" | "MANAGER" | "ADMIN";
export type TeamMemberFormStatus = "ACTIVE" | "INACTIVE";
export type TeamMemberFormMode = "AUTO" | "MANUAL_ONLY" | "PAUSED";

export type ActorTeamRole = "SALES" | "MANAGER" | "ADMIN";

export interface TeamMemberFormDraft {
  name: string;
  email: string;
  role: TeamMemberFormRole;
  status: TeamMemberFormStatus;
  assignmentEnabled: boolean;
  assignmentMode: TeamMemberFormMode;
  maxActiveConversationsInput: string;
  maxActiveLeadsInput: string;
  createAuthUser: boolean;
  passwordInput: string;
  confirmPasswordInput: string;
}

/** Snapshot of a roster row for PATCH diffing (camelCase API shape). */
export interface TeamMemberRowSnapshot {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  assignmentEnabled: boolean;
  assignmentMode: string;
  maxActiveConversations: number | null;
  maxActiveLeads: number | null;
}

export type CreateTeamMemberBody = {
  name: string;
  email: string;
  role: TeamMemberFormRole;
  status: TeamMemberFormStatus;
  assignmentEnabled: boolean;
  assignmentMode: TeamMemberFormMode;
  maxActiveConversations: number | null;
  maxActiveLeads: number | null;
};

export type CreateTeamMemberApiPayload = CreateTeamMemberBody & {
  createAuthUser?: boolean;
  password?: string;
  confirmPassword?: string;
};

export type PatchTeamMemberBody = {
  name?: string;
  email?: string;
  role?: TeamMemberFormRole;
  status?: TeamMemberFormStatus;
  assignmentEnabled?: boolean;
  assignmentMode?: TeamMemberFormMode;
  maxActiveConversations?: number | null;
  maxActiveLeads?: number | null;
};

export type PatchTeamMemberApiPayload = PatchTeamMemberBody & {
  newPassword?: string;
  confirmNewPassword?: string;
};

export function parseCapacityInput(raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  if (!/^\d+$/.test(t)) {
    return { ok: false, error: "Use a whole number 0 or greater, or leave empty for unlimited." };
  }
  const n = Number.parseInt(t, 10);
  if (n < 0) return { ok: false, error: "Capacity cannot be negative." };
  return { ok: true, value: n };
}

export function createDefaultTeamMemberForm(_actorRole: "MANAGER" | "ADMIN"): TeamMemberFormDraft {
  return {
    name: "",
    email: "",
    role: "SALES",
    status: "ACTIVE",
    assignmentEnabled: false,
    assignmentMode: "MANUAL_ONLY",
    maxActiveConversationsInput: "",
    maxActiveLeadsInput: "",
    createAuthUser: false,
    passwordInput: "",
    confirmPasswordInput: ""
  };
}

export function rowToForm(row: TeamMemberRowSnapshot): TeamMemberFormDraft {
  const mode = normalizeAssignmentMode(row.assignmentMode);
  const status: TeamMemberFormStatus = row.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  const role = normalizeRole(row.role);
  return {
    name: row.name ?? "",
    email: row.email ?? "",
    role,
    status,
    assignmentEnabled: Boolean(row.assignmentEnabled),
    assignmentMode: mode,
    maxActiveConversationsInput: row.maxActiveConversations == null ? "" : String(row.maxActiveConversations),
    maxActiveLeadsInput: row.maxActiveLeads == null ? "" : String(row.maxActiveLeads),
    createAuthUser: false,
    passwordInput: "",
    confirmPasswordInput: ""
  };
}

function normalizeRole(r: string): TeamMemberFormRole {
  if (r === "MANAGER" || r === "ADMIN" || r === "SALES") return r;
  return "SALES";
}

function normalizeAssignmentMode(m: string): TeamMemberFormMode {
  if (m === "AUTO" || m === "MANUAL_ONLY" || m === "PAUSED") return m;
  return "MANUAL_ONLY";
}

export function canManageTeamMemberRow(actor: { role: ActorTeamRole }, member: { role: string }): boolean {
  if (actor.role === "SALES") return false;
  if (actor.role === "ADMIN") return true;
  return member.role === "SALES";
}

export function canDeactivateTeamMemberRow(
  actor: { role: ActorTeamRole; salesAgentId: string | null },
  member: { id: string; role: string }
): boolean {
  if (!canManageTeamMemberRow(actor, member)) return false;
  if (actor.salesAgentId && actor.salesAgentId === member.id) return false;
  return true;
}

export function getRoleOptionsForForm(actorRole: "MANAGER" | "ADMIN"): readonly TeamMemberFormRole[] {
  if (actorRole === "MANAGER") return ["SALES"] as const;
  return ["SALES", "MANAGER", "ADMIN"] as const;
}

export type FormValidationResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateTeamMemberForm(form: TeamMemberFormDraft, options?: { isCreate?: boolean }): FormValidationResult {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) errors.name = "Name is required.";
  const email = form.email.trim();
  if (!email) errors.email = "Email is required.";
  else if (!emailRe.test(email)) errors.email = "Enter a valid email address.";

  const c1 = parseCapacityInput(form.maxActiveConversationsInput);
  if (!c1.ok) errors.maxActiveConversations = c1.error;
  const c2 = parseCapacityInput(form.maxActiveLeadsInput);
  if (!c2.ok) errors.maxActiveLeads = c2.error;

  if (options?.isCreate && form.createAuthUser) {
    const p = form.passwordInput;
    const c = form.confirmPasswordInput;
    if (!p || p.length < 8) {
      errors.passwordInput = "Password must be at least 8 characters.";
    }
    if (p !== c) {
      errors.confirmPasswordInput = "Passwords must match.";
    }
  }

  if (!options?.isCreate) {
    const p = form.passwordInput;
    const c = form.confirmPasswordInput;
    if (p.length > 0) {
      if (p.length < 8) {
        errors.passwordInput = "Password must be at least 8 characters.";
      }
      if (!c) {
        errors.confirmPasswordInput = "Confirm new password is required.";
      } else if (p !== c) {
        errors.confirmPasswordInput = "Passwords must match.";
      }
    } else if (c.length > 0) {
      errors.passwordInput = "Enter a new password or clear confirmation.";
    }
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}

export function buildCreateTeamMemberBody(actorRole: "MANAGER" | "ADMIN", form: TeamMemberFormDraft): CreateTeamMemberBody {
  const c1 = parseCapacityInput(form.maxActiveConversationsInput);
  const c2 = parseCapacityInput(form.maxActiveLeadsInput);
  const maxActiveConversations = c1.ok ? c1.value : null;
  const maxActiveLeads = c2.ok ? c2.value : null;
  const role: TeamMemberFormRole = actorRole === "MANAGER" ? "SALES" : form.role;
  return {
    name: form.name.trim(),
    email: form.email.trim(),
    role,
    status: form.status,
    assignmentEnabled: form.assignmentEnabled,
    assignmentMode: form.assignmentMode,
    maxActiveConversations,
    maxActiveLeads
  };
}

/** Full POST body for /api/sales-agents including optional auth provisioning. */
export function buildCreateTeamMemberApiPayload(actorRole: "MANAGER" | "ADMIN", form: TeamMemberFormDraft): CreateTeamMemberApiPayload {
  const base = buildCreateTeamMemberBody(actorRole, form);
  if (!form.createAuthUser) {
    return base;
  }
  return {
    ...base,
    createAuthUser: true,
    password: form.passwordInput,
    confirmPassword: form.confirmPasswordInput
  };
}

function normMode(m: string): TeamMemberFormMode {
  return normalizeAssignmentMode(m);
}

export function buildPatchTeamMemberBody(
  original: TeamMemberRowSnapshot,
  form: TeamMemberFormDraft
): PatchTeamMemberBody | null {
  const patch: PatchTeamMemberBody = {};
  const name = form.name.trim();
  if (name !== (original.name ?? "").trim()) patch.name = name;

  const email = form.email.trim();
  if (email !== (original.email ?? "").trim()) patch.email = email;

  if (form.role !== normalizeRole(original.role)) patch.role = form.role;
  const origStatus: TeamMemberFormStatus = original.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  if (form.status !== origStatus) patch.status = form.status;
  if (form.assignmentEnabled !== Boolean(original.assignmentEnabled)) patch.assignmentEnabled = form.assignmentEnabled;
  if (form.assignmentMode !== normMode(original.assignmentMode)) patch.assignmentMode = form.assignmentMode;

  const c1 = parseCapacityInput(form.maxActiveConversationsInput);
  const c2 = parseCapacityInput(form.maxActiveLeadsInput);
  if (!c1.ok || !c2.ok) return null;
  const origMaxC = original.maxActiveConversations ?? null;
  const origMaxL = original.maxActiveLeads ?? null;
  if (c1.value !== origMaxC) patch.maxActiveConversations = c1.value;
  if (c2.value !== origMaxL) patch.maxActiveLeads = c2.value;

  return Object.keys(patch).length > 0 ? patch : null;
}

export function hasEditPasswordChange(form: TeamMemberFormDraft): boolean {
  return form.passwordInput.length > 0;
}

/** PATCH body for /api/sales-agents/:id including optional admin password reset. */
export function buildPatchTeamMemberApiPayload(
  original: TeamMemberRowSnapshot,
  form: TeamMemberFormDraft
): PatchTeamMemberApiPayload | null {
  const patch = buildPatchTeamMemberBody(original, form);
  const wantsPassword = hasEditPasswordChange(form);
  if (!wantsPassword && !patch) return null;
  const payload: PatchTeamMemberApiPayload = patch ? { ...patch } : {};
  if (wantsPassword) {
    payload.newPassword = form.passwordInput;
    payload.confirmNewPassword = form.confirmPasswordInput;
  }
  return payload;
}
