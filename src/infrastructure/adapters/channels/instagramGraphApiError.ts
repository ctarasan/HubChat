export class InstagramGraphApiError extends Error {
  override readonly name = "InstagramGraphApiError";

  constructor(
    public readonly httpStatus: number,
    /** Path only, e.g. /v25.0/me/messages (no token, no query string) */
    public readonly graphPathForLog: string,
    public readonly meta: {
      message?: string;
      type?: string;
      code?: number;
      error_subcode?: number;
      fbtrace_id?: string;
    },
    public readonly rawBody: string
  ) {
    super(`Instagram Send API failed (${httpStatus}): ${rawBody}`);
  }
}
