import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const WIDTH_CLASSES: Record<NonNullable<DrawerProps['width']>, string> = {
  sm: 'w-full md:w-[420px]',
  md: 'w-full md:w-[560px]',
  lg: 'w-full md:w-[720px]',
};

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: DrawerProps) {
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
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'flex h-full flex-col border-l border-border bg-surface shadow-lg',
          WIDTH_CLASSES[width],
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
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
