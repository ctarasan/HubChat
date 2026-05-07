import test from "node:test";
import assert from "node:assert/strict";
import { buildInstagramOutboundConfig } from "./instagramOutboundConfig.js";

test("worker instagram config prefers FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID", () => {
  const cfg = buildInstagramOutboundConfig({
    FACEBOOK_PAGE_ACCESS_TOKEN: "EA_FACEBOOK",
    INSTAGRAM_ACCESS_TOKEN: "EA_INSTAGRAM",
    FACEBOOK_PAGE_ID: "1137356672785125",
    INSTAGRAM_PAGE_ID: "ig-page-fallback",
    META_GRAPH_VERSION: "v25.0",
    INSTAGRAM_ACCOUNT_ID: "ig-account-1"
  });

  assert.equal(cfg.accessToken, "EA_FACEBOOK");
  assert.equal(cfg.instagramTokenSource, "FACEBOOK_PAGE_ACCESS_TOKEN");
  assert.equal(cfg.pageId, "1137356672785125");
  assert.equal(cfg.instagramGraphPageId, "1137356672785125");
  assert.equal(cfg.hasInstagramAccessToken, true);
  assert.equal(cfg.instagramOutboundEnabled, true);
});
