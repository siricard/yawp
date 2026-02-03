

export type Binary = string;
export type UUID = string;

export type UserResourceSchema = {
  __type: "Resource";
  __primitiveFields: "id" | "email" | "publicKey" | "did" | "homeServer" | "recoveryMethods";
  id: UUID;
  email: string | null;
  publicKey: Binary | null;
  did: string | null;
  homeServer: string | null;
  recoveryMethods: Array<Record<string, any>>;
};

export type UserAttributesOnlySchema = {
  __type: "Resource";
  __primitiveFields: "id" | "email" | "publicKey" | "did" | "homeServer" | "recoveryMethods";
  id: UUID;
  email: string | null;
  publicKey: Binary | null;
  did: string | null;
  homeServer: string | null;
  recoveryMethods: Array<Record<string, any>>;
};

export type MessageResourceSchema = {
  __type: "Resource";
  __primitiveFields: "id" | "roomId" | "senderDid" | "content" | "ciphertextEnvelope" | "homeServer";
  id: UUID;
  roomId: UUID;
  senderDid: string;
  content: string;
  ciphertextEnvelope: Record<string, any> | null;
  homeServer: string | null;
};

export type MessageAttributesOnlySchema = {
  __type: "Resource";
  __primitiveFields: "id" | "roomId" | "senderDid" | "content" | "ciphertextEnvelope" | "homeServer";
  id: UUID;
  roomId: UUID;
  senderDid: string;
  content: string;
  ciphertextEnvelope: Record<string, any> | null;
  homeServer: string | null;
};

export type RoomResourceSchema = {
  __type: "Resource";
  __primitiveFields: "id" | "name" | "members" | "createdByDid";
  id: UUID;
  name: string;
  members: Array<string>;
  createdByDid: string;
};

export type RoomAttributesOnlySchema = {
  __type: "Resource";
  __primitiveFields: "id" | "name" | "members" | "createdByDid";
  id: UUID;
  name: string;
  members: Array<string>;
  createdByDid: string;
};

export type UserFilterInput = {
  and?: Array<UserFilterInput>;
  or?: Array<UserFilterInput>;
  not?: Array<UserFilterInput>;

  id?: {
    eq?: UUID;
    notEq?: UUID;
    in?: Array<UUID>;
  };

  email?: {
    eq?: string;
    notEq?: string;
    in?: Array<string>;
    isNil?: boolean;
  };

  publicKey?: {
    eq?: Binary;
    notEq?: Binary;
    in?: Array<Binary>;
    isNil?: boolean;
  };

  did?: {
    eq?: string;
    notEq?: string;
    in?: Array<string>;
    isNil?: boolean;
  };

  homeServer?: {
    eq?: string;
    notEq?: string;
    in?: Array<string>;
    isNil?: boolean;
  };

  recoveryMethods?: {
    eq?: Array<Record<string, any>>;
    notEq?: Array<Record<string, any>>;
    in?: Array<Array<Record<string, any>>>;
  };

};
export type MessageFilterInput = {
  and?: Array<MessageFilterInput>;
  or?: Array<MessageFilterInput>;
  not?: Array<MessageFilterInput>;

  id?: {
    eq?: UUID;
    notEq?: UUID;
    in?: Array<UUID>;
  };

  roomId?: {
    eq?: UUID;
    notEq?: UUID;
    in?: Array<UUID>;
  };

  senderDid?: {
    eq?: string;
    notEq?: string;
    in?: Array<string>;
  };

  content?: {
    eq?: string;
    notEq?: string;
    in?: Array<string>;
  };

  ciphertextEnvelope?: {
    eq?: Record<string, any>;
    notEq?: Record<string, any>;
    in?: Array<Record<string, any>>;
    isNil?: boolean;
  };

  homeServer?: {
    eq?: string;
    notEq?: string;
    in?: Array<string>;
    isNil?: boolean;
  };

};
export type RoomFilterInput = {
  and?: Array<RoomFilterInput>;
  or?: Array<RoomFilterInput>;
  not?: Array<RoomFilterInput>;

  id?: {
    eq?: UUID;
    notEq?: UUID;
    in?: Array<UUID>;
  };

  name?: {
    eq?: string;
    notEq?: string;
    in?: Array<string>;
  };

  members?: {
    eq?: Array<string>;
    notEq?: Array<string>;
    in?: Array<Array<string>>;
  };

  createdByDid?: {
    eq?: string;
    notEq?: string;
    in?: Array<string>;
  };

};

export const userFilterFields = ["id", "email", "publicKey", "did", "homeServer", "recoveryMethods"] as const;
export type UserFilterField = (typeof userFilterFields)[number];

export const messageFilterFields = ["id", "roomId", "senderDid", "content", "ciphertextEnvelope", "homeServer"] as const;
export type MessageFilterField = (typeof messageFilterFields)[number];

export const roomFilterFields = ["id", "name", "members", "createdByDid"] as const;
export type RoomFilterField = (typeof roomFilterFields)[number];

export const userSortFields = ["id", "email", "publicKey", "did", "homeServer", "recoveryMethods"] as const;
export type UserSortField = (typeof userSortFields)[number];

export const messageSortFields = ["id", "roomId", "senderDid", "content", "ciphertextEnvelope", "homeServer"] as const;
export type MessageSortField = (typeof messageSortFields)[number];

export const roomSortFields = ["id", "name", "members", "createdByDid"] as const;
export type RoomSortField = (typeof roomSortFields)[number];

export type SortString<T extends string> = T | `+${T}` | `-${T}` | `++${T}` | `--${T}`;

export type TypedSchema = {
  __type: "Resource" | "TypedMap" | "Union";
  __primitiveFields: string;
};

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

export type InferUnionFieldValue<
  UnionSchema extends { __type: "Union"; __primitiveFields: any },
  FieldSelection extends any[],
> = UnionToIntersection<
  {
    [FieldIndex in keyof FieldSelection]: FieldSelection[FieldIndex] extends UnionSchema["__primitiveFields"]
      ? FieldSelection[FieldIndex] extends keyof UnionSchema
        ? { [P in FieldSelection[FieldIndex]]: UnionSchema[FieldSelection[FieldIndex]] }
        : never
      : FieldSelection[FieldIndex] extends Record<string, any>
        ? {
            [UnionKey in keyof FieldSelection[FieldIndex]]: UnionKey extends keyof UnionSchema
              ? NonNullable<UnionSchema[UnionKey]> extends { __array: true; __type: "TypedMap"; __primitiveFields: infer TypedMapFields }
                ? FieldSelection[FieldIndex][UnionKey] extends any[]
                  ? Array<
                      UnionToIntersection<
                        {
                          [FieldIdx in keyof FieldSelection[FieldIndex][UnionKey]]: FieldSelection[FieldIndex][UnionKey][FieldIdx] extends TypedMapFields
                            ? FieldSelection[FieldIndex][UnionKey][FieldIdx] extends keyof NonNullable<UnionSchema[UnionKey]>
                              ? { [P in FieldSelection[FieldIndex][UnionKey][FieldIdx]]: NonNullable<UnionSchema[UnionKey]>[P] }
                              : never
                            : never;
                        }[number]
                      >
                    > | null
                  : never
                : NonNullable<UnionSchema[UnionKey]> extends { __type: "TypedMap"; __primitiveFields: infer TypedMapFields }
                  ? FieldSelection[FieldIndex][UnionKey] extends any[]
                    ? UnionToIntersection<
                        {
                          [FieldIdx in keyof FieldSelection[FieldIndex][UnionKey]]: FieldSelection[FieldIndex][UnionKey][FieldIdx] extends TypedMapFields
                            ? FieldSelection[FieldIndex][UnionKey][FieldIdx] extends keyof NonNullable<UnionSchema[UnionKey]>
                              ? { [P in FieldSelection[FieldIndex][UnionKey][FieldIdx]]: NonNullable<UnionSchema[UnionKey]>[P] }
                              : never
                            : never;
                        }[number]
                      > | null
                    : never
                  : NonNullable<UnionSchema[UnionKey]> extends TypedSchema
                    ? InferResult<NonNullable<UnionSchema[UnionKey]>, FieldSelection[FieldIndex][UnionKey]>
                    : never
              : never;
          }
        : never;
  }[number]
>;

export type HasComplexFields<T extends TypedSchema> = keyof Omit<
  T,
  "__primitiveFields" | "__type" | T["__primitiveFields"]
> extends never
  ? false
  : true;

export type ComplexFieldKeys<T extends TypedSchema> = keyof Omit<
  T,
  "__primitiveFields" | "__type" | T["__primitiveFields"]
>;

export type LeafFieldSelection<T extends TypedSchema> = T["__primitiveFields"];

export type ComplexFieldSelection<T extends TypedSchema> = {
  [K in ComplexFieldKeys<T>]?: T[K] extends {
    __type: "Relationship";
    __resource: infer Resource;
  }
    ? NonNullable<Resource> extends TypedSchema
      ? UnifiedFieldSelection<NonNullable<Resource>>[]
      : never
    : T[K] extends {
          __type: "ComplexCalculation";
          __returnType: infer ReturnType;
        }
      ? T[K] extends { __args: infer Args }
        ? NonNullable<ReturnType> extends TypedSchema
          ? {
              args: Args;
              fields: UnifiedFieldSelection<NonNullable<ReturnType>>[];
            }
          : { args: Args }
        : NonNullable<ReturnType> extends TypedSchema
          ? { fields: UnifiedFieldSelection<NonNullable<ReturnType>>[] }
          : never
      : T[K] extends { __type: "TypedMap" }
        ? NonNullable<T[K]> extends TypedSchema
          ? UnifiedFieldSelection<NonNullable<T[K]>>[]
          : never
        : T[K] extends { __type: "Union"; __primitiveFields: infer PrimitiveFields }
          ? T[K] extends { __array: true }
            ? (PrimitiveFields | {
                [UnionKey in keyof Omit<T[K], "__type" | "__primitiveFields" | "__array">]?: NonNullable<T[K][UnionKey]> extends { __type: "TypedMap"; __primitiveFields: any }
                  ? NonNullable<T[K][UnionKey]>["__primitiveFields"][]
                  : NonNullable<T[K][UnionKey]> extends TypedSchema
                    ? UnifiedFieldSelection<NonNullable<T[K][UnionKey]>>[]
                    : never;
              })[]
            : (PrimitiveFields | {
                [UnionKey in keyof Omit<T[K], "__type" | "__primitiveFields">]?: NonNullable<T[K][UnionKey]> extends { __type: "TypedMap"; __primitiveFields: any }
                  ? NonNullable<T[K][UnionKey]>["__primitiveFields"][]
                  : NonNullable<T[K][UnionKey]> extends TypedSchema
                    ? UnifiedFieldSelection<NonNullable<T[K][UnionKey]>>[]
                    : never;
              })[]
            : NonNullable<T[K]> extends TypedSchema
              ? UnifiedFieldSelection<NonNullable<T[K]>>[]
              : never;
};

export type UnifiedFieldSelection<T extends TypedSchema> =
  HasComplexFields<T> extends false
    ? LeafFieldSelection<T> 
    : LeafFieldSelection<T> | ComplexFieldSelection<T>; 

export type InferFieldValue<
  T extends TypedSchema,
  Field,
> = Field extends T["__primitiveFields"]
  ? Field extends keyof T
    ? { [K in Field]: T[Field] }
    : never
  : Field extends Record<string, any>
    ? {
        [K in keyof Field]: K extends keyof T
          ? T[K] extends {
              __type: "Relationship";
              __resource: infer Resource;
            }
            ? NonNullable<Resource> extends TypedSchema
              ? T[K] extends { __array: true }
                ? Array<InferResult<NonNullable<Resource>, Field[K]>>
                : null extends Resource
                  ? InferResult<NonNullable<Resource>, Field[K]> | null
                  : InferResult<NonNullable<Resource>, Field[K]>
            : never
          : T[K] extends {
                __type: "ComplexCalculation";
                __returnType: infer ReturnType;
              }
            ? NonNullable<ReturnType> extends TypedSchema
              ? null extends ReturnType
                ? InferResult<NonNullable<ReturnType>, Field[K]["fields"]> | null
                : InferResult<NonNullable<ReturnType>, Field[K]["fields"]>
              : ReturnType
            : NonNullable<T[K]> extends { __type: "TypedMap"; __primitiveFields: infer TypedMapFields }
              ? NonNullable<T[K]> extends { __array: true }
                ? Field[K] extends any[]
                  ? null extends T[K]
                    ? Array<
                        UnionToIntersection<
                          {
                            [FieldIndex in keyof Field[K]]: Field[K][FieldIndex] extends infer E
                              ? E extends TypedMapFields
                                ? E extends keyof NonNullable<T[K]>
                                  ? { [P in E]: NonNullable<T[K]>[P] }
                                  : never
                                : E extends Record<string, any>
                                  ? {
                                      [NestedKey in keyof E]: NestedKey extends keyof NonNullable<T[K]>
                                        ? NonNullable<NonNullable<T[K]>[NestedKey]> extends TypedSchema
                                          ? null extends NonNullable<T[K]>[NestedKey]
                                            ? InferResult<NonNullable<NonNullable<T[K]>[NestedKey]>, E[NestedKey]> | null
                                            : InferResult<NonNullable<NonNullable<T[K]>[NestedKey]>, E[NestedKey]>
                                          : never
                                        : never;
                                    }
                                  : E extends keyof NonNullable<T[K]>
                                    ? { [P in E]: NonNullable<T[K]>[P] }
                                    : never
                              : never;
                          }[number]
                        >
                      > | null
                    : Array<
                        UnionToIntersection<
                          {
                            [FieldIndex in keyof Field[K]]: Field[K][FieldIndex] extends infer E
                              ? E extends TypedMapFields
                                ? E extends keyof NonNullable<T[K]>
                                  ? { [P in E]: NonNullable<T[K]>[P] }
                                  : never
                                : E extends Record<string, any>
                                  ? {
                                      [NestedKey in keyof E]: NestedKey extends keyof NonNullable<T[K]>
                                        ? NonNullable<NonNullable<T[K]>[NestedKey]> extends TypedSchema
                                          ? null extends NonNullable<T[K]>[NestedKey]
                                            ? InferResult<NonNullable<NonNullable<T[K]>[NestedKey]>, E[NestedKey]> | null
                                            : InferResult<NonNullable<NonNullable<T[K]>[NestedKey]>, E[NestedKey]>
                                          : never
                                        : never;
                                    }
                                  : E extends keyof NonNullable<T[K]>
                                    ? { [P in E]: NonNullable<T[K]>[P] }
                                    : never
                              : never;
                          }[number]
                        >
                      >
                  : never
                : Field[K] extends any[]
                  ? null extends T[K]
                    ? UnionToIntersection<
                        {
                          [FieldIndex in keyof Field[K]]: Field[K][FieldIndex] extends infer E
                            ? E extends TypedMapFields
                              ? E extends keyof NonNullable<T[K]>
                                ? { [P in E]: NonNullable<T[K]>[P] }
                                : never
                              : E extends Record<string, any>
                                ? {
                                    [NestedKey in keyof E]: NestedKey extends keyof NonNullable<T[K]>
                                      ? NonNullable<NonNullable<T[K]>[NestedKey]> extends TypedSchema
                                        ? null extends NonNullable<T[K]>[NestedKey]
                                          ? InferResult<NonNullable<NonNullable<T[K]>[NestedKey]>, E[NestedKey]> | null
                                          : InferResult<NonNullable<NonNullable<T[K]>[NestedKey]>, E[NestedKey]>
                                        : never
                                      : never;
                                  }
                                : E extends keyof NonNullable<T[K]>
                                  ? { [P in E]: NonNullable<T[K]>[P] }
                                  : never
                            : never;
                        }[number]
                      > | null
                    : UnionToIntersection<
                        {
                          [FieldIndex in keyof Field[K]]: Field[K][FieldIndex] extends infer E
                            ? E extends TypedMapFields
                              ? E extends keyof T[K]
                                ? { [P in E]: T[K][P] }
                                : never
                              : E extends Record<string, any>
                                ? {
                                    [NestedKey in keyof E]: NestedKey extends keyof NonNullable<T[K]>
                                      ? NonNullable<NonNullable<T[K]>[NestedKey]> extends TypedSchema
                                        ? null extends NonNullable<T[K]>[NestedKey]
                                          ? InferResult<NonNullable<NonNullable<T[K]>[NestedKey]>, E[NestedKey]> | null
                                          : InferResult<NonNullable<NonNullable<T[K]>[NestedKey]>, E[NestedKey]>
                                        : never
                                      : never;
                                  }
                                : E extends keyof NonNullable<T[K]>
                                  ? { [P in E]: NonNullable<T[K]>[P] }
                                  : never
                            : never;
                        }[number]
                      >
                  : never
              : T[K] extends { __type: "Union"; __primitiveFields: any }
                ? T[K] extends { __array: true }
                  ? Field[K] extends any[]
                    ? null extends T[K]
                      ? Array<InferUnionFieldValue<T[K], Field[K]>> | null
                      : Array<InferUnionFieldValue<T[K], Field[K]>>
                    : never
                  : Field[K] extends any[]
                    ? null extends T[K]
                      ? InferUnionFieldValue<T[K], Field[K]> | null
                      : InferUnionFieldValue<T[K], Field[K]>
                    : never
                  : NonNullable<T[K]> extends TypedSchema
                    ? null extends T[K]
                      ? InferResult<NonNullable<T[K]>, Field[K]> | null
                      : InferResult<NonNullable<T[K]>, Field[K]>
                    : never
          : never;
      }
    : never;

export type InferResult<
  T extends TypedSchema,
  SelectedFields extends UnifiedFieldSelection<T>[] | undefined,
> = SelectedFields extends undefined
  ? {}
  : SelectedFields extends []
  ? {}
  : SelectedFields extends UnifiedFieldSelection<T>[]
  ? UnionToIntersection<
      {
        [K in keyof SelectedFields]: InferFieldValue<T, SelectedFields[K]>;
      }[number]
    >
  : {};

export type HasPaginationParams<Page> =
  Page extends { offset: any } ? true :
  Page extends { after: any } ? true :
  Page extends { before: any } ? true :
  false;

export type InferPaginationType<Page> =
  Page extends { offset: any } ? "offset" :
  Page extends { after: any } | { before: any } ? "keyset" :
  never;

// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ConditionalPaginatedResult<
  Page,
  RecordType,
  PaginatedType
> = Page extends undefined
  ? RecordType
  : HasPaginationParams<Page> extends true
    ? PaginatedType
    : RecordType;

export type ConditionalPaginatedResultMixed<
  Page,
  RecordType,
  OffsetType,
  KeysetType
> = Page extends undefined
  ? RecordType
  : HasPaginationParams<Page> extends true
    ? InferPaginationType<Page> extends "offset"
      ? OffsetType
      : InferPaginationType<Page> extends "keyset"
        ? KeysetType
        : OffsetType | KeysetType  
    : RecordType;

export type SuccessDataFunc<T extends (...args: any[]) => Promise<any>> = Extract<
  Awaited<ReturnType<T>>,
  { success: true }
>["data"];

export type ErrorData<T extends (...args: any[]) => Promise<any>> = Extract<
  Awaited<ReturnType<T>>,
  { success: false }
>["errors"];

/**
 * Represents an error from an unsuccessful RPC call.
 *
 * This type matches the error structure defined in the AshTypescript.Rpc.Error protocol.
 *
 * @example
 * const error: AshRpcError = {
 *   type: "invalid_changes",
 *   message: "Invalid value for field %{field}",
 *   shortMessage: "Invalid changes",
 *   vars: { field: "email" },
 *   fields: ["email"],
 *   path: ["user", "email"],
 *   details: { suggestion: "Provide a valid email address" }
 * }
 */
export type AshRpcError = {
  /** Machine-readable error type (e.g., "invalid_changes", "not_found") */
  type: string;
  /** Full error message (may contain template variables like %{key}) */
  message: string;
  /** Concise version of the message */
  shortMessage: string;
  /** Variables to interpolate into the message template */
  vars: Record<string, any>;
  /** List of affected field names (for field-level errors) */
  fields: string[];
  /** Path to the error location in the data structure */
  path: string[];
  /** Optional map with extra details (e.g., suggestions, hints) */
  details?: Record<string, any>;
}

/**
 * Represents the result of a validation RPC call.
 *
 * All validation actions return this same structure, indicating either
 * successful validation or a list of validation errors.
 *
 * @example
 * // Successful validation
 * const result: ValidationResult = { success: true };
 *
 * // Failed validation
 * const result: ValidationResult = {
 *   success: false,
 *   errors: [
 *     {
 *       type: "required",
 *       message: "is required",
 *       shortMessage: "Required field",
 *       vars: { field: "email" },
 *       fields: ["email"],
 *       path: []
 *     }
 *   ]
 * };
 */
export type ValidationResult =
  | { success: true }
  | { success: false; errors: AshRpcError[]; };

