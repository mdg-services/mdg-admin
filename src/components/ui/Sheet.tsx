import * as React from 'react';

import { cn } from '@/lib/cn';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes for the panel (e.g. a max height). */
  className?: string;
}

/**
 * A minimal mobile-only bottom-sheet shell for menu lists: the "More" nav menu,
 * the thread-actions kebab, and the long-press message menu (§6.5). It renders
 * nothing at `≥ md` (`md:hidden`) — those surfaces keep their desktop popovers.
 * Compose it with `SheetItem` rows.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:hidden"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'w-full max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-surface shadow-lg',
          'pb-[max(env(safe-area-inset-bottom),0.5rem)] animate-sheet-up',
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-strong" />
        {title ? (
          <div className="px-4 pb-1 pt-3 text-sm font-semibold text-text">
            {title}
          </div>
        ) : null}
        <div className="py-1">{children}</div>
      </div>
    </div>
  );
}

export interface SheetItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  active?: boolean;
}

/** A full-width tappable row for use inside `Sheet`. */
export function SheetItem({
  icon,
  active,
  children,
  className,
  ...rest
}: SheetItemProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-surface-2',
        active ? 'text-brand' : 'text-text',
        className,
      )}
      {...rest}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}
