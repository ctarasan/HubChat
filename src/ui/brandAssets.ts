/** Public SmartKorp brand assets under `/public/brand`. */
export const SMARTKORP_BRAND_ASSETS = {
  /** Horizontal wordmark (mark + SMARTKORP) on square JPEG canvas. */
  wordmark: "/brand/AW_SmartKorp_Logo_Serie-01.jpg",
  /** Stacked mark above wordmark. */
  stacked: "/brand/AW_SmartKorp_Logo_Serie-02.jpg",
  /**
   * Login-only cropped transparent wordmark derived from Serie-01.
   * Use this on `/login` so the painted logo fills the rendered box.
   */
  loginWordmark: "/brand/smartkorp-wordmark-login.png"
} as const;

export const SMARTKORP_BRAND_ALT = "SmartKorp";
