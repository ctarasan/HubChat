import test from "node:test";
import assert from "node:assert/strict";
import { isChatIngressMaintenanceEnabled } from "./chatIngressMaintenanceFlags.js";

test("isChatIngressMaintenanceEnabled defaults OFF when absent", () => {
  assert.equal(isChatIngressMaintenanceEnabled({}), false);
});

test("isChatIngressMaintenanceEnabled treats empty and whitespace as OFF", () => {
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "" }), false);
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "   " }), false);
});

test("isChatIngressMaintenanceEnabled treats explicit false as OFF", () => {
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "false" }), false);
});

test("isChatIngressMaintenanceEnabled enables only exact trimmed true", () => {
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "true" }), true);
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: " true " }), true);
});

test("isChatIngressMaintenanceEnabled rejects permissive truthy values", () => {
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "1" }), false);
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "yes" }), false);
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "on" }), false);
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "TRUE" }), false);
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: " maybe" }), false);
  assert.equal(isChatIngressMaintenanceEnabled({ HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED: "truthy" }), false);
});
