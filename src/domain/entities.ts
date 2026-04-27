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
  | "LOST";

export type ConversationStatus = "OPEN" | "PENDING" | "CLOSED";
export type ProviderThreadType = "MESSENGER_DM" | "FACEBOOK_COMMENT";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type SenderType = "CUSTOMER" | "SALES" | "SYSTEM";
export type SalesRole = "SALES" | "MANAGER" | "ADMIN";

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
  metadataJson?: Record<string, unknown>;
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
  NEW: ["ASSIGNED", "LOST"],
  ASSIGNED: ["CONTACTED", "LOST"],
  CONTACTED: ["QUALIFIED", "LOST"],
  QUALIFIED: ["PROPOSAL_SENT", "LOST"],
  PROPOSAL_SENT: ["NEGOTIATION", "LOST"],
  NEGOTIATION: ["WON", "LOST"],
  WON: [],
  LOST: []
};

export function assertValidLeadStatusTransition(from: LeadStatus, to: LeadStatus): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    throw new Error(`Invalid lead status transition: ${from} -> ${to}`);
  }
}
