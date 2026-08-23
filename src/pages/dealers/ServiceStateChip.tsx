import { Badge } from '@/components/ui';
import { toYmd } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import type {
  DealerServiceState,
  DealerServiceSummaryEntry,
  RosterServiceSpec,
} from '@dk/shared';

/**
 * The word and the colour for one service state.
 *
 * PENDING carries two different meanings and so cannot be a constant: for a
 * service that ends in something being sent to the dealer it means nothing has
 * been produced yet, and for one that just has to run it means it has not run.
 */
function present(
  state: DealerServiceState,
  spec: RosterServiceSpec,
): { label: string; intent: Intent } {
  switch (state) {
    case 'SENT':
      return { label: 'Sent', intent: 'success' };
    case 'DONE':
      return { label: 'Done', intent: 'success' };
    case 'GENERATED':
      return { label: 'Generated', intent: 'warning' };
    case 'RESEND':
      return { label: 'Resend', intent: 'danger' };
    case 'FAILED':
      return { label: 'Failed', intent: 'danger' };
    case 'RUNNING':
      return { label: 'Running', intent: 'info' };
    case 'PAUSED':
      return { label: 'Paused', intent: 'neutral' };
    case 'PENDING':
      return {
        label: spec.delivers ? 'Not generated' : 'Not run',
        intent: 'warning',
      };
    default:
      return { label: 'Not set up', intent: 'neutral' };
  }
}

/**
 * A date a scanner can read at a glance. The roster's whole question is "was
 * this done today", so today and yesterday get named rather than dated — a
 * column of identical "23 Aug 2026" strings answers it far more slowly.
 */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = toYmd(new Date());
  const day = toYmd(d);
  if (day === today) return 'today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === toYmd(yesterday)) return 'yesterday';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

/** The full sentence behind the chip, for the cell's tooltip. */
export function serviceStateTitle(
  entry: DealerServiceSummaryEntry | undefined,
  spec: RosterServiceSpec,
): string {
  if (!entry) return `${spec.label}: not known yet`;
  const { label } = present(entry.state, spec);
  const parts = [`${spec.label}: ${label}`];
  if (entry.covers) parts.push(`window ${entry.covers}`);
  if (entry.at) parts.push(new Date(entry.at).toLocaleString());
  if (entry.note) parts.push(entry.note);
  return parts.join(' · ');
}

/**
 * One dealer's standing on one service. A dash — not a chip — when the service
 * is not attached, so the eye skips the columns a dealer has not bought and
 * lands on the ones that are actually meant to be running.
 */
export function ServiceStateChip({
  entry,
  spec,
  loading,
  showWhen = true,
}: {
  entry: DealerServiceSummaryEntry | undefined;
  spec: RosterServiceSpec;
  loading?: boolean;
  /** Off in the mobile stack, where four services share one line. */
  showWhen?: boolean;
}) {
  if (loading) {
    return <span className="text-sm text-text-subtle">···</span>;
  }
  if (!entry || entry.state === 'NOT_ATTACHED') {
    return <span className="text-sm text-text-subtle">—</span>;
  }
  const { label, intent } = present(entry.state, spec);
  const when = showWhen && entry.at ? whenLabel(entry.at) : '';
  // The window a service marked is more use than the day it ran — so when there
  // is one it takes the line, and the day joins it only when it is not today.
  const second = entry.covers
    ? when && when !== 'today'
      ? `${when} · ${entry.covers}`
      : entry.covers
    : when;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge intent={intent}>{label}</Badge>
      {showWhen && second ? (
        <span className="whitespace-nowrap text-xs text-text-subtle">
          {second}
        </span>
      ) : null}
    </span>
  );
}
