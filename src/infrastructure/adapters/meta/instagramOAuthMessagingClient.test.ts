import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInstagramOAuthMessagesEndpoint,
  buildInstagramOAuthTextMessagePayload,
  createInstagramOAuthMessagingClient,
  sendInstagramOAuthTextMessage
} from "./instagramOAuthMessagingClient.js";
import { INSTAGRAM_GRAPH_HOST } from "./instagramProfessionalIdentity.js";

const config = {
  graphVersion: "v25.0"
};

test("buildInstagramOAuthTextMessagePayload uses IGSID recipient and text only", () => {
  const payload = buildInstagramOAuthTextMessagePayload({
    recipientMessagingScopedUserId: "959986016929726",
    messageText: "Hello from OAuth"
  });
  assert.deepEqual(payload, {
    recipient: { id: "959986016929726" },
    message: { text: "Hello from OAuth" }
  });
});

test("buildInstagramOAuthMessagesEndpoint uses graph.instagram.com and professional account path", () => {
  const url = buildInstagramOAuthMessagesEndpoint({
    graphVersion: "v25.0",
    professionalAccountId: "17841400000000000"
  });
  assert.equal(url, `${INSTAGRAM_GRAPH_HOST}/v25.0/17841400000000000/messages`);
  assert.equal(url.includes("access_token="), false);
});

test("sendInstagramOAuthTextMessage posts Bearer token and fixed payload", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        recipient_id: "959986016929726",
        message_id: "mid.oauth.123"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const result = await sendInstagramOAuthTextMessage(
    { ...config, fetchImpl },
    {
      professionalAccountId: "17841400000000000",
      accessToken: "test-oauth-token-value",
      recipientMessagingScopedUserId: "959986016929726",
      messageText: "Hello"
    }
  );

  assert.equal(
    capturedUrl,
    `${INSTAGRAM_GRAPH_HOST}/v25.0/17841400000000000/messages`
  );
  assert.equal(capturedUrl.includes("access_token="), false);
  assert.equal(capturedInit?.method, "POST");
  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer test-oauth-token-value");
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    recipient: { id: "959986016929726" },
    message: { text: "Hello" }
  });
  assert.equal(result.externalMessageId, "mid.oauth.123");
});

test("sendInstagramOAuthTextMessage rejects malformed success response", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ recipient_id: "959986016929726" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;

  await assert.rejects(
    () =>
      sendInstagramOAuthTextMessage(
        { ...config, fetchImpl },
        {
          professionalAccountId: "17841400000000000",
          accessToken: "test-oauth-token-value",
          recipientMessagingScopedUserId: "959986016929726",
          messageText: "Hello"
        }
      ),
    /message_id/
  );
});

test("401 maps to REAUTH_REQUIRED without exposing token", async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "Invalid OAuth access token - Cannot parse access token",
          type: "OAuthException",
          code: 190
        }
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;

  await assert.rejects(
    () =>
      sendInstagramOAuthTextMessage(
        { ...config, fetchImpl },
        {
          professionalAccountId: "17841400000000000",
          accessToken: "test-oauth-token-value",
          recipientMessagingScopedUserId: "959986016929726",
          messageText: "Hello"
        }
      ),
    (err: unknown) => {
      assert.equal((err as { code?: string }).code, "REAUTH_REQUIRED");
      assert.equal(String(err).includes("test-oauth-token-value"), false);
      return true;
    }
  );
});

test("429 maps to RATE_LIMITED", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "Rate limit", code: 4 } }), {
      status: 429,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;

  await assert.rejects(
    () =>
      sendInstagramOAuthTextMessage(
        { ...config, fetchImpl },
        {
          professionalAccountId: "17841400000000000",
          accessToken: "test-oauth-token-value",
          recipientMessagingScopedUserId: "959986016929726",
          messageText: "Hello"
        }
      ),
    (err: unknown) => (err as { code?: string }).code === "RATE_LIMITED"
  );
});

test("5xx maps to PROVIDER_UNAVAILABLE", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "Server error", code: 1 } }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;

  await assert.rejects(
    () =>
      sendInstagramOAuthTextMessage(
        { ...config, fetchImpl },
        {
          professionalAccountId: "17841400000000000",
          accessToken: "test-oauth-token-value",
          recipientMessagingScopedUserId: "959986016929726",
          messageText: "Hello"
        }
      ),
    (err: unknown) => (err as { code?: string }).code === "PROVIDER_UNAVAILABLE"
  );
});

test("messaging window closed maps to MESSAGE_WINDOW_CLOSED", async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "This message is sent outside of allowed window.",
          code: 10,
          error_subcode: 2534022
        }
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;

  await assert.rejects(
    () =>
      sendInstagramOAuthTextMessage(
        { ...config, fetchImpl },
        {
          professionalAccountId: "17841400000000000",
          accessToken: "test-oauth-token-value",
          recipientMessagingScopedUserId: "959986016929726",
          messageText: "Hello"
        }
      ),
    (err: unknown) => (err as { code?: string }).code === "MESSAGE_WINDOW_CLOSED"
  );
});

test("createInstagramOAuthMessagingClient wraps sendTextMessage", async () => {
  const client = createInstagramOAuthMessagingClient({
    graphVersion: "v25.0",
    fetchImpl: (async () =>
      new Response(JSON.stringify({ message_id: "mid.oauth.456" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch
  });
  const result = await client.sendTextMessage({
    professionalAccountId: "17841400000000000",
    accessToken: "test-oauth-token-value",
    recipientMessagingScopedUserId: "959986016929726",
    messageText: "Hello"
  });
  assert.equal(result.externalMessageId, "mid.oauth.456");
});
