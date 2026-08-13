import type { LucideIcon } from 'lucide-react';
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
      <ul
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
              className={cn('shrink-0 snap-start', horizontal ? null : 'lg:w-full lg:shrink')}
            >
              <Link
                to={{ search: hrefFor(dataset.id) }}
                aria-current={active ? 'page' : undefined}
                title={dataset.description}
                className={cn(
                  'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  horizontal ? 'min-h-9 py-2' : 'lg:min-h-0 lg:py-2',
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
    </nav>
  );
}
