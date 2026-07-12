/**
 * A6-E ops: subscribe Default Tenant Test Page to Meta app webhooks.
 * Prints sanitized subscription state only — never tokens.
 *
 * Usage: node scripts/ops/subscribe-default-tenant-facebook-page.mjs
 */
import { readFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { decryptChannelCredentialCiphertext } from "../../src/lib/channelCredentialEncryption.js";

const TENANT = "6797c114-a4fe-4546-a655-8ce2287fedfe";
const PAGE_ID = "657955874072241";
const SMARTKORP = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function pullEnv() {
  const path = ".tmp-a6e-sub-env";
  execSync(`vercel env pull ${path} --environment production --yes`, { stdio: "pipe" });
  const text = readFileSync(path, "utf8");
  unlinkSync(path);
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    let v = line.slice(i + 1).replace(/\r$/, "");
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[line.slice(0, i)] = v;
  }
  return env;
}

async function main() {
  const env = pullEnv();
  const key = (env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY || "").trim();
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("missing_HUBCHAT_CREDENTIAL_ENCRYPTION_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("missing_supabase_env");

  const graphVersion = (env.META_GRAPH_VERSION || env.FACEBOOK_GRAPH_VERSION || "v25.0").replace(
    /^v?/,
    "v"
  );
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  const { data: conn, error: connErr } = await supabase
    .from("channel_connections")
    .select("id,tenant_id,status,provider_page_id,provider_account_name,webhook_active")
    .eq("tenant_id", TENANT)
    .eq("provider", "FACEBOOK")
    .maybeSingle();
  if (connErr) throw connErr;
  if (!conn || conn.provider_page_id !== PAGE_ID) {
    throw new Error("default_tenant_facebook_page_mismatch");
  }
  if (conn.tenant_id === SMARTKORP) throw new Error("refusing_smartkorp");

  const { data: cred, error: credErr } = await supabase
    .from("channel_credentials")
    .select("encrypted_secret_value")
    .eq("tenant_id", TENANT)
    .eq("connection_id", conn.id)
    .eq("credential_type", "ACCESS_TOKEN")
    .maybeSingle();
  if (credErr) throw credErr;
  if (!cred?.encrypted_secret_value) throw new Error("missing_page_token");

  const pageToken = decryptChannelCredentialCiphertext(cred.encrypted_secret_value, key);

  const listUrl = new URL(`https://graph.facebook.com/${graphVersion}/${PAGE_ID}/subscribed_apps`);
  listUrl.searchParams.set("access_token", pageToken);
  const beforeRes = await fetch(listUrl);
  const beforeBody = await beforeRes.json();
  const beforeFields = Array.isArray(beforeBody.data)
    ? beforeBody.data.flatMap((row) => (Array.isArray(row.subscribed_fields) ? row.subscribed_fields : []))
    : [];

  const fields = [
    "messages",
    "messaging_postbacks",
    "message_deliveries",
    "message_reads",
    "message_echoes"
  ];
  const postUrl = new URL(`https://graph.facebook.com/${graphVersion}/${PAGE_ID}/subscribed_apps`);
  postUrl.searchParams.set("subscribed_fields", fields.join(","));
  postUrl.searchParams.set("access_token", pageToken);
  const postRes = await fetch(postUrl, { method: "POST" });
  const postBody = await postRes.json();

  const afterRes = await fetch(listUrl);
  const afterBody = await afterRes.json();
  const afterApps = Array.isArray(afterBody.data) ? afterBody.data : [];
  const afterFields = afterApps.flatMap((row) =>
    Array.isArray(row.subscribed_fields) ? row.subscribed_fields : []
  );

  if (postBody.success === true) {
    await supabase
      .from("channel_connections")
      .update({
        webhook_active: true,
        webhook_endpoint: "https://smartkorp-hub-chat.vercel.app/api/webhook/facebook",
        updated_at: new Date().toISOString()
      })
      .eq("id", conn.id)
      .eq("tenant_id", TENANT);
  }

  console.log(
    JSON.stringify(
      {
        pageId: PAGE_ID,
        pageName: conn.provider_account_name,
        connectionStatus: conn.status,
        subscribeHttp: postRes.status,
        subscribeSuccess: postBody.success === true,
        beforeHadMessages: beforeFields.includes("messages"),
        afterHasMessages: afterFields.includes("messages"),
        afterFields: [...new Set(afterFields)].sort(),
        appCount: afterApps.length,
        note: "Routing fix still required so DEFAULT_TENANT_ID (SmartKorp) does not capture Test Page events."
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  process.exit(1);
});
