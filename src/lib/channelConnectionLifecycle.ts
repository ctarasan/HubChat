import { randomBytes } from "node:crypto";
import type {
  ChannelConnectProvider,
  ChannelConnectionStatus,
  ChannelCredentialState
} from "../domain/channelConnections.js";
import {
  CHANNEL_CONNECTION_STATUSES,
  isChannelConnectProvider
} from "../domain/channelConnections.js";
const PUBLIC_KEY_PREFIX = "ccp_";

/** Generates a URL-safe public connection key (non-secret routing id for future wizard callbacks). */
export function generatePublicConnectionKey(): string {
  return `${PUBLIC_KEY_PREFIX}${randomBytes(18).toString("base64url")}`;
}

export function assertPublicConnectionKey(value: string): string {
  const trimmed = value.trim();
  if (!/^ccp_[A-Za-z0-9_-]{16,128}$/.test(trimmed)) {
    throw new Error("Invalid public connection key format");
  }
  return trimmed;
}

export function normalizeChannelConnectProvider(value: string): ChannelConnectProvider {
  const upper = value.trim().toUpperCase();
  if (!isChannelConnectProvider(upper)) {
    throw new Error("Invalid channel connect provider");
  }
  return upper;
}

export function normalizeChannelConnectionStatus(value: string): ChannelConnectionStatus {
  const upper = value.trim().toUpperCase() as ChannelConnectionStatus;
  if (!CHANNEL_CONNECTION_STATUSES.includes(upper)) {
    throw new Error("Invalid channel connection status");
  }
  return upper;
}

/** Controlled lifecycle progression (terminal states do not advance automatically). */
const ALLOWED_STATUS_TRANSITIONS: Partial<Record<ChannelConnectionStatus, ChannelConnectionStatus[]>> = {
  DRAFT: ["AUTHORIZING", "REVOKED", "ERROR"],
  AUTHORIZING: ["CONNECTED", "READY", "ERROR", "REVOKED", "RECONNECT_REQUIRED", "DRAFT"],
  CONNECTED: ["WEBHOOK_CONFIGURED", "ERROR", "RECONNECT_REQUIRED", "REVOKED"],
  WEBHOOK_CONFIGURED: ["WEBHOOK_VERIFIED", "ERROR", "RECONNECT_REQUIRED", "REVOKED"],
  WEBHOOK_VERIFIED: ["INBOUND_VERIFIED", "ERROR", "RECONNECT_REQUIRED", "REVOKED"],
  INBOUND_VERIFIED: ["OUTBOUND_VERIFIED", "ERROR", "RECONNECT_REQUIRED", "REVOKED"],
  OUTBOUND_VERIFIED: ["READY", "ERROR", "RECONNECT_REQUIRED", "REVOKED"],
  READY: ["ERROR", "RECONNECT_REQUIRED", "REVOKED"],
  ERROR: ["DRAFT", "AUTHORIZING", "RECONNECT_REQUIRED", "REVOKED"],
  RECONNECT_REQUIRED: ["AUTHORIZING", "REVOKED", "ERROR"],
  REVOKED: []
};

export type ChannelConnectionTransitionOptions = {
  /**
   * READY → AUTHORIZING is intentionally excluded from the generic matrix.
   * Only Facebook re-authorize (permission refresh) may opt in.
   */
  allowReadyReauthorize?: boolean;
};

export function canTransitionChannelConnectionStatus(
  from: ChannelConnectionStatus,
  to: ChannelConnectionStatus,
  options?: ChannelConnectionTransitionOptions
): boolean {
  if (from === to) return true;
  if (from === "READY" && to === "AUTHORIZING") {
    return options?.allowReadyReauthorize === true;
  }
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  return Boolean(allowed?.includes(to));
}

export function assertChannelConnectionStatusTransition(
  from: ChannelConnectionStatus,
  to: ChannelConnectionStatus,
  options?: ChannelConnectionTransitionOptions
): void {
  if (!canTransitionChannelConnectionStatus(from, to, options)) {
    throw new Error("Invalid channel connection status transition");
  }
}

export function resolveCredentialStateFromExpiry(input: {
  credentialState: ChannelCredentialState;
  tokenExpiresAt: Date | null;
  now?: Date;
}): ChannelCredentialState {  if (input.credentialState === "REVOKED" || input.credentialState === "EMPTY") {
    return input.credentialState;
  }
  if (input.tokenExpiresAt && input.tokenExpiresAt.getTime() <= (input.now ?? new Date()).getTime()) {
    return "EXPIRED";
  }
  return input.credentialState;
}
