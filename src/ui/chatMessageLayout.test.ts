import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAT_BUBBLE_MAX_WIDTH_DESKTOP,
  CHAT_BUBBLE_MAX_WIDTH_NARROW,
  CHAT_MESSAGE_ROW_GAP_PX,
  chatMessageBubbleClassNames,
  chatMessageDomChildOrder,
  chatMessageRowClassNames,
  isChatMediaMessageLayout,
  shouldRenderUnreadBadgeHelp
} from "./chatMessageLayout.js";

const here = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(here, "DashboardPage.tsx"), "utf8");
const cssSource = readFileSync(join(here, "../../app/globals.css"), "utf8");

test("media layout detection keeps images and PDFs off fit-content text sizing", () => {
  assert.equal(isChatMediaMessageLayout({ messageType: "TEXT" }), false);
  assert.equal(isChatMediaMessageLayout({ messageType: "IMAGE" }), true);
  assert.equal(isChatMediaMessageLayout({ messageType: "DOCUMENT_PDF" }), true);
  assert.equal(isChatMediaMessageLayout({ messageType: "TEXT", hasImageUrl: true }), true);
  assert.equal(isChatMediaMessageLayout({ messageType: "TEXT", hasLineMessageId: true }), true);
  assert.equal(isChatMediaMessageLayout({ messageType: "TEXT", isLineImageError: true }), true);
});

test("bubble and row class names encode inbound/outbound and media vs text", () => {
  assert.equal(
    chatMessageBubbleClassNames({ direction: "INBOUND", mediaLayout: false }),
    "msg msg-inbound msg-text-bubble"
  );
  assert.equal(
    chatMessageBubbleClassNames({ direction: "OUTBOUND", mediaLayout: true }),
    "msg msg-outbound msg-media"
  );
  assert.equal(chatMessageRowClassNames("INBOUND"), "msg-row msg-row-inbound");
  assert.equal(chatMessageRowClassNames("OUTBOUND"), "msg-row msg-row-outbound");
});

test("DOM child order places time outside bubble without CSS reorder tricks", () => {
  assert.deepEqual(chatMessageDomChildOrder("INBOUND"), ["bubble", "time"]);
  assert.deepEqual(chatMessageDomChildOrder("OUTBOUND"), ["time", "bubble"]);
});

test("unread explanatory helper is disabled by contract", () => {
  assert.equal(shouldRenderUnreadBadgeHelp(), false);
});

test("dashboard uses LINE-style timestamp beside bubble (outside msg)", () => {
  assert.match(dashboardSource, /chatMessageDomChildOrder/);
  assert.match(dashboardSource, /data-testid="msg-time"/);
  assert.match(dashboardSource, /data-testid="msg-bubble"/);
  assert.equal(dashboardSource.includes('className={`msg-meta'), false);
  assert.equal(dashboardSource.includes("inbox-unread-badge-help"), false);
  assert.equal(
    dashboardSource.includes("Unread means the message is already received and processed, but not yet read by an agent."),
    false
  );
  assert.match(dashboardSource, /Filters/);
  assert.match(dashboardSource, /conversation-list/);
});

test("CSS compact bubble contracts: fit-content text, max-width, flex-end time, nowrap", () => {
  assert.match(cssSource, /\.msg-row\s*\{[^}]*display:\s*flex/s);
  assert.match(cssSource, /\.msg-row\s*\{[^}]*align-items:\s*flex-end/s);
  assert.match(cssSource, new RegExp(`gap:\\s*${CHAT_MESSAGE_ROW_GAP_PX}px`));
  assert.match(cssSource, /\.msg-text-bubble\s*\{[^}]*width:\s*fit-content/s);
  assert.match(cssSource, new RegExp(`\\.msg-text-bubble[^{]*\\{[^}]*max-width:\\s*${CHAT_BUBBLE_MAX_WIDTH_DESKTOP}`));
  assert.match(cssSource, new RegExp(`max-width:\\s*${CHAT_BUBBLE_MAX_WIDTH_NARROW}`));
  assert.match(cssSource, /\.msg-time\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(cssSource, /\.msg-time\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
  assert.match(cssSource, /\.msg-media\s*\{/);
  assert.match(cssSource, /\.msg-day-separator\s*\{/);
  assert.equal(cssSource.includes("overflow-wrap"), true);
});
