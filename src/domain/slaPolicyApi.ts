import type {
  SlaPolicyRuleKey,
  TenantSlaPolicy,
  TenantSlaPolicyRecord,
  TenantSlaPolicyRule,
  TenantSlaPolicyUpdatedBy
} from "./tenantSlaPolicy.js";

export type SlaPolicyApiResponse = {
  source: "default" | "tenant";
  persisted: boolean;
  enabled: boolean;
  warningBeforeBreachMinutes: number;
  excludeResolved: boolean;
  excludeArchived: boolean;
  rules: Record<SlaPolicyRuleKey, TenantSlaPolicyRule>;
  version: number;
  updatedAt: string | null;
  updatedBy: TenantSlaPolicyUpdatedBy | null;
  deferredFields: {
    businessHours: "not_supported";
    channelOverrides: "not_supported";
    auditHistory: "not_supported";
  };
};

export type SlaPolicyVersionConflictError = Error & {
  code: "SLA_POLICY_VERSION_CONFLICT";
  currentVersion: number;
};

export function slaPolicyVersionConflict(currentVersion: number): SlaPolicyVersionConflictError {
  const err = new Error("SLA policy version conflict") as SlaPolicyVersionConflictError;
  err.code = "SLA_POLICY_VERSION_CONFLICT";
  err.currentVersion = currentVersion;
  return err;
}

export function isSlaPolicyVersionConflict(error: unknown): error is SlaPolicyVersionConflictError {
  return (
    error instanceof Error &&
    (error as SlaPolicyVersionConflictError).code === "SLA_POLICY_VERSION_CONFLICT" &&
    typeof (error as SlaPolicyVersionConflictError).currentVersion === "number"
  );
}

export interface SlaPolicyRepository {
  findByTenantId(tenantId: string): Promise<TenantSlaPolicyRecord | null>;
  create(input: {
    tenantId: string;
    policy: TenantSlaPolicy;
    updatedByAuthUserId: string;
  }): Promise<TenantSlaPolicyRecord>;
  update(input: {
    tenantId: string;
    expectedVersion: number;
    policy: TenantSlaPolicy;
    updatedByAuthUserId: string;
  }): Promise<TenantSlaPolicyRecord>;
}
