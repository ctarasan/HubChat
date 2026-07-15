/**
 * Ops: subscribe Default Tenant (Connex/App Review) Facebook Page to HubChat webhooks.
 *
 * SAFE BY DEFAULT — dry-run only unless --apply is passed.
 * Uses the same union-preserving subscribed_fields helper as production OAuth (#316):
 * GET existing → union Messenger + feed → POST union → GET verify.
 * Never POSTs a Messenger-only list that would wipe feed.
 *
 * Usage:
 *   node --import tsx scripts/ops/subscribe-default-tenant-facebook-page.mjs
 *   node --import tsx scripts/ops/subscribe-default-tenant-facebook-page.mjs --apply
 *
 * Prints operator summary only — never page access tokens.
 * Does not target SmartKorp.
 */
import { readFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { decryptChannelCredentialCiphertext } from "../../src/lib/channelCredentialEncryption.js";
import {
  DEFAULT_TENANT_SUBSCRIBE_TARGET,
  parseSubscribeOpsCliArgs,
  redactSubscribeOpsText,
  runSubscribeDefaultTenantFacebookPage
} from "../../src/lib/ops/subscribeDefaultTenantFacebookPageOps.js";

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
  const cli = parseSubscribeOpsCliArgs(process.argv);
  if (cli.help) {
    console.log(`Usage:
  node --import tsx scripts/ops/subscribe-default-tenant-facebook-page.mjs
  node --import tsx scripts/ops/subscribe-default-tenant-facebook-page.mjs --apply

Default mode is dry-run (NO Graph POST).
--apply performs GET → union → POST → GET verify for the Default Tenant Page only.`);
    process.exit(0);
  }

  const env = pullEnv();
  const key = (env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY || "").trim();
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const appId = String(env.META_APP_ID || "").trim();
  if (!key) throw new Error("missing_HUBCHAT_CREDENTIAL_ENCRYPTION_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("missing_supabase_env");
  if (!appId) throw new Error("missing_or_invalid_META_APP_ID");

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
    .eq("tenant_id", DEFAULT_TENANT_SUBSCRIBE_TARGET.tenantId)
    .eq("provider", "FACEBOOK")
    .maybeSingle();
  if (connErr) throw connErr;
  if (!conn) throw new Error("default_tenant_facebook_connection_missing");

  const { data: cred, error: credErr } = await supabase
    .from("channel_credentials")
    .select("encrypted_secret_value")
    .eq("tenant_id", DEFAULT_TENANT_SUBSCRIBE_TARGET.tenantId)
    .eq("connection_id", conn.id)
    .eq("credential_type", "ACCESS_TOKEN")
    .maybeSingle();
  if (credErr) throw credErr;
  if (!cred?.encrypted_secret_value) throw new Error("missing_page_token");

  const pageToken = decryptChannelCredentialCiphertext(cred.encrypted_secret_value, key);

  const result = await runSubscribeDefaultTenantFacebookPage({
    mode: cli.mode,
    graphVersion,
    appId,
    pageAccessToken: pageToken,
    connection: {
      id: conn.id,
      tenantId: conn.tenant_id,
      status: conn.status,
      providerPageId: conn.provider_page_id,
      providerAccountName: conn.provider_account_name
    },
    secretsToRedact: [pageToken, key, serviceKey],
    onApplySuccess: async ({ connectionId, tenantId }) => {
      await supabase
        .from("channel_connections")
        .update({
          webhook_active: true,
          webhook_endpoint: DEFAULT_TENANT_SUBSCRIBE_TARGET.webhookEndpoint,
          updated_at: new Date().toISOString()
        })
        .eq("id", connectionId)
        .eq("tenant_id", tenantId);
    }
  });

  console.log(result.summaryText);
  if (!result.ok) {
    process.exit(result.exitCode);
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: redactSubscribeOpsText(String(err?.message || err))
    })
  );
  process.exit(1);
});
