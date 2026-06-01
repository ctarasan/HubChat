import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("Dashboard inbox avatar still uses image plan with conv-avatar-img", () => {
  assert.ok(dashboardSource.includes("function ConversationAvatar"));
  assert.ok(dashboardSource.includes("resolveConversationAvatarPlan"));
  assert.ok(dashboardSource.includes("syncInboxConversationAvatarFields"));
  assert.ok(dashboardSource.includes('className="conv-avatar conv-avatar-img"'));
  assert.ok(dashboardSource.includes("onError={() => setBroken(true)}"));
});

test("mapApiConversationRow syncs profile image fields for inbox list", () => {
  assert.ok(dashboardSource.includes("function mapApiConversationRow"));
  assert.ok(dashboardSource.includes("syncInboxConversationAvatarFields(mapped)"));
  assert.ok(dashboardSource.includes("participant_profile_image_url"));
  assert.ok(dashboardSource.includes("participantProfileImageUrl"));
});

test("Work Queue CSS does not add global img or conv-avatar overrides", () => {
  const workQueueBlock = globalsSource.slice(globalsSource.indexOf("/* Work Queue (ALW-1-B) */"));
  assert.equal(workQueueBlock.includes("\nimg {"), false);
  assert.equal(workQueueBlock.includes("\n.conv-avatar"), false);
  assert.equal(workQueueBlock.includes("conv-avatar-img"), false);
  assert.ok(workQueueBlock.includes("Scoped under .work-queue-root only"));
});
