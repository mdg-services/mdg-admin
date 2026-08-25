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
  chips,
  className,
}: FilterBarProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = React.useState(false);

  if (isMd) {
    return (
      <Card className={className}>
        <CardContent className={cn('grid gap-3', MD_COLUMNS[columnsAtMd])}>
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
      {chips != null ? (
        <div className="flex flex-wrap gap-1.5">{chips}</div>
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
