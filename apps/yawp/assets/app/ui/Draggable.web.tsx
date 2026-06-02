import React from 'react';

export type DraggableProps = {
  enabled?: boolean;
  onDragStart?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  testID?: string;
  children: React.ReactNode;
};

export function Draggable({
  enabled = true,
  onDragStart,
  onDrop,
  onDragEnd,
  testID,
  children,
}: DraggableProps) {
  if (!enabled) {
    return <>{children}</>;
  }
  return (
    <div
      data-testid={testID}
      draggable
      onDragStart={event => {
        event.dataTransfer.effectAllowed = 'move';
        try {
          event.dataTransfer.setData('text/plain', '');
        } catch {
        }
        onDragStart?.();
      }}
      onDragOver={event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={event => {
        event.preventDefault();
        onDrop?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      style={{display: 'flex', alignItems: 'center'}}>
      {children}
    </div>
  );
}
