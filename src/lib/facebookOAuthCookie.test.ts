import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFacebookOAuthResumeClearCookieHeader,
  buildFacebookOAuthResumeSetCookieHeader,
  FACEBOOK_OAUTH_RESUME_COOKIE_NAME,
  readFacebookOAuthResumeCookieValue
} from "./facebookOAuthCookie.js";

test("resume cookie Set-Cookie includes HttpOnly Secure SameSite=Lax and scoped path", () => {
  const header = buildFacebookOAuthResumeSetCookieHeader("opaque-session-value", { secure: true });
  assert.match(header, new RegExp(`${FACEBOOK_OAUTH_RESUME_COOKIE_NAME}=opaque-session-value`));
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\/api\/channel-connect\/facebook/);
  assert.match(header, /Max-Age=900/);
});

test("readFacebookOAuthResumeCookieValue parses cookie header without exposing cookie name in API DTO", () => {
  const value = readFacebookOAuthResumeCookieValue(
    `other=1; ${FACEBOOK_OAUTH_RESUME_COOKIE_NAME}=abc123; another=2`
  );
  assert.equal(value, "abc123");
});

test("clear cookie uses Max-Age=0", () => {
  const header = buildFacebookOAuthResumeClearCookieHeader({ secure: true });
  assert.match(header, /Max-Age=0/);
});
