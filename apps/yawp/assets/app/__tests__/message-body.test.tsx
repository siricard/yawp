import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {MessageBody} from '../chat/MessageBody';

function render(node: React.ReactElement) {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(node);
  });
  return root!;
}

function countHost(
  root: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): number {
  return root.root
    .findAllByProps({testID})
    .filter(n => typeof n.type === 'string').length;
}

function hostText(root: ReactTestRenderer.ReactTestRenderer, testID: string) {
  return root.root
    .findAllByProps({testID})
    .filter(n => typeof n.type === 'string')[0];
}

describe('MessageBody', () => {
  test('renders a user mention chip with a testID', () => {
    const root = render(<MessageBody body="hi @nova" />);
    expect(countHost(root, 'mention-user')).toBe(1);
  });

  test('renders @everyone and @here mention chips', () => {
    const root = render(<MessageBody body="@everyone @here" />);
    expect(countHost(root, 'mention-everyone')).toBe(1);
    expect(countHost(root, 'mention-here')).toBe(1);
  });

  test('renders a role mention chip', () => {
    const root = render(<MessageBody body="@&admins ping" />);
    expect(countHost(root, 'mention-role')).toBe(1);
  });

  test('renders deleted placeholder when body is null', () => {
    const root = render(<MessageBody body={null} testID="mb" />);
    expect(hostText(root, 'mb').props.children).toBe('[deleted]');
  });

  test('renders deleted placeholder when deleted flag is set', () => {
    const root = render(<MessageBody body="still here" deleted testID="mb" />);
    expect(hostText(root, 'mb').props.children).toBe('[deleted]');
  });
});
