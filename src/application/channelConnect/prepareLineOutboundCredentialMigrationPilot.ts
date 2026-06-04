import type { ChannelConnectionRepository } from "../../domain/ports.js";
import {
  assertSafeMigrationPlanPayload,
  type MigrationCredentialInput,
  type ProposedCredentialMigrationState
} from "../../lib/outboundCredentialMigrationValidation.js";
import { prepareOutboundCredentialMigration, type OutboundCredentialMigrationPlan } from "./prepareOutboundCredentialMigration.js";

export const LINE_PILOT_PROVIDER = "LINE" as const;

export type LineOutboundCredentialEnvNames = {
  accessToken: "LINE_CHANNEL_ACCESS_TOKEN";
  channelSecret: "LINE_CHANNEL_SECRET";
};

export const LINE_OUTBOUND_CREDENTIAL_ENV_NAMES: LineOutboundCredentialEnvNames = {
  accessToken: "LINE_CHANNEL_ACCESS_TOKEN",
  channelSecret: "LINE_CHANNEL_SECRET"
};

export type SanitizedLineCredentialState = ProposedCredentialMigrationState | "STORED";

export type LineOutboundCredentialMigrationPilotResult = {
  mode: "dry_run" | "executed";
  provider: typeof LINE_PILOT_PROVIDER;
  tenantId: string;
  valid: boolean;
  providerAccountIdPresent: boolean;
  providerPageIdPresent: boolean;
  lineChannelAccessTokenEnvPresent: boolean;
  lineChannelSecretEnvPresent: boolean;
  credentials: Array<{
    credentialType: "ACCESS_TOKEN" | "CHANNEL_SECRET";
    state: SanitizedLineCredentialState;
  }>;
  warnings: string[];
  errors: string[];
  nextSteps: string[];
  connectionId: string | null;
  credentialFingerprints: Partial<Record<"ACCESS_TOKEN" | "CHANNEL_SECRET", string | null>> | null;
};

export class LineOutboundCredentialMigrationPilotError extends Error {
  override readonly name = "LineOutboundCredentialMigrationPilotError";
}

export type LineOutboundCredentialMigrationPilotInput = {
  tenantId: string;
  providerAccountId?: string | null;
  providerPageId?: string | null;
  displayName?: string | null;
  /** Default true. */
  dryRun?: boolean;
  /** Requires dryRun=false and valid LINE env credentials. */
  execute?: boolean;
  connectedBy?: string | null;
  /** Credentials read from env by caller — never logged by this module. */
  credentialsFromEnv: MigrationCredentialInput;
  lineChannelAccessTokenEnvPresent: boolean;
  lineChannelSecretEnvPresent: boolean;
};

export type LineOutboundCredentialMigrationPilotDeps = {
  channelConnectionRepository?: ChannelConnectionRepository;
  log?: (payload: Record<string, unknown>) => void;
};

export function readLineCredentialEnvPresence(
  env: Record<string, string | undefined> = process.env
): { lineChannelAccessTokenEnvPresent: boolean; lineChannelSecretEnvPresent: boolean } {
  return {
    lineChannelAccessTokenEnvPresent: Boolean(env.LINE_CHANNEL_ACCESS_TOKEN?.trim()),
    lineChannelSecretEnvPresent: Boolean(env.LINE_CHANNEL_SECRET?.trim())
  };
}

export function buildLineCredentialsFromEnv(
  env: Record<string, string | undefined> = process.env
): MigrationCredentialInput {
  return {
    channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || undefined,
    channelSecret: env.LINE_CHANNEL_SECRET?.trim() || undefined
  };
}

export function resolveLinePilotExecuteIntent(input: {
  execute?: boolean;
  dryRun?: boolean;
}): { willExecute: boolean; refusalReason: string | null } {
  if (input.execute !== true) {
    return { willExecute: false, refusalReason: null };
  }
  if (input.dryRun !== false) {
    return {
      willExecute: false,
      refusalReason: "Execute requires explicit --execute and --dry-run=false."
    };
  }
  return { willExecute: true, refusalReason: null };
}

function mapToPilotResult(
  plan: OutboundCredentialMigrationPlan,
  envPresence: { lineChannelAccessTokenEnvPresent: boolean; lineChannelSecretEnvPresent: boolean },
  extra?: { warnings?: string[]; errors?: string[] }
): LineOutboundCredentialMigrationPilotResult {
  const credentials = plan.credentials
    .filter(
      (item): item is typeof item & { credentialType: "ACCESS_TOKEN" | "CHANNEL_SECRET" } =>
        item.credentialType === "ACCESS_TOKEN" || item.credentialType === "CHANNEL_SECRET"
    )
    .map((item) => ({
      credentialType: item.credentialType,
      state:
        plan.mode === "executed" && item.state === "WOULD_SET"
          ? ("STORED" as const)
          : item.state
    }));

  const result: LineOutboundCredentialMigrationPilotResult = {
    mode: plan.mode,
    provider: LINE_PILOT_PROVIDER,
    tenantId: plan.tenantId,
    valid: plan.valid,
    providerAccountIdPresent: plan.providerAccountIdPresent,
    providerPageIdPresent: plan.providerPageIdPresent,
    lineChannelAccessTokenEnvPresent: envPresence.lineChannelAccessTokenEnvPresent,
    lineChannelSecretEnvPresent: envPresence.lineChannelSecretEnvPresent,
    credentials,
    warnings: [...(extra?.warnings ?? []), ...plan.warnings],
    errors: [...(extra?.errors ?? []), ...plan.errors],
    nextSteps: plan.nextSteps,
    connectionId: plan.connectionId,
    credentialFingerprints: plan.storedCredentialFingerprints
      ? {
          ACCESS_TOKEN: plan.storedCredentialFingerprints.ACCESS_TOKEN ?? null,
          CHANNEL_SECRET: plan.storedCredentialFingerprints.CHANNEL_SECRET ?? null
        }
      : null
  };

  assertSafeMigrationPlanPayload(result);
  return result;
}

/**
 * LINE-only outbound credential migration pilot (dry-run default).
 * Not imported by worker, webhooks, or send paths.
 */
export async function prepareLineOutboundCredentialMigrationPilot(
  deps: LineOutboundCredentialMigrationPilotDeps,
  input: LineOutboundCredentialMigrationPilotInput
): Promise<LineOutboundCredentialMigrationPilotResult> {
  const tenantId = input.tenantId?.trim() ?? "";
  if (!tenantId) {
    throw new LineOutboundCredentialMigrationPilotError("tenantId is required.");
  }

  const providerAccountId = input.providerAccountId?.trim() ?? "";
  const providerPageId = input.providerPageId?.trim() ?? "";
  if (!providerAccountId && !providerPageId) {
    throw new LineOutboundCredentialMigrationPilotError(
      "LINE pilot requires --provider-account-id or --provider-page-id."
    );
  }

  const { willExecute, refusalReason } = resolveLinePilotExecuteIntent(input);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (refusalReason) {
    warnings.push(refusalReason);
  }

  if (willExecute) {
    if (!deps.channelConnectionRepository) {
      throw new LineOutboundCredentialMigrationPilotError(
        "Execute requires ChannelConnectionRepository (Supabase) — not available in this context."
      );
    }
    if (!input.lineChannelAccessTokenEnvPresent) {
      errors.push(`${LINE_OUTBOUND_CREDENTIAL_ENV_NAMES.accessToken} is not set in environment.`);
    }
    if (!input.lineChannelSecretEnvPresent) {
      errors.push(`${LINE_OUTBOUND_CREDENTIAL_ENV_NAMES.channelSecret} is not set in environment.`);
    }
    if (errors.length > 0) {
      return {
        mode: "dry_run",
        provider: LINE_PILOT_PROVIDER,
        tenantId,
        valid: false,
        providerAccountIdPresent: Boolean(providerAccountId),
        providerPageIdPresent: Boolean(providerPageId),
        lineChannelAccessTokenEnvPresent: input.lineChannelAccessTokenEnvPresent,
        lineChannelSecretEnvPresent: input.lineChannelSecretEnvPresent,
        credentials: [
          {
            credentialType: "ACCESS_TOKEN",
            state: input.lineChannelAccessTokenEnvPresent ? "WOULD_SET" : "MISSING"
          },
          {
            credentialType: "CHANNEL_SECRET",
            state: input.lineChannelSecretEnvPresent ? "WOULD_SET" : "MISSING"
          }
        ],
        warnings,
        errors,
        nextSteps: [
          "Set LINE credentials in secure environment variables only (never CLI args).",
          "Re-run dry-run before execute."
        ],
        connectionId: null,
        credentialFingerprints: null
      };
    }
  }

  const pilotWarnings = [...warnings];
  const pilotErrors = [...errors];

  const plan = await prepareOutboundCredentialMigration(
    {
      channelConnectionRepository: willExecute ? deps.channelConnectionRepository : undefined,
      log: (payload) =>
        deps.log?.({
          ...payload,
          pilot: "line_outbound_credential_migration"
        })
    },
    {
      tenantId,
      provider: LINE_PILOT_PROVIDER,
      displayName: input.displayName,
      providerAccountId: providerAccountId || null,
      providerPageId: providerPageId || null,
      credentials: input.credentialsFromEnv,
      dryRun: willExecute ? false : true,
      execute: willExecute,
      connectedBy: input.connectedBy ?? "line-pilot-ops"
    }
  );

  return mapToPilotResult(
    plan,
    {
      lineChannelAccessTokenEnvPresent: input.lineChannelAccessTokenEnvPresent,
      lineChannelSecretEnvPresent: input.lineChannelSecretEnvPresent
    },
    { warnings: pilotWarnings, errors: pilotErrors }
  );
}

/** Guard for tests — pilot entrypoints must not accept non-LINE providers. */
export function assertLinePilotProviderOnly(provider: string): void {
  if (provider !== LINE_PILOT_PROVIDER) {
    throw new LineOutboundCredentialMigrationPilotError(
      "Only LINE provider is supported by the outbound credential migration pilot."
    );
  }
}

export function toSanitizedPilotJson(result: LineOutboundCredentialMigrationPilotResult): string {
  assertSafeMigrationPlanPayload(result);
  return JSON.stringify(result, null, 2);
}
