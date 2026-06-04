#!/usr/bin/env node
/**
 * LINE outbound credential migration pilot (dry-run by default).
 *
 * Reads credentials from env only (never CLI args):
 *   LINE_CHANNEL_ACCESS_TOKEN
 *   LINE_CHANNEL_SECRET
 *
 * Dry-run:
 *   node --import tsx scripts/ops/prepare-line-outbound-credential-migration.mjs \
 *     --tenant-id=<uuid> --provider-account-id=<line-oa-id>
 *
 * Execute (controlled ops window only — requires Supabase env):
 *   node --import tsx scripts/ops/prepare-line-outbound-credential-migration.mjs \
 *     --tenant-id=<uuid> --provider-account-id=<line-oa-id> --execute --dry-run=false
 *
 * Does not enable HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED. Do not use DB_ONLY.
 */
import { createClient } from "@supabase/supabase-js";
import {
  buildLineCredentialsFromEnv,
  prepareLineOutboundCredentialMigrationPilot,
  readLineCredentialEnvPresence,
  resolveLinePilotExecuteIntent,
  toSanitizedPilotJson
} from "../../src/application/channelConnect/prepareLineOutboundCredentialMigrationPilot.ts";
import { SupabaseChannelConnectionRepository } from "../../src/infrastructure/adapters/repositories/supabaseChannelConnectionRepository.ts";

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = (name) => {
    const pref = `--${name}=`;
    const hit = args.find((a) => a.startsWith(pref));
    return hit ? hit.slice(pref.length).trim() : undefined;
  };
  const has = (name) => args.includes(`--${name}`);
  const dryRunRaw = get("dry-run");
  return {
    tenantId: get("tenant-id"),
    providerAccountId: get("provider-account-id"),
    providerPageId: get("provider-page-id"),
    displayName: get("display-name"),
    execute: has("execute"),
    dryRun: dryRunRaw === "false" ? false : dryRunRaw === "true" ? true : undefined,
    help: has("help") || has("h")
  };
}

function printUsage() {
  console.log(`Usage:
  node --import tsx scripts/ops/prepare-line-outbound-credential-migration.mjs \\
    --tenant-id=<tenant-uuid> \\
    --provider-account-id=<line-bot-or-oa-id> \\
    [--provider-page-id=<optional>] \\
    [--display-name=<optional>]

  Default: dry-run (no DB writes).

  Execute (controlled ops only):
    ... --execute --dry-run=false

  Requires env: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET
  Execute also requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HUBCHAT_CREDENTIAL_ENCRYPTION_KEY
`);
}

async function main() {
  const cli = parseArgs(process.argv);
  if (cli.help || !cli.tenantId) {
    printUsage();
    process.exit(cli.help ? 0 : 1);
  }

  const envPresence = readLineCredentialEnvPresence(process.env);
  const credentialsFromEnv = buildLineCredentialsFromEnv(process.env);
  const { willExecute } = resolveLinePilotExecuteIntent({
    execute: cli.execute,
    dryRun: cli.dryRun
  });

  let channelConnectionRepository;
  if (willExecute) {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        JSON.stringify({
          error: "Execute requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment."
        })
      );
      process.exit(1);
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    channelConnectionRepository = new SupabaseChannelConnectionRepository(supabase);
  }

  const result = await prepareLineOutboundCredentialMigrationPilot(
    { channelConnectionRepository },
    {
      tenantId: cli.tenantId,
      providerAccountId: cli.providerAccountId,
      providerPageId: cli.providerPageId,
      displayName: cli.displayName,
      execute: cli.execute,
      dryRun: cli.dryRun,
      credentialsFromEnv,
      lineChannelAccessTokenEnvPresent: envPresence.lineChannelAccessTokenEnvPresent,
      lineChannelSecretEnvPresent: envPresence.lineChannelSecretEnvPresent
    }
  );

  console.log(toSanitizedPilotJson(result));
  process.exit(result.valid ? 0 : 1);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : "LINE pilot migration failed.";
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
});
