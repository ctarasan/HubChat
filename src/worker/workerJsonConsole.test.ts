import test from "node:test";
import assert from "node:assert/strict";
import {
  emitWorkerLoopClaimResult,
  emitWorkerLoopError,
  emitWorkerLoopStarted,
  emitWorkerStdoutJson
} from "./workerJsonConsole.js";

test("emitWorkerStdoutJson prints parseable JSON with event and timestamp", () => {
  const lines: string[] = [];
  const orig = console.info;
  console.info = (msg: unknown) => {
    lines.push(String(msg));
  };
  try {
    emitWorkerStdoutJson({ event: "worker_startup", phase: "test", pid: 1 });
  } finally {
    console.info = orig;
  }
  assert.equal(lines.length, 1);
  const row = JSON.parse(lines[0]!) as { event: string; phase: string; pid: number; timestamp: string };
  assert.equal(row.event, "worker_startup");
  assert.equal(row.phase, "test");
  assert.equal(row.pid, 1);
  assert.ok(typeof row.timestamp === "string" && row.timestamp.length > 10);
});

test("emitWorkerLoopStarted includes loop and topic fields", () => {
  const lines: string[] = [];
  const orig = console.info;
  console.info = (m: unknown) => lines.push(String(m));
  try {
    emitWorkerLoopStarted("outbound", {
      topic: "message.outbound.requested",
      pollIntervalMs: 200,
      batchSize: 5,
      concurrency: 2
    });
  } finally {
    console.info = orig;
  }
  const row = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.equal(row.event, "worker_loop_started");
  assert.equal(row.loop, "outbound");
  assert.equal(row.topic, "message.outbound.requested");
});

test("emitWorkerLoopError goes to stderr with serialized error", () => {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (m: unknown) => lines.push(String(m));
  try {
    emitWorkerLoopError("outbound", new Error("rpc"), {
      topic: "message.outbound.requested",
      pollIntervalMs: 200,
      batchSize: 5,
      concurrency: 2
    });
  } finally {
    console.error = orig;
  }
  const row = JSON.parse(lines[0]!) as { event: string; error: { message: string } };
  assert.equal(row.event, "worker_loop_error");
  assert.equal(row.error.message, "rpc");
});

test("emitWorkerLoopClaimResult is one-line JSON", () => {
  const lines: string[] = [];
  const orig = console.info;
  console.info = (m: unknown) => lines.push(String(m));
  try {
    emitWorkerLoopClaimResult("outbound", 3);
  } finally {
    console.info = orig;
  }
  const row = JSON.parse(lines[0]!) as { event: string; claimedCount: number };
  assert.equal(row.event, "worker_loop_claim_result");
  assert.equal(row.claimedCount, 3);
});
