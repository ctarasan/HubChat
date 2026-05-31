import { z } from "zod";
import { SLA_POLICY_RULE_KEYS } from "../../domain/tenantSlaPolicy.js";

const SlaPolicyRuleSchema = z
  .object({
    enabled: z.boolean(),
    targetMinutes: z.number().int().nullable(),
    warningBeforeBreachMinutes: z.number().int().nullable(),
    label: z.string()
  })
  .strict();

const rulesShape = Object.fromEntries(
  SLA_POLICY_RULE_KEYS.map((key) => [key, SlaPolicyRuleSchema])
) as Record<(typeof SLA_POLICY_RULE_KEYS)[number], typeof SlaPolicyRuleSchema>;

export const PatchSlaPolicyBodySchema = z
  .object({
    version: z.number().int().min(0),
    enabled: z.boolean(),
    warningBeforeBreachMinutes: z.number().int().positive(),
    excludeResolved: z.boolean(),
    excludeArchived: z.boolean(),
    rules: z.object(rulesShape).strict()
  })
  .strict();

export type PatchSlaPolicyBody = z.infer<typeof PatchSlaPolicyBodySchema>;

export function rejectDeferredPatchFields(body: Record<string, unknown>): string | null {
  for (const key of ["businessHours", "channelOverrides", "auditHistory"] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return `Field not supported: ${key}`;
    }
  }
  return null;
}
