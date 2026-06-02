import {
  createCategory,
  createChannel,
  destroyChannel,
  listCategoriesForServer,
  listTextChannels,
  recategorizeChannel,
  reorderCategories,
  reorderChannels,
} from '../ash_generated';
import {getValidSessionToken} from '../session';

export type MutationResult = {ok: boolean; error?: string; message?: string};

const SLUG_MESSAGES: Record<string, string> = {
  not_authenticated: 'You must be signed in on this server.',
  missing_permission: "You don't have permission to manage channels.",
  no_session: 'No active session on this anchor. Re-add the server.',
  rotation_failed: 'Your session expired. Re-add the server.',
  network_error: 'Could not reach the server. Check your connection.',
  internal_error: 'The server hit an internal error. Try again later.',
};

function humanize(slug: string, fallback: string): string {
  return SLUG_MESSAGES[slug] ?? fallback;
}

type AuthHeadersResult =
  | {ok: true; headers: Record<string, string>}
  | {ok: false; error: string; message: string};

async function authHeaders(serverUrl: string): Promise<AuthHeadersResult> {
  const session = await getValidSessionToken({serverUrl});
  if (!session.ok) {
    return {ok: false, error: session.reason, message: humanize(session.reason, 'No session.')};
  }
  return {ok: true, headers: {Authorization: `Bearer ${session.sessionToken}`}};
}

function failure(errors: {type?: string; message?: string}[]): MutationResult {
  const first = errors[0];
  const slug = first?.type ?? 'internal_error';
  return {ok: false, error: slug, message: humanize(slug, first?.message ?? 'Server error.')};
}

export type TreeChannel = {
  id: string;
  name: string;
  categoryId: string | null;
  position: number;
  unreadCount?: number;
};

export type TreeCategory = {
  id: string;
  name: string;
  position: number;
};

export type ServerTree = {
  categories: TreeCategory[];
  channels: TreeChannel[];
};

export type CategoryGroup = {
  category: TreeCategory | null;
  channels: TreeChannel[];
};

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function scopedFetch(serverUrl: string): typeof fetch {
  const base = normalizeServerUrl(serverUrl);
  return (input, init) => {
    if (typeof input === 'string' && input.startsWith('/rpc/')) {
      return fetch(`${base}${input}`, init);
    }
    return fetch(input as RequestInfo, init);
  };
}

export async function fetchServerTree(
  serverUrl: string,
  serverId: string,
): Promise<ServerTree> {
  const customFetch = scopedFetch(serverUrl);

  const [cats, chans] = await Promise.all([
    listCategoriesForServer({
      input: {serverId},
      fields: ['id', 'name', 'position'],
      customFetch,
    }),
    listTextChannels({
      fields: ['id', 'name', 'position', 'categoryId'],
      filter: {serverId: {eq: serverId}},
      customFetch,
    }),
  ]);

  const categories: TreeCategory[] = cats.success
    ? cats.data.map(c => ({
        id: c.id as string,
        name: c.name as string,
        position: c.position as number,
      }))
    : [];

  const channels: TreeChannel[] = chans.success
    ? chans.data.map(c => ({
        id: c.id as string,
        name: c.name as string,
        categoryId: (c.categoryId as string | null) ?? null,
        position: c.position as number,
      }))
    : [];

  return {categories, channels};
}

export function groupChannelsByCategory(tree: ServerTree): CategoryGroup[] {
  const byPosition = (a: {position: number}, b: {position: number}) =>
    a.position - b.position;

  const sortedCats = [...tree.categories].sort(byPosition);
  const sortedChans = [...tree.channels].sort(byPosition);

  const groups: CategoryGroup[] = [];

  const uncategorized = sortedChans.filter(c => c.categoryId === null);
  if (uncategorized.length > 0) {
    groups.push({category: null, channels: uncategorized});
  }

  for (const category of sortedCats) {
    groups.push({
      category,
      channels: sortedChans.filter(c => c.categoryId === category.id),
    });
  }

  return groups;
}

export async function createServerCategory(
  serverUrl: string,
  serverId: string,
  name: string,
): Promise<MutationResult> {
  const auth = await authHeaders(serverUrl);
  if (auth.ok !== true) return auth;
  const result = await createCategory({
    input: {serverId, name},
    fields: ['id'],
    headers: auth.headers,
    customFetch: scopedFetch(serverUrl),
  });
  return result.success ? {ok: true} : failure(result.errors);
}

export async function createServerChannel(
  serverUrl: string,
  serverId: string,
  name: string,
  categoryId: string | null,
): Promise<MutationResult> {
  const auth = await authHeaders(serverUrl);
  if (auth.ok !== true) return auth;
  const result = await createChannel({
    input: {serverId, name, type: 'text', categoryId},
    fields: ['id'],
    headers: auth.headers,
    customFetch: scopedFetch(serverUrl),
  });
  return result.success ? {ok: true} : failure(result.errors);
}

export async function reorderServerChannels(
  serverUrl: string,
  serverId: string,
  orderedIds: string[],
): Promise<MutationResult> {
  const auth = await authHeaders(serverUrl);
  if (auth.ok !== true) return auth;
  const result = await reorderChannels({
    input: {serverId, orderedIds},
    headers: auth.headers,
    customFetch: scopedFetch(serverUrl),
  });
  return result.success ? {ok: true} : failure(result.errors);
}

export async function reorderServerCategories(
  serverUrl: string,
  serverId: string,
  orderedIds: string[],
): Promise<MutationResult> {
  const auth = await authHeaders(serverUrl);
  if (auth.ok !== true) return auth;
  const result = await reorderCategories({
    input: {serverId, orderedIds},
    headers: auth.headers,
    customFetch: scopedFetch(serverUrl),
  });
  return result.success ? {ok: true} : failure(result.errors);
}

export async function recategorizeServerChannel(
  serverUrl: string,
  channelId: string,
  categoryId: string | null,
  position?: number,
): Promise<MutationResult> {
  const auth = await authHeaders(serverUrl);
  if (auth.ok !== true) return auth;
  const result = await recategorizeChannel({
    identity: channelId,
    input: {categoryId, ...(position !== undefined ? {position} : {})},
    fields: ['id'],
    headers: auth.headers,
    customFetch: scopedFetch(serverUrl),
  });
  return result.success ? {ok: true} : failure(result.errors);
}

export async function destroyServerChannel(
  serverUrl: string,
  channelId: string,
): Promise<MutationResult> {
  const auth = await authHeaders(serverUrl);
  if (auth.ok !== true) return auth;
  const result = await destroyChannel({
    identity: channelId,
    headers: auth.headers,
    customFetch: scopedFetch(serverUrl),
  });
  return result.success ? {ok: true} : failure(result.errors);
}
