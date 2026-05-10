

import type { AshRpcError, IdentityResourceSchema, InferResult, RefreshTokenResourceSchema, ServerChannelFilterInput, ServerChannelResourceSchema, ServerChannelSortField, SortString, UUID, UnifiedFieldSelection, UtcDateTimeUsec, ValidationResult } from "./ash_types";
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

export type BindDeviceInput = {
  deviceId: UUID;
  devicePk: string;
  deviceSignature: string;
  senderSignature: string;
  deviceIssuedAt: string;
  requestIssuedAt: string;
};

export type BindDeviceFields = UnifiedFieldSelection<IdentityResourceSchema>[];

export type BindDeviceMetadata = {
  sessionToken?: string;
  refreshToken?: string;
  expiresAt?: UtcDateTimeUsec;
};

export type InferBindDeviceResult<
  Fields extends BindDeviceFields | undefined,
  MetadataFields extends ReadonlyArray<keyof BindDeviceMetadata> = []
> = InferResult<IdentityResourceSchema, Fields>;

export type BindDeviceResult<Fields extends BindDeviceFields | undefined = undefined, MetadataFields extends ReadonlyArray<keyof BindDeviceMetadata> = []> = | { success: true; data: InferBindDeviceResult<Fields>; metadata: Pick<BindDeviceMetadata, MetadataFields[number]>; }
| { success: false; errors: AshRpcError[]; }

;

/**
 * Update an existing Identity
 *
 * @ashActionType :update
 */
export async function bindDevice<Fields extends BindDeviceFields | undefined = undefined, MetadataFields extends ReadonlyArray<keyof BindDeviceMetadata> = []>(
  config: {
  tenant?: string;
  identity: { did: string };
  input: BindDeviceInput;
  fields?: Fields;
  metadataFields?: MetadataFields;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<BindDeviceResult<Fields extends undefined ? [] : Fields, MetadataFields>> {
  const payload = {
    action: "bind_device",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    identity: config.identity,
    input: config.input,
    ...(config.fields !== undefined && { fields: config.fields }),
    ...(config.metadataFields && { metadataFields: config.metadataFields })
  };

  return executeActionRpcRequest<BindDeviceResult<Fields extends undefined ? [] : Fields, MetadataFields>>(
    payload,
    config
  );
}

/**
 * Validate: Update an existing Identity
 *
 * @ashActionType :update
 * @validation true
 */
export async function validateBindDevice(
  config: {
  tenant?: string;
  identity: { did: string };
  input: BindDeviceInput;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ValidationResult> {
  const payload = {
    action: "bind_device",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    identity: config.identity,
    input: config.input
  };

  return executeValidationRpcRequest<ValidationResult>(
    payload,
    config
  );
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

export type RevokeDeviceSessionsInput = {
  deviceId: UUID;
};

export type RevokeDeviceSessionsFields = UnifiedFieldSelection<IdentityResourceSchema>[];

export type InferRevokeDeviceSessionsResult<
  Fields extends RevokeDeviceSessionsFields | undefined,
> = InferResult<IdentityResourceSchema, Fields>;

export type RevokeDeviceSessionsResult<Fields extends RevokeDeviceSessionsFields | undefined = undefined> = | { success: true; data: InferRevokeDeviceSessionsResult<Fields>; }
| { success: false; errors: AshRpcError[]; }

;

/**
 * Update an existing Identity
 *
 * @ashActionType :update
 */
export async function revokeDeviceSessions<Fields extends RevokeDeviceSessionsFields | undefined = undefined>(
  config: {
  tenant?: string;
  identity: { did: string };
  input: RevokeDeviceSessionsInput;
  fields?: Fields;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<RevokeDeviceSessionsResult<Fields extends undefined ? [] : Fields>> {
  const payload = {
    action: "revoke_device_sessions",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    identity: config.identity,
    input: config.input,
    ...(config.fields !== undefined && { fields: config.fields })
  };

  return executeActionRpcRequest<RevokeDeviceSessionsResult<Fields extends undefined ? [] : Fields>>(
    payload,
    config
  );
}

/**
 * Validate: Update an existing Identity
 *
 * @ashActionType :update
 * @validation true
 */
export async function validateRevokeDeviceSessions(
  config: {
  tenant?: string;
  identity: { did: string };
  input: RevokeDeviceSessionsInput;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ValidationResult> {
  const payload = {
    action: "revoke_device_sessions",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    identity: config.identity,
    input: config.input
  };

  return executeValidationRpcRequest<ValidationResult>(
    payload,
    config
  );
}

export type RotateRefreshInput = {
  token: string;
};

export type RotateRefreshFields = UnifiedFieldSelection<RefreshTokenResourceSchema>[];

export type RotateRefreshMetadata = {
  sessionToken?: string;
  refreshToken?: string;
  expiresAt?: UtcDateTimeUsec;
};

export type InferRotateRefreshResult<
  Fields extends RotateRefreshFields | undefined,
  MetadataFields extends ReadonlyArray<keyof RotateRefreshMetadata> = []
> = InferResult<RefreshTokenResourceSchema, Fields>;

export type RotateRefreshResult<Fields extends RotateRefreshFields | undefined = undefined, MetadataFields extends ReadonlyArray<keyof RotateRefreshMetadata> = []> = | { success: true; data: InferRotateRefreshResult<Fields>; metadata: Pick<RotateRefreshMetadata, MetadataFields[number]>; }
| { success: false; errors: AshRpcError[]; }

;

/**
 * Create a new RefreshToken
 *
 * @ashActionType :create
 */
export async function rotateRefresh<Fields extends RotateRefreshFields | undefined = undefined, MetadataFields extends ReadonlyArray<keyof RotateRefreshMetadata> = []>(
  config: {
  tenant?: string;
  input: RotateRefreshInput;
  fields?: Fields;
  metadataFields?: MetadataFields;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<RotateRefreshResult<Fields extends undefined ? [] : Fields, MetadataFields>> {
  const payload = {
    action: "rotate_refresh",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    input: config.input,
    ...(config.fields !== undefined && { fields: config.fields }),
    ...(config.metadataFields && { metadataFields: config.metadataFields })
  };

  return executeActionRpcRequest<RotateRefreshResult<Fields extends undefined ? [] : Fields, MetadataFields>>(
    payload,
    config
  );
}

/**
 * Validate: Create a new RefreshToken
 *
 * @ashActionType :create
 * @validation true
 */
export async function validateRotateRefresh(
  config: {
  tenant?: string;
  input: RotateRefreshInput;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ValidationResult> {
  const payload = {
    action: "rotate_refresh",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    input: config.input
  };

  return executeValidationRpcRequest<ValidationResult>(
    payload,
    config
  );
}

export type ListTextChannelsFields = UnifiedFieldSelection<ServerChannelResourceSchema>[];
export type InferListTextChannelsResult<
  Fields extends ListTextChannelsFields,
> = Array<InferResult<ServerChannelResourceSchema, Fields>>;

export type ListTextChannelsResult<Fields extends ListTextChannelsFields> = | { success: true; data: InferListTextChannelsResult<Fields>; }
| { success: false; errors: AshRpcError[]; }

;

/**
 * Read Channel records
 *
 * @ashActionType :read
 */
export async function listTextChannels<Fields extends ListTextChannelsFields>(
  config: {
  tenant?: string;
  fields: Fields;
  filter?: ServerChannelFilterInput;
  sort?: SortString<ServerChannelSortField> | SortString<ServerChannelSortField>[];
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ListTextChannelsResult<Fields>> {
  const payload = {
    action: "list_text_channels",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    ...(config.fields !== undefined && { fields: config.fields }),
    ...(config.filter && { filter: config.filter }),
    ...(config.sort && { sort: Array.isArray(config.sort) ? config.sort.join(",") : config.sort })
  };

  return executeActionRpcRequest<ListTextChannelsResult<Fields>>(
    payload,
    config
  );
}

/**
 * Validate: Read Channel records
 *
 * @ashActionType :read
 * @validation true
 */
export async function validateListTextChannels(
  config: {
  tenant?: string;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ValidationResult> {
  const payload = {
    action: "list_text_channels",
    ...(config.tenant !== undefined && { tenant: config.tenant })
  };

  return executeValidationRpcRequest<ValidationResult>(
    payload,
    config
  );
}

export type RedeemServerInviteInput = {
  token: string;
  did: string;
  pk: string;
  senderSignature: string;
};

export type RedeemServerInviteFields = UnifiedFieldSelection<{serverId: UUID | null, role: string | null, __type: "TypedMap", __primitiveFields: "serverId" | "role"}>[];

export type InferRedeemServerInviteResult<
  Fields extends RedeemServerInviteFields | undefined,
> = InferResult<{serverId: UUID | null, role: string | null, __type: "TypedMap", __primitiveFields: "serverId" | "role"}, Fields>;

export type RedeemServerInviteResult<Fields extends RedeemServerInviteFields | undefined = undefined> = | { success: true; data: InferRedeemServerInviteResult<Fields>; }
| { success: false; errors: AshRpcError[]; }

;

/**
 * Execute generic action on ServerInvite
 *
 * @ashActionType :action
 */
export async function redeemServerInvite<Fields extends RedeemServerInviteFields | undefined = undefined>(
  config: {
  tenant?: string;
  input: RedeemServerInviteInput;
  fields: Fields;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<RedeemServerInviteResult<Fields extends undefined ? [] : Fields>> {
  const payload = {
    action: "redeem_server_invite",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    input: config.input,
    ...(config.fields !== undefined && { fields: config.fields })
  };

  return executeActionRpcRequest<RedeemServerInviteResult<Fields extends undefined ? [] : Fields>>(
    payload,
    config
  );
}

/**
 * Validate: Execute generic action on ServerInvite
 *
 * @ashActionType :action
 * @validation true
 */
export async function validateRedeemServerInvite(
  config: {
  tenant?: string;
  input: RedeemServerInviteInput;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ValidationResult> {
  const payload = {
    action: "redeem_server_invite",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    input: config.input
  };

  return executeValidationRpcRequest<ValidationResult>(
    payload,
    config
  );
}

