import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";

export type FacebookActivationTargetDto = {
  connectionId: string;
  connectionStatus: string;
  providerPageId: string | null;
  providerPageName: string | null;
  publicConnectionKey: string;
};

export function isEligibleFacebookActivationTarget(connection: ChannelConnectionRecord): boolean {
  if (connection.provider !== "FACEBOOK") return false;
  if (connection.status !== "READY") return false;
  const identity = (connection.providerPageId ?? connection.providerAccountId ?? "").trim();
  return identity.length > 0;
}

export function toFacebookActivationTargetDto(
  connection: ChannelConnectionRecord
): FacebookActivationTargetDto {
  return {
    connectionId: connection.id,
    connectionStatus: connection.status,
    providerPageId: connection.providerPageId,
    providerPageName: connection.providerAccountName,
    publicConnectionKey: connection.publicConnectionKey
  };
}

export function listEligibleFacebookActivationTargets(
  connections: ChannelConnectionRecord[]
): FacebookActivationTargetDto[] {
  return connections
    .filter(isEligibleFacebookActivationTarget)
    .map(toFacebookActivationTargetDto);
}
