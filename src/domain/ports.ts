import type { ChannelType, Contact, Conversation, Lead, LeadStatus, Message, UUID } from "./entities.js";

export interface QueuePort {
  enqueue<T>(topic: string, event: T, opts?: { runAt?: Date; idempotencyKey?: string; tenantId?: string }): Promise<void>;
  claimBatch<T>(topic: string, opts?: { limit?: number }): Promise<Array<QueueClaimedJob<T>>>;
  markDone(jobId: string): Promise<void>;
  markFailed(job: QueueRetryJobRef, error: unknown): Promise<QueueFailureResult>;
  consume<T>(topic: string, handler: (event: T) => Promise<void>): Promise<void>;
}

export interface QueueClaimedJob<T> {
  id: string;
  tenantId: string;
  payload: T;
  retryCount: number;
  maxRetries: number;
}

export interface QueueRetryJobRef {
  id: string;
  retryCount: number;
  maxRetries: number;
}

export interface QueueFailureResult {
  deadLetter: boolean;
  retryCount: number;
  nextAvailableAt: string;
}

export interface OutboxClaimedEvent<T> {
  id: string;
  tenantId: string;
  topic: string;
  payload: T;
  idempotencyKey: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface OutboxFailureResult {
  deadLetter: boolean;
  attemptCount: number;
  nextAvailableAt: string;
}

export interface OutboxPort {
  add<T>(input: { tenantId: string; topic: string; payload: T; idempotencyKey: string; availableAt?: Date }): Promise<void>;
  claimBatch<T>(opts?: { limit?: number; topic?: string }): Promise<Array<OutboxClaimedEvent<T>>>;
  markDispatched(eventId: string): Promise<void>;
  markFailed(eventId: string, opts: { attemptCount: number; maxAttempts: number; error: unknown }): Promise<OutboxFailureResult>;
}

export interface LeadRepository {
  findByExternalUser(tenantId: UUID, channel: ChannelType, externalUserId: string): Promise<Lead | null>;
  create(data: Omit<Lead, "id" | "createdAt" | "updatedAt">): Promise<Lead>;
  updateStatus(leadId: UUID, status: LeadStatus): Promise<void>;
  assign(leadId: UUID, salesAgentId: UUID): Promise<void>;
  list(input: {
    tenantId: string;
    status?: string;
    channel?: string;
    assignedSalesId?: string;
    lastActivityFrom?: string;
    lastActivityTo?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: Lead[]; nextCursor: string | null }>;
}

export interface ConversationRepository {
  findByThread(tenantId: UUID, channel: ChannelType, threadId: string): Promise<Conversation | null>;
  create(data: Omit<Conversation, "id">): Promise<Conversation>;
  touchLastMessage(conversationId: UUID, at: Date, participantDisplayName?: string | null): Promise<void>;
  list(input: {
    tenantId: string;
    status?: string;
    channel?: string;
    assignedSalesId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: any[]; nextCursor: string | null }>;
}

export interface MessageRepository {
  create(data: Omit<Message, "id" | "createdAt">): Promise<Message>;
  /** After provider send succeeds; optional externalMessageId is persisted when the channel returns one. */
  markSent(messageId: UUID, externalMessageId?: string | null): Promise<void>;
  markFailed(messageId: UUID, reason: string): Promise<void>;
  listByConversation(input: {
    tenantId: string;
    conversationId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: Message[]; nextCursor: string | null }>;
}

export interface ChannelAccountRepository {
  findByTenantAndChannel(tenantId: UUID, channel: ChannelType): Promise<{ id: UUID } | null>;
}

export interface ContactRepository {
  getOrCreateByIdentity(input: {
    tenantId: UUID;
    channel: ChannelType;
    externalUserId: string;
    profile?: { name?: string; phone?: string; email?: string };
  }): Promise<Contact>;
  upsertIdentityProfile(input: {
    tenantId: UUID;
    channel: ChannelType;
    externalUserId: string;
    displayName?: string | null;
    profile?: { name?: string; phone?: string; email?: string };
  }): Promise<{ contactId: string | null; displayName: string | null }>;
}

export interface ActivityLogRepository {
  create(input: {
    tenantId: UUID;
    leadId: UUID;
    type: "MESSAGE_SENT" | "MESSAGE_RECEIVED" | "STATUS_CHANGED" | "ASSIGNED" | "NOTE_ADDED";
    metadataJson: Record<string, unknown>;
  }): Promise<void>;
}

export interface WebhookEventRepository {
  saveIfNotExists(input: {
    tenantId: UUID;
    channelType: ChannelType;
    externalEventId: string;
    idempotencyKey: string;
    payloadJson: Record<string, unknown>;
  }): Promise<"inserted" | "duplicate">;
  saveInboundAndOutboxIfNotExists(input: {
    tenantId: UUID;
    channelType: ChannelType;
    externalEventId: string;
    idempotencyKey: string;
    payloadJson: Record<string, unknown>;
    outboxTopic: string;
    outboxPayload: Record<string, unknown>;
    outboxIdempotencyKey: string;
  }): Promise<"inserted" | "duplicate">;
}

export interface ChannelAdapter {
  readonly channel: ChannelType;
  receiveMessage(raw: unknown): Promise<{
    externalEventId: string;
    idempotencyKey: string;
    externalMessageId: string;
    externalUserId: string;
    channelThreadId: string;
    text: string;
    occurredAt: string;
    profile?: { name?: string; phone?: string; email?: string };
  }>;
  sendMessage(input: {
    channelThreadId: string;
    content: string;
    idempotencyKey: string;
    messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
    mediaUrl?: string;
    previewUrl?: string;
    mediaMimeType?: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    fileName?: string;
    fileSizeBytes?: number;
    width?: number;
    height?: number;
  }): Promise<{ externalMessageId: string }>;
  fetchUserProfile(externalUserId: string): Promise<{ name?: string; phone?: string; email?: string }>;
  fetchConversationThread(channelThreadId: string): Promise<Array<{ externalMessageId: string; content: string }>>;
}

export interface RateLimiterPort {
  checkOrThrow(tenantId: string, channel: ChannelType): Promise<void>;
}

export interface IdempotencyPort {
  hasProcessed(scope: string, key: string): Promise<boolean>;
  markProcessed(scope: string, key: string): Promise<void>;
}

export interface OutboundCommandPort {
  createOutboundMessageAndOutbox(input: {
    tenantId: string;
    leadId: string;
    conversationId: string;
    channel: ChannelType;
    channelThreadId: string;
    content: string;
    messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
    mediaUrl?: string;
    previewUrl?: string;
    mediaMimeType?: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    fileName?: string;
    fileSizeBytes?: number;
    width?: number;
    height?: number;
  }): Promise<{ messageId: string }>;
}
