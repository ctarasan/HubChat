"use client";

import {
  disconnectedChannelChipClassName,
  disconnectedChannelChipLabel,
  resolveConnectionLabelDescriptor,
  type ConnectionScopeRowInput
} from "./channelConnectionScopeModel.js";

export function ChannelConnectionLabel({
  input,
  includeDisconnectedChannels = false
}: {
  input: ConnectionScopeRowInput;
  includeDisconnectedChannels?: boolean;
}) {
  const descriptor = resolveConnectionLabelDescriptor(input, { includeDisconnectedChannels });
  return (
    <span className="channel-connection-label-wrap" data-testid="channel-connection-label-wrap">
      <span
        className={descriptor.className}
        data-testid={descriptor.testId}
        title={descriptor.label}
      >
        {descriptor.label}
      </span>
      {descriptor.showDisconnectedChip ? (
        <span
          className={disconnectedChannelChipClassName()}
          data-testid="channel-connection-disconnected-chip"
        >
          {disconnectedChannelChipLabel()}
        </span>
      ) : null}
    </span>
  );
}
