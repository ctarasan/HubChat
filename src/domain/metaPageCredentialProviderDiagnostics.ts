export type ProviderOperation = "DEBUG_TOKEN" | "PAGE_IDENTITY";

export type ProviderSubstage =
  | "DEBUG_TOKEN_REQUEST"
  | "DEBUG_TOKEN_PARSE"
  | "DEBUG_TOKEN_VALIDATE"
  | "DEBUG_TOKEN_APP_MATCH"
  | "DEBUG_TOKEN_SCOPE_CHECK"
  | "PAGE_IDENTITY_REQUEST"
  | "PAGE_IDENTITY_PARSE"
  | "PAGE_IDENTITY_VALIDATE"
  | "PAGE_IDENTITY_MATCH";

export type ProviderHttpStatusCategory =
  | "2XX"
  | "4XX"
  | "5XX"
  | "429"
  | "OTHER"
  | "NONE";

export type ProviderContentTypeCategory = "JSON" | "NON_JSON" | "EMPTY" | "UNKNOWN";

export type ProviderResponseShapeCategory =
  | "JSON_OBJECT"
  | "JSON_OBJECT_WITH_DATA"
  | "JSON_DATA_NULL"
  | "JSON_ERROR_OBJECT"
  | "EMPTY_BODY"
  | "NON_JSON"
  | "ARRAY"
  | "PRIMITIVE"
  | "OVERSIZED"
  | "UNKNOWN";

export type ProviderVerificationDiagnostic = {
  providerOperation: ProviderOperation;
  providerSubstage: ProviderSubstage;
  graphVersion: string;
  providerHttpStatusCategory: ProviderHttpStatusCategory;
  responseContentTypeCategory: ProviderContentTypeCategory;
  responseShapeCategory: ProviderResponseShapeCategory;
  safeProviderSubcode: string;
  hasData?: boolean;
  hasError?: boolean;
};

export type ProviderVerificationFailureLogFields = {
  providerOperation: ProviderOperation;
  providerSubstage: ProviderSubstage;
  graphVersion: string;
  providerHttpStatusCategory: ProviderHttpStatusCategory;
  responseContentTypeCategory: ProviderContentTypeCategory;
  responseShapeCategory: ProviderResponseShapeCategory;
  safeProviderSubcode: string;
  hasData?: boolean;
  hasError?: boolean;
};
