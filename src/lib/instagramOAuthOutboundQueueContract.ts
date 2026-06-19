import { z } from "zod";
import type { InstagramCredentialBinding } from "../domain/instagramOAuthOutboundContract.js";
import { INSTAGRAM_OAUTH_OUTBOUND_QUEUE_CONTRACT_VERSION } from "../domain/instagramOAuthOutboundContract.js";
import { INSTAGRAM_OAUTH_QUEUE_PROHIBITED_FIELDS } from "../domain/instagramOAuthOutboundContract.js";
import { InstagramOAuthConfigurationError } from "./instagramOAuthResolverErrors.js";

const uuidSchema = z.string().uuid();

const prohibitedFieldSchema = z.never().optional();

const prohibitedShape = Object.fromEntries(
  INSTAGRAM_OAUTH_QUEUE_PROHIBITED_FIELDS.map((field) => [field, prohibitedFieldSchema])
) as Record<(typeof INSTAGRAM_OAUTH_QUEUE_PROHIBITED_FIELDS)[number], z.ZodOptional<z.ZodNever>>;

const legacyBindingSchema = z
  .object({
    mode: z.literal("LEGACY")
  })
  .strict();

const connectionBoundBindingSchema = z
  .object({
    mode: z.literal("CONNECTION_BOUND"),
    contractVersion: z.literal(INSTAGRAM_OAUTH_OUTBOUND_QUEUE_CONTRACT_VERSION),
    provider: z.literal("INSTAGRAM"),
    authFamily: z.literal("INSTAGRAM_BUSINESS_LOGIN"),
    deliveryPath: z.literal("DATABASE_ONLY"),
    channelConnectionId: uuidSchema,
    messageKind: z.enum(["TEXT", "IMAGE"])
  })
  .strict();

export const instagramCredentialBindingSchema = z.discriminatedUnion("mode", [
  legacyBindingSchema,
  connectionBoundBindingSchema
]);

const outboundPayloadExtensionSchema = z
  .object({
    instagramCredentialBinding: instagramCredentialBindingSchema.optional(),
    ...prohibitedShape
  })
  .strict();

export type OutboundPayloadInstagramExtension = z.infer<typeof outboundPayloadExtensionSchema>;

export function parseInstagramCredentialBindingFromPayload(
  payload: Record<string, unknown>
): InstagramCredentialBinding | null {
  for (const field of INSTAGRAM_OAUTH_QUEUE_PROHIBITED_FIELDS) {
    if (field in payload && payload[field] !== undefined) {
      throw new InstagramOAuthConfigurationError(`Prohibited outbound queue field: ${field}`);
    }
  }

  const binding = payload.instagramCredentialBinding;
  if (binding === undefined || binding === null) {
    return null;
  }

  const parsed = instagramCredentialBindingSchema.safeParse(binding);
  if (!parsed.success) {
    throw new InstagramOAuthConfigurationError("Invalid Instagram credential binding");
  }

  assertNoOAuthEnvironmentFallback(parsed.data);
  return parsed.data;
}

export function assertNoOAuthEnvironmentFallback(binding: InstagramCredentialBinding): void {
  if (
    binding.mode === "CONNECTION_BOUND" &&
    binding.authFamily === "INSTAGRAM_BUSINESS_LOGIN" &&
    binding.deliveryPath !== "DATABASE_ONLY"
  ) {
    throw new InstagramOAuthConfigurationError(
      "Instagram OAuth managed connections cannot use environment fallback delivery path"
    );
  }
}

export function serializeInstagramCredentialBindingForQueue(
  binding: Extract<InstagramCredentialBinding, { mode: "CONNECTION_BOUND" }>
): Extract<InstagramCredentialBinding, { mode: "CONNECTION_BOUND" }> {
  assertNoOAuthEnvironmentFallback(binding);
  return {
    mode: "CONNECTION_BOUND",
    contractVersion: INSTAGRAM_OAUTH_OUTBOUND_QUEUE_CONTRACT_VERSION,
    provider: "INSTAGRAM",
    authFamily: "INSTAGRAM_BUSINESS_LOGIN",
    deliveryPath: "DATABASE_ONLY",
    channelConnectionId: binding.channelConnectionId,
    messageKind: binding.messageKind
  };
}

export function isConnectionBoundInstagramOAuthBinding(
  binding: InstagramCredentialBinding | null
): binding is Extract<InstagramCredentialBinding, { mode: "CONNECTION_BOUND" }> {
  return binding?.mode === "CONNECTION_BOUND";
}

/** Safe JSON for queue persistence — never includes token material. */
export function toSafeInstagramCredentialBindingJson(
  binding: InstagramCredentialBinding | null
): Record<string, unknown> | undefined {
  if (!binding) return undefined;
  if (binding.mode === "LEGACY") {
    return { mode: "LEGACY" };
  }
  return serializeInstagramCredentialBindingForQueue(binding);
}

export function validateOutboundPayloadInstagramExtension(payload: Record<string, unknown>): void {
  outboundPayloadExtensionSchema.parse(payload);
}
