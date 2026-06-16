/**
 * FB-OAUTH-1I — Non-secret deployment environment identity for operator safety.
 * Production is the safe default when configuration is absent.
 */

export const DEPLOYMENT_ENV_PUBLIC_VAR = "NEXT_PUBLIC_HUBCHAT_DEPLOYMENT_ENV";
export const DEPLOYMENT_LABEL_PUBLIC_VAR = "NEXT_PUBLIC_HUBCHAT_DEPLOYMENT_LABEL";

export type DeploymentEnvironmentKind = "production" | "staging" | "preview" | "development";

export type DeploymentEnvironmentPresentation = {
  kind: Exclude<DeploymentEnvironmentKind, "production">;
  label: string;
  warning: string;
};

export const DEPLOYMENT_ENVIRONMENT_WARNINGS: Record<
  Exclude<DeploymentEnvironmentKind, "production">,
  string
> = {
  staging: "Test environment — do not use real customer data.",
  preview: "Preview deployment — not for production use.",
  development: "Development environment — not for production use."
};

const FORBIDDEN_LABEL_PATTERNS = [
  /EAA[A-Za-z0-9]+/,
  /access_token/i,
  /secret/i,
  /password/i,
  /supabase/i,
  /postgres/i,
  /:\/\/[^/\s]+@/i,
  /credential/i
];

export function normalizeDeploymentEnvironmentKind(
  raw: string | null | undefined
): DeploymentEnvironmentKind {
  const value = raw?.trim().toLowerCase();
  if (!value || value === "production" || value === "prod") return "production";
  if (value === "staging") return "staging";
  if (value === "preview") return "preview";
  if (value === "development" || value === "dev" || value === "local") return "development";
  return "production";
}

export function sanitizeDeploymentEnvironmentLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim();
  if (!trimmed || trimmed.length > 48) return null;
  for (const pattern of FORBIDDEN_LABEL_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }
  return trimmed;
}

export function defaultDeploymentEnvironmentLabel(
  kind: Exclude<DeploymentEnvironmentKind, "production">
): string {
  switch (kind) {
    case "staging":
      return "STAGING";
    case "preview":
      return "PREVIEW";
    case "development":
      return "DEVELOPMENT";
  }
}

export function readDeploymentEnvironmentPresentation(
  env: NodeJS.ProcessEnv = process.env
): DeploymentEnvironmentPresentation | null {
  const kind = normalizeDeploymentEnvironmentKind(env[DEPLOYMENT_ENV_PUBLIC_VAR]);
  if (kind === "production") return null;

  const customLabel = sanitizeDeploymentEnvironmentLabel(env[DEPLOYMENT_LABEL_PUBLIC_VAR]);
  const label = customLabel ?? defaultDeploymentEnvironmentLabel(kind);

  return {
    kind,
    label,
    warning: DEPLOYMENT_ENVIRONMENT_WARNINGS[kind]
  };
}
