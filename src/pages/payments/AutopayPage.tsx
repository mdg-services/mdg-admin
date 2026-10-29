import { useQueryClient } from '@tanstack/react-query';
import { Repeat, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  DataList,
  EmptyState,
  FilterBar,
  Label,
  RefreshTool,
  Select,
} from '@/components/ui';
import { autopayRoot, useAutopayList } from '@/hooks/api/useAutopay';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { AUTOPAY_STATE_INTENT, AUTOPAY_STATE_LABEL } from '@/lib/autopay';
import {
  AUTOPAY_LIST_FILTER_LABEL,
  AUTOPAY_LIST_STATES,
  autopayRowFacts,
  autopayRowHref,
  autopayStateCounts,
  filterAutopayRows,
  listStateFromParam,
} from '@/lib/billingRelease2';
import { istTodayYmd } from '@/lib/format';
import { AUTOPAY_ENDED_BY_LABELS, dealerCodeLabel } from '@dk/shared';
import type { AdminAutopayListRow } from '@dk/shared';

/** A desktop cell with nothing to say. The phone card prints nothing instead. */
const NONE = <span className="text-text-subtle">{'—'}</span>;

/**
 * Every outlet's autopay on one page (`GET /admin/autopay`): which outlets have it on,
 * which are waiting for the owner to approve (and since when, and until when the
 * link works), which have a debit failing, which owners asked for their first month
 * back and still need a call, and which ended and how. The rows come in the SERVER's
 * order (failing, then a call to make, then approvals waiting) and are never re-sorted
 * here, so the list and the server cannot disagree about who comes first.
 *
 * A table on a desktop, a stack of cards on a phone (`DataList` draws both from the
 * one set of columns). The phone card has no column headers, so each of its dates
 * says what it is in its own words ("Next debit 28 Nov") and an empty one prints
 * nothing; the desktop cells stay short under their headers. A row opens the outlet's Info tab, where its Autopay panel
 * has the buttons. The state filter lives in the address (`?state=`), so Back and a
 * shared link land on the same view.
 */
export function AutopayPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const state = listStateFromParam(search.get('state'));
  const q = useAutopayList();
  const today = istTodayYmd();

  // The phone card (below md) labels its dates in the text itself; the table has headers.
  const isMd = useMediaQuery('(min-width: 768px)');
  const all = React.useMemo(() => q.data ?? [], [q.data]);
  const counts = React.useMemo(() => autopayStateCounts(all), [all]);
  const rows = React.useMemo(() => filterAutopayRows(all, state), [all, state]);
  // No list at all, as opposed to an empty one: "no autopays" under a failed request would be wrong.
  const failed = q.isError && !q.data;

  function setState(next: string) {
    setSearch(
      (cur) => {
        const out = new URLSearchParams(cur);
        if (next) out.set('state', next);
        else out.delete('state');
        return out;
      },
      { replace: true },
    );
  }

  return (
    <div>
      <PageHeader
        title="Autopay"
        subtitle="Every outlet's autopay: what is on, what waits for the owner, and what ended."
        tools={
          <RefreshTool
            label="Refresh the autopay list"
            loading={q.isRefetching}
            onRefresh={() => void qc.invalidateQueries({ queryKey: autopayRoot })}
          />
        }
      />

      {failed ? (
        <div className="mb-3">
          <Callout intent="warning" onRetry={() => void q.refetch()}>
            The autopay list could not be loaded.
            {q.error instanceof Error && q.error.message ? ` ${q.error.message}` : ''}
          </Callout>
        </div>
      ) : null}

      <FilterBar columnsAtMd={3} activeCount={state ? 1 : 0} onClear={() => setState('')}>
        <div>
          <Label htmlFor="autopay-state">State</Label>
          <Select id="autopay-state" value={state ?? ''} onChange={(e) => setState(e.target.value)}>
            <option value="">{`Every state (${all.length})`}</option>
            {AUTOPAY_LIST_STATES.map((s) => (
              <option key={s} value={s}>
                {`${AUTOPAY_LIST_FILTER_LABEL[s]} (${counts[s]})`}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <Card className="mt-3 md:mt-4">
        <CardContent padding="none">
          <DataList<AdminAutopayListRow>
            rows={rows}
            rowKey={(r) => r.dealerId}
            loading={q.isPending}
            cardVariant="rows"
            onRowClick={(r) => navigate(autopayRowHref(r.dealerId))}
            rowTone={(r) => (r.state === 'off' ? 'muted' : 'default')}
            empty={
              failed ? (
                <EmptyState
                  icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
                  title="Could not load the autopay list"
                  description="This does not mean there is none. Check the connection and try again."
                  cta={
                    <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
                      Try again
                    </Button>
                  }
                />
              ) : state ? (
                <EmptyState
                  icon={<Repeat width={24} height={24} strokeWidth={1.75} />}
                  title="No outlets in this state"
                  description="Try another state, or show every state."
                  cta={
                    <Button size="sm" variant="secondary" onClick={() => setState('')}>
                      Show every state
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Repeat width={24} height={24} strokeWidth={1.75} />}
                  title="No autopay yet"
                  description="An outlet appears here once autopay is set up for it, or once it is billed each month."
                />
              )
            }
            // Eight columns want room; below this the table scrolls inside its own box.
            minWidth="62rem"
            columns={[
              {
                id: 'outlet',
                header: 'Outlet',
                mobile: 'primary',
                width: '6rem',
                cell: (r) => (
                  <span className="font-mono text-sm font-semibold text-text">
                    {dealerCodeLabel(r.dealerCode)}
                  </span>
                ),
              },
              {
                id: 'state',
                header: 'State',
                mobile: 'primaryRight',
                width: '11rem',
                cell: (r) => (
                  <Badge intent={AUTOPAY_STATE_INTENT[r.state]}>
                    {AUTOPAY_STATE_LABEL[r.state]}
                  </Badge>
                ),
              },
              {
                id: 'amount',
                header: 'Amount',
                mobile: 'secondary',
                width: '12rem',
                cell: (r) => autopayRowFacts(r, today).amount ?? (isMd ? NONE : null),
              },
              {
                id: 'next',
                header: 'Next debit',
                mobile: 'secondary',
                width: '7rem',
                cell: (r) => {
                  const f = autopayRowFacts(r, today);
                  return isMd ? (f.nextDebit ?? NONE) : f.phone.nextDebit;
                },
              },
              {
                id: 'paid',
                header: 'Paid till',
                mobile: 'secondary',
                width: '7rem',
                cell: (r) => {
                  const f = autopayRowFacts(r, today);
                  return isMd ? (f.paidTill ?? NONE) : f.phone.paidTill;
                },
              },
              {
                id: 'waiting',
                header: 'Waiting since / runs out',
                mobile: 'meta',
                cell: (r) => {
                  const f = autopayRowFacts(r, today);
                  return isMd ? (f.waiting ?? NONE) : f.phone.waiting;
                },
              },
              {
                id: 'refund',
                header: 'Refund asked',
                mobile: 'meta',
                width: '8rem',
                cell: (r) => {
                  const f = autopayRowFacts(r, today);
                  const text = isMd ? f.refundAsked : f.phone.refundAsked;
                  return text ? <Badge intent="warning">{text}</Badge> : isMd ? NONE : null;
                },
              },
              {
                id: 'ended',
                header: 'Ended',
                mobile: 'meta',
                cell: (r) => {
                  const day = autopayRowFacts(r, today).endedDay;
                  if (!day) return isMd ? NONE : null;
                  const how = r.endedBy ? AUTOPAY_ENDED_BY_LABELS[r.endedBy] : 'Ended';
                  return (
                    <span className="text-sm text-text-muted">
                      {how}, {day}
                    </span>
                  );
                },
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
