export type UUID = string;

export type ChannelType =
  | "LINE"
  | "FACEBOOK"
  | "INSTAGRAM"
  | "TIKTOK"
  | "SHOPEE"
  | "LAZADA";

export type LeadStatus =
  | "NEW"
  | "ASSIGNED"
  | "CONTACTED"
  | "QUALIFIED"
  | "PROPOSAL_SENT"
  | "NEGOTIATION"
  | "WON"
  | "LOST"
  | "UNQUALIFIED";

export type ConversationStatus = "OPEN" | "PENDING" | "CLOSED" | "RESOLVED" | "ARCHIVED";

/** Values allowed for PATCH conversation status (UI); CLOSED remains in DB for legacy rows only. */
export type ConversationWritableStatus = "OPEN" | "PENDING" | "RESOLVED" | "ARCHIVED";
export type ProviderThreadType = "MESSENGER_DM" | "FACEBOOK_COMMENT" | "INSTAGRAM_DM";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type SenderType = "CUSTOMER" | "SALES" | "SYSTEM";
export type SalesRole = "SALES" | "MANAGER" | "ADMIN";

/** `conversations.priority` CHECK constraint values. */
export type ConversationPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

/** `conversations.assignment_status` CHECK constraint values. */
export type ConversationAssignmentStatus =
  | "UNASSIGNED"
  | "ASSIGNED"
  | "REASSIGNED"
  | "UNASSIGNED_AGAIN";

export interface Lead {
  id: UUID;
  tenantId: UUID;
  sourceChannel: ChannelType;
  externalUserId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  assignedSalesId: UUID | null;
  createdAt: Date;
  updatedAt: Date;
  lastContactAt: Date | null;
  leadScore?: number | null;
  tags: string[];
}

export interface Conversation {
  id: UUID;
  tenantId: UUID;
  leadId: UUID;
  contactId?: UUID | null;
  channelAccountId?: UUID | null;
  channelType: ChannelType;
  channelThreadId: string;
  providerThreadType?: ProviderThreadType | null;
  providerCommentId?: string | null;
  providerPostId?: string | null;
  providerPageId?: string | null;
  providerExternalUserId?: string | null;
  privateReplySentAt?: Date | null;
  privateReplyCommentId?: string | null;
  facebookPrivateReplySentAt?: Date | null;
  facebookPrivateReplyMessageId?: string | null;
  facebookPrivateReplyStatus?: string | null;
  facebookPublicReplySentAt?: Date | null;
  convertedToDmAt?: Date | null;
  participantDisplayName?: string | null;
  participantProfileImageUrl?: string | null;
  unreadCount?: number;
  lastReadAt?: Date | null;
  lastMessagePreview?: string | null;
  lastMessageType?: string | null;
  status: ConversationStatus;
  lastMessageAt: Date;
  /** Team Inbox assignee (`conversations.assigned_agent_id`). Omitted in older mocks. */
  assignedAgentId?: string | null;
  /** Set when conversation is resolved (`conversations.resolved_at`). */
  resolvedAt?: Date | null;
  /** Team Inbox priority (`conversations.priority`). */
  priority?: ConversationPriority;
  /** Team Inbox assignment lifecycle (`conversations.assignment_status`). */
  assignmentStatus?: ConversationAssignmentStatus;
  slaDueAt?: Date | null;
  followUpAt?: Date | null;
  followUpNote?: string | null;
  firstResponseAt?: Date | null;
  lastCustomerMessageAt?: Date | null;
  lastAgentMessageAt?: Date | null;
}

export interface Message {
  id: UUID;
  tenantId: UUID;
  conversationId: UUID;
  channelType: ChannelType;
  externalMessageId: string | null;
  messageType?: string;
  direction: MessageDirection;
  senderType: SenderType;
  content: string;
  mediaUrl?: string | null;
  previewUrl?: string | null;
  mediaMimeType?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  metadataJson?: Record<string, unknown>;
  occurredAt?: Date;
  createdAt: Date;
}

export interface Contact {
  id: UUID;
  tenantId: UUID;
  displayName: string | null;
  profileImageUrl?: string | null;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesAgent {
  id: UUID;
  tenantId: UUID;
  name: string;
  email: string;
  role: SalesRole;
}

export interface ActivityLog {
  id: UUID;
  tenantId: UUID;
  leadId: UUID;
  type: "MESSAGE_SENT" | "MESSAGE_RECEIVED" | "STATUS_CHANGED" | "ASSIGNED" | "NOTE_ADDED";
  metadataJson: Record<string, unknown>;
  createdAt: Date;
}

const transitions: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["ASSIGNED", "LOST", "UNQUALIFIED"],
  ASSIGNED: ["CONTACTED", "LOST", "UNQUALIFIED"],
  CONTACTED: ["QUALIFIED", "LOST", "UNQUALIFIED"],
  QUALIFIED: ["PROPOSAL_SENT", "LOST", "UNQUALIFIED"],
  PROPOSAL_SENT: ["NEGOTIATION", "LOST", "UNQUALIFIED"],
  NEGOTIATION: ["WON", "LOST", "UNQUALIFIED"],
  WON: [],
  LOST: [],
  UNQUALIFIED: []
};

export function assertValidLeadStatusTransition(from: LeadStatus, to: LeadStatus): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    throw new Error(`Invalid lead status transition: ${from} -> ${to}`);
  }
}
