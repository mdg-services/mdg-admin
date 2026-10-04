import { Button } from '@/components/ui';

/**
 * The "Show all N" / "Show fewer" line under a phone list capped by
 * `cappedRows`. Renders nothing where the list is not capped (`limit` null, a
 * desktop table) or is short enough to be shown whole.
 */
export function ShowAllToggle({
  total,
  limit,
  expanded,
  onToggle,
  noun,
}: {
  total: number;
  limit: number | null;
  expanded: boolean;
  onToggle: () => void;
  /** Plural, e.g. "rows", "links". */
  noun: string;
}) {
  if (limit === null || total <= limit + 1) return null;
  return (
    <div className="border-t border-border px-3 py-1 md:px-4">
      <Button variant="ghost" size="sm" padding="none" onClick={onToggle}>
        {expanded ? 'Show fewer' : `Show all ${total} ${noun}`}
      </Button>
    </div>
  );
}
