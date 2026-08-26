import { SlidersHorizontal } from 'lucide-react';
import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

import { Button } from './Button';
import { Card, CardContent } from './Card';
import { Sheet } from './Sheet';

type ColumnsAtMd = 2 | 3 | 4 | 5;

/** Written out because Tailwind reads the source as text: a template literal
 *  `md:grid-cols-${n}` produces no class at all. */
const MD_COLUMNS: Record<ColumnsAtMd, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
};

export interface FilterBarProps {
  /** The existing `Label` + control pairs, unchanged. */
  children: React.ReactNode;
  /** How many filters are currently set. Shown on the mobile trigger, so the
   *  operator can see the list is filtered without opening anything. */
  activeCount?: number;
  onClear?: () => void;
  columnsAtMd?: ColumnsAtMd;
  /**
   * REPLACES the md+ `CardContent` classes outright, `columnsAtMd` included.
   * Use it when the desktop card already has a column ladder a single count
   * cannot express — `sm:grid-cols-2 lg:grid-cols-5` is the shape two pages in
   * this app have, and neither `columnsAtMd={2}` nor `{5}` reproduces it
   * without regressing a real width. It replaces rather than merges because
   * `cn` is clsx: two `grid-cols-*` in one class list is decided by stylesheet
   * order, not by which one you wrote last.
   */
  contentClassName?: string;
  /** Removable chips for what is set, shown under the trigger below md. The
   *  bar cannot derive them — `children` is opaque markup — so a caller that
   *  wants them renders them here. */
  chips?: React.ReactNode;
  className?: string;
}

/**
 * A page's filters: a card of controls at md+, one 44px button on a phone.
 *
 * Five stacked filters cost roughly 428px of a 640px screen, which is why the
 * first row of three list pages started more than a full screen below the fold
 * — the operator had to scroll past the filters to find out whether filtering
 * had helped. Collapsing them into a sheet gives the list the screen back and
 * costs one tap to change anything.
 *
 * Exactly one branch mounts: `useMediaQuery` picks it in JS rather than
 * `hidden md:block`, so the controls exist once and a phone never pays to build
 * the desktop grid. (The consequence to know about: crossing 768px remounts the
 * controls, so filter state has to live in the caller — which it already does.)
 *
 * TWO TRAPS THAT COST A PACKET EACH:
 *  - Below md the children live inside `Sheet`, and `Sheet` returns null when
 *    closed, so the controls UNMOUNT between openings. Anything debounced in
 *    there loses its pending commit on close — a search typed and confirmed
 *    with "Show results" inside the debounce searched for nothing. A debounced
 *    field in a FilterBar must flush on unmount.
 *  - A landscape phone is already ≥ md (852×393), so rotation swaps the branch
 *    and remounts the controls. State in the caller survives that; state inside
 *    a child does not.
 *
 * @example
 * <FilterBar columnsAtMd={3} activeCount={active} onClear={() => setQuery({})}>
 *   <div><Label htmlFor="q">Search</Label><Input id="q" … /></div>
 *   <div><Label htmlFor="status">Status</Label><Select id="status" … /></div>
 * </FilterBar>
 */
export function FilterBar({
  children,
  activeCount = 0,
  onClear,
  columnsAtMd = 3,
  contentClassName,
  chips,
  className,
}: FilterBarProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = React.useState(false);

  if (isMd) {
    return (
      <Card className={className}>
        <CardContent
          className={contentClassName ?? cn('grid gap-3', MD_COLUMNS[columnsAtMd])}
        >
          {children}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          className="min-h-11 flex-auto justify-between"
          leftIcon={
            <SlidersHorizontal width={16} height={16} strokeWidth={1.75} />
          }
          onClick={() => setOpen(true)}
          aria-expanded={open}
        >
          {activeCount > 0 ? `Filters (${activeCount})` : 'Filters'}
        </Button>
        {activeCount > 0 && onClear ? (
          <Button variant="ghost" className="min-h-11 shrink-0" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
      {/* gap-2, not gap-1.5: chips are routinely `.tap-target`s, whose halo is
          inset -12px, and two halos closer than 8px overlap so the later
          sibling swallows the earlier one's edge. */}
      {chips != null ? (
        <div className="flex flex-wrap gap-2">{chips}</div>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        <div className="grid gap-3 px-4 py-2">{children}</div>
        <div className="flex items-center gap-2 border-t border-border px-4 pt-3">
          {onClear ? (
            <Button
              variant="ghost"
              className="min-h-11 flex-auto"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              Clear all
            </Button>
          ) : null}
          <Button
            className="min-h-11 flex-auto"
            onClick={() => setOpen(false)}
          >
            Show results
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
