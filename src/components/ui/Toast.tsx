import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { INTENT_CLASSES, type Intent } from '@/lib/statusIntent';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  intent: Intent;
  /** ms; 0 = sticky */
  duration?: number;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id' | 'intent'> & { intent?: Intent }) => string;
  success: (msg: string, opts?: Partial<Toast>) => string;
  error: (msg: string, opts?: Partial<Toast>) => string;
  info: (msg: string, opts?: Partial<Toast>) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * How long a toast stays before it clears itself. A failure used to be sticky
 * (`0`), which reads as careful and is the opposite on a phone: the viewport is
 * `position: fixed` at the bottom of the screen, so an opaque, click-catching
 * card sat over the tab bar until it was dismissed — and its dismiss button was
 * 22px. Eight seconds is long enough to read a two-line API error and short
 * enough that a failed save never takes the navigation with it. A caller that
 * genuinely needs a sticky toast still passes `duration: 0` itself.
 */
const DEFAULT_DURATION_MS = 4000;
const DANGER_DURATION_MS = 8000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (partial: Omit<Toast, 'id'>): string => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration =
        partial.duration ??
        (partial.intent === 'danger' ? DANGER_DURATION_MS : DEFAULT_DURATION_MS);
      const next: Toast = { ...partial, id, duration };
      setToasts((curr) => [...curr, next]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  const ctx: ToastContextValue = React.useMemo(
    () => ({
      toast: (t) => push({ intent: t.intent ?? 'info', ...t }),
      success: (msg, opts) =>
        push({ intent: 'success', title: msg, ...opts }),
      error: (msg, opts) => push({ intent: 'danger', title: msg, ...opts }),
      info: (msg, opts) => push({ intent: 'info', title: msg, ...opts }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function ToastViewport({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
}) {
  return (
    // Bottom-anchored on a phone, and it has to clear two things nothing else
    // does: the tab bar (an in-flow element, so `bottom-4` painted straight
    // over it) and the gesture strip. `inset-x-3` rather than `right-4 w-full`,
    // because `w-full` on a fixed element resolves to the whole 360px viewport
    // — `max-w-sm` is 384px and never clamped it, so the card's left edge sat
    // at −16px and the intent icon was off-screen. Every desktop value is
    // restored at md.
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--tab-bar-h,0px)+max(env(safe-area-inset-bottom),0.5rem)+0.5rem)] z-[var(--z-toast)] flex flex-col gap-2 md:inset-x-auto md:right-4 md:bottom-4 md:w-full md:max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-2 shadow-md',
          )}
        >
          <span
            className={cn(
              'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
              INTENT_CLASSES[t.intent],
            )}
          >
            {t.intent === 'success' ? (
              <CheckCircle2 width={14} height={14} strokeWidth={1.75} />
            ) : t.intent === 'danger' ? (
              <AlertCircle width={14} height={14} strokeWidth={1.75} />
            ) : (
              <Info width={14} height={14} strokeWidth={1.75} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            {t.title ? (
              <p className="break-words text-sm font-medium text-text">
                {t.title}
              </p>
            ) : null}
            {t.description ? (
              <p className="mt-0.5 break-words text-xs text-text-muted">
                {t.description}
              </p>
            ) : null}
          </div>
          {/* 44px below md: this is the only way out of a toast, and at 22px
              it was smaller than the finger trying to hit it. `md:h-auto
              md:w-auto md:p-1` is today's desktop button exactly. */}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="-my-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-sm p-0 text-text-muted hover:bg-surface-2 md:my-0 md:mr-0 md:h-auto md:w-auto md:p-1"
          >
            <X width={14} height={14} strokeWidth={1.75} />
          </button>
        </div>
      ))}
    </div>
  );
}
