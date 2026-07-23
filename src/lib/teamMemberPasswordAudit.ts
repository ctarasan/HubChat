/** Sanitized team-member password admin audit events — no secrets in metadata. */

export type TeamMemberPasswordAuditAction = "TEAM_MEMBER_PASSWORD_UPDATED";

export type TeamMemberPasswordAuditEvent = {
  action: TeamMemberPasswordAuditAction;
  actorUserId: string;
  targetMemberId: string;
  tenantId: string;
  success: boolean;
  errorCategory: string | null;
  timestamp: string;
};

export type TeamMemberPasswordAuditSink = (event: TeamMemberPasswordAuditEvent) => void;

const FORBIDDEN_AUDIT_KEYS = new Set([
  "password",
  "newPassword",
  "confirmNewPassword",
  "confirmPassword",
  "accessToken",
  "refreshToken",
  "authorization",
  "serviceRole",
  "SUPABASE_SERVICE_ROLE_KEY",
  "token",
  "hash"
]);

export function buildTeamMemberPasswordAuditEvent(
  input: Omit<TeamMemberPasswordAuditEvent, "timestamp"> & { timestamp?: string }
): TeamMemberPasswordAuditEvent {
  return Object.freeze({
    ...input,
    timestamp: input.timestamp ?? new Date().toISOString()
  });
}

export function assertTeamMemberPasswordAuditSafe(value: unknown): void {
  const json = JSON.stringify(value ?? {});
  for (const key of FORBIDDEN_AUDIT_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Team member password audit payload must not include ${key}`);
    }
  }
}

export function emitTeamMemberPasswordAudit(
  sink: TeamMemberPasswordAuditSink,
  event: TeamMemberPasswordAuditEvent
): void {
  assertTeamMemberPasswordAuditSafe(event);
  sink(event);
}

export const consoleTeamMemberPasswordAuditSink: TeamMemberPasswordAuditSink = (event) => {
  console.info(JSON.stringify({ event: event.action, ...event }));
};

export type TeamMemberPasswordCompensationFailure = {
  action: "TEAM_MEMBER_PASSWORD_COMPENSATION_FAILED";
  tenantId: string;
  targetMemberId: string;
  actorUserId: string;
  errorCategory: string;
  timestamp: string;
};

export function logTeamMemberPasswordCompensationFailure(details: TeamMemberPasswordCompensationFailure): void {
  assertTeamMemberPasswordAuditSafe(details);
  console.error(JSON.stringify(details));
}
