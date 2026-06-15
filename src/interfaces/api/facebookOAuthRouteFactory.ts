import { FacebookOAuthService } from "../../application/facebookOAuth/facebookOAuthService.js";
import type { apiBootstrap } from "./bootstrap.js";

export function createFacebookOAuthServiceFromBootstrap(
  bootstrap: typeof apiBootstrap
): FacebookOAuthService {
  const {
    channelConnectionRepository,
    oauthTransactionRepository,
    channelSettingRepository
  } = bootstrap();
  return new FacebookOAuthService({
    channelConnectionRepository,
    oauthTransactionRepository,
    channelSettingRepository
  });
}
