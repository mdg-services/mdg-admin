import { Building2 } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
import type { DealerDayRow } from '@dk/shared';

import {
  boardAction,
  chatCell,
  dsrCell,
  kavachCell,
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
      className="tap-target -m-1 inline-flex p-1"
      title={state.hint}
      aria-label={`${label}: ${state.label}`}
    >
      <Badge intent={state.intent}>{state.label}</Badge>
    </Link>
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
  const run = useOverviewActionMutation(selectedDate);
  const [pending, setPending] = React.useState<{ row: DealerDayRow; action: BoardAction } | null>(
    null,
  );
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const perform = React.useCallback(
    (row: DealerDayRow, action: BoardAction) => {
      if (!action) return;
      if (action.kind === 'type') {
        navigate(action.href);
        return;
      }
      setBusyId(row.dealerId);
      run.mutate(
        {
          path: action.path,
          body: action.kind === 'share' ? undefined : action.body,
        },
        {
          onSuccess: () =>
            toast.success(
              action.kind === 'share'
                ? `Sent to ${dealerCodeLabel(row.dealerCode)}.`
                : `Started for ${dealerCodeLabel(row.dealerCode)} — this takes a minute.`,
            ),
          onError: (e) => toast.error((e as Error).message || 'That did not go through.'),
          onSettled: () => {
            setBusyId(null);
            setPending(null);
          },
        },
      );
    },
    [navigate, run, toast],
  );

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
          {
            id: 'shift',
            header: 'Shift',
            mobile: 'kv',
            mobileLabel: 'Shift',
            cell: (r) => <Cell state={shiftCell(r, reportingDate)} label="Shift" />,
          },
          {
            id: 'dsr',
            header: 'Report',
            mobile: 'kv',
            mobileLabel: 'Report',
            cell: (r) => <Cell state={dsrCell(r)} label="Report" />,
          },
          {
            id: 'sent',
            header: 'Sent',
            mobile: 'kv',
            mobileLabel: 'Sent',
            cell: (r) => <Cell state={sentCell(r)} label="Sent" />,
          },
          {
            id: 'kavach',
            header: 'Kavach',
            mobile: 'kv',
            mobileLabel: 'Kavach',
            cell: (r) => <Cell state={kavachCell(r)} label="Kavach" />,
          },
          {
            id: 'chat',
            header: 'Chat',
            mobile: 'kv',
            mobileLabel: 'Chat',
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
          return (
            <Button
              size="sm"
              variant="secondary"
              loading={busyId === r.dealerId}
              onClick={() => {
                if (action.kind === 'share') setPending({ row: r, action });
                else perform(r, action);
              }}
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
        onConfirm={() => pending && perform(pending.row, pending.action)}
        loading={busyId === pending?.row.dealerId}
        title={pending?.action?.label ?? 'Send'}
        description={pending?.action?.kind === 'share' ? pending.action.confirm : undefined}
        confirmLabel={pending?.action?.label}
      />
    </>
  );
}
