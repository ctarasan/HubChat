export interface LoadProfile {
  inboundBurstEvents: number;
  outboundSustainedPerMinute: number;
  duplicateRate: number;
  durationMinutes: number;
}

export function createDefaultProfile(): LoadProfile {
  return {
    inboundBurstEvents: 300,
    outboundSustainedPerMinute: 1200,
    duplicateRate: 0.05,
    durationMinutes: 10
  };
}

export function buildEventCounts(profile: LoadProfile) {
  const totalOutbound = profile.outboundSustainedPerMinute * profile.durationMinutes;
  const duplicateInbound = Math.floor(profile.inboundBurstEvents * profile.duplicateRate);
  const duplicateOutbound = Math.floor(totalOutbound * profile.duplicateRate);
  return {
    inboundBurstEvents: profile.inboundBurstEvents,
    outboundSustainedEvents: totalOutbound,
    duplicateInbound,
    duplicateOutbound
  };
}
