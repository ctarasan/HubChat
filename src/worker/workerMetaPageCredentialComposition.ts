import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseMetaPageCredentialRepository } from "../infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.js";
import { resolveChannelCredentialEncryptionKey } from "../lib/channelCredentialEncryption.js";
import type { WorkerEnv } from "../lib/workerEnv.js";

/** Mirrors `src/worker/main.ts` Meta Page credential repository wiring. */
export function createWorkerMetaPageCredentialRepository(
  supabase: SupabaseClient,
  env: WorkerEnv
): SupabaseMetaPageCredentialRepository {
  const workerEncryptionKey = resolveChannelCredentialEncryptionKey({ env });
  return new SupabaseMetaPageCredentialRepository(
    supabase,
    workerEncryptionKey.status === "configured" ? workerEncryptionKey.keyMaterial : undefined
  );
}
