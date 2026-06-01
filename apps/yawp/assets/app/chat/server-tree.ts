import {
  createCategory,
  createChannel,
  listCategoriesForServer,
  listTextChannels,
  reorderCategories,
  reorderChannels,
} from '../ash_generated';

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

/**
 * Groups channels under their category, ordered by category position then
 * channel position. Channels with no category form a leading uncategorized
 * group (`category: null`).
 */
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
): Promise<{ok: boolean}> {
  const result = await createCategory({
    input: {serverId, name},
    fields: ['id'],
    customFetch: scopedFetch(serverUrl),
  });
  return {ok: result.success};
}

export async function createServerChannel(
  serverUrl: string,
  serverId: string,
  name: string,
  categoryId: string | null,
): Promise<{ok: boolean}> {
  const result = await createChannel({
    input: {serverId, name, type: 'text', categoryId},
    fields: ['id'],
    customFetch: scopedFetch(serverUrl),
  });
  return {ok: result.success};
}

export async function reorderServerChannels(
  serverUrl: string,
  serverId: string,
  orderedIds: string[],
): Promise<{ok: boolean}> {
  const result = await reorderChannels({
    input: {serverId, orderedIds},
    customFetch: scopedFetch(serverUrl),
  });
  return {ok: result.success};
}

export async function reorderServerCategories(
  serverUrl: string,
  serverId: string,
  orderedIds: string[],
): Promise<{ok: boolean}> {
  const result = await reorderCategories({
    input: {serverId, orderedIds},
    customFetch: scopedFetch(serverUrl),
  });
  return {ok: result.success};
}
