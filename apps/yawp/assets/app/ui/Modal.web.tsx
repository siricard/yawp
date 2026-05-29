import React from 'react';
import ReactDOM from 'react-dom';

export type ModalProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  testID?: string;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Modal({
  visible,
  onClose,
  title,
  children,
  footer,
  closeOnBackdrop = true,
  testID = 'modal',
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = `${testID}-title`;

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const focusables = () =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        : [];

    const initial = focusables();
    if (initial.length > 0) {
      initial[0].focus();
    } else {
      panel?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) {
        return;
      }
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === panel) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [visible, onClose]);

  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const overlay = (
    <div
      data-testid={`${testID}-backdrop`}
      onMouseDown={event => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-xl)',
        backgroundColor: 'rgba(8,12,18,0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000,
      }}>
      <div
        ref={panelRef}
        data-testid={testID}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="bg-surface rounded-xl shadow-elev"
        style={{
          width: '100%',
          maxWidth: 480,
          padding: 'var(--space-xl)',
          outline: 'none',
        }}>
        {title ? (
          <h2
            id={titleId}
            className="text-lg font-bold text-text"
            style={{margin: 0, marginBottom: 'var(--space-md)'}}>
            {title}
          </h2>
        ) : null}
        <div>{children}</div>
        {footer ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 'var(--space-md)',
            }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  return ReactDOM.createPortal(overlay, document.body);
}
