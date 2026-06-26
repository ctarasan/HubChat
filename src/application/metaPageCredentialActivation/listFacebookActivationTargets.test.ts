import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import {
  isEligibleFacebookActivationTarget,
  listEligibleFacebookActivationTargets
} from "./listFacebookActivationTargets.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function facebookConnection(
  overrides: Partial<ChannelConnectionRecord> = {}
): ChannelConnectionRecord {
  return {
    id: "507d0000-0000-4000-8000-00000000279d",
    tenantId: TENANT,
    provider: "FACEBOOK",
    status: "READY",
    providerAccountId: "541846535668129",
    providerAccountName: "Test Page",
    providerPageId: "541846535668129",
    providerIgAccountId: null,
    publicConnectionKey: "fb-main",
    webhookEndpoint: null,
    webhookActive: false,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: null,
    connectedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

test("eligible Facebook activation target requires READY status and page identity", () => {
  assert.equal(isEligibleFacebookActivationTarget(facebookConnection()), true);
  assert.equal(isEligibleFacebookActivationTarget(facebookConnection({ status: "CONNECTED" })), false);
  assert.equal(
    isEligibleFacebookActivationTarget(
      facebookConnection({ providerPageId: null, providerAccountId: null })
    ),
    false
  );
});

test("Instagram connections are never activation targets", () => {
  assert.equal(
    isEligibleFacebookActivationTarget(
      facebookConnection({
        provider: "INSTAGRAM",
        providerIgAccountId: "ig-1",
        providerPageId: null
      })
    ),
    false
  );
});

test("listEligibleFacebookActivationTargets returns only eligible Facebook rows", () => {
  const targets = listEligibleFacebookActivationTargets([
    facebookConnection(),
    facebookConnection({ id: "draft-1", status: "DRAFT" }),
    facebookConnection({ id: "ig-1", provider: "INSTAGRAM" })
  ]);
  assert.equal(targets.length, 1);
  assert.equal(targets[0]!.connectionId, "507d0000-0000-4000-8000-00000000279d");
  assert.equal(targets[0]!.providerPageId, "541846535668129");
});
