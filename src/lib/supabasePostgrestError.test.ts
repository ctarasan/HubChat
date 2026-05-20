import test from "node:test";
import assert from "node:assert/strict";
import { toClientErrorDetail, throwIfSupabaseError } from "./supabasePostgrestError.js";
import { serverError } from "../interfaces/api/http.js";

test("toClientErrorDetail exposes PostgREST fields without [object Object]", () => {
  const postgrest = {
    message: "Could not find the table 'public.channel_settings' in the schema cache",
    code: "PGRST205",
    details: null,
    hint: "Perhaps refresh the schema cache"
  };
  const detail = toClientErrorDetail(postgrest);
  assert.equal(detail.message, postgrest.message);
  assert.equal(detail.code, "PGRST205");
  assert.equal(detail.hint, postgrest.hint);
  assert.equal(JSON.stringify(detail).includes("secret_json"), false);
});

test("serverError detail is structured not String(object)", async () => {
  const res = serverError({
    message: "permission denied for table channel_settings",
    code: "42501"
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; detail: { message: string; code?: string } };
  assert.equal(body.error, "Internal server error");
  assert.equal(body.detail.message, "permission denied for table channel_settings");
  assert.equal(body.detail.code, "42501");
  assert.equal(typeof body.detail, "object");
  assert.notEqual(body.detail.message, "[object Object]");
});

test("throwIfSupabaseError throws Error with message from PostgREST object", () => {
  assert.throws(
    () =>
      throwIfSupabaseError({
        message: "column channel_settings.foo does not exist",
        code: "42703"
      }),
    (e: unknown) => {
      assert.ok(e instanceof Error);
      assert.equal((e as Error).message, "column channel_settings.foo does not exist");
      return true;
    }
  );
});
