import { CheckCircle2 } from 'lucide-react';

import { Badge } from '@/components/ui';

export interface AttentionItem {
  /** The id of the section this one jumps to. */
  target: string;
  label: string;
  count: number;
  intent: 'warning' | 'danger' | 'info';
}

/**
 * The line at the top of the Dealers page that says what is waiting on the team,
 * whichever view is open: new registrations nobody has answered, outlets that need
 * a move from us, messages held for a person to send or drop, owners locked out.
 * Each is a button that jumps to its section. Only what is waiting is drawn; with
 * nothing waiting it says so, because "nothing here" must be a thing the page
 * says rather than a thing the admin has to infer from the absence of chips.
 *
 * `loading` and `failed` keep that sentence honest: before the board has arrived,
 * or when it could not be read, "all caught up" would be false.
 */
export function AttentionStrip({
  items,
  loading,
  failed,
  onJump,
}: {
  items: readonly AttentionItem[];
  loading: boolean;
  failed: boolean;
  onJump: (target: string) => void;
}) {
  const waiting = items.filter((i) => i.count > 0);
  return (
    <div
      role="status"
      aria-label="What is waiting on MDG"
      className="mb-3 flex flex-wrap items-center gap-2 md:mb-4"
    >
      {loading ? (
        <span className="text-sm text-text-subtle">Checking what is waiting…</span>
      ) : failed ? (
        <span className="text-sm text-text-muted">
          Could not read what is waiting. This does not mean nothing is.
        </span>
      ) : waiting.length === 0 ? (
        <span className="flex items-center gap-1.5 text-sm text-text-muted">
          <CheckCircle2 width={16} height={16} strokeWidth={1.75} className="text-success" aria-hidden />
          All caught up: nothing is waiting on MDG.
        </span>
      ) : (
        <>
          <span className="text-sm font-medium text-text">Waiting on MDG</span>
          {waiting.map((i) => (
            <button
              key={`${i.target}:${i.label}`}
              type="button"
              onClick={() => onJump(i.target)}
              className="min-h-11 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
            >
              <Badge intent={i.intent} className="px-3 py-1 text-sm">
                {i.count} {i.label}
              </Badge>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
