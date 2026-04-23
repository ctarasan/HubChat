import { buildEventCounts, type LoadProfile } from "./scenarios.js";

export type ValidationProfileName = "low" | "medium" | "high";

export interface ValidationSLO {
  queueLagMsP95Max: number;
  outboxLagMsP95Max: number;
  webhookLatencyMsP95Max: number;
  webhookLatencyMsP99Max: number;
  outboundLatencyMsP95Max: number;
  outboundLatencyMsP99Max: number;
  retryRateMax: number;
  deadLetterRateMax: number;
}

export interface ValidationProfile {
  name: ValidationProfileName;
  idleConnectedUsers: number;
  workload: LoadProfile;
  slo: ValidationSLO;
}

const profiles: Record<ValidationProfileName, ValidationProfile> = {
  low: {
    name: "low",
    idleConnectedUsers: 1500,
    workload: {
      inboundBurstEvents: 200,
      outboundSustainedPerMinute: 300,
      duplicateRate: 0.03,
      durationMinutes: 10
    },
    slo: {
      queueLagMsP95Max: 10_000,
      outboxLagMsP95Max: 8_000,
      webhookLatencyMsP95Max: 600,
      webhookLatencyMsP99Max: 1_200,
      outboundLatencyMsP95Max: 2_000,
      outboundLatencyMsP99Max: 5_000,
      retryRateMax: 0.05,
      deadLetterRateMax: 0.001
    }
  },
  medium: {
    name: "medium",
    idleConnectedUsers: 3000,
    workload: {
      inboundBurstEvents: 500,
      outboundSustainedPerMinute: 800,
      duplicateRate: 0.05,
      durationMinutes: 15
    },
    slo: {
      queueLagMsP95Max: 20_000,
      outboxLagMsP95Max: 15_000,
      webhookLatencyMsP95Max: 800,
      webhookLatencyMsP99Max: 1_800,
      outboundLatencyMsP95Max: 3_000,
      outboundLatencyMsP99Max: 8_000,
      retryRateMax: 0.08,
      deadLetterRateMax: 0.003
    }
  },
  high: {
    name: "high",
    idleConnectedUsers: 5000,
    workload: {
      inboundBurstEvents: 1000,
      outboundSustainedPerMinute: 1400,
      duplicateRate: 0.08,
      durationMinutes: 20
    },
    slo: {
      queueLagMsP95Max: 30_000,
      outboxLagMsP95Max: 25_000,
      webhookLatencyMsP95Max: 1_200,
      webhookLatencyMsP99Max: 2_500,
      outboundLatencyMsP95Max: 5_000,
      outboundLatencyMsP99Max: 12_000,
      retryRateMax: 0.12,
      deadLetterRateMax: 0.005
    }
  }
};

export function getValidationProfile(name: string | undefined): ValidationProfile {
  const key = (name ?? "medium").toLowerCase() as ValidationProfileName;
  return profiles[key] ?? profiles.medium;
}

export function toExecutionCounts(name: string | undefined) {
  const profile = getValidationProfile(name);
  return {
    profile,
    counts: buildEventCounts(profile.workload)
  };
}
