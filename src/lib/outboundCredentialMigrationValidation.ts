import type {
  ChannelConnectProvider,
  ChannelConnectionStatus,
  ChannelCredentialType
} from "../domain/channelConnections.js";
import { PROVIDER_OUTBOUND_CREDENTIAL_TYPES } from "../domain/channelConnectRuntime.js";
import { sanitizeProviderErrorMessage } from "./sanitizeProviderError.js";

export type MigrationCredentialInput = {
  channelAccessToken?: string;
  channelSecret?: string;
  pageAccessToken?: string;
  accessToken?: string;
};

export type ProposedCredentialMigrationState = "WOULD_SET" | "MISSING" | "INVALID";

export type CredentialMigrationPlanItem = {
  credentialType: ChannelCredentialType;
  state: ProposedCredentialMigrationState;
  required: boolean;
};

const TOKEN_LIKE = /\bEA[A-Za-z0-9]{20,}\b|\bBearer\s+\S+|\baccess_token[=:]\s*\S+/gi;

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^<[^>]+>$/,
  /^placeholder$/i,
  /^fake[-_]?token$/i,
  /^test[-_]?token$/i,
  /^example[-_]?token$/i,
  /^sample[-_]?token$/i,
  /CHANGEME/i,
  /YOUR_.*TOKEN/i,
  /^<.*_(TOKEN|SECRET).*>$/i
];

function trimCredential(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function resolveOutboundMigrationPlaintext(
  provider: ChannelConnectProvider,
  credentialType: ChannelCredentialType,
  credentials: MigrationCredentialInput
): string {
  switch (provider) {
    case "LINE":
      if (credentialType === "ACCESS_TOKEN") return trimCredential(credentials.channelAccessToken);
      if (credentialType === "CHANNEL_SECRET") return trimCredential(credentials.channelSecret);
      break;
    case "FACEBOOK":
      if (credentialType === "ACCESS_TOKEN") {
        return trimCredential(credentials.pageAccessToken) || trimCredential(credentials.channelAccessToken);
      }
      break;
    case "INSTAGRAM":
      if (credentialType === "ACCESS_TOKEN") {
        return trimCredential(credentials.accessToken) || trimCredential(credentials.channelAccessToken);
      }
      break;
    default:
      break;
  }
  return "";
}

export function isObviousPlaceholderCredential(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function classifyCredentialValue(value: string, forExecute: boolean): ProposedCredentialMigrationState {
  const trimmed = value.trim();
  if (!trimmed) return "MISSING";
  if (forExecute && isObviousPlaceholderCredential(trimmed)) return "INVALID";
  return "WOULD_SET";
}

export type ProviderAccountValidation = {
  providerAccountIdPresent: boolean;
  providerPageIdPresent: boolean;
  providerIgAccountIdPresent: boolean;
  accountFieldsValid: boolean;
  errors: string[];
  warnings: string[];
};

export function validateProviderAccountFields(input: {
  provider: ChannelConnectProvider;
  providerAccountId?: string | null;
  providerPageId?: string | null;
  providerIgAccountId?: string | null;
}): ProviderAccountValidation {
  const providerAccountId = input.providerAccountId?.trim() ?? "";
  const providerPageId = input.providerPageId?.trim() ?? "";
  const providerIgAccountId = input.providerIgAccountId?.trim() ?? "";
  const errors: string[] = [];
  const warnings: string[] = [];

  const providerAccountIdPresent = providerAccountId.length > 0;
  const providerPageIdPresent = providerPageId.length > 0;
  const providerIgAccountIdPresent = providerIgAccountId.length > 0;

  switch (input.provider) {
    case "LINE":
      if (!providerAccountIdPresent && !providerPageIdPresent) {
        errors.push("LINE migration requires providerAccountId or provider page/bot id.");
      }
      if (!providerAccountIdPresent && providerPageIdPresent) {
        warnings.push("LINE providerAccountId is empty; providerPageId will be used as account reference.");
      }
      break;
    case "FACEBOOK":
      if (!providerPageIdPresent && !providerAccountIdPresent) {
        errors.push("Facebook migration requires providerPageId or providerAccountId.");
      }
      break;
    case "INSTAGRAM":
      if (!providerPageIdPresent && !providerIgAccountIdPresent) {
        errors.push("Instagram migration requires providerPageId or providerIgAccountId.");
      }
      break;
    default:
      errors.push("Unsupported provider.");
  }

  return {
    providerAccountIdPresent,
    providerPageIdPresent,
    providerIgAccountIdPresent,
    accountFieldsValid: errors.length === 0,
    errors,
    warnings
  };
}

export function buildCredentialMigrationPlanItems(input: {
  provider: ChannelConnectProvider;
  credentials: MigrationCredentialInput;
  forExecute: boolean;
}): CredentialMigrationPlanItem[] {
  const requiredTypes = PROVIDER_OUTBOUND_CREDENTIAL_TYPES[input.provider];
  return requiredTypes.map((credentialType) => {
    const plaintext = resolveOutboundMigrationPlaintext(input.provider, credentialType, input.credentials);
    const state = classifyCredentialValue(plaintext, input.forExecute);
    const required = true;
    let resolvedState = state;
    if (input.provider === "LINE" && credentialType === "CHANNEL_SECRET" && state === "MISSING") {
      resolvedState = "MISSING";
    }
    return { credentialType, state: resolvedState, required };
  });
}

export function defaultProposedConnectionStatus(): ChannelConnectionStatus {
  return "READY";
}

export function sanitizeMigrationErrorMessage(raw: unknown): string {
  return sanitizeProviderErrorMessage(raw);
}

/** Ensures plan/log payloads never contain raw secrets (test + runtime guard). */
export function assertSafeMigrationPlanPayload(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  if (TOKEN_LIKE.test(serialized)) {
    throw new Error("Migration plan payload contains forbidden token-like values");
  }
  const forbiddenKeys = [
    "plaintextSecret",
    "encrypted_secret_value",
    "channelAccessToken",
    "channelSecret",
    "pageAccessToken",
    "accessToken",
    "Authorization"
  ];
  for (const key of forbiddenKeys) {
    if (serialized.includes(`"${key}"`)) {
      throw new Error(`Migration plan payload contains forbidden field: ${key}`);
    }
  }
}
