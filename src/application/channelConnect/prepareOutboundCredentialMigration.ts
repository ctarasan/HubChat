import type {
  ChannelConnectProvider,
  ChannelConnectionStatus,
  ChannelCredentialType
} from "../../domain/channelConnections.js";
import type { ChannelConnectionRepository } from "../../domain/ports.js";
import {
  assertSafeMigrationPlanPayload,
  buildCredentialMigrationPlanItems,
  defaultProposedConnectionStatus,
  resolveOutboundMigrationPlaintext,
  sanitizeMigrationErrorMessage,
  type CredentialMigrationPlanItem,
  type MigrationCredentialInput,
  validateProviderAccountFields
} from "../../lib/outboundCredentialMigrationValidation.js";

export type PrepareOutboundCredentialMigrationInput = {
  tenantId: string;
  provider: ChannelConnectProvider;
  displayName?: string | null;
  providerAccountId?: string | null;
  providerPageId?: string | null;
  providerIgAccountId?: string | null;
  credentials: MigrationCredentialInput;
  /** Default true — no DB writes unless explicitly disabled with execute. */
  dryRun?: boolean;
  /** Requires dryRun=false to persist credentials via repository encryption path. */
  execute?: boolean;
  connectedBy?: string | null;
  targetConnectionStatus?: ChannelConnectionStatus;
};

export type OutboundCredentialMigrationPlan = {
  mode: "dry_run" | "executed";
  valid: boolean;
  provider: ChannelConnectProvider;
  tenantId: string;
  displayName: string | null;
  proposedConnectionStatus: ChannelConnectionStatus;
  providerAccountIdPresent: boolean;
  providerPageIdPresent: boolean;
  providerIgAccountIdPresent: boolean;
  credentials: CredentialMigrationPlanItem[];
  warnings: string[];
  errors: string[];
  nextSteps: string[];
  connectionId: string | null;
  storedCredentialFingerprints: Partial<Record<ChannelCredentialType, string | null>> | null;
};

export class OutboundCredentialMigrationError extends Error {
  override readonly name = "OutboundCredentialMigrationError";

  constructor(message: string) {
    super(sanitizeMigrationErrorMessage(message));
  }
}

export type PrepareOutboundCredentialMigrationDeps = {
  channelConnectionRepository?: ChannelConnectionRepository;
  log?: (payload: Record<string, unknown>) => void;
};

function buildNextSteps(input: {
  valid: boolean;
  mode: "dry_run" | "executed";
  provider: ChannelConnectProvider;
}): string[] {
  if (!input.valid) {
    return [
      "Fix validation errors and re-run dry-run.",
      "Do not enable HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED until credentials are stored and verified."
    ];
  }
  if (input.mode === "dry_run") {
    return [
      `Review dry-run plan for ${input.provider}.`,
      "Run execute only from a secure server-side context with dryRun=false and execute=true.",
      "Verify credential metadata shows SET via metadata query (no plaintext).",
      "Follow docs/channel-connect-outbound-rollout-readiness.md before enabling resolver flag."
    ];
  }
  return [
    "Verify channel_credentials metadata shows SET and fingerprints match expectation.",
    "Run outbound smoke with DB_WITH_ENV_FALLBACK during a controlled rollout window only.",
    "Keep HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED off until ops go/no-go passes."
  ];
}

function resolveExecuteIntent(input: PrepareOutboundCredentialMigrationInput): {
  willExecute: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (input.execute === true && input.dryRun !== false) {
    warnings.push("execute was requested but dryRun is not false; running dry-run only.");
    return { willExecute: false, warnings };
  }
  const willExecute = input.execute === true && input.dryRun === false;
  return { willExecute, warnings };
}

function buildPlan(input: {
  mode: "dry_run" | "executed";
  valid: boolean;
  provider: ChannelConnectProvider;
  tenantId: string;
  displayName: string | null;
  proposedConnectionStatus: ChannelConnectionStatus;
  account: ReturnType<typeof validateProviderAccountFields>;
  credentials: CredentialMigrationPlanItem[];
  warnings: string[];
  errors: string[];
  connectionId: string | null;
  storedCredentialFingerprints: Partial<Record<ChannelCredentialType, string | null>> | null;
}): OutboundCredentialMigrationPlan {
  const plan: OutboundCredentialMigrationPlan = {
    mode: input.mode,
    valid: input.valid,
    provider: input.provider,
    tenantId: input.tenantId,
    displayName: input.displayName,
    proposedConnectionStatus: input.proposedConnectionStatus,
    providerAccountIdPresent: input.account.providerAccountIdPresent,
    providerPageIdPresent: input.account.providerPageIdPresent,
    providerIgAccountIdPresent: input.account.providerIgAccountIdPresent,
    credentials: input.credentials,
    warnings: input.warnings,
    errors: input.errors,
    nextSteps: buildNextSteps({ valid: input.valid, mode: input.mode, provider: input.provider }),
    connectionId: input.connectionId,
    storedCredentialFingerprints: input.storedCredentialFingerprints
  };
  assertSafeMigrationPlanPayload(plan);
  return plan;
}

function credentialItemsValid(items: CredentialMigrationPlanItem[]): boolean {
  return items.every((item) => !item.required || item.state === "WOULD_SET");
}

async function executeMigration(input: {
  deps: PrepareOutboundCredentialMigrationDeps;
  request: PrepareOutboundCredentialMigrationInput;
  credentials: CredentialMigrationPlanItem[];
  proposedConnectionStatus: ChannelConnectionStatus;
  displayName: string | null;
  account: ReturnType<typeof validateProviderAccountFields>;
}): Promise<{
  connectionId: string;
  storedCredentialFingerprints: Partial<Record<ChannelCredentialType, string | null>>;
}> {
  const repository = input.deps.channelConnectionRepository;
  if (!repository) {
    throw new OutboundCredentialMigrationError("Channel connection repository is required for execute mode.");
  }

  const tenantId = input.request.tenantId.trim();
  const provider = input.request.provider;
  const providerAccountId =
    input.request.providerAccountId?.trim() ||
    input.request.providerPageId?.trim() ||
    input.request.providerIgAccountId?.trim() ||
    null;

  let connection = await repository.findByTenantAndProvider(tenantId, provider);
  if (!connection) {
    connection = await repository.createConnection({
      tenantId,
      provider,
      status: input.proposedConnectionStatus,
      providerAccountId,
      providerAccountName: input.displayName,
      providerPageId: input.request.providerPageId?.trim() || null,
      providerIgAccountId: input.request.providerIgAccountId?.trim() || null,
      connectedBy: input.request.connectedBy ?? null
    });
  }

  const storedCredentialFingerprints: Partial<Record<ChannelCredentialType, string | null>> = {};

  for (const item of input.credentials) {
    if (item.state !== "WOULD_SET") continue;
    const plaintext = resolveOutboundMigrationPlaintext(
      provider,
      item.credentialType,
      input.request.credentials
    );
    const metadata = await repository.storeEncryptedCredential({
      tenantId,
      connectionId: connection.id,
      provider,
      credentialType: item.credentialType,
      plaintextSecret: plaintext
    });
    storedCredentialFingerprints[item.credentialType] = metadata.secretFingerprint;
  }

  input.deps.log?.({
    event: "channel_connect_credential_migration_executed",
    tenantId,
    provider,
    connectionId: connection.id,
    credentialTypesStored: Object.keys(storedCredentialFingerprints)
  });

  return { connectionId: connection.id, storedCredentialFingerprints };
}

/**
 * Plans or executes outbound credential migration into CCP-1 tables.
 * Default: dry-run only (no repository writes).
 */
export async function prepareOutboundCredentialMigration(
  deps: PrepareOutboundCredentialMigrationDeps,
  input: PrepareOutboundCredentialMigrationInput
): Promise<OutboundCredentialMigrationPlan> {
  const tenantId = input.tenantId?.trim() ?? "";
  if (!tenantId) {
    throw new OutboundCredentialMigrationError("tenantId is required.");
  }

  const { willExecute, warnings: executeWarnings } = resolveExecuteIntent(input);
  const proposedConnectionStatus = input.targetConnectionStatus ?? defaultProposedConnectionStatus();
  const displayName = input.displayName?.trim() || null;

  const account = validateProviderAccountFields({
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    providerPageId: input.providerPageId,
    providerIgAccountId: input.providerIgAccountId
  });

  const credentialItems = buildCredentialMigrationPlanItems({
    provider: input.provider,
    credentials: input.credentials,
    forExecute: willExecute
  });

  const errors = [...account.errors];
  const warnings = [...account.warnings, ...executeWarnings];

  for (const item of credentialItems) {
    if (item.state === "INVALID") {
      errors.push(`${item.credentialType} value is not allowed for execute mode.`);
    } else if (item.required && item.state === "MISSING") {
      errors.push(`${item.credentialType} is required for ${input.provider} outbound migration.`);
    }
  }

  const valid = account.accountFieldsValid && credentialItemsValid(credentialItems) && errors.length === 0;

  if (!willExecute) {
    deps.log?.({
      event: "channel_connect_credential_migration_dry_run",
      tenantId,
      provider: input.provider,
      valid,
      proposedConnectionStatus,
      credentialStates: credentialItems.map((c) => ({
        type: c.credentialType,
        state: c.state
      }))
    });

    return buildPlan({
      mode: "dry_run",
      valid,
      provider: input.provider,
      tenantId,
      displayName,
      proposedConnectionStatus,
      account,
      credentials: credentialItems,
      warnings,
      errors,
      connectionId: null,
      storedCredentialFingerprints: null
    });
  }

  if (!valid) {
    throw new OutboundCredentialMigrationError("Migration plan is invalid; cannot execute.");
  }

  const executed = await executeMigration({
    deps,
    request: input,
    credentials: credentialItems,
    proposedConnectionStatus,
    displayName,
    account
  });

  return buildPlan({
    mode: "executed",
    valid: true,
    provider: input.provider,
    tenantId,
    displayName,
    proposedConnectionStatus,
    account,
    credentials: credentialItems.map((item) => ({
      ...item,
      state: item.state === "WOULD_SET" ? "WOULD_SET" : item.state
    })),
    warnings,
    errors,
    connectionId: executed.connectionId,
    storedCredentialFingerprints: executed.storedCredentialFingerprints
  });
}
