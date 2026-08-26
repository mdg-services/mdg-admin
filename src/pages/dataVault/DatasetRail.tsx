import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';

/**
 * The minimum a rail needs to render one entry. Both the cross-dealer Vault
 * (`VaultDataset`) and the per-dealer Vault (`DealerVaultDataset`) are supersets
 * of this, so the rail is shared by structural typing without either importing
 * the other's pane shape.
 */
export interface DatasetRailItem {
  id: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

export interface DatasetRailProps {
  datasets: readonly DatasetRailItem[];
  /** The dataset currently resolved — already defaulted, never null. */
  activeId: string;
  /** The search string that opens a dataset. The page owns what survives a switch. */
  hrefFor: (id: string) => string;
  /**
   * `vertical` (default): a sticky left rail from `lg`, a horizontal strip below
   * it — the two-pane cross-dealer Vault.
   *
   * `horizontal`: always a horizontal strip of pills, used where a left rail
   * would steal width the content cannot spare (the per-dealer Vault sits inside
   * the app sidebar AND a tab strip, so a third vertical rail leaves a wide
   * ledger nowhere to go). The content then gets the full width beneath it.
   */
  orientation?: 'vertical' | 'horizontal';
}

/**
 * The Vault's dataset picker.
 *
 * Real links, not buttons: every dataset is a distinct URL, so an admin can
 * middle-click one into a new tab and Back steps between datasets — the same
 * bargain the rest of the Vault makes by keeping its state in the query string.
 * `aria-current="page"` rather than tab semantics for the same reason: this is
 * navigation, and calling it a tablist would promise arrow-key behaviour that
 * URL-driven links do not have.
 */
export function DatasetRail({
  datasets,
  activeId,
  hrefFor,
  orientation = 'vertical',
}: DatasetRailProps) {
  const horizontal = orientation === 'horizontal';
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const activeRef = React.useRef<HTMLLIElement | null>(null);

  /**
   * Bring the open dataset into view, the way `Tabs` does.
   *
   * Six pills — IRAS shift data, PAD ledger, Credit & DOD, Daily Sales Report,
   * Inspection Reports, TT Density — come to roughly 900px of strip in the
   * 328px a 360px phone has. So `?vault=tt-density` opened showing pill one,
   * with the pill it had just been asked for three screens to the right, and
   * with the scrollbar hidden on touch there was nothing on screen to say the
   * other five existed.
   *
   * `scrollLeft` is written by hand rather than calling `scrollIntoView`, for
   * the reason recorded at the top of `Tabs.tsx`: `scrollIntoView` walks every
   * scrollable ancestor on both axes, and here that includes the page.
   */
  React.useEffect(() => {
    const list = listRef.current;
    const active = activeRef.current;
    if (!list || !active) return;
    const listBox = list.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const delta =
      activeBox.left + activeBox.width / 2 - (listBox.left + listBox.width / 2);
    // The browser clamps to [0, scrollWidth - clientWidth], so the first and
    // last pills rest against the ends instead of being centred.
    if (Math.abs(delta) > 1) list.scrollLeft += delta;
    // Keyed on the active id alone: `datasets` is rebuilt on every render, and
    // re-centring that often would fight a manual scroll.
  }, [activeId]);

  return (
    <nav
      aria-label="Vault datasets"
      className={horizontal ? undefined : 'lg:sticky lg:top-0'}
    >
      {horizontal ? null : (
        <p className="mb-2 hidden px-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted lg:block">
          Datasets
        </p>
      )}
      {/*
        The fade is a sibling of the scroller, not a child: `right-0` inside a
        scroller resolves against its full scroll width, so it would sit at the
        far end of the pills rather than at the visible edge. `md:hidden`
        because a mouse has a scrollbar and a trackpad; this cue is for a finger.
      */}
      <div className={horizontal ? 'relative' : undefined}>
        <ul
          ref={listRef}
          className={cn(
            'flex snap-x snap-proximity items-center gap-1 overflow-x-auto overscroll-x-contain scrollbar-thin',
            horizontal
              ? 'border-b border-border pb-2'
              : 'lg:flex-col lg:items-stretch lg:gap-0.5 lg:overflow-x-visible',
          )}
        >
          {datasets.map((dataset) => {
            const active = dataset.id === activeId;
            const { Icon } = dataset;
            return (
              <li
                key={dataset.id}
                ref={active ? activeRef : undefined}
                className={cn('shrink-0 snap-start', horizontal ? null : 'lg:w-full lg:shrink')}
              >
                <Link
                  to={{ search: hrefFor(dataset.id) }}
                  aria-current={active ? 'page' : undefined}
                  title={dataset.description}
                  className={cn(
                    'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    // The horizontal branch used to clamp every pill to 36px at
                    // ALL widths, overriding the 44px base — and this strip is the
                    // primary navigation between all six per-dealer datasets on a
                    // phone. 44px below md, the old 36px back from md up.
                    horizontal ? 'min-h-11 py-2 md:min-h-9' : 'lg:min-h-0 lg:py-2',
                    active
                      ? 'bg-brand-soft text-brand'
                      : 'text-text-muted hover:bg-surface-2 hover:text-text',
                  )}
                >
                  <Icon
                    width={16}
                    height={16}
                    strokeWidth={1.75}
                    className="shrink-0"
                    aria-hidden
                  />
                  <span className="truncate">{dataset.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {horizontal ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg to-transparent md:hidden"
          />
        ) : null}
      </div>
    </nav>
  );
}
