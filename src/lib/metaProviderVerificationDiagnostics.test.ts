import test from "node:test";
import assert from "node:assert/strict";
import {
  assertProviderVerificationDiagnosticSafe,
  buildProviderVerificationDiagnostic,
  classifyProviderContentTypeCategory,
  classifyProviderHttpStatusCategory,
  classifyProviderJsonShape,
  debugTokenShapeSubcode,
  httpFailureSubcode,
  providerDiagnosticToLogFields,
  providerJsonObjectFlags
} from "./metaProviderVerificationDiagnostics.js";

test("classifyProviderHttpStatusCategory buckets status codes", () => {
  assert.equal(classifyProviderHttpStatusCategory(200), "2XX");
  assert.equal(classifyProviderHttpStatusCategory(400), "4XX");
  assert.equal(classifyProviderHttpStatusCategory(429), "429");
  assert.equal(classifyProviderHttpStatusCategory(503), "5XX");
  assert.equal(classifyProviderHttpStatusCategory(null), "NONE");
});

test("classifyProviderJsonShape derives bounded categories", () => {
  assert.equal(classifyProviderJsonShape({ data: { ok: true } }, "{}"), "JSON_OBJECT_WITH_DATA");
  assert.equal(classifyProviderJsonShape({ data: null }, "{}"), "JSON_DATA_NULL");
  assert.equal(classifyProviderJsonShape({ error: { x: 1 } }, "{}"), "JSON_ERROR_OBJECT");
  assert.equal(classifyProviderJsonShape([], "[]"), "ARRAY");
  assert.equal(classifyProviderJsonShape("x", '"x"'), "PRIMITIVE");
  assert.equal(classifyProviderJsonShape(null, ""), "EMPTY_BODY");
});

test("debugTokenShapeSubcode maps shapes to precise subcodes", () => {
  assert.equal(debugTokenShapeSubcode("JSON_DATA_NULL", { hasData: false, hasError: false }), "META_DEBUG_TOKEN_NULL_DATA");
  assert.equal(
    debugTokenShapeSubcode("JSON_ERROR_OBJECT", { hasData: false, hasError: true }),
    "META_DEBUG_TOKEN_ERROR_SHAPED_SUCCESS"
  );
  assert.equal(
    debugTokenShapeSubcode("JSON_OBJECT", { hasData: false, hasError: false }),
    "META_DEBUG_TOKEN_MISSING_DATA"
  );
});

test("httpFailureSubcode distinguishes debug_token and page identity", () => {
  assert.equal(httpFailureSubcode("DEBUG_TOKEN", "HTTP_NON_2XX", 400), "META_DEBUG_TOKEN_HTTP_REJECTED");
  assert.equal(httpFailureSubcode("PAGE_IDENTITY", "HTTP_NON_2XX", 400), "META_PAGE_IDENTITY_HTTP_REJECTED");
  assert.equal(httpFailureSubcode("DEBUG_TOKEN", "NON_JSON", 200), "META_DEBUG_TOKEN_NON_JSON_RESPONSE");
  assert.equal(httpFailureSubcode("PAGE_IDENTITY", "NON_JSON", 200), "META_PAGE_IDENTITY_NON_JSON_RESPONSE");
});

test("buildProviderVerificationDiagnostic omits forbidden substrings", () => {
  const diagnostic = buildProviderVerificationDiagnostic({
    providerOperation: "DEBUG_TOKEN",
    providerSubstage: "DEBUG_TOKEN_PARSE",
    graphVersion: "v25.0",
    safeProviderSubcode: "META_DEBUG_TOKEN_MISSING_DATA",
    httpStatus: 200,
    bodyText: "{}",
    parsed: {},
    hasData: false,
    hasError: false
  });
  assertProviderVerificationDiagnosticSafe(diagnostic);
  const fields = providerDiagnosticToLogFields(diagnostic);
  assert.equal(fields.providerOperation, "DEBUG_TOKEN");
  assert.equal(fields.safeProviderSubcode, "META_DEBUG_TOKEN_MISSING_DATA");
  assert.equal(JSON.stringify(fields).includes("TEST_FAKE_TOKEN_MUST_NOT_LOG"), false);
});

test("providerJsonObjectFlags reports key presence only", () => {
  assert.deepEqual(providerJsonObjectFlags({ data: { x: 1 } }), { hasData: true, hasError: false });
  assert.deepEqual(providerJsonObjectFlags({ error: { x: 1 } }), { hasData: false, hasError: true });
});

test("classifyProviderContentTypeCategory handles json and non-json", () => {
  assert.equal(classifyProviderContentTypeCategory("application/json", "{}"), "JSON");
  assert.equal(classifyProviderContentTypeCategory("text/plain", "hello"), "NON_JSON");
  assert.equal(classifyProviderContentTypeCategory(null, ""), "EMPTY");
});
