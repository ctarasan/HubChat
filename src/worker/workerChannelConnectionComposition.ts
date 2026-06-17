import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseChannelConnectionRepository } from "../infrastructure/adapters/repositories/supabaseChannelConnectionRepository.js";
import { resolveChannelCredentialEncryptionKey } from "../lib/channelCredentialEncryption.js";
import type { WorkerEnv } from "../lib/workerEnv.js";

/** Mirrors `src/worker/main.ts` channel connection repository wiring. */
export function createWorkerChannelConnectionRepository(
  supabase: SupabaseClient,
  env: WorkerEnv
): SupabaseChannelConnectionRepository {
  const workerEncryptionKey = resolveChannelCredentialEncryptionKey({ env });
  return new SupabaseChannelConnectionRepository(
    supabase,
    workerEncryptionKey.status === "configured" ? workerEncryptionKey.keyMaterial : undefined
  );
}

export function isWorkerEncryptionKeyConfigured(env: WorkerEnv): boolean {
  return resolveChannelCredentialEncryptionKey({ env }).status === "configured";
}
