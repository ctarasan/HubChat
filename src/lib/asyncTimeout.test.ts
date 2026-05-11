import test from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "./asyncTimeout.js";

test("withTimeout resolves when promise settles in time", async () => {
  const v = await withTimeout(Promise.resolve(42), 1000, "test");
  assert.equal(v, 42);
});

test("withTimeout rejects after deadline", async () => {
  await assert.rejects(
    () =>
      withTimeout(
        new Promise<number>(() => {
          /* never */
        }),
        30,
        "hang"
      ),
    /hang: timed out after 30ms/
  );
});
