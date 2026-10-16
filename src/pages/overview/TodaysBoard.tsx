import { Building2 } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ShareAudienceNote, ShareMenu } from '@/components/share/ShareMenu';
import { shareResultMessage } from '@/components/share/shareToast';
import { useShareToast } from '@/components/share/useShareToast';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataList,
  EmptyState,
  useToast,
} from '@/components/ui';
import { useOverviewActionMutation } from '@/hooks/api/useOverview';
import { dealerCodeLabel } from '@dk/shared';
import type { DealerDayRow, DsrShareOutcome, ShareAudience } from '@dk/shared';

import {
  boardAction,
  chatCell,
  dsrCell,
  kavachCell,
  noRuleSheetsNote,
  sentCell,
  shiftCell,
  type BoardAction,
  type CellState,
} from './format';

/**
 * Ten pumps down the side, the day's five deliverables across the top.
 *
 * This is the shape the question actually has. The owner does not have "seven
 * problems", he has ten outlets, and the thing he wants at a glance is which of
 * them is behind. It is also the one card that stays on screen on a good
 * morning: ten rows all reading "Sent" is the evidence, and a page that hides
 * its evidence when the news is good is a page you cannot trust when it is bad.
 */
function Cell({ state, label }: { state: CellState; label: string }) {
  return (
    <Link
      to={state.href}
      className="tap-target -m-1 inline-flex items-center p-1"
      title={state.hint ?? state.who}
      aria-label={`${label}: ${state.label}${state.who ? ` · ${state.who}` : ''}`}
    >
      <Badge intent={state.intent}>{state.label}</Badge>
      {/* Beside the badge, not inside it: a badge is one nowrap line. */}
      {state.who ? <span className="ml-1.5 text-xs text-text-muted">· {state.who}</span> : null}
    </Link>
  );
}

/**
 * The same five states as a phone card's tile grid — the `md` table never sees
 * this (its column is `desktop: false`).
 *
 * On the card the five used to be stacked `Cell`s, 26px apart with a 12px tap
 * halo each, so the halo of every badge covered most of the badge above it:
 * tapping the middle of "Collection failed" opened the Report page. A tile is
 * the link itself, 44px tall and 8px from its neighbours, so there is no halo to
 * overlap and every tile's centre is its own.
 *
 * The tile also has room for the state's hint, which on the table lives only in
 * `title` — a hover a phone never fires. For a failed collection that hint IS
 * the reason ("SDMS login rejected: password mismatch"), and a wrong password
 * and a portal outage ask for different things of the admin.
 */
function BoardTiles({ cells }: { cells: { label: string; state: CellState }[] }) {
  return (
    // `w-screen max-w-full`: the card slot sizes its cells to their content, so
    // a row of short labels would leave the grid half the card wide. Asking
    // for the viewport and capping at the slot makes every card's grid the
    // card's full width.
    <span className="mt-1 grid w-screen max-w-full grid-cols-2 gap-2">
      {cells.map(({ label, state }) => {
        // The hint says more than `who` whenever both exist (it is the per-sheet
        // version), so it wins; `who` alone is the plain "owners and manager".
        const note = state.hint ?? state.who;
        return (
          <Link
            key={label}
            to={state.href}
            // `relative` so the tile paints above the dealer link's tap halo,
            // which reaches 12px down from the card's title.
            className="relative flex min-h-11 min-w-0 flex-col items-start justify-center gap-0.5 rounded-md border border-border px-2 py-1 text-left"
          >
            <span className="text-xs text-text-muted">{label}</span>
            <Badge intent={state.intent}>{state.label}</Badge>
            {note ? (
              <span className="line-clamp-3 break-words text-xs text-text-muted">{note}</span>
            ) : null}
          </Link>
        );
      })}
    </span>
  );
}

export function TodaysBoard({
  rows,
  reportingDate,
  selectedDate,
  loading,
  now,
  kavachLastEvaluatedAt,
}: {
  rows: DealerDayRow[];
  /** The day the server graded — goes into the collect/generate request bodies. */
  reportingDate: string;
  /** The day the PAGE asked for — used for the cache key. See `overviewDayKey`. */
  selectedDate?: string;
  loading: boolean;
  now: number;
  kavachLastEvaluatedAt: string | null;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const showShare = useShareToast();
  const run = useOverviewActionMutation(selectedDate);
  // The audience a menu pick chose lives WITH the thing it was picked for. It used
  // to sit in a table-wide state, so the confirm and the request each read
  // whatever the last pick anywhere on the board had been.
  const [pending, setPending] = React.useState<{
    row: DealerDayRow;
    action: BoardAction;
    /** Set only when the admin picked from the menu; a saved rule sends no audience. */
    audience?: ShareAudience;
  } | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const perform = React.useCallback(
    (row: DealerDayRow, action: BoardAction, audience?: ShareAudience) => {
      if (!action) return;
      if (action.kind === 'type' || action.kind === 'blocked') {
        navigate(action.href);
        return;
      }
      setBusyId(row.dealerId);
      run.mutate(
        {
          path: action.path,
          // A saved rule is applied by the server, so the request carries no
          // audience at all; a menu pick carries only what was picked.
          body: action.kind === 'share' ? (audience ? { audience } : {}) : action.body,
        },
        {
          onSuccess: (result) => {
            const who = dealerCodeLabel(row.dealerCode);
            if (action.kind !== 'share') {
              toast.success(`Started for ${who} — this takes a minute.`);
              return;
            }
            const out = result as DsrShareOutcome;
            // `shareResultMessage` already says what did not go out (a side with
            // nobody on the app, a copy that failed), so it is not added again;
            // `showShare` makes that case a warning that stays, not a green toast.
            showShare(`${who}: ${shareResultMessage(out, 'Sent.')}`, out);
          },
          onError: (e) => toast.error((e as Error).message || 'That did not go through.'),
          onSettled: () => {
            setBusyId(null);
            setPending(null);
          },
        },
      );
    },
    [navigate, run, showShare, toast],
  );
  const sheetsNote = noRuleSheetsNote(pending?.audience);

  return (
    <>
      <DataList<DealerDayRow>
        rows={rows}
        rowKey={(r) => r.dealerId}
        loading={loading}
        skeletonRows={6}
        cardVariant="rows"
        // The table is six columns of words at md+. `<main>` is
        // `overflow-x-hidden` and `maximum-scale=1.0` kills pinch, so anything
        // wider than the viewport is cut off with no gesture that reaches it —
        // `minWidth` puts it inside its own horizontal scroller instead.
        minWidth="40rem"
        empty={
          <EmptyState
            icon={<Building2 width={24} height={24} strokeWidth={1.75} />}
            title="No outlets yet"
            description="Dealers appear here as soon as they are set up."
          />
        }
        columns={[
          {
            id: 'dealer',
            header: 'Outlet',
            mobile: 'primary',
            width: '6rem',
            cell: (r) => (
              <Link
                to={`/dealers/${r.dealerId}`}
                className="tap-target font-medium text-text hover:underline"
              >
                {dealerCodeLabel(r.dealerCode)}
              </Link>
            ),
          },
          // The phone card's tiles. Paired with `mobile: 'hidden'` on the five
          // columns below: this one is kept out of the md table, those are kept
          // off the card.
          {
            id: 'cells',
            header: '',
            desktop: false,
            mobile: 'secondary',
            cell: (r) => (
              <BoardTiles
                cells={[
                  { label: 'Shift', state: shiftCell(r, reportingDate) },
                  { label: 'Report', state: dsrCell(r) },
                  { label: 'Sent', state: sentCell(r) },
                  { label: 'Kavach', state: kavachCell(r) },
                  { label: 'Chat', state: chatCell(r, now) },
                ]}
              />
            ),
          },
          {
            id: 'shift',
            header: 'Shift',
            mobile: 'hidden',
            cell: (r) => <Cell state={shiftCell(r, reportingDate)} label="Shift" />,
          },
          {
            id: 'dsr',
            header: 'Report',
            mobile: 'hidden',
            cell: (r) => <Cell state={dsrCell(r)} label="Report" />,
          },
          {
            id: 'sent',
            header: 'Sent',
            mobile: 'hidden',
            cell: (r) => <Cell state={sentCell(r)} label="Sent" />,
          },
          {
            id: 'kavach',
            header: 'Kavach',
            mobile: 'hidden',
            cell: (r) => <Cell state={kavachCell(r)} label="Kavach" />,
          },
          {
            id: 'chat',
            header: 'Chat',
            mobile: 'hidden',
            cell: (r) => <Cell state={chatCell(r, now)} label="Chat" />,
          },
        ]}
        // ONE button, never four: the next unmet step in the chain. You cannot
        // generate a report from figures that have not arrived, and you cannot
        // send one that does not exist, so the steps are strictly ordered and
        // only ever one of them is available.
        rowActions={(r) => {
          const action = boardAction(r, reportingDate);
          if (!action) return null;
          if (action.kind === 'share') {
            // The outlet has a saved rule: one button, and the confirm states the
            // rule. Without one, ask who (the same people for both sheets).
            if (action.rule) {
              return (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busyId === r.dealerId}
                  onClick={() => setPending({ row: r, action })}
                >
                  {action.label}
                </Button>
              );
            }
            return (
              <ShareMenu
                label={action.label}
                size="sm"
                variant="secondary"
                align="end"
                loading={busyId === r.dealerId}
                onPick={(a) => setPending({ row: r, action, audience: a })}
              />
            );
          }
          if (action.kind === 'blocked') {
            // Not a Send: the report is not fit to go. The reason is the button's
            // tooltip and the Report cell's hint; the click opens the report.
            return (
              <Button
                size="sm"
                variant="secondary"
                title={action.reason}
                onClick={() => perform(r, action)}
              >
                {action.label}
              </Button>
            );
          }
          return (
            <Button
              size="sm"
              variant="secondary"
              loading={busyId === r.dealerId}
              onClick={() => perform(r, action)}
            >
              {action.label}
            </Button>
          );
        }}
      />

      {kavachLastEvaluatedAt ? (
        <p className="px-3 pb-3 pt-2 text-xs text-text-subtle md:px-0 md:pb-0">
          Kavach statuses last scored{' '}
          {new Date(kavachLastEvaluatedAt).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          })}
          .
        </p>
      ) : null}

      <ConfirmDialog
        open={!!pending}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && perform(pending.row, pending.action, pending.audience)}
        loading={busyId === pending?.row.dealerId}
        title={pending?.action?.label ?? 'Send'}
        description={
          pending?.action?.kind === 'share' ? (
            <>
              <p className={pending.audience ? 'mb-3' : undefined}>{pending.action.confirm}</p>
              {pending.audience ? <ShareAudienceNote audience={pending.audience} /> : null}
              {/* No saved rule, so Manager / Both gives that person BOTH sheets.
                  Said here because nothing else on this confirm mentions that
                  there are two, or that one carries the verdict. */}
              {sheetsNote ? (
                <p className="mt-3 rounded-md border border-warning/40 bg-warning-soft/40 p-2 text-text">
                  {sheetsNote}
                </p>
              ) : null}
            </>
          ) : undefined
        }
        confirmLabel={pending?.action?.label}
      />
    </>
  );
}
