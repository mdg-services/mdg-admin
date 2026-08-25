import { Check, MoreVertical } from 'lucide-react';
import * as React from 'react';

import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

import { Portal } from './Portal';

/** Gap kept between the popover and the edge of the viewport. */
const VIEWPORT_MARGIN = 8;

interface MenuContextValue {
  /** `restoreFocus` puts focus back on the trigger — skip it for outside clicks. */
  close: (restoreFocus?: boolean) => void;
}

const MenuContext = React.createContext<MenuContextValue | null>(null);

export interface MenuProps {
  /** Accessible name for the trigger and the menu itself. */
  label?: string;
  /** Trigger contents. Defaults to the three-dots glyph. */
  trigger?: React.ReactNode;
  /** Heading above the items, shown on the mobile sheet only. */
  title?: string;
  /** Which edge of the trigger the popover lines up with at `≥ md`. */
  align?: 'start' | 'end';
  /** Extra trigger classes — e.g. a tint when the menu holds the current view. */
  triggerClassName?: string;
  /** 'icon' (default) is a square hit area for a glyph. 'auto' sizes to its
   *  content — for a labelled trigger such as the account button, which carries
   *  an avatar, a name and a chevron. `cn` is plain clsx, so a width passed
   *  through `triggerClassName` would not replace the square one; this is the
   *  supported way to ask for the other shape. */
  triggerShape?: 'icon' | 'auto';
  children: React.ReactNode;
}

const TRIGGER_SHAPES: Record<NonNullable<MenuProps['triggerShape']>, string> = {
  icon: 'h-11 w-11 md:h-9 md:w-9',
  auto: 'h-11 gap-2 px-2 text-sm md:h-auto md:py-1',
};

/**
 * Overflow ("three dots") menu: a trigger plus a list of `MenuItem`s.
 *
 * An anchored popover at `≥ md` and a bottom sheet below it, which is the same
 * split Dialog/Drawer/MessageActionsMenu already use — a 240px popover pinned to
 * a trigger is unusable on a 360px screen, and the sheet also removes any chance
 * of the list running off the edge. The desktop popover measures itself and
 * flips above the trigger (and clamps sideways) when it would not fit.
 *
 * Keyboard: Enter/Space or Arrow keys open it, arrows/Home/End move between
 * items, Esc closes. Focus moves into the list on open and returns to the
 * trigger on close, so a keyboard user never loses their place.
 */
export function Menu({
  label = 'More',
  trigger,
  title,
  align = 'end',
  triggerClassName,
  triggerShape = 'icon',
  children,
}: MenuProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(
    null,
  );

  const close = React.useCallback((restoreFocus = true) => {
    setOpen(false);
    setPos(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const ctx = React.useMemo<MenuContextValue>(() => ({ close }), [close]);

  // The items are whatever the caller rendered, so read them back off the DOM
  // rather than making every consumer register them. Anything marked
  // aria-disabled is skipped, the same way a native menu skips it.
  const focusableItems = React.useCallback(
    () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([aria-disabled="true"])',
        ) ?? [],
      ),
    [],
  );

  const moveFocus = React.useCallback(
    (step: number | 'first' | 'last') => {
      const items = focusableItems();
      if (items.length === 0) return;
      let next = 0;
      if (step === 'last') {
        next = items.length - 1;
      } else if (step !== 'first') {
        const current = items.indexOf(document.activeElement as HTMLElement);
        next = (current + step + items.length) % items.length;
      }
      // `preventScroll` because the panel is already parked inside the viewport:
      // letting the focus scroll an ancestor would fire the scroll handler below
      // and close the menu the instant it opened.
      items[next]?.focus({ preventScroll: true });
    },
    [focusableItems],
  );

  // Desktop only: measure, then place under the trigger when it fits and above
  // it otherwise, clamped inside the viewport. The sheet ignores the anchor.
  React.useLayoutEffect(() => {
    if (!open || !isMd) return;
    const triggerEl = triggerRef.current;
    const panel = panelRef.current;
    if (!triggerEl || !panel) return;
    const t = triggerEl.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    let left = align === 'end' ? t.right - p.width : t.left;
    let top = t.bottom + 4;
    if (left + p.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - p.width - VIEWPORT_MARGIN;
    }
    if (top + p.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = t.top - p.height - 4;
    }
    setPos({
      left: Math.max(VIEWPORT_MARGIN, left),
      top: Math.max(VIEWPORT_MARGIN, top),
    });
  }, [open, isMd, align]);

  // Focus the first item once the panel is actually visible — while `pos` is
  // still unmeasured the popover is `visibility: hidden`, and a hidden element
  // cannot take focus.
  React.useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => moveFocus('first'));
    return () => window.cancelAnimationFrame(frame);
  }, [open, moveFocus]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // The trigger is excluded so its own click still toggles: closing here
      // first would let the click immediately reopen the menu.
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close(false);
    };
    // Backstop for Esc when focus has wandered outside the panel.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // Back/forward navigation: the menu is stale once the view changes. An
    // in-app route change made *from* the menu is already covered, because
    // selecting an item closes it.
    const onPopState = () => close(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('popstate', onPopState);
    // The popover is positioned against the trigger, so a scroll or resize
    // invalidates it. The mobile sheet is a fixed overlay — leave it alone.
    //
    // Capture phase is what lets this hear a scrolling *container* and not just
    // the page — which means it also hears the panel scrolling itself. A
    // landscape phone is still `≥ md` (852×393 gets the popover, not the
    // sheet), so `max-h-[70vh]` is ~275px and a long menu overflows: without
    // this guard the menu closed the instant you flicked it and its bottom
    // items were unreachable. The target of a scroll event is the element that
    // scrolled (and `document` for the page), so containment is a safe test.
    const onDetach = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      close(false);
    };
    if (isMd) {
      window.addEventListener('scroll', onDetach, true);
      window.addEventListener('resize', onDetach);
    }
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('scroll', onDetach, true);
      window.removeEventListener('resize', onDetach);
    };
  }, [open, isMd, close]);

  // Mobile only: the sheet covers the page, so the page must not scroll behind
  // it. The desktop popover is anchored to its trigger and deliberately closes
  // on any scroll instead — locking there would freeze the page around it.
  useBodyScrollLock(open && !isMd);

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-1);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus('first');
        break;
      case 'End':
        e.preventDefault();
        moveFocus('last');
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        // Swallow the Tab and hand focus back to the trigger rather than letting
        // it land on whatever follows: the panel unmounts asynchronously, so the
        // browser's own focus move would start from a node that is about to go
        // away and focus would end up on <body>.
        e.preventDefault();
        close();
        break;
      default:
        break;
    }
  }

  const list = (
    <MenuContext.Provider value={ctx}>
      {title ? (
        // Decorative: the menu already carries `aria-label`, and a bare <p>
        // inside role="menu" is not a valid child.
        <p
          aria-hidden="true"
          className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-text-subtle"
        >
          {title}
        </p>
      ) : null}
      {children}
    </MenuContext.Provider>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => {
          // Enter/Space already fire a click on a <button>; arrows are the extra
          // affordance the menu-button pattern asks for.
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md',
          'text-text-muted transition-colors hover:bg-surface-2 hover:text-text',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          TRIGGER_SHAPES[triggerShape],
          triggerClassName,
        )}
      >
        {trigger ?? <MoreVertical width={18} height={18} strokeWidth={1.75} />}
      </button>

      {/* Both branches portal to the body. The sheet needs it for the same
          reason Dialog does; the popover needs it because it is `position:
          fixed` and would otherwise be positioned against any transformed
          ancestor — a menu opened from inside a mobile sheet landed nowhere
          near its trigger. */}
      {open && !isMd ? (
        <Portal>
          <div className="fixed inset-0 z-[var(--z-overlay)] flex items-end justify-center bg-black/40">
            <div
              ref={panelRef}
              role="menu"
              aria-label={label}
              onKeyDown={onPanelKeyDown}
              className={cn(
                'max-h-[80dvh] w-full overflow-y-auto overscroll-contain',
                'rounded-t-2xl border-t border-border bg-surface shadow-lg',
                'pb-[max(env(safe-area-inset-bottom),0.5rem)] animate-sheet-up',
              )}
            >
              <div className="mx-auto mb-1 mt-2 h-1 w-9 rounded-full bg-border-strong" />
              <div className="py-1">{list}</div>
            </div>
          </div>
        </Portal>
      ) : null}

      {open && isMd ? (
        <Portal>
          <div
            ref={panelRef}
            role="menu"
            aria-label={label}
            onKeyDown={onPanelKeyDown}
            style={{
              position: 'fixed',
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className={cn(
              'z-[var(--z-overlay)] w-60 max-h-[70vh] overflow-y-auto overscroll-contain',
              'rounded-md border border-border bg-surface py-1 shadow-md',
            )}
          >
            {list}
          </div>
        </Portal>
      ) : null}
    </>
  );
}

export interface MenuItemProps {
  onSelect?: () => void;
  /** Leading glyph. Optional, but keep it consistent across one menu. */
  icon?: React.ReactNode;
  /** Destructive action — red label, and never tinted as the current entry. */
  danger?: boolean;
  /** Marks the entry whose surface is currently on screen. */
  selected?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

export function MenuItem({
  onSelect,
  icon,
  danger,
  selected,
  disabled,
  children,
}: MenuItemProps) {
  const ctx = React.useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      // Roving focus is driven by the parent's arrow handling, so the items
      // themselves stay out of the tab order.
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      aria-current={selected ? 'true' : undefined}
      onClick={() => {
        if (disabled) return;
        // Close first so focus is back on the trigger before the selection runs
        // — if it opens a dialog, that dialog gets to place focus itself.
        ctx?.close();
        onSelect?.();
      }}
      className={cn(
        'flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors md:min-h-9',
        'focus-visible:outline-none focus-visible:bg-surface-2',
        disabled && 'cursor-not-allowed text-text-subtle',
        !disabled && 'hover:bg-surface-2',
        !disabled && danger && 'text-danger',
        !disabled && !danger && (selected ? 'bg-brand-soft text-brand' : 'text-text'),
      )}
    >
      {icon ? (
        <span
          className={cn(
            'flex w-4 shrink-0 items-center justify-center',
            danger ? 'text-danger' : selected ? 'text-brand' : 'text-text-muted',
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selected ? (
        <Check
          width={15}
          height={15}
          strokeWidth={1.75}
          className="shrink-0 text-brand"
        />
      ) : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-border" />;
}
