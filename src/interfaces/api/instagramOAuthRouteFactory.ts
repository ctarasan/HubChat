import { InstagramOAuthConnectService } from "../../application/instagramOAuth/instagramOAuthConnectService.js";
import type {
  InstagramOAuthCredentialRepository,
  InstagramOAuthStateRepository
} from "../../domain/ports.js";
import { SupabaseInstagramOAuthCredentialRepository } from "../../infrastructure/adapters/repositories/supabaseInstagramOAuthCredentialRepository.js";
import { SupabaseInstagramOAuthStateRepository } from "../../infrastructure/adapters/repositories/supabaseInstagramOAuthStateRepository.js";
import { consoleInstagramOAuthAuditSink } from "../../lib/instagramOAuthAudit.js";
import type { apiBootstrap } from "./bootstrap.js";

export function createInstagramOAuthConnectServiceFromBootstrap(
  bootstrap: typeof apiBootstrap
): InstagramOAuthConnectService {
  const boot = bootstrap() as ReturnType<typeof apiBootstrap> & {
    instagramOAuthStateRepository?: InstagramOAuthStateRepository;
    instagramOAuthCredentialRepository?: InstagramOAuthCredentialRepository;
  };
  const {
    supabase,
    channelConnectionRepository,
    instagramOAuthStateRepository,
    instagramOAuthCredentialRepository
  } = boot;
  return new InstagramOAuthConnectService({
    channelConnectionRepository,
    instagramOAuthStateRepository:
      instagramOAuthStateRepository ?? new SupabaseInstagramOAuthStateRepository(supabase),
    instagramOAuthCredentialRepository:
      instagramOAuthCredentialRepository ?? new SupabaseInstagramOAuthCredentialRepository(supabase),
    auditSink: consoleInstagramOAuthAuditSink
  });
}
