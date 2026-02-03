

import type { AshRpcError, Binary, ConditionalPaginatedResultMixed, InferResult, RoomFilterInput, RoomResourceSchema, RoomSortField, SortString, UUID, UnifiedFieldSelection, UserResourceSchema, ValidationResult } from "./ash_types";
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

export type RegisterWithPubkeyInput = {
  publicKey?: Binary | null;
  homeServer?: string | null;
};

export type RegisterWithPubkeyFields = UnifiedFieldSelection<UserResourceSchema>[];

export type InferRegisterWithPubkeyResult<
  Fields extends RegisterWithPubkeyFields | undefined,
> = InferResult<UserResourceSchema, Fields>;

export type RegisterWithPubkeyResult<Fields extends RegisterWithPubkeyFields | undefined = undefined> = | { success: true; data: InferRegisterWithPubkeyResult<Fields>; }
| { success: false; errors: AshRpcError[]; }

;

/**
 * Create a new User
 *
 * @ashActionType :create
 */
export async function registerWithPubkey<Fields extends RegisterWithPubkeyFields | undefined = undefined>(
  config: {
  tenant?: string;
  input?: RegisterWithPubkeyInput;
  fields?: Fields;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<RegisterWithPubkeyResult<Fields extends undefined ? [] : Fields>> {
  const payload = {
    action: "register_with_pubkey",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    input: config.input,
    ...(config.fields !== undefined && { fields: config.fields })
  };

  return executeActionRpcRequest<RegisterWithPubkeyResult<Fields extends undefined ? [] : Fields>>(
    payload,
    config
  );
}

/**
 * Validate: Create a new User
 *
 * @ashActionType :create
 * @validation true
 */
export async function validateRegisterWithPubkey(
  config: {
  tenant?: string;
  input?: RegisterWithPubkeyInput;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ValidationResult> {
  const payload = {
    action: "register_with_pubkey",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    input: config.input
  };

  return executeValidationRpcRequest<ValidationResult>(
    payload,
    config
  );
}

export type CreateRoomInput = {
  name: string;
  createdByDid: string;
};

export type CreateRoomFields = UnifiedFieldSelection<RoomResourceSchema>[];

export type InferCreateRoomResult<
  Fields extends CreateRoomFields | undefined,
> = InferResult<RoomResourceSchema, Fields>;

export type CreateRoomResult<Fields extends CreateRoomFields | undefined = undefined> = | { success: true; data: InferCreateRoomResult<Fields>; }
| { success: false; errors: AshRpcError[]; }

;

/**
 * Create a new Room
 *
 * @ashActionType :create
 */
export async function createRoom<Fields extends CreateRoomFields | undefined = undefined>(
  config: {
  tenant?: string;
  input: CreateRoomInput;
  fields?: Fields;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<CreateRoomResult<Fields extends undefined ? [] : Fields>> {
  const payload = {
    action: "create_room",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    input: config.input,
    ...(config.fields !== undefined && { fields: config.fields })
  };

  return executeActionRpcRequest<CreateRoomResult<Fields extends undefined ? [] : Fields>>(
    payload,
    config
  );
}

/**
 * Validate: Create a new Room
 *
 * @ashActionType :create
 * @validation true
 */
export async function validateCreateRoom(
  config: {
  tenant?: string;
  input: CreateRoomInput;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ValidationResult> {
  const payload = {
    action: "create_room",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    input: config.input
  };

  return executeValidationRpcRequest<ValidationResult>(
    payload,
    config
  );
}

export type JoinRoomInput = {
  did: string;
};

export type JoinRoomFields = UnifiedFieldSelection<RoomResourceSchema>[];

export type InferJoinRoomResult<
  Fields extends JoinRoomFields | undefined,
> = InferResult<RoomResourceSchema, Fields>;

export type JoinRoomResult<Fields extends JoinRoomFields | undefined = undefined> = | { success: true; data: InferJoinRoomResult<Fields>; }
| { success: false; errors: AshRpcError[]; }

;

/**
 * Update an existing Room
 *
 * @ashActionType :update
 */
export async function joinRoom<Fields extends JoinRoomFields | undefined = undefined>(
  config: {
  tenant?: string;
  identity: UUID;
  input: JoinRoomInput;
  fields?: Fields;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<JoinRoomResult<Fields extends undefined ? [] : Fields>> {
  const payload = {
    action: "join_room",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    identity: config.identity,
    input: config.input,
    ...(config.fields !== undefined && { fields: config.fields })
  };

  return executeActionRpcRequest<JoinRoomResult<Fields extends undefined ? [] : Fields>>(
    payload,
    config
  );
}

/**
 * Validate: Update an existing Room
 *
 * @ashActionType :update
 * @validation true
 */
export async function validateJoinRoom(
  config: {
  tenant?: string;
  identity: UUID | string;
  input: JoinRoomInput;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ValidationResult> {
  const payload = {
    action: "join_room",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    identity: config.identity,
    input: config.input
  };

  return executeValidationRpcRequest<ValidationResult>(
    payload,
    config
  );
}

export type ListRoomsFields = UnifiedFieldSelection<RoomResourceSchema>[];

export type InferListRoomsResult<
  Fields extends ListRoomsFields | undefined,
  Page extends ListRoomsConfig["page"] = undefined
> = ConditionalPaginatedResultMixed<Page, Array<InferResult<RoomResourceSchema, Fields>>, {
  results: Array<InferResult<RoomResourceSchema, Fields>>;
  hasMore: boolean;
  limit: number;
  offset: number;
  count?: number | null;
  type: "offset";
}, {
  results: Array<InferResult<RoomResourceSchema, Fields>>;
  hasMore: boolean;
  limit: number;
  after: string | null;
  before: string | null;
  previousPage: string;
  nextPage: string;
  count?: number | null;
  type: "keyset";
}>;

export type ListRoomsConfig = {
  tenant?: string;
  fields: ListRoomsFields;
  filter?: RoomFilterInput;
  sort?: SortString<RoomSortField> | SortString<RoomSortField>[];
  page?: (
    {
      limit?: number;
      offset?: number;
      count?: boolean;
    } | {
      limit?: number;
      after?: string;
      before?: string;
    }
  );
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export type ListRoomsResult<Fields extends ListRoomsFields, Page extends ListRoomsConfig["page"] = undefined> = | { success: true; data: InferListRoomsResult<Fields, Page>; }
| { success: false; errors: AshRpcError[]; }

;

/**
 * Read Room records
 *
 * @ashActionType :read
 */
export async function listRooms<Fields extends ListRoomsFields, Config extends ListRoomsConfig = ListRoomsConfig>(
  config: Config & { fields: Fields }
): Promise<ListRoomsResult<Fields, Config["page"]>> {
  const payload = {
    action: "list_rooms",
    ...(config.tenant !== undefined && { tenant: config.tenant }),
    ...(config.fields !== undefined && { fields: config.fields }),
    ...(config.filter && { filter: config.filter }),
    ...(config.sort && { sort: Array.isArray(config.sort) ? config.sort.join(",") : config.sort }),
    ...(config.page && { page: config.page })
  };

  return executeActionRpcRequest<ListRoomsResult<Fields, Config["page"]>>(
    payload,
    config
  );
}

/**
 * Validate: Read Room records
 *
 * @ashActionType :read
 * @validation true
 */
export async function validateListRooms(
  config: {
  tenant?: string;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
): Promise<ValidationResult> {
  const payload = {
    action: "list_rooms",
    ...(config.tenant !== undefined && { tenant: config.tenant })
  };

  return executeValidationRpcRequest<ValidationResult>(
    payload,
    config
  );
}

