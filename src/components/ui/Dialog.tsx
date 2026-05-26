import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'w-full rounded-lg border border-border bg-surface shadow-lg',
          SIZE_CLASSES[size],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            {title ? (
              <h2 className="text-lg font-semibold text-text">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-text-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-text-muted hover:bg-surface-2"
          >
            <X width={16} height={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
