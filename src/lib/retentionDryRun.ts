import {
  DEFAULT_RETENTION_POLICY,
  subtractRetentionDays,
  type RetentionPolicyConfig
} from "./retentionPolicy.js";

export type ArchivedConversationRow = {
  id: string;
  leadId: string | null;
  channelType: string;
  status: string;
  resolvedAt: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
};

export type MessageRetentionRow = {
  conversationId: string;
  messageType: string | null;
  mediaUrl: string | null;
  previewUrl: string | null;
  metadataJson: Record<string, unknown> | null;
  rawPayload: Record<string, unknown> | null;
  createdAt: string;
};

export type MediaPurgeCandidateSample = {
  conversationId: string;
  leadId: string | null;
  channel: string;
  archivedAt: string;
  lastMessageAt: string | null;
  mediaCount: number;
  latestMediaAt: string | null;
};

export type MessagePurgeCandidateSample = {
  conversationId: string;
  leadId: string | null;
  channel: string;
  archivedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
};

export type RetentionDryRunReportDto = {
  policy: {
    archivedMediaRetentionDays: number;
    archivedMessageRetentionDays: number;
    rawPayloadRetentionDays: number;
  };
  generatedAt: string;
  tenantId: string;
  summary: {
    archivedConversationsEligibleForMediaPurge: number;
    archivedConversationsEligibleForMessagePurge: number;
    estimatedMessagesEligible: number;
    estimatedMediaAttachmentsEligible: number;
    estimatedRawPayloadRowsEligible: number;
  };
  samples: {
    mediaPurgeCandidates: MediaPurgeCandidateSample[];
    messagePurgeCandidates: MessagePurgeCandidateSample[];
  };
};

function parseIso(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveConversationArchivedAt(row: ArchivedConversationRow): Date | null {
  return (
    parseIso(row.resolvedAt) ??
    parseIso(row.closedAt) ??
    parseIso(row.updatedAt)
  );
}

export function isArchivedStatus(status: string): boolean {
  return status.trim().toUpperCase() === "ARCHIVED";
}

export function isArchivedEligibleForCutoff(archivedAt: Date | null, cutoff: Date): boolean {
  return archivedAt != null && archivedAt.getTime() <= cutoff.getTime();
}

export function messageHasMediaReference(row: MessageRetentionRow): boolean {
  const type = String(row.messageType ?? "").toUpperCase();
  if (type === "IMAGE" || type === "DOCUMENT_PDF") return true;
  if (row.mediaUrl?.trim() || row.previewUrl?.trim()) return true;
  const meta = row.metadataJson;
  if (!meta || typeof meta !== "object") return false;
  for (const key of ["mediaUrl", "previewUrl", "thumbnailUrl", "fullImageUrl"] as const) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return true;
  }
  return false;
}

export function messageHasNonEmptyRawPayload(row: MessageRetentionRow): boolean {
  const raw = row.rawPayload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return Object.keys(raw).length > 0;
}

type ConversationMessageStats = {
  messageCount: number;
  mediaCount: number;
  latestMediaAt: string | null;
  rawPayloadCount: number;
};

function accumulateMessageStats(
  acc: Map<string, ConversationMessageStats>,
  row: MessageRetentionRow
): void {
  const existing = acc.get(row.conversationId) ?? {
    messageCount: 0,
    mediaCount: 0,
    latestMediaAt: null,
    rawPayloadCount: 0
  };
  existing.messageCount += 1;
  if (messageHasMediaReference(row)) {
    existing.mediaCount += 1;
    const created = parseIso(row.createdAt);
    const latest = parseIso(existing.latestMediaAt);
    if (created && (!latest || created.getTime() > latest.getTime())) {
      existing.latestMediaAt = created.toISOString();
    }
  }
  if (messageHasNonEmptyRawPayload(row)) {
    existing.rawPayloadCount += 1;
  }
  acc.set(row.conversationId, existing);
}

export function buildRetentionDryRunReport(input: {
  tenantId: string;
  now?: Date;
  policy?: RetentionPolicyConfig;
  archivedConversations: ArchivedConversationRow[];
  messages: MessageRetentionRow[];
  webhookRawPayloadEligibleCount?: number;
}): RetentionDryRunReportDto {
  const now = input.now ?? new Date();
  const policy = input.policy ?? DEFAULT_RETENTION_POLICY;
  const mediaCutoff = subtractRetentionDays(now, policy.archivedMediaRetentionDays);
  const messageCutoff = subtractRetentionDays(now, policy.archivedMessageRetentionDays);

  const messageStats = new Map<string, ConversationMessageStats>();
  for (const row of input.messages) {
    accumulateMessageStats(messageStats, row);
  }

  const mediaEligible: Array<{
    conv: ArchivedConversationRow;
    archivedAt: Date;
    stats: ConversationMessageStats;
  }> = [];
  const messageEligible: Array<{
    conv: ArchivedConversationRow;
    archivedAt: Date;
    stats: ConversationMessageStats;
  }> = [];

  for (const conv of input.archivedConversations) {
    if (!isArchivedStatus(conv.status)) continue;
    const archivedAt = resolveConversationArchivedAt(conv);
    const stats = messageStats.get(conv.id) ?? {
      messageCount: 0,
      mediaCount: 0,
      latestMediaAt: null,
      rawPayloadCount: 0
    };
    if (isArchivedEligibleForCutoff(archivedAt, mediaCutoff)) {
      mediaEligible.push({ conv, archivedAt: archivedAt!, stats });
    }
    if (isArchivedEligibleForCutoff(archivedAt, messageCutoff)) {
      messageEligible.push({ conv, archivedAt: archivedAt!, stats });
    }
  }

  let estimatedMessagesEligible = 0;
  let estimatedMediaAttachmentsEligible = 0;
  let estimatedMessageRawPayloadRows = 0;
  for (const entry of mediaEligible) {
    estimatedMediaAttachmentsEligible += entry.stats.mediaCount;
  }
  for (const entry of messageEligible) {
    estimatedMessagesEligible += entry.stats.messageCount;
    estimatedMessageRawPayloadRows += entry.stats.rawPayloadCount;
  }

  const webhookCount = Math.max(0, input.webhookRawPayloadEligibleCount ?? 0);

  const toMediaSample = (entry: (typeof mediaEligible)[number]): MediaPurgeCandidateSample => ({
    conversationId: entry.conv.id,
    leadId: entry.conv.leadId,
    channel: entry.conv.channelType,
    archivedAt: entry.archivedAt.toISOString(),
    lastMessageAt: entry.conv.lastMessageAt,
    mediaCount: entry.stats.mediaCount,
    latestMediaAt: entry.stats.latestMediaAt
  });

  const toMessageSample = (entry: (typeof messageEligible)[number]): MessagePurgeCandidateSample => ({
    conversationId: entry.conv.id,
    leadId: entry.conv.leadId,
    channel: entry.conv.channelType,
    archivedAt: entry.archivedAt.toISOString(),
    lastMessageAt: entry.conv.lastMessageAt,
    messageCount: entry.stats.messageCount
  });

  mediaEligible.sort((a, b) => a.archivedAt.getTime() - b.archivedAt.getTime());
  messageEligible.sort((a, b) => a.archivedAt.getTime() - b.archivedAt.getTime());

  return {
    policy: {
      archivedMediaRetentionDays: policy.archivedMediaRetentionDays,
      archivedMessageRetentionDays: policy.archivedMessageRetentionDays,
      rawPayloadRetentionDays: policy.rawPayloadRetentionDays
    },
    generatedAt: now.toISOString(),
    tenantId: input.tenantId,
    summary: {
      archivedConversationsEligibleForMediaPurge: mediaEligible.length,
      archivedConversationsEligibleForMessagePurge: messageEligible.length,
      estimatedMessagesEligible,
      estimatedMediaAttachmentsEligible,
      estimatedRawPayloadRowsEligible: estimatedMessageRawPayloadRows + webhookCount
    },
    samples: {
      mediaPurgeCandidates: mediaEligible
        .slice(0, policy.dryRunMaxSampleRows)
        .map(toMediaSample),
      messagePurgeCandidates: messageEligible
        .slice(0, policy.dryRunMaxSampleRows)
        .map(toMessageSample)
    }
  };
}

/** Guardrail helper for tests: dry-run payload must stay lean and secret-free. */
export function assertRetentionDryRunReportLean(report: RetentionDryRunReportDto): void {
  const serialized = JSON.stringify(report).toLowerCase();
  const blocked = [
    "access_token",
    "secret_json",
    "payload_json",
    "bearer",
    "signedurl",
    "signed_url",
    "jwt",
    '"content"'
  ];
  for (const token of blocked) {
    if (serialized.includes(token)) {
      throw new Error(`Retention dry-run report must not expose ${token}`);
    }
  }
}
