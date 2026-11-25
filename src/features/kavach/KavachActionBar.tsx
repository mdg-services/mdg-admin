import * as React from 'react';

import { Button } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

/** One thing the admin can do to the check on screen. */
export interface BarAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** `KeyboardEvent.key` values (lower-case) that do it, e.g. `['a']` or `['arrowright']`. */
  keys: string[];
  /** The key as written on the hint: "A", "→". */
  keyHint: string;
  onSelect: () => void;
  /** The one main action: filled, and first. */
  primary?: boolean;
  disabled?: boolean;
  /** Said in plain words, in the bar, when the action is switched off. */
  disabledReason?: string;
}

/** Typing in a box must never fire a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * The key presses that run an action. Pure, so the rule can be tested without a
 * screen: no modifier keys, never while typing, never for a switched-off action.
 */
export function actionForKey(
  actions: readonly BarAction[],
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'target'> & { repeat?: boolean },
): BarAction | null {
  // A held key repeats: it must never approve the next photo nobody has looked at.
  if (e.repeat) return null;
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (isTypingTarget(e.target)) return null;
  const key = e.key.toLowerCase();
  const hit = actions.find((a) => a.keys.includes(key));
  if (!hit || hit.disabled) return null;
  return hit;
}

/** The action a key press names when that action is switched off, so the bar can say why. */
export function disabledActionForKey(
  actions: readonly BarAction[],
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'target'> & { repeat?: boolean },
): BarAction | null {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return null;
  const key = e.key.toLowerCase();
  const hit = actions.find((a) => a.keys.includes(key));
  return hit?.disabled ? hit : null;
}

/**
 * The bar pinned under the check: Approve, Ask again, Tell owner, Excuse, Skip.
 *
 * Keyboard: A, S, O, E and → do the same as the buttons, on any screen with a
 * keyboard; the small key hints show from md up only. `keysOn` is false while a
 * dialog is open or a request is running, so a second press can never act on a
 * check that is already being decided.
 */
export function KavachActionBar({
  actions,
  keysOn,
  busy = false,
  className,
}: {
  actions: BarAction[];
  keysOn: boolean;
  busy?: boolean;
  className?: string;
}) {
  const wide = useMediaQuery('(min-width: 768px)');
  const reasonId = React.useId();
  const [flash, setFlash] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!keysOn || busy) return;
    const onKey = (e: KeyboardEvent) => {
      const action = actionForKey(actions, e);
      if (!action) {
        const off = disabledActionForKey(actions, e);
        if (off) setFlash(`${off.label}: ${off.disabledReason ?? 'not available for this check.'}`);
        return;
      }
      setFlash(null);
      e.preventDefault();
      action.onSelect();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, keysOn, busy]);

  const reasons = actions.filter((a) => a.disabled && a.disabledReason);
  const primary = actions.find((a) => a.primary);
  const rest = actions.filter((a) => !a.primary);

  return (
    <div
      role="toolbar"
      aria-label="Decide this check"
      className={cn(
        'border-t border-border bg-surface px-[var(--app-gutter)] pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3',
        className,
      )}
    >
      {reasons.length > 0 || flash ? (
        <p id={reasonId} role="status" className="mb-2 text-sm text-text-muted">
          {flash ?? reasons.map((a) => `${a.label}: ${a.disabledReason}`).join(' ')}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        {primary ? (
          <BarButton action={primary} busy={busy} wide={wide} describedBy={reasonId} className="w-full md:w-auto" />
        ) : null}
        <div className="grid grid-cols-4 gap-2 md:flex md:flex-1 md:flex-wrap md:items-center">
          {rest.map((a) => (
            <BarButton key={a.id} action={a} busy={busy} wide={wide} describedBy={reasonId} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BarButton({
  action,
  busy,
  wide,
  describedBy,
  className,
}: {
  action: BarAction;
  busy: boolean;
  wide: boolean;
  describedBy?: string;
  className?: string;
}) {
  const off = !!action.disabled || busy;
  return (
    <Button
      variant={action.primary ? 'primary' : 'secondary'}
      disabled={off}
      onClick={action.onSelect}
      aria-describedby={action.disabled && action.disabledReason ? describedBy : undefined}
      aria-keyshortcuts={action.keys.map((k) => (k.length === 1 ? k.toUpperCase() : k)).join(' ')}
      leftIcon={wide || action.primary ? action.icon : undefined}
      className={cn(
        // On a phone the four smaller actions are tiles: icon above, word below.
        !action.primary && !wide && 'h-auto min-h-14 flex-col gap-1 px-1 py-2 text-xs',
        className,
      )}
    >
      {!action.primary && !wide ? (
        <>
          <span aria-hidden>{action.icon}</span>
          <span>{action.label}</span>
        </>
      ) : (
        <>
          {action.label}
          {wide ? (
            <kbd
              aria-hidden
              className="ml-1.5 rounded border border-current px-1 text-[11px] font-medium leading-4 opacity-70"
            >
              {action.keyHint}
            </kbd>
          ) : null}
        </>
      )}
    </Button>
  );
}
