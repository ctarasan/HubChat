import type { ChannelConnectProvider, ChannelConnectionRecord, ChannelConnectionStatus } from "./channelConnections.js";
import type { SupportedChannelSettingChannel } from "./channelSettings.js";
import { OUTBOUND_READY_CONNECTION_STATUSES } from "./channelConnectRuntime.js";

export type ConnectionScopeMode = "active" | "all";

export type ConnectionScopeBucket = "active" | "unknown" | "historical";

/** Statuses treated as operator-active for inbox scoping. */
export const ACTIVE_CHANNEL_CONNECTION_STATUSES: readonly ChannelConnectionStatus[] = [
  "READY",
  "OUTBOUND_VERIFIED",
  "INBOUND_VERIFIED",
  "WEBHOOK_VERIFIED"
] as const;

export type ChannelSettingsScopeFallback = {
  provider: SupportedChannelSettingChannel;
  providerPageId: string | null;
  providerAccountName: string | null;
  enabled: boolean;
  status: string;
};

export type TenantConnectionScopeContext = {
  connections: ChannelConnectionRecord[];
  activeConnections: ChannelConnectionRecord[];
  settingsFallback: ChannelSettingsScopeFallback[];
};

export function isActiveChannelConnectionStatus(status: ChannelConnectionStatus | string): boolean {
  return (ACTIVE_CHANNEL_CONNECTION_STATUSES as readonly string[]).includes(status);
}

export function buildTenantConnectionScopeContext(input: {
  connections: ChannelConnectionRecord[];
  settingsFallback?: ChannelSettingsScopeFallback[];
}): TenantConnectionScopeContext {
  const connections = input.connections ?? [];
  return {
    connections,
    activeConnections: connections.filter((c) => isActiveChannelConnectionStatus(c.status)),
    settingsFallback: input.settingsFallback ?? []
  };
}

function pickRowString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function channelTypeFromRow(row: Record<string, unknown>): string {
  return pickRowString(row, "channel_type", "channelType").toUpperCase();
}

function activeIdentityIdsForProvider(
  ctx: TenantConnectionScopeContext,
  provider: ChannelConnectProvider
): Set<string> {
  const ids = new Set<string>();
  for (const c of ctx.activeConnections) {
    if (c.provider !== provider) continue;
    if (c.providerPageId?.trim()) ids.add(c.providerPageId.trim());
    if (c.providerIgAccountId?.trim()) ids.add(c.providerIgAccountId.trim());
    if (c.providerAccountId?.trim()) ids.add(c.providerAccountId.trim());
  }
  for (const s of ctx.settingsFallback) {
    if (s.provider !== provider || !s.enabled || s.status !== "READY") continue;
    if (s.providerPageId?.trim()) ids.add(s.providerPageId.trim());
  }
  return ids;
}

function hasActiveScopeForChannel(ctx: TenantConnectionScopeContext, channel: string): boolean {
  const provider = channel as ChannelConnectProvider;
  if (ctx.activeConnections.some((c) => c.provider === provider)) return true;
  return ctx.settingsFallback.some((s) => s.provider === provider && s.enabled && s.status === "READY");
}

/**
 * Whether a conversation row belongs to the active connection scope.
 * Legacy/unlinked rows without provider identity remain visible (unknown bucket).
 */
export function conversationMatchesActiveConnectionScope(
  row: Record<string, unknown>,
  ctx: TenantConnectionScopeContext
): boolean {
  const channel = channelTypeFromRow(row);
  if (!channel || !["LINE", "FACEBOOK", "INSTAGRAM"].includes(channel)) return true;

  const connectionId = pickRowString(row, "channel_connection_id", "channelConnectionId");
  const activeIds = new Set(ctx.activeConnections.map((c) => c.id));

  if (connectionId) {
    return activeIds.has(connectionId);
  }

  const provider = channel as ChannelConnectProvider;
  if (!hasActiveScopeForChannel(ctx, channel)) {
    return true;
  }

  if (channel === "LINE") {
    // LINE conversations lack bot id on row; unlinked legacy stays visible until inbound sets channel_connection_id.
    return true;
  }

  const pageId = pickRowString(row, "provider_page_id", "providerPageId");
  if (!pageId) {
    return true;
  }

  const activeIdsForProvider = activeIdentityIdsForProvider(ctx, provider);
  if (activeIdsForProvider.size === 0) {
    return true;
  }

  return activeIdsForProvider.has(pageId);
}

export function filterRowsByActiveConnectionScope<T extends Record<string, unknown>>(
  rows: T[],
  ctx: TenantConnectionScopeContext
): T[] {
  return rows.filter((row) => conversationMatchesActiveConnectionScope(row, ctx));
}

function defaultProviderLabel(provider: ChannelConnectProvider): string {
  if (provider === "LINE") return "LINE Official Account";
  if (provider === "FACEBOOK") return "Facebook Page";
  return "Instagram Account";
}

export function resolveConnectionLabelForRow(
  row: Record<string, unknown>,
  ctx: TenantConnectionScopeContext
): { connectionLabel: string | null; connectionScopeBucket: ConnectionScopeBucket } {
  const channel = channelTypeFromRow(row);
  const connectionId = pickRowString(row, "channel_connection_id", "channelConnectionId");
  const linked = connectionId ? ctx.connections.find((c) => c.id === connectionId) : null;

  if (linked) {
    const label =
      linked.providerAccountName?.trim() ||
      defaultProviderLabel(linked.provider);
    const bucket: ConnectionScopeBucket = isActiveChannelConnectionStatus(linked.status)
      ? "active"
      : "historical";
    return { connectionLabel: label, connectionScopeBucket: bucket };
  }

  const provider = channel as ChannelConnectProvider;
  const pageId = pickRowString(row, "provider_page_id", "providerPageId");
  if ((channel === "FACEBOOK" || channel === "INSTAGRAM") && pageId) {
    const match = ctx.connections.find(
      (c) =>
        c.provider === provider &&
        (c.providerPageId === pageId || c.providerIgAccountId === pageId)
    );
    if (match) {
      return {
        connectionLabel: match.providerAccountName?.trim() || defaultProviderLabel(provider),
        connectionScopeBucket: isActiveChannelConnectionStatus(match.status) ? "active" : "historical"
      };
    }
    const settingsMatch = ctx.settingsFallback.find(
      (s) => s.provider === provider && s.providerPageId === pageId
    );
    if (settingsMatch) {
      return {
        connectionLabel: settingsMatch.providerAccountName?.trim() || defaultProviderLabel(provider),
        connectionScopeBucket: settingsMatch.enabled && settingsMatch.status === "READY" ? "active" : "historical"
      };
    }
    if (hasActiveScopeForChannel(ctx, channel)) {
      return { connectionLabel: defaultProviderLabel(provider), connectionScopeBucket: "historical" };
    }
  }

  if (channel === "LINE" && hasActiveScopeForChannel(ctx, "LINE")) {
    const lineConn = ctx.activeConnections.find((c) => c.provider === "LINE");
    if (lineConn) {
      return {
        connectionLabel: lineConn.providerAccountName?.trim() || defaultProviderLabel("LINE"),
        connectionScopeBucket: "unknown"
      };
    }
  }

  return { connectionLabel: null, connectionScopeBucket: "unknown" };
}

function activeConnectionsForProvider(
  connections: ChannelConnectionRecord[],
  provider: ChannelConnectProvider
): ChannelConnectionRecord[] {
  return connections.filter((c) => c.provider === provider && isActiveChannelConnectionStatus(c.status));
}

function connectionIdentityValues(conn: ChannelConnectionRecord): string[] {
  const values = [conn.providerPageId, conn.providerIgAccountId, conn.providerAccountId];
  return values.map((v) => (v ?? "").trim()).filter((v) => v.length > 0);
}

function connectionMatchesInboundIdentity(conn: ChannelConnectionRecord, inboundIdentity: string): boolean {
  const trimmed = inboundIdentity.trim();
  if (!trimmed) return false;
  return connectionIdentityValues(conn).includes(trimmed);
}

function soleActiveConnectionId(active: ChannelConnectionRecord[]): string | null {
  return active.length === 1 ? active[0]!.id : null;
}

export function resolveInboundChannelConnectionId(input: {
  channel: ChannelConnectProvider;
  connections: ChannelConnectionRecord[];
  facebookPageId?: string | null;
  instagramPageId?: string | null;
  /** Optional LINE bot basic id / channel id when present on inbound payload. */
  lineProviderAccountId?: string | null;
}): string | null {
  const active = activeConnectionsForProvider(input.connections, input.channel);
  if (active.length === 0) return null;

  if (input.channel === "LINE") {
    const lineIdentity = (input.lineProviderAccountId ?? "").trim();
    if (lineIdentity) {
      const matched = active.filter((c) => connectionMatchesInboundIdentity(c, lineIdentity));
      return matched.length === 1 ? matched[0]!.id : null;
    }
    return soleActiveConnectionId(active);
  }

  const inboundIdentity =
    input.channel === "FACEBOOK"
      ? (input.facebookPageId ?? "").trim()
      : (input.instagramPageId ?? "").trim();

  if (!inboundIdentity) {
    return soleActiveConnectionId(active);
  }

  const matched = active.filter((c) => connectionMatchesInboundIdentity(c, inboundIdentity));
  if (matched.length === 1) {
    return matched[0]!.id;
  }
  return null;
}

function isOutboundReadyConnectionStatus(status: ChannelConnectionStatus | string): boolean {
  return (OUTBOUND_READY_CONNECTION_STATUSES as readonly string[]).includes(status);
}

function outboundReadyConnectionsForProvider(
  connections: ChannelConnectionRecord[],
  provider: ChannelConnectProvider
): ChannelConnectionRecord[] {
  return connections.filter((c) => c.provider === provider && isOutboundReadyConnectionStatus(c.status));
}

export type OutboundChannelConnectionLookupReason =
  | "explicit_not_found"
  | "no_match"
  | "ambiguous_match";

export type OutboundChannelConnectionLookup =
  | { ok: true; connectionId: string }
  | { ok: false; reason: OutboundChannelConnectionLookupReason };

/**
 * Fail-closed outbound connection binding for legacy rows with null channel_connection_id.
 * Explicit channelConnectionId is authoritative; page-scoped providers require a unique READY match.
 */
export function resolveOutboundChannelConnectionLookup(input: {
  channel: ChannelConnectProvider;
  connections: ChannelConnectionRecord[];
  channelConnectionId?: string | null;
  providerPageId?: string | null;
  providerAccountId?: string | null;
}): OutboundChannelConnectionLookup {
  const explicitId = input.channelConnectionId?.trim();
  if (explicitId) {
    const linked = input.connections.find((c) => c.id === explicitId);
    if (linked && linked.provider === input.channel) {
      return { ok: true, connectionId: linked.id };
    }
    return { ok: false, reason: "explicit_not_found" };
  }

  const ready = outboundReadyConnectionsForProvider(input.connections, input.channel);

  if (input.channel === "LINE") {
    const lineIdentity = (input.providerAccountId ?? "").trim();
    if (lineIdentity) {
      const matched = ready.filter((c) => connectionMatchesInboundIdentity(c, lineIdentity));
      if (matched.length === 1) return { ok: true, connectionId: matched[0]!.id };
      return { ok: false, reason: matched.length > 1 ? "ambiguous_match" : "no_match" };
    }
    if (ready.length === 1) return { ok: true, connectionId: ready[0]!.id };
    return { ok: false, reason: ready.length > 1 ? "ambiguous_match" : "no_match" };
  }

  const pageId = (input.providerPageId ?? "").trim();
  if (!pageId) {
    if (ready.length === 1) return { ok: true, connectionId: ready[0]!.id };
    return { ok: false, reason: ready.length > 1 ? "ambiguous_match" : "no_match" };
  }

  const matched = ready.filter((c) => connectionMatchesInboundIdentity(c, pageId));
  if (matched.length === 1) return { ok: true, connectionId: matched[0]!.id };
  return { ok: false, reason: matched.length > 1 ? "ambiguous_match" : "no_match" };
}
