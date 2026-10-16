import { CheckCircle2 } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { ShareAudienceNote, ShareMenu } from '@/components/share/ShareMenu';
import { shareResultMessage } from '@/components/share/shareToast';
import { useShareToast } from '@/components/share/useShareToast';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataList,
  EmptyState,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useOverviewActionMutation } from '@/hooks/api/useOverview';
import { cn } from '@/lib/cn';
import { OWNERS_ONLY_AUDIENCES, OWNERS_ONLY_REASON } from '@dk/shared';
import type { DsrShareOutcome, ShareAudience, ShareOutcome, TriageItem } from '@dk/shared';

import { isCreditShare, triageBadge, triageIntent } from './format';

/**
 * The morning's work: everything outstanding that is NOT per-dealer-per-day, so
 * the board below stays about the reporting day and this stays about right now.
 *
 * The list arrives already ranked, deduped and capped by the server. Nothing in
 * this component decides what is urgent — see the anti-noise rules in
 * `routes/v1/overview.day.ts` for why that judgement cannot live in two places.
 */
export function NeedsAPerson({
  items,
  actCap,
  loading,
  selectedDate,
  now,
}: {
  items: TriageItem[];
  actCap: number;
  loading: boolean;
  /** The day the PAGE asked for — used for the cache key. See `overviewDayKey`. */
  selectedDate?: string;
  now: number;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const showShare = useShareToast();
  const run = useOverviewActionMutation(selectedDate);
  // A credit card send carries the audience picked from its menu; every other
  // one-tap posts nothing, and the server decides (the corrected report goes to
  // whoever holds the old copy — the confirm text says who).
  const [pending, setPending] = React.useState<{
    item: TriageItem;
    audience?: ShareAudience;
  } | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const [expanded, setExpanded] = React.useState(false);
  const allAct = items.filter((i) => i.bucket === 'act');
  const act = expanded ? allAct : allAct.slice(0, actCap);
  const hidden = allAct.length - act.length;
  const context = items.filter((i) => i.bucket === 'context');

  const perform = React.useCallback(
    (item: TriageItem, audience?: ShareAudience) => {
      if (!item.action) return;
      setBusyId(item.id);
      run.mutate(
        { path: item.action.path, ...(audience ? { body: { audience } } : {}) },
        {
          // Both paths toast. Mutations are configured `retry: 0`, so a failed
          // write is final and a silent failure would read as success.
          onSuccess: (result) => {
            const out = result as Partial<DsrShareOutcome> | null | undefined;
            // A send says who it reached; anything else is just done.
            if (out && typeof out.alreadyShared === 'boolean') {
              // The message already carries what did not go out; `showShare`
              // turns that case into a warning that stays up, not a green toast.
              showShare(shareResultMessage(out as ShareOutcome, 'Done.'), out);
            } else {
              toast.success('Done.');
            }
          },
          onError: (e) =>
            toast.error((e as Error).message || 'That did not go through.'),
          onSettled: () => {
            setBusyId(null);
            setPending(null);
          },
        },
      );
    },
    [run, showShare, toast],
  );

  if (loading) {
    return (
      <div className="grid gap-2 p-3 md:p-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (act.length === 0 && context.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 width={24} height={24} strokeWidth={1.75} />}
        title="Nothing needs a person"
        description="Every dealer has been answered, every report is sent, and nothing is overdue."
      />
    );
  }

  return (
    <>
      <DataList<TriageItem>
        rows={act}
        rowKey={(i) => i.id}
        cardVariant="rows"
        onRowClick={(i) => navigate(i.href)}
        empty={
          <EmptyState
            icon={<CheckCircle2 width={24} height={24} strokeWidth={1.75} />}
            title="Nothing needs a person"
            description="Nothing is waiting, late, or unsent."
          />
        }
        columns={[
          {
            id: 'when',
            header: 'When',
            mobile: 'secondary',
            width: '6rem',
            cell: (i) => <Badge intent={triageIntent(i)}>{triageBadge(i, now)}</Badge>,
          },
          {
            id: 'what',
            header: 'What',
            mobile: 'primary',
            cell: (i) => <span className="font-medium text-text">{i.title}</span>,
          },
          {
            id: 'who',
            header: 'Outlet',
            mobile: 'secondary',
            width: '6rem',
            cell: (i) => (
              <span className="text-text-muted">{i.dealerCode ?? '—'}</span>
            ),
          },
          {
            id: 'why',
            header: 'Why it matters',
            mobile: 'meta',
            cell: (i) => <span className="text-text-subtle">{i.why ?? ''}</span>,
          },
        ]}
        // `rowActions`, not `cardActions`: a card with `onRowClick` renders as
        // ONE button, and `DataList` drops `cardActions` entirely in that case
        // because a button cannot nest inside a button. `rowActions` is the slot
        // that stops the click reaching the row, so the fix survives on a phone.
        rowActions={(i) => {
          if (!i.action) return null;
          // Credit figures go to owners only: the menu is still shown, with the
          // other choices dead and the reason under them, so the rule reads as a
          // rule and not as a missing feature.
          if (isCreditShare(i)) {
            return (
              <ShareMenu
                label={i.action.label}
                size="sm"
                variant="secondary"
                align="end"
                allowed={OWNERS_ONLY_AUDIENCES}
                unavailableReason={OWNERS_ONLY_REASON}
                loading={busyId === i.id}
                onPick={(audience) => setPending({ item: i, audience })}
              />
            );
          }
          return (
            <Button
              size="sm"
              variant="secondary"
              loading={busyId === i.id}
              onClick={() => {
                if (i.action?.confirm) setPending({ item: i });
                else perform(i);
              }}
            >
              {i.action.label}
            </Button>
          );
        }}
      />

      {hidden > 0 ? (
        // Expands in place rather than linking away: the hidden rows are late
        // services, unsent cards, superseded reports and refused passwords, and
        // there is no one screen that holds all of those to point at.
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="min-h-11 w-full px-3 text-left text-sm font-medium text-brand md:px-0"
        >
          Show {hidden} more
        </button>
      ) : null}

      {context.length > 0 ? (
        // Standing backlog, below a hairline and deliberately colourless. These
        // numbers are real but they are never this morning's work, and letting
        // them wear a colour is what turns a four-row list into a wall.
        <ul className="mt-1 divide-y divide-border border-t border-border">
          {context.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => navigate(i.href)}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left',
                  'text-sm text-text-muted transition-colors hover:bg-surface-2 md:px-0',
                )}
              >
                {/* Wraps below md: the end of the line ("standing backlog,
                    not this morning's work") is the qualifier that says this
                    row can wait, and it was the part being cut. */}
                <span className="min-w-0 break-words md:truncate">{i.title}</span>
                <span className="shrink-0 text-xs text-text-subtle">{i.count ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={!!pending}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && perform(pending.item, pending.audience)}
        loading={busyId === pending?.item.id}
        title={pending?.item.action?.label ?? 'Confirm'}
        description={
          pending ? (
            <>
              <p className={pending.audience ? 'mb-3' : undefined}>{pending.item.action?.confirm}</p>
              {pending.audience ? <ShareAudienceNote audience={pending.audience} /> : null}
            </>
          ) : undefined
        }
        confirmLabel={pending?.item.action?.label}
      />
    </>
  );
}
