import { RotateCw } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';

import { Button } from './Button';
import { IconButton } from './IconButton';

export interface RefreshToolProps {
  onRefresh: () => void;
  loading?: boolean;
  /** What is refreshed, said in full: "Refresh the queue". The icon's only name
   *  below md, and the labelled button's accessible name at md. */
  label: string;
}

/**
 * "Refresh" for a `PageHeader`'s `tools`.
 *
 * At md it is the labelled ghost button these pages have always had at the end
 * of their actions row. Below md the tools share the title's line, where a
 * labelled button would squeeze the title onto more lines, so it is a 44px
 * icon. Mounted once, branched in JS, like the header itself.
 */
export function RefreshTool({ onRefresh, loading = false, label }: RefreshToolProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  return isMd ? (
    <Button
      size="sm"
      variant="ghost"
      onClick={onRefresh}
      loading={loading}
      aria-label={label}
      leftIcon={<RotateCw width={14} height={14} strokeWidth={1.75} />}
    >
      Refresh
    </Button>
  ) : (
    <IconButton aria-label={label} variant="ghost" size="sm" loading={loading} onClick={onRefresh}>
      <RotateCw width={16} height={16} strokeWidth={1.75} />
    </IconButton>
  );
}
