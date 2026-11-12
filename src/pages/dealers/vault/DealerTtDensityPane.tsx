import { AlertCircle, DownloadCloud, Gauge, Plug, Truck } from 'lucide-react';
import * as React from 'react';

import { RunPlaceButton } from '@/components/RunPlaceButton';
import {
  Badge,
  Callout,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  HowThisWorks,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useDealerServicesQuery } from '@/hooks/api/useDealerServices';
import { useCollectTtDensity, useTtDensitySummary } from '@/hooks/api/useTtDensity';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { dealerCodeLabel, type TtInvoiceSummary, type BrowserPlace } from '@dk/shared';

import { DensityHero } from './ttDensity/DensityHero';
import { paneSubtitle } from './ttDensity/format';
import { InvoicePdfDrawer } from './ttDensity/InvoicePdfDrawer';
import { InvoiceTable } from './ttDensity/InvoiceTable';
import { useTtDensityRunWatcher } from './ttDensity/useTtDensityRunWatcher';
import type { DealerVaultPaneProps } from './types';

/**
 * A dealer's TT Density: the density every tanker was certified at, and the
 * invoice PDF behind each figure.
 *
 * Since 12 Nov 2026 the dealer is asked for nothing: each new tanker's density is
 * sent to their chat as a card the moment its invoice is read, and this pane is
 * where MDG sees what was read. There is no register calendar any more — the
 * daily photo of the dealer's register is no longer asked for or checked.
 *
 * The order on screen is the order of importance — the densities are the top of
 * the pane in the largest type the app has, and everything under them is
 * provenance: which invoice each figure came from, and the PDF behind it.
 *
 * THE READ-ONLY CALLOUT IS PERMANENT AND NOT DISMISSIBLE. The portal screen this
 * service reads also carries Vehicle Condition, Check Ack Status and Acknowledge
 * Receipt, and acknowledging a receipt is a legal act by the dealer. This service
 * never touches those three, and the guarantee has to be visible to the
 * operator, not only true in the collector. There is deliberately no Acknowledge
 * control anywhere in this pane in any state.
 */
export function DealerTtDensityPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();
  const summaryQ = useTtDensitySummary(dealer.id);
  const collect = useCollectTtDensity(dealer.id);

  // No URL params reach a per-dealer vault pane, so the open invoice is local.
  // The pane itself is already addressable as `?tab=data-vault&vault=tt-density`.
  const [openInvoice, setOpenInvoice] = React.useState<TtInvoiceSummary | null>(null);

  // "Fetch invoices now" answers 202 and then drives a browser for about a
  // minute. Without this the pane would only ever re-read the figures that were
  // already on screen at the moment of the click, and a run that FAILED — wrong
  // SDMS credentials, most often — would never be reported at all.
  const runWatch = useTtDensityRunWatcher(dealer.id);

  const servicesQ = useDealerServicesQuery(dealer.id);
  const attachedAt = servicesQ.data?.find((s) => s.serviceId === 'tt-density')?.createdAt;


  function runFetch(browserOn: BrowserPlace = 'server') {
    collect.mutate(browserOn === 'laptop' ? { browserOn } : undefined, {
      onSuccess: (res) => {
        runWatch.watch(res.runId);
        toast.success(
          'Fetch queued — the portal takes about a minute. This pane refreshes when it lands.',
        );
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Could not start the fetch'),
    });
  }

  const fetching = collect.isPending || runWatch.busy;

  const fetchButton = (
    <RunPlaceButton
      serviceId="tt-density"
      variant="secondary"
      size="sm"
      loading={fetching}
      leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
      onRun={runFetch}
      className="w-full sm:w-auto"
    >
      Fetch invoices now
    </RunPlaceButton>
  );

  const readOnlyNotice = (
    <Callout intent="info">
      We only read this page. Vehicle Condition, Check Ack Status and Acknowledge
      are never touched — acknowledging a receipt is the dealer&apos;s own legal
      act.
    </Callout>
  );

  if (summaryQ.isLoading) {
    return (
      <div className="grid gap-4">
        {readOnlyNotice}
        <DensityHero products={[]} loading />
        <Card>
          <CardContent className="grid gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (summaryQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load TT Density"
        description={
          summaryQ.error instanceof ApiError ? summaryQ.error.message : 'Please try again.'
        }
        cta={fetchButton}
      />
    );
  }

  const summary = summaryQ.data!;
  const failed = summary.lastOutcome === 'FAILED' || !!summary.lastFailure;
  const neverFetched = !summary.lastRunAt;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">TT Density</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            {paneSubtitle({
              invoiceCount: summary.invoiceCount,
              lastRunAt: summary.lastRunAt,
              failed,
              formatWhen: formatDateTime,
            })}
          </p>
        </div>
        {fetchButton}
      </div>

      {readOnlyNotice}

      {/* A failed refresh never blanks a good figure — the hero below renders
          the last known readings and this says the newest fetch did not land. */}
      {failed ? (
        <Card className="border-danger/40 bg-danger-soft/40">
          <CardContent className="flex items-start gap-3">
            <AlertCircle
              width={18}
              height={18}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-danger"
            />
            <div>
              <p className="text-sm font-semibold text-text">
                The latest fetch did not complete
              </p>
              <p className="text-sm text-text-muted">
                {summary.lastFailure?.reason ??
                  'The portal could not be read. Everything already captured is kept below.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <DensityHero products={summary.latest} />

      {summary.pdfFailedCount > 0 ? (
        <Callout intent="warning">
          {summary.pdfFailedCount === 1
            ? 'One invoice PDF was given up on after three attempts and needs an engineer.'
            : `${summary.pdfFailedCount} invoice PDFs were given up on after three attempts and need an engineer.`}
        </Callout>
      ) : null}

      {servicesQ.isSuccess && !attachedAt && neverFetched && summary.invoiceCount === 0 ? (
        /* The vault fails open when `GET /dealers/:id/services` errors, so this
           pane can be opened for a dealer that does not have the service. Left
           to the never-fetched state below, its Fetch button would post
           `/collect` and answer a red toast instead of naming the cause. */
        <Card>
          <CardContent>
            <EmptyState
              icon={<Plug width={28} height={28} strokeWidth={1.75} />}
              title={`TT Density is not attached to ${dealerCodeLabel(dealer.code)}`}
              description="Attach it from the Services tab and this pane fills in."
            />
          </CardContent>
        </Card>
      ) : neverFetched && summary.invoiceCount === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Gauge width={28} height={28} strokeWidth={1.75} />}
              title="No tanker invoices captured yet"
              description={`Once TT Density runs for ${dealerCodeLabel(dealer.code)}, the Density@15 for each product appears here, with the invoice PDF behind every figure.`}
              cta={fetchButton}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent padding="none" className="md:p-4">
            {/* `CardHeader action` rather than a second child in a
                `justify-between` row that cannot wrap: the count badge is
                `whitespace-nowrap` and does not shrink, so at 296px it squeezed
                the sentence beside it into six lines. */}
            <CardHeader
              align="center"
              padding="comfortable"
              action={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge intent="neutral" className="tabular-nums">
                    {summary.invoiceCount.toLocaleString('en-IN')}{' '}
                    {summary.invoiceCount === 1 ? 'invoice' : 'invoices'}
                  </Badge>
                  <HowThisWorks
                    surface="admin-dealer-vault-tt-density"
                    label="TT Density"
                    variant="icon"
                  />
                </span>
              }
            >
              <p className="text-base font-semibold text-text">Tanker invoices</p>
              {/* The summary carries a fixed-length recent list, not the whole
                  history, so this counts what is actually below it — the badge
                  beside it prints the true total and would make any wider
                  claim visibly false. */}
              <p className="text-sm text-text-muted">
                {summary.recent.length === 1
                  ? 'The last delivery.'
                  : `The last ${summary.recent.length} deliveries, newest first.`}
              </p>
            </CardHeader>

            {summary.recent.length === 0 ? (
              <EmptyState
                icon={<Truck width={28} height={28} strokeWidth={1.75} />}
                title="No tanker deliveries in this window"
                description={`The last fetch listed no invoices for ${dealerCodeLabel(dealer.code)}. A week without a tanker is an ordinary week.`}
              />
            ) : (
              <InvoiceTable invoices={summary.recent} onOpen={setOpenInvoice} />
            )}
          </CardContent>
        </Card>
      )}

      <InvoicePdfDrawer
        dealerId={dealer.id}
        invoice={openInvoice}
        onClose={() => setOpenInvoice(null)}
        onFetch={runFetch}
        fetching={fetching}
      />
    </div>
  );
}
