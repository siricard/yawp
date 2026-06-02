/**
 * @jest-environment jsdom
 */
import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {Draggable} from '../ui/Draggable.web';

function makeDataTransfer() {
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: jest.fn(),
    getData: jest.fn(),
  };
}

describe('Draggable (web)', () => {
  test('renders a real draggable host element', () => {
    render(
      <Draggable testID="d">
        <span>tab</span>
      </Draggable>,
    );
    const host = screen.getByTestId('d');
    expect(host.getAttribute('draggable')).toBe('true');
  });

  test('a dragstart on the host invokes onDragStart', () => {
    const onDragStart = jest.fn();
    render(
      <Draggable testID="d" onDragStart={onDragStart}>
        <span>tab</span>
      </Draggable>,
    );
    fireEvent.dragStart(screen.getByTestId('d'), {
      dataTransfer: makeDataTransfer(),
    });
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  test('a drop on the host invokes onDrop', () => {
    const onDrop = jest.fn();
    render(
      <Draggable testID="d" onDrop={onDrop}>
        <span>tab</span>
      </Draggable>,
    );
    fireEvent.drop(screen.getByTestId('d'), {
      dataTransfer: makeDataTransfer(),
    });
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  test('dragend invokes onDragEnd', () => {
    const onDragEnd = jest.fn();
    render(
      <Draggable testID="d" onDragEnd={onDragEnd}>
        <span>tab</span>
      </Draggable>,
    );
    fireEvent.dragEnd(screen.getByTestId('d'));
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  test('disabled renders children without a draggable host', () => {
    render(
      <Draggable testID="d" enabled={false}>
        <span>tab</span>
      </Draggable>,
    );
    expect(screen.queryByTestId('d')).toBeNull();
    expect(screen.getByText('tab')).toBeTruthy();
  });
});
