import type {
  ChannelConnectionPublicDto,
  ChannelConnectionRecord,
  ChannelConnectProvider,
  ChannelCredentialMetadataDto,
  ChannelCredentialRuntimeSecret,
  ChannelCredentialType,
  CreateChannelConnectionInput,
  FindChannelConnectionByAccountInput,
  StoreChannelCredentialInput,
  UpdateChannelConnectHealthInput,
  UpdateChannelConnectionLifecycleInput,
  UpdateChannelConnectionWebhookInput
} from "./channelConnections.js";
import type {
  ChannelRuntimeConfig,
  ChannelSettingPublicDto,
  SupportedChannelSettingChannel,
  UpdateChannelConnectionHealthInput,
  UpdateChannelSettingInput
} from "./channelSettings.js";
import type { ChannelType, Contact, Conversation, ConversationStatus, Lead, LeadStatus, Message, UUID } from "./entities.js";

export type ConversationEventType =
  | "CONVERSATION_ASSIGNED"
  | "CONVERSATION_REASSIGNED"
  | "CONVERSATION_UNASSIGNED"
  | "CONVERSATION_STATUS_CHANGED"
  | "CONVERSATION_LEAD_STATUS_CHANGED";

export interface ConversationForAssignment {
  id: UUID;
  tenantId: UUID;
  leadId: UUID | null;
  assignedAgentId: UUID | null;
  assignmentStatus: string;
  status: ConversationStatus;
}

export interface ConversationAssignmentStore {
  findByIdForAssignment(tenantId: UUID, conversationId: UUID): Promise<ConversationForAssignment | null>;
  updateAssignment(input: {
    tenantId: UUID;
    conversationId: UUID;
    assignedAgentId: UUID | null;
    assignmentStatus: "ASSIGNED" | "REASSIGNED" | "UNASSIGNED_AGAIN";
  }): Promise<void>;
}

export interface ConversationEventRepository {
  create(input: {
    tenantId: UUID;
    conversationId: UUID;
    leadId: UUID | null;
    actorSalesAgentId: UUID | null;
    actorAuthUserId: UUID | null;
    eventType: ConversationEventType;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    metadataJson: Record<string, unknown>;
    note: string | null;
  }): Promise<void>;
}

export interface MarketingEventRepository {
  insert(input: import("./marketingEvents.js").CreateMarketingEventInput): Promise<void>;
  list(input: {
    tenantId: UUID;
    leadId?: UUID;
    conversationId?: UUID;
    eventType?: import("./marketingEvents.js").MarketingEventType;
    limit: number;
    cursor?: string;
  }): Promise<{ items: import("./marketingEvents.js").MarketingEventRecord[]; nextCursor: string | null }>;
}

export interface MarketingAutomationBridgeOutboxRepository {
  enqueueFromMarketingEvent(input: {
    tenantId: UUID;
    marketingEventId: UUID;
    eventType: string;
    schemaVersion: string;
    payloadJson: import("../lib/marketingAutomationBridge.js").MarketingAutomationBridgePayload;
    idempotencyKey: string;
  }): Promise<import("./marketingAutomationBridgeOutbox.js").MarketingAutomationBridgeOutboxEnqueueResult>;
  claimBatch(opts?: {
    limit?: number;
    processingTimeoutSeconds?: number;
  }): Promise<import("./marketingAutomationBridgeOutbox.js").MarketingAutomationBridgeOutboxRecord[]>;
  markSent(id: UUID): Promise<void>;
  markFailed(
    id: UUID,
    opts: {
      attemptCount: number;
      maxAttempts: number;
      error: unknown;
    }
  ): Promise<import("./marketingAutomationBridgeOutbox.js").MarketingAutomationBridgeOutboxFailureResult>;
}

export interface SalesAgentListItem {
  id: UUID;
  email: string;
  name: string;
  role: string;
  status: string;
}

export type SalesAssignmentMode = "AUTO" | "MANUAL_ONLY" | "PAUSED";

export type TeamMemberRole = "SALES" | "MANAGER" | "ADMIN";

export interface TeamMemberRow {
  id: UUID;
  tenantId: UUID;
  name: string;
  email: string;
  role: string;
  status: string;
  assignmentEnabled: boolean;
  assignmentMode: SalesAssignmentMode;
  maxActiveConversations: number | null;
  maxActiveLeads: number | null;
  activeConversationCount: number;
  activeLeadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalesAgentListByTenantInput {
  tenantId: UUID;
  includeInactive?: boolean;
  role?: TeamMemberRole;
  status?: "ACTIVE" | "INACTIVE";
  assignmentMode?: SalesAssignmentMode;
  /** Substring match on name or email (case-insensitive) */
  search?: string;
}

export interface CreateSalesAgentInput {
  tenantId: UUID;
  name: string;
  email: string;
  role: TeamMemberRole;
  status?: "ACTIVE" | "INACTIVE";
  assignmentEnabled?: boolean;
  assignmentMode?: SalesAssignmentMode;
  maxActiveConversations?: number | null;
  maxActiveLeads?: number | null;
}

export interface PatchSalesAgentInput {
  tenantId: UUID;
  salesAgentId: UUID;
  patch: {
    name?: string;
    email?: string;
    role?: TeamMemberRole;
    status?: "ACTIVE" | "INACTIVE";
    assignmentEnabled?: boolean;
    assignmentMode?: SalesAssignmentMode;
    maxActiveConversations?: number | null;
    maxActiveLeads?: number | null;
  };
}

export interface SalesAgentRepository {
  findActiveByIdInTenant(tenantId: UUID, salesAgentId: UUID): Promise<boolean>;
  listActiveByTenant(tenantId: UUID): Promise<SalesAgentListItem[]>;
  listByTenant(input: SalesAgentListByTenantInput): Promise<TeamMemberRow[]>;
  findByIdInTenant(tenantId: UUID, salesAgentId: UUID): Promise<TeamMemberRow | null>;
  findByEmailInTenant(tenantId: UUID, email: string): Promise<{ id: UUID } | null>;
  create(input: CreateSalesAgentInput): Promise<TeamMemberRow>;
  update(input: PatchSalesAgentInput): Promise<TeamMemberRow>;
  countActiveAdmins(tenantId: UUID): Promise<number>;
}

export interface QueuePort {
  enqueue<T>(topic: string, event: T, opts?: { runAt?: Date; idempotencyKey?: string; tenantId?: string }): Promise<void>;
  claimBatch<T>(
    topic: string,
    opts?: { limit?: number; processingTimeoutSeconds?: number }
  ): Promise<Array<QueueClaimedJob<T>>>;
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
  findById(tenantId: UUID, leadId: UUID): Promise<Lead | null>;
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
  findById?(tenantId: UUID, conversationId: UUID): Promise<Conversation | null>;
  /**
   * Single conversation in the same row shape as `list` (inbox list columns),
   * used by the Pipeline → Inbox deep link (PL-NAV-1). Tenant-scoped; null when absent.
   */
  findInboxListItemById?(tenantId: UUID, conversationId: UUID): Promise<Record<string, unknown> | null>;
  findFacebookMessengerDmByParticipant?(input: {
    tenantId: UUID;
    providerPageId: string;
    providerExternalUserId: string;
  }): Promise<Conversation | null>;
  findLatestFacebookCommentByParticipant?(input: {
    tenantId: UUID;
    providerPageId: string;
    providerExternalUserId: string;
  }): Promise<Conversation | null>;
  findLatestFacebookCommentByLead?(input: {
    tenantId: UUID;
    leadId: UUID;
    providerPageId?: string;
  }): Promise<Conversation | null>;
  create(data: Omit<Conversation, "id">): Promise<Conversation>;
  touchLastMessage(conversationId: UUID, at: Date, opts?: {
    participantDisplayName?: string | null;
    participantProfileImageUrl?: string | null;
    incrementUnreadCount?: boolean;
    lastMessagePreview?: string | null;
    lastMessageType?: string | null;
    /** When set, persists `conversations.last_customer_message_at` (inbound customer message). */
    lastCustomerMessageAt?: Date;
    /** When set, starts or refreshes the first-response SLA clock (`conversations.sla_due_at`). */
    slaDueAt?: Date;
    /** When true and conversation is RESOLVED, reopens to OPEN and clears `resolved_at`. */
    reopenFromResolved?: boolean;
  }): Promise<void>;
  recordAgentOutboundSent?(input: { tenantId: UUID; conversationId: UUID; sentAt: Date }): Promise<void>;
  updateInstagramProviderContext?(input: {
    tenantId: UUID;
    conversationId: UUID;
    providerPageId: string;
  }): Promise<void>;
  markAsRead(input: { tenantId: UUID; conversationId: UUID }): Promise<void>;
  markFacebookCommentPrivateReplySent?(input: {
    tenantId: UUID;
    conversationId: UUID;
    privateReplyCommentId: string;
    convertedToDm: boolean;
    nextChannelThreadId?: string | null;
  }): Promise<void>;
  markInstagramCommentPrivateReplySent?(input: {
    tenantId: UUID;
    conversationId: UUID;
    privateReplyCommentId: string;
  }): Promise<void>;
  markFacebookPublicReplySent?(conversationId: UUID): Promise<void>;
  list(input: {
    tenantId: string;
    status?: string;
    channel?: string;
    /** Filter by assigned sales agent id (Manager team drill-down). */
    assignedAgentId?: string;
    /** @deprecated use assignedAgentId */
    assignedSalesId?: string;
    /** Team Inbox assignment filter (tenant-scoped; applied in repository). */
    assignmentFilter?: "none" | "unassigned" | "team" | { assignedToAgentId: string };
    /** Phase II-D2.1: SLA / follow-up / lead management / waiting filters (server-side before pagination). */
    inboxFilters?: import("../interfaces/api/conversationListInboxFilters.js").ConversationListInboxFilters;
    /** UTC clock for inbox filter bounds; due-soon upper bound uses tenant policy warning minutes when set at route. */
    inboxFilterClock?: import("../interfaces/api/conversationListInboxFilters.js").UtcInboxFilterClock;
    limit: number;
    cursor?: string;
  }): Promise<{ items: any[]; nextCursor: string | null }>;
  /** Leads menu list: conversation rows joined to lead + owner (read-only). */
  listForLeadsMenu?(input: {
    tenantId: string;
    channel?: string;
    leadStatus?: string;
    assignmentFilter?: "none" | "unassigned" | "team" | { assignedToAgentId: string };
    inboxFilters?: import("../interfaces/api/conversationListInboxFilters.js").ConversationListInboxFilters;
    inboxFilterClock?: import("../interfaces/api/conversationListInboxFilters.js").UtcInboxFilterClock;
    search?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: any[]; nextCursor: string | null }>;
  updateConversationStatus?(input: {
    tenantId: UUID;
    conversationId: UUID;
    status: ConversationStatus;
    resolvedAtIso: string | null;
  }): Promise<void>;
  /** Partial update: only include keys to change; `null` clears `follow_up_*` in DB. */
  updateConversationFollowUp?(input: {
    tenantId: UUID;
    conversationId: UUID;
    patch: { followUpAt?: Date | null; followUpNote?: string | null };
  }): Promise<void>;
}

/** Persisted on `messages.metadata_json` for failed outbound sends (Dashboard). */
export interface MessageDeliveryFailurePayload {
  userFacingMessage: string;
  deliveryErrorCode: string;
  technicalReason?: string;
}

export type MessageDeliverySnapshot = {
  externalMessageId: string | null;
  deliveryStatus: "PENDING" | "SENT" | "FAILED";
};

export interface MessageRepository {
  create(data: Omit<Message, "id" | "createdAt">): Promise<Message>;
  /** After provider send succeeds; optional externalMessageId is persisted when the channel returns one. */
  markSent(messageId: UUID, externalMessageId?: string | null): Promise<void>;
  markFailed(messageId: UUID, failure: string | MessageDeliveryFailurePayload): Promise<void>;
  /** Read delivery fields for outbound idempotency reconciliation (optional for tests/mocks). */
  getDeliverySnapshot?(messageId: UUID): Promise<MessageDeliverySnapshot | null>;
  listByConversation(input: {
    tenantId: string;
    conversationId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: Message[]; nextCursor: string | null }>;
  /** Timeline fetch across one or more threads (e.g. grouped lead); newest-first cursor. */
  listByConversationIds?(input: {
    tenantId: string;
    conversationIds: string[];
    limit: number;
    cursor?: string;
  }): Promise<{ items: Message[]; nextCursor: string | null }>;
  /** Latest inbound source post metadata per conversation (bounded list bridge; no Graph). */
  findLatestInboundSourcePostMetadataByConversationIds?(input: {
    tenantId: string;
    conversationIds: string[];
  }): Promise<Map<string, Record<string, unknown>>>;
}

export interface ChannelAccountRepository {
  findByTenantAndChannel(tenantId: UUID, channel: ChannelType): Promise<{ id: UUID } | null>;
}

export interface ContactRepository {
  getOrCreateByIdentity(input: {
    tenantId: UUID;
    channel: ChannelType;
    externalUserId: string;
    profile?: { name?: string; phone?: string; email?: string; avatarUrl?: string; profileImageUrl?: string };
  }): Promise<Contact>;
  upsertIdentityProfile(input: {
    tenantId: UUID;
    channel: ChannelType;
    externalUserId: string;
    displayName?: string | null;
    profileImageUrl?: string | null;
    profile?: {
      name?: string;
      phone?: string;
      email?: string;
      avatarUrl?: string;
      profileImageUrl?: string;
    };
  }): Promise<{
    contactId: string | null;
    contactIdentityId: string | null;
    displayName: string | null;
    profileImageUrl: string | null;
  }>;
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
    messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
    mediaUrl?: string | null;
    previewUrl?: string | null;
    lineMessageId?: string | null;
    metadataJson?: Record<string, unknown>;
    occurredAt: string;
    profile?: { name?: string; phone?: string; email?: string; avatarUrl?: string; profileImageUrl?: string };
    profileDiagnostics?: { profileLookupAttempted: boolean; profileLookupSucceeded: boolean };
  }>;
  sendMessage(input: {
    pageId?: string | null;
    channelThreadId: string;
    providerExternalUserId?: string | null;
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
    /** Optional correlation for channel-specific logging (e.g. Instagram outbound). */
    outboundDebugContext?: { messageId: string; conversationId: string };
  }): Promise<{ externalMessageId: string }>;
  sendPrivateReply?(input: {
    pageId?: string | null;
    commentId: string;
    content: string;
    idempotencyKey: string;
    messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
  }): Promise<{ externalMessageId: string }>;
  sendPublicCommentReply?(input: {
    pageId: string;
    commentId: string;
    text: string;
  }): Promise<{ externalMessageId: string }>;
  fetchUserProfile(externalUserId: string): Promise<{
    name?: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    profileImageUrl?: string;
  }>;
  fetchConversationThread(channelThreadId: string): Promise<Array<{ externalMessageId: string; content: string }>>;
}

export interface RateLimiterPort {
  checkOrThrow(tenantId: string, channel: ChannelType): Promise<void>;
}

export interface IdempotencyPort {
  hasProcessed(scope: string, key: string): Promise<boolean>;
  markProcessed(scope: string, key: string): Promise<void>;
  /** Clears in-flight PROCESSING lock so queue retries can call the provider again. */
  releaseProcessing?(scope: string, key: string): Promise<void>;
}

export interface ChannelConnectionRepository {
  createConnection(input: CreateChannelConnectionInput): Promise<ChannelConnectionRecord>;
  listByTenant(tenantId: string): Promise<ChannelConnectionRecord[]>;
  findById(tenantId: string, connectionId: string): Promise<ChannelConnectionRecord | null>;
  findByTenantAndProvider(
    tenantId: string,
    provider: ChannelConnectProvider
  ): Promise<ChannelConnectionRecord | null>;
  findByTenantProviderAccount(
    input: FindChannelConnectionByAccountInput
  ): Promise<ChannelConnectionRecord | null>;
  findByPublicConnectionKey(publicConnectionKey: string): Promise<ChannelConnectionRecord | null>;
  updateLifecycleStatus(input: UpdateChannelConnectionLifecycleInput): Promise<ChannelConnectionRecord>;
  updateWebhookStatus(input: UpdateChannelConnectionWebhookInput): Promise<ChannelConnectionRecord>;
  updateHealthFields(input: UpdateChannelConnectHealthInput): Promise<ChannelConnectionRecord>;
  findPublicConnectionSummary(tenantId: string, connectionId: string): Promise<ChannelConnectionPublicDto | null>;
  listCredentialMetadataByConnection(
    tenantId: string,
    connectionId: string
  ): Promise<ChannelCredentialMetadataDto[]>;
  storeEncryptedCredential(input: StoreChannelCredentialInput): Promise<ChannelCredentialMetadataDto>;
  /** Internal runtime resolver only — never expose via HTTP API. */
  retrieveDecryptedCredentialForRuntime(input: {
    tenantId: string;
    connectionId: string;
    credentialType: ChannelCredentialType;
  }): Promise<ChannelCredentialRuntimeSecret | null>;
}

export interface ChannelSettingRepository {
  listByTenant(tenantId: string): Promise<ChannelSettingPublicDto[]>;
  findByTenantAndChannel(
    tenantId: string,
    channel: SupportedChannelSettingChannel
  ): Promise<ChannelSettingPublicDto | null>;
  upsertForTenant(input: UpdateChannelSettingInput): Promise<ChannelSettingPublicDto>;
  getRuntimeConfig(input: {
    tenantId: string;
    channel: SupportedChannelSettingChannel;
  }): Promise<ChannelRuntimeConfig | null>;
  getRuntimeConfigForConnectionTest(input: {
    tenantId: string;
    channel: SupportedChannelSettingChannel;
  }): Promise<ChannelRuntimeConfig | null>;
  updateConnectionHealth(input: UpdateChannelConnectionHealthInput): Promise<ChannelSettingPublicDto>;
}

export type { SlaPolicyRepository } from "./slaPolicyApi.js";

export interface OutboundCommandPort {
  createOutboundMessageAndOutbox(input: {
    tenantId: string;
    leadId: string;
    conversationId: string;
    conversationIds?: string[];
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
