import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLineEventOnlyInboxExclusionOrFilter,
  filterLineEventOnlyInboxRows,
  isLineEventOnlyInboxRow
} from "./lineEventOnlyInboxFilter.js";

test("isLineEventOnlyInboxRow matches LINE rows with [event] or empty preview", () => {
  assert.equal(isLineEventOnlyInboxRow({ channel_type: "LINE", last_message_preview: "[event]" }), true);
  assert.equal(isLineEventOnlyInboxRow({ channel_type: "LINE", last_message_preview: "[Empty]" }), true);
  assert.equal(isLineEventOnlyInboxRow({ channel_type: "LINE", last_message_preview: null }), true);
});

test("isLineEventOnlyInboxRow keeps LINE rows with real customer previews", () => {
  assert.equal(isLineEventOnlyInboxRow({ channel_type: "LINE", last_message_preview: "hello" }), false);
  assert.equal(isLineEventOnlyInboxRow({ channel_type: "LINE", last_message_preview: "[Image]" }), false);
  assert.equal(isLineEventOnlyInboxRow({ channel_type: "LINE", last_message_preview: "[sticker]" }), false);
});

test("isLineEventOnlyInboxRow does not affect Facebook or Instagram rows", () => {
  assert.equal(isLineEventOnlyInboxRow({ channel_type: "FACEBOOK", last_message_preview: "[event]" }), false);
  assert.equal(isLineEventOnlyInboxRow({ channel_type: "INSTAGRAM", last_message_preview: null }), false);
});

test("filterLineEventOnlyInboxRows removes only polluted LINE rows", () => {
  const rows = [
    { id: "1", channel_type: "LINE", last_message_preview: "[event]" },
    { id: "2", channel_type: "LINE", last_message_preview: "real text" },
    { id: "3", channel_type: "FACEBOOK", last_message_preview: "[event]" }
  ];
  const filtered = filterLineEventOnlyInboxRows(rows);
  assert.deepEqual(
    filtered.map((row) => row.id),
    ["2", "3"]
  );
});

test("buildLineEventOnlyInboxExclusionOrFilter excludes LINE event-only previews", () => {
  const expr = buildLineEventOnlyInboxExclusionOrFilter();
  assert.match(expr, /channel_type\.neq\.LINE/);
  assert.match(expr, /last_message_preview\.neq\.\[event\]/);
  assert.match(expr, /last_message_preview\.neq\.\[Empty\]/);
});
