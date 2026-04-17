import type { ChannelType, Contact, Conversation, Lead, LeadStatus, Message, UUID } from "./entities.js";

export interface QueuePort {
  enqueue<T>(topic: string, event: T, opts?: { runAt?: Date; idempotencyKey?: string; tenantId?: string }): Promise<void>;
  consume<T>(topic: string, handler: (event: T) => Promise<void>): Promise<void>;
}

export interface LeadRepository {
  findByExternalUser(tenantId: UUID, channel: ChannelType, externalUserId: string): Promise<Lead | null>;
  create(data: Omit<Lead, "id" | "createdAt" | "updatedAt">): Promise<Lead>;
  updateStatus(leadId: UUID, status: LeadStatus): Promise<void>;
  assign(leadId: UUID, salesAgentId: UUID): Promise<void>;
}

export interface ConversationRepository {
  findByThread(tenantId: UUID, channel: ChannelType, threadId: string): Promise<Conversation | null>;
  create(data: Omit<Conversation, "id">): Promise<Conversation>;
  touchLastMessage(conversationId: UUID, at: Date): Promise<void>;
}

export interface MessageRepository {
  create(data: Omit<Message, "id" | "createdAt">): Promise<Message>;
  /** After provider send succeeds; optional externalMessageId is persisted when the channel returns one. */
  markSent(messageId: UUID, externalMessageId?: string | null): Promise<void>;
  markFailed(messageId: UUID, reason: string): Promise<void>;
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
  }>;
  sendMessage(input: { channelThreadId: string; content: string; idempotencyKey: string }): Promise<{ externalMessageId: string }>;
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
