import type { ChannelType, Lead } from "../../domain/entities.js";
import type { LeadAssignmentRepository, LeadEventRepository, LeadRepository } from "../../domain/ports.js";

type LeadEventName =
  | "hubchat.lead.created"
  | "hubchat.lead.assigned"
  | "hubchat.lead.reassigned"
  | "hubchat.lead.unassigned"
  | "hubchat.lead.closed"
  | "hubchat.message.received"
  | "hubchat.message.sent"
  | "hubchat.message.failed";

export async function createLeadEvent(
  leadEventRepository: LeadEventRepository | undefined,
  input: {
    tenantId: string;
    leadId: string;
    eventName: LeadEventName;
    eventPayload?: Record<string, unknown>;
    occurredAt?: Date;
    createdByUserId?: string | null;
  }
): Promise<void> {
  if (!leadEventRepository) return;
  await leadEventRepository.create({
    tenantId: input.tenantId,
    leadId: input.leadId,
    eventName: input.eventName,
    eventPayload: input.eventPayload,
    occurredAt: input.occurredAt,
    createdByUserId: input.createdByUserId ?? null
  });
}

export async function createLeadEventBestEffort(
  leadEventRepository: LeadEventRepository | undefined,
  input: {
    tenantId: string;
    leadId: string;
    eventName: LeadEventName;
    eventPayload?: Record<string, unknown>;
    occurredAt?: Date;
    createdByUserId?: string | null;
  },
  onError: (error: unknown) => void
): Promise<void> {
  try {
    await createLeadEvent(leadEventRepository, input);
  } catch (error) {
    onError(error);
  }
}

export async function ensureLeadForConversation(input: {
  leadRepository: LeadRepository;
  leadEventRepository?: LeadEventRepository;
  tenantId: string;
  sourceChannel: ChannelType;
  externalUserId: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  occurredAt?: Date;
}): Promise<{ lead: Lead; created: boolean }> {
  const existing = await input.leadRepository.findByExternalUser(input.tenantId, input.sourceChannel, input.externalUserId);
  if (existing) return { lead: existing, created: false };

  const createdAt = input.occurredAt ?? new Date();
  const lead = await input.leadRepository.create({
    tenantId: input.tenantId,
    sourceChannel: input.sourceChannel,
    externalUserId: input.externalUserId,
    name: input.name ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    status: "UNASSIGNED",
    assignedSalesId: null,
    lastContactAt: createdAt,
    leadScore: null,
    tags: []
  });
  await createLeadEvent(input.leadEventRepository, {
    tenantId: input.tenantId,
    leadId: lead.id,
    eventName: "hubchat.lead.created",
    eventPayload: {
      sourceChannel: input.sourceChannel,
      externalUserId: input.externalUserId
    },
    occurredAt: createdAt
  });
  return { lead, created: true };
}

export async function assignLead(input: {
  leadRepository: LeadRepository;
  leadAssignmentRepository?: LeadAssignmentRepository;
  leadEventRepository?: LeadEventRepository;
  tenantId: string;
  leadId: string;
  toUserId: string;
  assignedByUserId?: string | null;
  reason?: string | null;
  fromUserId?: string | null;
}): Promise<void> {
  await input.leadRepository.assign(input.leadId, input.toUserId);
  await input.leadRepository.updateStatus(input.leadId, "ASSIGNED");
  if (input.leadAssignmentRepository) {
    await input.leadAssignmentRepository.create({
      tenantId: input.tenantId,
      leadId: input.leadId,
      fromUserId: input.fromUserId ?? null,
      toUserId: input.toUserId,
      assignedByUserId: input.assignedByUserId ?? null,
      reason: input.reason ?? null
    });
  }
  await createLeadEvent(input.leadEventRepository, {
    tenantId: input.tenantId,
    leadId: input.leadId,
    eventName: input.fromUserId ? "hubchat.lead.reassigned" : "hubchat.lead.assigned",
    eventPayload: {
      fromUserId: input.fromUserId ?? null,
      toUserId: input.toUserId,
      assignedByUserId: input.assignedByUserId ?? null,
      reason: input.reason ?? null
    }
  });
}

export async function reassignLead(input: {
  leadRepository: LeadRepository;
  leadAssignmentRepository?: LeadAssignmentRepository;
  leadEventRepository?: LeadEventRepository;
  tenantId: string;
  leadId: string;
  fromUserId: string;
  toUserId: string;
  assignedByUserId?: string | null;
  reason?: string | null;
}): Promise<void> {
  await assignLead({
    ...input,
    fromUserId: input.fromUserId,
    toUserId: input.toUserId
  });
}

export async function unassignLead(input: {
  leadRepository: LeadRepository;
  leadAssignmentRepository?: LeadAssignmentRepository;
  leadEventRepository?: LeadEventRepository;
  tenantId: string;
  leadId: string;
  fromUserId?: string | null;
  assignedByUserId?: string | null;
  reason?: string | null;
}): Promise<void> {
  if (input.leadRepository.unassign) {
    await input.leadRepository.unassign(input.leadId);
  }
  await input.leadRepository.updateStatus(input.leadId, "UNASSIGNED");
  if (input.leadAssignmentRepository) {
    await input.leadAssignmentRepository.create({
      tenantId: input.tenantId,
      leadId: input.leadId,
      fromUserId: input.fromUserId ?? null,
      toUserId: null,
      assignedByUserId: input.assignedByUserId ?? null,
      reason: input.reason ?? null
    });
  }
  await createLeadEvent(input.leadEventRepository, {
    tenantId: input.tenantId,
    leadId: input.leadId,
    eventName: "hubchat.lead.unassigned",
    eventPayload: {
      fromUserId: input.fromUserId ?? null,
      assignedByUserId: input.assignedByUserId ?? null,
      reason: input.reason ?? null
    }
  });
}

export async function closeLead(input: {
  leadRepository: LeadRepository;
  leadEventRepository?: LeadEventRepository;
  tenantId: string;
  leadId: string;
  reason?: string | null;
  closedByUserId?: string | null;
}): Promise<void> {
  await input.leadRepository.updateStatus(input.leadId, "CLOSED");
  await createLeadEvent(input.leadEventRepository, {
    tenantId: input.tenantId,
    leadId: input.leadId,
    eventName: "hubchat.lead.closed",
    eventPayload: {
      reason: input.reason ?? null,
      closedByUserId: input.closedByUserId ?? null
    }
  });
}
