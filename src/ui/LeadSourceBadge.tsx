"use client";

import {
  resolveLeadSourceBadge,
  type LeadSourceBadgeDescriptor,
  type LeadSourceBadgeInput
} from "./leadSourceBadgeModel.js";

export function LeadSourceBadge({
  input,
  badge
}: {
  input?: LeadSourceBadgeInput;
  badge?: LeadSourceBadgeDescriptor;
}) {
  const resolved = badge ?? resolveLeadSourceBadge(input ?? {});
  return (
    <span className={resolved.className} data-testid={resolved.testId} title={resolved.label}>
      {resolved.label}
    </span>
  );
}
