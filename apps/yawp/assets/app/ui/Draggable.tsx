import React from 'react';

export type DraggableProps = {
  enabled?: boolean;
  onDragStart?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  testID?: string;
  children: React.ReactNode;
};

export function Draggable({children}: DraggableProps) {
  return <>{children}</>;
}
