import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../domain/channelConnections.js";
import {
  assertPublicConnectionDtoSafe,
  sanitizeChannelConnectionErrorMessage,
  toChannelConnectionPublicDto
} from "./channelConnectionPublicDto.js";

const baseConnection: ChannelConnectionRecord = {
  id: "conn-1",
  tenantId: "tenant-1",
  provider: "LINE",
  status: "DRAFT",
  providerAccountId: "U1234567890",
  providerAccountName: "Demo OA",
  providerPageId: null,
  providerIgAccountId: null,
  publicConnectionKey: "ccp_test_public_key_value_abc",
  webhookEndpoint: "https://example.test/api/webhook/line",
  webhookActive: false,
  lastInboundVerifiedAt: null,
  lastOutboundVerifiedAt: null,
  lastHealthCheckAt: null,
  lastErrorCode: null,
  lastErrorMessageSafe: null,
  connectedBy: null,
  connectedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

test("public DTO omits raw credential fields", () => {
  const dto = toChannelConnectionPublicDto({
    connection: baseConnection,
    credentialMetadata: [
      {
        connectionId: "conn-1",
        provider: "LINE",
        credentialType: "ACCESS_TOKEN",
        credentialState: "SET",
        secretFingerprint: "abc123fingerprint",
        tokenExpiresAt: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]
  });
  const serialized = JSON.stringify(dto);
  assert.equal(serialized.includes("fake-line-token"), false);
  assert.equal(serialized.includes("encrypted_secret_value"), false);
  assert.equal(dto.credentialStates.ACCESS_TOKEN, "SET");
  assert.doesNotThrow(() => assertPublicConnectionDtoSafe(dto as unknown as Record<string, unknown>));
});

test("sanitizeChannelConnectionErrorMessage redacts token-like values", () => {
  const safe = sanitizeChannelConnectionErrorMessage(
    "Provider failed access_token=EAAGfakeTokenValue channel_secret=super-secret"
  );
  assert.equal(safe.includes("EAAGfakeTokenValue"), false);
  assert.equal(safe.includes("super-secret"), false);
  assert.match(safe, /\[redacted\]/);
});
