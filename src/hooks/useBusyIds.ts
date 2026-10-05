import * as React from 'react';

/**
 * Which rows of a list have a request in flight — per row, not per list.
 *
 * A mutation's `isPending` is one flag for the whole list, so acknowledging one
 * ledger finding greyed out every other row until it came back; and `mutate`'s
 * own callbacks fire only for its LATEST call, so a second row tapped while the
 * first was saving would never hear the first one's result. `run` marks the row
 * busy for exactly as long as its own promise is pending — pair it with
 * `mutateAsync`, whose promise belongs to that call alone.
 */
export function useBusyIds(): {
  isBusy: (id: string) => boolean;
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
} {
  const [ids, setIds] = React.useState<ReadonlySet<string>>(() => new Set());

  const run = React.useCallback(async <T,>(id: string, fn: () => Promise<T>) => {
    setIds((prev) => new Set(prev).add(id));
    try {
      return await fn();
    } finally {
      setIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const isBusy = React.useCallback((id: string) => ids.has(id), [ids]);
  return { isBusy, run };
}
