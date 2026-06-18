import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchInstagramProfessionalIdentity,
  INSTAGRAM_GRAPH_HOST,
  INSTAGRAM_PROFESSIONAL_IDENTITY_ME_FIELDS
} from "./instagramProfessionalIdentity.js";

test("fetchInstagramProfessionalIdentity uses bearer auth and fixed field allowlist", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        user_id: "17841400000000001",
        username: "brand.official",
        account_type: "BUSINESS"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const identity = await fetchInstagramProfessionalIdentity(
    { graphVersion: "v25.0", fetchImpl },
    "long-lived-token"
  );

  const url = new URL(capturedUrl);
  assert.equal(url.origin, INSTAGRAM_GRAPH_HOST);
  assert.equal(url.pathname, "/v25.0/me");
  assert.equal(url.searchParams.get("fields"), INSTAGRAM_PROFESSIONAL_IDENTITY_ME_FIELDS.join(","));
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer long-lived-token");
  assert.equal(String(identity.professionalAccountId), "17841400000000001");
});

test("fetchInstagramProfessionalIdentity maps provider 401 to reauth required", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "invalid token", code: 190 } }), {
      status: 401
    })) as typeof fetch;

  await assert.rejects(
    () => fetchInstagramProfessionalIdentity({ graphVersion: "v25.0", fetchImpl }, "bad-token"),
    /reauthorization|invalid token|Instagram/i
  );
});
