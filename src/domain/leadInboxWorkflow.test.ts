import test from "node:test";
import assert from "node:assert/strict";
import {
  mapWaitingKindToPresentation,
  shouldReopenConversationOnCustomerReply,
  suggestLeadStatusAfterFirstAgentReply
} from "./leadInboxWorkflow.js";

test("shouldReopenConversationOnCustomerReply only for RESOLVED", () => {
  assert.equal(shouldReopenConversationOnCustomerReply("RESOLVED"), true);
  assert.equal(shouldReopenConversationOnCustomerReply("OPEN"), false);
  assert.equal(shouldReopenConversationOnCustomerReply("ARCHIVED"), false);
});

test("suggestLeadStatusAfterFirstAgentReply promotes NEW and ASSIGNED to CONTACTED", () => {
  assert.equal(suggestLeadStatusAfterFirstAgentReply("NEW"), "CONTACTED");
  assert.equal(suggestLeadStatusAfterFirstAgentReply("ASSIGNED"), "CONTACTED");
  assert.equal(suggestLeadStatusAfterFirstAgentReply("CONTACTED"), null);
  assert.equal(suggestLeadStatusAfterFirstAgentReply("WON"), null);
});

test("mapWaitingKindToPresentation", () => {
  assert.equal(mapWaitingKindToPresentation("waitingOnUs"), "waiting_for_agent");
  assert.equal(mapWaitingKindToPresentation("waitingOnCustomer"), "waiting_for_customer");
});
