import { apiBootstrap } from "./bootstrap.js";
import { VerifyMetaPageCredentialUseCase } from "../../application/metaPageCredentialVerification/verifyMetaPageCredential.js";
import { ActivateMetaPageCredentialUseCase } from "../../application/metaPageCredentialActivation/activateMetaPageCredential.js";
import { GraphMetaPageTokenInspector } from "../../infrastructure/adapters/meta/metaPageTokenInspector.js";
import { GraphMetaPageIdentityVerifier } from "../../infrastructure/adapters/meta/metaPageIdentityVerifier.js";
import { GraphMetaInstagramRelationshipVerifier } from "../../infrastructure/adapters/meta/metaInstagramRelationshipVerifier.js";
import { MetaGraphHttpClient } from "../../infrastructure/adapters/meta/metaGraphHttpClient.js";
import { SupabaseMetaPageCredentialActivationRepository } from "../../infrastructure/adapters/repositories/supabaseMetaPageCredentialActivationRepository.js";
import { SupabaseMetaPageCredentialRepository } from "../../infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.js";
import { buildMetaAppAccessToken } from "../../lib/metaPageCredentialProviderConfig.js";
import { readFacebookOAuthServerConfig } from "../../lib/facebookOAuthConfig.js";
import { MetaPageCredentialActivationApiError } from "../../lib/metaPageCredentialActivationApiErrors.js";

export function createActivateMetaPageCredentialUseCaseFromBootstrap(
  bootstrap: ReturnType<typeof apiBootstrap> = apiBootstrap()
): ActivateMetaPageCredentialUseCase {
  const config = readFacebookOAuthServerConfig();
  if (!config.appId || !config.appSecret) {
    throw new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_FAILED",
      "Meta app configuration is unavailable",
      503,
      false
    );
  }

  const httpClient = new MetaGraphHttpClient();
  const verifyMetaPageCredential = new VerifyMetaPageCredentialUseCase({
    tokenInspector: new GraphMetaPageTokenInspector({
      graphVersion: config.graphVersion,
      httpClient
    }),
    pageIdentityVerifier: new GraphMetaPageIdentityVerifier({
      graphVersion: config.graphVersion,
      httpClient
    }),
    instagramRelationshipVerifier: new GraphMetaInstagramRelationshipVerifier({
      graphVersion: config.graphVersion,
      httpClient
    }),
    appSecret: config.appSecret,
    resolveAppAccessToken: ({ appId, appSecret }) => buildMetaAppAccessToken(appId, appSecret)
  });

  return new ActivateMetaPageCredentialUseCase({
    verifyMetaPageCredential,
    activationPort: new SupabaseMetaPageCredentialActivationRepository(bootstrap.supabase),
    metaPageCredentialRepository: new SupabaseMetaPageCredentialRepository(bootstrap.supabase),
    channelConnectionRepository: bootstrap.channelConnectionRepository,
    expectedAppId: config.appId,
    graphVersion: config.graphVersion
  });
}
