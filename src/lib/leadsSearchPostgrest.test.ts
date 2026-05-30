import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLeadsMenuCursorOrFilter,
  buildLeadsMenuSearchAndCursorOrFilter,
  buildLeadsSearchOrFilter,
  buildPostgrestIlikeStarQuotedOperand,
  escapePostgrestIlikePattern
} from "./leadsSearchPostgrest.js";

test("buildLeadsSearchOrFilter uses only top-level conversation columns", () => {
  const or = buildLeadsSearchOrFilter("Poolsub");
  assert.match(or, /participant_display_name\.ilike\./);
  assert.match(or, /provider_external_user_id\.ilike\./);
  assert.match(or, /channel_thread_id\.ilike\./);
  assert.equal(or.includes("leads.name"), false);
  assert.equal(or.includes("contacts.display_name"), false);
});

test("buildPostgrestIlikeStarQuotedOperand quotes special characters safely", () => {
  assert.equal(buildPostgrestIlikeStarQuotedOperand("Poolsub"), '"*Poolsub*"');
  assert.equal(buildPostgrestIlikeStarQuotedOperand("test,value"), '"*test,value*"');
  assert.equal(buildPostgrestIlikeStarQuotedOperand("test(value)"), '"*test(value)*"');
  assert.equal(buildPostgrestIlikeStarQuotedOperand("O'Brien"), `"*O'Brien*"`);
  assert.equal(buildPostgrestIlikeStarQuotedOperand("ลูกค้า"), '"*ลูกค้า*"');
});

test("buildPostgrestIlikeStarQuotedOperand escapes underscore literally for PostgREST and SQL", () => {
  const operand = buildPostgrestIlikeStarQuotedOperand("user_1");
  assert.equal(operand, '"*user\\\\_1*"');
  assert.doesNotMatch(operand, /(?<!\\)user_1/);
});

test("escapePostgrestIlikePattern user_1 keeps literal underscore escaped", () => {
  const escaped = escapePostgrestIlikePattern("user_1");
  assert.equal(escaped, "user\\_1");
  assert.equal(escaped.endsWith("\\_1"), true);
});

test("buildPostgrestIlikeStarQuotedOperand escapes percent literally", () => {
  assert.equal(buildPostgrestIlikeStarQuotedOperand("50%"), '"*50\\\\%*"');
});

test("buildPostgrestIlikeStarQuotedOperand escapes star wildcard alias", () => {
  assert.equal(buildPostgrestIlikeStarQuotedOperand("a*b"), '"*a\\\\*b*"');
});

test("buildLeadsSearchOrFilter user_1 operand is not equivalent to user:1 substring", () => {
  const or = buildLeadsSearchOrFilter("user_1");
  assert.match(or, /channel_thread_id\.ilike\."\*user\\\\_1\*"/);
  assert.equal(or.includes('"*user_1*"'), false);
});

test("buildLeadsMenuSearchAndCursorOrFilter nests search and cursor in one or param", () => {
  const combined = buildLeadsMenuSearchAndCursorOrFilter("111", {
    lastMessageAt: "2026-05-29T10:00:00.000Z",
    id: "conv-uuid"
  });
  assert.match(combined, /^and\(or\(/);
  assert.match(combined, /participant_display_name\.ilike\./);
  assert.match(combined, /or\(last_message_at\.lt\./);
  assert.ok(combined.includes(buildLeadsMenuCursorOrFilter({ lastMessageAt: "2026-05-29T10:00:00.000Z", id: "conv-uuid" })));
});
