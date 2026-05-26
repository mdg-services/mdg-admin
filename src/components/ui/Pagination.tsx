import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from './Button';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

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
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-text-muted">
      <p>
        {total === 0
          ? 'No results'
          : `Showing ${start}-${end} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          leftIcon={<ChevronLeft width={14} height={14} strokeWidth={1.75} />}
        >
          Prev
        </Button>
        <span className="text-text">
          {page} / {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
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
