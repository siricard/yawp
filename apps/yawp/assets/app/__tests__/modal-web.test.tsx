/**
 * @jest-environment jsdom
 */
import React from 'react';
import {fireEvent, render, screen, within} from '@testing-library/react';

import {Modal} from '../ui/Modal.web';

describe('Modal (web)', () => {
  test('mounts into a document.body portal, not inline', () => {
    const {container} = render(
      <div data-testid="inline-root">
        <Modal visible onClose={() => {}} title="Mint invite" testID="m">
          <button type="button">Body action</button>
        </Modal>
      </div>,
    );
    const inlineRoot = within(container).getByTestId('inline-root');
    expect(within(inlineRoot).queryByTestId('m')).toBeNull();
    const panel = screen.getByTestId('m');
    expect(panel.closest('[data-testid="inline-root"]')).toBeNull();
    expect(document.body.contains(panel)).toBe(true);
  });

  test('exposes dialog semantics and labels by title', () => {
    render(
      <Modal visible onClose={() => {}} title="Mint invite" testID="m">
        <span>content</span>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('m-title');
    expect(screen.getByText('Mint invite').getAttribute('id')).toBe('m-title');
  });

  test('renders nothing when not visible', () => {
    render(<Modal visible={false} onClose={() => {}} testID="m" />);
    expect(screen.queryByTestId('m')).toBeNull();
    expect(screen.queryByTestId('m-backdrop')).toBeNull();
  });

  test('moves focus to the first focusable element on open', () => {
    render(
      <Modal visible onClose={() => {}} title="T" testID="m">
        <button type="button">First</button>
        <button type="button">Second</button>
      </Modal>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', {name: 'First'}),
    );
  });

  test('traps focus: Tab on last element wraps to first', () => {
    render(
      <Modal visible onClose={() => {}} title="T" testID="m">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    );
    const first = screen.getByRole('button', {name: 'First'});
    const last = screen.getByRole('button', {name: 'Last'});
    last.focus();
    fireEvent.keyDown(document, {key: 'Tab'});
    expect(document.activeElement).toBe(first);
  });

  test('traps focus: Shift+Tab on first element wraps to last', () => {
    render(
      <Modal visible onClose={() => {}} title="T" testID="m">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    );
    const first = screen.getByRole('button', {name: 'First'});
    const last = screen.getByRole('button', {name: 'Last'});
    first.focus();
    fireEvent.keyDown(document, {key: 'Tab', shiftKey: true});
    expect(document.activeElement).toBe(last);
  });

  test('closes on backdrop click', () => {
    const onClose = jest.fn();
    render(
      <Modal visible onClose={onClose} title="T" testID="m">
        <span>x</span>
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByTestId('m-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking inside the panel does not close', () => {
    const onClose = jest.fn();
    render(
      <Modal visible onClose={onClose} title="T" testID="m">
        <span>x</span>
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByTestId('m'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('closeOnBackdrop=false ignores backdrop click', () => {
    const onClose = jest.fn();
    render(
      <Modal visible onClose={onClose} title="T" testID="m" closeOnBackdrop={false}>
        <span>x</span>
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByTestId('m-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('closes on Escape', () => {
    const onClose = jest.fn();
    render(
      <Modal visible onClose={onClose} title="T" testID="m">
        <button type="button">First</button>
      </Modal>,
    );
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
