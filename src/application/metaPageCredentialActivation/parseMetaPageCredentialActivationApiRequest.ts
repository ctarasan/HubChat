import { z } from "zod";
import { META_PAGE_BINDING_CHANNEL_TYPES } from "../../domain/metaPageCredentials.js";
import { META_PAGE_CREDENTIAL_INITIAL_VERSION } from "../../domain/metaPageCredentialActivation.js";
import { MetaPageCredentialActivationApiError } from "../../lib/metaPageCredentialActivationApiErrors.js";

export const META_PAGE_ACTIVATION_ACCESS_TOKEN_MAX_LENGTH = 8_192;
export const META_PAGE_ACTIVATION_BODY_MAX_BYTES = 65_536;
export const META_PAGE_ACTIVATION_IDEMPOTENCY_KEY_MAX_LENGTH = 128;

const RequestedChannelSchema = z.enum(["FACEBOOK", "INSTAGRAM"]);

export const MetaPageCredentialActivationBodySchema = z
  .object({
    accessToken: z.string().min(1).max(META_PAGE_ACTIVATION_ACCESS_TOKEN_MAX_LENGTH),
    facebookConnectionId: z.string().uuid(),
    instagramConnectionId: z.string().uuid().optional(),
    requestedChannels: z.array(RequestedChannelSchema).min(1).max(2),
    credentialId: z.string().uuid().optional(),
    expectedCredentialVersion: z.number().int().min(0)
  })
  .strict();

export type ParsedMetaPageCredentialActivationBody = z.infer<typeof MetaPageCredentialActivationBodySchema>;

export function parseMetaPageCredentialActivationIdempotencyKey(
  headerValue: string | null
): string {
  const trimmed = headerValue?.trim() ?? "";
  if (!trimmed || trimmed.length > META_PAGE_ACTIVATION_IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Idempotency-Key header is required",
      400,
      false
    );
  }
  return trimmed;
}

export function parseMetaPageCredentialActivationBody(
  raw: unknown
): ParsedMetaPageCredentialActivationBody {
  const parsed = MetaPageCredentialActivationBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Activation request body is invalid",
      400,
      false
    );
  }
  return parsed.data;
}

export function validateMetaPageCredentialActivationContract(
  body: ParsedMetaPageCredentialActivationBody
): {
  requestedChannels: ("FACEBOOK" | "INSTAGRAM")[];
  instagramConnectionId: string | null;
} {
  const unique = new Set(body.requestedChannels);
  if (unique.size !== body.requestedChannels.length) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Duplicate requested channels are not allowed",
      400,
      false
    );
  }

  for (const channel of body.requestedChannels) {
    if (!META_PAGE_BINDING_CHANNEL_TYPES.includes(channel)) {
      throw new MetaPageCredentialActivationApiError(
        "META_ACTIVATION_INPUT_INVALID",
        "Unsupported requested channel",
        400,
        false
      );
    }
  }

  const wantsFacebook = unique.has("FACEBOOK");
  const wantsInstagram = unique.has("INSTAGRAM");

  if (!wantsFacebook) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Facebook channel activation is required",
      400,
      false
    );
  }

  if (wantsInstagram && unique.size !== 2) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Requested channels must be FACEBOOK or FACEBOOK and INSTAGRAM",
      400,
      false
    );
  }

  if (!wantsInstagram && unique.size !== 1) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Requested channels must be FACEBOOK or FACEBOOK and INSTAGRAM",
      400,
      false
    );
  }

  if (wantsInstagram && !body.instagramConnectionId) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Instagram connection is required when Instagram is requested",
      400,
      false
    );
  }

  if (!wantsInstagram && body.instagramConnectionId) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Instagram connection must not be supplied when Instagram is not requested",
      400,
      false
    );
  }

  if (
    body.instagramConnectionId &&
    body.facebookConnectionId === body.instagramConnectionId
  ) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Facebook and Instagram connections must be distinct",
      400,
      false
    );
  }

  if (body.expectedCredentialVersion === META_PAGE_CREDENTIAL_INITIAL_VERSION && body.credentialId) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Credential id must not be supplied for initial activation",
      400,
      false
    );
  }

  if (body.expectedCredentialVersion > META_PAGE_CREDENTIAL_INITIAL_VERSION && !body.credentialId) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Credential id is required when expected version is provided",
      400,
      false
    );
  }

  return {
    requestedChannels: [...body.requestedChannels],
    instagramConnectionId: body.instagramConnectionId ?? null
  };
}

export function assertMetaPageCredentialActivationBodySize(contentLength: string | null): void {
  if (!contentLength) return;
  const bytes = Number(contentLength);
  if (Number.isFinite(bytes) && bytes > META_PAGE_ACTIVATION_BODY_MAX_BYTES) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_INPUT_INVALID",
      "Activation request body is too large",
      400,
      false
    );
  }
}
