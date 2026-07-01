import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatIngressMaintenanceResponseBody,
  CHAT_INGRESS_MAINTENANCE_ERROR_CODE,
  CHAT_INGRESS_MAINTENANCE_RETRY_AFTER_SECONDS,
  createChatIngressMaintenanceBlockedResponse,
  maybeBlockChatIngressWrite
} from "./chatIngressMaintenanceGate.js";

test("maybeBlockChatIngressWrite returns null when gate OFF", () => {
  assert.equal(
    maybeBlockChatIngressWrite(
      { routeCategory: "webhook", channel: "FACEBOOK", httpMethod: "POST" },
      {}
    ),
    null
  );
});

test("maybeBlockChatIngressWrite returns 503 maintenance response when gate ON", async () => {
  const res = maybeBlockChatIngressWrite(
    { routeCategory: "webhook", channel: "LINE", httpMethod: "POST" },
    { HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "true" }
  );
  assert.ok(res);
  assert.equal(res!.status, 503);
  assert.equal(res!.headers.get("Retry-After"), String(CHAT_INGRESS_MAINTENANCE_RETRY_AFTER_SECONDS));
  const body = (await res!.json()) as { code?: string; error?: string };
  assert.deepEqual(body, buildChatIngressMaintenanceResponseBody());
  assert.equal(body.code, CHAT_INGRESS_MAINTENANCE_ERROR_CODE);
  assert.equal(JSON.stringify(body).includes("HUBCHAT"), false);
});

test("maintenance response body contains no secret or payload material", () => {
  const body = buildChatIngressMaintenanceResponseBody();
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("signature"), false);
  assert.equal(serialized.includes("payload"), false);
});

test("repeated blocked responses remain deterministic", async () => {
  const env = { HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "true" };
  const context = { routeCategory: "webhook" as const, channel: "INSTAGRAM" as const, httpMethod: "POST" as const };
  const first = createChatIngressMaintenanceBlockedResponse(context);
  const second = createChatIngressMaintenanceBlockedResponse(context);
  assert.equal(first.status, second.status);
  assert.equal(first.headers.get("Retry-After"), second.headers.get("Retry-After"));
  assert.deepEqual(await first.json(), await second.json());
});
