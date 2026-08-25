import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from './Button';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * "Showing 21-40 of 137" and the two page buttons.
 *
 * Its minimum content width is about 320-360px against the ~296-328px a card
 * offers at 360px, and `Button` carries `whitespace-nowrap` — so the labels
 * overflowed their own boxes and "Next", the rightmost thing on the row, was
 * clipped away by `main`'s `overflow-x-hidden`. Below md the count moves to its
 * own line (`flex-col-reverse`, so the buttons stay under the thumb) and the
 * two buttons split the width. At md every class is restored and the row is
 * pixel-for-pixel what it was.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col-reverse items-stretch gap-2 px-3 py-2 text-sm text-text-muted md:flex-row md:items-center md:justify-between md:gap-3">
      <p>
        {total === 0
          ? 'No results'
          : `Showing ${start}-${end} of ${total}`}
      </p>
      <div className="flex items-center justify-between gap-2 md:justify-end">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 md:flex-none"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          leftIcon={<ChevronLeft width={14} height={14} strokeWidth={1.75} />}
        >
          Prev
        </Button>
        <span className="shrink-0 whitespace-nowrap text-text">
          {page} / {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 md:flex-none"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          rightIcon={
            <ChevronRight width={14} height={14} strokeWidth={1.75} />
          }
        >
          Next
        </Button>
      </div>
    </div>
  );
}
