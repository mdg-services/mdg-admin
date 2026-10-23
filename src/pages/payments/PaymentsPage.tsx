import { useQueryClient } from '@tanstack/react-query';
import { IndianRupee, Plus, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

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
  Input,
  Label,
  Pagination,
  RefreshTool,
  Select,
} from '@/components/ui';
import { PaymentDrawer } from '@/features/payments/PaymentDrawer';
import { RequestPaymentDialog } from '@/features/payments/RequestPaymentDialog';
import { useDealersQuery } from '@/hooks/api/useDealers';
import { paymentsRoot, usePaymentsConfigQuery, usePaymentsQuery } from '@/hooks/api/usePayments';
import { ApiError } from '@/lib/api';
import { formatYmd } from '@/lib/format';
import { istStamp } from '@/lib/intake';
import {
  PAYMENT_PURPOSE_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  compareDealerCodes,
  dealerCodeLabel,
  formatPaise,
} from '@dk/shared';
import type { AdminPayment, PaymentStatus } from '@dk/shared';

import { hasOpenProblem, idFromParam, pageFromParam, statusFromParam, statusTone } from './format';

/** Rows per page. The server's own limit is 100; a phone does not want that many. */
const PAGE_SIZE = 25;

/** How long the search box waits after the last key before it asks the server. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Every payment raised for an outlet, what has been paid, and what is owed —
 * the admin's half of ADR 0022.
 *
 * Raising a payment here sends the outlet a Razorpay link by SMS (and email).
 * The payment then settles by itself — the server hears from Razorpay — and this
 * page only shows where it has got to. Everything an admin can do to ONE payment
 * (copy its link, send the SMS again, look it up at Razorpay, cancel it, refund
 * it) is in the drawer that opens from a row, so the list stays a list.
 *
 * Everything the page is looking at lives in the URL — `?status=`, `?dealer=`,
 * `?q=`, `?page=` and `?payment=` — so Back and a shared link land on the same
 * view, and the activity log and the `payment_problem` alert can open a payment
 * directly (`/payments?payment=<id>`).
 *
 * The totals are over everything the filters match, not just the page on
 * screen: they come from the server with the page, and a number summed from
 * 25 rows of 300 would be a figure nobody could rely on.
 */
export function PaymentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const status = statusFromParam(search.get('status'));
  const dealerId = idFromParam(search.get('dealer')) ?? undefined;
  const urlQ = search.get('q') ?? '';
  const page = pageFromParam(search.get('page'));
  const openId = idFromParam(search.get('payment'));
  const [requesting, setRequesting] = React.useState(false);

  /**
   * Merge-patch the query string, replacing rather than pushing: a filter tweak
   * must not become a Back step. Written as a functional update so two controls
   * changing in the same tick cannot drop each other's change.
   */
  const patchParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearch],
  );

  // The search box holds what is typed; the URL holds what was asked for. They
  // are kept here, in the page, and not inside the filter's own controls: on a
  // phone those sit in a sheet that unmounts when it closes, and a pending
  // search typed in there would be lost with it.
  const [typed, setTyped] = React.useState(urlQ);
  const asked = React.useRef(urlQ);
  React.useEffect(() => {
    // The URL moved without us (Back, a link, Clear): follow it.
    if (urlQ !== asked.current) {
      asked.current = urlQ;
      setTyped(urlQ);
    }
  }, [urlQ]);
  React.useEffect(() => {
    const next = typed.trim();
    if (next === asked.current.trim()) return;
    const timer = window.setTimeout(() => {
      asked.current = next;
      patchParams({ q: next || null, page: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [typed, patchParams]);

  const configQ = usePaymentsConfigQuery();
  const config = configQ.data;
  // Without Razorpay keys every payment route but the config answers 503, so
  // the list is not even asked for. A config that could not be read does not
  // count as "off": the list's own answer says so below.
  const keysMissing = config?.configured === false;
  const q = usePaymentsQuery(
    {
      status,
      dealerId,
      q: urlQ.trim() || undefined,
      page,
      limit: PAGE_SIZE,
    },
    !keysMissing,
  );
  const dealersQ = useDealersQuery({ pageSize: 200 });
  const dealers = React.useMemo(
    () =>
      (dealersQ.data?.items ?? [])
        .filter((d) => !d.archivedAt)
        .slice()
        .sort((a, b) => compareDealerCodes(a.code, b.code)),
    [dealersQ.data],
  );

  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totals = q.data?.totals;
  // No list at all, as opposed to an empty one. "No payments yet" under a
  // failed request is the one thing this page cannot say wrongly.
  const failed = q.isError && !q.data;
  const activeFilters = (status ? 1 : 0) + (dealerId ? 1 : 0) + (urlQ.trim() ? 1 : 0);
  // The Request button is dead without keys, and the banner above says why.
  const switchedOff =
    keysMissing || (q.error instanceof ApiError && q.error.code === 'PAYMENTS_NOT_CONFIGURED');

  function clearFilters() {
    asked.current = '';
    setTyped('');
    patchParams({ status: null, dealer: null, q: null, page: null });
  }

  function refreshAll() {
    void qc.invalidateQueries({ queryKey: paymentsRoot });
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="What outlets owe MDG and what they have paid, through Razorpay."
        actions={
          <Button
            leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
            disabled={switchedOff}
            onClick={() => setRequesting(true)}
          >
            Request a payment
          </Button>
        }
        tools={
          <RefreshTool
            label="Refresh the payments"
            loading={q.isRefetching || configQ.isRefetching}
            onRefresh={refreshAll}
          />
        }
      />

      <div className="mb-3 grid gap-2 empty:hidden">
        {switchedOff ? (
          <Callout intent="warning">
            Payments are switched off: the Razorpay keys are not set on the server.
          </Callout>
        ) : config?.configured ? (
          <>
            {config.mode ? (
              <div>
                <Badge intent={config.mode === 'live' ? 'success' : 'warning'}>
                  {config.mode === 'live' ? 'Live — real money' : 'Test mode — no real money'}
                </Badge>
              </div>
            ) : null}
            {!config.webhookConfigured ? (
              <Callout intent="warning">
                The webhook secret is not set, so Razorpay cannot report a payment the moment it is
                made. The server looks payments up on a timer; Check with Razorpay on a payment
                looks it up now.
              </Callout>
            ) : null}
          </>
        ) : configQ.isError ? (
          <Callout intent="warning" onRetry={() => void configQ.refetch()}>
            Could not check whether payments are switched on.
          </Callout>
        ) : null}
      </div>

      {switchedOff ? null : (
        <>
          {totals && total > 0 ? (
            <Card className="mb-3">
              <CardContent>
                <dl className="grid gap-2 md:grid-cols-3 md:gap-4">
                  <Total label="Due" paise={totals.duePaise} />
                  <Total label="Paid" paise={totals.paidPaise} />
                  <Total label="Refunded" paise={totals.refundedPaise} />
                </dl>
                <p className="mt-2 text-xs text-text-subtle">
                  {total === 1
                    ? 'The one payment these filters match.'
                    : `Across all ${total.toLocaleString('en-IN')} payments these filters match, not only this page.`}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <FilterBar columnsAtMd={3} activeCount={activeFilters} onClear={clearFilters}>
            <div>
              <Label htmlFor="pay-status">Status</Label>
              <Select
                id="pay-status"
                value={status ?? ''}
                onChange={(e) => patchParams({ status: e.target.value || null, page: null })}
              >
                <option value="">Any status</option>
                {PAYMENT_STATUSES.map((s: PaymentStatus) => (
                  <option key={s} value={s}>
                    {PAYMENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="pay-outlet">Outlet</Label>
              <Select
                id="pay-outlet"
                value={dealerId ?? ''}
                onChange={(e) => patchParams({ dealer: e.target.value || null, page: null })}
              >
                <option value="">Every outlet</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {dealerCodeLabel(d.code)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="pay-search">Search</Label>
              <Input
                id="pay-search"
                type="search"
                inputMode="search"
                autoComplete="off"
                autoCapitalize="none"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Receipt, title or Razorpay id"
              />
            </div>
          </FilterBar>

          <Card className="mt-3 md:mt-4">
            <CardContent padding="none">
              <DataList<AdminPayment>
                rows={items}
                rowKey={(p) => p.id}
                loading={q.isPending}
                cardVariant="rows"
                onRowClick={(p) => patchParams({ payment: p.id })}
                rowTone={(p) => (p.status === 'cancelled' ? 'muted' : 'default')}
                empty={
                  failed ? (
                    <EmptyState
                      icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
                      title="Could not load the payments"
                      description="This does not mean there are none. Check the connection and try again."
                      cta={
                        <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
                          Try again
                        </Button>
                      }
                    />
                  ) : activeFilters > 0 ? (
                    <EmptyState
                      icon={<IndianRupee width={24} height={24} strokeWidth={1.75} />}
                      title="No payments match"
                      description="Try a different status or outlet, or clear the filters."
                      cta={
                        <Button size="sm" variant="secondary" onClick={clearFilters}>
                          Clear the filters
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={<IndianRupee width={24} height={24} strokeWidth={1.75} />}
                      title="No payments yet"
                      description="Raise a payment for an outlet and it appears here, with its link to pay."
                      cta={
                        switchedOff ? undefined : (
                          <Button size="sm" onClick={() => setRequesting(true)}>
                            Request a payment
                          </Button>
                        )
                      }
                    />
                  )
                }
                // Five columns, not seven: the amount and the status are the two
                // things the eye goes to, and the two dates ride together. Below the
                // width this needs, it scrolls inside its own box.
                minWidth="46rem"
                columns={[
                  {
                    id: 'payment',
                    header: 'Payment',
                    mobile: 'primary',
                    cell: (p) => (
                      <div className="min-w-0 [overflow-wrap:anywhere]">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <span className="font-semibold tabular-nums text-text">{p.number}</span>
                          {hasOpenProblem(p) ? (
                            <Badge intent="danger">
                              <TriangleAlert
                                width={12}
                                height={12}
                                strokeWidth={1.75}
                                aria-hidden
                                className="mr-1 shrink-0"
                              />
                              Needs a look
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-sm text-text">{p.title}</p>
                        <p className="mt-0.5 text-xs text-text-subtle">
                          {PAYMENT_PURPOSE_LABELS[p.purpose]}
                          {p.dueDate ? ` · due ${formatYmd(p.dueDate)}` : ''}
                        </p>
                      </div>
                    ),
                  },
                  {
                    id: 'outlet',
                    header: 'Outlet',
                    mobile: 'secondary',
                    width: '5.5rem',
                    cell: (p) => (
                      <span className="font-mono text-sm text-text">
                        {dealerCodeLabel(p.dealerCode)}
                      </span>
                    ),
                  },
                  {
                    id: 'amount',
                    header: 'Amount',
                    mobile: 'primaryRight',
                    numeric: true,
                    width: '8rem',
                    cell: (p) => (
                      <span className="font-medium text-text">{formatPaise(p.amountPaise)}</span>
                    ),
                  },
                  {
                    id: 'status',
                    header: 'Status',
                    mobile: 'secondary',
                    width: '9rem',
                    cell: (p) => (
                      <Badge intent={statusTone(p.status)}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                    ),
                  },
                  {
                    id: 'when',
                    header: 'Raised / paid',
                    mobile: 'meta',
                    width: '11rem',
                    cell: (p) => (
                      <span className="flex flex-col gap-0.5 text-xs text-text-muted md:text-sm">
                        <span>
                          <span className="text-text-subtle">Raised </span>
                          {istStamp(p.createdAt) || '—'}
                        </span>
                        {p.paidAt ? (
                          <span>
                            <span className="text-text-subtle">Paid </span>
                            {istStamp(p.paidAt)}
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                ]}
              />
              {total > PAGE_SIZE ? (
                <div className="border-t border-border">
                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    onPageChange={(n) => patchParams({ page: n === 1 ? null : String(n) })}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      <RequestPaymentDialog
        open={requesting}
        onClose={() => setRequesting(false)}
        defaultDealerId={dealerId}
        onOpenPayment={(id) => patchParams({ payment: id })}
      />
      <PaymentDrawer id={openId} onClose={() => patchParams({ payment: null })} />
    </div>
  );
}

/** One of the three money figures, label left and amount right on a phone, stacked on a desktop. */
function Total({ label, paise }: { label: string; paise: number }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 md:block">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-text md:mt-1 md:text-2xl">
        {formatPaise(paise)}
      </dd>
    </div>
  );
}
