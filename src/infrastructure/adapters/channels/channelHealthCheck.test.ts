import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelRuntimeConfig } from "../../../domain/channelSettings.js";
import { verifyChannelHealth, verifyLineChannelHealth } from "./channelHealthCheck.js";

const lineRuntime: ChannelRuntimeConfig = {
  tenantId: "t1",
  channel: "LINE",
  enabled: true,
  providerPageId: null,
  providerAccountName: null,
  secrets: { accessToken: "line-token", channelSecret: "line-secret" }
};

test("verifyLineChannelHealth succeeds on bot info response", async () => {
  const fetchFn = async () =>
    new Response(JSON.stringify({ userId: "U123", displayName: "LINE Bot" }), { status: 200 });

  const outcome = await verifyLineChannelHealth(lineRuntime, fetchFn);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.metadata?.providerPageId, "U123");
  assert.equal(outcome.metadata?.providerAccountName, "LINE Bot");
});

test("verifyLineChannelHealth returns sanitized failure without token leak", async () => {
  const fetchFn = async () =>
    new Response(JSON.stringify({ message: "Invalid token EAAGxxxx" }), { status: 401 });

  const outcome = await verifyLineChannelHealth(lineRuntime, fetchFn);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.message.includes("EAAG"), false);
});

test("verifyChannelHealth routes by channel", async () => {
  const fetchFn: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("api.line.me")) {
      return new Response(JSON.stringify({ userId: "U1", displayName: "Bot" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "fail" } }), { status: 400 });
  };

  const line = await verifyChannelHealth("LINE", lineRuntime, fetchFn);
  assert.equal(line.ok, true);
});
