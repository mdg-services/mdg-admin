import { Info, PanelRightClose, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';

export type SideTab = 'helper' | 'ai' | 'details';

const ALL_TABS: Array<{ id: SideTab; label: string; icon: LucideIcon }> = [
  { id: 'helper', label: 'Helper', icon: Sparkles },
  { id: 'ai', label: 'AI log', icon: Zap },
  { id: 'details', label: 'Details', icon: Info },
];

const TAB_KEY = 'dk.inbox.sideTab';

/**
 * The tab this browser last had open, among `allowed`. Storage can be absent or
 * throw; the panel works without it. Each inbox keeps its own `key`.
 */
export function readSideTab(key = TAB_KEY, allowed: SideTab[] = ['helper', 'ai', 'details']): SideTab {
  try {
    const v = window.localStorage.getItem(key) as SideTab | null;
    return v && allowed.includes(v) ? v : 'helper';
  } catch {
    return 'helper';
  }
}
export function writeSideTab(tab: SideTab, key = TAB_KEY): void {
  try {
    window.localStorage.setItem(key, tab);
  } catch {
    // Not remembered; the panel still works for this visit.
  }
}

/**
 * The open conversation's side panel: the Reply helper, what the AI first line
 * did, and the conversation's details — three tabs over one column.
 *
 * WHY TABS. These used to be three look-alike strips stacked between the
 * messages and the reply box (plus a column of cards beside them), and opening
 * any one pushed the conversation out of view. Each now gets the panel's whole
 * height in turn, and the space between the messages and the reply box holds
 * the reply box only.
 *
 * ALL THREE STAY MOUNTED and the inactive ones are hidden, so an opened ticket
 * survives a look at another tab. The panel itself unmounts when it is put
 * away; a half-typed helper instruction survives that too, because the helper
 * keeps it per chat outside the pane.
 *
 * `tabs` picks which tabs (and their words) an inbox shows: the dealer chat has
 * all three; the WhatsApp inbox has the helper and its "Contact info".
 *
 * The same panel is the inline column on a wide screen and the body of a drawer
 * on a narrower one; only the column has a close glyph of its own (`onClose`) —
 * a drawer carries its own Close.
 */
export function ThreadSidePanel({
  tab,
  onTab,
  onClose,
  closeLabel = 'Hide panel',
  helper,
  ai = null,
  details,
  tabs: tabsProp,
  detailsCount = 0,
  aiAlert = false,
  helperBusy = false,
  className,
}: {
  tab: SideTab;
  onTab: (tab: SideTab) => void;
  onClose?: () => void;
  closeLabel?: string;
  helper: React.ReactNode;
  ai?: React.ReactNode;
  details: React.ReactNode;
  /** Which tabs, in order, with an optional word of their own. Default: all three. */
  tabs?: Array<{ id: SideTab; label?: string }>;
  /** Something in Details waits on MDG (a dealer's answer to check). */
  detailsCount?: number;
  /** The AI guard marked this thread: a dot on the AI log tab. */
  aiAlert?: boolean;
  /** The helper is writing: a spinner on its tab, so it is seen from the others. */
  helperBusy?: boolean;
  className?: string;
}) {
  const baseId = React.useId();
  const TABS = React.useMemo(
    () =>
      tabsProp
        ? tabsProp.map((t) => {
            const base = ALL_TABS.find((a) => a.id === t.id)!;
            return { ...base, label: t.label ?? base.label };
          })
        : ALL_TABS,
    [tabsProp],
  );
  const tabRefs = React.useRef<Record<SideTab, HTMLButtonElement | null>>({
    helper: null,
    ai: null,
    details: null,
  });

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? TABS.length - 1
          : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    const id = TABS[next]!.id;
    onTab(id);
    tabRefs.current[id]?.focus();
  }

  const panes: Record<SideTab, React.ReactNode> = { helper, ai, details };

  return (
    <div className={cn('flex min-h-0 flex-col bg-surface', className)}>
      <div className="flex h-12 shrink-0 items-stretch border-b border-border pl-2 pr-1">
        <div
          role="tablist"
          aria-label="Conversation side panel"
          onKeyDown={onKeyDown}
          className="flex min-w-0 flex-1 items-stretch gap-0.5"
        >
          {TABS.map((t) => {
            const active = t.id === tab;
            const Icon = t.icon;
            const assist = t.id === 'helper';
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.id}`}
                aria-selected={active}
                aria-controls={`${baseId}-pane-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => onTab(t.id)}
                className={cn(
                  'focus-inset relative flex min-w-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150',
                  active
                    ? assist
                      ? 'text-assist-strong'
                      : 'text-text'
                    : 'text-text-muted hover:bg-surface-2 hover:text-text',
                )}
              >
                <Icon
                  width={15}
                  height={15}
                  strokeWidth={1.9}
                  aria-hidden
                  className={cn('shrink-0', assist && 'text-assist')}
                />
                <span className="truncate">{t.label}</span>
                {t.id === 'helper' && helperBusy ? (
                  <Spinner size={12} className="shrink-0 text-assist" />
                ) : null}
                {t.id === 'details' && detailsCount > 0 ? (
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-warning-soft px-1 text-[11px] font-semibold tabular-nums text-warning-strong">
                    {detailsCount}
                    <span className="sr-only"> to check</span>
                  </span>
                ) : null}
                {t.id === 'ai' && aiAlert ? (
                  <span role="img" className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-label="Marked by the AI guard" />
                ) : null}
                {active ? (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-x-2 -bottom-px h-0.5 rounded-full',
                      assist ? 'bg-assist' : 'bg-text',
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className="my-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <PanelRightClose width={17} height={17} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      {TABS.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${baseId}-pane-${t.id}`}
          aria-labelledby={`${baseId}-tab-${t.id}`}
          hidden={t.id !== tab}
          className={cn(
            'min-h-0 flex-1',
            // The helper pins its own box to the bottom and scrolls inside; the
            // other two are plain scrolling columns of sections. One display
            // class only: `cn` is clsx, and `flex` beside `hidden` would be
            // settled by stylesheet order.
            t.id !== tab
              ? 'hidden'
              : t.id === 'helper'
                ? 'flex flex-col'
                : 'scroll-py-1.5 overflow-y-auto overscroll-contain',
          )}
        >
          {panes[t.id]}
        </div>
      ))}
    </div>
  );
}
