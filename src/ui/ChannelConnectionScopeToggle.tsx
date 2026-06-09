"use client";

import { canShowIncludeDisconnectedToggle } from "./channelConnectionScopeModel.js";
import type { DashboardRole } from "./teamInboxDashboardHelpers.js";

export function ChannelConnectionScopeToggle({
  role,
  checked,
  onChange,
  disabled = false
}: {
  role: DashboardRole | undefined;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  if (!canShowIncludeDisconnectedToggle(role)) {
    return null;
  }

  return (
    <label
      className="channel-connection-scope-toggle"
      data-testid="channel-connection-scope-toggle"
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        data-testid="channel-connection-scope-toggle-input"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="channel-connection-scope-toggle-label">Include disconnected channels</span>
      <span className="hint channel-connection-scope-toggle-hint">
        Show conversations from previous Facebook Pages, LINE accounts, or Instagram connections.
      </span>
    </label>
  );
}
