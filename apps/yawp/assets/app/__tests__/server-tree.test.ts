import {groupChannelsByCategory, type ServerTree} from '../chat/server-tree';

const TREE: ServerTree = {
  categories: [
    {id: 'cat-b', name: 'Projects', position: 1},
    {id: 'cat-a', name: 'Information', position: 0},
  ],
  channels: [
    {id: 'ch-3', name: 'ship-log', categoryId: 'cat-a', position: 1},
    {id: 'ch-1', name: 'general', categoryId: null, position: 0},
    {id: 'ch-2', name: 'design', categoryId: 'cat-a', position: 0},
    {id: 'ch-4', name: 'roadmap', categoryId: 'cat-b', position: 0},
  ],
};

describe('groupChannelsByCategory', () => {
  test('uncategorized channels lead in a null-category group', () => {
    const groups = groupChannelsByCategory(TREE);
    expect(groups[0].category).toBeNull();
    expect(groups[0].channels.map(c => c.id)).toEqual(['ch-1']);
  });

  test('categories are ordered by position', () => {
    const groups = groupChannelsByCategory(TREE);
    expect(groups.slice(1).map(g => g.category?.name)).toEqual([
      'Information',
      'Projects',
    ]);
  });

  test('channels within a category are ordered by position', () => {
    const groups = groupChannelsByCategory(TREE);
    const info = groups.find(g => g.category?.id === 'cat-a');
    expect(info?.channels.map(c => c.name)).toEqual(['design', 'ship-log']);
  });

  test('an empty tree yields no groups', () => {
    expect(groupChannelsByCategory({categories: [], channels: []})).toEqual([]);
  });

  test('a category with no channels still appears (empty)', () => {
    const groups = groupChannelsByCategory({
      categories: [{id: 'cat-x', name: 'Empty', position: 0}],
      channels: [],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].channels).toEqual([]);
  });
});
