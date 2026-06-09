"use client";

import {
  connectionScopeBucketChipClassName,
  resolveConnectionLabelDescriptor,
  type ConnectionScopeRowInput
} from "./channelConnectionScopeModel.js";

export function ChannelConnectionLabel({
  input,
  includeDisconnectedChannels = false,
  emphasizeScopeBucket = false
}: {
  input: ConnectionScopeRowInput;
  includeDisconnectedChannels?: boolean;
  emphasizeScopeBucket?: boolean;
}) {
  const descriptor = resolveConnectionLabelDescriptor(input, {
    includeDisconnectedChannels,
    emphasizeScopeBucket
  });
  return (
    <span className="channel-connection-label-wrap" data-testid="channel-connection-label-wrap">
      <span
        className={descriptor.className}
        data-testid={descriptor.testId}
        title={descriptor.label}
      >
        {descriptor.label}
      </span>
      {descriptor.showScopeBucketChip && descriptor.scopeBucketChipLabel ? (
        <span
          className={connectionScopeBucketChipClassName(descriptor.bucket)}
          data-testid={`channel-connection-scope-chip-${descriptor.bucket}`}
        >
          {descriptor.scopeBucketChipLabel}
        </span>
      ) : null}
    </span>
  );
}
