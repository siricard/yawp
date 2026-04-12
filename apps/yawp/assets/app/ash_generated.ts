

import type { AshRpcError, IdentityResourceSchema, InferResult, UnifiedFieldSelection, ValidationResult } from "./ash_types";
export type * from "./ash_types";

/**
 * Configuration options for action RPC requests
 */
export interface ActionConfig {
  input?: Record<string, any>;
  identity?: any;
  fields?: Array<string | Record<string, any>>; 
  filter?: Record<string, any>; 
  sort?: string | string[]; 
  page?:
    | {
        limit?: number;
        offset?: number;
        count?: boolean;
      }
    | {
        limit?: number;
        after?: string;
        before?: string;
      };

  metadataFields?: ReadonlyArray<string>;

  headers?: Record<string, string>; 
  fetchOptions?: RequestInit; 
  customFetch?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;

  tenant?: string; 

  hookCtx?: Record<string, any>;
}

/**
 * Configuration options for validation RPC requests
 */
export interface ValidationConfig {
  input?: Record<string, any>;

  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;

  hookCtx?: Record<string, any>;
}

/**
 * Gets the CSRF token from the page's meta tag
 * Returns null if no CSRF token is found
 */
export function getPhoenixCSRFToken(): string | null {
  return document
    ?.querySelector("meta[name='csrf-token']")
    ?.getAttribute("content") || null;
}

/**
 * Builds headers object with CSRF token for Phoenix applications
 * Returns headers object with X-CSRF-Token (if available)
 */
export function buildCSRFHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const csrfToken = getPhoenixCSRFToken();
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  return headers;
}

/**
 * Internal helper function for making action RPC requests
 * Handles hooks, request configuration, fetch execution, and error handling
 * @param config Configuration matching ActionConfig
 */
export async function executeActionRpcRequest<T>(
  payload: Record<string, any>,
  config: ActionConfig
): Promise<T> {
    const processedConfig = config;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...processedConfig.headers,
    ...config.headers,
  };

  const fetchFunction = config.customFetch || processedConfig.customFetch || fetch;
  const fetchOptions: RequestInit = {
    ...processedConfig.fetchOptions,
    ...config.fetchOptions,
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  };

  const response = await fetchFunction("/rpc/run", fetchOptions);
  const result = response.ok ? await response.json() : null;

  if (!response.ok) {
    return {
      success: false,
      errors: [
        {
          type: "network_error",
          message: `Network request failed: ${response.statusText}`,
          shortMessage: "Network error",
          vars: { statusCode: response.status, statusText: response.statusText },
          fields: [],
          path: [],
          details: { statusCode: response.status }
        }
      ],
    } as T;
  }

  return result as T;
}

/**
 * Internal helper function for making validation RPC requests
 * Handles hooks, request configuration, fetch execution, and error handling
 * @param config Configuration matching ValidationConfig
 */
export async function executeValidationRpcRequest<T>(
  payload: Record<string, any>,
  config: ValidationConfig
): Promise<T> {
    const processedConfig = config;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...processedConfig.headers,
    ...config.headers,
  };

  const fetchFunction = config.customFetch || processedConfig.customFetch || fetch;
  const fetchOptions: RequestInit = {
    ...processedConfig.fetchOptions,
    ...config.fetchOptions,
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  };

  const response = await fetchFunction("/rpc/validate", fetchOptions);
  const result = response.ok ? await response.json() : null;

  if (!response.ok) {
    return {
      success: false,
      errors: [
        {
          type: "network_error",
          message: `Network request failed: ${response.statusText}`,
          shortMessage: "Network error",
          vars: { statusCode: response.status, statusText: response.statusText },
          fields: [],
          path: [],
          details: { statusCode: response.status }
        }
      ],
    } as T;
  }

  return result as T;
}

export type ClaimChatOwnerInput = {
  claimToken: string;
  did: string;
  pk: string;
  senderSignature: string;
};

export type ClaimChatOwnerFields = UnifiedFieldSelection<IdentityResourceSchema>[];

export type InferClaimChatOwnerResult<
  Fields extends ClaimChatOwnerFields | undefined,
> = InferResult<IdentityResourceSchema, Fields>;

export type ClaimChatOwnerResult<Fields extends ClaimChatOwnerFields | undefined = undefined> = | { success: true; data: InferClaimChatOwnerResult<Fields>; }
| { success: false; errors: AshRpcError[]; }

;

/**
 * Create a new Identity
 *
 * @ashActionType :create
 */
export async function claimChatOwner<Fields extends ClaimChatOwnerFields | undefined = undefined>(
  config: {
  tenant?: string;
  input: ClaimChatOwnerInput;
  fields?: Fields;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ClaimChatOwnerResult<Fields extends undefined ? [] : Fields>> {
  const payload = {
    action: "claim_chat_owner",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    input: config.input,
    ...(config.fields !== undefined && { fields: config.fields })
  };

  return executeActionRpcRequest<ClaimChatOwnerResult<Fields extends undefined ? [] : Fields>>(
    payload,
    config
  );
}

/**
 * Validate: Create a new Identity
 *
 * @ashActionType :create
 * @validation true
 */
export async function validateClaimChatOwner(
  config: {
  tenant?: string;
  input: ClaimChatOwnerInput;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ValidationResult> {
  const payload = {
    action: "claim_chat_owner",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    input: config.input
  };

  return executeValidationRpcRequest<ValidationResult>(
    payload,
    config
  );
}

