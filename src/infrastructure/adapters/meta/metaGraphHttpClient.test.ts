import test from "node:test";
import assert from "node:assert/strict";
import { MetaGraphHttpClient } from "./metaGraphHttpClient.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";

const URL = "https://graph.facebook.com/v25.0/debug_token?input_token=redacted&access_token=redacted";

test("HTTP client rejects oversized response", async () => {
  const oversized = JSON.stringify({ data: { is_valid: true, padding: "x".repeat(128) } });
  const client = new MetaGraphHttpClient({
    maxResponseBytes: 64,
    fetchImpl: async () => new Response(oversized, { status: 200 })
  });
  await assert.rejects(
    () => client.requestJson({ url: URL }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PROVIDER_RESPONSE_INVALID"
  );
});

test("HTTP client retries transient 5xx then succeeds", async () => {
  let calls = 0;
  const client = new MetaGraphHttpClient({
    maxRetries: 2,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response("error", { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });
  const body = await client.requestJson({ url: URL });
  assert.equal(body.ok, true);
  assert.equal(calls, 2);
});

test("HTTP client does not retry deterministic 4xx", async () => {
  let calls = 0;
  const client = new MetaGraphHttpClient({
    maxRetries: 2,
    fetchImpl: async () => {
      calls += 1;
      return new Response("bad", { status: 400 });
    }
  });
  await assert.rejects(
    () => client.requestJson({ url: URL }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PROVIDER_RESPONSE_INVALID" &&
      err.retryable === false
  );
  assert.equal(calls, 1);
});

test("HTTP client rejects malformed JSON", async () => {
  const client = new MetaGraphHttpClient({
    fetchImpl: async () => new Response("not-json", { status: 200 })
  });
  await assert.rejects(
    () => client.requestJson({ url: URL }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PROVIDER_RESPONSE_INVALID"
  );
});

test("HTTP client stops retrying after limit", async () => {
  let calls = 0;
  const client = new MetaGraphHttpClient({
    maxRetries: 2,
    fetchImpl: async () => {
      calls += 1;
      return new Response("error", { status: 503 });
    }
  });
  await assert.rejects(
    () => client.requestJson({ url: URL }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PROVIDER_UNAVAILABLE" &&
      err.retryable === true
  );
  assert.equal(calls, 3);
});
