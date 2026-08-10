import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';

import type { VaultDataset } from './types';

export interface DatasetRailProps {
  datasets: readonly VaultDataset[];
  /** The `?dataset=` currently resolved — already defaulted, never null. */
  activeId: string;
  /** The search string that opens a dataset. The page owns what survives a switch. */
  hrefFor: (id: string) => string;
}

/**
 * The Vault's dataset picker.
 *
 * ONE list, two shapes. From `lg` it is the left pane of a two-pane layout — a
 * sticky vertical rail that stays put while a long dealer list scrolls past it.
 * Below `lg` the same list lies down into a horizontally scrolling strip above
 * the content, because a 13rem sidebar on a phone is most of the screen spent on
 * navigation. No duplicated markup, so the two can never say different things.
 *
 * Real links, not buttons: every dataset is a distinct URL, so an admin can
 * middle-click one into a new tab and Back steps between datasets — the same
 * bargain the rest of the Vault makes by keeping its state in the query string.
 * `aria-current="page"` rather than tab semantics for the same reason: this is
 * navigation, and calling it a tablist would promise arrow-key behaviour that
 * URL-driven links do not have.
 */
export function DatasetRail({ datasets, activeId, hrefFor }: DatasetRailProps) {
  return (
    <nav aria-label="Vault datasets" className="lg:sticky lg:top-0">
      <p className="mb-2 hidden px-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted lg:block">
        Datasets
      </p>
      <ul
        className={cn(
          'flex snap-x snap-proximity items-center gap-1 overflow-x-auto overscroll-x-contain scrollbar-thin',
          'lg:flex-col lg:items-stretch lg:gap-0.5 lg:overflow-x-visible',
        )}
      >
        {datasets.map((dataset) => {
          const active = dataset.id === activeId;
          const { Icon } = dataset;
          return (
            <li key={dataset.id} className="shrink-0 snap-start lg:w-full lg:shrink">
              <Link
                to={{ search: hrefFor(dataset.id) }}
                aria-current={active ? 'page' : undefined}
                title={dataset.description}
                className={cn(
                  'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  'lg:min-h-0 lg:py-2',
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
