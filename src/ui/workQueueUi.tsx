"use client";

import { useEffect, useState } from "react";
import type { WorkflowChannel, WorkflowFollowUpItemDto, WorkflowFollowUpItemStatus } from "../domain/workflow.js";
import { WorkQueueIcon } from "./workQueueIcons.js";
import {
  WORK_QUEUE_CUSTOMER_REPLIED_COPY,
  buildWorkQueueInboxHref,
  formatAssignedAgentDisplay,
  formatWorkflowDueAt,
  leadManagementStatusDisplay,
  resolveWorkQueueCustomerAvatarPlan,
  workQueueChannelVisual,
  workQueueStatusVisual,
  type WorkQueueSummaryCard
} from "./workQueueModel.js";

export function WorkQueueStatusBadge({ status }: { status: WorkflowFollowUpItemStatus }) {
  const visual = workQueueStatusVisual(status);
  return (
    <span className={visual.badgeClassName} data-testid={visual.statusTestId}>
      <WorkQueueIcon name={visual.iconName} className={`work-queue-status-icon work-queue-status-icon-${visual.tone}`} />
      <span>{visual.label}</span>
    </span>
  );
}

export function WorkQueueChannelBadge({ channel }: { channel: WorkflowChannel }) {
  const visual = workQueueChannelVisual(channel);
  return (
    <span className={visual.badgeClassName} data-testid={visual.channelTestId}>
      <span className="work-queue-channel-dot" aria-hidden="true" />
      <span>{visual.label}</span>
    </span>
  );
}

export function WorkQueueMetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="work-queue-meta-chip">
      <span className="work-queue-meta-chip-label">{label}</span>
      <span className="work-queue-meta-chip-value">{value}</span>
    </span>
  );
}

export function WorkQueueCustomerRepliedChip({ conversationId }: { conversationId: string }) {
  return (
    <p
      className="work-queue-customer-replied-chip"
      data-testid="work-queue-customer-replied"
      data-conversation-id={conversationId}
    >
      <WorkQueueIcon name="message-circle" className="work-queue-customer-replied-icon" />
      <span>{WORK_QUEUE_CUSTOMER_REPLIED_COPY}</span>
    </p>
  );
}

export function WorkQueueCustomerAvatar({
  displayName,
  profileImageUrl,
  conversationId
}: {
  displayName: string;
  profileImageUrl: string | null | undefined;
  conversationId: string;
}) {
  const [broken, setBroken] = useState(false);
  const plan = resolveWorkQueueCustomerAvatarPlan(displayName, profileImageUrl);
  const imageUrl = plan.kind === "image" ? plan.url : null;
  useEffect(() => {
    setBroken(false);
  }, [imageUrl]);

  if (imageUrl && !broken) {
    return (
      <img
        className="work-queue-avatar work-queue-avatar-img"
        src={imageUrl}
        alt=""
        referrerPolicy="no-referrer"
        data-testid={`work-queue-avatar-img-${conversationId}`}
        onError={() => setBroken(true)}
      />
    );
  }

  if (plan.kind === "initials") {
    return (
      <span
        className="work-queue-avatar work-queue-avatar-fallback work-queue-avatar-initials"
        aria-hidden="true"
        data-testid={`work-queue-avatar-fallback-${conversationId}`}
      >
        {plan.initials}
      </span>
    );
  }

  return (
    <span
      className="work-queue-avatar work-queue-avatar-fallback work-queue-avatar-generic"
      aria-hidden="true"
      data-testid={`work-queue-avatar-fallback-${conversationId}`}
    >
      ◎
    </span>
  );
}

export function WorkQueueSummaryCardButton({
  card,
  active,
  onClick
}: {
  card: WorkQueueSummaryCard;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`card analytics-summary-card ${card.cardClassName}${active ? " work-queue-summary-card-active" : ""}`}
      data-testid={card.summaryTestId}
      onClick={onClick}
    >
      <span className={`work-queue-summary-icon-wrap work-queue-summary-icon-${card.severity}`}>
        <WorkQueueIcon name={card.iconName} className="work-queue-summary-icon" />
      </span>
      <span className="analytics-summary-label">{card.label}</span>
      <span className="analytics-summary-value">{card.count}</span>
      <span className="hint work-queue-summary-hint">{card.hint}</span>
    </button>
  );
}

export function WorkQueueItemCard({ item }: { item: WorkflowFollowUpItemDto }) {
  const visual = workQueueStatusVisual(item.status);
  return (
    <li
      className={`work-queue-item-card ${visual.rowClassName}`}
      data-testid={`work-queue-row-${item.conversationId}`}
    >
      <div className="work-queue-row-accent" aria-hidden="true" />
      <div className="work-queue-row-body">
        <div className="work-queue-item-head">
          <div className="work-queue-item-title-block">
            <div className="work-queue-customer-header">
              <WorkQueueCustomerAvatar
                displayName={item.customerDisplayName}
                profileImageUrl={item.customerProfileImageUrl}
                conversationId={item.conversationId}
              />
              <div className="work-queue-customer-main">
                <div className="work-queue-item-title-row">
                  <span className="work-queue-customer-name">{item.customerDisplayName}</span>
                  <WorkQueueChannelBadge channel={item.channelType} />
                  <WorkQueueStatusBadge status={item.status} />
                </div>
                <div className="work-queue-item-chip-row">
                  {item.leadManagementStatus ? (
                    <WorkQueueMetaChip label="Lead" value={leadManagementStatusDisplay(item.leadManagementStatus)} />
                  ) : null}
                  <WorkQueueMetaChip label="Conversation" value={item.conversationStatus} />
                </div>
              </div>
            </div>
          </div>
          <a
            href={buildWorkQueueInboxHref(item.conversationId)}
            className="work-queue-open-inbox work-queue-open-inbox-primary"
            data-testid={`work-queue-open-inbox-${item.conversationId}`}
          >
            <WorkQueueIcon name="external-link" className="work-queue-open-inbox-icon" />
            <span>Open inbox</span>
          </a>
        </div>

        <p className="work-queue-reason" data-testid={`work-queue-reason-${item.conversationId}`}>
          {item.reasonLabel}
        </p>

        {item.flags.customerRepliedAfterFollowUp ? (
          <WorkQueueCustomerRepliedChip conversationId={item.conversationId} />
        ) : null}

        <dl className="work-queue-item-meta">
          <div>
            <dt>Due</dt>
            <dd data-testid={`work-queue-due-${item.conversationId}`}>{formatWorkflowDueAt(item.dueAt)}</dd>
          </div>
          <div>
            <dt>Assigned</dt>
            <dd>{formatAssignedAgentDisplay(item.assignedAgentDisplayName)}</dd>
          </div>
        </dl>
      </div>
    </li>
  );
}
